"""
Tests for campsite_sync.update (availability updater).
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from campsite_sync.update import update_availability

@pytest.fixture
def mock_geojson_path(tmp_path):
    p = tmp_path / "campsites.json"
    data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "RecGov Site",
                    "rec_gov_id": "123",
                    "wa_park_id": None
                }
            },
            {
                "type": "Feature",
                "properties": {
                    "name": "WA Park Site",
                    "rec_gov_id": None,
                    "wa_park_id": 456
                }
            },
            {
                "type": "Feature",
                "properties": {
                    "name": "No ID Site",
                    "rec_gov_id": None,
                    "wa_park_id": None
                }
            }
        ]
    }
    p.write_text(json.dumps(data))
    return p

@patch("campsite_sync.update.fetch_rec_gov")
@patch("campsite_sync.update.fetch_wa_parks")
@patch("campsite_sync.update.get_session_cookies")
def test_update_availability(mock_cookies, mock_fetch_wa, mock_fetch_rec, mock_geojson_path):
    # Setup mocks
    mock_cookies.return_value = "fake_cookies"
    
    mock_fetch_rec.return_value = {
        "first_available": "2026-06-01",
        "season_open": "2026-06-01",
        "season_close": "2026-09-01",
        "by_date": {"2026-06-01": {"available": 1}}
    }

    mock_fetch_wa.return_value = {
        "first_available": "2026-05-01",
        "season_open": "2026-05-01",
        "season_close": "2026-09-01",
        "by_date": {"2026-05-01": {"available": 5}}
    }

    # Run update
    update_availability(mock_geojson_path, verbose=True)

    # Verify calls
    mock_cookies.assert_called_once()
    mock_fetch_rec.assert_called_once_with("123", verbose=False)
    mock_fetch_wa.assert_called_once_with(456, cookies="fake_cookies", verbose=False)

    # Verify output
    updated_data = json.loads(mock_geojson_path.read_text())
    features = updated_data["features"]
    
    # RecGov Site
    rec_props = features[0]["properties"]
    assert "availability" in rec_props
    assert rec_props["availability"]["source"] == "RecGov"
    assert rec_props["availability"]["summary"]["first_available"] == "2026-06-01"
    
    # WA Park Site
    wa_props = features[1]["properties"]
    assert "availability" in wa_props
    assert wa_props["availability"]["source"] == "WA Parks"
    assert wa_props["availability"]["summary"]["first_available"] == "2026-05-01"

    # No ID Site
    none_props = features[2]["properties"]
    assert "availability" not in none_props

def test_file_not_found():
    with pytest.raises(FileNotFoundError):
        update_availability("non_existent.json")
