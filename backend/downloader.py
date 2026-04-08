import asyncio
import os
import cv2
import sys
import shutil
import subprocess
from pathlib import Path
import numpy as np


async def download_youtube_video(url: str, output_dir: str) -> str:
    """Download YouTube video using yt-dlp, max 1 minute, 480p."""
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "reference.mp4")

    # Remove old file if exists
    if os.path.exists(output_path):
        os.remove(output_path)

    has_ffmpeg = bool(shutil.which("ffmpeg") or shutil.which("ffmpeg.exe"))
    format_selector = (
        "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]"
        if has_ffmpeg
        else "best[ext=mp4]/best"
    )

    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--js-runtimes",
        r"node:C:\Program Files\nodejs\node.exe",
        "-f", format_selector,
        "--no-playlist",
        "-o", output_path,
        url,
    ]

    if has_ffmpeg:
        cmd.insert(5, "--download-sections")
        cmd.insert(6, "*0-60")
        cmd.insert(7, "--merge-output-format")
        cmd.insert(8, "mp4")

    # Some Windows event loops used by servers don't implement async subprocess.
    proc = await asyncio.to_thread(
        subprocess.run,
        cmd,
        capture_output=True,
        text=True,
        check=False,
    )

    if proc.returncode != 0:
        raise RuntimeError(f"yt-dlp failed: {proc.stderr}")

    if not os.path.exists(output_path):
        raise RuntimeError("Download completed but file not found")

    return output_path


async def extract_frames(video_path: str, fps: int = 15, max_seconds: int = 60) -> list:
    """Extract frames from video at specified FPS."""
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_interval = max(1, int(video_fps / fps))
    max_frames = max_seconds * fps

    frames = []
    frame_idx = 0

    while len(frames) < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_interval == 0:
            # Resize to 640x480 for consistent processing
            frame = cv2.resize(frame, (640, 480))
            frames.append(frame)
        frame_idx += 1

    cap.release()
    return frames
