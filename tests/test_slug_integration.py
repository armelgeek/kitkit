"""
End-to-end integration test for slug workflow.
Tests: entity extraction → slug generation → beat prompt → validation.
"""
import pytest
from fastapi import HTTPException
from agent.studio import brain, validation
from agent.studio.db import normalize_to_slug


@pytest.mark.asyncio
async def test_end_to_end_slug_flow():
    """
    Full workflow:
    1. Extract entities with raw names
    2. Add slugs via normalize_to_slug()
    3. Generate beat prompt using slugs only
    4. Verify prompt contains {slug}, NOT {name}
    5. Validate valid beats with correct slugs (should PASS)
    6. Validate invalid beats with unknown slugs (should FAIL)
    """

    # ─── STEP 1: Create raw entities with names ───────────────────────────
    raw_entities = [
        {"name": "Helene Kheler", "type": "character", "description": "A young girl"},
        {"name": "Flower-Filled City", "type": "location", "description": "A vibrant city"},
        {"name": "Wooden Bowl", "type": "prop", "description": "An ancient artifact"}
    ]

    # ─── STEP 2: Add slugs to entities ────────────────────────────────────
    entities = []
    for i, e in enumerate(raw_entities):
        slug = normalize_to_slug(e["name"])
        entity = {
            **e,
            "id": f"{e['type'][:3]}_{i}",  # e.g., "cha_0", "loc_1"
            "slug": slug
        }
        entities.append(entity)

    # Verify slugs are correctly normalized
    assert entities[0]["slug"] == "helene_kheler", "Character name should normalize to helene_kheler"
    assert entities[1]["slug"] == "flower_filled_city", "Location name should normalize to flower_filled_city"
    assert entities[2]["slug"] == "wooden_bowl", "Prop name should normalize to wooden_bowl"

    # ─── STEP 3: Generate beat prompt using entities ──────────────────────
    prompt = brain.unified_scene_beats_prompt(
        voiceover="Helene wakes up in the flower-filled city and finds a wooden bowl.",
        scene_heading="INT. FLOWER-FILLED CITY - MORNING",
        scene_action="Helene discovers an ancient wooden bowl",
        entities=entities,
        style="anime",
        previous_scene_exit=None
    )

    # ─── STEP 4: Verify prompt contains ONLY slugs, NOT full names ────────
    # Check that slugs are present
    assert "{helene_kheler}" in prompt, "Prompt must contain slug {helene_kheler}"
    assert "{flower_filled_city}" in prompt, "Prompt must contain slug {flower_filled_city}"
    assert "{wooden_bowl}" in prompt, "Prompt must contain slug {wooden_bowl}"

    # Check that full names are NOT in braces
    assert "{Helene Kheler}" not in prompt, "Prompt must NOT contain {Helene Kheler}"
    assert "{Flower-Filled City}" not in prompt, "Prompt must NOT contain {Flower-Filled City}"
    assert "{Wooden Bowl}" not in prompt, "Prompt must NOT contain {Wooden Bowl}"

    # Verify strict constraints are present
    assert "STRICT:" in prompt or "FORBIDDEN:" in prompt, "Prompt must contain strict constraints"

    # ─── STEP 5: Create valid beats with correct slugs ────────────────────
    valid_beats = [
        {
            "text": "Helene wakes up",
            "description": "Wide shot of {helene_kheler} waking up in {flower_filled_city}",
            "ref_entity_names": ["helene_kheler", "flower_filled_city"],
            "visual_prompt": "Golden morning light, cozy atmosphere"
        },
        {
            "text": "She discovers the wooden bowl",
            "description": "Close-up of {helene_kheler} finding {wooden_bowl}",
            "ref_entity_names": ["helene_kheler", "wooden_bowl"],
            "visual_prompt": "Ancient wooden bowl glowing softly"
        }
    ]

    # ─── STEP 6: Validate valid beats (should PASS) ──────────────────────
    result, issues = await validation.auto_fix_beats(valid_beats, entities, max_retries=0)
    assert issues["valid"] is True, f"Valid beats should pass validation. Issues: {issues}"

    # ─── STEP 7: Create invalid beats with unknown slugs ──────────────────
    invalid_beats = [
        {
            "text": "Helene meets someone",
            "description": "At {mysterious_location}, {helene_kheler} meets {mysterious_stranger}",
            "ref_entity_names": ["mysterious_location", "helene_kheler", "mysterious_stranger"],
            "visual_prompt": "Unknown place with mysterious person"
        }
    ]

    # ─── STEP 8: Validate invalid beats (should FAIL) ────────────────────
    with pytest.raises(HTTPException) as exc_info:
        await validation.auto_fix_beats(invalid_beats, entities, max_retries=0)

    # Verify the error is about unknown entities
    assert exc_info.value.status_code == 502, "Should return 502 for unknown entities"
    assert "unknown entities" in str(exc_info.value.detail).lower(), \
        "Error should mention unknown entities"

    print("✓ End-to-end slug flow test PASSED")


@pytest.mark.asyncio
async def test_slug_collision_handling():
    """
    Test that multiple entities with names that normalize to the same slug
    are handled correctly.
    """
    # Create entities that would collide if not properly handled
    entities = [
        {
            "id": "c1",
            "name": "Tâm",
            "slug": "tam",  # Manually set to expected slug
            "type": "character",
            "description": "Character 1"
        },
        {
            "id": "c2",
            "name": "Tam",  # Would collide after normalization
            "slug": "tam_1",  # Given a different slug to avoid collision
            "type": "character",
            "description": "Character 2"
        }
    ]

    # Both slugs should be present in the roster
    prompt = brain.unified_scene_beats_prompt(
        voiceover="Test",
        scene_heading="INT. TEST - DAY",
        scene_action="Test",
        entities=entities,
        style="test"
    )

    # Should contain both slugs
    assert "{tam}" in prompt or "- {tam}" in prompt, "Should contain first slug"
    assert "{tam_1}" in prompt or "- {tam_1}" in prompt, "Should contain collision-handled slug"


@pytest.mark.asyncio
async def test_partial_entity_reference():
    """
    Test that beats can reference a subset of available entities.
    """
    entities = [
        {"id": "c1", "name": "Alice", "slug": "alice", "type": "character"},
        {"id": "c2", "name": "Bob", "slug": "bob", "type": "character"},
        {"id": "c3", "name": "Charlie", "slug": "charlie", "type": "character"},
    ]

    # Beat only references Alice and Bob, not Charlie
    beats = [
        {
            "text": "Alice meets Bob",
            "description": "{alice} encounters {bob} at the market",
            "ref_entity_names": ["alice", "bob"],
            "visual_prompt": "Marketplace scene"
        }
    ]

    # Should pass (charlie is available but not required to be in this beat)
    result, issues = await validation.auto_fix_beats(beats, entities, max_retries=0)
    assert issues["valid"] is True, "Should allow subset of available entities"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
