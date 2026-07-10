# Flow Kit FastAPI API Guide

This document provides a detailed guide to the APIs exposed by the **Flow Kit** FastAPI server
(running by default at `http://127.0.0.1:8100`).

---

## System Architecture

Flow Kit acts as a bridge proxy for three main components:
1. **Google Flow Proxy**:
   * **FastAPI Server** (`http://127.0.0.1:8100`): Exposes REST APIs for clients.
   * **WebSocket Server** (`ws://127.0.0.1:9222`): The Chrome extension connects here.
   * **Chrome Extension (Google Flow)**: Receives commands over WebSocket, performs real requests on Google Flow using the browser's existing Cookie/Bearer Token `ya29.*`, and returns results via HTTP callback (`/api/ext/callback`). No `GOOGLE_API_KEY` is required.
2. **OmniVoice TTS Proxy**:
   * Proxies speech synthesis and voice cloning requests to an **OmniVoice** server running on Google Colab (via ngrok/localtunnel).
3. **AI Agent Proxy (CLI Subprocess)**:
   * Launches coding-agent CLIs (`codex`, `claude`, `antigravity`) as headless subprocesses to automate coding, prompt generation, file edits, and permission-bypass workflows.

---

## Health & System Endpoints

### 1. Health Check
Check the FastAPI server status and Chrome extension connection.

* **URL:** `/health`
* **Method:** `GET`
* **Response Ví dụ:**
  ```json
  {
    "status": "ok",
    "version": "0.2.0",
    "extension_connected": true,
    "ws": {
      "connected": true,
      "connects": 1,
      "disconnects": 0,
      "uptime_s": 120
    }
  }
  ```

### 2. Extension Status
Check whether the extension is connected and whether the Flow key has been captured.

* **URL:** `/api/flow/status`
* **Method:** `GET`
* **Response Ví dụ:**
  ```json
  {
    "connected": true,
    "flow_key_present": true
  }
  ```

### 3. Credits
Fetch the current credit balance for the Google Flow account.

* **URL:** `/api/flow/credits`
* **Method:** `GET`
* **Response Ví dụ:**
  ```json
  {
    "credits": 420
  }
  ```

---

## Project Management

These APIs let you manage Google Flow projects.

### 1. Create Project
Create an empty project to group generated images and videos.

* **URL:** `/api/flow/create-project`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `project_title` | `str` | Yes | | Project display name |
  | `tool_name` | `str` | No | `"PINHOLE"` | Google Flow tool name |

* **Request Example:**
  ```json
  {
    "project_title": "Marketing Q2"
  }
  ```

* **Response Ví dụ:**
  ```json
  {
    "result": {
      "data": {
        "json": {
          "result": {
            "projectId": "c4898aaf-606f-47cb-b61e-52b49053ac7e",
            "projectInfo": {
              "projectTitle": "Marketing Q2"
            }
          },
          "status": 200,
          "statusText": "OK"
        }
      }
    }
  }
  ```

### 2. List Projects
* **URL:** `/api/flow/projects`
* **Method:** `GET`
* **Description:** List all projects available on the Google Flow account.

### 3. Project Details
* **URL:** `/api/flow/project/{project_id}`
* **Method:** `GET`
* **Description:** Fetch detailed information and the workflow/media list for a specific project.

### 4. Delete Project
* **URL:** `/api/flow/delete-project/{project_id}`
* **Method:** `GET`
* **Description:** Delete the corresponding Google Flow project.

### 5. Change Project Cover
* **URL:** `/api/flow/change-project-cover/{project_id}/{media_id}`
* **Method:** `GET`
* **Description:** Set the image with `media_id` as the cover image for `project_id`.
* **Ví dụ:** `/api/flow/change-project-cover/7a2b3eb3-4cb0-41ee-9662-4dd4d7d85cd5/296074c9-4ac5-4e3a-92e0-f608b67512f1`

---

## Image Generation & Editing

### 1. Text-to-Image
Generate a new image from a text prompt.

