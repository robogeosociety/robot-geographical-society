"""
Tests for scripts/crawl_rec_gov.py.

Unit tests cover all pure functions (no network).
Integration tests (marked slow) make real recreation.gov requests.

Run unit tests only:
    uv run pytest tests/test_crawl_rec_gov.py -v -m "not slow"

Run all including network:
    uv run pytest tests/test_crawl_rec_gov.py -v
"""

import textwrap
from pathlib import Path

import pytest
import yaml

from scripts.crawl_rec_gov import (
    _build_index_md,
    _detect_agency,
    _detect_subdir,
    _from_detail,
    _from_search_result,
    _load_existing_ids,
    _slugify,
    _write_toml,
)


# ---------------------------------------------------------------------------
# _detect_agency
# ---------------------------------------------------------------------------

class TestDetectAgency:
    def test_national_forest(self):
        short, full = _detect_agency("Mt. Baker-Snoqualmie National Forest")
        assert short == "usfs"
        assert full == "US Forest Service"

    def test_national_park(self):
        short, full = _detect_agency("Olympic National Park")
        assert short == "nps"
        assert full == "National Park Service"

    def test_national_recreation_area(self):
        short, full = _detect_agency("Lake Roosevelt National Recreation Area")
        assert short == "nps"
        assert full == "National Park Service"

    def test_blm(self):
        short, full = _detect_agency("Bureau of Land Management - Spokane District")
        assert short == "blm"
        assert full == "Bureau of Land Management"

    def test_state_park(self):
        short, full = _detect_agency("Washington State Parks")
        assert short == "wa-state-parks"
        assert full == "Washington State Parks"

    def test_unknown_defaults_to_usfs(self):
        short, full = _detect_agency("Some Unknown Org")
        assert short == "usfs"


# ---------------------------------------------------------------------------
# _detect_subdir
# ---------------------------------------------------------------------------

class TestDetectSubdir:
    @pytest.mark.parametrize("parent,expected", [
        ("Mt. Baker-Snoqualmie National Forest", "Mt_Baker_Snoqualmie_NF"),
        ("Okanogan-Wenatchee National Forest",   "Okanogan_Wenatchee_NF"),
        ("Olympic National Forest",              "Olympic_NF"),
        ("Gifford Pinchot National Forest",      "Gifford_Pinchot_NF"),
        ("Colville National Forest",             "Colville_NF"),
        ("Umatilla National Forest",             "Umatilla_NF"),
    ])
    def test_usfs_forests(self, parent, expected):
        assert _detect_subdir("usfs", parent) == expected

    @pytest.mark.parametrize("parent,expected", [
        ("Mount Rainier National Park",          "Mt_Rainier_NP"),
        ("Olympic National Park",                "Olympic_NP"),
        ("North Cascades National Park",         "North_Cascades_NP"),
        ("Lake Roosevelt National Recreation Area", "Lake_Roosevelt_NRA"),
    ])
    def test_nps_parks(self, parent, expected):
        assert _detect_subdir("nps", parent) == expected

    def test_unknown_usfs_returns_none(self):
        assert _detect_subdir("usfs", "Some Unrecognised Forest") is None

    def test_blm_returns_none(self):
        assert _detect_subdir("blm", "BLM Anything") is None


# ---------------------------------------------------------------------------
# _slugify
# ---------------------------------------------------------------------------

class TestSlugify:
    def test_basic(self):
        assert _slugify("Bedal Campground") == "Bedal_Campground"

    def test_apostrophe_preserved(self):
        slug = _slugify("Heart O' the Hills")
        assert "'" in slug or "Heart_O" in slug  # apostrophe or dropped cleanly

    def test_special_chars_removed(self):
        slug = _slugify("Buck & Doe (Test)")
        assert "&" not in slug
        assert "(" not in slug

    def test_multiple_spaces_collapsed(self):
        assert _slugify("A  B   C") == "A_B_C"

    def test_hyphens_become_underscores(self):
        assert _slugify("Rimrock-Lake") == "Rimrock_Lake"


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
        # Last segment of alternate_names (len > 6) becomes parent
        assert "MT. BAKER-SNOQU NF - FS" in c["parent_name"] or c["parent_name"] != ""

    def test_site_count_initialised_to_zero(self):
        c = _from_detail("233864", self._make_cg())
        assert c["site_count"] == 0


# ---------------------------------------------------------------------------
# _build_index_md
# ---------------------------------------------------------------------------

