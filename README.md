# Flow Kit - Google Flow API Proxy + Flow Studio

A local server (FastAPI + WebSocket) paired with a Chrome extension turns the **Google Flow**
image/video APIs into ordinary HTTP endpoints at `http://127.0.0.1:8100`. On top of that
proxy layer sits **Flow Studio** - a web app for building videos from an idea:
screenplay → characters/locations → storyboard → shot → assemble & export.

- **Flow proxy core** is stateless: it forwards requests to the extension and returns the result.
- **Flow Studio** is the stateful part - it stores projects/scenes/shots in SQLite
  (`agent/studio.db`), caches media in `./media/`, and renders outputs to `./studio_media/`.

The Chrome extension handles the Google Flow bearer token, solves reCAPTCHA, and calls
`aisandbox-pa.googleapis.com` directly. The Python agent is just a thin WebSocket bridge.

## Components

- **`extension/`** — MV3 Chrome extension. Captures the bearer token, talks to Google Flow,
  connects to the agent over WebSocket (`ws://127.0.0.1:9222`), and returns results via HTTP callback
  (`POST /api/ext/callback`).
- **`agent/`** — FastAPI + WebSocket server.
  - `main.py` — app entry point, extension WebSocket, `/health`, `/api/ext/callback`, and the mounted SPA + static media.
  - `api/flow.py` — all `/api/flow/*` endpoints (relay to Flow).
  - `api/tts.py` — `/api/tts/*`, proxy to an OmniVoice server running on Google Colab.
  - `api/ai_agent.py` — `/api/agent/*`, runs headless coding-agent CLIs.
  - `api/studio.py` — `/api/studio/*`, the full Flow Studio orchestration layer.
  - `studio/` — Studio business logic: `db.py` (SQLite + migration), `brain.py` (AI prompts),
    `assembler.py` (ffmpeg video assembly), `davinci_xml.py` (Resolve timeline export),
    `vntext.py` (Vietnamese normalization before TTS), `media_store.py`, `graph.py`.
  - `services/flow_client.py` — relays requests to the extension and waits for responses.
  - `services/headers.py` — randomized request headers.
  - `config.py`, `models.json` — endpoint definitions and model keys.
- **`webapp/`** — React + Vite + Tailwind SPA for Flow Studio.

## Install & Run

```bash
pip install -r requirements.txt

# (first time / after editing the webapp) build the SPA - the agent serves it
cd webapp && npm install && npm run build && cd ..

# run the server: HTTP on :8100, extension WebSocket on :9222
python -m agent.main
```

Open <http://127.0.0.1:8100>. Load `extension/` as an *unpacked extension* in Chrome and
sign in to Google Flow.

Dev mode has hot reload: `cd webapp && npm run dev` (it proxies `/api` and `/media` back to `:8100`).

## Quick Check (Pre-flight)

```bash
curl -s http://127.0.0.1:8100/health
# {"status":"ok", "extension_connected": true, ...}
```

`extension_connected: false` means the extension is not connected - open Google Flow in Chrome with
the extension loaded. All media generation must go through the connected extension.

## Environment Requirements

| For | Requirement |
|---------|---------|
| Flow image/video generation | Connected Chrome extension + signed in to Google Flow |
| Video assembly & export | `ffmpeg` + `ffprobe` in PATH |
| Voiceover (TTS) | OmniVoice server URL configured (see TTS) |
| AI agent | `codex`, `claude` and/or `agy` logged in on the server machine |

`GOOGLE_API_KEY` is optional - auth to `aisandbox-pa.googleapis.com` is handled by the
extension bearer token. Leave it empty (default) to omit the `?key=` param.

---

## Flow Studio

The video-building pipeline uses the APIs below, with an AI agent as the "brain" for
scripts/prompts, a **Node Editor** for customizable pipelines, and **DaVinci Resolve XML** export.

**Workflow:** Idea → screenplay (Fountain) → extract characters/locations/props (assets with
reference images) → storyboard (split into frames) → shots (frame images + video) → assemble → publish.

**Key capabilities:**

- **Storytelling mode (audio-first):** each scene gets a continuous narration, **the whole scene is
  synthesized in one pass** (preserving emotion, no fragmentation), then visual beats are mapped to
  the exact timeline of the real audio ("as the narration progresses, so do the visuals").
- **Vietnamese normalization before TTS** (`vntext.py`): converts numbers to words, expands abbreviations,
  times, dates, currency, and special characters (`-`, `_`, `%`...) into a speakable form before segmenting for TTS.
- **Per-project language options:** narration/screenplay language (`script_lang`, default English) and
  written text in images (`image_text_lang`); foreign names/terms/brands are preserved.
- **Cinematic shot prompts:** every shot is forced to specify shot size, camera angle/height, focal length
  + DOF, lighting, and layout - plus a separate **motion** layer for video (camera movement, rack focus,
  lighting/smoke changes over time) in true image-to-video style.
