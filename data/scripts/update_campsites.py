#!/usr/bin/env python3
"""
Update campsite data (MD files) with live availability and quality metrics.

Workflow:
1. Iterate all index.md files.
2. Fetch live availability if `rec_gov_id` or `resource_location_id` is present.
3. Inject `availability` data into frontmatter.
4. Calculate and update `quality_score`.
5. Write back to index.md.

Usage:
    uv run update
    uv run update --verbose
"""

import argparse
import sys
import re
from datetime import datetime
from pathlib import Path
import yaml

from campsite_sync.sync import parse_frontmatter, AGENCIES
from campsite_sync.rec_gov import fetch_availability as fetch_rec_gov
from campsite_sync.wa_state_parks import fetch_availability as fetch_wa_parks
from campsite_sync.wa_state_parks import get_session_cookies
from campsite_sync.quality import calculate_score

def update_file(path: Path, wa_cookies: str | None, verbose: bool = False) -> bool:
    content = path.read_text()
    
    # Extract existing frontmatter/body
    match = re.match(r"^---\n(.*?)\n---\n?(.*)", content, re.DOTALL)
    if not match:
        if verbose:
            print(f"Skipping {path}: No frontmatter found")
        return False
        
    raw_fm_block, body = match.group(1), match.group(2)
    
    try:
        fm = yaml.safe_load(raw_fm_block)
    except yaml.YAMLError as e:
        if verbose:
            print(f"Skipping {path}: YAML error {e}")
        return False

    original_fm = fm.copy()
    updated = False
    
    # --- Quality Score (Initial check) ---
    # Need to pass fm with _notes for calculation.
    # We parse the body again or just pass it through.
    # calculate_score expects `_notes` key if checking description.
    # Let's ensure `fm` has it temporarily.
    calc_fm = fm.copy()
    calc_fm["_notes"] = body
    current_score = calculate_score(calc_fm)
    
    if fm.get("quality_score") != current_score:
        fm["quality_score"] = current_score
        updated = True

    # --- Availability Fetching ---
    rec_gov_id = fm.get("rec_gov_id")
    wa_park_id = fm.get("resource_location_id")
    
    avail_data = None
    source = None
    
    # Only fetch if we have an ID
    if rec_gov_id or wa_park_id:
        try:
            if rec_gov_id:
                source = "RecGov"
                if verbose:
                    print(f"Fetching {source} for {fm.get('name')} ({rec_gov_id})...")
                avail_data = fetch_rec_gov(str(rec_gov_id), verbose=False)
            
            elif wa_park_id:
                source = "WA Parks"
                if verbose:
                    print(f"Fetching {source} for {fm.get('name')} ({wa_park_id})...")
                if wa_cookies:
                     avail_data = fetch_wa_parks(wa_park_id, cookies=wa_cookies, verbose=False)
                elif verbose:
                    print(f"Skipping {fm.get('name')}: No WA cookies", file=sys.stderr)

            if avail_data:
                # Update 'availability' field with a summary
                # We can store the full by_date if we want, but user requested "latest availability info"
                # which implies actionable data.
                summary = {
                     "first_available": avail_data.get("first_available"),
                     "season_open": avail_data.get("season_open"),
                     "season_close": avail_data.get("season_close")
                }
                
                new_avail = {
                    "last_updated": datetime.now().isoformat(),
                    "source": source,
                    "summary": summary
                }
                
                # Check if changed (ignoring timestamp for diff check would be ideal, but simple is ok)
                # Actually, since timestamp changes, file always updates. That's fine for "update" workflow.
                fm["availability"] = new_avail
                updated = True

        except Exception as e:
            if verbose:
                print(f"Error fetching availability for {path}: {e}", file=sys.stderr)

    if not updated:
        return False

    # --- Write Back ---
    # Dump YAML with block style to be readable
    # sort_keys=False to preserve order (if python dict preserves it, typically yes in 3.7+)
    new_fm_block = yaml.dump(fm, sort_keys=False, allow_unicode=True, width=1000).strip()
    new_content = f"---\n{new_fm_block}\n---\n{body}"
    path.write_text(new_content)
    
    return True

def main():
    parser = argparse.ArgumentParser(description="Update campsite MD with availability & quality.")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    args = parser.parse_args()
    
    # Base detection
    base_path = Path("data") if Path("data").is_dir() else Path(".")
    
    # Pre-fetch WA cookies if needed
    wa_cookies = None
    try:
        # Only fetch if we see WA parks? Or just try.
        # It spins up a browser, so maybe only do it if we encounter WA parks.
        # But for batch script, doing it once at start is better.
        print("Initializing WA State Parks session...")
        wa_cookies = get_session_cookies()
    except Exception as e:
        print(f"Warning: Failed to get WA cookies: {e}", file=sys.stderr)

    total = 0
    updated_count = 0
    
    print(f"Scanning {base_path}...")
    
    for agency in AGENCIES:
        agency_dir = base_path / agency / "WA"
        if not agency_dir.is_dir():
            continue
            
        for path in sorted(agency_dir.rglob("index.md")):
            total += 1
            if update_file(path, wa_cookies, verbose=args.verbose):
                updated_count += 1
                if args.verbose:
                    print(f"Updated {path.parent.name}")

    print(f"\nProcessed {total} files.")
    print(f"Updated {updated_count} files.")

if __name__ == "__main__":
    main()
