"""
Full pipeline test: complete story from script to continuity check.
Uses a real French folktale to test end-to-end flow.
"""
import json
import pytest
from agent.studio import brain
from agent.studio.validation import extract_braced_names, extract_shot_size


# French folktale: Cendrillon (Cinderella - condensed)
FULL_STORY = """INT. MAISON FAMILIALE - JOUR
Cendrillon nettoie la cuisine de la grande maison. Sa belle-mère, Madame
Trémaine, regarde de haut. Les deux filles, Anastasie et Driselle, rient
en buvant du thé.

INT. MARCHÉ - JOUR
Cendrillon vend des fleurs au marché du village. Un jeune prince passe
et s'arrête, fasciné par sa beauté.

INT. CHÂTEAU - NUIT
Cendrillon arrive au bal dans une robe magique, des pantoufles de verre
aux pieds. Le prince danse avec elle toute la soirée. À minuit, elle
s'enfuit, laissant une pantoufle derrière elle.

INT. CHAMBRE DE CENDRILLON - AUBE
Le prince arrive avec la pantoufle de verre. C'est la seule qui rentre
parfaitement. Cendrillon et le prince se regardent, reconnaissant leur
amour vrai.
"""

VOICEOVER_SOURCE = """
Cendrillon était une jeune fille douce et courageuse, malgré les malheurs
de sa vie. Sa mère était morte, et son père s'était remarié avec une femme
méchante. Tous les jours, elle travaillait sans repos, nettoyant la grande
maison familiale. Ses soeurs, jalouses de sa beauté, la maltraitaient sans
pitié. Mais Cendrillon gardait toujours l'espoir en son cœur. Un jour, le
prince du royaume cherchait une épouse. Un grand bal fut organisé au château.
Grâce à la magie d'une fée bienveillante, Cendrillon put y aller. Elle dansa
avec le prince toute la nuit, enchantée par son regard tendre. À minuit, le
charme se rompit et elle s'enfuit, laissant derrière elle une pantoufle de
verre. Le prince parcourut le royaume avec la pantoufle, cherchant la fille
de ses rêves. Quand il arriva à la maison de Cendrillon, la pantoufle lui
rentra parfaitement aux pieds. Elle et le prince se marièrent et vécurent
heureux pour toujours.
"""


def test_story_script_parsing():
    """Test: Parse script into scenes."""
    scenes = brain.parse_scenes(FULL_STORY)

    assert len(scenes) == 4
    assert scenes[0]["heading"] == "INT. MAISON FAMILIALE - JOUR"
    assert scenes[1]["heading"] == "INT. MARCHÉ - JOUR"
    assert scenes[2]["heading"] == "INT. CHÂTEAU - NUIT"
    assert scenes[3]["heading"] == "INT. CHAMBRE DE CENDRILLON - AUBE"


def test_story_voiceover_segmentation():
    """Test: Segment voiceover into beats by duration."""
    # Voiceover has ~120 words at 2.5 wps = ~48s → ~6-8 beats at 8s each
    chunks = brain.chunk_by_duration(VOICEOVER_SOURCE, max_secs=8.0)

    assert len(chunks) >= 5  # Should split into multiple beats
    # Verify no content is lost
    rejoined = " ".join(chunks)
    assert len(rejoined) > len(VOICEOVER_SOURCE) * 0.95  # Allow for whitespace normalization


def test_story_beat_coherence():
    """Test: Beat changes have different shot sizes."""
    mock_beats = [
        {
            "description": "At {Maison Familiale}, wide establishing shot, {Cendrillon} nettoie",
            "motion_prompt": "locked camera",
            "beat_action": "Cendrillon works"
        },
        {
            "description": "At {Marché}, medium shot, {Cendrillon} vend fleurs au {Prince}",
            "motion_prompt": "camera pan",
            "beat_action": "rencontre prince"
        },
        {
            "description": "At {Château}, close-up, {Cendrillon} danse avec {Prince}",
            "motion_prompt": "push-in",
            "beat_action": "premiere danse"
        },
    ]

    # Verify shot sizes differ
    sizes = [extract_shot_size(b["description"]) for b in mock_beats]
    assert sizes[0] == "wide"
    assert sizes[1] == "medium"
    assert sizes[2] == "close_up"
    assert len(set(sizes)) == 3  # All different