* **URL:** `/api/flow/generate-image`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `prompt` | `str` | Yes | | Image description prompt |
  | `project_id` | `str` | Yes | | Project ID containing the image |
  | `aspect_ratio` | `str` | No | `"IMAGE_ASPECT_RATIO_PORTRAIT"` | Image aspect ratio (`IMAGE_ASPECT_RATIO_PORTRAIT`, `IMAGE_ASPECT_RATIO_LANDSCAPE`, `IMAGE_ASPECT_RATIO_SQUARE`) |
  | `user_paygate_tier` | `str` | No | `"PAYGATE_TIER_ONE"` | Account tier (`PAYGATE_TIER_ONE`, `PAYGATE_TIER_TWO`) |
  | `character_media_ids` | `list[str]` | No | `null` | IDs of sample character images to preserve identity |
  | `references` | `list[dict]` | No | `null` | Reference list containing `handle` (label) and `media_id` (e.g. `[{"handle": "Thao", "media_id": "..."}]`). The prompt can embed `{handle}` so the model maps the character correctly without confusion |
  | `image_model` | `str` | No | `null` | Override image model (e.g. `"GEM_PIX_2"`, `"NARWHAL"`) |

* **Request Example:**
  ```json
  {
    "prompt": "A cinematic photo of a red fox sitting in a snowy forest at sunrise, soft light",
    "project_id": "c4898aaf-606f-47cb-b61e-52b49053ac7e",
    "aspect_ratio": "IMAGE_ASPECT_RATIO_PORTRAIT"
  }
  ```

* **Response Ví dụ:**
  ```json
  {
    "media": [
      {
        "name": "b214b800-b61a-4753-9596-a918d830fd91",
        "image": {
          "generatedImage": {
            "mediaId": "b214b800-b61a-4753-9596-a918d830fd91",
            "fifeUrl": "https://flow-content.google/image/b214b800-b61a-4753-9596-a918d830fd91?Expires=...",
            "aspectRatio": "IMAGE_ASPECT_RATIO_PORTRAIT"
          }
        }
      }
    ],
    "workflows": [ ... ]
  }
  ```

### 2. Edit Image / Image-to-Image
Edit an existing image by applying a new prompt.

* **URL:** `/api/flow/edit-image`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `prompt` | `str` | Yes | | Edit instructions |
  | `source_media_id` | `str` | Yes | | Source image ID |
  | `project_id` | `str` | Yes | | Project ID |
  | `aspect_ratio` | `str` | No | `"IMAGE_ASPECT_RATIO_PORTRAIT"` | Image aspect ratio |
  | `user_paygate_tier` | `str` | No | `"PAYGATE_TIER_ONE"` | Account tier |

### 3. Upload Image
Upload a local image file to Google Flow for use as a video input or reference.

* **URL:** `/api/flow/upload-image`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `file_path` | `str` | Yes | | Absolute path to the image file on the server disk |
  | `project_id` | `str` | No | `""` | Project ID |
  | `file_name` | `str` | No | `"image.png"` | Display file name |

* **Request Example:**
  ```json
  {
    "file_path": "C:/Users/sp/Pictures/landscape.png",
    "project_id": "c4898aaf-606f-47cb-b61e-52b49053ac7e"
  }
  ```

* **Response Ví dụ:**
  ```json
  {
    "media_id": "e27b56f2-c9ad-4794-ad1e-cecd8abf4731",
    "raw": { ... }
  }
  ```

### 4. Rename Media Display Name
* **URL:** `/api/flow/change-displayname`
* **Method:** `PATCH`
* **Request Body (JSON):**
  ```json
  {
    "media_id": "b214b800-b61a-4753-9596-a918d830fd91",
    "project_id": "c4898aaf-606f-47cb-b61e-52b49053ac7e",
    "display_name": "Fox in snow v2"
  }
  ```

---

## 🎬 Tạo Video (Video Generation)

Sinh video trên Google Flow là tiến trình bất đồng bộ. API sẽ trả về thông tin danh sách các **`operations`** (tác vụ đang chạy). Bạn phải sử dụng API kiểm tra trạng thái để poll cho đến khi video hoàn thành.

### 1. Tạo Video Từ Ảnh Bắt Đầu (Image-to-Video)
Sinh video ngắn từ một hình ảnh tĩnh làm điểm xuất phát.

* **URL:** `/api/flow/generate-video`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `start_image_media_id` | `str` | Yes | | ID ảnh nguồn bắt đầu |
  | `prompt` | `str` | Yes | | Prompt mô tả hành động diễn ra trong video |
  | `project_id` | `str` | Yes | | ID project |
  | `scene_id` | `str` | Yes | | ID phân cảnh tự định nghĩa |
  | `aspect_ratio` | `str` | No | `"VIDEO_ASPECT_RATIO_PORTRAIT"` | Tỉ lệ video (`VIDEO_ASPECT_RATIO_PORTRAIT`, `VIDEO_ASPECT_RATIO_LANDSCAPE`) |
  | `end_image_media_id` | `str` | No | `null` | ID ảnh kết thúc (nếu có, để sinh video chuyển cảnh) |
  | `user_paygate_tier` | `str` | No | `"PAYGATE_TIER_ONE"` | Tier tài khoản |

