"""Tests for asset versioning migration (character/location/prop versioning)."""
import json
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from agent.studio import db


@pytest.fixture
def temp_db():
    """Create a temporary database for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        # Override the DB_PATH for this test
        original_db_path = db.DB_PATH
        original_conn = db._conn

        db.DB_PATH = db_path
        db._conn = None  # Force reconnection

        yield db_path

        # Cleanup
        db.DB_PATH = original_db_path
        db._conn = original_conn


def test_migration_adds_versioning_columns(temp_db):
    """Test that migration adds version_history and active_version_num columns."""
    # Get connection (triggers migration)
    conn = db._get_conn()

    tables = ["character", "location", "prop"]

    for table in tables:
        # Check that both columns exist
        columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}

        assert "version_history" in columns, f"{table} missing version_history column"
        assert "active_version_num" in columns, f"{table} missing active_version_num column"


def test_backfill_creates_v1_entries(temp_db):
    """Test that backfill creates v1 entries for existing assets."""
    conn = db._get_conn()

    # Insert test assets before migration is applied
    # (in real scenario, these exist from before versioning was added)
    test_project_id = "test-project-123"
    test_media_id = "00000000-0000-0000-0000-000000000001"
    test_ref_url = "https://example.com/image.jpg"
    test_name = "TestCharacter"

    # Manually insert a character (simulating pre-migration asset)
    conn.execute(
        "INSERT INTO character (id, project_id, name, reference_image_url, media_id, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("char-1", test_project_id, test_name, test_ref_url, test_media_id, 1000.0, 1000.0)
    )
    conn.commit()

    # Run backfill again on the existing data
    db._migrate_add_versioning(conn)

    # Query the character
    row = conn.execute("SELECT version_history, active_version_num FROM character WHERE id=?", ("char-1",)).fetchone()

    assert row is not None, "Character not found"

    version_history = json.loads(row[0])
    active_version_num = row[1]

    # Verify active_version_num is 1
    assert active_version_num == 1

    # Verify version_history has one entry
    assert len(version_history) == 1

    v1 = version_history[0]
    assert v1["version"] == 1
    assert v1["media_id"] == test_media_id
    assert v1["reference_image_url"] == test_ref_url
    assert v1["prompt"] == "(original - no prompt stored)"
    assert v1["instructions"] is None
    assert v1["status"] == "success"
    # Verify ISO 8601 format with Z marker (no timezone offset)
    assert v1["generated_at"].endswith("Z")
    assert "+" not in v1["generated_at"], "Timestamp should not include timezone offset before Z"
    assert v1["generated_at"].count("T") == 1, "ISO 8601 format requires exactly one T separator"


def test_backfill_handles_null_media_id(temp_db):
    """Test that backfill handles NULL media_id gracefully."""
    conn = db._get_conn()

    # Insert character with NULL media_id
    conn.execute(
        "INSERT INTO character (id, project_id, name, reference_image_url, media_id, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("char-null-media", "test-project", "NoMedia", "https://example.com/ref.jpg", None, 1000.0, 1000.0)
    )
    conn.commit()

    # Trigger migration on fresh connection
    db._conn = None
    conn = db._get_conn()

    # Query the character
    row = conn.execute("SELECT version_history, active_version_num FROM character WHERE id=?", ("char-null-media",)).fetchone()

    assert row is not None

    version_history = json.loads(row[0])
    active_version_num = row[1]

    # Should still have v1 entry even with NULL media_id
    assert active_version_num == 1
    assert len(version_history) == 1

    v1 = version_history[0]
    assert v1["version"] == 1
    assert v1["media_id"] is None
    assert v1["status"] == "success"


def test_idempotent_migration(temp_db):
    """Test that running migration multiple times doesn't duplicate data."""
    conn = db._get_conn()

    # Insert test asset
    conn.execute(
        "INSERT INTO character (id, project_id, name, reference_image_url, media_id, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("char-2", "test-project", "TestChar2", "https://example.com/img.jpg", "media-123", 1000.0, 1000.0)
    )
    conn.commit()

    # Run migration twice
    db._migrate_add_versioning(conn)
    first_result = conn.execute("SELECT version_history FROM character WHERE id=?", ("char-2",)).fetchone()

    db._migrate_add_versioning(conn)
    second_result = conn.execute("SELECT version_history FROM character WHERE id=?", ("char-2",)).fetchone()

    # Results should be identical (not duplicated)
    assert first_result[0] == second_result[0]

    # Version history should have exactly 1 entry
    history = json.loads(first_result[0])
    assert len(history) == 1


