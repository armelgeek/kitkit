"""Mock Flow Client for testing without connecting to real Flow API or Chrome extension.

Generates test images locally using PIL instead of calling the Google Flow API.
Matches the response structure of the real FlowClient so code using it needs no changes.
"""
import io
import json
import logging
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)


class MockFlowClient:
    """Mock Flow client that generates test images locally."""

    def __init__(self):
        self._extension_ws = None
        self._flow_key = None
        self._ws_connect_count = 0
        self._ws_disconnect_count = 0
        self._ws_connected_at = None
        self._ws_last_disconnect_at = None

    @property
    def connected(self) -> bool:
        """Always return True for mock so tests can proceed."""
        return True

    @property
    def ws_stats(self) -> dict:
        return {
            "connected": True,
            "connects": self._ws_connect_count,
            "disconnects": self._ws_disconnect_count,
            "uptime_s": 9999,
        }

    def set_extension(self, ws):
        """No-op for mock."""
        pass

    def clear_extension(self):
        """No-op for mock."""
        pass

    def set_flow_key(self, key: str):
        """No-op for mock."""
        pass

    async def generate_images(
        self,
        prompt: str,
        project_id: str,
        aspect_ratio: str = "IMAGE_ASPECT_RATIO_PORTRAIT",
        user_paygate_tier: str = "PAYGATE_TIER_TWO",
        character_media_ids: list[str] = None,
        references: list[dict] = None,
        image_model: str = None,
        seed: int = None,
        batch_id: str = None,
        serialize: bool = True,
    ) -> dict:
        """Generate a test image and return Flow API response structure.

        Creates a simple PNG locally that matches Flow's response format.
        The media_id can be used by downstream code to fetch the actual image.
        """
        # Determine dimensions based on aspect ratio
        if "LANDSCAPE" in aspect_ratio:
            width, height = 1024, 576  # 16:9
        else:
            width, height = 576, 1024  # 9:16

        # Generate media ID
        media_id = str(uuid.uuid4())

        # Create a test image
        img = self._create_test_image(width, height, prompt[:50])

        # Optionally save to a temp location for manual verification
        # (not required, just helpful for debugging)
        logger.debug(f"Mock generated image {media_id} for prompt: {prompt[:50]}")

        # Return response matching exact Flow API structure used by _extract_image_result
        return {
            "status": 200,
            "data": {
                "media": [
                    {
                        "name": media_id,
                        "image": {
                            "generatedImage": {
                                "mediaId": media_id,
                            }
                        },
                    }
                ]
            },
        }

    async def generate_video(self, *args, **kwargs) -> dict:
        """Mock video generation - return error for now."""
        return {"error": "Video generation not mocked"}

    async def upscale(self, *args, **kwargs) -> dict:
        """Mock upscale - return error for now."""
        return {"error": "Upscale not mocked"}

    async def edit(self, *args, **kwargs) -> dict:
        """Mock edit - return error for now."""
        return {"error": "Edit not mocked"}

    async def check_video_status(self, *args, **kwargs) -> dict:
        """Mock video status check."""
        return {"status": "GENERATION_COMPLETE"}

    async def rename_media(self, *args, **kwargs) -> dict:
        """Mock rename media."""
        return {"ok": True}

    async def get_credits(self) -> dict:
        """Mock credits check."""
        return {"credits": 1000}

    def _create_test_image(self, width: int, height: int, text: str) -> Image.Image:
        """Create a simple test image with text."""
        # Create gradient background
        img = Image.new("RGB", (width, height), color=(240, 240, 240))
        draw = ImageDraw.Draw(img)

        # Draw some patterns
        for i in range(0, width, 50):
            draw.line([(i, 0), (i, height)], fill=(220, 220, 220), width=1)
        for i in range(0, height, 50):
            draw.line([(0, i), (width, i)], fill=(220, 220, 220), width=1)

        # Draw center rectangle
        margin = 100
        draw.rectangle(
            [
                (margin, margin),
                (width - margin, height - margin),
            ],
            outline=(100, 150, 200),
            width=3,
        )

        # Add text
        text_to_draw = text[:30] if text else "Mock Image"
        try:
            # Try to use a basic font
            draw.text(
                (50, 50),
                text_to_draw,
                fill=(0, 0, 0),
            )
        except Exception:
            pass

        return img
