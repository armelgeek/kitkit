import httpx
import asyncio
import os
os.environ['ELEVENLABS_API_KEY'] = 'sk_4ebe33090a98e4fa7f9dc03d4d8dfbb15af2b2e6e66b2c2e'
async def test():
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
            headers={
                'xi-api-key': os.environ['ELEVENLABS_API_KEY'],
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            json={
                'text': 'test',
                'model_id': 'eleven_monolingual_v1',
                'voice_settings': {'stability': 0.5, 'similarity_boost': 0.5}
            }
        )
        print(resp.status_code)
        print(resp.text)
asyncio.run(test())
