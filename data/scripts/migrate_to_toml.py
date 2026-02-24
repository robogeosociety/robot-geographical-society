#!/usr/bin/env python3
"""
Migrate campsite directory structure and create campsites.toml index.

1. Scan all index.md files in data/campsites/
2. Rename parent directory (campsite name) replacing spaces with underscores.
   e.g. "Cougar Rock" -> "Cougar_Rock"
3. Create a campsites.toml file with entries for each campsite.
4. Delete legacy agency .md files.
"""

import os
import shutil
import sys
from pathlib import Path
import toml

def main():
    base_dir = Path("campsites")
    if not base_dir.is_dir():
        print("Error: 'campsites' directory not found.", file=sys.stderr)
        sys.exit(1)

    campsites_list = []
    
    # Iterate through agencies
    for agency_dir in base_dir.iterdir():
        if not agency_dir.is_dir() or agency_dir.name.startswith("."):
            continue
            
        wa_dir = agency_dir / "WA"
        if not wa_dir.is_dir():
            continue
            
        # Recursive walk to find index.md
        # Note: We need to handle renames carefully to avoid breaking iteration
        # So first collect all paths, then process.
        index_files = sorted(wa_dir.rglob("index.md"))
        
        for index_path in index_files:
            campsite_dir = index_path.parent
            original_name = campsite_dir.name
            new_name = original_name.replace(" ", "_")
            
            new_campsite_dir = campsite_dir.parent / new_name
            
            # Rename if needed
            if original_name != new_name:
                # If new directory exists (e.g. from previous run), warn and use it
                if new_campsite_dir.exists():
                     print(f"Warning: {new_campsite_dir} already exists! Assuming renamed.", file=sys.stderr)
                     final_path = new_campsite_dir
                else:
                    print(f"Renaming: {original_name} -> {new_name}")
                    campsite_dir.rename(new_campsite_dir)
                    final_path = new_campsite_dir
            else:
                final_path = campsite_dir

            # Add to list for TOML
            # We want relative path from root (where TOML lives)
            try:
                rel_path = final_path.relative_to(Path("."))
            except ValueError:
                # Should be relative already if scan was correct
                rel_path = final_path

            campsites_list.append({
                "name": original_name,
                "path": str(rel_path)
            })


    # Create TOML structure
    toml_data = {"campsites": campsites_list}
    
    with open("campsites.toml", "w") as f:
        toml.dump(toml_data, f)
    
    print(f"Created campsites.toml with {len(campsites_list)} entries.")

    # Remove agency MD files
    legacy_files = ["blm.md", "nps.md", "usfs.md", "wa-state-parks.md"]
    for fname in legacy_files:
        p = Path(fname)
        if p.exists():
            print(f"Removing {fname}")
            p.unlink()

if __name__ == "__main__":
    main()