- **Long videos >8s:** beats longer than a Veo clip (~8s) are rendered into multiple i2v clips in sequence
  (the next clip starts on the final frame of the previous one) and then concatenated into one continuous shot.
- **Timed keyword captions:** key phrases are burned into the video exactly when narration reaches them, and
  also exported into XML/SRT for Resolve.
- **Background music:** upload a music file for the project - during assembly, it loops to fill the full
  duration and is mixed **under** narration at a configurable volume (narration remains unchanged). If no
  music is provided, it is skipped.
- **DaVinci Resolve XML export (FCP7/xmeml):** video track + title track (captions) + audio track (scene narration),
  plus `captions.srt` (works in Resolve Free).
- **Node Editor:** customizable graph for assets/shots (create image → edit image → create video), with
  "⚡ Quick Gen" on each node and "🔒 Lock" to keep a media result when rerunning the whole pipeline.

Toàn bộ endpoint nằm dưới `/api/studio/*`. Nhóm chính (chi tiết trong
[agent/api/studio.py](agent/api/studio.py)):

| Nhóm | Endpoint tiêu biểu |
|------|--------------------|
| Hệ thống | `GET /health`, `GET /options`, `GET /credits`, `GET/PUT /settings` |
| Dự án | `GET/POST /projects`, `GET/PATCH/DELETE /projects/{pid}`, `PUT /projects/{pid}/cover` |
| Kịch bản | `POST /projects/{pid}/script/generate`, `PUT /projects/{pid}/script`, `POST …/script/chat`, `GET …/scenes` |
| Nhân vật/Bối cảnh | `GET/POST /projects/{pid}/entities`, `…/entities/extract`, `…/assets/generate-all`, `PATCH/DELETE /entities/{eid}`, `…/entities/{eid}/generate` |
| Thư viện asset | `GET /library/entities`, `GET /library/all-media`, `…/entities/import`, `…/entities/import-media` |
| Storyboard | `POST /projects/{pid}/storyboard/generate-all`, `…/storyboard/autofill-all`, `POST /scenes/{sid}/storyboard/autofill`, `GET /projects/{pid}/storyboard/export` |
| Shot | `GET/POST /scenes/{sid}/shots`, `PATCH/DELETE /shots/{sid}`, `…/shots/{sid}/image`, `…/video`, `…/prompts`, `…/upscale`, `…/insert`, `POST /projects/{pid}/shots/generate-all` |
| Storytelling | `POST /scenes/{sid}/beats`, `POST /projects/{pid}/voiceover`, `POST /shots/{sid}/narration` |
| Node graph | `GET/PUT /shots/{sid}/graph`, `POST /shots/{sid}/graph/run` (tương tự cho `/entities/{eid}/graph`) |
| Ghép & Xuất | `POST /projects/{pid}/assemble`, `…/assemble-images`, `…/export`, `…/export/davinci-xml`, `GET /fonts` |
| Nhạc nền | `POST /projects/{pid}/bgm` (upload), `DELETE /projects/{pid}/bgm` |

---

## Endpoint Flow (`/api/flow/*`)

| Method | Path | Mục đích |
|--------|------|----------|
| GET  | `/status` | Trạng thái kết nối extension + có flow key chưa |
| GET  | `/credits` | Credit người dùng / paygate tier |
| POST | `/create-project` | Tạo project mới trên Flow |
| GET  | `/delete-project/{project_id}` | Xoá project Flow |
| GET  | `/change-project-cover/{project_id}/{media_id}` | Đổi ảnh bìa project |
| POST | `/generate-image` | Sinh ảnh từ prompt (+ ref nhân vật tuỳ chọn) |
| POST | `/edit-image` | Sửa một ảnh đã có |
| POST | `/upload-image` | Upload ảnh cục bộ → `media_id` |
| POST | `/generate-video` | Video i2v từ ảnh đầu (+ ảnh cuối tuỳ chọn, để nối clip) |
| POST | `/generate-video-omni` | Video r2v (Omni Flash, `abra_r2v_{4,6,8,10}s`) |
| POST | `/generate-video-refs` | Video từ các ảnh tham chiếu |
| POST | `/upscale/video` | Upscale một video đã sinh |
| POST | `/check-status` | Poll operation async (video/upscale) |
| PATCH| `/change-displayname` | Đổi tên một media/workflow item |
| GET  | `/media/{primary_media_id}` | Metadata media + URL ký tươi |
| GET  | `/project/{project_id}` | Nội dung một project Flow từ xa |
| GET  | `/projects` | Liệt kê project Flow từ xa |

