import httpx
import asyncio

async def main():
    # Use the same port as the running backend
    url = "http://127.0.0.1:8100/api/tts/synthesize"
    # Sending voice_id as null, which is what the error report suggests
    payload = {
        "text": "Hello, world",
        "voice_id": None,
        "speed": 1.0
    }
    async with httpx.AsyncClient() as client:
        # We expect a 422 error here based on the user's report
        try:
            resp = await client.post(url, json=payload)
            print(f"Status: {resp.status_code}")
            print(f"Response: {resp.json()}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
