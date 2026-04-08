import numpy as np
from typing import List, Dict, Optional

ANGLE_KEYS = [
    "left_elbow_angle",
    "right_elbow_angle",
    "left_shoulder_angle",
    "right_shoulder_angle",
    "left_knee_angle",
    "right_knee_angle",
    "left_hip_angle",
    "right_hip_angle",
]

JOINT_DISPLAY = {
    "left_elbow_angle":    "Left Elbow",
    "right_elbow_angle":   "Right Elbow",
    "left_shoulder_angle": "Left Shoulder",
    "right_shoulder_angle":"Right Shoulder",
    "left_knee_angle":     "Left Knee",
    "right_knee_angle":    "Right Knee",
    "left_hip_angle":      "Left Hip",
    "right_hip_angle":     "Right Hip",
}

# Threshold in degrees — beyond this = flagged issue
ANGLE_THRESHOLD = 25.0

# Minimum consecutive bad frames before flagging (avoid noise)
MIN_CONSECUTIVE = 3


def _pose_to_vector(pose: dict) -> Optional[np.ndarray]:
    """Convert pose dict to angle vector. Returns None if pose not detected."""
    if not pose.get("detected"):
        return None
    vals = []
    for k in ANGLE_KEYS:
        v = pose.get(k)
        vals.append(v if v is not None else np.nan)
    return np.array(vals, dtype=np.float32)


def _dtw_path(seq1: List[np.ndarray], seq2: List[np.ndarray]):
    """
    Simple DTW implementation.
    Returns alignment path: list of (i, j) pairs mapping seq2 → seq1.
    """
    n, m = len(seq1), len(seq2)
    INF = float("inf")
    dtw = np.full((n + 1, m + 1), INF)
    dtw[0][0] = 0.0

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            v1 = seq1[i - 1]
            v2 = seq2[j - 1]
            if v1 is None or v2 is None:
                cost = 50.0  # Penalty for undetected poses
            else:
                diffs = np.abs(v1 - v2)
                valid = np.isfinite(diffs)
                cost = float(np.mean(diffs[valid])) if np.any(valid) else 50.0
            dtw[i][j] = cost + min(dtw[i-1][j], dtw[i][j-1], dtw[i-1][j-1])

    # Traceback
    path = []
    i, j = n, m
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        neighbors = [(dtw[i-1][j], i-1, j), (dtw[i][j-1], i, j-1), (dtw[i-1][j-1], i-1, j-1)]
        _, i, j = min(neighbors)
    path.reverse()
    return path


def _format_timestamp(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 60}:{s % 60:02d}"


def _compute_joint_visibility(student_poses: List[dict]) -> Dict[str, float]:
    """
    For each joint angle key, compute the fraction of student frames where
    that joint was actually detected (i.e. has a finite, non-None value).
    Returns dict like {"left_elbow_angle": 0.85, "left_knee_angle": 0.02, ...}
    """
    if not student_poses:
        return {k: 0.0 for k in ANGLE_KEYS}

    total = len(student_poses)
    visible_counts = {k: 0 for k in ANGLE_KEYS}

    for pose in student_poses:
        if not pose.get("detected"):
            continue
        for key in ANGLE_KEYS:
            val = pose.get(key)
            if val is not None:
                visible_counts[key] += 1

    return {k: visible_counts[k] / total for k in ANGLE_KEYS}


# Minimum fraction of student frames a joint must be visible in
# to be considered "in frame" and eligible for feedback.
VISIBILITY_RATIO_THRESHOLD = 0.30


