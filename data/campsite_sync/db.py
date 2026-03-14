"""
SQLite storage for per-date campsite availability.

Schema
------
availability(campsite_id TEXT, date TEXT, available_count INTEGER, last_updated TEXT,
             PRIMARY KEY (campsite_id, date))

Usage
-----
    from campsite_sync.db import write_availability, read_availability, export_all

    write_availability("availability.db", "232038", by_date)
    rows = read_availability("availability.db", "232038")
    mapping = export_all("availability.db")  # {campsite_id: {date: count}}
"""

import sqlite3
from datetime import datetime
from pathlib import Path


def _connect(db_path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS availability (
            campsite_id    TEXT NOT NULL,
            date           TEXT NOT NULL,
            available_count INTEGER NOT NULL,
            last_updated   TEXT NOT NULL,
            PRIMARY KEY (campsite_id, date)
        )
    """)
    conn.commit()
    return conn


def write_availability(
    db_path: str | Path,
    campsite_id: str,
    by_date: dict[str, dict],
) -> int:
    """
    Upsert per-date availability for one campsite.

    Parameters
    ----------
    db_path     : path to the SQLite file (created if absent)
    campsite_id : string ID — rec_gov_id or str(wa_park_id)
    by_date     : {date_str: {available: N, ...}} as returned by rec_gov/wa_state_parks

    Returns the number of rows upserted.
    """
    now = datetime.now().isoformat()
    rows = [
        (campsite_id, date, counts.get("available", 0), now)
        for date, counts in by_date.items()
    ]
    if not rows:
        return 0

    conn = _connect(db_path)
    with conn:
        conn.executemany(
            """
            INSERT INTO availability (campsite_id, date, available_count, last_updated)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (campsite_id, date) DO UPDATE SET
                available_count = excluded.available_count,
                last_updated    = excluded.last_updated
            """,
            rows,
        )
    conn.close()
    return len(rows)


def read_availability(
    db_path: str | Path,
    campsite_id: str,
) -> list[tuple[str, int]]:
    """
    Return [(date, available_count), ...] for one campsite, sorted by date.
    Returns [] if the database doesn't exist or the campsite has no rows.
    """
    path = Path(db_path)
    if not path.exists():
        return []
    conn = sqlite3.connect(path)
    rows = conn.execute(
        "SELECT date, available_count FROM availability WHERE campsite_id = ? ORDER BY date",
        (campsite_id,),
    ).fetchall()
    conn.close()
    return rows


def export_all(db_path: str | Path) -> dict[str, dict[str, int]]:
    """
    Dump the entire table as {campsite_id: {date: available_count}}.
    Returns {} if the database doesn't exist.
    """
    path = Path(db_path)
    if not path.exists():
        return {}
    conn = sqlite3.connect(path)
    rows = conn.execute(
        "SELECT campsite_id, date, available_count FROM availability ORDER BY campsite_id, date"
    ).fetchall()
    conn.close()

    result: dict[str, dict[str, int]] = {}
    for campsite_id, date, count in rows:
        result.setdefault(campsite_id, {})[date] = count
    return result
