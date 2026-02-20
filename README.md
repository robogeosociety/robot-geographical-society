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

## CI/CD & Testing Strategy

The project employs a robust testing and automation pipeline via GitHub Actions to ensure reliability across the full stack.

### Testing Layers
*   **Unit Tests (Vitest):** Fast, isolated tests for React components (frontend) and Hono API logic (backend).
*   **Integration/E2E Tests (Playwright):** Full-stack verification that runs during the build process. It orchestrates a local Hono backend with a mock KV store and a Vite dev server to verify real-world interactions and API contracts.
*   **Linting (ESLint):** Enforces code quality and idiomatic React/Node.js patterns.

### Automated Pipeline
Every Pull Request and push to `main` triggers the following lifecycle:
1.  **Environment Setup:** Node.js environment initialization and dependency installation for both `web/` and `backend/`.
2.  **Data Synchronization:** Regenerates the campsite GeoJSON index and seeds the local Cloudflare KV store for the backend.
3.  **Verification:** Runs Linting and Unit Tests in parallel.
4.  **Production Build & E2E:** Executes the production build of the React application, which triggers a suite of Playwright integration tests against a live local service stack.

## Local Development Service

For macOS users, a native `launchd` service is provided to manage the local development stack (Hono + Vite) as a "one-shot" service:

```bash
# Start the dev stack (Backend: 8787, Frontend: 5173)
launchctl start com.robot.geographical.society

# Stop the dev stack
launchctl stop com.robot.geographical.society
```
