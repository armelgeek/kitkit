"""
Beat-Entity Validation Test Suite

Generates real stories and validates that beats reference only existing
entities in the database. Detects hallucinations and type mismatches.
"""
import asyncio
import hashlib
import json
import random
import uuid
from datetime import datetime
from pathlib import Path

from agent.studio import brain, validation
from agent.studio.db import normalize_to_slug, _get_conn


def setup_test_project():
    """Create a project with test entities in SQLite."""
    project_id = str(uuid.uuid4())

    # Entity definitions (from plan)
    test_entities = [
        # Characters (4)
        {"type": "character", "name": "Helene Kheler", "description": "A young, brave heroine"},
        {"type": "character", "name": "Prince Aldwin", "description": "A noble prince"},
        {"type": "character", "name": "Sage Miriam", "description": "An ancient wise woman"},
        {"type": "character", "name": "Merchant Luc", "description": "A cunning merchant"},

        # Locations (4)
        {"type": "location", "name": "Ancient Temple", "description": "A forgotten sacred place"},
        {"type": "location", "name": "Flower-Filled City", "description": "A vibrant bustling city"},
        {"type": "location", "name": "Royal Palace", "description": "The kingdom's seat of power"},
        {"type": "location", "name": "Forest Clearing", "description": "A hidden woodland sanctuary"},

        # Props (2)
        {"type": "prop", "name": "Crystal Orb", "description": "A glowing magical artifact"},
        {"type": "prop", "name": "Wooden Bowl", "description": "An ancient weathered vessel"},
    ]

    # Insert into DB
    conn = _get_conn()
    entities = []

    for i, entity_def in enumerate(test_entities):
        entity_id = str(uuid.uuid4())  # Use UUID for globally unique IDs
        slug = normalize_to_slug(entity_def["name"])

        conn.execute("""
            INSERT INTO entity (id, project_id, type, name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            entity_id,
            project_id,
            entity_def["type"],
            entity_def["name"],
            entity_def["description"],
            datetime.now().timestamp(),
            datetime.now().timestamp()
        ))

        entities.append({
            "id": entity_id,
            "project_id": project_id,
            "type": entity_def["type"],
            "name": entity_def["name"],
            "slug": slug,
            "description": entity_def["description"]
        })

    conn.commit()

    return {
        "project_id": project_id,
        "entities": entities
    }


def mock_flow_generate_image(beat):
    """Mock Flow API: return deterministic fake media_id."""
    description = beat.get("description", "")
    # Deterministic ID based on beat content
    hash_digest = hashlib.md5(description.encode()).hexdigest()[:8]
    media_id = f"mock-{hash_digest}"
    return media_id


VOICEOVER_TEMPLATES = {
    "French": [
        "{char1} se réveille dans la {loc1}. Il découvre une {prop1} ancienne.",
        "{char2} voyage vers la {loc2} à la recherche d'une {prop2} mystérieuse.",
        "Dans la {loc1}, {char3} rencontre {char1} et partage un secret.",
        "{char2} explore la {loc2} et trouve des indices sur {prop2}.",
        "À la {loc1}, {char4} prépare un plan. {char1} écoute attentivement.",
        "{char3} guide {char2} à travers la {loc1} vers la {loc2}.",
    ],
    "English": [
        "{char1} wakes up in the {loc1}. She discovers an ancient {prop1}.",
        "{char2} travels to the {loc2} in search of a mysterious {prop2}.",
        "In the {loc1}, {char3} encounters {char1} and shares a secret.",
        "{char2} explores the {loc2} and finds clues about {prop2}.",
        "At the {loc1}, {char4} prepares a plan. {char1} listens carefully.",
        "{char3} guides {char2} through the {loc1} toward the {loc2}.",
    ]
}


def generate_voiceover(language, duration_secs, entities):
    """
    Generate voiceover in the given language using templates.

    Repeats templates to fill target duration (~2.5 words per second).
    """
    if language not in VOICEOVER_TEMPLATES:
        raise ValueError(f"Unsupported language: {language}")

    templates = VOICEOVER_TEMPLATES[language]
    characters = [e for e in entities if e["type"] == "character"]
    locations = [e for e in entities if e["type"] == "location"]
    props = [e for e in entities if e["type"] == "prop"]

    if not characters or not locations or not props:
        raise ValueError("Need at least 1 character, 1 location, 1 prop")

    # Build voiceover by repeating templates
    voiceover_parts = []
    target_words = int(duration_secs * 2.5)  # ~2.5 words per second

    while len(" ".join(voiceover_parts).split()) < target_words:
        template = random.choice(templates)
        # Fill template with random entities
        text = template.format(
            char1=random.choice(characters)["name"],
            char2=random.choice(characters)["name"],
            char3=random.choice(characters)["name"],
            char4=random.choice(characters)["name"],
            loc1=random.choice(locations)["name"],
            loc2=random.choice(locations)["name"],
            prop1=random.choice(props)["name"],
            prop2=random.choice(props)["name"],
        )
        voiceover_parts.append(text)

    voiceover = " ".join(voiceover_parts)
    # Trim to avoid excessive length
    words = voiceover.split()[:target_words + 10]
    return " ".join(words)


def test_setup_creates_entities():
    """Verify test project setup works."""
    result = setup_test_project()

    assert result["project_id"], "project_id should not be empty"
    assert len(result["entities"]) == 10, f"Should create exactly 10 entities, got {len(result['entities'])}"

    # Verify entity structure
    for entity in result["entities"]:
        assert entity["id"], f"Entity missing id: {entity}"
        assert entity["type"] in ["character", "location", "prop"], f"Invalid type: {entity['type']}"
        assert entity["slug"], f"Entity missing slug: {entity}"
        assert entity["name"], f"Entity missing name: {entity}"

    # Verify slugs are normalized
    entity_by_name = {e["name"]: e for e in result["entities"]}
    assert entity_by_name["Helene Kheler"]["slug"] == "helene_kheler", "Helene Kheler should normalize to helene_kheler"
    assert entity_by_name["Ancient Temple"]["slug"] == "ancient_temple", "Ancient Temple should normalize to ancient_temple"

    # Verify entity types
    chars = [e for e in result["entities"] if e["type"] == "character"]
    locs = [e for e in result["entities"] if e["type"] == "location"]
    props = [e for e in result["entities"] if e["type"] == "prop"]

    assert len(chars) == 4, f"Should have 4 characters, got {len(chars)}"
    assert len(locs) == 4, f"Should have 4 locations, got {len(locs)}"
    assert len(props) == 2, f"Should have 2 props, got {len(props)}"

    print("✓ Setup test passed")


def test_mock_flow_generates_fake_ids():
    """Verify mock Flow returns consistent fake IDs."""
    beat1 = {"description": "At {Ancient Temple}, wide shot"}
    beat2 = {"description": "At {Ancient Temple}, wide shot"}  # Same content
    beat3 = {"description": "At {Flower-Filled City}, medium shot"}  # Different

    id1 = mock_flow_generate_image(beat1)
    id2 = mock_flow_generate_image(beat2)
    id3 = mock_flow_generate_image(beat3)

    assert id1 == id2, "Same beat description should produce same media_id (deterministic)"
    assert id1 != id3, "Different beat descriptions should produce different media_ids"
    assert id1.startswith("mock-"), f"media_id should start with 'mock-', got {id1}"

    print("✓ Mock Flow test passed")


# Run inline test
if __name__ == "__main__":
    test_setup_creates_entities()
    test_mock_flow_generates_fake_ids()
