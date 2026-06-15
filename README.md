# Flow Kit — Google Flow API Proxy

A minimal local server + Chrome extension that exposes Google Flow's media
generation API as plain HTTP endpoints on `http://127.0.0.1:8100`.

The Chrome extension captures the Google Flow bearer token, solves reCAPTCHA, and
makes the actual calls to `aisandbox-pa.googleapis.com`. The Python agent is a thin
FastAPI server that relays requests to the extension over a WebSocket and returns
the results. **No local database, no queue, no project/scene state** — it is a pure proxy.

## Components

- **`extension/`** — Chrome MV3 extension. Captures the bearer token, talks to Google
  Flow, connects to the agent over WebSocket (`ws://127.0.0.1:9222`), and delivers
  responses via HTTP callback (`POST /api/ext/callback`).
- **`agent/`** — FastAPI + WebSocket server.
  - `main.py` — app entry, extension WebSocket server, `/health`, `/api/ext/callback`
  - `api/flow.py` — all `/api/flow/*` endpoints
  - `services/flow_client.py` — relays requests to the extension and awaits responses
  - `services/headers.py` — randomized request headers
  - `config.py`, `models.json` — endpoints + model keys

## Run

```bash
pip install -r requirements.txt
python -m agent.main          # serves http://127.0.0.1:8100, WS on :9222
```

Load `extension/` as an unpacked extension in Chrome, then sign in to Google Flow.

## Pre-flight

```bash
curl -s http://127.0.0.1:8100/health
# {"status":"ok", "extension_connected": true, ...}
```

## Flow endpoints (`/api/flow/*`)

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/status` | Extension connection + flow key presence |
| GET  | `/credits` | User credits / paygate tier |
| POST | `/generate-image` | Generate image from prompt (+ optional character refs) |
| POST | `/generate-video` | Video from start image (+ optional end image) |
| POST | `/generate-video-refs` | Video from reference images (r2v) |
| POST | `/upscale-video` | Upscale a generated video |
| POST | `/check-status` | Poll async video/upscale operations |
| POST | `/edit-image` | Edit an existing image |
| POST | `/upload-image` | Upload a local image file → media_id |
| PATCH| `/change-displayname` | Rename a media/workflow item |
| GET  | `/media/{media_id}` | Media metadata + fresh signed URL |
| GET  | `/direct-media/{primary_media_id}` | Media by primary id |
| GET  | `/project/{project_id}` | Remote Flow project contents |
| GET  | `/projects` | List remote Flow projects |
| POST | `/refresh-urls/{project_id}` | (no-op stub; refresh happens via extension intercept) |

`media_id` is always UUID format (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

## License

MIT — see [LICENSE](LICENSE).
