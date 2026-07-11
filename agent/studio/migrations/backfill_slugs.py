"""
Backfill script to populate slug column for existing entities.
Handles collisions by appending numeric suffix (_1, _2, etc.).
Safe to run multiple times (idempotent).
"""
import logging
from agent.studio.db import normalize_to_slug, _get_conn, _lock

logger = logging.getLogger(__name__)


def backfill_slugs() -> bool:
    """
    Populate slug column for all entities in character, location, prop tables.
    Handles collisions by appending _N suffix if slug already exists.

    Returns: True on success, False on failure
    """
    try:
        with _lock:
            conn = _get_conn()

            tables = ["character", "location", "prop"]
            total_updated = 0

            for table in tables:
                logger.info(f"Processing {table} table...")

                # Get all rows with NULL slug
                cursor = conn.execute(
                    f"SELECT id, name FROM {table} WHERE slug IS NULL"
                )
                rows = cursor.fetchall()

                if not rows:
                    logger.info(f"  {table}: no rows with NULL slug")
                    continue

                logger.info(f"  {table}: found {len(rows)} rows to backfill")

                for row_id, name in rows:
                    if not name:
                        logger.warning(f"  {table} {row_id}: name is empty, skipping")
                        continue

                    # Generate base slug from name
                    slug = normalize_to_slug(name)

                    # Check for collisions and append suffix if needed
                    original_slug = slug
                    suffix = 1
                    while True:
                        # Check if this slug already exists
                        existing = conn.execute(
                            f"SELECT id FROM {table} WHERE slug=?",
                            (slug,)
                        ).fetchone()

                        if existing is None:
                            # No collision, use this slug
                            break

                        # Collision found, try with suffix
                        slug = f"{original_slug}_{suffix}"
                        suffix += 1

                    # Update the row with the slug
                    conn.execute(
                        f"UPDATE {table} SET slug=? WHERE id=?",
                        (slug, row_id)
                    )
                    logger.info(f"  {table} {row_id}: {name} → {slug}")
                    total_updated += 1

                conn.commit()

            logger.info(f"Backfill complete: {total_updated} rows updated")
            return True

    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    success = backfill_slugs()
    exit(0 if success else 1)
