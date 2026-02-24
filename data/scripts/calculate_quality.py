#!/usr/bin/env python3
"""
Calculate a data quality metric for each campsite and update the index.md files.

The score is a 0-100 integer representing data completeness and quality.
Points are awarded for:
  +20: Basic required fields (name, lat, lng, agency)
  +20: Reservation URL present
  +20: Reservation availability ID (rec_gov_id or resource_location_id)
  +10: Site count & types
  +10: Valid open date or year_round flag
  +10: Official URL present
  +10: Notes/Description present
"""

import sys
import re
from pathlib import Path
from campsite_sync.sync import parse_frontmatter, AGENCIES

def calculate_score(fm: dict) -> int:
    score = 0
    
    # Base presence (20pts)
    if all(fm.get(k) for k in ["name", "lat", "lng", "agency"]):
        score += 20
        
    # Reservation URL (20pts)
    if fm.get("reservation_url"):
        score += 20

    # Actionable availability (20pts)
    if fm.get("rec_gov_id") or fm.get("resource_location_id"):
        score += 20

    # Inventory details (10pts)
    if fm.get("sites") and fm.get("types"):
        score += 10
        
    # Seasonality (10pts)
    if fm.get("year_round") or fm.get("open_date"):
        score += 10
        
    # Official URL (10pts)
    if fm.get("official_url"):
        score += 10

    # Description (10pts)
    if fm.get("_notes") and len(fm["_notes"].strip()) > 10:
        score += 10
        
    return min(100, score)

def update_file(path: Path) -> bool:
    content = path.read_text()
    
    # Extract frontmatter block using regex from sync.py
    match = re.match(r"^---\n(.*?)\n---\n?(.*)", content, re.DOTALL)
    if not match:
        print(f"Skipping {path}: No frontmatter found")
        return False
        
    raw_fm_block, body = match.group(1), match.group(2)
    
    # Parse existing FM to calculate score
    try:
        fm = parse_frontmatter(content)
    except Exception as e:
        print(f"Skipping {path}: Parse error {e}")
        return False
        
    score = calculate_score(fm)
    
    # Check if score needs updating
    current_score = fm.get("quality_score")
    if current_score == score:
        # Check if it's already written in the file (fm.get might return it even if not in file if I messed up logic, 
        # but parse_frontmatter returns keys from file. So if key exists, it's there.)
        # However, we want to ensure it is written to the file text.
        if f"quality_score: {score}" in raw_fm_block:
             return False

    # Rebuild frontmatter block
    lines = raw_fm_block.splitlines()
    new_lines = []
    score_found = False
    
    for line in lines:
        if line.strip().startswith("quality_score:"):
            new_lines.append(f"quality_score: {score}")
            score_found = True
        else:
            new_lines.append(line)
            
    if not score_found:
        new_lines.append(f"quality_score: {score}")
        
    new_fm_block = "\n".join(new_lines)
    
    new_content = f"---\n{new_fm_block}\n---\n{body}"
    path.write_text(new_content)
    return True

def main():
    # Detect base path (script might be run from root or data/)
    # If "data" dir exists in CWD, use it. Else assume we are IN data dir or root is current.
    # The sync logic uses explicit structure: data/{agency}/WA
    # Let's try to find the 'data' root.
    
    cwd = Path.cwd()
    if (cwd / "data").is_dir():
        base_path = cwd / "data"
    elif (cwd / "blm").is_dir(): # We are likely inside data/
        base_path = cwd
    else:
        # Fallback
        base_path = cwd
    
    updated_count = 0
    total_count = 0
    
    print(f"Scanning {base_path}...")
    
    for agency in AGENCIES:
        agency_dir = base_path / agency / "WA"
        if not agency_dir.is_dir():
            continue
            
        for path in sorted(agency_dir.rglob("index.md")):
            total_count += 1
            if update_file(path):
                # Recalculate to verify
                # print(f"Updated {path.name}")
                updated_count += 1
                
    print(f"\nProcessed {total_count} files.")
    print(f"Updated {updated_count} files with new quality scores.")

if __name__ == "__main__":
    main()
