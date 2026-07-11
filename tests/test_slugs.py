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
