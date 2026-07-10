"""
Database migration runner for continuity refactoring.
"""
import asyncio
import logging
from pathlib import Path

from agent.studio import db

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).parent.parent / "migrations"


async def run_migrations() -> dict:
    """
    Run pending SQL migrations from agent/migrations/ directory.
    Returns: {applied: [names], skipped: [names]}
    """
    result = {"applied": [], "skipped": []}

    # Get list of migrations
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        logger.info("No migrations found")
        return result

    for mig_file in migration_files:
        mig_name = mig_file.name
        try:
            # Read SQL
            sql = mig_file.read_text()

            # Execute (SQLite handles multiple statements via executescript)
            await db.execute_script(sql)
            logger.info(f"Applied migration: {mig_name}")
            result["applied"].append(mig_name)

        except Exception as e:
            logger.error(f"Migration {mig_name} failed: {e}")
            # Don't raise - continue with other migrations
            result["skipped"].append(mig_name)

    return result


async def ensure_schema():
    """
    Ensure database schema is up-to-date.
    Call this on startup.
    """
    logger.info("Checking database schema...")
    result = await run_migrations()
    if result["applied"]:
        logger.info(f"Applied {len(result['applied'])} migrations")
    if result["skipped"]:
        logger.warning(f"Skipped {len(result['skipped'])} migrations")