def test_all_entity_tables_versioned(temp_db):
    """Test that character, location, and prop tables all get versioning."""
    conn = db._get_conn()

    # Insert test assets in each table
    test_data = {
        "character": ("char-test", "Character Test"),
        "location": ("loc-test", "Location Test"),
        "prop": ("prop-test", "Prop Test"),
    }

    for table, (id_, name) in test_data.items():
        conn.execute(
            f"INSERT INTO {table} (id, project_id, name, reference_image_url, media_id, created_at, updated_at) "
            f"VALUES (?, ?, ?, ?, ?, ?, ?)",
            (id_, "test-project", name, "https://example.com/ref.jpg", f"media-{table}", 1000.0, 1000.0)
        )
    conn.commit()

    # Trigger migration
    db._conn = None
    conn = db._get_conn()

    # Verify all tables have versioning data
    for table, (id_, _) in test_data.items():
        row = conn.execute(
            f"SELECT version_history, active_version_num FROM {table} WHERE id=?",
            (id_,)
        ).fetchone()

        assert row is not None, f"Asset not found in {table}"
        version_history = json.loads(row[0])
        active_version_num = row[1]

        assert active_version_num == 1
        assert len(version_history) == 1
        assert version_history[0]["version"] == 1


# ─── Pydantic Model Tests (Task 2) ─────────────────────────────


def test_version_entry_model():
    """Test VersionEntry validates and serializes correctly."""
    from agent.models import VersionEntry

    # Test with all fields
    entry = VersionEntry(
        version=1,
        media_id="550e8400-e29b-41d4-a716-446655440000",
        reference_image_url="https://example.com/image.jpg",
        prompt="A beautiful landscape",
        instructions="Add more detail to the sky",
        generated_at="2026-01-15T10:30:00Z",
        status="success"
    )

    assert entry.version == 1
    assert entry.media_id == "550e8400-e29b-41d4-a716-446655440000"
    assert entry.reference_image_url == "https://example.com/image.jpg"
    assert entry.prompt == "A beautiful landscape"
    assert entry.instructions == "Add more detail to the sky"
    assert entry.generated_at == "2026-01-15T10:30:00Z"
    assert entry.status == "success"

    # Test serialization
    serialized = entry.model_dump()
    assert serialized["version"] == 1
    assert serialized["status"] == "success"

    # Test without instructions (optional field)
    entry_without_instructions = VersionEntry(
        version=2,
        media_id="550e8400-e29b-41d4-a716-446655440001",
        reference_image_url="https://example.com/image2.jpg",
        prompt="Another prompt",
        generated_at="2026-01-15T11:00:00Z",
        status="pending"
    )

    assert entry_without_instructions.instructions is None
    assert entry_without_instructions.status == "pending"


def test_asset_history_response_model():
    """Test AssetHistoryResponse with nested VersionEntry list."""
    from agent.models import AssetHistoryResponse, VersionEntry

    # Create version entries
    versions = [
        VersionEntry(
            version=1,
            media_id="550e8400-e29b-41d4-a716-446655440000",
            reference_image_url="https://example.com/image1.jpg",
            prompt="First version",
            generated_at="2026-01-15T10:00:00Z",
            status="success"
        ),
        VersionEntry(
            version=2,
            media_id="550e8400-e29b-41d4-a716-446655440001",
            reference_image_url="https://example.com/image2.jpg",
            prompt="Second version",
            instructions="Improved colors",
            generated_at="2026-01-15T11:00:00Z",
            status="success"
        )
    ]

    # Create history response
    history = AssetHistoryResponse(
        entity_id="char-001",
        active_version=2,
        versions=versions
    )

    assert history.entity_id == "char-001"
    assert history.active_version == 2
    assert len(history.versions) == 2
    assert history.versions[0].version == 1
    assert history.versions[1].version == 2

    # Test serialization
    serialized = history.model_dump()
    assert serialized["entity_id"] == "char-001"
    assert serialized["active_version"] == 2
    assert len(serialized["versions"]) == 2
    assert serialized["versions"][0]["prompt"] == "First version"
    assert serialized["versions"][1]["prompt"] == "Second version"


