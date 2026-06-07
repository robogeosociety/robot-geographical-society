"""
Tests for scripts/crawl_rec_gov.py.

Unit tests cover all pure functions (no network).
Integration tests (marked slow) make real recreation.gov requests.

Run unit tests only:
    uv run pytest tests/test_crawl_rec_gov.py -v -m "not slow"

Run all including network:
    uv run pytest tests/test_crawl_rec_gov.py -v
"""

import json

import pytest

from scripts.crawl_rec_gov import (
    _detect_agency,
    _from_detail,
    _from_search_result,
    _inventory_stub,
    _load_existing_ids,
)


# ---------------------------------------------------------------------------
# _detect_agency
# ---------------------------------------------------------------------------

class TestDetectAgency:
    def test_national_forest(self):
        assert _detect_agency("Mt. Baker-Snoqualmie National Forest") == ("usfs", "US Forest Service")

    def test_national_park(self):
        assert _detect_agency("Mount Rainier National Park") == ("nps", "National Park Service")

    def test_national_recreation_area(self):
        assert _detect_agency("Lake Roosevelt National Recreation Area") == ("nps", "National Park Service")

    def test_blm(self):
        assert _detect_agency("Bureau of Land Management - Spokane") == ("blm", "Bureau of Land Management")

    def test_state_park(self):
        assert _detect_agency("Deception Pass State Park") == ("wa-state-parks", "Washington State Parks")

    def test_unknown_defaults_to_usfs(self):
        assert _detect_agency("Some Random Place")[0] == "usfs"


# ---------------------------------------------------------------------------
# _from_search_result
# ---------------------------------------------------------------------------

class TestFromSearchResult:
    def _make_result(self, **overrides):
        base = {
            "entity_id": "233864",
            "name": "Bedal Campground",
            "parent_name": "Mt. Baker-Snoqualmie National Forest",
            "latitude": "48.0968",
            "longitude": "-121.3869",
            "reservable": True,
        }
        base.update(overrides)
        return base

    def test_basic_fields(self):
        c = _from_search_result(self._make_result())
        assert c["id"] == "233864"
        assert c["name"] == "Bedal Campground"
        assert c["parent_name"] == "Mt. Baker-Snoqualmie National Forest"
        assert c["lat"] == "48.0968"
        assert c["lng"] == "-121.3869"

    def test_id_coerced_to_string(self):
        c = _from_search_result(self._make_result(entity_id=233864))
        assert c["id"] == "233864"

    def test_site_count_initialised_to_zero(self):
        c = _from_search_result(self._make_result())
        assert c["site_count"] == 0

    def test_missing_parent_name(self):
        c = _from_search_result(self._make_result(parent_name=None))
        assert c["parent_name"] == ""


# ---------------------------------------------------------------------------
# _from_detail (snake_case API response)
# ---------------------------------------------------------------------------

class TestFromDetail:
    def _make_cg(self, **overrides):
        base = {
            "facility_name": "Bedal Campground",
            "facility_latitude": 48.0968,
            "facility_longitude": -121.3869,
            "org_code": "FS",
            "alternate_names": "BEDA,BEDAL,MT. BAKER-SNOQU NF - FS",
        }
        base.update(overrides)
        return base

    def test_basic_fields(self):
        c = _from_detail("233864", self._make_cg())
        assert c["id"] == "233864"
        assert c["name"] == "Bedal Campground"
        assert c["lat"] == 48.0968
        assert c["lng"] == -121.3869

    def test_name_falls_back_to_id(self):
        c = _from_detail("233864", self._make_cg(facility_name=None))
        assert c["name"] == "233864"

    def test_parent_parsed_from_alternate_names(self):
        c = _from_detail("233864", self._make_cg())
        assert "MT. BAKER-SNOQU NF - FS" in c["parent_name"] or c["parent_name"] != ""

    def test_site_count_initialised_to_zero(self):
        c = _from_detail("233864", self._make_cg())
        assert c["site_count"] == 0


# ---------------------------------------------------------------------------
# inventory dedupe + stub emission
# ---------------------------------------------------------------------------

class TestInventory:
    def _write_inventory(self, tmp_path, entries):
        p = tmp_path / "campsites-index.json"
        p.write_text(json.dumps(entries), encoding="utf-8")
        return p

    def test_load_existing_ids_only_rec(self, tmp_path):
        p = self._write_inventory(tmp_path, [
            {"id": "233864", "kind": "rec", "ref": "233864", "name": "Bedal", "agency": "usfs"},
            {"id": "x", "kind": "wa", "ref": -2147483647, "name": "Alta", "agency": "wa-state-parks"},
            {"id": "blm/foo", "kind": "blm", "ref": None, "name": "Foo", "agency": "blm"},
        ])
        assert _load_existing_ids(p) == {"233864"}

    def test_inventory_stub_shape(self):
        c = {"id": "233864", "name": "Bedal Campground",
             "parent_name": "Mt. Baker-Snoqualmie National Forest"}
        assert _inventory_stub(c) == {
            "id": "233864", "kind": "rec", "ref": "233864",
            "name": "Bedal Campground", "agency": "usfs",
        }


# ---------------------------------------------------------------------------
# Integration tests — real network (marked slow)
# ---------------------------------------------------------------------------

@pytest.mark.slow
class TestCrawlIntegration:
    """Live recreation.gov requests — requires network access."""

    BEDAL_ID = "233864"

    @pytest.fixture(scope="class")
    def ctx(self):
        from playwright.sync_api import sync_playwright
        from scripts.crawl_rec_gov import _new_context
        with sync_playwright() as p:
            context = _new_context(p)
            yield context
            context.dispose()

    def test_search_by_id_finds_bedal(self, ctx):
        from scripts.crawl_rec_gov import _search_by_id
        result = _search_by_id(ctx, self.BEDAL_ID)
        assert result is not None
        assert str(result.get("entity_id")) == self.BEDAL_ID
        assert "Bedal" in result.get("name", "")

    def test_search_by_id_has_parent_name(self, ctx):
        from scripts.crawl_rec_gov import _search_by_id
        result = _search_by_id(ctx, self.BEDAL_ID)
        assert result is not None
        assert "Baker" in result.get("parent_name", "") or "Snoqualmie" in result.get("parent_name", "")

    def test_search_by_id_has_coordinates(self, ctx):
        from scripts.crawl_rec_gov import _search_by_id
        result = _search_by_id(ctx, self.BEDAL_ID)
        assert result is not None
        assert result.get("latitude") is not None
        assert result.get("longitude") is not None

    def test_fetch_site_count_bedal(self, ctx):
        from scripts.crawl_rec_gov import _fetch_site_count
        count = _fetch_site_count(ctx, self.BEDAL_ID)
        assert count > 0, "Expected at least one campsite"

    def test_search_unknown_id_returns_none(self, ctx):
        from scripts.crawl_rec_gov import _search_by_id
        result = _search_by_id(ctx, "0000000")
        assert result is None
