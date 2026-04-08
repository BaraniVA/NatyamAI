# 𑁍 Natyam AI — Bharatanatyam Practice Companion

AI-powered Bharatanatyam coach that compares your live performance against a YouTube reference video and gives **timestamped, joint-specific feedback**.

---

## How It Works

```
YouTube URL → yt-dlp download → MediaPipe pose extraction (reference)
                                          ↓
Webcam (60s max) → MediaPipe pose extraction (student)
                                          ↓
                              DTW alignment of both sequences
                                          ↓
                        Per-joint angle diff → issue detection
                                          ↓
                     Gemma2:2b (Ollama) → coaching feedback
                                          ↓
                    Timestamped feedback with timeline view
```

---

## Requirements

- Python 3.10+
- Node.js 18+
- Ollama installed and running (`ollama serve`)
- yt-dlp (`pip install yt-dlp`)
- Webcam

**Runs entirely locally — no cloud API needed.**

---

## Quick Start

```bash
# Clone / place this folder, then:
chmod +x setup.sh
./setup.sh

# Terminal 1 — Backend
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open **http://localhost:5173**

---

## Usage

1. **Paste a YouTube URL** of any Bharatanatyam performance (first 60s used)
2. Click **Load Reference Video** — backend downloads + extracts poses
3. Study the reference video that appears
4. Click **Start Practice** — your webcam opens
5. Dance for up to 60 seconds (auto-stops at 1 min)
6. Click **Stop & Analyze** anytime
7. View **timestamped feedback**:
   - Timeline bar shows where issues occurred (color = severity)
   - Each card shows timestamp + what joint + what's wrong
   - Tap a card for AI coaching advice

---

## What It Detects

| Joint | What's checked |
|---|---|
| Left / Right Elbow | Arm extension, mudra arm angles |
| Left / Right Shoulder | Shoulder line, arm lift angle |
| Left / Right Knee | Aramandi depth, knee bend |
| Left / Right Hip | Hip alignment, torso angle |

---

## Known Limitations

- Finger-level mudra analysis not included (needs separate hand model)
- Camera angle matters — try to match the reference video's angle
- Low-light conditions reduce MediaPipe accuracy
- yt-dlp may fail on some region-locked videos

---

## RAM Usage (i3-1215U, 8GB)

| Component | RAM |
|---|---|
| MediaPipe Pose | ~200MB |
| Gemma2:2b (Ollama) | ~1.8GB |
| FastAPI + Python | ~300MB |
| React + Chrome | ~400MB |
| **Total** | **~2.7GB** |

Well within your 7.7GB usable.

---

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: FastAPI
- **Pose**: MediaPipe Pose (CPU, model_complexity=1)
- **Alignment**: Custom DTW implementation
- **Feedback LLM**: Gemma2:2b via Ollama
- **Video**: yt-dlp
