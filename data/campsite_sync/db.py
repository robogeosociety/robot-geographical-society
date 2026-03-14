"""
SQLite storage for campsite metadata and per-date availability.

Tables
------
campsites(id, name, agency, agency_short, lat, lng, sites, types,
          reservable, year_round, open_month, reservation_url, official_url,
          rec_gov_id, wa_park_id, notes, availability_windows)

availability(campsite_id, date, available_count, last_updated,
             PRIMARY KEY (campsite_id, date))

campsite.id == availability.campsite_id (rec_gov_id or str(wa_park_id) or slug).

Usage
-----
    from campsite_sync.db import (
        write_campsite, write_availability,
        read_availability, export_all, export_geojson,
    )

    write_campsite("availability.db", campsite_id, fm)
    write_availability("availability.db", campsite_id, by_date)
    geojson = export_geojson("availability.db")
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path


def _connect(db_path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS campsites (
            id                   TEXT PRIMARY KEY,
            name                 TEXT NOT NULL,
            agency               TEXT NOT NULL,
            agency_short         TEXT NOT NULL,
            lat                  REAL NOT NULL,
            lng                  REAL NOT NULL,
            sites                INTEGER NOT NULL,
            types                TEXT NOT NULL,
            reservable           INTEGER NOT NULL,
            year_round           INTEGER,
            open_month           INTEGER,
            reservation_url      TEXT,
            official_url         TEXT,
            rec_gov_id           TEXT,
            wa_park_id           INTEGER,
            notes                TEXT,
            availability_windows TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS availability (
            campsite_id     TEXT NOT NULL,
            date            TEXT NOT NULL,
            available_count INTEGER NOT NULL,
            last_updated    TEXT NOT NULL,
            PRIMARY KEY (campsite_id, date)
        )
    """)
    conn.commit()
    return conn


# ---------------------------------------------------------------------------
# Campsite metadata
# ---------------------------------------------------------------------------

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def _open_date_to_month(val) -> int | None:
    if not val:
        return None
    return MONTH_MAP.get(str(val).strip().split()[0].lower())


def campsite_id_for(fm: dict) -> str:
    """
    Derive a stable, unique campsite ID from frontmatter.

    Uses agency_short + slugified name so it is always unique regardless
    of whether rec_gov_id/wa_park_id are present or shared across entries.
    """
    slug = fm["name"].lower().replace(" ", "-").replace("'", "").replace("(", "").replace(")", "")
    return f"{fm['agency_short']}/{slug}"


def clear_campsites(db_path: str | Path) -> None:
    """Delete all rows from the campsites table (call before a full repopulation)."""
    conn = _connect(db_path)
    with conn:
        conn.execute("DELETE FROM campsites")
    conn.close()


def write_campsite(db_path: str | Path, campsite_id: str, fm: dict) -> None:
    """
    Upsert a campsite row from parsed frontmatter.

    Parameters
    ----------
    db_path      : path to the SQLite file (created if absent)
    campsite_id  : stable ID — use campsite_id_for(fm)
    fm           : dict from parse_frontmatter(), including _notes
    """
    windows = fm.get("availability_windows") or []
    conn = _connect(db_path)
    with conn:
        conn.execute(
            """
            INSERT INTO campsites
                (id, name, agency, agency_short, lat, lng, sites, types,
                 reservable, year_round, open_month,
                 reservation_url, official_url,
                 rec_gov_id, wa_park_id, notes, availability_windows)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT (id) DO UPDATE SET
                name                 = excluded.name,
                agency               = excluded.agency,
                agency_short         = excluded.agency_short,
                lat                  = excluded.lat,
                lng                  = excluded.lng,
                sites                = excluded.sites,
                types                = excluded.types,
                reservable           = excluded.reservable,
                year_round           = excluded.year_round,
                open_month           = excluded.open_month,
                reservation_url      = excluded.reservation_url,
                official_url         = excluded.official_url,
                rec_gov_id           = excluded.rec_gov_id,
                wa_park_id           = excluded.wa_park_id,
                notes                = excluded.notes,
                availability_windows = excluded.availability_windows
            """,
            (
                campsite_id,
                fm["name"],
                fm["agency"],
                fm["agency_short"],
                fm["lat"],
                fm["lng"],
                fm["sites"],
                json.dumps(fm.get("types") or []),
                int(bool(fm.get("reservable"))),
                int(bool(fm.get("year_round"))) if fm.get("year_round") is not None else None,
                _open_date_to_month(fm.get("open_date")),
                fm.get("reservation_url"),
                fm.get("official_url"),
                str(fm["rec_gov_id"]) if fm.get("rec_gov_id") is not None else None,
                fm.get("resource_location_id"),
                fm.get("_notes"),
                json.dumps(windows),
            ),
        )
    conn.close()


# ---------------------------------------------------------------------------
# Per-date availability
# ---------------------------------------------------------------------------

def write_availability(
    db_path: str | Path,
    campsite_id: str,
    by_date: dict[str, dict],
) -> int:
    """
    Upsert per-date availability for one campsite.

    Parameters
    ----------
    db_path      : path to the SQLite file (created if absent)
    campsite_id  : string ID — rec_gov_id or str(wa_park_id)
    by_date      : {date_str: {available: N, ...}} from rec_gov/wa_state_parks

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


# ---------------------------------------------------------------------------
# Export helpers
# ---------------------------------------------------------------------------

def export_all(db_path: str | Path) -> dict[str, dict[str, int]]:
    """
    Dump availability table as {campsite_id: {date: available_count}}.
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


def export_geojson(db_path: str | Path) -> dict:
    """
    Build a GeoJSON FeatureCollection by joining campsites + availability.

    Each feature's properties include an 'availability' dict
    {date: available_count} populated from the availability table.
    Returns an empty FeatureCollection if the database doesn't exist.
    """
    path = Path(db_path)
    if not path.exists():
        return {"type": "FeatureCollection", "features": []}

    conn = _connect(path)

    # Load all availability rows keyed by rec_gov_id or wa_park_id
    avail_rows = conn.execute(
        "SELECT campsite_id, date, available_count FROM availability ORDER BY date"
    ).fetchall()
    avail_by_api_id: dict[str, dict[str, int]] = {}
    for row in avail_rows:
        avail_by_api_id.setdefault(row[0], {})[row[1]] = row[2]

    # Build features from campsites table
    campsite_rows = conn.execute(
        "SELECT * FROM campsites ORDER BY agency_short, name"
    ).fetchall()
    conn.close()

    features = []
    for row in campsite_rows:
        rec_gov_id = row[13]
        wa_park_id = row[14]
        api_id = rec_gov_id or (str(wa_park_id) if wa_park_id is not None else None)
        windows = json.loads(row[16]) if row[16] else []
        types = json.loads(row[7]) if row[7] else []
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [row[5], row[4]],  # lng, lat
            },
            "properties": {
                "name":                 row[1],
                "agency":               row[2],
                "agency_short":         row[3],
                "sites":                row[6],
                "types":                types,
                "reservable":           bool(row[8]),
                "year_round":           bool(row[9]) if row[9] is not None else None,
                "open_month":           row[10],
                "reservation_url":      row[11],
                "official_url":         row[12],
                "rec_gov_id":           rec_gov_id,
                "wa_park_id":           wa_park_id,
                "notes":                row[15],
                "availability_windows": windows,
                "availability":         avail_by_api_id.get(api_id, {}) if api_id else {},
            },
        })

    return {"type": "FeatureCollection", "features": features}
