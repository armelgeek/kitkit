"""End-to-end test: regenerate -> history -> set-active against a real asset table.

Drives the versioning endpoints directly (async) with a temp DB holding a real
`character` row, proving they hit the character/location/prop tables (not `entity`)
and that image generation is stubbed out (no extension / Flow needed).
"""
import asyncio
import json
import tempfile
from pathlib import Path

import pytest

from agent.studio import db
from agent.api import studio


@pytest.fixture
def temp_db():
    with tempfile.TemporaryDirectory() as tmpdir:
        original_path, original_conn = db.DB_PATH, db._conn
        db.DB_PATH = Path(tmpdir) / "test.db"
        db._conn = None
        db._get_conn()  # triggers schema + versioning migration
        yield
        db.DB_PATH, db._conn = original_path, original_conn


class _FakeJob:
    id = "job-1"


class _FakeJobMgr:
    """Runs the worker synchronously so the test can assert on results."""
    def __init__(self):
        self.worker = None

    def start(self, project_id, type_, items, worker, label):
        self.worker = lambda: worker(items[0])
        return _FakeJob()


@pytest.mark.parametrize("table", ["character", "location", "prop"])
def test_regenerate_history_set_active(temp_db, monkeypatch, table):
    async def scenario():
        # Real project + asset row (v1 already in history via migration backfill path)
        await db.insert("project", {"id": "p1", "title": "T", "flow_project_id": "fp1"})
        await db.insert(table, {
            "id": "a1", "project_id": "p1", "name": "Hero",
            "media_id": "00000000-0000-0000-0000-000000000001",
            "reference_image_url": "/media/v1.png",
            "version_history": json.dumps([{
                "version": 1,
                "media_id": "00000000-0000-0000-0000-000000000001",
                "reference_image_url": "/media/v1.png",
                "prompt": "orig", "instructions": None,
                "generated_at": "2026-01-01T00:00:00Z", "status": "success",
            }]),
            "active_version_num": 1,
            "created_at": db.now(), "updated_at": db.now(),
        })

        # Stub image generation + job manager (no extension needed)
        async def fake_gen(asset_type, name, description, project):
            return "00000000-0000-0000-0000-000000000002", "/media/v2.png"
        monkeypatch.setattr(studio, "_generate_asset_image", fake_gen)
        fake_mgr = _FakeJobMgr()
        monkeypatch.setattr(studio, "get_job_manager", lambda: fake_mgr)

        # 1) regenerate -> predicts v2, worker appends to the correct table
        from agent.models import RegenerateRequest
        res = await studio.regenerate_asset_reference(
            "p1", "a1", RegenerateRequest(prompt="make it cooler"))
        assert res["version_num"] == 2
        await fake_mgr.worker()  # run the background worker synchronously

        # 2) history reflects both versions from the asset table
        hist = await studio.get_asset_history("p1", "a1")
        assert hist.entity_id == "a1"
        assert hist.active_version == 2
        assert [v.version for v in hist.versions] == [1, 2]
        assert hist.versions[1].media_id == "00000000-0000-0000-0000-000000000002"

        # 3) set-active back to v1 updates the asset table's active pointers
        res = await studio.set_active_version(
            "p1", "a1", studio.SetActiveVersionRequest(version_num=1))
        assert res["active_version"] == 1
        row = await db.query_one(f"SELECT * FROM {table} WHERE id=?", ("a1",))
        assert row["active_version_num"] == 1
        assert row["media_id"] == "00000000-0000-0000-0000-000000000001"
        assert row["reference_image_url"] == "/media/v1.png"

        # Unknown version rejected
        with pytest.raises(Exception):
            await studio.set_active_version(
                "p1", "a1", studio.SetActiveVersionRequest(version_num=99))

    asyncio.run(scenario())
