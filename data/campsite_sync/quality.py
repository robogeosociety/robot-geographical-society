"""
Data quality calculation logic.
"""

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
    if fm.get("availability_windows"):
        score += 10
        
    # Official URL (10pts)
    if fm.get("official_url"):
        score += 10

    # Description (10pts)
    if fm.get("_notes") and len(fm["_notes"].strip()) > 10:
        score += 10
        
    return min(100, score)
