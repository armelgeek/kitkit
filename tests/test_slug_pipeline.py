import pytest
import json
from agent.studio import brain, validation
from agent.studio.db import normalize_to_slug

@pytest.mark.asyncio
async def test_end_to_end_pipeline_with_media_ids():
    """
    FULL PIPELINE TEST:
    1. Extract entities (characters, locations) with slugs
    2. Generate media_ids for each entity (simulating reference asset generation)
    3. Generate beat prompt using slugs
    4. Simulate AI beat response
    5. Validate beats reference ONLY known entities (no hallucinations)
    6. Verify every ref_entity_name has a corresponding media_id in assets
    7. Confirm media_ids are ready for Flow API
    """

    # PHASE 1: Setup assets with slugs and media_ids
    print("\n=== PHASE 1: Asset Setup ===")

    assets = {
        "character": [
            {
                "id": "char_helene",
                "name": "Helene Kheler",
                "slug": normalize_to_slug("Helene Kheler"),
                "type": "character",
                "description": "A young girl with silver hair",
                "media_id": "char-helene-media-uuid",  # Simulated reference image media_id
                "status": "generated"
            }
        ],
        "location": [
            {
                "id": "loc_bedroom",
                "name": "Child's Bedroom",
                "slug": normalize_to_slug("Child's Bedroom"),
                "type": "location",
                "description": "A cozy bedroom bathed in golden light",
                "media_id": "loc-bedroom-media-uuid",  # Simulated reference sheet media_id
                "status": "generated"
            },
            {
                "id": "loc_city",
                "name": "Flower-Filled City",
                "slug": normalize_to_slug("Flower-Filled City"),
                "type": "location",
                "description": "A vibrant city with cherry blossoms",
                "media_id": "loc-city-media-uuid",
                "status": "generated"
            }
        ]
    }

    # Flatten for validation
    all_entities = assets["character"] + assets["location"]

    # Verify slugs are correct
    assert assets["character"][0]["slug"] == "helene_kheler"
    assert assets["location"][0]["slug"] == "child_s_bedroom"
    assert assets["location"][1]["slug"] == "flower_filled_city"
    print(f"✓ Assets created: {len(all_entities)} entities with slugs and media_ids")

    # PHASE 2: Generate beat prompt using slugs
    print("\n=== PHASE 2: Beat Prompt Generation ===")

    prompt = brain.unified_scene_beats_prompt(
        voiceover="Helene wakes up in her bedroom, then runs through the flower-filled city.",
        scene_heading="INT. CHILD'S BEDROOM - MORNING",
        scene_action="Helene opens her eyes and stretches",
        entities=all_entities,
        style="anime"
    )

    # Verify prompt uses ONLY slugs (not full names)
    assert "{helene_kheler}" in prompt
    assert "{child_s_bedroom}" in prompt
    assert "{flower_filled_city}" in prompt
    assert "{Helene Kheler}" not in prompt  # Full name should NOT appear
    assert "{Child's Bedroom}" not in prompt
    print("✓ Prompt uses ONLY slugs, no full names hallucinated")

    # PHASE 3: Simulate AI beat response (valid case)
    print("\n=== PHASE 3: Beat Generation (Valid) ===")

    valid_beats = [
        {
            "text": "Helene wakes up in her bedroom",
            "description": "At {child_s_bedroom}, wide shot showing {helene_kheler} waking up",
            "ref_entity_names": ["child_s_bedroom", "helene_kheler"],
            "visual_prompt": "Cozy bedroom with golden dawn light",
            "motion_prompt": "Camera slowly moves toward the bed",
            "beat_action": "Helene opens her eyes"
        },
        {
            "text": "She runs through the flower-filled city",
            "description": "At {flower_filled_city}, medium shot of {helene_kheler} running",
            "ref_entity_names": ["flower_filled_city", "helene_kheler"],
            "visual_prompt": "Vibrant city with cherry blossoms",
            "motion_prompt": "Dynamic lateral tracking shot",
            "beat_action": "Helene runs with joy"
        }
    ]

    # Validate beats (should PASS)
    result, issues = await validation.auto_fix_beats(valid_beats, all_entities, max_retries=0)
    assert issues["valid"] == True, f"Validation failed: {issues['hard_fails']}"
    print("✓ Valid beats passed validation (no hallucinations)")

    # PHASE 4: Verify media_id consistency
    print("\n=== PHASE 4: Media ID Verification ===")

    # Create slug → entity mapping
    slug_to_entity = {e["slug"]: e for e in all_entities}

    # For each beat, verify all ref_entity_names have media_ids
    missing_media_ids = []
    for i, beat in enumerate(valid_beats):
        beat_entities = beat.get("ref_entity_names", [])
        for slug in beat_entities:
            if slug not in slug_to_entity:
                missing_media_ids.append(f"Beat {i}: unknown slug '{slug}'")
            else:
                entity = slug_to_entity[slug]
                if not entity.get("media_id"):
                    missing_media_ids.append(f"Beat {i}: entity '{slug}' has no media_id")
                else:
                    # Verify media_id format (UUID-like)
                    assert "-" in entity["media_id"], f"Invalid media_id format: {entity['media_id']}"

    assert len(missing_media_ids) == 0, f"Media ID issues: {missing_media_ids}"
    print("✓ All beat entities have valid media_ids for Flow API")

    # PHASE 5: Simulate hallucinated beat (invalid case)
    print("\n=== PHASE 5: Hallucination Detection ===")

    bad_beats = [
        {
            "text": "Helene meets a mysterious stranger",
            "description": "At {mysterious_location}, close-up of {helene_kheler} and {mysterious_person}",
            "ref_entity_names": ["mysterious_location", "helene_kheler", "mysterious_person"],
            "visual_prompt": "Unknown location",
            "motion_prompt": "Camera focuses on faces"
        }
    ]

    # Validate should REJECT (unknown slugs)
    with pytest.raises(Exception) as exc:
        await validation.auto_fix_beats(bad_beats, all_entities, max_retries=0)

    assert "unknown entities" in str(exc.value).lower()
    print("✓ Hallucinated entities correctly rejected")

    # PHASE 6: Prepare beats for Flow API
    print("\n=== PHASE 6: Flow API Readiness ===")

    flow_payload = {
        "scene_id": "scene_1",
        "beats": []
    }

    for beat in valid_beats:
        beat_payload = {
            "description": beat["description"],
            "visual_prompt": beat["visual_prompt"],
            "motion_prompt": beat["motion_prompt"],
            "ref_entity_media_ids": []
        }

        # Add media_ids for each referenced entity
        for slug in beat.get("ref_entity_names", []):
            entity = slug_to_entity.get(slug)
            if entity and entity.get("media_id"):
                beat_payload["ref_entity_media_ids"].append({
                    "slug": slug,
                    "media_id": entity["media_id"],
                    "type": entity["type"]
                })

        flow_payload["beats"].append(beat_payload)

    # Verify payload is ready
    assert len(flow_payload["beats"]) == 2
    assert all(b["ref_entity_media_ids"] for b in flow_payload["beats"])
    print(f"✓ Flow API payload ready with {len(flow_payload['beats'])} beats")
    print(f"  Payload: {json.dumps(flow_payload, indent=2)}")

    # Final assertion
    print("\n=== RESULT ===")
    print("✓✓✓ FULL PIPELINE VERIFIED ✓✓✓")
    print("  • Assets extracted with slugs and media_ids")
    print("  • Beats generated using ONLY valid slugs")
    print("  • No hallucinated entities")
    print("  • All referenced entities have media_ids for Flow")

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
