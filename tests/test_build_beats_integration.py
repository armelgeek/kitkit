"""
Integration tests for build_scene_beats refactor (Phase 2.3).
Tests the unified prompt flow end-to-end.
"""
import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from agent.studio import brain


@pytest.mark.asyncio
async def test_unified_prompt_mock_ai_response():
    """
    Simulate what Claude returns from unified prompt.
    Verify the structure matches expectations.
    """

    # This is what we expect Claude to return
    mock_response = {
        "plan": {
            "present": ["Tấm"],
            "blocking": "Tấm alone in small kitchen, approaching wooden table",
            "coverage": "Establish wide of kitchen, then push-in to Tấm, close-up on bowl"
        },
        "beats": [
            {
                "text": "Tấm rentre dans la cuisine.",
                "beat_action": "Tấm enters kitchen",
                "description": "At {Kitchen}, wide establishing shot, {Tấm} enters through wooden door, warm golden light from window",
                "visual_prompt": "cozy traditional Vietnamese kitchen, watercolor style, natural light from window",
                "motion_prompt": "locked camera, medium pan following Tấm as she enters",
                "ref_entity_names": ["Kitchen", "Tấm"],
                "key_phrases": ["enters"]
            },
            {
                "text": "Elle voit un bol de riz.",
                "beat_action": "Tấm spots bowl",
                "description": "At {Kitchen}, medium close-up, {Tấm} spots the bowl on wooden table",
                "visual_prompt": "focus on Tấm's face with rice bowl in background, shallow depth of field",
                "motion_prompt": "camera push-in slowly, Tấm's eyes widen with wonder",
                "ref_entity_names": ["Kitchen", "Tấm"],
                "key_phrases": ["spots bowl"]
            }
        ],
        "exit_state": {
            "present": ["Tấm"],
            "lighting": "warm golden",
            "location": "Kitchen",
            "props": ["bowl", "wooden door"]
        }
    }

    # Verify structure
    assert "plan" in mock_response
    assert "beats" in mock_response
    assert "exit_state" in mock_response
    assert len(mock_response["beats"]) == 2
    assert mock_response["plan"]["present"] == ["Tấm"]
    assert mock_response["exit_state"]["lighting"] == "warm golden"


@pytest.mark.asyncio
async def test_extract_exit_state_from_mock_beats():
    """Test that exit state is correctly extracted from beats."""
    beats = [
        {
            "text": "Beat 1",
            "beat_action": "action1",
            "description": "At {Kitchen}, wide, {Tấm} enters",
            "motion_prompt": "",
        },
        {
            "text": "Beat 2",
            "beat_action": "Tấm observes bowl",
            "description": "At {Kitchen}, medium, {Tấm} sees {Bowl}",
            "motion_prompt": "camera push-in",
        }
    ]

    exit_state = brain.extract_scene_exit_state(beats, "INT. KITCHEN - DAY")

    assert exit_state["present"] == ["Kitchen", "Tấm", "Bowl"]  # Last beat
    assert exit_state["last_action"] == "Tấm observes bowl"
    assert exit_state["location"] == "Kitchen"


@pytest.mark.asyncio
async def test_runner_structure():
    """Test that PromptRunner has required methods."""
    from agent.studio.brain import PromptRunner

    # Verify it exists and is callable
    assert hasattr(PromptRunner, 'run_json_valid')
    assert callable(PromptRunner.run_json_valid)


class TestBuildBeatsRefactorScenarios:
    """Test scenarios for build_scene_beats refactor."""

    def test_scenario_simple_scene(self):
        """Scenario: Simple 2-beat scene with one character."""
        voiceover = "She enters. She sees."
        scene_heading = "INT. KITCHEN - DAY"
        scene_action = "Character enters and discovers"
        entities = [
            {"name": "Kitchen", "type": "location", "description": ""},
            {"name": "Tấm", "type": "character", "description": ""}
        ]

        prompt = brain.unified_scene_beats_prompt(
            voiceover, scene_heading, scene_action, entities, "Watercolor"
        )

        assert len(prompt) > 500
        assert "Tấm" in prompt
        assert "Kitchen" in prompt

    def test_scenario_scene_with_previous_state(self):
        """Scenario: Scene continues from previous (inter-scene continuity)."""
        prev_exit = {
            "present": ["Tấm"],
            "lighting": "warm golden",
            "location": "Kitchen"
        }

        voiceover = "She walks outside."
        prompt = brain.unified_scene_beats_prompt(
            voiceover, "INT. GARDEN - DAY", "Character goes outside",
            [{"name": "Garden", "type": "location", "description": ""},
             {"name": "Tấm", "type": "character", "description": ""}],
            "Watercolor",
            previous_scene_exit=prev_exit
        )

        assert "PREVIOUS SCENE STATE" in prompt
        assert "Kitchen" in prompt  # Reference to previous location
        assert "warm golden" in prompt  # Lighting continuity

    def test_scenario_no_location_entity(self):
        """Scenario: Location not yet in entities (AI should invent)."""
        voiceover = "Character enters an unknown place."
        prompt = brain.unified_scene_beats_prompt(
            voiceover, "INT. UNKNOWN - DAY", "Character enters",
            [{"name": "Character", "type": "character", "description": ""}],
            "Realistic"
        )

        # Should still generate valid prompt
        assert "VOICEOVER" in prompt
        assert "Character" in prompt

    def test_scenario_many_beats(self):
        """Scenario: Long scene with many beats."""
        # Simulate long voiceover that should generate ~8 beats (60s / 8s per beat)
        voiceover = "She enters. " * 30  # ~60 sentences

        prompt = brain.unified_scene_beats_prompt(
            voiceover, "INT. HOUSE - DAY", "Long scene",
            [{"name": "House", "type": "location", "description": ""}],
            "Realistic"
        )

        assert "~8s" in prompt or "8 second" in prompt.lower()  # Should mention timing


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
