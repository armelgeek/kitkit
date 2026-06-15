"""Thử tạo 1 project + 1 ảnh QUA HTTP API — KHÔNG dùng GOOGLE_API_KEY.

Mục đích: chứng minh các API Flow vẫn chạy mà không cần GOOGLE_API_KEY
(xác thực do extension lo bằng Bearer token ya29.*, key chỉ là query ?key=
tùy chọn — đã được bỏ khi GOOGLE_API_KEY rỗng).

Cách chạy để test "không key":
  1. Tắt server đang chạy.
  2. Khởi động lại server với key rỗng (PowerShell):
         $env:GOOGLE_API_KEY = ""
         python -m agent.main
     Mở Google Flow trong Chrome để extension kết nối lại (extension_connected: true).
  3. Chạy:  python test.py

Script chỉ gọi HTTP, không import gì từ agent — nên nó dùng đúng cấu hình
mà server đang chạy. Nếu server start với key rỗng và script này thành công
=> GOOGLE_API_KEY là KHÔNG cần thiết.
"""
import json
import sys
import urllib.request
import urllib.error

# Windows console mặc định cp1252 → ép UTF-8 để in được tiếng Việt
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE = "http://127.0.0.1:8100"
PROMPT = "A cinematic photo of a red fox sitting in a snowy forest at sunrise, soft light"


def _req(method, path, payload=None, timeout=300):
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            body = json.loads(body)
        except Exception:
            pass
        return e.code, body


def _find_first(obj, key):
    """Tìm đệ quy giá trị đầu tiên ứng với `key` trong dict/list lồng nhau."""
    if isinstance(obj, dict):
        if key in obj and isinstance(obj[key], (str, int)):
            return obj[key]
        for v in obj.values():
            found = _find_first(v, key)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _find_first(v, key)
            if found is not None:
                return found
    return None


def _find_image_url(obj):
    """Tìm URL ảnh đầu tiên (fifeUrl / servingUri / bất kỳ field *url* dạng http)."""
    for k in ("fifeUrl", "servingUri", "imageUrl", "url"):
        v = _find_first(obj, k)
        if isinstance(v, str) and v.startswith("http"):
            return v
    return None


def main():
    # 0) Pre-flight
    status, health = _req("GET", "/health", timeout=10)
    print("== /health ==", status, json.dumps(health, ensure_ascii=False))
    if not (isinstance(health, dict) and health.get("extension_connected")):
        print("!! Extension chưa kết nối. Mở Google Flow trong Chrome rồi chạy lại.")
        sys.exit(1)

    # 1) Tạo project (tRPC — không bao giờ dùng GOOGLE_API_KEY)
    status, proj = _req("POST", "/api/flow/create-project",
                        {"project_title": "test-no-api-key"})
    print("\n== create-project ==", status)
    print(json.dumps(proj, ensure_ascii=False)[:1500])
    if status >= 400:
        print("!! Tạo project thất bại.")
        sys.exit(1)
    project_id = _find_first(proj, "projectId") or _find_first(proj, "id")
    if not project_id:
        print("!! Không tìm thấy projectId trong response (xem JSON ở trên).")
        sys.exit(1)
    print("-> project_id =", project_id)

    # 2) Tạo ảnh trong project đó (aisandbox-pa, URL KHÔNG có ?key= nếu key rỗng)
    status, img = _req("POST", "/api/flow/generate-image",
                       {"prompt": PROMPT, "project_id": project_id})
    print("\n== generate-image ==", status)
    print(json.dumps(img, ensure_ascii=False)[:2000])
    if status >= 400:
        print("!! Tạo ảnh thất bại — có thể GOOGLE_API_KEY THỰC SỰ cần thiết,"
              " hoặc lỗi captcha/token. Xem response ở trên.")
        sys.exit(1)

    media_id = _find_first(img, "name") or _find_first(img, "mediaId")
    url = _find_image_url(img)
    print("\n-> media_id =", media_id)
    print("-> image_url =", url)

    # 3) Tải ảnh về (nếu có URL)
    if url:
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                content = r.read()
            with open("test_no_key.png", "wb") as f:
                f.write(content)
            print(f"-> Đã lưu test_no_key.png ({len(content)} bytes)")
        except Exception as e:
            print("!! Không tải được ảnh:", e)

    print("\n✅ THÀNH CÔNG: tạo project + ảnh hoạt động mà không cần GOOGLE_API_KEY.")


if __name__ == "__main__":
    main()