def test_regenerate_request_model():
    """Test RegenerateRequest optional fields work correctly."""
    from agent.models import RegenerateRequest

    # Test with both fields
    request_both = RegenerateRequest(
        prompt="New prompt for regeneration",
        instructions="Make it more detailed"
    )

    assert request_both.prompt == "New prompt for regeneration"
    assert request_both.instructions == "Make it more detailed"

    # Test with only prompt
    request_prompt_only = RegenerateRequest(prompt="Just a new prompt")

    assert request_prompt_only.prompt == "Just a new prompt"
    assert request_prompt_only.instructions is None

    # Test with only instructions
    request_instructions_only = RegenerateRequest(instructions="Just instructions")

    assert request_instructions_only.prompt is None
    assert request_instructions_only.instructions == "Just instructions"

    # Test with neither (both optional)
    request_empty = RegenerateRequest()

    assert request_empty.prompt is None
    assert request_empty.instructions is None

    # Test serialization
    serialized = request_both.model_dump()
    assert serialized["prompt"] == "New prompt for regeneration"
    assert serialized["instructions"] == "Make it more detailed"


# ═════════════════════════════════════════════════════════════════════════════
# Tests for versioning helper functions (agent/studio/versioning.py — Task 3)
# ═════════════════════════════════════════════════════════════════════════════


from agent.studio.versioning import (
    parse_version_history,
    get_active_version,
    add_version_to_history,
    get_current_reference_data,
)


class TestParseVersionHistory:
    """Test parse_version_history function."""

    def test_parse_empty_history(self):
        """Test that empty/invalid JSON returns empty list."""
        assert parse_version_history("") == []
        assert parse_version_history("[]") == []
        assert parse_version_history(None) == []

    def test_parse_valid_history(self):
        """Test parsing valid JSON version history."""
        history_json = json.dumps([
            {
                "version": 1,
                "media_id": "media-1",
                "reference_image_url": "https://example.com/img1.jpg",
                "prompt": "A test character",
                "instructions": None,
                "status": "success",
                "generated_at": "2026-07-11T10:00:00Z"
            }
        ])
        result = parse_version_history(history_json)
        assert len(result) == 1
        assert result[0]["version"] == 1
        assert result[0]["media_id"] == "media-1"

    def test_parse_invalid_json(self):
        """Test that invalid JSON returns empty list."""
        assert parse_version_history("{invalid json}") == []
        assert parse_version_history("not json") == []


class TestGetActiveVersion:
    """Test get_active_version function."""

    def test_get_active_version_found(self):
        """Test retrieving version from history."""
        history = [
            {"version": 1, "media_id": "media-1"},
            {"version": 2, "media_id": "media-2"},
            {"version": 3, "media_id": "media-3"},
        ]
        result = get_active_version(history, 2)
        assert result is not None
        assert result["version"] == 2
        assert result["media_id"] == "media-2"

    def test_get_active_version_not_found(self):
        """Test that missing version returns None."""
        history = [
            {"version": 1, "media_id": "media-1"},
            {"version": 2, "media_id": "media-2"},
        ]
        result = get_active_version(history, 5)
        assert result is None

    def test_get_active_version_empty_history(self):
        """Test behavior with empty history."""
        result = get_active_version([], 1)
        assert result is None