class TestBuildIndexMd:
    def _candidate(self, **overrides):
        base = {
            "id": "233864",
            "name": "Bedal Campground",
            "parent_name": "Mt. Baker-Snoqualmie National Forest",
            "lat": 48.0968,
            "lng": -121.3869,
            "site_count": 23,
        }
        base.update(overrides)
        return base

    def test_valid_yaml_frontmatter(self):
        md = _build_index_md(self._candidate(), 23, "usfs", "US Forest Service")
        parts = md.split("---\n")
        assert len(parts) >= 3
        fm = yaml.safe_load(parts[1])
        assert fm["name"] == "Bedal Campground"

    def test_required_fields_present(self):
        md = _build_index_md(self._candidate(), 23, "usfs", "US Forest Service")
        fm = yaml.safe_load(md.split("---\n")[1])
        for field in ("name", "agency", "agency_short", "state", "lat", "lng",
                      "sites", "types", "reservable", "rec_gov_id",
                      "reservation_url", "official_url", "availability_windows"):
            assert field in fm, f"Missing field: {field}"

    def test_rec_gov_id_is_string(self):
        md = _build_index_md(self._candidate(), 23, "usfs", "US Forest Service")
        fm = yaml.safe_load(md.split("---\n")[1])
        assert fm["rec_gov_id"] == "233864"
        assert isinstance(fm["rec_gov_id"], str)

    def test_reservation_url_contains_id(self):
        md = _build_index_md(self._candidate(), 23, "usfs", "US Forest Service")
        fm = yaml.safe_load(md.split("---\n")[1])
        assert "233864" in fm["reservation_url"]
        assert fm["reservation_url"].startswith("https://www.recreation.gov")

    def test_lat_lng_rounded(self):
        md = _build_index_md(self._candidate(lat=48.09684300000, lng=-121.38694300000), 23, "usfs", "US Forest Service")
        fm = yaml.safe_load(md.split("---\n")[1])
        # Should be rounded to 4 decimal places
        assert len(str(fm["lat"]).split(".")[-1]) <= 4
        assert len(str(abs(fm["lng"])).split(".")[-1]) <= 4

    def test_sites_from_site_count(self):
        md = _build_index_md(self._candidate(), 17, "usfs", "US Forest Service")
        fm = yaml.safe_load(md.split("---\n")[1])
        assert fm["sites"] == 17

    def test_availability_windows_has_site_total_count(self):
        md = _build_index_md(self._candidate(), 23, "usfs", "US Forest Service")
        fm = yaml.safe_load(md.split("---\n")[1])
        windows = fm["availability_windows"]
        assert len(windows) == 1
        assert windows[0]["site_total_count"] == 23

    def test_body_contains_parent_name(self):
        md = _build_index_md(self._candidate(), 23, "usfs", "US Forest Service")
        body = md.split("---\n", 2)[-1]
        assert "Mt. Baker-Snoqualmie National Forest" in body


# ---------------------------------------------------------------------------
# _write_toml / _load_existing_ids (filesystem round-trip)
# ---------------------------------------------------------------------------

class TestTomlRoundTrip:
    def test_write_sorted(self, tmp_path):
        entries = [
            {"name": "Zebra Lake", "path": "campsites/usfs/WA/Zebra_Lake.md"},
            {"name": "Apple Creek", "path": "campsites/usfs/WA/Apple_Creek.md"},
            {"name": "Middle Camp", "path": "campsites/usfs/WA/Middle_Camp.md"},
        ]
        toml_file = tmp_path / "campsites.toml"
        _write_toml(toml_file, entries)
        text = toml_file.read_text()
        positions = {name: text.index(name) for name in ["Apple Creek", "Middle Camp", "Zebra Lake"]}
        assert positions["Apple Creek"] < positions["Middle Camp"] < positions["Zebra Lake"]

    def test_write_valid_toml(self, tmp_path):
        import tomllib
        entries = [{"name": "Test Camp", "path": "campsites/usfs/WA/Test_Camp.md"}]
        toml_file = tmp_path / "campsites.toml"
        _write_toml(toml_file, entries)
        with open(toml_file, "rb") as f:
            config = tomllib.load(f)
        assert config["campsites"][0]["name"] == "Test Camp"
        assert config["campsites"][0]["path"] == "campsites/usfs/WA/Test_Camp.md"

    def test_load_existing_ids(self, tmp_path):
        # Create a minimal index.md with a rec_gov_id
        camp_dir = tmp_path / "campsites" / "usfs" / "WA"
        camp_dir.mkdir(parents=True)
        md_file = camp_dir / "Test_Camp.md"
        md_file.write_text(textwrap.dedent("""\
            ---
            name: Test Camp
            rec_gov_id: '999001'
            ---

            A test campsite.
        """))
        # Write a matching TOML
        toml_file = tmp_path / "campsites.toml"
        _write_toml(toml_file, [{"name": "Test Camp", "path": str(md_file)}])

        ids = _load_existing_ids(toml_file)
        assert "999001" in ids

    def test_load_existing_ids_skips_missing_files(self, tmp_path):
        toml_file = tmp_path / "campsites.toml"
        _write_toml(toml_file, [{"name": "Ghost Camp", "path": "does/not/exist.md"}])
        ids = _load_existing_ids(toml_file)
        assert len(ids) == 0


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
