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

## Tech Stack

The Robot Geographical Society is built on a modern, serverless stack designed for high performance and low maintenance.

### Frontend
- **[React](https://react.dev/)** (v19): Modern UI library for building the interactive map interface.
- **[Vite](https://vite.dev/)**: Fast frontend build tool and development server.
- **[Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/)**: High-performance vector map engine for campsite visualization.
- **[Vanilla CSS](https://developer.mozilla.org/en-US/docs/Web/CSS)**: Custom-designed, lightweight, and modern styling.

### Backend & Infrastructure
- **[Hono](https://hono.dev/)**: Small, fast, web framework built on Web Standards.
- **[Cloudflare Workers](https://developers.cloudflare.com/workers/)**: Serverless execution environment for the backend API.
- **[Cloudflare Workflows](https://developers.cloudflare.com/workflows/)**: Durable execution for the deadline-driven availability collector (`CollectorLoop`).
- **[Cloudflare KV](https://developers.cloudflare.com/kv/)**: Low-latency, key-value data store for campsite metadata and reservation details.
- **[Cloudflare R2](https://developers.cloudflare.com/r2/)**: Object store for collected availability snapshots, the collector heartbeat, and the dead-letter queue.
- **[Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)**: Time-series event sink for per-collection telemetry, queried by Grafana.

### Testing & Quality
- **[Playwright](https://playwright.dev/)**: End-to-end and integration testing framework.
- **[Vitest](https://vitest.dev/)**: Vite-native unit testing framework for components and API logic.
- **[ESLint](https://eslint.org/)**: Pluggable JavaScript linting for code quality.

## Collector Architecture

The **availability collector** keeps each tracked campsite's reservation data fresh. It is a single durable Cloudflare Workflow (`CollectorLoop`) that self-schedules around one guarantee: **every campsite is refreshed within `MAX_STALENESS_DAYS` (default 2)** — no fixed cron. Each site carries a freshness deadline; every wake the loop collects only the sites whose deadline has arrived, reschedules them, writes a heartbeat, and sleeps until the next-earliest deadline. State rides in the Workflow payload and is periodically handed to a fresh instance via *continue-as-new* to bound step history; the R2 heartbeat is the recovery snapshot. See [`SCHEDULER-PLAN.md`](./SCHEDULER-PLAN.md).

**Failure handling.** A failed collection backs off **exponentially** (10m → 20m → 40m …) so a transient upstream blip is retried progressively later instead of on a fixed cadence. After `INACTIVE_AFTER_FAILURES` (default 5) consecutive failures a site is **quarantined**: removed from the schedule, written to the **dead-letter queue** (`dlq/<id>.json` in R2), and emitted as an `inactive` state change. A daily **probe** re-tests quarantined sites; one success (or `POST /collect/reactivate?id=`) emits `reactivated` and resumes collection. This keeps a permanently-dead site from dominating the failure rate — the signal a healthy fleet is measured against.

```mermaid
flowchart TB
  subgraph UP["Upstream booking systems"]
    REC["recreation.gov API"]
    WA["WA goingtocamp API"]
  end

  subgraph CF["Cloudflare Worker — robot-geographical-society-backend"]
    direction TB
    API["Hono HTTP API<br/>/collect/start · /scheduler/status<br/>/collect/site · /collect/dlq · /collect/reactivate · /watch"]

    subgraph LOOP["CollectorLoop — durable, self-scheduling Workflow"]
      direction TB
      PLAN["plan wake<br/>select due sites · read DLQ · reconcile"]
      COLLECT{"collect site<br/>(step.do, 3 retries)"}
      OKP["ok → deadline = now + X ± jitter<br/>reset failure count"]
      FAILP["fail → failures++<br/>exponential backoff (10m·20m·40m…)"]
      QUAR["failures ≥ INACTIVE_AFTER_FAILURES<br/>→ quarantine (inactive)"]
      PROBE["daily probe of inactive sites<br/>success → reactivated"]
      HB["heartbeat + sleep to next deadline<br/>→ continue-as-new"]
    end

    R2[("R2 campsite-raw<br/>raw/ · summary/ · sites/<br/>dlq/&lt;id&gt;.json<br/>scheduler/heartbeat.json")]
    AE[("Analytics Engine — campsite_collector<br/>status: ok · failed · inactive · reactivated")]
  end

  subgraph OBS["Observability — Mac mini (private observability repo)"]
    ING["R2 → InfluxDB ingest<br/>(launchd, 07:30 daily)"]
    INFLUX[("InfluxDB · campsites")]
    GRAF["Grafana<br/>Collector History dashboard"]
    DISC["Discord #alerts"]
  end

  REC --> COLLECT
  WA --> COLLECT
  API --> LOOP
  PLAN --> COLLECT
  COLLECT -->|ok| OKP
  COLLECT -->|error| FAILP
  FAILP --> QUAR
  COLLECT -->|"raw / summary / sites"| R2
  QUAR -->|"write dlq/"| R2
  QUAR --> PROBE
  PROBE -->|success| OKP
  OKP --> HB
  FAILP --> HB
  PROBE --> HB
  COLLECT --> AE
  QUAR --> AE
  PROBE --> AE
  API -.->|"reactivate deletes dlq entry"| R2
  R2 --> ING --> INFLUX --> GRAF
  AE --> GRAF
  GRAF -->|"failure ratio >25% · site quarantined · stale 34h"| DISC
```

**Storage & telemetry.** Each successful collection writes three R2 objects (`raw/` upstream payload, `summary/` campground aggregate, `sites/` per-individual-site breakdown) and a `campsite_collector` Analytics Engine row. The Mac-side ingest pulls the daily `summary/` snapshots into InfluxDB; Grafana's **Collector History** dashboard reads both InfluxDB (freshness) and the Analytics Engine (run history, failure ratio, quarantine state) and routes three alerts to Discord:

| Alert | Condition | Meaning |
|---|---|---|
| Failure ratio high | failed ÷ attempts > 25% over 6h | a collector-wide problem, not one site |
| Site quarantined | any `inactive` event in 20m | a campground dropped out of collection |
| Collector stale | no snapshot in InfluxDB for 34h | the loop (or the daily ingest) has stalled |

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
