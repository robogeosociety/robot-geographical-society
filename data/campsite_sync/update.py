"""
Update campsites.json with live availability data.

Iterates through features in the GeoJSON, checks for 'rec_gov_id' or 'wa_park_id',
fetches the latest availability, and injects it into the 'availability' property.
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from campsite_sync.rec_gov import fetch_availability as fetch_rec_gov
from campsite_sync.wa_state_parks import fetch_availability as fetch_wa_parks
from campsite_sync.wa_state_parks import get_session_cookies

def update_availability(
    geojson_path: str | Path,
    verbose: bool = False
) -> None:
    path = Path(geojson_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"{path} not found")

    print(f"Reading {path}...")
    data = json.loads(path.read_text())
    features = data.get("features", [])

    # Pre-fetch WA cookies to reuse session
    wa_cookies = None
    wa_parks_count = sum(1 for f in features if f["properties"].get("wa_park_id"))
    
    if wa_parks_count > 0:
        if verbose:
            print("Initializing WA State Parks session...")
        try:
            wa_cookies = get_session_cookies()
        except Exception as e:
            print(f"Failed to get WA cookies: {e}", file=sys.stderr)

    updated_count = 0
    errors_count = 0

    for feature in features:
        props = feature["properties"]
        name = props.get("name", "Unknown")
        
        # Determine source
        rec_gov_id = props.get("rec_gov_id")
        wa_park_id = props.get("wa_park_id")

        avail_data = None
        source = None

        try:
            if rec_gov_id:
                source = "RecGov"
                if verbose:
                    print(f"Fetching {source} for {name} ({rec_gov_id})...")
                avail_data = fetch_rec_gov(rec_gov_id, verbose=False)
            
            elif wa_park_id:
                source = "WA Parks"
                if verbose:
                    print(f"Fetching {source} for {name} ({wa_park_id})...")
                if wa_cookies:
                     avail_data = fetch_wa_parks(wa_park_id, cookies=wa_cookies, verbose=False)
                else:
                    print(f"Skipping {name}: No WA cookies", file=sys.stderr)
                    errors_count += 1
                    continue

            if avail_data:
                # Inject into properties
                props["availability"] = {
                    "last_updated": datetime.now().isoformat(),
                    "source": source,
                    "summary": {
                        "first_available": avail_data.get("first_available"),
                        "season_open": avail_data.get("season_open"),
                        "season_close": avail_data.get("season_close"),
                    },
                    "by_date": avail_data.get("by_date")
                }
                updated_count += 1

        except Exception as e:
            print(f"Error fetching {name}: {e}", file=sys.stderr)
            errors_count += 1
            # Keep existing availability if fetch fails? 
            # For now, we don't overwrite with None, but we don't clear old data either.

    # Write back
    print(f"Updating {path}...")
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Done. Updated {updated_count} campsites. Errors: {errors_count}")

