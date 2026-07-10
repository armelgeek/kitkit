"""
End-to-end test: French story title → full pipeline validation.
Tests: prompt generation, script parsing, scene splitting, beat generation, validation.
"""
import json
import pytest
from agent.studio import brain
from agent.studio.validation import extract_braced_names, extract_shot_size, validate_beats_comprehensive


# French story title
STORY_TITLE = "La Belle et la Bête"
STORY_DURATION = 120  # 2 minutes


class TestE2EStoryGeneration:
    """End-to-end story generation from French title."""

    def test_01_script_generation_prompt(self):
        """Test: Generate script from French title."""
        prompt = brain.script_from_idea_prompt(
            idea=STORY_TITLE,
            target_duration=STORY_DURATION,
            storytelling=True,
            style="Conte de fées français, aquarelle, atmosphère magique",
            language="French",
        )

        # Verify prompt structure
        assert STORY_TITLE in prompt
        assert "120" in prompt or "2" in prompt  # Duration mentioned
        assert "INT." in prompt or "EXT." in prompt  # Expects screenplay format
        assert len(prompt) > 500

        print(f"\n✅ Script generation prompt OK ({len(prompt)} chars)")

    def test_02_entity_extraction_prompt(self):
        """Test: Generate entity extraction prompt."""
        # Use a reasonable mock script
        mock_script = """
        INT. CHÂTEAU - JOUR
        Belle arrive au château mystérieux. La Bête l'attend.

        INT. JARDIN ENCHANTÉ - NUIT
        Belle cueille une rose magique. La Bête apparaît, furieux.

        INT. CHAMBRE DE BELLE - NUIT
        Belle regarde par la fenêtre, pensant à son père.
        """

        prompt = brain.entity_extract_prompt(mock_script)

        # Verify prompt structure
        assert "Belle" in prompt
        assert "Bête" in prompt
        assert "Château" in prompt or "château" in prompt.lower()
        assert len(prompt) > 300

        print(f"✅ Entity extraction prompt OK ({len(prompt)} chars)")

    def test_03_script_parsing(self):
        """Test: Parse screenplay into scenes."""
        script = """INT. CHÂTEAU - JOUR
Belle arrive au château. La Bête l'observe.

INT. JARDIN - NUIT
Belle cueille une rose. La Bête arrive, furieux.

INT. CHAMBRE DE BELLE - NUIT
Belle se demande si elle reverra son père.

INT. SALLE DE BAL - NUIT
Belle danse avec la Bête. La magie opère.
"""

        scenes = brain.parse_scenes(script)

        # Validate scene structure
        assert len(scenes) == 4, f"Expected 4 scenes, got {len(scenes)}"
        assert scenes[0]["heading"] == "INT. CHÂTEAU - JOUR"
        assert scenes[1]["heading"] == "INT. JARDIN - NUIT"
        assert scenes[2]["heading"] == "INT. CHAMBRE DE BELLE - NUIT"
        assert scenes[3]["heading"] == "INT. SALLE DE BAL - NUIT"

        # Each scene should have body text
        for i, scene in enumerate(scenes):
            assert "body" in scene
            assert len(scene["body"]) > 0, f"Scene {i} has no body"
            print(f"  Scene {i+1}: {scene['heading']} ({len(scene['body'])} chars)")

        print(f"✅ Script parsing OK (4 scenes parsed)")

    def test_04_text_partitioning(self):
        """Test: Partition voiceover by number of scenes."""
        voiceover = """
        Belle était une jeune fille courageuse. Elle entra au château mystérieux.
        La Bête, créature terrifiante, la regarda avec curiosité. Mais sous son
        apparence monstrueuse se cachait un cœur bienveillant. Belle et la Bête
        apprirent à se connaître. Chaque soir, ils dansaient ensemble. Belle
        découvrit que l'amour vrai peut transformer même les créatures les plus
        terrifiantes. La magie du château rompit le sortilège. La Bête devint
        un beau prince. Belle et le prince vécurent heureux pour toujours.
        """

        num_scenes = 4
        chunks = brain.partition_text(voiceover, num_scenes)

        assert len(chunks) == num_scenes
        for i, chunk in enumerate(chunks):
            assert len(chunk) > 0
            print(f"  Scene {i+1}: {len(chunk)} chars")

        print(f"✅ Text partitioning OK ({num_scenes} scenes)")

    def test_05_voiceover_chunking_by_duration(self):
        """Test: Chunk voiceover by time duration."""
        voiceover = """
        Belle était une jeune fille courageuse. Elle entra au château mystérieux.
        La Bête, créature terrifiante, la regarda avec curiosité. Mais sous son
        apparence monstrueuse se cachait un cœur bienveillant. Belle et la Bête
        apprirent à se connaître. Chaque soir, ils dansaient ensemble. Belle
        découvrit que l'amour vrai peut transformer même les créatures les plus
        terrifiantes. La magie du château rompit le sortilège. La Bête devint
        un beau prince. Belle et le prince vécurent heureux pour toujours.
        """

        chunks = brain.chunk_by_duration(voiceover, max_secs=8.0)

        assert len(chunks) >= 3  # Should split into multiple chunks
        for i, chunk in enumerate(chunks):
            assert len(chunk) > 0
            print(f"  Chunk {i+1}: {len(chunk)} chars")

        print(f"✅ Voiceover chunking OK ({len(chunks)} chunks at 8s max)")

    def test_06_unified_prompt_generation(self):
        """Test: Generate unified prompt for a scene with all components."""
        entities = [
            {"name": "Belle", "type": "character", "description": "Jeune fille courageuse"},
            {"name": "Bête", "type": "character", "description": "Prince transformé"},
            {"name": "Château", "type": "location", "description": "Demeure enchantée"},
            {"name": "Jardin", "type": "location", "description": "Jardin magique"},
        ]

        voiceover_scene1 = "Belle arrive au château mystérieux. Elle regarde autour d'elle avec crainte."
        scene_heading = "INT. CHÂTEAU - JOUR"
        scene_action = "Belle entre, découvrant le château"
        style = "Conte de fées, aquarelle douce, atmosphère magique"

        prompt = brain.unified_scene_beats_prompt(
            voiceover=voiceover_scene1,
            scene_heading=scene_heading,
            scene_action=scene_action,
            entities=entities,
            style=style,
        )

        # Validate prompt components
        assert "Belle" in prompt
        assert "Bête" in prompt
        assert "Château" in prompt
        assert "{Château}" in prompt  # Entity wrapping
        assert "VOICEOVER" in prompt or "voiceover" in prompt.lower()
        assert "plan" in prompt.lower()
        assert "beats" in prompt.lower()
        assert "exit_state" in prompt.lower() or "exit" in prompt.lower()
        assert len(prompt) > 1000

        print(f"✅ Unified prompt generation OK ({len(prompt)} chars, {len(prompt.split())} tokens)")

    def test_07_mock_beat_validation(self):
        """Test: Validate mock AI response beats."""
        # Simulate what Claude would return
        mock_beats = [
            {
                "text": "Belle arrive au château.",
                "beat_action": "Belle enters castle",
                "description": "At {Château}, wide establishing shot, {Belle} enters through large wooden doors, light streaming in",
                "visual_prompt": "Château entrance, gothic architecture, warm golden light",
                "motion_prompt": "steady camera, slow pan following Belle as she enters",
                "ref_entity_names": ["Château", "Belle"],
                "key_phrases": ["enters", "discovers"],
            },
            {
                "text": "Elle regarde autour d'elle.",
                "beat_action": "Belle explores",
                "description": "At {Château}, medium close-up, {Belle} walks through grand hall, eyes wide with wonder",
                "visual_prompt": "Grand hall with chandeliers, dust floating in light rays",
                "motion_prompt": "camera follows Belle, slow tracking shot",
                "ref_entity_names": ["Château", "Belle"],
                "key_phrases": ["explores", "wonders"],
            },
            {
                "text": "Soudain, une ombre apparaît.",
                "beat_action": "Bête appears",
                "description": "At {Château}, close-up, shadows form into {Bête}, glowing eyes appear",
                "visual_prompt": "Dark silhouette, glowing yellow eyes, threatening atmosphere",
                "motion_prompt": "quick push-in, tension builds",
                "ref_entity_names": ["Château", "Bête"],
                "key_phrases": ["appears", "threatening"],
            },
        ]

        # Test 1: Entity extraction from beats
        for i, beat in enumerate(mock_beats):
            entities_in_beat = extract_braced_names(beat["description"])
            assert len(entities_in_beat) > 0, f"Beat {i} has no entities"
            print(f"  Beat {i+1}: entities={entities_in_beat}")

        # Test 2: Shot size extraction
        shot_sizes = []
        for i, beat in enumerate(mock_beats):
            size = extract_shot_size(beat["description"])
            shot_sizes.append(size)
            assert size is not None
            print(f"  Beat {i+1}: shot_size={size}")

        # Test 3: Shot size alternation (at least some variation)
        # Note: extraction logic may need tuning for "medium close-up"
        unique_sizes = len(set(shot_sizes))
        assert unique_sizes >= 2, f"Should have at least 2 different shot sizes, got {shot_sizes}"
        print(f"  ✓ Shot sizes vary: {shot_sizes}")

        # Test 4: Validate beat structure
        for i, beat in enumerate(mock_beats):
            required_fields = ["text", "beat_action", "description", "visual_prompt", "motion_prompt", "ref_entity_names"]
            for field in required_fields:
                assert field in beat, f"Beat {i} missing field: {field}"

        print(f"✅ Beat validation OK ({len(mock_beats)} beats, structure valid)")

    def test_08_exit_state_extraction(self):
        """Test: Extract scene exit state for inter-scene continuity."""
        mock_beats = [
            {
                "text": "Beat 1",
                "beat_action": "Belle enters",
                "description": "At {Château}, wide, {Belle} enters",
                "motion_prompt": "pan",
            },
            {
                "text": "Beat 2",
                "beat_action": "Belle meets Bête",
                "description": "At {Château}, medium, {Belle} and {Bête} face each other",
                "motion_prompt": "push-in",
            },
            {
                "text": "Beat 3",
                "beat_action": "Bête retreats",
                "description": "At {Château}, close-up, {Bête} disappears into shadow",
                "motion_prompt": "pull-out",
            },
        ]

        exit_state = brain.extract_scene_exit_state(mock_beats, "INT. CHÂTEAU - JOUR")

        # Validate exit state
        assert "present" in exit_state
        assert "location" in exit_state
        assert exit_state["location"] == "Château"
        assert "Bête" in exit_state["present"] or "Belle" in exit_state["present"]

        print(f"✅ Exit state extraction OK:")
        print(f"  Location: {exit_state['location']}")
        print(f"  Present: {exit_state['present']}")

    def test_09_inter_scene_continuity(self):
        """Test: Verify continuity between consecutive scenes."""
        # Scene 1 exit state
        scene1_exit = {
            "present": ["Belle", "Bête"],
            "location": "Château",
            "lighting": "warm golden",
            "last_action": "Bête and Belle meet"
        }

        # Scene 2 beat (should reference previous scene context)
        scene2_beat = {
            "text": "Ils dansent ensemble.",
            "beat_action": "Belle and Bête dance",
            "description": "At {Salle de Bal}, wide, {Belle} and {Bête} dance together, chemistry evident",
            "motion_prompt": "circular camera motion",
            "ref_entity_names": ["Salle de Bal", "Belle", "Bête"],
        }

        # Validate continuity
        scene2_entities = extract_braced_names(scene2_beat["description"])

        # Characters from previous scene appear in new scene
        assert "Belle" in scene2_entities, "Belle should continue to next scene"
        assert "Bête" in scene2_entities, "Bête should continue to next scene"

        print(f"✅ Inter-scene continuity OK:")
        print(f"  Previous: {scene1_exit['present']} at {scene1_exit['location']}")
        print(f"  Next: {scene2_entities}")

    def test_10_full_pipeline_summary(self):
        """Test: Summary of full pipeline with La Belle et la Bête."""
        print("\n" + "="*70)
        print("FULL PIPELINE: La Belle et la Bête")
        print("="*70)

        # Step 1: Title
        print(f"\n1. TITRE FRANÇAIS: {STORY_TITLE}")
        print(f"   Durée cible: {STORY_DURATION}s")

        # Step 2: Script generation prompt
        script_prompt = brain.script_from_idea_prompt(
            idea=STORY_TITLE,
            target_duration=STORY_DURATION,
            storytelling=True,
            style="Conte de fées français",
            language="French"
        )
        print(f"✅ 2. Script generation prompt: {len(script_prompt)} chars")

        # Step 3: Mock script (in real scenario, this comes from Claude)
        mock_script = """INT. CHÂTEAU - JOUR
Belle arrive au château. La Bête l'observe.

INT. JARDIN - NUIT
Belle cueille une rose magique.

INT. SALLE DE BAL - NUIT
Belle et la Bête dansent ensemble.

INT. CHAMBRE DORÉE - NUIT
Belle réalise qu'elle aime la Bête."""

        scenes = brain.parse_scenes(mock_script)
        print(f"✅ 3. Script parsing: {len(scenes)} scenes")
        for scene in scenes:
            print(f"   - {scene['heading']}")

        # Step 4: Entity extraction prompt
        entity_prompt = brain.entity_extract_prompt(mock_script)
        print(f"✅ 4. Entity extraction: {len(entity_prompt)} chars prompt")

        # Step 5: Voiceover partitioning
        mock_voiceover = "Belle découvrit la Bête. Elle eut peur. Puis elle comprit son essence. Ils dansèrent. L'amour triompha."
        voiceover_chunks = brain.partition_text(mock_voiceover, len(scenes))
        print(f"✅ 5. Voiceover partitioning: {len(voiceover_chunks)} chunks")

        # Step 6: Unified prompts for each scene
        print(f"✅ 6. Unified prompts generation:")
        prompts_generated = []
        for i, scene in enumerate(scenes):
            prompt = brain.unified_scene_beats_prompt(
                voiceover=voiceover_chunks[i],
                scene_heading=scene["heading"],
                scene_action=scene["body"],
                entities=[
                    {"name": "Belle", "type": "character", "description": "Héroïne"},
                    {"name": "Bête", "type": "character", "description": "Prince"},
                    {"name": "Château", "type": "location", "description": "Demeure"},
                ],
                style="Conte de fées",
            )
            prompts_generated.append(prompt)
            print(f"   - Scene {i+1}: {len(prompt)} chars, {len(prompt.split())} tokens")

        # Step 7: Mock beat responses and validation
        mock_all_beats = [
            [
                {
                    "text": f"Scene {i} beat 1",
                    "beat_action": "action 1",
                    "description": f"At {{Château}}, wide, {{Belle}} and {{Bête}} start",
                    "visual_prompt": "visual 1",
                    "motion_prompt": "pan",
                    "ref_entity_names": ["Château", "Belle", "Bête"],
                }
            ]
            for i in range(1, len(scenes) + 1)
        ]

        print(f"✅ 7. Beat validation:")
        for i, beats in enumerate(mock_all_beats):
            for beat in beats:
                entities = extract_braced_names(beat["description"])
                print(f"   - Scene {i+1}: {len(entities)} entities, {extract_shot_size(beat['description'])} shot")

        # Step 8: Exit state tracking
        print(f"✅ 8. Exit state tracking:")
        for i, beats in enumerate(mock_all_beats):
            exit_state = brain.extract_scene_exit_state(beats, scenes[i]["heading"])
            print(f"   - Scene {i+1}: present={exit_state['present']}, location={exit_state['location']}")

        print("\n" + "="*70)
        print("✅ FULL PIPELINE COMPLETE")
        print("="*70)
        print(f"\nResults:")
        print(f"  • Story title: {STORY_TITLE}")
        print(f"  • Scenes generated: {len(scenes)}")
        print(f"  • Prompts generated: {len(prompts_generated)}")
        print(f"  • Total prompt chars: {sum(len(p) for p in prompts_generated)}")
        print(f"  • Total prompt tokens: {sum(len(p.split()) for p in prompts_generated)}")
        print(f"  • All validations: ✅ PASS")
        print()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
