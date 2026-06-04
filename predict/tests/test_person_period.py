"""C0 tests — person-period builder. Pure stdlib; run with pytest."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from person_period import (  # noqa: E402
    build_person_period,
    release_advance,
    load_advance_windows,
)
from datetime import date  # noqa: E402


def snap(collected, cg, by_date, *, site="s1", agency="usfs", kind="rec",
         stype="STANDARD", loop="Loop A"):
    return {
        "id": cg, "agency": agency, "kind": kind, "collected_date": collected,
        "sites": {site: {"label": "012", "loop": loop, "type": stype,
                         "use": "Overnight", "by_date": by_date}},
    }


WINDOWS = {"233864": [("05-01", "09-30", 180)]}


def test_sellout_emits_event_and_stops():
    # available -> available -> reserved : two at-risk intervals, event on the 2nd.
    snaps = [
        snap("2026-06-01", "233864", {"2026-07-04": "available"}),
        snap("2026-06-03", "233864", {"2026-07-04": "available"}),
        snap("2026-06-05", "233864", {"2026-07-04": "reserved"}),
        snap("2026-06-07", "233864", {"2026-07-04": "reserved"}),  # ignored (not at risk)
    ]
    rows, summary = build_person_period(snaps, WINDOWS)
    assert summary["outcomes"] == {"sold_out": 1}
    assert summary["cells"] == 1 and summary["rows"] == 2 and summary["events"] == 1
    first, second = rows
    assert (first.event, first.censored) == (0, 0)
    assert (second.event, second.censored) == (1, 0)
    assert first.interval_days == 2  # 06-01 -> 06-03
    assert first.lead_days == 33     # 07-04 - 06-01


def test_days_since_release_uses_booking_advance():
    # release = 07-04 - 180d = 01-05; obs 06-01 -> 147 days since release.
    snaps = [snap("2026-06-01", "233864", {"2026-07-04": "available"}),
             snap("2026-06-02", "233864", {"2026-07-04": "reserved"})]
    rows, _ = build_person_period(snaps, WINDOWS)
    assert rows[0].days_since_release == (date(2026, 6, 1) - date(2026, 1, 5)).days


def test_right_censored_when_run_ends_available():
    snaps = [snap("2026-06-01", "233864", {"2026-08-01": "available"}),
             snap("2026-06-03", "233864", {"2026-08-01": "available"})]
    rows, summary = build_person_period(snaps, WINDOWS)
    assert summary["outcomes"] == {"censored_run_end": 1}
    assert summary["events"] == 0
    assert rows[0].event == 0 and rows[0].censored == 0


def test_available_to_other_is_lost_to_followup():
    snaps = [snap("2026-06-01", "233864", {"2026-08-01": "available"}),
             snap("2026-06-02", "233864", {"2026-08-01": "other"})]
    rows, summary = build_person_period(snaps, WINDOWS)
    assert summary["outcomes"] == {"censored_lost": 1}
    assert rows[0].event == 0 and rows[0].censored == 1


def test_never_available_emits_no_rows():
    snaps = [snap("2026-06-01", "233864", {"2026-08-01": "other"}),
             snap("2026-06-02", "233864", {"2026-08-01": "reserved"})]
    rows, summary = build_person_period(snaps, WINDOWS)
    assert summary["outcomes"] == {"never_available"} or summary["outcomes"] == {"never_available": 1}
    assert rows == []


def test_unknown_status_normalizes_to_other():
    snaps = [snap("2026-06-01", "233864", {"2026-08-01": "available"}),
             snap("2026-06-02", "233864", {"2026-08-01": "Not Reservable"})]
    rows, summary = build_person_period(snaps, WINDOWS)
    assert summary["outcomes"] == {"censored_lost": 1}  # treated as -> other
    assert rows[0].censored == 1


def test_missing_window_leaves_days_since_release_none():
    snaps = [snap("2026-06-01", "999", {"2026-08-01": "available"}),
             snap("2026-06-02", "999", {"2026-08-01": "reserved"})]
    rows, _ = build_person_period(snaps, {})
    assert rows[0].days_since_release is None
    assert rows[0].lead_days == 61


def test_release_advance_window_selection():
    w = [("05-01", "09-30", 180), ("10-01", "12-31", 90)]
    assert release_advance(w, date(2026, 7, 4)) == 180
    assert release_advance(w, date(2026, 11, 1)) == 90
    assert release_advance(w, date(2026, 2, 1)) == 180  # no match -> first
    assert release_advance(None, date(2026, 7, 4)) is None


def test_load_advance_windows_maps_both_ids(tmp_path):
    doc = {"features": [{"properties": {
        "rec_gov_id": "233864", "wa_park_id": None,
        "availability_windows": [{"start": "05-01", "end": "09-30",
                                  "booking_advance_days": 180}]}}]}
    p = tmp_path / "campsites.json"
    p.write_text(__import__("json").dumps(doc))
    w = load_advance_windows(p)
    assert w["233864"] == [("05-01", "09-30", 180)]