class TestAddVersionToHistory:
    """Test add_version_to_history function."""

    def test_add_version_to_empty_history(self):
        """Test that first version gets number 1."""
        new_version = {
            "media_id": "media-1",
            "reference_image_url": "https://example.com/img1.jpg",
            "prompt": "A character",
            "instructions": None,
            "status": "success"
        }
        result_json, version_num = add_version_to_history("[]", new_version)
        result = json.loads(result_json)

        assert version_num == 1
        assert len(result) == 1
        assert result[0]["version"] == 1
        assert result[0]["media_id"] == "media-1"

    def test_add_version_increments(self):
        """Test that new versions increment sequentially."""
        history_json = json.dumps([
            {"version": 1, "media_id": "media-1"},
            {"version": 2, "media_id": "media-2"},
        ])
        new_version = {"media_id": "media-3"}
        result_json, version_num = add_version_to_history(history_json, new_version)
        result = json.loads(result_json)

        assert version_num == 3
        assert len(result) == 3
        assert result[2]["version"] == 3
        assert result[2]["media_id"] == "media-3"

    def test_add_version_enforces_limit(self):
        """Test that versions > max_versions trigger removal and re-numbering."""
        # Create history with max_versions - 1 entries
        history = [{"version": i, "media_id": f"media-{i}"} for i in range(1, 11)]
        history_json = json.dumps(history)

        # Add one more with max_versions=10
        new_version = {"media_id": "media-11"}
        result_json, version_num = add_version_to_history(
            history_json, new_version, max_versions=10
        )
        result = json.loads(result_json)

        # Should still have 10 entries (removed oldest, added new, re-numbered)
        assert len(result) == 10
        # Version numbers should be 1-10 after re-numbering
        for i, v in enumerate(result, start=1):
            assert v["version"] == i
        # Oldest (media-1) should be gone, media-2 should now be v1
        assert result[0]["media_id"] == "media-2"
        # Newest should be media-11
        assert result[9]["media_id"] == "media-11"
        assert version_num == 10

    def test_add_version_with_custom_max(self):
        """Test version limit enforcement with custom max_versions."""
        history = [{"version": i, "media_id": f"media-{i}"} for i in range(1, 6)]
        history_json = json.dumps(history)

        new_version = {"media_id": "media-6"}
        result_json, version_num = add_version_to_history(
            history_json, new_version, max_versions=5
        )
        result = json.loads(result_json)

        # Should have exactly 5 entries
        assert len(result) == 5
        # media-1 should be gone, media-2 should now be v1
        assert result[0]["media_id"] == "media-2"
        assert result[4]["media_id"] == "media-6"


class TestGetCurrentReferenceData:
    """Test get_current_reference_data function."""

    def test_get_current_reference_data_with_history(self):
        """Test extracting active version data from entity with version history."""
        history = [
            {
                "version": 1,
                "media_id": "media-1",
                "reference_image_url": "https://example.com/img1.jpg",
                "prompt": "Original character",
                "instructions": None
            },
            {
                "version": 2,
                "media_id": "media-2",
                "reference_image_url": "https://example.com/img2.jpg",
                "prompt": "Updated character",
                "instructions": "More detailed"
            },
        ]
        entity = {
            "version_history": json.dumps(history),
            "active_version_num": 2,
            "media_id": "old-media",  # Should be ignored
            "reference_image_url": "old-url",
            "description": "old description"
        }

        result = get_current_reference_data(entity)

        assert result["media_id"] == "media-2"
        assert result["reference_image_url"] == "https://example.com/img2.jpg"
        assert result["prompt"] == "Updated character"
        assert result["instructions"] == "More detailed"

    def test_get_current_reference_data_fallback(self):
        """Test fallback to entity fields when no version history."""
        entity = {
            "version_history": "[]",
            "active_version_num": 1,
            "media_id": "fallback-media",
            "reference_image_url": "https://fallback.com/img.jpg",
            "description": "Fallback description"
        }

        result = get_current_reference_data(entity)

        assert result["media_id"] == "fallback-media"
        assert result["reference_image_url"] == "https://fallback.com/img.jpg"
        assert result["prompt"] == "Fallback description"
        assert result["instructions"] is None

    def test_get_current_reference_data_missing_version(self):
        """Test behavior when active version number doesn't exist in history."""
        history = [
            {
                "version": 1,
                "media_id": "media-1",
                "reference_image_url": "https://example.com/img1.jpg",
                "prompt": "Character",
                "instructions": None
            },
        ]
        entity = {
            "version_history": json.dumps(history),
            "active_version_num": 999,  # Version doesn't exist
            "media_id": "fallback-media",
            "reference_image_url": "https://fallback.com/img.jpg",
            "description": "Fallback"
        }

        result = get_current_reference_data(entity)

        # Should fall back to entity fields
        assert result["media_id"] == "fallback-media"
        assert result["reference_image_url"] == "https://fallback.com/img.jpg"
        assert result["prompt"] == "Fallback"

    def test_get_current_reference_data_default_active_version(self):
        """Test that active_version_num defaults to 1 if not specified."""
        history = [
            {
                "version": 1,
                "media_id": "media-1",
                "reference_image_url": "https://example.com/img1.jpg",
                "prompt": "Character",
                "instructions": None
            },
        ]
        entity = {
            "version_history": json.dumps(history),
            # active_version_num not specified, should default to 1
            "media_id": "old-media",
            "reference_image_url": "old-url",
            "description": "old description"
        }

        result = get_current_reference_data(entity)

        assert result["media_id"] == "media-1"
        assert result["reference_image_url"] == "https://example.com/img1.jpg"
        assert result["prompt"] == "Character"