* **Request Example:**
  ```json
  {
    "start_image_media_id": "b214b800-b61a-4753-9596-a918d830fd91",
    "prompt": "The fox slowly blinks and tilts its head, snow gently falling around it",
    "project_id": "c4898aaf-606f-47cb-b61e-52b49053ac7e",
    "scene_id": "scene_01"
  }
  ```

### 2. Reference-to-Video
Generate a video using multiple images as references.

* **URL:** `/api/flow/generate-video-refs`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `reference_media_ids` | `list[str]` | Yes | | Reference image IDs |
  | `prompt` | `str` | Yes | | Action prompt |
  | `project_id` | `str` | Yes | | Project ID |
  | `scene_id` | `str` | Yes | | Custom scene ID |
  | `aspect_ratio` | `str` | No | `"VIDEO_ASPECT_RATIO_PORTRAIT"` | Video aspect ratio |
  | `user_paygate_tier` | `str` | No | `"PAYGATE_TIER_ONE"` | Account tier |
  | `references` | `list[dict]` | No | `null` | References containing `handle` and `media_id` (e.g. `[{"handle": "Thao", "media_id": "..."}]`). Supports `{handle}` in the prompt to map entities accurately |
  | `video_model` | `str` | No | `null` | Override video model (e.g. `"veo_3_1_r2v_lite"`) |

### 3. Omni Flash Video Generation
Generate reference-based video (r2v) using **Omni Flash** with flexible durations (4, 6, 8, 10 seconds). At least 1 reference image is required, and the aspect ratio must be `VIDEO_ASPECT_RATIO_PORTRAIT` or `VIDEO_ASPECT_RATIO_LANDSCAPE`.

* **URL:** `/api/flow/generate-video-omni`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `prompt` | `str` | Yes | | Action prompt |
  | `project_id` | `str` | Yes | | Project ID |
  | `reference_media_ids` | `list[str]` | Yes | | Reference image IDs |
  | `duration_s` | `int` | No | `8` | Video length in seconds (supports `4`, `6`, `8`, `10`) |
  | `aspect_ratio` | `str` | No | `"VIDEO_ASPECT_RATIO_LANDSCAPE"` | Video aspect ratio (`VIDEO_ASPECT_RATIO_PORTRAIT` or `VIDEO_ASPECT_RATIO_LANDSCAPE`) |
  | `user_paygate_tier` | `str` | No | `"PAYGATE_TIER_ONE"` | Account tier |
  | `references` | `list[dict]` | No | `null` | References with `handle` and `media_id` used to tag `{handle}` in the prompt |

* **Request Example:**
  ```json
  {
    "prompt": "{fox} running happily in the snow, slow motion",
    "project_id": "c4898aaf-606f-47cb-b61e-52b49053ac7e",
    "reference_media_ids": ["b214b800-b61a-4753-9596-a918d830fd91"],
    "duration_s": 6,
    "aspect_ratio": "VIDEO_ASPECT_RATIO_LANDSCAPE",
    "references": [
      {
        "handle": "fox",
        "media_id": "b214b800-b61a-4753-9596-a918d830fd91"
      }
    ]
  }
  ```

### 4. Upscale Video
Increase video quality/resolution up to 4K.

* **URL:** `/api/flow/upscale/video`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `media_id` | `str` | Yes | | Video ID to upscale |
  | `scene_id` | `str` | Yes | | Scene ID |
  | `aspect_ratio` | `str` | No | `"VIDEO_ASPECT_RATIO_PORTRAIT"` | Video aspect ratio |
  | `resolution` | `str` | No | `"VIDEO_RESOLUTION_4K"` | Desired resolution (`VIDEO_RESOLUTION_4K`, `VIDEO_RESOLUTION_1080P`) |

---

## Operations Status

### 1. Check Running Operations
Use this to check whether video generation or upscale has completed.

* **URL:** `/api/flow/check-status`
* **Method:** `POST`
* **Request Body (JSON):**
  ```json
  {
    "operations": [
      {
        "name": "operations/c4898aaf-606f-47cb-b61e-52b49053ac7e/folders/scene_01/operations/123456"
      }
    ]
  }
  ```

