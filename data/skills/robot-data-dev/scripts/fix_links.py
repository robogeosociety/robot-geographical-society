import os
import re
from pathlib import Path

def update_links():
    campsites_dir = Path("campsites")
    md_files = list(campsites_dir.glob("**/*.md"))
    
    updated_count = 0
    
    for file_path in md_files:
        content = file_path.read_text()
        new_content = content
        
        # Extract rec_gov_id or resource_location_id
        rid_match = re.search(r"rec_gov_id:\s*'(\d+)'", content)
        if not rid_match:
            rid_match = re.search(r"rec_gov_id:\s*(\d+)", content)
            
        wid_match = re.search(r"resource_location_id:\s*(-?\d+)", content)
        
        # Update recreation.gov links
        if rid_match:
            rid = rid_match.group(1)
            res_url = f"https://www.recreation.gov/camping/campgrounds/{rid}"
            
            # Replace reservation_url if it's generic
            new_content = re.sub(
                r"reservation_url:\s*https?://www\.recreation\.gov/?\s*\n",
                f"reservation_url: {res_url}\n",
                new_content
            )
            # Replace official_url if it's generic
            new_content = re.sub(
                r"official_url:\s*https?://www\.recreation\.gov/?\s*\n",
                f"official_url: {res_url}\n",
                new_content
            )

        # Update WA state park links
        if wid_match:
            wid = wid_match.group(1)
            res_url = f"https://washington.goingtocamp.com/create-booking/results?resourceLocationId={wid}"
            
            # Replace reservation_url if it's generic
            new_content = re.sub(
                r"reservation_url:\s*https?://washington\.goingtocamp\.com/?\s*\n",
                f"reservation_url: {res_url}\n",
                new_content
            )
            
        if new_content != content:
            file_path.write_text(new_content)
            updated_count += 1
            print(f"Updated {file_path}")

    print(f"Finished. Updated {updated_count} files.")

if __name__ == "__main__":
    update_links()
