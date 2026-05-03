"""
Tests for data validation logic in campsite_sync.registry.
"""

from pathlib import Path
from campsite_sync.registry import build_feature, validate

def test_validate_valid_minimal():
    fm = {
        "name": "Test Site",
        "agency": "USFS",
        "agency_short": "usfs",
        "lat": 47.0,
        "lng": -120.0,
        "sites": 10,
        "types": ["tent"],
        "reservable": True,
        "availability_windows": [{"start": "01-01", "end": "12-31"}]
    }
    path = Path("test.md")
    errors = validate(fm, path)
    assert errors == []

def test_validate_invalid_coords():
    fm = {
        "name": "Bad Coords",
        "agency": "USFS",
        "agency_short": "usfs",
        "lat": 0.0,
        "lng": 0.0,
        "sites": 10,
        "types": ["tent"],
        "reservable": True,
        "availability_windows": [{"start": "01-01", "end": "12-31"}]
    }
    path = Path("test.md")
    errors = validate(fm, path)
    assert any("lat 0.0 outside WA range" in e for e in errors)
    assert any("lng 0.0 outside WA range" in e for e in errors)

def test_validate_rec_gov_id():
    fm = {
        "name": "Bad RecGov",
        "agency": "NPS",
        "agency_short": "nps",
        "lat": 47.0,
        "lng": -120.0,
        "sites": 10,
        "types": ["tent"],
        "reservable": True,
        "availability_windows": [{"start": "01-01", "end": "12-31"}],
        "rec_gov_id": "abc"  # Invalid
    }
    errors = validate(fm, Path("test.md"))
    assert any("rec_gov_id 'abc' must be a numeric string or integer" in e for e in errors)

    fm["rec_gov_id"] = "123"  # Valid string
    errors = validate(fm, Path("test.md"))
    assert errors == []

    fm["rec_gov_id"] = 123  # Valid int
    errors = validate(fm, Path("test.md"))
    assert errors == []


def test_validate_resource_location_id():
    fm = {
        "name": "Bad WA Park",
        "agency": "WA State Parks",
        "agency_short": "wa-state-parks",
        "lat": 47.0,
        "lng": -120.0,
        "sites": 10,
        "types": ["tent"],
        "reservable": True,
        "availability_windows": [{"start": "01-01", "end": "12-31"}],
        "resource_location_id": "not-an-int"  # Invalid
    }
    errors = validate(fm, Path("test.md"))
    assert any("resource_location_id 'not-an-int' must be an integer" in e for e in errors)

    fm["resource_location_id"] = -123  # Valid
    errors = validate(fm, Path("test.md"))
    assert errors == []


def test_build_feature_stac_shape():
    """STAC-Item-style: stable id, datetime, links[], assets{}."""
    fm = {
        "name": "Test Site",
        "agency": "US Forest Service",
        "agency_short": "usfs",
        "lat": 47.0,
        "lng": -120.0,
        "sites": 10,
        "types": ["tent"],
        "reservable": True,
        "availability_windows": [{"start": "01-01", "end": "12-31"}],
        "reservation_url": "https://example.com/reserve",
        "official_url": "https://example.com/info",
    }
    feat = build_feature(fm)
    assert feat["type"] == "Feature"
    assert feat["id"] == "usfs/test-site"
    assert feat["properties"]["id"] == "usfs/test-site"
    assert "datetime" in feat["properties"]
    assert isinstance(feat["links"], list)
    assert any(l["rel"] == "reservation" for l in feat["links"])
    assert any(l["rel"] == "official" for l in feat["links"])
    assert feat["assets"] == {}
