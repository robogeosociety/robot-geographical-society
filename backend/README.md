# RGS backend worker

A Cloudflare Worker that serves the campsite API (Hono) **and** runs the daily
**availability collector** — the raw-collection half of the campsite
availability → projection pipeline.

- Live: `https://robot-geographical-society-backend.tommy-b-doerr.workers.dev`
- Cron: `0 13 * * *` (06:00 PT) → enqueues a job per reservable campsite
- Manual trigger: `POST /collect/run` (`?limit=N` to smoke-test N sites)

## Responsibility boundary

This repo owns **raw collection → R2**. The `observability` repo owns
**R2 → InfluxDB → Grafana** (`observability/campsites/`). Nothing here talks to
InfluxDB; the handoff is the `campsite-raw` R2 bucket.

## Infrastructure

```mermaid
flowchart LR
  subgraph CF["☁️ Cloudflare — this repo (raw collection)"]
    cron([cron 13:00 UTC]) --> prod["Worker · scheduled()<br/>producer"]
    prod -->|"61 jobs (sendBatch)"| q[[Queue<br/>campsite-availability]]
    q --> cons["Worker · queue()<br/>consumer · batch 10 · ≤2 browsers"]
    cons --> br{{"Browser Rendering<br/>@cloudflare/playwright"}}
    q -. "retry ×3" .-> dlq[[DLQ]]
  end
  br -->|fetch 6 mo| rec[recreation.gov]
  br -->|fetch 6 mo| wa[WA goingtocamp]
  cons -->|"PUT raw/ + summary/"| r2[("R2<br/>campsite-raw")]
  subgraph MAC["🖥️ Home Mac — observability repo (ingest)"]
    ingest["launchd 07:30<br/>campsites/ingest.py"]
    influx[("InfluxDB<br/>campsites bucket")]
    graf["Grafana<br/>Campsite Availability"]
    ingest -->|write LP| influx --> graf
  end
  r2 -->|"GET summary/ (S3)"| ingest
```

| Component | Binding / resource | Role |
|---|---|---|
| `scheduled()` | cron trigger | enqueue one job per campsite |
| `CAMPSITE_QUEUE` | Queue `campsite-availability` | fan-out + retries + DLQ |
| `queue()` | consumer (batch 10, max_concurrency 2) | drain, scrape, write R2 |
| `BROWSER` | Browser Rendering | real Chrome — clears the WAFs |
| `RAW` | R2 `campsite-raw` | `raw/<date>/…` + `summary/<date>/<id>.json` |

## Data flow

```mermaid
sequenceDiagram
  autonumber
  participant Cron as CF Cron (13:00 UTC)
  participant W as Worker · producer
  participant Q as Queue
  participant C as Worker · consumer
  participant B as Browser Rendering
  participant S as rec.gov / WA
  participant R2 as R2 campsite-raw
  participant M as Mac launchd (07:30)
  participant I as InfluxDB
  participant G as Grafana
  Cron->>W: scheduled()
  W->>Q: sendBatch(61 jobs · {id,kind,ref,name,agency,date})
  loop each batch of 10
    Q->>C: deliver batch
    C->>B: launch() one browser
    loop each campsite in batch
      B->>S: in-page fetch availability (next 6 months)
      S-->>B: JSON (per-site per-date status)
    end
    C->>R2: PUT raw/<date>/<agency>/<id>.json
    C->>R2: PUT summary/<date>/<id>.json (per target_date counts)
    C-->>Q: ack  (failure → retry ×3 → DLQ)
  end
  Note over M,G: later that morning (decoupled)
  M->>R2: list + GET summary/<date>/*
  R2-->>M: summaries
  M->>I: write availability,campsite,agency,target_date avail/reserved/total
  G->>I: query burn-down + Holt-Winters projection
```

**Why this shape:** decoupling collection (cloud cron, reliable, IP-diverse,
runs whether the Mac is awake or not) from ingest (private InfluxDB on the Mac,
pulled from R2 — no inbound exposure). The R2 raw archive is immutable, so the
schema can be reprocessed/backfilled without re-scraping.

## Dev

```sh
npm run dev        # local
npm test           # vitest
npm run typecheck
npx wrangler deploy
npx wrangler tail  # watch the cron/queue live
```

Collector source: `src/collector.ts`. Campsite set: `src/campsites-index.json`
(61 reservable: 39 rec.gov, 22 WA). Ingest side: `observability/campsites/`.
