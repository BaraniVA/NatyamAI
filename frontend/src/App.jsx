import React, { useState, useRef, useEffect, useCallback } from "react";

const API = "http://localhost:8000";
const MAX_RECORD_SECONDS = 60;
const CAPTURE_FPS = 10; // frames per second captured from webcam

// ── Utility ──────────────────────────────────────────────────────────────────

function formatTime(s) {
  const sec = Math.floor(s);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function extractYouTubeId(url) {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^&?\/\s]{11})/);
  return match ? match[1] : null;
}

// ── Severity badge ────────────────────────────────────────────────────────────

function SeverityDot({ severity }) {
  const colors = {
    high: "#ff4444",
    medium: "#ffaa00",
    low: "#44aaff",
  };
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: colors[severity] || "#888",
        marginRight: 6,
        flexShrink: 0,
        marginTop: 6,
      }}
    />
  );
}

// ── Feedback Card ─────────────────────────────────────────────────────────────

function FeedbackCard({ item, index }) {
  const [expanded, setExpanded] = useState(false);
  const severityColor = {
    high: "rgba(255,68,68,0.12)",
    medium: "rgba(255,170,0,0.12)",
    low: "rgba(68,170,255,0.12)",
  };
  const severityBorder = {
    high: "rgba(255,68,68,0.35)",
    medium: "rgba(255,170,0,0.35)",
    low: "rgba(68,170,255,0.35)",
  };

  return (
    <div
      style={{
        background: severityColor[item.severity] || "rgba(255,255,255,0.04)",
        border: `1px solid ${severityBorder[item.severity] || "rgba(255,255,255,0.1)"}`,
        borderRadius: 10,
        padding: "12px 16px",
        transition: "all 0.2s",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <SeverityDot severity={item.severity} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 13, color: "#c9a96e", fontWeight: 700 }}>
              {item.timestamp_label || item.timestamp}
            </span>
            <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>
              {item.joint_display || item.joint}
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#ddd", lineHeight: 1.5 }}>
            {item.issue}
          </div>

          {/* Side-by-side frames — ALWAYS visible */}
          {(item.student_frame || item.reference_frame) && (
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4, textTransform: "uppercase" }}>Your Pose</div>
                {item.student_frame ? (
                  <img src={item.student_frame} alt="Student Pose" style={{ width: "100%", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)" }} />
                ) : (
                  <div style={{ width: "100%", height: 120, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#666" }}>No Frame</div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4, textTransform: "uppercase" }}>Reference Pose</div>
                {item.reference_frame ? (
                  <img src={item.reference_frame} alt="Reference Pose" style={{ width: "100%", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)" }} />
                ) : (
                  <div style={{ width: "100%", height: 120, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#666" }}>No Frame</div>
                )}
              </div>
            </div>
          )}

          {/* Coaching advice — expandable on click */}
          {item.advice && (
            <div
              onClick={() => setExpanded((e) => !e)}
              style={{
                marginTop: 10,
                cursor: "pointer",
              }}
            >
              {expanded ? (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#b8c8e0",
                    lineHeight: 1.6,
                    borderLeft: "3px solid #c9a96e",
                  }}
                >
                  💡 {item.advice}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "#c9a96e", opacity: 0.7 }}>
                  💡 tap for coaching advice ↓
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Timeline Bar ──────────────────────────────────────────────────────────────

function TimelineBar({ issues, duration, onSeek }) {
  const total = duration || MAX_RECORD_SECONDS;
  return (
    <div style={{ position: "relative", height: 32, marginBottom: 16 }}>
      {/* Track */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 4,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 2,
          transform: "translateY(-50%)",
        }}
      />
      {/* Issue markers */}
      {issues.map((iss, i) => {
        const left = `${(iss.timestamp_start / total) * 100}%`;
        const color =
          iss.severity === "high"
            ? "#ff4444"
            : iss.severity === "medium"
            ? "#ffaa00"
            : "#44aaff";
        return (
          <div
            key={i}
            onClick={() => onSeek && onSeek(iss.timestamp_start)}
            title={`${iss.timestamp_label} — ${iss.joint_display}`}
            style={{
              position: "absolute",
              left,
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: color,
              border: "2px solid rgba(0,0,0,0.5)",
              cursor: "pointer",
              zIndex: 2,
              transition: "transform 0.15s",
            }}
          />
        );
      })}
      {/* Time labels */}
      <div style={{ position: "absolute", bottom: -16, left: 0, fontSize: 10, color: "#555" }}>0:00</div>
      <div style={{ position: "absolute", bottom: -16, right: 0, fontSize: 10, color: "#555" }}>
        {formatTime(total)}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState("home"); // home | loading-ref | ready | practice | analyzing | results
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeId, setYoutubeId] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");

  // Recording state
  const [elapsed, setElapsed] = useState(0);
  const [frames, setFrames] = useState([]); // {timestamp, data}
  const [stream, setStream] = useState(null);
  const [capturedCount, setCapturedCount] = useState(0);

  // Results
  const [issues, setIssues] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [recordDuration, setRecordDuration] = useState(60);
  const [feedbackModel, setFeedbackModel] = useState("");
  const [jointVisibility, setJointVisibility] = useState([]);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const captureRef = useRef(null);
  const framesRef = useRef([]);
  const elapsedRef = useRef(0);
  const streamRef = useRef(null);

  // ── Step 1: Load reference ────────────────────────────────────────────────

  async function handleLoadReference() {
    const vid = extractYouTubeId(youtubeUrl);
    if (!vid) {
      setError("Please enter a valid YouTube URL.");
      return;
    }
    setError("");
    setYoutubeId(vid);
    setPhase("loading-ref");
    setStatusMsg("Downloading reference video and extracting poses...");

    try {
      const res = await fetch(`${API}/api/prepare-reference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to prepare reference");

      setStatusMsg(`Reference ready — ${data.frame_count} frames (${Math.round(data.duration_seconds)}s)`);
      setPhase("ready");
    } catch (e) {
      setError(e.message);
      setPhase("home");
    }
  }

  // ── Step 2: Start practice ────────────────────────────────────────────────

  async function handleStartPractice() {
    setError("");
    framesRef.current = [];
    elapsedRef.current = 0;
    setCapturedCount(0);
    setFrames([]);
    setElapsed(0);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: 15 },
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);

      setPhase("practice");

      // Frame capture loop
      captureRef.current = setInterval(() => {
        captureFrame();
      }, 1000 / CAPTURE_FPS);

      // Timer
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed((e) => {
          const next = e + 1;
          if (next >= MAX_RECORD_SECONDS) {
            stopPractice();
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      setError("Camera access denied. Please allow camera permissions.");
    }
  }

  function captureFrame() {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    canvasRef.current.width = 640;
    canvasRef.current.height = 480;
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.6);
    const ts = elapsedRef.current + framesRef.current.length / CAPTURE_FPS;
    framesRef.current.push({ timestamp: ts, data: dataUrl });
    setCapturedCount(framesRef.current.length);
  }

  const stopPractice = useCallback(() => {
    clearInterval(timerRef.current);
    clearInterval(captureRef.current);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }

    const capturedFrames = [...framesRef.current];
    const dur = elapsedRef.current;

    if (!capturedFrames.length) {
      setError("No frames were captured. Check camera preview, then try again.");
      setPhase("ready");
      return;
    }

    setRecordDuration(dur);
    setFrames(capturedFrames);
    setPhase("analyzing");
    analyzeFrames(capturedFrames);
  }, []);

  // ── Step 3: Analyze ───────────────────────────────────────────────────────

  async function analyzeFrames(capturedFrames) {
    setStatusMsg(`Analyzing ${capturedFrames.length} frames against reference...`);
    try {
      const res = await fetch(`${API}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "default",
          frames: capturedFrames,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Analysis failed");

      setIssues(data.issues || []);
      setFeedbackModel(data.feedback_model || data.feedback_source || "unknown");
      setJointVisibility(data.joint_visibility || []);

      // Merge LLM feedback with issue metadata
      const usedFbIndices = new Set();
      const mergedFeedback = (data.issues || []).map((issue) => {
        // Find best matching LLM feedback by joint name + closest timestamp
        let bestFb = null;
        let bestIdx = -1;
        let bestTimeDiff = Infinity;
        (data.feedback || []).forEach((f, idx) => {
          if (usedFbIndices.has(idx)) return;
          const jointMatch = f.joint === issue.joint_display || f.joint === issue.joint;
          if (!jointMatch) return;
          // Parse timestamp like "0:12" to seconds
          const parts = (f.timestamp || "").split(":").map(Number);
          const fbSec = parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
          const diff = Math.abs(fbSec - (issue.timestamp_start || 0));
          if (diff < bestTimeDiff) {
            bestTimeDiff = diff;
            bestFb = f;
            bestIdx = idx;
          }
        });
        if (bestIdx >= 0) usedFbIndices.add(bestIdx);
        const fb = bestFb || {};

        // Build a fallback issue/advice text from raw data in case LLM didn't provide one
        const fallbackIssue = issue.missing
          ? `${issue.joint_display} is not visible in this frame but should be.`
          : `${issue.joint_display} is ${issue.direction} by ${issue.avg_diff_degrees}° (yours: ${issue.student_angle}°, reference: ${issue.ref_angle}°).`;

        return {
          ...issue,
          issue: fb.issue || fallbackIssue,
          advice: fb.advice || null,
          student_frame: issue.student_frame,
          reference_frame: issue.reference_frame,
          timestamp_label: issue.timestamp_label,
        };
      });
      setFeedback(mergedFeedback);
      setPhase("results");
    } catch (e) {
      setError(e.message);
      setPhase("ready");
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === "practice" && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {
        setError("Could not start video preview. Please retry Start Practice.");
      });
    }
  }, [phase, stream]);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(captureRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      {/* Background grain */}
      <div style={styles.grain} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>𑁍</span>
          <span style={styles.logoText}>NATYAM<span style={styles.logoSub}> AI</span></span>
        </div>
        <div style={styles.headerSub}>Bharatanatyam Practice Companion</div>
      </header>

      <main style={styles.main}>
        {/* ── HOME ── */}
        {(phase === "home" || phase === "loading-ref") && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Load Reference Performance</h2>
            <p style={styles.cardDesc}>
              Paste a YouTube URL of a Bharatanatyam performance. The AI will extract the dancer's
              pose as your reference — then you dance and get timestamped feedback.
            </p>
            <input
              style={styles.input}
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadReference()}
              disabled={phase === "loading-ref"}
            />
            {error && <div style={styles.error}>{error}</div>}
            <button
              style={{
                ...styles.btn,
                opacity: phase === "loading-ref" ? 0.6 : 1,
              }}
              onClick={handleLoadReference}
              disabled={phase === "loading-ref"}
            >
              {phase === "loading-ref" ? (
                <span style={styles.spinner}>⟳ {statusMsg}</span>
              ) : (
                "▶ Load Reference Video"
              )}
            </button>

            {phase === "loading-ref" && (
              <div style={styles.progressBar}>
                <div style={styles.progressFill} />
              </div>
            )}
          </div>
        )}

        {/* ── READY ── */}
        {phase === "ready" && (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {/* YouTube embed */}
            <div style={{ flex: "1 1 420px" }}>
              <div style={styles.label}>Reference Video</div>
              <div style={styles.videoWrap}>
                <iframe
                  width="100%"
                  height="280"
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=0`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ borderRadius: 10 }}
                />
              </div>
              <div style={styles.hint}>
                Study the reference, then hit Practice when ready.
              </div>
            </div>

            {/* Action */}
            <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
              <div style={styles.infoBox}>
                <div style={styles.infoRow}><span>⏱</span><span>Max 60 seconds</span></div>
                <div style={styles.infoRow}><span>📷</span><span>Webcam required</span></div>
                <div style={styles.infoRow}><span>🤖</span><span>Pose analysis via MediaPipe</span></div>
                <div style={styles.infoRow}><span>🧠</span><span>Feedback via Gemma2:2b (local)</span></div>
              </div>
              <button style={styles.btnPractice} onClick={handleStartPractice}>
                🕺 Start Practice
              </button>
              <button
                style={{ ...styles.btn, background: "transparent", border: "1px solid #444", color: "#888" }}
                onClick={() => { setPhase("home"); setYoutubeId(null); }}
              >
                ← Change Video
              </button>
            </div>
          </div>
        )}

        {/* ── PRACTICE ── */}
        {phase === "practice" && (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {/* Webcam */}
            <div style={{ flex: "1 1 420px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={styles.label}>Your Camera</div>
                <div style={styles.timer}>
                  <span style={{
                    color: elapsed > 50 ? "#ff4444" : "#c9a96e",
                    fontFamily: "monospace",
                    fontSize: 22,
                    fontWeight: 700,
                  }}>
                    {formatTime(elapsed)}
                  </span>
                  <span style={{ color: "#555", fontSize: 13 }}> / {formatTime(MAX_RECORD_SECONDS)}</span>
                </div>
              </div>
              <div style={styles.videoWrap}>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ width: "100%", borderRadius: 10, background: "#000" }}
                />
                {/* Recording indicator */}
                <div style={styles.recBadge}>
                  <span style={styles.recDot} />
                  REC
                </div>
              </div>
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {/* Progress bar */}
              <div style={{ marginTop: 10, height: 4, background: "#222", borderRadius: 2 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${(elapsed / MAX_RECORD_SECONDS) * 100}%`,
                    background: elapsed > 50 ? "#ff4444" : "#c9a96e",
                    borderRadius: 2,
                    transition: "width 1s linear",
                  }}
                />
              </div>
            </div>

            {/* Reference side-by-side */}
            <div style={{ flex: "1 1 300px" }}>
              <div style={styles.label}>Reference</div>
              <div style={styles.videoWrap}>
                <iframe
                  width="100%"
                  height="240"
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
                  frameBorder="0"
                  allow="autoplay"
                  style={{ borderRadius: 10 }}
                />
              </div>
              <div style={styles.hint}>
                {capturedCount} frames captured
              </div>
              <button style={{ ...styles.btn, marginTop: 16, background: "#ff4444" }} onClick={stopPractice}>
                ⏹ Stop & Analyze
              </button>
            </div>
          </div>
        )}

        {/* ── ANALYZING ── */}
        {phase === "analyzing" && (
          <div style={{ ...styles.card, textAlign: "center" }}>
            <div style={styles.analyzeIcon}>⟳</div>
            <h2 style={styles.cardTitle}>Analyzing your performance...</h2>
            <p style={styles.cardDesc}>{statusMsg}</p>
            <div style={{ ...styles.progressBar, marginTop: 24 }}>
              <div style={{ ...styles.progressFill, animationDuration: "1.5s" }} />
            </div>
            <p style={{ ...styles.hint, marginTop: 16 }}>
              Running DTW alignment + pose comparison + AI coaching feedback
            </p>
          </div>
        )}

        {/* ── RESULTS ── */}
        {phase === "results" && (
          <div>
            {/* Summary row */}
            <div style={styles.summaryRow}>
              <div style={styles.summaryCard}>
                <div style={styles.summaryNum}>{feedback.length}</div>
                <div style={styles.summaryLabel}>Issues Found</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={{ ...styles.summaryNum, color: "#ff4444" }}>
                  {feedback.filter((f) => f.severity === "high").length}
                </div>
                <div style={styles.summaryLabel}>High Priority</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={{ ...styles.summaryNum, color: "#ffaa00" }}>
                  {feedback.filter((f) => f.severity === "medium").length}
                </div>
                <div style={styles.summaryLabel}>Medium Priority</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={{ ...styles.summaryNum, color: "#44ff88" }}>
                  {formatTime(recordDuration)}
                </div>
                <div style={styles.summaryLabel}>Recorded</div>
              </div>
            </div>

            {/* Timeline */}
            {feedback.length > 0 && (
              <div style={{ ...styles.card, marginBottom: 16 }}>
                <div style={styles.label}>Issue Timeline</div>
                <div style={{ paddingTop: 8, paddingBottom: 24 }}>
                  <TimelineBar issues={feedback} duration={recordDuration} />
                </div>
                <div style={{ fontSize: 11, color: "#555", display: "flex", gap: 16 }}>
                  <span><span style={{ color: "#ff4444" }}>●</span> High</span>
                  <span><span style={{ color: "#ffaa00" }}>●</span> Medium</span>
                  <span><span style={{ color: "#44aaff" }}>●</span> Low</span>
                </div>
              </div>
            )}

            {/* Feedback list */}
            <div style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={styles.label}>Timestamped Feedback</div>
                {feedbackModel && (
                  <div style={styles.modelBadge}>
                    model: {feedbackModel}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                {feedback.length === 0 ? (
                  <div style={{ padding: "16px 0" }}>
                    {jointVisibility.length > 0 && jointVisibility.every(j => !j.in_frame) ? (
                      <div>
                        <div style={{
                          color: "#ffaa00",
                          fontSize: 14,
                          marginBottom: 16,
                          padding: "12px 16px",
                          background: "rgba(255,170,0,0.08)",
                          border: "1px solid rgba(255,170,0,0.2)",
                          borderRadius: 8,
                          textAlign: "center",
                        }}>
                          ⚠️ No dance-relevant joints were detected in your video. Make sure your full body is visible to the camera.
                        </div>
                        <div style={{
                          fontFamily: "'Courier New', monospace",
                          fontSize: 13,
                          lineHeight: 2,
                          background: "rgba(0,0,0,0.3)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 10,
                          padding: "16px 20px",
                        }}>
                          <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Joint Visibility Report</div>
                          {jointVisibility.map((jv, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ color: jv.in_frame ? "#44ff88" : "#888" }}>
                                {jv.joint_display}
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: jv.in_frame ? "#44ff88" : "#666" }}>{jv.visibility_pct}% visible</span>
                                <span style={{ color: jv.in_frame ? "#44ff88" : "#ff4444", fontSize: 12 }}>
                                  {jv.in_frame ? "✓ IN FRAME" : "✗ NOT IN FRAME"}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : jointVisibility.length > 0 ? (
                      <div>
                        <div style={{ color: "#44ff88", textAlign: "center", padding: "16px 0", fontSize: 15, marginBottom: 16 }}>
                          🎉 No significant issues detected! Great performance.
                        </div>
                        <div style={{
                          fontFamily: "'Courier New', monospace",
                          fontSize: 13,
                          lineHeight: 2,
                          background: "rgba(0,0,0,0.3)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 10,
                          padding: "16px 20px",
                        }}>
                          <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Joint Visibility Report</div>
                          {jointVisibility.map((jv, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ color: jv.in_frame ? "#44ff88" : "#888" }}>
                                {jv.joint_display}
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: jv.in_frame ? "#44ff88" : "#666" }}>{jv.visibility_pct}% visible</span>
                                <span style={{ color: jv.in_frame ? "#44ff88" : "#ff4444", fontSize: 12 }}>
                                  {jv.in_frame ? "✓ IN FRAME" : "✗ NOT IN FRAME"}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: "#44ff88", textAlign: "center", padding: 32, fontSize: 15 }}>
                        🎉 No significant issues detected! Great performance.
                      </div>
                    )}
                  </div>
                ) : (
                  feedback.map((item, i) => (
                    <FeedbackCard key={i} item={item} index={i} />
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button style={styles.btnPractice} onClick={() => setPhase("ready")}>
                🔄 Practice Again
              </button>
              <button
                style={{ ...styles.btn, background: "transparent", border: "1px solid #444", color: "#888" }}
                onClick={() => { setPhase("home"); setYoutubeId(null); setFeedback([]); setIssues([]); }}
              >
                ← New Video
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  root: {
    minHeight: "100vh",
    background: "#0a0805",
    color: "#e8dcc8",
    fontFamily: "'Georgia', 'Times New Roman', serif",
    position: "relative",
    overflow: "hidden",
  },
  grain: {
    position: "fixed",
    inset: 0,
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
    opacity: 0.4,
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    padding: "28px 40px 20px",
    borderBottom: "1px solid rgba(201,169,110,0.15)",
    position: "relative",
    zIndex: 1,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logoIcon: {
    fontSize: 28,
    color: "#c9a96e",
    lineHeight: 1,
  },
  logoText: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 4,
    color: "#e8dcc8",
  },
  logoSub: {
    fontSize: 13,
    color: "#c9a96e",
    letterSpacing: 2,
    fontWeight: 400,
  },
  headerSub: {
    fontSize: 12,
    color: "#666",
    letterSpacing: 2,
    marginTop: 2,
    textTransform: "uppercase",
  },
  main: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "32px 24px",
    position: "relative",
    zIndex: 1,
  },
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(201,169,110,0.15)",
    borderRadius: 16,
    padding: "28px 32px",
  },
  cardTitle: {
    margin: "0 0 10px",
    fontSize: 20,
    fontWeight: 700,
    color: "#e8dcc8",
    letterSpacing: 0.5,
  },
  cardDesc: {
    margin: "0 0 20px",
    color: "#999",
    fontSize: 14,
    lineHeight: 1.7,
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(201,169,110,0.3)",
    borderRadius: 8,
    color: "#e8dcc8",
    fontSize: 14,
    fontFamily: "monospace",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 16,
  },
  btn: {
    display: "block",
    width: "100%",
    padding: "14px 20px",
    background: "#c9a96e",
    border: "none",
    borderRadius: 8,
    color: "#0a0805",
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: 1,
    cursor: "pointer",
    textAlign: "center",
  },
  btnPractice: {
    display: "block",
    width: "100%",
    padding: "16px 20px",
    background: "linear-gradient(135deg, #c9a96e, #e8c878)",
    border: "none",
    borderRadius: 8,
    color: "#0a0805",
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: 1,
    cursor: "pointer",
    textAlign: "center",
  },
  error: {
    color: "#ff6b6b",
    fontSize: 13,
    marginBottom: 12,
    padding: "8px 12px",
    background: "rgba(255,68,68,0.08)",
    borderRadius: 6,
    border: "1px solid rgba(255,68,68,0.2)",
  },
  progressBar: {
    height: 3,
    background: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 16,
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #c9a96e, #e8c878, #c9a96e)",
    backgroundSize: "200% 100%",
    animation: "shimmer 2s infinite linear",
    width: "100%",
  },
  spinner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#c9a96e",
    marginBottom: 8,
    fontFamily: "monospace",
  },
  videoWrap: {
    borderRadius: 10,
    overflow: "hidden",
    background: "#111",
    position: "relative",
  },
  hint: {
    fontSize: 12,
    color: "#555",
    marginTop: 8,
    textAlign: "center",
  },
  infoBox: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  infoRow: {
    display: "flex",
    gap: 10,
    fontSize: 13,
    color: "#888",
    alignItems: "center",
  },
  timer: {
    display: "flex",
    alignItems: "baseline",
  },
  recBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "rgba(0,0,0,0.6)",
    padding: "3px 8px",
    borderRadius: 20,
    fontSize: 11,
    color: "#ff4444",
    fontFamily: "monospace",
    fontWeight: 700,
    letterSpacing: 1,
  },
  recDot: {
    width: 7,
    height: 7,
    background: "#ff4444",
    borderRadius: "50%",
    animation: "pulse 1s infinite",
    display: "inline-block",
  },
  analyzeIcon: {
    fontSize: 48,
    color: "#c9a96e",
    animation: "spin 1.5s linear infinite",
    display: "block",
    marginBottom: 16,
  },
  summaryRow: {
    display: "flex",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  summaryCard: {
    flex: "1 1 100px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(201,169,110,0.12)",
    borderRadius: 10,
    padding: "16px",
    textAlign: "center",
  },
  summaryNum: {
    fontSize: 28,
    fontWeight: 700,
    color: "#c9a96e",
    fontFamily: "monospace",
    lineHeight: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#555",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  modelBadge: {
    fontSize: 11,
    color: "#999",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 999,
    padding: "4px 10px",
    fontFamily: "monospace",
  },
};

// ── Global CSS injected ───────────────────────────────────────────────────────

const style = document.createElement("style");
style.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0805; }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  input::placeholder { color: #444; }
  input:focus { border-color: rgba(201,169,110,0.6) !important; }
  button:hover { filter: brightness(1.1); }
  button:active { filter: brightness(0.95); }
`;
document.head.appendChild(style);
