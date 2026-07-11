"""Helper functions for managing version history in asset entities.

Provides utilities for parsing, updating, and retrieving version data.
"""
import json
from typing import Optional, Dict, List


def parse_version_history(history_json: str) -> List[Dict]:
    """Parse JSON version history into list of dicts.

    Args:
        history_json: JSON string representation of version history list

    Returns:
        List of version dictionaries, empty list if invalid/empty
    """
    if not history_json or history_json == "[]":
        return []
    try:
        return json.loads(history_json)
    except json.JSONDecodeError:
        return []


def get_active_version(history: List[Dict], active_version_num: int) -> Optional[Dict]:
    """Get the currently active version from history.

    Args:
        history: List of version dictionaries
        active_version_num: The version number to retrieve

    Returns:
        The matching version dict, or None if not found
    """
    for v in history:
        if v["version"] == active_version_num:
            return v
    return None


def add_version_to_history(
    history_json: str,
    new_version: Dict,
    max_versions: int = 10
) -> tuple[str, int]:
    """Add a new version to history, enforce limit, return (updated_json, new_version_num).

    If history exceeds max_versions, remove oldest (lowest version number) and re-number.

    Args:
        history_json: JSON string of current version history
        new_version: New version dict to add (must not have 'version' key yet)
        max_versions: Maximum number of versions to keep (default 10)

    Returns:
        Tuple of (updated history JSON string, new version number)
    """
    history = parse_version_history(history_json)

    # Determine next version number
    if not history:
        next_version_num = 1
    else:
        next_version_num = max(v["version"] for v in history) + 1

    # Add new version
    new_version["version"] = next_version_num
    history.append(new_version)

    # Enforce limit: if exceeded, remove oldest and re-number
    if len(history) > max_versions:
        # Sort by version number (should already be sorted, but be safe)
        history.sort(key=lambda x: x["version"])

        # Remove oldest
        history.pop(0)

        # Re-number from 1
        for i, v in enumerate(history, start=1):
            v["version"] = i

        next_version_num = len(history)  # Adjust if we re-numbered

    return json.dumps(history), next_version_num


def get_current_reference_data(entity: Dict) -> Dict:
    """Extract the currently active reference image data from an entity.

    Retrieves the active version's reference data. Falls back to entity fields
    if no version history is available (pre-migration entities).

    Args:
        entity: Entity dictionary with version_history and active_version_num

    Returns:
        Dict with keys: media_id, reference_image_url, prompt, instructions
    """
    history = parse_version_history(entity.get("version_history", "[]"))
    active_version_num = entity.get("active_version_num", 1)

    active = get_active_version(history, active_version_num)

    if active:
        return {
            "media_id": active["media_id"],
            "reference_image_url": active["reference_image_url"],
            "prompt": active["prompt"],
            "instructions": active["instructions"]
        }

    # Fallback to entity fields (shouldn't happen after migration)
    return {
        "media_id": entity.get("media_id"),
        "reference_image_url": entity.get("reference_image_url"),
        "prompt": entity.get("description"),
        "instructions": None
    }
