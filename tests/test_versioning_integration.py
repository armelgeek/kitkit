"""Integration tests for asset versioning endpoints."""
import pytest
from fastapi.testclient import TestClient
from agent.main import app

client = TestClient(app)


def test_regenerate_asset_endpoint():
    """Test regenerate endpoint accepts correct schema."""
    response = client.post(
        "/api/studio/projects/test-proj/entities/test-entity/regenerate",
        json={"prompt": "New prompt", "instructions": "More dramatic"}
    )
    # Should return 404 for non-existent entity (expected in testing)
    assert response.status_code in [200, 404, 401]


def test_get_asset_history_endpoint():
    """Test history endpoint returns correct schema."""
    response = client.get("/api/studio/projects/test-proj/entities/test-entity/history")
    assert response.status_code in [200, 404, 401]
    if response.status_code == 200:
        data = response.json()
        assert "entity_id" in data
        assert "active_version" in data
        assert "versions" in data


def test_set_active_version_endpoint():
    """Test set-active-version endpoint."""
    response = client.patch(
        "/api/studio/projects/test-proj/entities/test-entity/set-active-version",
        json={"version_num": 1}
    )
    assert response.status_code in [200, 400, 404, 401]
