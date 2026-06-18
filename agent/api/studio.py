"""Flow Studio API — stateful orchestration over the Flow proxy (video-app.md).

Phase 0: project CRUD (DB + Flow), Flow project import with thumbnails, options,
settings, health. Heavier pipeline endpoints land in later phases.
"""
import logging
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from agent.config import (
    IMAGE_MODELS, VIDEO_MODELS, UPSCALE_MODELS, OMNI_FLASH_MODELS,
)
from agent.services.flow_client import get_flow_client
from agent.studio import db, media_store, brain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/studio", tags=["studio"])


# ─── Models ──────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    title: str
    aspect_ratio: str = "VIDEO_ASPECT_RATIO_LANDSCAPE"
    style: str = "Realistic"
    storytelling: bool = False
    import_flow_project_id: Optional[str] = None   # gắn vào project Flow có sẵn
    import_thumb_media_key: Optional[str] = None


class UpdateProjectRequest(BaseModel):
    title: Optional[str] = None
    style: Optional[str] = None
    aspect_ratio: Optional[str] = None
    paygate_tier: Optional[str] = None
    image_model: Optional[str] = None
    video_model: Optional[str] = None
    voice_id: Optional[int] = None
    agent: Optional[str] = None
    idea: Optional[str] = None
    target_duration: Optional[int] = None
    shot_duration: Optional[int] = None
    storytelling: Optional[bool] = None


class GenerateScriptRequest(BaseModel):
    idea: str
    target_duration: Optional[int] = None   # giây


class SaveScriptRequest(BaseModel):
    script: str


class ScriptChatRequest(BaseModel):
    instruction: str


# ─── Helpers ─────────────────────────────────────────────────

def _deep_find(obj, key: str):
    """First value for `key` anywhere in a nested dict/list (tRPC envelopes)."""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            found = _deep_find(v, key)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _deep_find(v, key)
            if found is not None:
                return found
    return None


def _flow_projects(raw: dict) -> list[dict]:
    """Pull the projects array out of the tRPC envelope."""
    data = raw.get("data", raw) if isinstance(raw, dict) else {}
    projects = _deep_find(data, "projects")
    out = []
    for p in projects or []:
        info = p.get("projectInfo", {})
        out.append({
            "flow_project_id": p.get("projectId"),
            "title": info.get("projectTitle"),
            "thumb_media_key": info.get("thumbnailMediaKey"),
            "creation_time": p.get("creationTime"),
        })
    return out


def _require_extension():
    client = get_flow_client()
    if not client.connected:
        raise HTTPException(503, "Extension chưa kết nối (mở Google Flow trong Chrome)")
    return client


# ─── Health / options / settings ────────────────────────────

@router.get("/health")
async def health():
    client = get_flow_client()
    omni = await _safe_omni_health()
    return {
        "status": "ok",
        "extension_connected": client.connected,
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "tts": omni,
    }


async def _safe_omni_health() -> bool:
    try:
        from agent.api.tts import _state
        return bool(_state.get("base_url"))
    except Exception:
        return False


@router.get("/options")
async def options():
    """Lựa chọn cho Settings: models, styles, aspect, tiers, voices, agents."""
    voices, agents = [], []
    try:
        from agent.api.tts import _proxy
        voices = await _proxy("GET", "/api/voices/list", timeout=10.0)
    except Exception:
        voices = []
    try:
        from agent.api.ai_agent import list_agents
        agents = (await list_agents())["agents"]
    except Exception:
        agents = []
    return {
        "image_models": list(IMAGE_MODELS.keys()),
        "video_models": {"veo_tiers": list(VIDEO_MODELS.keys()),
                          "omni_flash_durations": list(OMNI_FLASH_MODELS.keys())},
        "upscale_models": list(UPSCALE_MODELS.keys()),
        "aspect_ratios": ["VIDEO_ASPECT_RATIO_LANDSCAPE", "VIDEO_ASPECT_RATIO_PORTRAIT"],
        "paygate_tiers": ["PAYGATE_TIER_ONE", "PAYGATE_TIER_TWO"],
        "style_presets": ["Realistic", "Cinematic", "Anime", "3D Pixar", "Watercolor", "Noir"],
        "voices": voices,
        "agents": agents,
    }


@router.get("/settings")
async def get_settings():
    return await db.kv_get_all()


@router.put("/settings")
async def put_settings(body: dict):
    for k, v in body.items():
        await db.kv_set(k, v)
    return await db.kv_get_all()


@router.get("/credits")
async def credits():
    client = _require_extension()
    result = await client.get_credits()
    return result.get("data", result)


# ─── Flow projects (live, for import) ───────────────────────

@router.get("/flow-projects")
async def flow_projects():
    """Project trên Google Flow (có thumbnail) để import."""
    client = _require_extension()
    raw = await client.get_projects()
    return {"projects": _flow_projects(raw)}


# ─── Studio projects (DB) ───────────────────────────────────

@router.get("/projects")
async def list_projects():
    rows = await db.query_all("SELECT * FROM project ORDER BY updated_at DESC")
    return {"projects": rows}


