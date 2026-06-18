"""Flow Studio API — stateful orchestration over the Flow proxy (video-app.md).

Phase 0: project CRUD (DB + Flow), Flow project import with thumbnails, options,
settings, health. Heavier pipeline endpoints land in later phases.
"""
import asyncio
import logging
import random
import shutil
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


class AddEntityRequest(BaseModel):
    type: str = "character"        # character | location | prop
    name: str
    description: str = ""
    ref_prompt: str = ""


class UpdateEntityRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    ref_prompt: Optional[str] = None
    type: Optional[str] = None


class SetMediaRequest(BaseModel):
    media_id: str


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


# ─── Assets (entities) ──────────────────────────────────────

def _to_image_aspect(video_aspect: str) -> str:
    return (video_aspect or "").replace("VIDEO_ASPECT_RATIO_", "IMAGE_ASPECT_RATIO_") \
        or "IMAGE_ASPECT_RATIO_LANDSCAPE"


async def _resolve_image_model(project: dict) -> Optional[str]:
    name = project.get("image_model") or (await db.kv_get_all()).get("image_model")
    if not name:
        return None  # flow_client default (NANO_BANANA_PRO)
    return IMAGE_MODELS.get(name, name)  # name → key, or already a key


def _extract_image_result(payload: dict) -> dict:
    media = (payload.get("media") or [{}])[0]
    gen = media.get("image", {}).get("generatedImage", {})
    wf = (payload.get("workflows") or [{}])[0]
    return {
        "media_id": gen.get("mediaId") or media.get("name"),
        "workflow_id": wf.get("name"),
        "primary_media_id": wf.get("metadata", {}).get("primaryMediaId"),
    }


async def _entity_or_404(eid: str) -> dict:
    row = await db.query_one("SELECT * FROM entity WHERE id=?", (eid,))
    if not row:
        raise HTTPException(404, "Entity không tồn tại")
    return row


async def _store_media_on_entity(entity: dict, project: dict, info: dict, label: str):
    """Rename on Flow + download local + persist media fields onto the entity."""
    client = get_flow_client()
    if info.get("workflow_id") and project.get("flow_project_id"):
        try:
            await client.change_display_name(
                info["workflow_id"], project["flow_project_id"], label[:60])
        except Exception:
            pass
    web = None
    if info.get("media_id"):
        web = await media_store.ensure_local(info["media_id"], project["id"])
    await db.update("entity", entity["id"], {
        "media_id": info.get("media_id"),
        "primary_media_id": info.get("primary_media_id"),
        "workflow_id": info.get("workflow_id"),
        "image_path": web, "updated_at": db.now(),
    })
    return await _entity_or_404(entity["id"])


async def _generate_entity_image(entity: dict, project: dict) -> dict:
    client = _require_extension()
    prompt = brain.ref_image_prompt(
        entity["type"], entity["name"],
        entity.get("description") or entity.get("ref_prompt") or "", project["style"])
    aspect = ("IMAGE_ASPECT_RATIO_LANDSCAPE" if entity["type"] in ("character", "prop")
              else _to_image_aspect(project["aspect_ratio"]))
    model = await _resolve_image_model(project)
    res = await client.generate_images(
        prompt=prompt, project_id=project["flow_project_id"], aspect_ratio=aspect,
        user_paygate_tier=project["paygate_tier"], image_model=model)
    if res.get("error"):
        raise HTTPException(502, str(res["error"]))
    info = _extract_image_result(res.get("data", res))
    if not info["media_id"]:
        raise HTTPException(502, "Flow không trả media")
    return await _store_media_on_entity(
        entity, project, info, f"{entity['type']}_{entity['name']}")


@router.get("/projects/{pid}/entities")
async def list_entities(pid: str):
    await _project_or_404(pid)
    return {"entities": await db.query_all(
        "SELECT * FROM entity WHERE project_id=? ORDER BY type, created_at", (pid,))}


