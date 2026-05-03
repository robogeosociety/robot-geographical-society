"""
Recalculate derived availability metrics in SQLite.

Two passes, both pure SQL:

1. update_pct_column(conn): fill `availability.available_pct` from
   `available_count / total_sites` for every row where `total_sites > 0`.

2. recompute_summary(conn): rebuild the per-campsite `availability_summary`
   aggregate (dates_tracked + avg/min/max pct + last_recalc).

Called from CampsiteRefreshFlow.recalculate_metrics.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone


def update_pct_column(conn: sqlite3.Connection) -> int:
    """Fill the available_pct column. Returns the number of rows updated."""
    cur = conn.execute("""
        UPDATE availability
        SET available_pct = ROUND(100.0 * available_count / total_sites, 1)
        WHERE total_sites IS NOT NULL AND total_sites > 0
    """)
    return cur.rowcount


def recompute_summary(conn: sqlite3.Connection) -> int:
    """
    Rebuild availability_summary from the current contents of availability.
    Returns the number of campsite_ids summarised.
    """
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    conn.execute("DELETE FROM availability_summary")
    cur = conn.execute("""
        INSERT INTO availability_summary
            (campsite_id, dates_tracked, avg_available_pct,
             min_available_pct, max_available_pct, last_recalc)
        SELECT
            campsite_id,
            COUNT(*) AS dates_tracked,
            ROUND(AVG(available_pct), 1) AS avg_available_pct,
            MIN(available_pct) AS min_available_pct,
            MAX(available_pct) AS max_available_pct,
            ? AS last_recalc
        FROM availability
        WHERE available_pct IS NOT NULL
        GROUP BY campsite_id
    """, (now,))
    return cur.rowcount


def read_summary(conn: sqlite3.Connection) -> dict[str, dict]:
    """Return {campsite_id: {dates_tracked, avg/min/max pct, last_recalc}}."""
    rows = conn.execute(
        "SELECT campsite_id, dates_tracked, avg_available_pct, "
        "       min_available_pct, max_available_pct, last_recalc "
        "FROM availability_summary"
    ).fetchall()
    out: dict[str, dict] = {}
    for cid, n, avg, mn, mx, last in rows:
        out[cid] = {
            "dates_tracked": n,
            "avg_available_pct": avg,
            "min_available_pct": mn,
            "max_available_pct": mx,
            "last_recalc": last,
        }
    return out