@router.post("/projects")
async def create_project(body: CreateProjectRequest):
    client = _require_extension()

    flow_id = body.import_flow_project_id
    thumb = body.import_thumb_media_key
    if not flow_id:
        # Tạo project mới trên Flow
        result = await client.create_project(body.title)
        data = result.get("data", result)
        flow_id = _deep_find(data, "projectId")
        if not flow_id:
            raise HTTPException(502, "Không tạo được project trên Flow")

    pid = db.new_id()
    ts = db.now()
    await db.insert("project", {
        "id": pid, "title": body.title, "flow_project_id": flow_id,
        "style": body.style, "aspect_ratio": body.aspect_ratio,
        "storytelling": 1 if body.storytelling else 0,
        "thumb_media_key": thumb,
        "status": "draft", "created_at": ts, "updated_at": ts,
    })
    return await db.query_one("SELECT * FROM project WHERE id=?", (pid,))


@router.get("/projects/{pid}")
async def get_project(pid: str):
    row = await db.query_one("SELECT * FROM project WHERE id=?", (pid,))
    if not row:
        raise HTTPException(404, "Project không tồn tại")
    return row


@router.patch("/projects/{pid}")
async def update_project(pid: str, body: UpdateProjectRequest):
    row = await db.query_one("SELECT * FROM project WHERE id=?", (pid,))
    if not row:
        raise HTTPException(404, "Project không tồn tại")
    data = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "storytelling" in data:
        data["storytelling"] = 1 if data["storytelling"] else 0
    data["updated_at"] = db.now()
    await db.update("project", pid, data)
    return await db.query_one("SELECT * FROM project WHERE id=?", (pid,))


@router.delete("/projects/{pid}")
async def delete_project(pid: str):
    row = await db.query_one("SELECT * FROM project WHERE id=?", (pid,))
    if not row:
        raise HTTPException(404, "Project không tồn tại")
    await db.delete("project", pid)
    # dọn media local của project
    folder = media_store.MEDIA_DIR / pid
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)
    return {"ok": True}


# ─── Script + scenes ────────────────────────────────────────

async def _project_or_404(pid: str) -> dict:
    row = await db.query_one("SELECT * FROM project WHERE id=?", (pid,))
    if not row:
        raise HTTPException(404, "Project không tồn tại")
    return row


async def _save_scenes(pid: str, script: str) -> list[dict]:
    """Re-parse script → replace project's scenes in DB. Returns scene rows."""
    await db.execute("DELETE FROM scene WHERE project_id=?", (pid,))
    parsed = brain.parse_scenes(script)
    ts = db.now()
    for s in parsed:
        await db.insert("scene", {
            "id": db.new_id(), "project_id": pid, "idx": s["idx"],
            "heading": s["heading"], "slug": s["slug"],
            "action": s["body"].strip(), "dialog": None,
            "location_entity_id": None, "source_segment": None,
            "source_start": None, "source_end": None, "created_at": ts,
        })
    return await db.query_all(
        "SELECT * FROM scene WHERE project_id=? ORDER BY idx", (pid,))


@router.get("/projects/{pid}/scenes")
async def list_scenes(pid: str):
    await _project_or_404(pid)
    return {"scenes": await db.query_all(
        "SELECT * FROM scene WHERE project_id=? ORDER BY idx", (pid,))}


@router.post("/projects/{pid}/script/generate")
async def generate_script(pid: str, body: GenerateScriptRequest):
    p = await _project_or_404(pid)
    result = await brain.run_json(brain.script_from_idea_prompt(
        body.idea, body.target_duration, bool(p["storytelling"]),
        p["style"], p["shot_duration"] or 8))
    script = result.get("script", "")
    if not script:
        raise HTTPException(502, "AI không trả về script")
    await db.update("project", pid, {
        "idea": body.idea, "target_duration": body.target_duration,
        "script_raw": script, "updated_at": db.now()})
    scenes = await _save_scenes(pid, script)
    return {"script": script, "scenes": scenes,
            "estimated_duration": result.get("estimated_duration")}


@router.put("/projects/{pid}/script")
async def save_script(pid: str, body: SaveScriptRequest):
    await _project_or_404(pid)
    await db.update("project", pid, {"script_raw": body.script, "updated_at": db.now()})
    scenes = await _save_scenes(pid, body.script)
    return {"script": body.script, "scenes": scenes}


@router.post("/projects/{pid}/script/chat")
async def script_chat(pid: str, body: ScriptChatRequest):
    p = await _project_or_404(pid)
    result = await brain.run_json(brain.edit_script_prompt(
        p["script_raw"] or "", body.instruction, p["style"]))
    script = result.get("script", "")
    if not script:
        raise HTTPException(502, "AI không trả về script")
    await db.update("project", pid, {"script_raw": script, "updated_at": db.now()})
    scenes = await _save_scenes(pid, script)
    return {"script": script, "scenes": scenes}


# ─── Thumbnail / media resolve ──────────────────────────────

@router.get("/thumb/{media_key}")
async def thumb(media_key: str):
    """Trả thumbnail (tải về cache local 1 lần) cho ảnh đại diện project/media."""
    path = await media_store.ensure_thumb(media_key)
    if not path:
        raise HTTPException(404, "Không lấy được thumbnail (id sai hoặc chưa sẵn sàng)")
    return FileResponse(path, media_type="image/png")


@router.post("/media/ensure/{media_id}")
async def ensure_media(media_id: str, project_id: str, ext: str = "png"):
    """Đảm bảo file local tồn tại; trả web path."""
    web = await media_store.ensure_local(media_id, project_id, ext)
    if not web:
        raise HTTPException(404, "Không tải được media")
    return {"path": web}
