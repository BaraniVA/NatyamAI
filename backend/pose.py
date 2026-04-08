import asyncio
import math
import tempfile
from pathlib import Path
from typing import List, Optional
from urllib.request import urlretrieve

import cv2
import numpy as np
from mediapipe.tasks.python.core import base_options
from mediapipe.tasks.python.vision import pose_landmarker
from mediapipe.tasks.python.vision.core import image as mp_image
from mediapipe.tasks.python.vision.core import vision_task_running_mode as running_mode_lib

# Key landmark indices we care about for Bharatanatyam
JOINTS = {
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_ankle": 27,
    "right_ankle": 28,
}

# Joint angle triples: (A, vertex, B) — compute angle at vertex
ANGLE_TRIPLES = [
    ("left_shoulder",  "left_elbow",   "left_wrist",   "left_elbow_angle"),
    ("right_shoulder", "right_elbow",  "right_wrist",  "right_elbow_angle"),
    ("left_elbow",     "left_shoulder","left_hip",     "left_shoulder_angle"),
    ("right_elbow",    "right_shoulder","right_hip",   "right_shoulder_angle"),
    ("left_hip",       "left_knee",    "left_ankle",   "left_knee_angle"),
    ("right_hip",      "right_knee",   "right_ankle",  "right_knee_angle"),
    ("left_shoulder",  "left_hip",     "left_knee",    "left_hip_angle"),
    ("right_shoulder", "right_hip",    "right_knee",   "right_hip_angle"),
]

# Human readable names
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

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)
MODEL_DIR = Path(tempfile.gettempdir()) / "natyam_ai_models"
MODEL_PATH = MODEL_DIR / "pose_landmarker_lite.task"
VISIBILITY_THRESHOLD = 0.5


def _angle_between(a, b, c) -> float:
    """Compute angle at vertex b given points a, b, c as (x,y) tuples."""
    ba = (a[0] - b[0], a[1] - b[1])
    bc = (c[0] - b[0], c[1] - b[1])
    dot = ba[0]*bc[0] + ba[1]*bc[1]
    mag_ba = math.sqrt(ba[0]**2 + ba[1]**2)
    mag_bc = math.sqrt(bc[0]**2 + bc[1]**2)
    if mag_ba < 1e-6 or mag_bc < 1e-6:
        return 0.0
    cos_angle = max(-1.0, min(1.0, dot / (mag_ba * mag_bc)))
    return math.degrees(math.acos(cos_angle))


def _extract_angles(landmarks) -> dict:
    """Extract joint angles from a MediaPipe landmark list."""
    def _is_confident(idx: int) -> bool:
        lm_obj = landmarks[idx]
        visibility = getattr(lm_obj, "visibility", 1.0)
        presence = getattr(lm_obj, "presence", 1.0)
        return visibility >= VISIBILITY_THRESHOLD and presence >= VISIBILITY_THRESHOLD

    lm = {
        name: (landmarks[idx].x, landmarks[idx].y)
        for name, idx in JOINTS.items()
    }

    angles = {}
    for (a_name, v_name, b_name, angle_name) in ANGLE_TRIPLES:
        a_idx, v_idx, b_idx = JOINTS[a_name], JOINTS[v_name], JOINTS[b_name]
        if (
            a_name in lm
            and v_name in lm
            and b_name in lm
            and _is_confident(a_idx)
            and _is_confident(v_idx)
            and _is_confident(b_idx)
        ):
            angles[angle_name] = _angle_between(lm[a_name], lm[v_name], lm[b_name])
        else:
            angles[angle_name] = None

    # Also store raw wrist positions (normalized) for mudra spatial analysis
    angles["left_wrist_x"] = lm["left_wrist"][0]
    angles["left_wrist_y"] = lm["left_wrist"][1]
    angles["right_wrist_x"] = lm["right_wrist"][0]
    angles["right_wrist_y"] = lm["right_wrist"][1]

    return angles


def _ensure_model_file():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if not MODEL_PATH.exists():
        urlretrieve(MODEL_URL, MODEL_PATH)


def _create_landmarker():
    _ensure_model_file()

    options = pose_landmarker.PoseLandmarkerOptions(
        base_options=base_options.BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=running_mode_lib.VisionTaskRunningMode.VIDEO,
        num_poses=1,
    )
    return pose_landmarker.PoseLandmarker.create_from_options(options)


async def extract_pose_sequence(frames: list) -> list:
    """Run MediaPipe pose on a list of frames, return list of pose dicts."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _run_pose_sync, frames)
    return result


def _run_pose_sync(frames: list) -> list:
    pose_sequence = []

    # Create a fresh VIDEO-mode landmarker per sequence so timestamps can start at 0.
    landmarker = _create_landmarker()

    for i, frame in enumerate(frames):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = mp_image.Image(mp_image.ImageFormat.SRGB, rgb)
        results = landmarker.detect_for_video(image, i * 1000 // 15)

        if results.pose_landmarks:
            angles = _extract_angles(results.pose_landmarks[0])
            angles["detected"] = True
        else:
            angles = {k: None for k in [t[3] for t in ANGLE_TRIPLES]}
            angles["detected"] = False

        angles["frame_index"] = i
        angles["timestamp"] = None  # Will be filled in by caller if available
        pose_sequence.append(angles)

    return pose_sequence