`media_id` luôn ở dạng UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`), không bao giờ `CAMS…`.

## Endpoint TTS (`/api/tts/*`)

Proxy tới một server [OmniVoice](https://github.com/k2-fsa) chạy trên Google Colab. URL
tunnel của Colab (ngrok/localtunnel) đổi mỗi phiên, nên đặt lúc chạy bằng
`PUT /api/tts/config` (hoặc biến môi trường `OMNIVOICE_BASE_URL`). URL được **lưu lại**
trong DB nên không mất khi khởi động lại server.

| Method | Path | Mục đích |
|--------|------|----------|
| GET  | `/config` | Xem URL OmniVoice hiện tại |
| PUT  | `/config` | Đặt URL — `{"base_url": "https://<id>.ngrok-free.app"}` |
| GET  | `/health` | Trạng thái server OmniVoice + nạp model |
| POST | `/synthesize` | TTS — `{text, voice_id?, voice?, speed?, instruct?}` → `{audio: base64 WAV, …}` |
| GET  | `/voices` | Liệt kê voice đã đăng ký |
| POST | `/voices` | Thêm voice clone — `{voice: base64, title, desciption?}` |
| POST | `/voices/remove` | Xoá voice — `{voice_id}` |

```bash
# trỏ tới tunnel Colab đang chạy, rồi tổng hợp giọng
curl -X PUT http://127.0.0.1:8100/api/tts/config \
  -H 'Content-Type: application/json' -d '{"base_url":"https://abc123.ngrok-free.app"}'
curl -X POST http://127.0.0.1:8100/api/tts/synthesize \
  -H 'Content-Type: application/json' -d '{"text":"Xin chào","voice_id":0}'
```

## Endpoint AI Agent (`/api/agent/*`)

Chạy các coding-agent CLI (Codex, Claude Code, Antigravity, …) headless như subprocess để tự động
hoá: viết script, sinh prompt, sửa file trong một thư mục làm việc. Agent chạy
non-interactive, **mặc định bypass permission** (ghi file / chạy lệnh tự do) — chỉ expose
trên `127.0.0.1`.

| Method | Path | Mục đích |
|--------|------|----------|
| GET  | `/agents` | Liệt kê agent đã cấu hình + binary có sẵn trên máy hay không |
| POST | `/run` | Chạy agent headless → `{ok, exit_code, stdout, stderr, duration}` |

Body `POST /run`:

| Trường | Mặc định | Mô tả |
|--------|----------|-------|
| `agent` | — | Key trong registry (`codex`, `claude`, `antigravity`) |
| `prompt` | — | Nội dung giao cho agent |
| `cwd` | thư mục hiện tại | Thư mục làm việc của agent |
| `model` | mặc định CLI | Override model key |
| `timeout` | `AGENT_CLI_TIMEOUT` (600s) | Giới hạn thời gian; quá thì kill + 504 |
| `extra_args` | `[]` | Cờ thêm truyền thẳng cho CLI |
| `skip_permissions` | `AGENT_SKIP_PERMISSIONS` (true) | Override bypass permission |
| `env` | `{}` | Biến môi trường thêm cho tiến trình |

```bash
# Xem agent nào đã cài
curl -s http://127.0.0.1:8100/api/agent/agents

# Giao việc cho Codex trong một thư mục
curl -X POST http://127.0.0.1:8100/api/agent/run \
  -H 'Content-Type: application/json' \
  -d '{"agent":"codex","prompt":"Tóm tắt README.md trong 3 gạch đầu dòng","cwd":"D:/youtube/editor/flowkit"}'
```

Available agents: `codex` (Codex CLI, `codex exec`, prompt via stdin), `claude` (Claude Code,
prompt via stdin), and `antigravity` (binary `agy`, syntax
`agy -p "<prompt>" --model X --dangerously-skip-permissions`). The CLIs must be
logged in on the server machine; otherwise the agent can hang until timeout (504).

Antigravity (`agy`) is a **TUI** app: in print mode it only renders to a real terminal,
so piping stdout yields nothing. The server runs `agy` under a **pseudo-PTY** (ConPTY via
`pywinpty` on Windows, `pty` on POSIX), strips ANSI, and returns plain text. This is
controlled by the `pty` flag in the registry. Install `pywinpty` (already listed in
`requirements.txt`) to use this agent on Windows.

Registry agent + cờ mặc định nằm ở [`agent/config.py`](agent/config.py) (`AI_AGENTS`),
override được hết qua env (`AGENT_CODEX_BIN`, `AGENT_CODEX_ARGS`, `AGENT_CLAUDE_BIN`, `AGENT_ANTIGRAVITY_BIN`,
`AGENT_ANTIGRAVITY_ARGS`, `AGENT_CLI_TIMEOUT`, `AGENT_SKIP_PERMISSIONS`, …).

## Repo gốc
https://github.com/crisng95/flowkit

## Giấy phép

MIT — xem [LICENSE](LICENSE).