def compare_sequences(ref_poses: List[dict], student_poses: List[dict], ref_fps: int = 15) -> dict:
    """
    DTW-align reference and student pose sequences, detect joint angle issues.
    Only reports issues for joints that the student's camera actually captured.
    Returns dict with 'issues' list and 'joint_visibility' report.
    """
    # ── Step 0: Figure out which joints the student's camera actually shows ──
    joint_visibility = _compute_joint_visibility(student_poses)
    visible_joints = {
        key for key, ratio in joint_visibility.items()
        if ratio >= VISIBILITY_RATIO_THRESHOLD
    }

    # Build visibility report for frontend
    visibility_report = []
    print(f"[compare] Joint visibility in student video:")
    for key in ANGLE_KEYS:
        ratio = joint_visibility[key]
        in_frame = key in visible_joints
        status = "IN FRAME" if in_frame else "NOT IN FRAME"
        print(f"  {JOINT_DISPLAY.get(key, key):20s}: {ratio:.0%} visible → {'✓' if in_frame else '✗'} {status}")
        visibility_report.append({
            "joint": key,
            "joint_display": JOINT_DISPLAY.get(key, key),
            "visibility_pct": round(ratio * 100),
            "in_frame": in_frame,
        })

    if not visible_joints:
        print("[compare] WARNING: No joints visible in student video — cannot compare.")
        return {"issues": [], "joint_visibility": visibility_report}

    ref_vecs = [_pose_to_vector(p) for p in ref_poses]
    stu_vecs = [_pose_to_vector(p) for p in student_poses]

    # Clamp to 900 frames (60s @ 15fps) each
    ref_vecs = ref_vecs[:900]
    stu_vecs = stu_vecs[:900]

    try:
        path = _dtw_path(ref_vecs, stu_vecs)
    except Exception:
        # Fallback: simple frame-by-frame if DTW fails
        min_len = min(len(ref_vecs), len(stu_vecs))
        path = [(i, i) for i in range(min_len)]

    # Per-frame per-joint diffs along alignment path
    frame_issues = []  # {frame_idx, timestamp, joint, diff, ref_angle, student_angle}

    for ref_idx, stu_idx in path:
        rv = ref_vecs[ref_idx] if ref_idx < len(ref_vecs) else None
        sv = stu_vecs[stu_idx] if stu_idx < len(stu_vecs) else None

        # Get timestamp from student frame
        stu_pose = student_poses[stu_idx] if stu_idx < len(student_poses) else {}
        ts = stu_pose.get("timestamp")
        if ts is None:
            ts = stu_idx / ref_fps  # fallback: compute from frame index

        if rv is not None and sv is None:
            for j, key in enumerate(ANGLE_KEYS):
                # ── SKIP joints the student camera never shows ──
                if key not in visible_joints:
                    continue
                if np.isfinite(rv[j]):
                    frame_issues.append({
                        "frame_idx": stu_idx,
                        "ref_frame_idx": ref_idx,
                        "timestamp_s": float(ts) if isinstance(ts, (int, float)) else stu_idx / ref_fps,
                        "joint": key,
                        "diff": 180.0,
                        "ref_angle": float(rv[j]),
                        "student_angle": 0.0,
                        "missing": True
                    })
            continue

        if rv is None or sv is None:
            continue

        diffs = np.abs(rv - sv)
        for j, key in enumerate(ANGLE_KEYS):
            # ── SKIP joints the student camera never shows ──
            if key not in visible_joints:
                continue

            if not np.isfinite(sv[j]) and np.isfinite(rv[j]):
                frame_issues.append({
                    "frame_idx": stu_idx,
                    "ref_frame_idx": ref_idx,
                    "timestamp_s": float(ts) if isinstance(ts, (int, float)) else stu_idx / ref_fps,
                    "joint": key,
                    "diff": 180.0,
                    "ref_angle": float(rv[j]),
                    "student_angle": 0.0,
                    "missing": True
                })
                continue

            if not np.isfinite(diffs[j]) or not np.isfinite(rv[j]) or not np.isfinite(sv[j]):
                continue
            if diffs[j] > ANGLE_THRESHOLD:
                frame_issues.append({
                    "frame_idx": stu_idx,
                    "ref_frame_idx": ref_idx,
                    "timestamp_s": float(ts) if isinstance(ts, (int, float)) else stu_idx / ref_fps,
                    "joint": key,
                    "diff": float(diffs[j]),
                    "ref_angle": float(rv[j]),
                    "student_angle": float(sv[j]),
                    "missing": False
                })
    # Group consecutive frame issues → single issue event
    # Sort by timestamp
    frame_issues.sort(key=lambda x: x["timestamp_s"])

    # Group by joint, merge consecutive
    issues_by_joint: Dict[str, List] = {}
    for fi in frame_issues:
        j = fi["joint"]
        if j not in issues_by_joint:
            issues_by_joint[j] = []
        issues_by_joint[j].append(fi)

    merged_issues = []
    for joint, frames in issues_by_joint.items():
        if not frames:
            continue
        # Group into consecutive runs (gap < 2 seconds)
        runs = []
        current_run = [frames[0]]
        for f in frames[1:]:
            if f["timestamp_s"] - current_run[-1]["timestamp_s"] < 2.0:
                current_run.append(f)
            else:
                runs.append(current_run)
                current_run = [f]
        runs.append(current_run)

        for run in runs:
            if len(run) < MIN_CONSECUTIVE:
                continue
            
            is_missing = all(f.get("missing", False) for f in run)
            
            avg_ref = np.mean([f["ref_angle"] for f in run])
            start_ts = run[0]["timestamp_s"]
            end_ts = run[-1]["timestamp_s"]
            
            ts_label = _format_timestamp(start_ts)
            if end_ts - start_ts >= 1.0:
                ts_label += f" - {_format_timestamp(end_ts)}"
                
            mid_idx = len(run) // 2
            mid_stu_frame = run[mid_idx]["frame_idx"]
            mid_ref_frame = run[mid_idx]["ref_frame_idx"]
            
            if is_missing:
                merged_issues.append({
                    "joint": joint,
                    "joint_display": JOINT_DISPLAY.get(joint, joint),
                    "timestamp_start": start_ts,
                    "timestamp_end": end_ts,
                    "timestamp_label": ts_label,
                    "avg_diff_degrees": 0.0,
                    "ref_angle": round(avg_ref, 1),
                    "student_angle": 0.0,
                    "direction": "missing",
                    "severity": "high",
                    "stu_frame_idx": mid_stu_frame,
                    "ref_frame_idx": mid_ref_frame,
                    "missing": True
                })
            else:
                valid_run = [f for f in run if not f.get("missing", False)]
                if not valid_run: continue
                avg_diff = np.mean([f["diff"] for f in valid_run])
                avg_stu = np.mean([f["student_angle"] for f in valid_run])

                # Determine direction of error
                if avg_stu < avg_ref:
                    direction = "not bent enough" if avg_ref > 90 else "too low"
                else:
                    direction = "too wide" if avg_ref < 90 else "over-extended"

                merged_issues.append({
                    "joint": joint,
                    "joint_display": JOINT_DISPLAY.get(joint, joint),
                    "timestamp_start": start_ts,
                    "timestamp_end": end_ts,
                    "timestamp_label": ts_label,
                    "avg_diff_degrees": round(avg_diff, 1),
                    "ref_angle": round(avg_ref, 1),
                    "student_angle": round(avg_stu, 1),
                    "direction": direction,
                    "severity": "high" if avg_diff > 45 else "medium" if avg_diff > 30 else "low",
                    "stu_frame_idx": mid_stu_frame,
                    "ref_frame_idx": mid_ref_frame,
                    "missing": False
                })

    # Sort by timestamp
    merged_issues.sort(key=lambda x: x["timestamp_start"])

    print(f"[compare] Final issues: {len(merged_issues)} (filtered to visible joints only)")
    return {"issues": merged_issues, "joint_visibility": visibility_report}
