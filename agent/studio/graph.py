"""Node-graph executor for the Studio Node Editor (video-app.md §2.9).

A graph is {nodes:[{id,type,data}], edges:[{source,target}]}. We topo-sort, run each
node (mapping to existing Flow/agent ops), and feed each node the merged outputs of its
upstream nodes. The Output node applies the final media to the target shot/entity.

Self-contained (calls flow_client/media_store directly) to avoid importing the router.
"""
import asyncio
import json
import logging
import time as _t

from agent.config import IMAGE_MODELS
from agent.services.flow_client import get_flow_client
from agent.studio import db, media_store, brain

logger = logging.getLogger(__name__)


class GraphError(Exception):
    pass


def _topo_sort(nodes: list[dict], edges: list[dict]) -> list[dict]:
    by_id = {n["id"]: n for n in nodes}
    indeg = {n["id"]: 0 for n in nodes}
    adj: dict[str, list[str]] = {n["id"]: [] for n in nodes}
    for e in edges:
        s, t = e.get("source"), e.get("target")
        if s in by_id and t in by_id:
            adj[s].append(t)
            indeg[t] += 1
    queue = [nid for nid, d in indeg.items() if d == 0]
    order = []
    while queue:
        nid = queue.pop(0)
        order.append(by_id[nid])
        for nb in adj[nid]:
            indeg[nb] -= 1
            if indeg[nb] == 0:
                queue.append(nb)
    if len(order) != len(nodes):
        raise GraphError("Đồ thị có chu trình (cycle)")
    return order


def _upstream_ids(node_id: str, edges: list[dict]) -> list[str]:
    return [e["source"] for e in edges if e.get("target") == node_id]


def _img_model(project: dict) -> str | None:
    name = project.get("image_model")
    return IMAGE_MODELS.get(name, name) if name else None


def _img_aspect(project: dict) -> str:
    return (project.get("aspect_ratio") or "").replace(
        "VIDEO_ASPECT_RATIO_", "IMAGE_ASPECT_RATIO_") or "IMAGE_ASPECT_RATIO_LANDSCAPE"


async def _poll_video(client, media_id, scene_key, timeout=240, interval=8):
    op = {"operation": {"name": media_id}, "sceneId": scene_key}
    deadline = _t.monotonic() + timeout
    while _t.monotonic() < deadline:
        await asyncio.sleep(interval)
        st = await client.check_video_status([op])
        data = st.get("data", st)
        ops = data.get("operations") or []
        if ops:
            v = ops[0].get("operation", {}).get("metadata", {}).get("video", {})
            if v.get("fifeUrl"):
                return v["fifeUrl"]
    return None


async def run_graph(graph: dict, target: dict, project: dict, kind: str) -> dict:
    """Execute the graph; return {media_id, image_path|video_path} of the Output."""
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []
    if not nodes:
        raise GraphError("Đồ thị rỗng")
    client = get_flow_client()
    if not client.connected:
        raise GraphError("Extension chưa kết nối")

    outputs: dict[str, dict] = {}        # node_id -> output dict
    pid = project["id"]
    flow_pid = project["flow_project_id"]
    final = None

    def merged_inputs(nid):
        merged = {"text": None, "references": [], "media_id": None, "ext": "png"}
        for up in _upstream_ids(nid, edges):
            o = outputs.get(up, {})
            if o.get("text"):
                merged["text"] = o["text"]
            if o.get("references"):
                merged["references"] = o["references"]
            if o.get("media_id"):
                merged["media_id"] = o["media_id"]
                merged["ext"] = o.get("ext", "png")
        return merged

    for node in _topo_sort(nodes, edges):
        t = node.get("type")
        data = node.get("data") or {}
        nid = node["id"]
        inp = merged_inputs(nid)

        if t == "prompt":
            outputs[nid] = {"text": data.get("text", "")}

        elif t == "refs":
            ids = data.get("entity_ids") or []
            rows = await db.query_all("SELECT * FROM entity WHERE project_id=?", (pid,))
            by_id = {r["id"]: r for r in rows}
            refs = [{"handle": by_id[i]["name"], "media_id": by_id[i]["media_id"]}
                    for i in ids if by_id.get(i) and by_id[i].get("media_id")][:10]
            outputs[nid] = {"references": refs}

        elif t == "image":
            body = inp["text"] or data.get("text") or ""
            res = await client.generate_images(
                prompt=brain.compose_prompt(project, body), project_id=flow_pid,
                aspect_ratio=_img_aspect(project),
                user_paygate_tier=project["paygate_tier"],
                references=inp["references"] or None, image_model=_img_model(project))
            if res.get("error"):
                raise GraphError(str(res["error"]))
            p = res.get("data", res)
            mid = (p.get("media") or [{}])[0].get("image", {}).get("generatedImage", {}).get("mediaId")
            web = await media_store.ensure_local(mid, pid) if mid else None
            outputs[nid] = {"media_id": mid, "web": web, "ext": "png"}
            final = outputs[nid]

        elif t == "editImage":
            src = inp["media_id"]
            if not src:
                raise GraphError("editImage cần ảnh nguồn")
            res = await client.edit_image(
                inp["text"] or data.get("text") or "", src, flow_pid,
                aspect_ratio=_img_aspect(project), user_paygate_tier=project["paygate_tier"])
            if res.get("error"):
                raise GraphError(str(res["error"]))
            p = res.get("data", res)
            mid = (p.get("media") or [{}])[0].get("image", {}).get("generatedImage", {}).get("mediaId")
            web = await media_store.ensure_local(mid, pid) if mid else None
            outputs[nid] = {"media_id": mid, "web": web, "ext": "png"}
            final = outputs[nid]

        elif t == "video":
            src = inp["media_id"]
            if not src:
                raise GraphError("video cần ảnh start")
            res = await client.generate_video(
                start_image_media_id=src, prompt=inp["text"] or data.get("text") or "",
                project_id=flow_pid, scene_id=target["id"],
                aspect_ratio=project["aspect_ratio"], user_paygate_tier=project["paygate_tier"])
            if res.get("error"):
                raise GraphError(str(res["error"]))
            p = res.get("data", res)
            mid = (p.get("media") or [{}])[0].get("name")
            url = await _poll_video(client, mid, target["id"])
            if not url:
                raise GraphError("Video timeout")
            web = await media_store.save_from_url(mid, pid, "mp4", url)
            outputs[nid] = {"media_id": mid, "web": web, "ext": "mp4"}
            final = outputs[nid]

        elif t == "output":
            if inp["media_id"]:
                final = {"media_id": inp["media_id"], "web": None, "ext": inp["ext"]}

        else:
            logger.warning("Unknown node type: %s", t)

    if not final or not final.get("media_id"):
        raise GraphError("Đồ thị không tạo ra media nào")

    # apply to target
    web = final.get("web") or await media_store.ensure_local(
        final["media_id"], pid, final.get("ext", "png"))
    if kind == "entity":
        await db.update("entity", target["id"], {
            "media_id": final["media_id"], "primary_media_id": final["media_id"],
            "image_path": web, "updated_at": db.now()})
    else:
        col = "video" if final.get("ext") == "mp4" else "image"
        await db.update("shot", target["id"], {
            f"{col}_media_id": final["media_id"], f"{col}_primary_id": final["media_id"],
            f"{col}_path": web, "updated_at": db.now()})
    return {"media_id": final["media_id"], "path": web, "ext": final.get("ext", "png")}
