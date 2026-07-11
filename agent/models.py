"""Pydantic models for API requests/responses."""
from typing import Optional, List
from pydantic import BaseModel


class VersionEntry(BaseModel):
    """Single version in asset history."""
    version: int
    media_id: Optional[str] = None
    reference_image_url: Optional[str] = None
    prompt: str
    instructions: Optional[str] = None
    generated_at: str  # ISO format datetime
    status: str  # "success", "error", "pending"


class AssetHistoryResponse(BaseModel):
    """Asset version history with metadata."""
    entity_id: str
    active_version: int
    versions: List[VersionEntry]


class RegenerateRequest(BaseModel):
    """Request to regenerate an asset with new prompt/instructions."""
    prompt: Optional[str] = None  # If provided, replaces original prompt
    instructions: Optional[str] = None  # Additional refinement hints