---

## Direct Media URL

The image and video URLs returned by Google Flow usually contain short-lived GCS signatures (typically expiring after a few hours). This API fetches the latest metadata and direct download URL.

### 1. Get the Latest Direct Link & Metadata
Fetch the latest signed download URL and metadata for an image or video.

* **URL:** `/api/flow/media/{primary_media_id}`
* **Method:** `GET`
* **Parameters:** `primary_media_id` (image/video file ID)
* **Response Ví dụ:**
  ```json
  {
    "url": "https://flow-content.google/video/e27b56f2-c9ad-4794-ad1e-cecd8abf4731?Expires=1781638324&KeyName=labs-flow-prod-cdn-key&Signature=eRme-...",
    "redirected": true
  }
  ```

---

## Voice Synthesis & Cloning (OmniVoice TTS Proxy)

These APIs forward speech synthesis requests to an **OmniVoice** server running on Google Colab. Because the Colab URL (via ngrok/localtunnel) changes each session, you can configure it at runtime via `/api/tts/config`.

### 1. View Current OmniVoice Base URL
* **URL:** `/api/tts/config`
* **Method:** `GET`
* **Response Ví dụ:**
  ```json
  {
    "base_url": "https://random-subdomain.ngrok-free.app"
  }
  ```

### 2. Set OmniVoice Base URL
Update the public Colab URL at runtime when starting a new session.

* **URL:** `/api/tts/config`
* **Method:** `PUT`
* **Request Body (JSON):**
  ```json
  {
    "base_url": "https://your-new-colab-url.ngrok-free.app"
  }
  ```

### 3. Check OmniVoice Health
See whether the Colab OmniVoice server is ready and whether the TTS model is loaded.

* **URL:** `/api/tts/health`
* **Method:** `GET`

### 4. Synthesize Text-to-Speech
Convert text into a speech file (base64 WAV).

* **URL:** `/api/tts/synthesize`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `text` | `str` | Yes | | Text to be spoken |
  | `voice_id` | `int` | No | `0` | ID of the saved custom voice |
  | `voice` | `str` | No | `null` | Base64 WAV/MP3 sample audio for dynamic cloning |
  | `speed` | `float` | No | `1.0` | Voice speaking speed |
  | `instruct` | `str` | No | `null` | Emotion/tone instructions (e.g. "excited", "whispering") |

* **Request Example (using a saved voice):**
  ```json
  {
    "text": "Hello, welcome to the Flow Kit automation system.",
    "voice_id": 1,
    "speed": 1.05
  }
  ```

* **Request Example (direct dynamic cloning):**
  ```json
  {
    "text": "This voice is cloned directly from the attached audio file.",
    "voice": "UklGRu...[base64-wav-data]...",
    "speed": 1.0
  }
  ```

* **Response Example:**
  ```json
  {
    "audio": "UklGRu...[base64-wav-output]...",
    "status": "success",
    "msg": "Synthesis completed successfully"
  }
  ```

### 5. List Registered Custom Voices
Get the list of sample voices you have added to OmniVoice.

* **URL:** `/api/tts/voices`
* **Method:** `GET`

### 6. Add a New Custom Voice
* **URL:** `/api/tts/voices`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `voice` | `str` | Yes | | Source WAV/MP3 audio file in base64 |
  | `title` | `str` | Yes | | Voice label |
  | `desciption` | `str` | No | `null` | Voice description (note the exact field name `desciption`) |

### 7. Delete a Custom Voice
* **URL:** `/api/tts/voices/remove`
* **Method:** `POST`
* **Request Body (JSON):**
  ```json
  {
    "voice_id": 2
  }
  ```

---

## Headless AI Agents (AI Agent Proxy)

These APIs let you call coding-agent CLIs (Codex, Claude Code, Antigravity, ...) over HTTP to automate tasks such as writing scripts, generating prompts, and editing files in a working directory. The agent runs headlessly (no UI, non-interactive), bypasses permission prompts by default, and can write files and run commands freely (exposed only on localhost).

### 1. List Supported Agents
Get the configured agents and the installed binary status on the machine.

