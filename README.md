# robot-geographical-society
🤖 A robotic trip planner for human adventure 🤖

The Royal Geographical Society was founded in 1830 to advance geographical science, famously sponsoring monumental expeditions to the Nile, the Amazon, and the Antarctic. Throughout the Victorian era, it served as the primary institution for mapping the "unknown" world and remains a global authority on exploration today via its Wikipedia page.

The Robot Geographical Society performs the same job using computers, foregoing the patriarchal, paper-based excesses of the past.

## Functional Prototype
* A map interface (built on Mapbox GL JS) allowing a user to view campsites currently open to reserve, hosted by either Washington State Parks, USFS or the National Park Service
* A statically hosted JSON dataset with all campsites and metadata
* A statically hosted RSS feed with opening dates for reservations for all tracked campsites. All year campsites are not included
* Rich popups with the following data for each campsite:
    * Number of sites
    * Site parameters (RV, tent, bike-in, parking)
    * ICS links to opening days and first reservstion days
    * Links to official sites
