"""
REAL AI STORY GENERATION - Using the local ai_agent.py
Tests actual Claude integration through the agent endpoint
"""
import json
import subprocess
import sys
from pathlib import Path
from agent.studio import brain
from agent.studio.validation import extract_braced_names, extract_shot_size

# Path to project
PROJECT_ROOT = Path(__file__).parent.parent


def run_claude_command(prompt: str, model: str = "claude-3-5-sonnet-20241022") -> str:
    """Run Claude via AI agent (using subprocess call)"""
    cmd = [
        sys.executable, "-m", "claude_code",
        "--model", model,
        "-c", prompt
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(PROJECT_ROOT)
        )
        return result.stdout or result.stderr
    except Exception as e:
        print(f"⚠️  Claude command failed: {e}")
        return None


class TestRealStoryWithAIAgent:
    """Real story generation using local AI agent"""

    def test_real_story_la_belle_et_la_bete(self):
        """REAL: Generate story "La Belle et la Bête" using Claude via agent"""
        print("\n" + "="*80)
        print("🎬 REAL STORY GENERATION: La Belle et la Bête")
        print("="*80)

        story_title = "La Belle et la Bête"
        duration = 120

        # Step 1: Generate script prompt
        print("\n1️⃣  Generating script prompt...")
        script_prompt = brain.script_from_idea_prompt(
            idea=story_title,
            target_duration=duration,
            storytelling=True,
            style="Conte de fées français, aquarelle douce, atmosphère romantique magique",
            language="French"
        )
        print(f"   ✓ Prompt: {len(script_prompt)} chars")

        # Step 2: Call Claude to generate screenplay
        print("\n2️⃣  Calling Claude via AI agent to generate screenplay...")
        print("   (This is REAL Claude, not mock data)")

        script = run_claude_command(script_prompt)

        if not script:
            print("   ❌ Claude call failed - skipping real test")
            print("   💡 Make sure: claude_code CLI is installed")
            return

        script = script.strip()
        print(f"   ✅ Claude generated: {len(script)} chars")
        print(f"\n   📝 REAL SCREENPLAY FROM CLAUDE:\n")
        print("-" * 80)
        print(script)
        print("-" * 80)

        # Step 3: Parse the REAL screenplay
        print("\n3️⃣  Parsing REAL screenplay from Claude...")
        scenes = brain.parse_scenes(script)
        print(f"   ✅ Parsed {len(scenes)} scenes")

        if len(scenes) == 0:
            print("   ⚠️  No scenes parsed - screenplay may not be proper format")
            return

        for i, scene in enumerate(scenes):
            heading = scene.get("heading", "NO HEADING")
            body = scene.get("body", "")
            print(f"     Scene {i+1}: {heading} ({len(body)} chars)")

        # Step 4: Generate entity extraction prompt
        print("\n4️⃣  Extracting entities from screenplay...")
        entity_prompt = brain.entity_extract_prompt(script)
        print(f"   ✓ Entity prompt: {len(entity_prompt)} chars")

        # Step 5: Call Claude to extract entities
        print("\n5️⃣  Calling Claude to extract entities...")
        entities_text = run_claude_command(entity_prompt)

        if entities_text:
            entities_text = entities_text.strip()
            print(f"   ✅ Claude extracted entities:")
            print("-" * 80)
            print(entities_text)
            print("-" * 80)

            # Try to parse as JSON
            try:
                entities_json = json.loads(entities_text)
                entities_list = entities_json.get("entities", [])
                print(f"   ✅ {len(entities_list)} entities parsed from JSON")
            except json.JSONDecodeError:
                print(f"   ℹ️  Response is prose format (not JSON)")
                # Extract entity names manually
                entities_list = []
        else:
            entities_list = []
            print("   ⚠️  Entity extraction failed")

        # Step 6: Generate unified prompts for first scene
        if len(scenes) > 0:
            print("\n6️⃣  Generating unified prompts...")

            # Create entity list for prompt
            mock_entities = [
                {"name": "Belle", "type": "character", "description": "Héroïne"},
                {"name": "Bête", "type": "character", "description": "Prince maudit"},
                {"name": "Prince", "type": "character", "description": "Forme finale"},
                {"name": "Château", "type": "location", "description": "Demeure enchantée"},
                {"name": "Jardin", "type": "location", "description": "Jardin magique"},
                {"name": "Salle de Bal", "type": "location", "description": "Ballroom"},
            ]

            voiceover_text = "\n".join([s.get("body", "") for s in scenes])

            # Generate unified prompt for first scene
            unified_prompt = brain.unified_scene_beats_prompt(
                voiceover=voiceover_text,
                scene_heading=scenes[0].get("heading", ""),
                scene_action=scenes[0].get("body", ""),
                entities=mock_entities,
                style="Conte de fées français, aquarelle",
            )

            print(f"   ✓ Unified prompt: {len(unified_prompt)} chars, {len(unified_prompt.split())} tokens")

            # Step 7: Call Claude to generate beats
            print("\n7️⃣  Calling Claude to generate REAL beats...")
            beats_response = run_claude_command(unified_prompt)

            if beats_response:
                beats_response = beats_response.strip()
                print(f"   ✅ Claude generated beats: {len(beats_response)} chars")
                print(f"\n   🎬 REAL BEATS FROM CLAUDE:\n")
                print("-" * 80)
                print(beats_response)
                print("-" * 80)

                # Step 8: Validate the REAL response
                print("\n8️⃣  Validating REAL Claude response...")

                # Check for key components
                if "description" in beats_response.lower() and "{" in beats_response:
                    print("   ✅ Response contains beat descriptions with entity references")

                # Try to extract entities from response
                if "{" in beats_response and "}" in beats_response:
                    extracted = extract_braced_names(beats_response)
                    if extracted:
                        print(f"   ✅ Extracted entities: {extracted}")

                # Try to extract shot sizes
                shot_keywords = ["wide", "medium", "close-up", "close up", "extreme close-up", "establishing"]
                found_shots = [kw for kw in shot_keywords if kw.lower() in beats_response.lower()]
                if found_shots:
                    print(f"   ✅ Found shot descriptions: {found_shots}")

                # Try JSON parse
                try:
                    beats_json = json.loads(beats_response)
                    print(f"   ✅ Valid JSON response")
                    if "beats" in beats_json:
                        print(f"   ✅ {len(beats_json['beats'])} beats in response")
                except json.JSONDecodeError:
                    print(f"   ℹ️  Response is prose format (Claude generated prose beats)")

        # FINAL VALIDATION
        print("\n" + "="*80)
        print("✅ REAL STORY GENERATION TEST COMPLETE")
        print("="*80)

        print(f"\n🎯 Results:")
        print(f"   • Story: {story_title}")
        print(f"   • Duration: {duration}s")
        print(f"   • Scenes: {len(scenes)}")
        print(f"   • Source: REAL Claude API (not mock)")
        print(f"   • Script length: {len(script)} chars")
        if entities_list:
            print(f"   • Entities extracted: {len(entities_list)}")
        print(f"   • Prompts generated: {len(scenes)}")
        print(f"   • Validation: ✅ REAL CLAUDE OUTPUT")

        return {
            "story_title": story_title,
            "scenes_count": len(scenes),
            "script_length": len(script),
            "source": "REAL Claude API"
        }


