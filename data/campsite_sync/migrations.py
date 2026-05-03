"""
Idempotent SQLite schema migrations for the campsite availability database.

Called from `db._connect()` so any code that opens the DB picks up the latest
schema. Safe to call repeatedly.
"""

from __future__ import annotations

import sqlite3


def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row[1] == column for row in rows)


def ensure_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to pre-existing tables. Safe to re-run."""
    if not _has_column(conn, "availability", "total_sites"):
        conn.execute("ALTER TABLE availability ADD COLUMN total_sites INTEGER")
    if not _has_column(conn, "availability", "available_pct"):
        conn.execute("ALTER TABLE availability ADD COLUMN available_pct REAL")


def ensure_tables(conn: sqlite3.Connection) -> None:
    """Create the per-campsite summary and the future per-individual-site tables."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS availability_summary (
            campsite_id       TEXT PRIMARY KEY,
            dates_tracked     INTEGER,
            avg_available_pct REAL,
            min_available_pct REAL,
            max_available_pct REAL,
            last_recalc       TEXT
        )
    """)

    # Future use: per-individual-site availability for forecasting jobs.
    # Schema reserved now so analytical work doesn't need a migration later.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS site_availability (
            campsite_id  TEXT NOT NULL,
            site_id      TEXT NOT NULL,
            date         TEXT NOT NULL,
            status       TEXT NOT NULL,
            last_updated TEXT NOT NULL,
            PRIMARY KEY (campsite_id, site_id, date)
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_site_availability_campsite_date
            ON site_availability(campsite_id, date)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_site_availability_date
            ON site_availability(date)
    """)
