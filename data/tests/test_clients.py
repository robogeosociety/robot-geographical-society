"""
Integration tests for recreation.gov and WA State Parks availability clients.

These tests make real network requests against live APIs. They validate:
  - Output structure (required keys, correct types)
  - Data plausibility (dates in sensible range, counts non-negative)
  - API-specific behaviour (session cookies, map discovery)

Test subjects:
  - recreation.gov   — Douglas Fir Campground  (campground id 232038)
  - goingtocamp.com  — Deception Pass State Park (resourceLocationId -2147483624)

Run: uv run pytest tests/test_clients.py -v
"""

import re
from datetime import date

import pytest

from campsite_sync.rec_gov import fetch_availability as rec_gov_fetch
from campsite_sync.wa_state_parks import (
    fetch_availability as wa_fetch,
    find_park,
    get_session_cookies,
    list_parks,
)

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def wa_cookies():
    """Establish one GoingToCamp session for the whole test module."""
    return get_session_cookies()


# ---------------------------------------------------------------------------
# recreation.gov — Douglas Fir (232038)
# ---------------------------------------------------------------------------

class TestRecGov:
    CAMPGROUND_ID = "232038"

    @pytest.fixture(scope="class")
    def result(self):
        return rec_gov_fetch(self.CAMPGROUND_ID, months=4)

    def test_required_keys(self, result):
        assert "campground_id" in result
        assert "first_available" in result
        assert "season_open" in result
        assert "season_close" in result
        assert "by_date" in result
        assert "total_sites" in result

    def test_total_sites_positive(self, result):
        assert result["total_sites"] is not None
        assert result["total_sites"] > 0

    def test_campground_id_preserved(self, result):
        assert result["campground_id"] == self.CAMPGROUND_ID

    def test_by_date_is_dict(self, result):
        assert isinstance(result["by_date"], dict)

    def test_by_date_keys_are_iso_dates(self, result):
        iso = re.compile(r"^\d{4}-\d{2}-\d{2}$")
        for key in result["by_date"]:
            assert iso.match(key), f"Not an ISO date: {key!r}"

    def test_by_date_counts_are_non_negative(self, result):
        for day, counts in result["by_date"].items():
            for field in ("available", "reserved", "not_available", "other"):
                assert counts[field] >= 0, f"{day}.{field} is negative"

    def test_season_open_before_close(self, result):
        if result["season_open"] and result["season_close"]:
            assert result["season_open"] <= result["season_close"]

    def test_first_available_within_season(self, result):
        if result["first_available"] and result["season_open"]:
            assert result["first_available"] >= result["season_open"]

    def test_dates_plausible(self, result):
        today = date.today().isoformat()
        if result["season_open"]:
            assert result["season_open"] >= today[:7] + "-01", \
                "Season open is in the past"

    def test_has_some_available_sites(self, result):
        # Douglas Fir opens in May — at least some available sites expected
        total_available = sum(c["available"] for c in result["by_date"].values())
        assert total_available > 0, "No available sites found for any date"

    def test_first_available_is_may_or_later(self, result):
        # Douglas Fir opens May 15 per our data
        if result["first_available"]:
            assert result["first_available"] >= "2026-05-15", \
                f"first_available {result['first_available']} is before May 15"


# ---------------------------------------------------------------------------
# WA State Parks — Deception Pass (-2147483624)
# ---------------------------------------------------------------------------

class TestWAStateParks:
    RESOURCE_LOCATION_ID = -2147483624
    PARK_NAME = "Deception Pass"

    @pytest.fixture(scope="class")
    def result(self, wa_cookies):
        return wa_fetch(self.RESOURCE_LOCATION_ID, months=4, cookies=wa_cookies)

    def test_get_session_cookies_returns_string(self, wa_cookies):
        assert isinstance(wa_cookies, str)
        assert len(wa_cookies) > 0

    def test_list_parks_returns_parks(self, wa_cookies):
        parks = list_parks(wa_cookies)
        assert isinstance(parks, list)
        assert len(parks) > 20, "Expected at least 20 WA State Parks"

    def test_list_parks_structure(self, wa_cookies):
        parks = list_parks(wa_cookies)
        for p in parks[:5]:
            assert "resource_location_id" in p
            assert "name" in p
            assert isinstance(p["resource_location_id"], int)

    def test_find_park_deception_pass(self, wa_cookies):
        park = find_park("Deception Pass", cookies=wa_cookies)
        assert park is not None
        assert park["resource_location_id"] == self.RESOURCE_LOCATION_ID

    def test_find_park_no_match(self, wa_cookies):
        park = find_park("This Park Does Not Exist XYZ123", cookies=wa_cookies)
        assert park is None

    def test_required_keys(self, result):
        assert "resource_location_id" in result
        assert "first_available" in result
        assert "season_open" in result
        assert "season_close" in result
        assert "by_date" in result
        assert "total_sites" in result

    def test_resource_location_id_preserved(self, result):
        assert result["resource_location_id"] == self.RESOURCE_LOCATION_ID

    def test_by_date_is_dict(self, result):
        assert isinstance(result["by_date"], dict)

    def test_by_date_keys_are_first_of_month(self, result):
        # WA State Parks returns monthly granularity (YYYY-MM-01)
        iso_first = re.compile(r"^\d{4}-\d{2}-01$")
        for key in result["by_date"]:
            assert iso_first.match(key), f"Not a YYYY-MM-01 key: {key!r}"

    def test_by_date_counts_are_non_negative(self, result):
        for month, counts in result["by_date"].items():
            for field in ("available", "reserved", "not_available", "other"):
                assert counts[field] >= 0, f"{month}.{field} is negative"

    def test_season_open_before_close(self, result):
        if result["season_open"] and result["season_close"]:
            assert result["season_open"] <= result["season_close"]

    def test_first_available_within_season(self, result):
        if result["first_available"] and result["season_open"]:
            assert result["first_available"] >= result["season_open"]

    def test_has_some_open_months(self, result):
        open_months = [
            m for m, c in result["by_date"].items()
            if c["available"] > 0 or c["reserved"] > 0
        ]
        assert len(open_months) > 0, "No open months found for Deception Pass"