@router.post("/projects/{pid}/entities/extract")
async def extract_entities(pid: str):
    p = await _project_or_404(pid)
    if not p.get("script_raw"):
        raise HTTPException(400, "Chưa có kịch bản để trích entity")
    items = await brain.run_json(brain.entity_extract_prompt(p["script_raw"]))
    if not isinstance(items, list):
        raise HTTPException(502, "AI không trả về danh sách entity")
    # tránh trùng tên (đã có)
    existing = {r["name"].lower() for r in await db.query_all(
        "SELECT name FROM entity WHERE project_id=?", (pid,))}
    ts = db.now()
    added = 0
    for it in items:
        name = (it.get("name") or "").strip()
        if not name or name.lower() in existing:
            continue
        await db.insert("entity", {
            "id": db.new_id(), "project_id": pid,
            "type": it.get("type", "character"), "name": name,
            "description": it.get("description", ""),
            "ref_prompt": it.get("ref_prompt", ""),
            "created_at": ts, "updated_at": ts})
        added += 1
    return {"added": added, "entities": await db.query_all(
        "SELECT * FROM entity WHERE project_id=? ORDER BY type, created_at", (pid,))}


@router.post("/projects/{pid}/entities")
async def add_entity(pid: str, body: AddEntityRequest):
    await _project_or_404(pid)
    ts = db.now()
    eid = db.new_id()
    await db.insert("entity", {
        "id": eid, "project_id": pid, "type": body.type, "name": body.name,
        "description": body.description, "ref_prompt": body.ref_prompt,
        "created_at": ts, "updated_at": ts})
    return await _entity_or_404(eid)


@router.patch("/entities/{eid}")
async def update_entity(eid: str, body: UpdateEntityRequest):
    await _entity_or_404(eid)
    data = body.model_dump(exclude_none=True)
    data["updated_at"] = db.now()
    await db.update("entity", eid, data)
    return await _entity_or_404(eid)


@router.delete("/entities/{eid}")
async def delete_entity(eid: str):
    row = await _entity_or_404(eid)
    await db.delete("entity", eid)
    if row.get("image_path"):
        f = media_store.MEDIA_DIR / row["image_path"].replace("/media/", "", 1)
        if f.exists():
            f.unlink(missing_ok=True)
    return {"ok": True}


@router.post("/entities/{eid}/generate")
async def generate_entity(eid: str):
    entity = await _entity_or_404(eid)
    project = await _project_or_404(entity["project_id"])
    return await _generate_entity_image(entity, project)


@router.put("/entities/{eid}/image")
async def set_entity_image(eid: str, body: SetMediaRequest):
    """Gán ảnh chính từ media_id có sẵn (xác thực tồn tại trên Flow → tải local)."""
    entity = await _entity_or_404(eid)
    project = await _project_or_404(entity["project_id"])
    web = await media_store.ensure_local(body.media_id, project["id"])
    if not web:
        raise HTTPException(404, "media_id không hợp lệ hoặc không tồn tại trên Flow")
    await db.update("entity", eid, {
        "media_id": body.media_id, "primary_media_id": body.media_id,
        "image_path": web, "updated_at": db.now()})
    return await _entity_or_404(eid)


@router.post("/projects/{pid}/assets/generate-all")
async def generate_all_assets(pid: str, force: bool = False):
    """✦ Auto gen: sinh ảnh cho asset CHƯA có ảnh (idempotent). Tuần tự + throttle."""
    project = await _project_or_404(pid)
    rows = await db.query_all("SELECT * FROM entity WHERE project_id=?", (pid,))
    todo = [e for e in rows if force or not e.get("image_path")]
    done, errors = 0, []
    for i, e in enumerate(todo):
        try:
            await _generate_entity_image(e, project)
            done += 1
        except Exception as ex:
            errors.append({"entity": e["name"], "error": str(ex)[:200]})
        if i < len(todo) - 1:
            await asyncio.sleep(random.uniform(2, 6))  # rate-limit
    return {"requested": len(todo), "done": done, "errors": errors}


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
