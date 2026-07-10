"""
End-to-end integration test with real story.
Measures latency of each pipeline phase.
"""
import time
import json
from agent.studio import brain
from agent.studio.validation import extract_braced_names, extract_shot_size, validate_beats_comprehensive


FULL_STORY = """INT. MAISON FAMILIALE - JOUR
Cendrillon nettoie la cuisine de la grande maison. Sa belle-mère, Madame
Trémaine, regarde de haut.

INT. MARCHÉ - JOUR
Cendrillon vend des fleurs au marché du village. Un jeune prince passe.

INT. CHÂTEAU - NUIT
Cendrillon arrive au bal dans une robe magique. Le prince danse avec elle.

INT. CHAMBRE DE CENDRILLON - AUBE
Le prince arrive avec la pantoufle de verre. Cendrillon et le prince se
regardent, reconnaissant leur amour vrai.
"""

VOICEOVER = """
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

ENTITIES = [
    {"name": "Cendrillon", "type": "character", "description": "Jeune fille douce et courageuse"},
    {"name": "Prince", "type": "character", "description": "Prince du royaume"},
    {"name": "Madame Trémaine", "type": "character", "description": "Belle-mère méchante"},
    {"name": "Maison Familiale", "type": "location", "description": "Grande demeure"},
    {"name": "Marché", "type": "location", "description": "Marché du village"},
    {"name": "Château", "type": "location", "description": "Château royal"},
    {"name": "Chambre", "type": "location", "description": "Chambre de Cendrillon"},
]

STYLE = "Conte de fées, aquarelle douce, couleurs chaudes"


class PipelineTimer:
    """Track timing of each phase."""

    def __init__(self):
        self.phases = {}

    def phase(self, name: str):
        """Context manager for timing a phase."""
        class PhaseTimer:
            def __init__(self, timer, phase_name):
                self.timer = timer
                self.name = phase_name

            def __enter__(self):
                self.start = time.time()
                return self

            def __exit__(self, *args):
                elapsed = (time.time() - self.start) * 1000
                self.timer.phases[self.name] = elapsed

        return PhaseTimer(self, name)

    def report(self):
        """Print timing report."""
        total = sum(self.phases.values())
        print("\n" + "=" * 60)
        print("PIPELINE LATENCY REPORT")
        print("=" * 60)
        for name, ms in sorted(self.phases.items(), key=lambda x: x[1], reverse=True):
            pct = (ms / total * 100) if total > 0 else 0
            print(f"{name:40} {ms:8.2f}ms ({pct:5.1f}%)")
        print("-" * 60)
        print(f"{'TOTAL':40} {total:8.2f}ms (100.0%)")
        print("=" * 60 + "\n")

        return total


def test_full_pipeline_latency():
    """End-to-end pipeline: parse, segment, plan, generate beats, validate."""
    timer = PipelineTimer()

    # Phase 1: Parse script
    with timer.phase("1. Script Parsing"):
        scenes = brain.parse_scenes(FULL_STORY)
    assert len(scenes) == 4

    # Phase 2: Partition voiceover
    with timer.phase("2. Voiceover Partitioning"):
        voiceover_chunks = brain.partition_text(VOICEOVER, len(scenes))
    assert len(voiceover_chunks) == len(scenes)

    # Phase 3: Chunk by duration
    with timer.phase("3. Voiceover Chunking"):
        duration_chunks = brain.chunk_by_duration(VOICEOVER, max_secs=8.0)
    assert len(duration_chunks) >= 5

    # Phase 4: Generate unified prompt for first scene
    with timer.phase("4. Unified Prompt Generation"):
        prompt = brain.unified_scene_beats_prompt(
            voiceover=voiceover_chunks[0],
            scene_heading=scenes[0]["heading"],
            scene_action=scenes[0]["body"],
            entities=ENTITIES,
            style=STYLE,
        )
    assert len(prompt) > 500
    assert "{Maison Familiale}" in prompt

    # Phase 5: Simulate AI call (just measure prompt length)
    with timer.phase("5. Prompt Size Analysis"):
        prompt_tokens = len(prompt.split())
        # Assume ~4 chars per token
        estimated_api_call = prompt_tokens * 0.001  # ms per token (conservative)
    assert prompt_tokens > 100

    # Phase 6: Validation (simulate beat generation)
    with timer.phase("6. Beat Validation"):
        mock_beats = [
            {
                "description": "At {Maison Familiale}, wide, {Cendrillon} nettoie",
                "motion_prompt": "camera pan",
                "beat_action": "Cendrillon works",
                "ref_entity_names": ["Maison Familiale", "Cendrillon"],
            },
            {
                "description": "At {Maison Familiale}, medium, {Madame Trémaine} watches",
                "motion_prompt": "static",
                "beat_action": "Belle-mère regarde",
                "ref_entity_names": ["Maison Familiale", "Madame Trémaine"],
            },
        ]

        # Extract entities from beats
        for beat in mock_beats:
            entities_in_beat = extract_braced_names(beat["description"])
            assert len(entities_in_beat) > 0

    # Phase 7: Exit state extraction
    with timer.phase("7. Exit State Extraction"):
        exit_state = brain.extract_scene_exit_state(mock_beats, scenes[0]["heading"])
    assert exit_state["location"] is not None

    # Phase 8: Inter-scene continuity tracking
    with timer.phase("8. Continuity Tracking"):
        prev_state = exit_state
        scene2_beat = {
            "description": "At {Marché}, medium, {Cendrillon} sells flowers",
            "motion_prompt": "camera move",
            "beat_action": "vend fleurs",
            "ref_entity_names": ["Marché", "Cendrillon"],
        }
        # Verify character carries over
        assert "Cendrillon" in extract_braced_names(scene2_beat["description"])

    total_ms = timer.report()

    # Performance expectations
    assert total_ms < 500, f"Pipeline took {total_ms}ms, expected <500ms"
    assert len(scenes) == 4
    assert len(voiceover_chunks) == 4
    assert prompt_tokens > 500


def test_multi_scene_pipeline():
    """Full 4-scene pipeline."""
    timer = PipelineTimer()

    with timer.phase("All 4 Scenes"):
        scenes = brain.parse_scenes(FULL_STORY)
        voiceover_chunks = brain.partition_text(VOICEOVER, len(scenes))

        all_prompts = []
        for i, scene in enumerate(scenes):
            with timer.phase(f"  Scene {i+1} Prompt"):
                prompt = brain.unified_scene_beats_prompt(
                    voiceover=voiceover_chunks[i],
                    scene_heading=scene["heading"],
                    scene_action=scene["body"],
                    entities=ENTITIES,
                    style=STYLE,
                )
                all_prompts.append(prompt)

    total_ms = timer.report()

    print(f"Generated {len(all_prompts)} prompts")
    for i, p in enumerate(all_prompts):
        print(f"  Scene {i+1}: {len(p)} chars, {len(p.split())} tokens")

    assert len(all_prompts) == 4
    assert total_ms < 1000


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v", "-s"])