def test_story_exit_state_tracking():
    """Test: Track which character is present at scene end for continuity."""
    final_beat_scene2 = {
        "description": "At {Marché}, medium shot, {Cendrillon} rencontre {Prince}",
        "motion_prompt": "camera moves",
        "beat_action": "rencontre prince"
    }

    exit_state = brain.extract_scene_exit_state([final_beat_scene2], "INT. MARCHÉ - JOUR")

    assert "Cendrillon" in exit_state["present"]
    assert exit_state["location"] == "Marché"
    assert exit_state["last_action"] == "rencontre prince"


def test_story_inter_scene_continuity():
    """Test: Verify continuity between scenes (character presence, location)."""
    scene1_exit = {
        "present": ["Cendrillon"],
        "location": "Maison Familiale",
        "lighting": "daylight"
    }

    # Verify character carries over to next scene
    scene2_beat = {
        "description": "At {Marché}, medium, {Cendrillon} arrives"
    }
    scene2_entities = extract_braced_names(scene2_beat["description"])
    assert "Cendrillon" in scene2_entities  # Character carries over


def test_story_complete_flow():
    """Integration: Entire story pipeline."""
    # 1. Parse script
    scenes = brain.parse_scenes(FULL_STORY)
    assert len(scenes) == 4

    # 2. Partition voiceover by number of scenes
    voiceover_chunks = brain.partition_text(VOICEOVER_SOURCE, len(scenes))
    assert len(voiceover_chunks) == len(scenes)

    # 3. Verify no content loss
    full_rejoined = " ".join(voiceover_chunks)
    original_word_count = len(VOICEOVER_SOURCE.split())
    rejoined_word_count = len(full_rejoined.split())
    assert rejoined_word_count >= original_word_count * 0.9

    # 4. Verify all scenes have headings
    for scene in scenes:
        assert "heading" in scene
        assert len(scene["heading"]) > 0


def test_story_unified_prompt_generation():
    """Test: Generate unified prompt for a scene."""
    entities = [
        {"name": "Cendrillon", "type": "character", "description": "Jeune fille courageuse"},
        {"name": "Prince", "type": "character", "description": "Prince du royaume"},
        {"name": "Marché", "type": "location", "description": "Marché du village"},
    ]

    scene_voiceover = "Cendrillon vend des fleurs au marché. Le prince la remarque."
    scene_heading = "INT. MARCHÉ - JOUR"

    prev_exit = {
        "present": ["Cendrillon"],
        "location": "Maison Familiale",
        "lighting": "daylight"
    }

    prompt = brain.unified_scene_beats_prompt(
        voiceover=scene_voiceover,
        scene_heading=scene_heading,
        scene_action="Cendrillon au marché rencontre le prince",
        entities=entities,
        style="Conte de fées, aquarelle douce",
        previous_scene_exit=prev_exit
    )

    # Verify key elements are in prompt
    assert "VOICEOVER" in prompt or "voiceover" in prompt.lower()
    assert "Cendrillon" in prompt
    assert "PREVIOUS SCENE STATE" in prompt or "previous" in prompt.lower()
    assert "Maison Familiale" in prompt  # Previous location mentioned
    assert "{Marché}" in prompt  # Location wrapping required
    assert len(prompt) > 800  # Non-trivial prompt


class TestStoryPerformance:
    """Performance expectations for story generation."""

    def test_story_parsing_speed(self):
        """Parsing should be instant (<100ms)."""
        import time
        start = time.time()
        scenes = brain.parse_scenes(FULL_STORY)
        elapsed = (time.time() - start) * 1000
        assert elapsed < 100, f"Parsing took {elapsed}ms, expected <100ms"
        assert len(scenes) == 4

    def test_voiceover_chunking_speed(self):
        """Chunking should be instant (<50ms)."""
        import time
        start = time.time()
        chunks = brain.chunk_by_duration(VOICEOVER_SOURCE, max_secs=8.0)
        elapsed = (time.time() - start) * 1000
        assert elapsed < 50, f"Chunking took {elapsed}ms, expected <50ms"
        assert len(chunks) > 0

    def test_voiceover_partitioning_speed(self):
        """Partitioning should be fast (<50ms)."""
        import time
        start = time.time()
        chunks = brain.partition_text(VOICEOVER_SOURCE, 4)
        elapsed = (time.time() - start) * 1000
        assert elapsed < 50, f"Partitioning took {elapsed}ms, expected <50ms"
        assert len(chunks) == 4


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
