import asyncio
import json
import httpx
import os
from typing import List


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
PRIMARY_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:0.8b")
FALLBACK_MODELS = [
    m.strip() for m in os.getenv("OLLAMA_FALLBACK_MODELS", "gemma4:31b-cloud").split(",") if m.strip()
]

SYSTEM_PROMPT = """You are an expert Bharatanatyam dance coach with 20 years of experience. 
You will receive a structured list of technical issues detected in a student's dance performance compared to a reference video.
IMPORTANT: These issues have been pre-validated — every joint listed was CONFIRMED VISIBLE in the student's video.
Do NOT invent, add, or reference any body parts or joints that are not in the provided list.
Only generate feedback for the exact issues given. Do not mention shoulders, elbows, knees, hips, or any other body part unless it appears in the list below.
For each issue, give specific, actionable coaching advice in the voice of a supportive but precise teacher.
Keep each feedback item to 2-3 sentences max. Be specific about what to correct and how.
Respond ONLY with a JSON array. No markdown, no preamble. Format:
[{"timestamp": "0:12", "joint": "Right Elbow", "issue": "...", "advice": "..."}]"""


async def generate_feedback(issues: List[dict]) -> dict:
    """Send issues to Ollama and get coaching feedback + model metadata."""
    if not issues:
        return {"items": [], "model_used": None, "source": "none"}

    # Build compact issue summary for the prompt
    issue_lines = []
    for iss in issues:
        if iss.get("missing"):
            issue_lines.append(
                f"- At {iss['timestamp_label']}: {iss['joint_display']} is missing or not visible in the frame. "
                f"It should be clearly visible and bent at {iss['ref_angle']}°. "
                f"Severity: {iss['severity']}."
            )
        else:
            issue_lines.append(
                f"- At {iss['timestamp_label']}: {iss['joint_display']} angle is "
                f"{iss['student_angle']}° but should be {iss['ref_angle']}° "
                f"(off by {iss['avg_diff_degrees']}°, {iss['direction']}). "
                f"Severity: {iss['severity']}."
            )

    user_prompt = (
        "Here are the detected issues in this Bharatanatyam performance:\n\n"
        + "\n".join(issue_lines)
        + "\n\nGenerate coaching feedback JSON array as specified."
    )

    models_to_try = [PRIMARY_MODEL, *[m for m in FALLBACK_MODELS if m != PRIMARY_MODEL]]
    for model in models_to_try:
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(
                    OLLAMA_URL,
                    json={
                        "model": model,
                        "prompt": user_prompt,
                        "system": SYSTEM_PROMPT,
                        "format": "json",
                        "stream": False,
                        "options": {
                            "temperature": 0.4,
                            "num_predict": 1024,
                        },
                    },
                )
                response.raise_for_status()
                data = response.json()
                raw_text = data.get("response", "")

                # Strip markdown fences if present.
                raw_text = raw_text.strip()
                if raw_text.startswith("```"):
                    raw_text = raw_text.split("```")[1]
                    if raw_text.startswith("json"):
                        raw_text = raw_text[4:]

                parsed = json.loads(raw_text)
                print(f"Ollama feedback model used: {model}")
                return {"items": parsed, "model_used": model, "source": "ollama"}
        except Exception as e:
            print(f"Ollama model failed ({model}): {e}")

    # Final fallback: deterministic rule-based feedback.
    return {
        "items": _fallback_feedback(issues),
        "model_used": "rule-based-fallback",
        "source": "fallback",
    }


def _fallback_feedback(issues: List[dict]) -> List[dict]:
    """Rule-based fallback if Ollama is unavailable."""
    feedback = []
    for iss in issues:
        joint = iss["joint_display"]
        diff = iss["avg_diff_degrees"]
        direction = iss["direction"]
        ts = iss["timestamp_label"]

        if iss.get("missing"):
            feedback.append({
                "timestamp": ts,
                "joint": joint,
                "issue": f"{joint} is missing or not visible in the frame.",
                "advice": f"Ensure your full body, including the {joint}, is clearly visible to the camera.",
            })
        else:
            advice_map = {
                "Left Elbow": f"Focus on your left arm extension. Keep the elbow line sharp and intentional.",
                "Right Elbow": f"Your right elbow needs more control. Practice the arm position slowly in isolation.",
                "Left Shoulder": f"Drop your left shoulder and open the chest — Bharatanatyam requires the torso to be proud.",
                "Right Shoulder": f"Your right shoulder is tensing. Breathe out and let the arm flow from the back.",
                "Left Knee": f"Bend your left knee deeper into the aramandi position — ground yourself.",
                "Right Knee": f"Right knee alignment is off. Make sure your knee tracks over your toes.",
                "Left Hip": f"Keep your left hip squared to the front — avoid letting it rotate out.",
                "Right Hip": f"Right hip is drifting. Engage your core to hold the hip stable through the sequence.",
            }

            feedback.append({
                "timestamp": ts,
                "joint": joint,
                "issue": f"{joint} is {direction} by {diff}° compared to reference.",
                "advice": advice_map.get(joint, f"Review your {joint} position carefully."),
            })

    return feedback
