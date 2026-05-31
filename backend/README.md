# RGS backend worker

A Cloudflare Worker that serves the campsite API (Hono) **and** runs the
availability collector as **Cloudflare Workflows** (durable execution). The raw
collection half of the campsite availability → projection pipeline.

- Live: `https://robot-geographical-society-backend.tommy-b-doerr.workers.dev`
- Cron: `0 13 * * *` (06:00 PT) → creates a `CampsiteCollectorWorkflow` instance
- On-demand: `POST /collect/run` (`?limit=N`), `POST /watch?id=&date=&every=`

Collection uses **plain `fetch()`** (verified to clear both the recreation.gov
and WA goingtocamp WAFs from Worker IPs) — no Browser Rendering, no queue.

## Responsibility boundary

This repo owns **collection → R2**. The `observability` repo owns
**R2 → InfluxDB → Grafana** (`observability/campsites/`). The handoff is the
`campsite-raw` R2 bucket; nothing here talks to InfluxDB.

## Infrastructure

```mermaid
flowchart LR
  subgraph CF["☁️ Cloudflare — this repo (collection)"]
    cron([cron 13:00 UTC]) --> wf["CampsiteCollectorWorkflow<br/>step.do per site · retry + resume"]
    watch["HotDateWatchWorkflow<br/>adaptive step.sleep loop"]
    wf & watch -->|plain fetch, 6 mo| src[recreation.gov / WA goingtocamp]
    wf -->|"PUT raw/ + summary/<date>/<id>"| r2[("R2 campsite-raw")]
    watch -->|"PUT watch/<date>/<id>/<ts>"| r2
  end
  subgraph MAC["🖥️ Home Mac — observability repo (ingest)"]
    ingest["launchd 07:30<br/>campsites/ingest.py"] --> influx[("InfluxDB campsites")] --> graf["Grafana<br/>Campsite Availability"]
  end
  r2 -->|"GET summary/ (S3)"| ingest
```

| Component | Resource | Role |
|---|---|---|
| `scheduled()` | cron trigger | create the daily collector workflow |
| `CampsiteCollectorWorkflow` | Workflow `COLLECTOR_WF` | one `step.do` per site (per-step retry/resume) → R2 |
| `HotDateWatchWorkflow` | Workflow `WATCH_WF` | adaptive `step.sleep` watch of one (site, date) → R2 `watch/` |
| `RAW` | R2 `campsite-raw` | `raw/`, `summary/<date>/<id>.json`, `watch/<date>/<id>/<ts>.json` |
| `CAMPSITES` | KV | the campsite API |

## Data flow — daily snapshot

```mermaid
sequenceDiagram
  autonumber
  participant Cron as CF Cron (13:00 UTC)
  participant WF as CampsiteCollectorWorkflow
  participant S as rec.gov / WA
  participant R2 as R2 campsite-raw
  participant M as Mac launchd (07:30)
  participant I as InfluxDB
  participant G as Grafana
  Cron->>WF: create({ date })
  loop step.do per site — durable, retried independently
    WF->>S: plain fetch availability (next 6 months)
    S-->>WF: JSON (per-site per-date status)
    WF->>R2: PUT raw/<date>/<agency>/<id>.json + summary/<date>/<id>.json
  end
  Note over M,G: later that morning (decoupled)
  M->>R2: GET summary/<date>/*
  M->>I: write availability,campsite,agency,target_date {available,reserved,total}
  G->>I: query burn-down + Holt-Winters projection
```

## Data flow — adaptive hot-date watch (the projection edge)

```mermaid
sequenceDiagram
  autonumber
  participant U as POST /watch?id=&date=
  participant W as HotDateWatchWorkflow
  participant S as rec.gov / WA
  participant R2 as R2 campsite-raw
  U->>W: create({ site, targetDate })
  loop until sold out or date passes
    W->>S: fetch availability for targetDate
    W->>R2: PUT watch/<date>/<id>/<ts>.json  (dense point)
    Note over W: cadence = hourly if near/filling, else daily
    W->>W: step.sleep(interval)
  end
```

This emits *dense, adaptive* burn-down data for the specific high-demand dates
you care about — what uniform daily snapshots can't — for materially better
sell-out projections. Durable: survives eviction and resumes mid-loop.

## Dev

```sh
npm run dev        # local
npm test           # vitest (cloudflare:workers stubbed in test/stubs)
npm run typecheck
npx wrangler deploy
npx wrangler workflows instances list campsite-collector
npx wrangler workflows instances describe campsite-collector <id>
```

Workflows: `src/workflows.ts`. Plain-fetch clients: `src/availability.ts`.
Campsite set: `src/campsites-index.json` (61 reservable: 39 rec.gov, 22 WA).
Ingest side: `observability/campsites/`.
