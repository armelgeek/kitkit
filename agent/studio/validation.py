"""
Continuity validation layer.
Validates entities, beats, and inter-scene continuity.
"""
import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


def extract_braced_names(text: str) -> set[str]:
    """Extract entity names wrapped in {braces} from text."""
    return {m.strip() for m in re.findall(r'\{([^{}]+)\}', text or "") if m.strip()}


def extract_shot_size(description: str) -> Optional[str]:
    """
    Extract shot size category from description.
    Returns: 'wide', 'medium', 'close_up', etc or None
    """
    sizes = [
        "extreme_wide", "wide", "full", "medium",
        "medium_close_up", "close_up", "extreme_close_up"
    ]
    desc_lower = (description or "").lower()

    # Try exact matches first
    for size in sizes:
        if size.replace("_", " ") in desc_lower or size.replace("_", "-") in desc_lower:
            return size

    # Fallback: try patterns
    if "wide" in desc_lower:
        return "wide"
    if "medium" in desc_lower:
        return "medium"
    if "close" in desc_lower or "closeup" in desc_lower:
        return "close_up"

    return None


def extract_location_from_description(description: str) -> Optional[str]:
    """Extract location from 'At {Location}' pattern."""
    match = re.search(r'^At\s+\{([^}]+)\}', description or "")
    return match.group(1) if match else None


def extract_lighting(description: str) -> Optional[str]:
    """Infer lighting from keywords in description."""
    text_lower = (description or "").lower()

    if any(w in text_lower for w in ["golden", "warm", "sunset", "golden hour", "daylight"]):
        return "warm"
    if any(w in text_lower for w in ["blue", "cool", "moonlight", "night"]):
        return "cool"
    if any(w in text_lower for w in ["dim", "dark", "shadow"]):
        return "dim"

    return None


def extract_props(text: str) -> set[str]:
    """Extract potential prop names from text (basic heuristic)."""
    props = set()
    # Look for capitalized nouns not in {braces}
    for word in text.split():
        word_clean = word.strip('.,!?;:')
        if word_clean and word_clean[0].isupper() and not ('{' in word or '}' in word):
            props.add(word_clean)
    return props


async def validate_script_entities(script: str, db_entities: list[dict]) -> dict:
    """
    Extract entities referenced in script.
    Fail if any script entity doesn't exist in DB.

    Returns: {valid: bool, entities: set, missing: set}
    Raises: ValueError if missing entities
    """
    from agent.studio import brain

    script_entities = brain.extract_entities(script)
    db_names = {e["name"] for e in db_entities}
    missing = script_entities - db_names

    if missing:
        raise ValueError(f"Script references unknown entities: {missing}")

    return {
        "valid": True,
        "entities": script_entities,
        "missing": set()
    }


async def validate_voiceover_entities(voiceover: str, db_entities: list[dict]) -> dict:
    """
    Extract entities wrapped in {braces} from voiceover.
    Warn if any are not in DB (hallucinated).

    Returns: {valid: bool, referenced: set, hallucinated: set}
    """
    vo_entities = extract_braced_names(voiceover)
    db_names = {e["name"] for e in db_entities}
    hallucinated = vo_entities - db_names

    if hallucinated:
        logger.warning(f"Voiceover hallucinated entities: {hallucinated}")

    return {
        "valid": not bool(hallucinated),
        "referenced": vo_entities,
        "hallucinated": hallucinated
    }


async def validate_beat_entities(beat: dict, db_entities: list[dict]) -> dict:
    """
    Check that beat description/visual_prompt/motion_prompt
    only reference entities that exist in DB.

    Returns: {valid: bool, hallucinated: set}
    """
    beat_text = " ".join(filter(None, [
        beat.get("description", ""),
        beat.get("visual_prompt", ""),
        beat.get("motion_prompt", "")
    ]))
    beat_entities = extract_braced_names(beat_text)
    db_names = {e["name"] for e in db_entities}
    hallucinated = beat_entities - db_names

    if hallucinated:
        logger.warning(f"Beat hallucinated entities: {hallucinated}")

    return {
        "valid": not bool(hallucinated),
        "hallucinated": hallucinated
    }


async def validate_beat_angles(beat: dict, previous_beat: dict = None) -> dict:
    """
    Extract shot size from beat description.
    If previous_beat exists, ensure they differ.

    Returns: {valid: bool, size: str, conflict_with: str or None}
    """
    curr_size = extract_shot_size(beat.get("description", ""))

    if not previous_beat:
        return {
            "valid": True,
            "size": curr_size,
            "conflict_with": None
        }

    prev_size = extract_shot_size(previous_beat.get("description", ""))
    if curr_size == prev_size and curr_size is not None:
        return {
            "valid": False,
            "size": curr_size,
            "conflict_with": prev_size
        }

    return {
        "valid": True,
        "size": curr_size,
        "conflict_with": None
    }


async def validate_beats_comprehensive(beats: list[dict], entities_by_name: dict) -> dict:
    """
    Post-process beats: detect and categorize issues.

    Returns:
    {
      "hard_fails": ["issue1", "issue2"],
      "soft_warnings": ["warning1"],
      "valid": bool
    }
    """
    issues = {"hard_fails": [], "soft_warnings": []}

    for i, beat in enumerate(beats):
        # HARD: Unknown entities
        beat_text = " ".join(filter(None, [
            beat.get("description", ""),
            beat.get("visual_prompt", ""),
            beat.get("motion_prompt", "")
        ]))
        beat_entities = extract_braced_names(beat_text)
        unknown = beat_entities - set(entities_by_name.keys())
        if unknown:
            issues["hard_fails"].append(
                f"Beat {i}: unknown entities {unknown} (hallucinated)"
            )

        # HARD: Shot size repeats
        if i > 0:
            angle_check = await validate_beat_angles(beat, beats[i-1])
            if not angle_check["valid"]:
                issues["hard_fails"].append(
                    f"Beat {i}: same shot size as beat {i-1} ({angle_check['size']})"
                )

        # SOFT: Required entity missing after establishment
        if i > 1 and beats and "text" in beats[0]:
            first_entities = extract_braced_names(beats[0].get("description", ""))
            if first_entities and i > len(beats) // 2:
                missing = first_entities - beat_entities
                if missing:
                    issues["soft_warnings"].append(
                        f"Beat {i}: key characters missing ({missing}) after scene established"
                    )

    return {
        **issues,
        "valid": len(issues["hard_fails"]) == 0
    }


async def auto_fix_beats(beats: list[dict], entities: list[dict],
                         max_retries: int = 2) -> tuple[list[dict], dict]:
    """
    If hard_fails exist, log them.
    Note: Actual re-prompting is done by caller.

    Returns: (beats, validation_issues)
    Raises HTTPException(502) if hard fails and no retries left
    """
    from fastapi import HTTPException

    entities_by_name = {e["name"]: e for e in entities}
    issues = await validate_beats_comprehensive(beats, entities_by_name)

    if not issues["valid"]:
        logger.warning(f"Beats have hard issues: {issues['hard_fails']}")
        # In actual flow, caller would re-prompt here with feedback
        # For now, we just validate and return
        if max_retries == 0:
            raise HTTPException(502, f"Beats validation failed: {issues['hard_fails']}")

    return beats, issues
