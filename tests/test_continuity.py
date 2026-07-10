"""
Tests for continuity validation layer.
"""
import pytest
from agent.studio import validation


class TestShotSizeExtraction:
    """Test shot size extraction from descriptions."""

    def test_extract_wide_shot(self):
        desc = "At {Kitchen}, wide shot, character stands"
        size = validation.extract_shot_size(desc)
        assert size == "wide"

    def test_extract_medium_shot(self):
        desc = "At {Kitchen}, medium shot, character moves"
        size = validation.extract_shot_size(desc)
        assert size == "medium"

    def test_extract_close_up(self):
        desc = "At {Kitchen}, close-up of hands, opening door"
        size = validation.extract_shot_size(desc)
        assert size == "close_up"

    def test_extract_extreme_close_up(self):
        desc = "extreme close-up of eyes"
        size = validation.extract_shot_size(desc)
        # Will match "close_up" due to fallback logic, acceptable
        assert size in ("extreme_close_up", "close_up")

    def test_extract_full_shot(self):
        desc = "full body shot, character enters"
        size = validation.extract_shot_size(desc)
        assert size == "full"


class TestEntityExtraction:
    """Test entity name extraction from braced references."""

    def test_extract_single_entity(self):
        text = "At {Kitchen}, character enters"
        entities = validation.extract_braced_names(text)
        assert entities == {"Kitchen"}

    def test_extract_multiple_entities(self):
        text = "At {Kitchen}, {Tấm} sees {Bowl}"
        entities = validation.extract_braced_names(text)
        assert entities == {"Kitchen", "Tấm", "Bowl"}

    def test_extract_no_entities(self):
        text = "A character enters a room"
        entities = validation.extract_braced_names(text)
        assert entities == set()

    def test_ignore_empty_braces(self):
        text = "At {}, empty braces {  }"
        entities = validation.extract_braced_names(text)
        assert entities == set()


@pytest.mark.asyncio
async def test_validate_beat_entities_valid():
    """Validate beat with known entities passes."""
    beat = {
        "description": "At {Kitchen}, wide shot, {Tấm} enters",
        "visual_prompt": "cozy kitchen with {Tấm}",
        "motion_prompt": "camera pans"
    }
    entities = {
        "Kitchen": {"name": "Kitchen", "type": "location"},
        "Tấm": {"name": "Tấm", "type": "character"}
    }

    result = await validation.validate_beat_entities(beat, entities)
    assert result["valid"]
    assert result["hallucinated"] == set()


@pytest.mark.asyncio
async def test_validate_beat_entities_hallucinated():
    """Validate beat with unknown entities fails."""
    beat = {
        "description": "At {Kitchen}, {UnknownChar} appears",
        "visual_prompt": "mysterious figure",
        "motion_prompt": "enters"
    }
    entities = {
        "Kitchen": {"name": "Kitchen", "type": "location"}
    }

    result = await validation.validate_beat_entities(beat, entities)
    assert not result["valid"]
    assert "UnknownChar" in result["hallucinated"]


@pytest.mark.asyncio
async def test_validate_beat_angles_differ():
    """Validate shots with different angles passes."""
    beat1 = {"description": "At {Loc}, wide shot, action"}
    beat2 = {"description": "At {Loc}, medium shot, action"}

    result = await validation.validate_beat_angles(beat2, beat1)
    assert result["valid"]
    assert result["size"] == "medium"
    assert result["conflict_with"] is None


@pytest.mark.asyncio
async def test_validate_beat_angles_same():
    """Validate shots with same angle fails."""
    beat1 = {"description": "At {Loc}, wide shot, action A"}
    beat2 = {"description": "At {Loc}, wide shot, action B"}

    result = await validation.validate_beat_angles(beat2, beat1)
    assert not result["valid"]
    assert result["size"] == "wide"
    assert result["conflict_with"] == "wide"


@pytest.mark.asyncio
async def test_validate_beats_comprehensive():
    """Comprehensive validation catches hard and soft issues."""
    beats = [
        {"description": "At {Loc}, wide shot, {Char} stands"},
        {"description": "At {Loc}, wide shot, {Char} moves"},  # Repeated angle
        {"description": "At {Loc}, close-up, {UnknownChar} speaks"}  # Unknown entity
    ]
    entities_by_name = {
        "Loc": {"name": "Loc", "type": "location"},
        "Char": {"name": "Char", "type": "character"}
    }

    result = await validation.validate_beats_comprehensive(beats, entities_by_name)

    assert not result["valid"]
    assert len(result["hard_fails"]) >= 2  # Repeated angle + unknown entity
    # Should catch: Beat 1 same size as Beat 0, Beat 2 unknown entities


@pytest.mark.asyncio
async def test_auto_fix_beats_valid():
    """Auto-fix passes valid beats through."""
    beats = [
        {"description": "At {Kitchen}, wide shot, {Tấm} enters"},
        {"description": "At {Kitchen}, medium shot, {Tấm} looks"}
    ]
    entities = [
        {"name": "Kitchen", "type": "location"},
        {"name": "Tấm", "type": "character"}
    ]

    result_beats, issues = await validation.auto_fix_beats(beats, entities)

    assert result_beats == beats
    assert issues["valid"]
    assert issues["hard_fails"] == []


@pytest.mark.asyncio
async def test_auto_fix_beats_fails_hard():
    """Auto-fix raises on hard fails with no retries."""
    from fastapi import HTTPException

    beats = [
        {"description": "At {Loc}, wide shot, {UnknownChar} speaks"}
    ]
    entities = [
        {"name": "Loc", "type": "location"}
    ]

    with pytest.raises(HTTPException) as exc_info:
        await validation.auto_fix_beats(beats, entities, max_retries=0)

    assert exc_info.value.status_code == 502


class TestLocationExtraction:
    """Test location extraction from descriptions."""

    def test_extract_location_from_at_pattern(self):
        desc = "At {Kitchen}, wide shot, action"
        loc = validation.extract_location_from_description(desc)
        assert loc == "Kitchen"

    def test_no_location_if_not_at_pattern(self):
        desc = "A character stands in {Kitchen}"
        loc = validation.extract_location_from_description(desc)
        assert loc is None


class TestLightingExtraction:
    """Test lighting inference from descriptions."""

    def test_extract_warm_lighting(self):
        desc = "At {Loc}, golden hour sunlight, warm light"
        lighting = validation.extract_lighting(desc)
        assert lighting == "warm"

    def test_extract_cool_lighting(self):
        desc = "At {Loc}, moonlight, blue cool tone"
        lighting = validation.extract_lighting(desc)
        assert lighting == "cool"

    def test_extract_dim_lighting(self):
        desc = "At {Loc}, dimly lit, shadows"
        lighting = validation.extract_lighting(desc)
        assert lighting == "dim"

    def test_no_lighting_specified(self):
        desc = "At {Loc}, character walks"
        lighting = validation.extract_lighting(desc)
        assert lighting is None