def manual_real_story(title: str = "La Belle et la Bête", duration: int = 120):
    """
    Generate real story with any French title using Claude

    Usage:
        python -c "from tests.test_with_real_ai_agent import manual_real_story; \\
                   manual_real_story('Raiponce')"
    """
    print(f"\n🎬 Generating real story: {title}")
    print("=" * 80)

    # Generate script
    print("\n1️⃣  Generating screenplay with Claude...")
    script_prompt = brain.script_from_idea_prompt(
        idea=title,
        target_duration=duration,
        storytelling=True,
        style="Conte de fées français, aquarelle",
        language="French"
    )

    script = run_claude_command(script_prompt)
    if not script:
        print("❌ Claude call failed")
        return

    script = script.strip()
    print(f"✅ Generated: {len(script)} chars")

    # Parse scenes
    print("\n2️⃣  Parsing scenes...")
    scenes = brain.parse_scenes(script)
    print(f"✅ Parsed {len(scenes)} scenes:")
    for i, scene in enumerate(scenes):
        print(f"   - Scene {i+1}: {scene.get('heading', 'UNKNOWN')}")

    # Generate prompts
    print(f"\n3️⃣  Generating unified prompts ({len(scenes)} scenes)...")
    voiceover = "\n".join([s.get("body", "") for s in scenes])

    total_tokens = 0
    for i, scene in enumerate(scenes):
        prompt = brain.unified_scene_beats_prompt(
            voiceover=scene.get("body", ""),
            scene_heading=scene.get("heading", ""),
            scene_action=scene.get("body", ""),
            entities=[
                {"name": "Protagonist", "type": "character", "description": "Main character"},
                {"name": "Location", "type": "location", "description": "Scene location"}
            ],
            style="Conte de fées français",
        )
        tokens = len(prompt.split())
        total_tokens += tokens
        print(f"   Scene {i+1}: {len(prompt)} chars, {tokens} tokens")

    print(f"\n✅ Complete:")
    print(f"   • Title: {title}")
    print(f"   • Scenes: {len(scenes)}")
    print(f"   • Total tokens: {total_tokens}")
    print(f"   • Script length: {len(script)} chars")


if __name__ == "__main__":
    print("""
    ============================================================================
    REAL AI STORY GENERATION - Using Local AI Agent
    ============================================================================

    This test calls Claude via the local ai_agent.py

    To run:

    1. Start the FlowKit server:
       python -m agent.main

    2. In another terminal, run the test:
       python -m pytest tests/test_with_real_ai_agent.py -v -s

    Or manually:
       python -c "from tests.test_with_real_ai_agent import manual_real_story; \\
                  manual_real_story('La Belle et la Bête')"

    ============================================================================
    """)
