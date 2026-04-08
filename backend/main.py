from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import asyncio
import base64
import json
import os
import tempfile
from pathlib import Path

try:
    from .downloader import download_youtube_video, extract_frames
    from .pose import extract_pose_sequence
    from .compare import compare_sequences
    from .feedback import generate_feedback
except ImportError:
    from downloader import download_youtube_video, extract_frames
    from pose import extract_pose_sequence
    from compare import compare_sequences
    from feedback import generate_feedback

app = FastAPI(title="Bharatanatyam AI Coach")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for reference pose sequence
reference_store = {}

UPLOAD_DIR = Path(tempfile.gettempdir()) / "bharata_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@app.post("/api/prepare-reference")
async def prepare_reference(payload: dict):
    """Download YouTube video and extract pose sequence."""
    youtube_url = payload.get("url")
    if not youtube_url:
        raise HTTPException(status_code=400, detail="YouTube URL required")

    try:
        print(f"prepare-reference start url={youtube_url}")
        video_path = await download_youtube_video(youtube_url, str(UPLOAD_DIR))
        print(f"prepare-reference downloaded video_path={video_path}")
        frames = await extract_frames(video_path, fps=15, max_seconds=60)
        print(f"prepare-reference extracted frames={len(frames)}")
        pose_seq = await extract_pose_sequence(frames)
        print(f"prepare-reference extracted poses={len(pose_seq)}")

        session_id = "default"
        reference_store[session_id] = {
            "poses": pose_seq,
            "fps": 15,
            "video_path": video_path,
        }

        return {
            "status": "ok",
            "session_id": session_id,
            "frame_count": len(pose_seq),
            "duration_seconds": len(pose_seq) / 15,
        }
    except Exception as e:
        import traceback

        tb = traceback.format_exc()
        print(f"prepare-reference error type={type(e).__name__} repr={e!r}")
        print(tb)
        detail = str(e) or f"{type(e).__name__}: {e!r}"
        if detail and detail != str(e):
            detail = detail
        else:
            detail = f"{detail}\n{tb}"
        raise HTTPException(status_code=500, detail=detail)


@app.post("/api/analyze")
async def analyze(payload: dict):
    """
    Receives student frames (base64) + timestamps, compares against reference.
    Returns timestamped feedback.
    """
    session_id = payload.get("session_id", "default")
    student_frames_b64 = payload.get("frames", [])  # list of {timestamp, data}

    if session_id not in reference_store:
        raise HTTPException(status_code=400, detail="Reference not prepared. Call /api/prepare-reference first.")

    if not student_frames_b64:
        raise HTTPException(status_code=400, detail="No frames received")

    try:
        # Decode base64 frames to numpy arrays
        import cv2
        import numpy as np

        student_frames = []
        for item in student_frames_b64:
            ts = item["timestamp"]
            img_data = base64.b64decode(item["data"].split(",")[-1])
            nparr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is not None:
                student_frames.append({"timestamp": ts, "frame": frame})

        if not student_frames:
            raise HTTPException(status_code=400, detail="Could not decode any frames")

        # Extract pose from student frames
        raw_frames = [f["frame"] for f in student_frames]
        timestamps = [f["timestamp"] for f in student_frames]
        student_poses = await extract_pose_sequence(raw_frames)

        # Attach timestamps
        for i, pose in enumerate(student_poses):
            if i < len(timestamps):
                pose["timestamp"] = timestamps[i]

        # Compare against reference
        ref_data = reference_store[session_id]
        compare_result = compare_sequences(ref_data["poses"], student_poses, ref_fps=ref_data["fps"])
        issues = compare_result["issues"]
        joint_visibility = compare_result["joint_visibility"]

        cap = cv2.VideoCapture(ref_data["video_path"])
        for issue in issues:
            stu_idx = issue.get("stu_frame_idx", 0)
            ref_idx = issue.get("ref_frame_idx", 0)
            
            if stu_idx < len(student_frames_b64):
                issue["student_frame"] = student_frames_b64[stu_idx]["data"]
                
            cap.set(cv2.CAP_PROP_POS_FRAMES, ref_idx)
            ret, frame = cap.read()
            if ret:
                _, buffer = cv2.imencode('.jpg', frame)
                ref_b64 = base64.b64encode(buffer).decode('utf-8')
                issue["reference_frame"] = f"data:image/jpeg;base64,{ref_b64}"

        cap.release()

        # Generate natural language feedback via Ollama
        feedback_payload = await generate_feedback(issues)
        feedback_items = feedback_payload.get("items", [])

        return {
            "status": "ok",
            "issues": issues,
            "feedback": feedback_items,
            "feedback_model": feedback_payload.get("model_used"),
            "feedback_source": feedback_payload.get("source"),
            "joint_visibility": joint_visibility,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
