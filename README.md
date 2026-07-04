# robot-geographical-society
🤖 A robotic trip planner for human adventure 🤖

The Royal Geographical Society was founded in 1830 to advance geographical science, famously sponsoring monumental expeditions to the Nile, the Amazon, and the Antarctic. Throughout the Victorian era, it served as the primary institution for mapping the "unknown" world and remains a global authority on exploration today via its Wikipedia page.

The Robot Geographical Society performs the same job using computers, foregoing the patriarchal, paper-based excesses of the past.

## Functional Prototype
A **two-view Mapbox app** (React + Vite) over the live Cloudflare collector data, served
through the Access-gated backend. The browser never holds a credential — local dev reaches
the deployed Worker through a same-origin `/api` proxy that attaches the Access service token
server-side (see [Deployment Architecture](#deployment-architecture)).

* **Availability view** (`/availability`) — one pin per collected campground, recolored by the
  available/total ratio for a chosen night (the date picker recolors the whole map). Click a
  campground for its per-site grid, filter by status, and drill into a single site's calendar
  strip across the captured window.
* **Collectors view** (`/collectors`) — fleet health map, one pin per inventory site colored by
  collector state (healthy / overdue / quarantined / disabled), with a fleet-stats panel and a
  quarantine list that reactivates a stalled collector in one click.
* Daily per-site, per-date availability collected by the Cloudflare collector into the
  `campsite-raw` R2 bucket (see [Collector Architecture](#collector-architecture)), surfaced by
  the Worker's read API (`/availability`, `/collectors`).

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
- **[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/)**: The identity-backed auth boundary. The Worker is reachable **only** via the custom domain `api.robogeosociety.xyz` (the `*.workers.dev` route is disabled) — gated by owner SSO and a service token. This is a private project: there is no unauthenticated path.
- **[Terraform](https://www.terraform.io/)**: Infrastructure-as-code for the Access application, policies, and the dev service token (`infra/access/`), authenticated with a token vended from a dedicated [`cloudflare-tfvend`](https://github.com/robogeosociety/cloudflare-tfvend) repo (one bootstrap token → all long-lived tokens, declaratively).

### Testing & Quality
- **[Playwright](https://playwright.dev/)**: End-to-end and integration testing framework.
- **[Vitest](https://vitest.dev/)**: Vite-native unit testing framework for components and API logic.
- **[ESLint](https://eslint.org/)**: Pluggable JavaScript linting for code quality.

## Deployment Architecture

The backend is a single Cloudflare Worker reachable **only** through a Cloudflare Access boundary on the custom domain `api.robogeosociety.xyz` — the `*.workers.dev` route is disabled, so there is no public, unauthenticated path. Humans authenticate via **SSO**; the local-dev frontend reaches the backend through a Vite `/api` proxy that attaches an Access **service token** server-side, so the token never enters the browser bundle. The same Worker serves the **read API** (`/availability`, `/collectors`) and runs the durable availability **collector**; both read from R2, KV, and Analytics Engine. The Access app, its policies, and the service token are managed as code in [`infra/access/`](./infra/access/) (Terraform), authenticated with a token vended from the [`cloudflare-tfvend`](https://github.com/robogeosociety/cloudflare-tfvend) repo (one bootstrap token → all long-lived tokens). `wrangler` (OAuth) handles Worker deploys and the custom-domain bind.

```mermaid
flowchart TB
  subgraph CLIENTS["Clients"]
    DEV["Local dev — Vite<br/>/api proxy + Access service token"]
    USER["Browser (future Pages frontend)<br/>Access SSO cookie"]
  end

  subgraph EDGE["Cloudflare"]
    ACCESS["Cloudflare Access — api.robogeosociety.xyz<br/>SSO + service token · workers.dev disabled"]
    subgraph WORKER["Worker — robot-geographical-society-backend"]
      direction TB
      READ["Read API<br/>/availability · /collectors"]
      CTRL["Collector control<br/>/collect/* · /scheduler/status · /watch"]
      LOOP["CollectorLoop Workflow<br/>self-scheduling · ≤ MAX_STALENESS_DAYS"]
    end
    R2[("R2 campsite-raw<br/>summary/ · sites/ · dlq/ · heartbeat")]
    KV[("KV — campsite metadata")]
    AE[("Analytics Engine<br/>campsite_collector · campsite_availability")]
  end

  subgraph UP["Upstream booking systems"]
    REC["recreation.gov"]
    WA["WA goingtocamp"]
  end

  subgraph OBS["Observability — Mac mini (private repo)"]
    INFLUX[("InfluxDB · campsites")]
    GRAF["Grafana"]
    DISC["Discord #alerts"]
  end

  subgraph IAC["Infrastructure-as-code"]
    TFVEND["cloudflare-tfvend<br/>bootstrap → vended tokens"]
    INFRA["infra/access — Terraform<br/>Access app · policies · service token"]
  end

  DEV --> ACCESS
  USER --> ACCESS
  ACCESS --> READ
  ACCESS --> CTRL
  CTRL --> LOOP
  LOOP --> REC & WA
  LOOP -->|"raw / summary / sites · dlq · heartbeat"| R2
  LOOP --> AE
  READ --> R2
  READ --> KV
  R2 -->|"daily ingest (07:30)"| INFLUX --> GRAF
  AE --> GRAF
  GRAF -->|"failure ratio · quarantine · staleness"| DISC
  TFVEND -->|"rgs-access-admin token"| INFRA -->|manages| ACCESS
```

The section below zooms into the collector loop itself.

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
