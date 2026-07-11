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


# Run inline test
if __name__ == "__main__":
    test_setup_creates_entities()