* **URL:** `/api/agent/agents`
* **Method:** `GET`
* **Response Ví dụ:**
  ```json
  {
    "skip_permissions_default": true,
    "timeout_default": 600.0,
    "agents": [
      {
        "key": "codex",
        "bin": "codex",
        "available": true,
        "path": "C:\\Users\\sp\\AppData\\Roaming\\npm\\codex.cmd",
        "prompt_mode": "stdin",
        "supports_model": true,
        "pty": false
      },
      {
        "key": "claude",
        "bin": "claude",
        "available": true,
        "path": "C:\\Users\\sp\\AppData\\Roaming\\npm\\claude.cmd",
        "prompt_mode": "stdin",
        "supports_model": true,
        "pty": false
      },
      {
        "key": "antigravity",
        "bin": "agy",
        "available": true,
        "path": "C:\\Users\\sp\\AppData\\Local\\Programs\\Python\\Python310\\Scripts\\agy.exe",
        "prompt_mode": "arg",
        "supports_model": true,
        "pty": true
      }
    ]
  }
  ```

### 2. Run a Headless Agent
Ask an agent to execute a task in a specific working directory.

* **URL:** `/api/agent/run`
* **Method:** `POST`
* **Request Body (JSON):**
  | Field | Type | Required | Default | Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `agent` | `str` | Yes | | Agent key (`codex`, `claude`, `antigravity`) |
  | `prompt` | `str` | Yes | | Task prompt for the agent |
  | `cwd` | `str` | No | `null` | Agent working directory (defaults to the server's current directory) |
  | `model` | `str` | No | `null` | Override the agent CLI model |
  | `timeout` | `float` | No | `600.0` | Runtime limit in seconds; exceeding it kills the process and returns 504 |
  | `extra_args` | `list[str]` | No | `null` | Additional CLI flags passed directly to the CLI |
  | `skip_permissions` | `bool` | No | `true` | Whether to bypass permission prompts |
  | `env` | `dict[str, str]` | No | `null` | Extra environment variables for the agent process |

* **Request Example:**
  ```json
  {
    "agent": "codex",
    "prompt": "Tóm tắt file README.md trong 3 gạch đầu dòng ngắn gọn.",
    "cwd": "D:/youtube/editor/flowkit"
  }
  ```

* **Response Example:**
  ```json
  {
    "ok": true,
    "agent": "codex",
    "exit_code": 0,
    "stdout": "1. Flow Kit provides a proxy layer for Google Flow and OmniVoice TTS.\n2. The extension connects over WebSocket for commands and HTTP callbacks.\n3. The built-in AI agent CLI automates coding tasks.",
    "stderr": "",
    "duration": 5.42,
    "cwd": "D:/youtube/editor/flowkit"
  }
  ```

> [!NOTE]
> * **Log in first:** The CLIs (`codex`, `claude`, and `agy`) must already be authenticated/authorized on the server machine before calling the API. If they are not logged in, the process may hang and eventually time out (504).
> * **PTY mode:** For TUI-style agent CLIs such as Antigravity (`agy`), the server runs the CLI under a pseudo-terminal (ConPTY on Windows / `pty` on Unix) to capture the rendered output and strip ANSI color codes before returning it. Install `pywinpty` on Windows for this to work reliably.

---

## Sample Python Client

Below is a simple Python example for interacting with the Flow Kit APIs, including TTS and AI agents:

```python
import time
import requests

BASE_URL = "http://127.0.0.1:8100"

# 1. Configure the OmniVoice URL on Colab
tts_config = requests.put(
    f"{BASE_URL}/api/tts/config",
    json={"base_url": "https://my-colab-tunnel.ngrok-free.app"}
).json()
print(f"-> OmniVoice URL configured: {tts_config['base_url']}")

# 2. Synthesize voice from text
tts_res = requests.post(
    f"{BASE_URL}/api/tts/synthesize",
    json={
        "text": "Welcome to the world of artificial intelligence.",
        "voice_id": 0,
        "speed": 1.0
    }
).json()

if tts_res.get("status") == "success":
    print("-> Voice synthesis succeeded!")
    # tts_res["audio"] contains the output WAV as base64

# 3. Ask the AI Agent (Codex) to summarize a file
agent_res = requests.post(
    f"{BASE_URL}/api/agent/run",
    json={
        "agent": "codex",
        "prompt": "Summarize README.md in 3 bullet points",
        "cwd": "d:/youtube/editor/flowkit"
    }
).json()

if agent_res.get("ok"):
    print("-> Agent responded successfully:")
    print(agent_res.get("stdout"))
else:
    print(f"-> Agent run error: {agent_res.get('stderr') or 'timeout/error'}")
```
