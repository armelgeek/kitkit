"""TTS proxy endpoints that use ElevenLabs API.
"""
import logging
import os
import base64
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tts", tags=["tts"])

# ─── Configuration ──────────────────────────────────────────
# Set ELEVENLABS_API_KEY in your environment
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
# Default voice ID, can be overridden in settings
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM" # ElevenLabs default voice "Rachel"

# ─── Models ──────────────────────────────────────────────────

class ConfigRequest(BaseModel):
    # Still here for compatibility, though we don't need a base_url for ElevenLabs
    base_url: str

class TTSRequest(BaseModel):
    text: str
    voice_id: str = DEFAULT_VOICE_ID # Note: ElevenLabs uses string IDs
    speed: float = 1.0
    instruct: Optional[str] = None

# ─── ElevenLabs Helper ────────────────────────────────────────

async def elevenlabs_synthesize(text: str, voice_id: str, speed: float = 1.0) -> str:
    """Call ElevenLabs API and return base64 audio."""
    if not ELEVENLABS_API_KEY:
        raise HTTPException(500, "ELEVENLABS_API_KEY not configured")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }
    # Clamp speed to ElevenLabs accepted range [0.7, 1.2] for safety.
    clamped_speed = max(0.7, min(1.2, float(speed)))
    payload = {
        "text": text,
        "model_id": "eleven_flash_v2_5",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.5,
            "speed": clamped_speed,
        },
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=payload)
    
    if resp.status_code != 200:
        logger.error("ElevenLabs API error: %s", resp.text)
        raise HTTPException(resp.status_code, "ElevenLabs TTS failed")

    return base64.b64encode(resp.content).decode("utf-8")

# ─── Endpoints ──────────────────────────────────────────────────

@router.get("/config")
async def get_config():
    return {"base_url": "https://api.elevenlabs.io"}

@router.put("/config")
async def set_config(body: ConfigRequest):
    return {"base_url": "https://api.elevenlabs.io"}

@router.post("/synthesize")
async def synthesize(body: TTSRequest):
    """Synthesize speech using ElevenLabs."""
    audio_b64 = await _elevenlabs_synthesize(body.text, body.voice_id, body.speed)
    return {"audio": audio_b64, "status": "success", "msg": "Synthesized with ElevenLabs"}

@router.get("/health")
async def health():
    return {"status": "ok", "provider": "ElevenLabs"}

@router.get("/voices")
async def list_voices():
    """Fetch registered voices from ElevenLabs."""
    if not ELEVENLABS_API_KEY:
        logger.error("ELEVENLABS_API_KEY is not set in environment.")
        raise HTTPException(500, "ELEVENLABS_API_KEY not configured")

    url = "https://api.elevenlabs.io/v1/voices"
    headers = {"xi-api-key": ELEVENLABS_API_KEY}

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, headers=headers)
        except httpx.RequestError as exc:
            logger.error(f"Network error while connecting to ElevenLabs: {exc}")
            raise HTTPException(503, "Could not connect to ElevenLabs API")
    
    if resp.status_code != 200:
        logger.error(f"ElevenLabs API error: Status {resp.status_code}, Response: {resp.text}")
        raise HTTPException(resp.status_code, f"Failed to fetch voices from ElevenLabs: {resp.text}")

    data = resp.json()
    # Map ElevenLabs voice format to the project's expected format
    voices = [{"voice_id": v["voice_id"], "title": v["name"]} for v in data.get("voices", [])]
    return {"voices": voices}

