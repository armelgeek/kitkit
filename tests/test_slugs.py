"""
Test slug normalization for entity identifiers.
"""
import pytest
from agent.studio.db import normalize_to_slug


def test_simple_names():
    """Test basic name conversion to slug."""
    assert normalize_to_slug("Helene Kheler") == "helene_kheler"
    assert normalize_to_slug("Alice") == "alice"
    assert normalize_to_slug("John Smith") == "john_smith"


def test_accents_removed():
    """Test that accents are removed from names."""
    assert normalize_to_slug("Tấm") == "tam"
    assert normalize_to_slug("Café") == "cafe"
    assert normalize_to_slug("Naïve") == "naive"
    assert normalize_to_slug("Résumé") == "resume"


def test_special_characters():
    """Test that apostrophes and hyphens are handled."""
    assert normalize_to_slug("Atelier d'Art") == "atelier_d_art"
    assert normalize_to_slug("Chambre d'enfant") == "chambre_d_enfant"
    assert normalize_to_slug("Mother-in-law") == "mother_in_law"


def test_lowercase():
    """Test that output is lowercase."""
    assert normalize_to_slug("ALICE") == "alice"
    assert normalize_to_slug("AlIcE SmItH") == "alice_smith"


def test_multiple_spaces():
    """Test that multiple consecutive spaces become single underscore."""
    assert normalize_to_slug("John  Smith") == "john_smith"
    assert normalize_to_slug("Alice   Wonder") == "alice_wonder"


def test_leading_trailing_spaces():
    """Test that leading/trailing spaces are stripped."""
    assert normalize_to_slug("  Alice  ") == "alice"
    assert normalize_to_slug("  John Smith  ") == "john_smith"


def test_leading_trailing_underscores():
    """Test that leading/trailing underscores are removed."""
    assert normalize_to_slug("_Alice_") == "alice"
    assert normalize_to_slug("-John-Smith-") == "john_smith"


def test_mixed_accent_and_special():
    """Test combinations of accents and special characters."""
    assert normalize_to_slug("Élève d'école") == "eleve_d_ecole"
    assert normalize_to_slug("François-Régis") == "francois_regis"


def test_edge_cases():
    """Test edge cases."""
    assert normalize_to_slug("a") == "a"
    assert normalize_to_slug("A") == "a"
    assert normalize_to_slug("123") == "123"
    assert normalize_to_slug("") == ""


def test_deterministic():
    """Test that the function is deterministic."""
    name = "Café d'Art Numéro 5"
    slug1 = normalize_to_slug(name)
    slug2 = normalize_to_slug(name)
    assert slug1 == slug2
    assert slug1 == "cafe_d_art_numero_5"


# ─── Backfill tests ──────────────────────────────────────────

import tempfile
import os
from agent.studio.migrations.backfill_slugs import backfill_slugs


@pytest.fixture
def test_db():
    """Create a test database with sample entities."""
    # Use a temporary in-memory database for testing
    import sqlite3
    from pathlib import Path

    # Create a temp db
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"

        # Set the environment variable before importing
        os.environ["STUDIO_DB"] = str(db_path)

        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row

        # Create schema
        conn.executescript("""
        CREATE TABLE character (
          id TEXT PRIMARY KEY, project_id TEXT,
          name TEXT, description TEXT,
          image_prompt TEXT, reference_image_url TEXT,
          media_id TEXT, primary_media_id TEXT,
          slug TEXT,
          created_at REAL, updated_at REAL
        );

        CREATE TABLE location (
          id TEXT PRIMARY KEY, project_id TEXT,
          name TEXT, description TEXT,
          image_prompt TEXT, reference_image_url TEXT,
          media_id TEXT, primary_media_id TEXT,
          slug TEXT,
          created_at REAL, updated_at REAL
        );

        CREATE TABLE prop (
          id TEXT PRIMARY KEY, project_id TEXT,
          name TEXT, description TEXT,
          image_prompt TEXT, reference_image_url TEXT,
          media_id TEXT, primary_media_id TEXT,
          slug TEXT,
          created_at REAL, updated_at REAL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_character_slug ON character(slug) WHERE slug IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_location_slug ON location(slug) WHERE slug IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_prop_slug ON prop(slug) WHERE slug IS NOT NULL;
        """)

        # Insert test data
        conn.execute(
            "INSERT INTO character (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("char-1", "proj-1", "Helene Kheler", "A character", 0, 0)
        )
        conn.execute(
            "INSERT INTO character (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("char-2", "proj-1", "Atelier d'Art", "Another character", 0, 0)
        )
        conn.execute(
            "INSERT INTO location (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("loc-1", "proj-1", "Tấm's Room", "A location", 0, 0)
        )
        conn.execute(
            "INSERT INTO prop (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("prop-1", "proj-1", "Wooden Bowl", "A prop", 0, 0)
        )
        conn.commit()
        conn.close()

        yield str(db_path)


def test_backfill_slugs_basic(test_db):
    """Test basic slug generation for entities."""
    # Reset the module to use test db
    import importlib
    import agent.studio.db as db_module

    # Set test DB before reloading
    os.environ["STUDIO_DB"] = test_db
    importlib.reload(db_module)

    # Import backfill after DB is set
    from agent.studio.migrations.backfill_slugs import backfill_slugs

    # Run backfill
    result = backfill_slugs()
    assert result is True

    # Verify slugs were created
    conn = db_module._get_conn()
    char = conn.execute("SELECT slug FROM character WHERE id=?", ("char-1",)).fetchone()
    assert char[0] == "helene_kheler"

    loc = conn.execute("SELECT slug FROM location WHERE id=?", ("loc-1",)).fetchone()
    assert loc[0] == "tam_s_room"

    prop = conn.execute("SELECT slug FROM prop WHERE id=?", ("prop-1",)).fetchone()
    assert prop[0] == "wooden_bowl"


def test_backfill_slugs_idempotent(test_db):
    """Test that backfill is idempotent (can run multiple times)."""
    import importlib
    import agent.studio.db as db_module

    os.environ["STUDIO_DB"] = test_db
    importlib.reload(db_module)
    from agent.studio.migrations.backfill_slugs import backfill_slugs

    # Run backfill twice
    result1 = backfill_slugs()
    assert result1 is True

    result2 = backfill_slugs()
    assert result2 is True

    # Verify slugs are still correct
    conn = db_module._get_conn()
    char = conn.execute("SELECT slug FROM character WHERE id=?", ("char-1",)).fetchone()
    assert char[0] == "helene_kheler"


def test_backfill_slugs_collision_handling(test_db):
    """Test that collision handling works (duplicate names get suffixes)."""
    import importlib
    import agent.studio.db as db_module

    os.environ["STUDIO_DB"] = test_db
    importlib.reload(db_module)

    # Add a second character with a name that would collide
    conn = db_module._get_conn()
    conn.execute(
        "INSERT INTO character (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("char-3", "proj-1", "Helene Kheler", "Duplicate name", 0, 0)
    )
    conn.commit()

    from agent.studio.migrations.backfill_slugs import backfill_slugs

    # Run backfill
    result = backfill_slugs()
    assert result is True

    # Verify collision handling
    char1 = conn.execute("SELECT slug FROM character WHERE id=?", ("char-1",)).fetchone()
    char3 = conn.execute("SELECT slug FROM character WHERE id=?", ("char-3",)).fetchone()

    # One should be base slug, other should have suffix
    slugs = {char1[0], char3[0]}
    assert "helene_kheler" in slugs
    assert "helene_kheler_1" in slugs
