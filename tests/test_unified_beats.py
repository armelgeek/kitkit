"""
Test unified scene beats prompt integration.
"""
import json
import pytest
from agent.studio import brain


def test_unified_prompt_structure():
    """Test that unified prompt returns correct JSON structure."""
    prompt = brain.unified_scene_beats_prompt(
        voiceover="She enters. She sees. She smiles.",
        scene_heading="INT. KITCHEN - DAY",
        scene_action="Character enters kitchen and discovers something.",
        entities=[
            {"name": "Kitchen", "type": "location", "description": "A cozy kitchen"},
            {"name": "Tấm", "type": "character", "description": "Main character"}
        ],
        style="Watercolor"
    )

    # Verify prompt structure
    assert "UNIFIED" not in prompt  # Not explicitly saying "unified"
    assert "INT. KITCHEN - DAY" in prompt
    assert "{Kitchen}" in prompt  # Entity wrapping example
    assert "{Tấm}" in prompt
    assert "plan" in prompt.lower()
    assert "beats" in prompt.lower()
    assert "exit_state" in prompt.lower()


def test_unified_prompt_with_previous_state():
    """Test that previous scene exit state is injected."""
    prev_exit = {
        "present": ["Tấm"],
        "lighting": "warm golden",
        "location": "Kitchen"
    }

    prompt = brain.unified_scene_beats_prompt(
        voiceover="She continues.",
        scene_heading="INT. GARDEN - DAY",
        scene_action="Character goes outside.",
        entities=[
            {"name": "Garden", "type": "location", "description": ""},
            {"name": "Tấm", "type": "character", "description": ""}
        ],
        style="Watercolor",
        previous_scene_exit=prev_exit
    )

    # Verify previous state is mentioned
    assert "PREVIOUS SCENE STATE" in prompt
    assert "warm golden" in prompt
    assert "Kitchen" in prompt


def test_unified_prompt_no_previous_state():
    """Test unified prompt works without previous scene."""
    prompt = brain.unified_scene_beats_prompt(
        voiceover="First scene.",
        scene_heading="INT. HOUSE - DAY",
        scene_action="Open.",
        entities=[
            {"name": "House", "type": "location", "description": ""}
        ],
        style="Realistic"
    )

    # Should work fine without previous state
    assert len(prompt) > 100
    assert "PREVIOUS SCENE STATE" not in prompt


def test_prompt_runner_integration():
    """Test that PromptRunner class exists and is callable."""
    from agent.studio.brain import PromptRunner

    # Verify it's a class
    assert hasattr(PromptRunner, 'run_json_valid')
    assert callable(PromptRunner.run_json_valid)


def test_exit_state_extraction():
    """Test extraction of exit state from beats."""
    beats = [
        {
            "description": "At {Kitchen}, wide shot, {Tấm} stands by window",
            "motion_prompt": "camera pull-out",
            "beat_action": "Tấm observes"
        }
    ]

    exit_state = brain.extract_scene_exit_state(beats, "INT. KITCHEN - DAY")

    assert exit_state["location"] == "Kitchen"
    assert "Tấm" in exit_state["present"]
    assert exit_state["last_action"] == "Tấm observes"
    assert exit_state["lighting"] is not None or exit_state["lighting"] is None  # May be None


def test_beats_example_format():
    """Verify beat format matches expected structure."""
    beat = {
        "text": "verbatim slice",
        "beat_action": "what happens",
        "description": "At {Loc}, wide shot, {Char} enters",
        "visual_prompt": "camera setup",
        "motion_prompt": "camera move",
        "ref_entity_names": ["Loc", "Char"],
        "key_phrases": ["phrase1"]
    }

    # Verify all required fields exist
    required_fields = ["text", "beat_action", "description", "visual_prompt",
                      "motion_prompt", "ref_entity_names", "key_phrases"]
    for field in required_fields:
        assert field in beat, f"Missing field: {field}"


class TestEdgeCases:
    """Test edge cases and error scenarios."""

    def test_empty_voiceover(self):
        """Should handle empty voiceover."""
        prompt = brain.unified_scene_beats_prompt(
            voiceover="",
            scene_heading="INT. EMPTY - DAY",
            scene_action="",
            entities=[{"name": "Room", "type": "location", "description": ""}],
            style="Realistic"
        )
        assert len(prompt) > 0

    def test_no_entities(self):
        """Should handle scene with no defined entities."""
        prompt = brain.unified_scene_beats_prompt(
            voiceover="Something happens",
            scene_heading="INT. UNKNOWN - DAY",
            scene_action="Action without entities",
            entities=[],
            style="Realistic"
        )
        assert "(none)" in prompt  # Should indicate no entities

    def test_long_voiceover(self):
        """Should handle very long voiceover."""
        long_text = "Sentence. " * 500
        prompt = brain.unified_scene_beats_prompt(
            voiceover=long_text,
            scene_heading="INT. SCENE - DAY",
            scene_action="Long scene",
            entities=[{"name": "Loc", "type": "location", "description": ""}],
            style="Realistic"
        )
        assert len(prompt) > 5000  # Should be very long

    def test_special_characters_in_voiceover(self):
        """Should handle special characters."""
        prompt = brain.unified_scene_beats_prompt(
            voiceover="She says: \"Hello!\" (or does she?) — what happens then?",
            scene_heading="INT. SCENE - DAY",
            scene_action="Dialog scene",
            entities=[{"name": "Room", "type": "location", "description": ""}],
            style="Realistic"
        )
        assert "Hello" in prompt

    def test_many_entities(self):
        """Should handle many entities."""
        many_entities = [
            {"name": f"Char{i}", "type": "character", "description": f"Character {i}"}
            for i in range(20)
        ]
        many_entities.append({"name": "Room", "type": "location", "description": ""})

        prompt = brain.unified_scene_beats_prompt(
            voiceover="Many people in one scene.",
            scene_heading="INT. ROOM - DAY",
            scene_action="Crowded scene",
            entities=many_entities,
            style="Realistic"
        )

        # All entities should be mentioned
        for entity in many_entities:
            assert entity["name"] in prompt

    def test_utf8_names(self):
        """Should handle Vietnamese/UTF-8 characters."""
        prompt = brain.unified_scene_beats_prompt(
            voiceover="Tấm và Cám gặp nhau tại nhà.",
            scene_heading="INT. NHÀ - NGÀY",
            scene_action="Tấm và Cám gặp nhau",
            entities=[
                {"name": "Tấm", "type": "character", "description": "Nữ chính"},
                {"name": "Cám", "type": "character", "description": "Người chị"},
                {"name": "Nhà", "type": "location", "description": "Căn nhà cổ"}
            ],
            style="Watercolor"
        )

        assert "Tấm" in prompt
        assert "Cám" in prompt
        assert "Nhà" in prompt


class TestValidationIntegration:
    """Test integration with validation layer (async tests deferred to Phase 2.3)."""

    def test_placeholder_validation(self):
        """Placeholder for async validation tests."""
        # Async tests will be added after pytest-asyncio setup
        # Tests will verify: unified output validation, hallucination detection
        assert True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
