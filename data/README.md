# Campsite Data Pipeline

This directory contains the source of truth for campsite data and the tooling to process it into a consumeable GeoJSON format for the application.

## 🔄 Data Workflow

The data pipeline consists of two main stages: **Update** (enrichment) and **Generate** (compilation).

```mermaid
graph TD
    subgraph Source["Source of Truth"]
        MD["Markdown Files<br/>(data/{agency}/WA/.../index.md)"]
    end

    subgraph UpdateWorkflow["Update Workflow"]
        Updater["update_campsites.py"]
        RecGov[("Recreation.gov<br/>API")]
        WAParks[("WA State Parks<br/>API")]
        Quality["Quality Calculator"]
        
        Updater <-->|Fetches| RecGov
        Updater <-->|Fetches| WAParks
        Updater -->|Calculates| Quality
        Updater -->|Writes Metadata| MD
    end

    subgraph GenerateWorkflow["Generate Workflow"]
        Sync["sync_to_geojson.py"]
        MD -->|Reads| Sync
        Sync -->|Generates| JSON["campsites.json<br/>(Base GeoJSON)"]
    end
```

## 🛠️ Scripts

### 1. Update Campsites
Iterates through all `index.md` files, fetches live availability data from government APIs, calculates quality scores, and updates the Markdown frontmatter.
```bash
uv run update --verbose
```

### 2. Generate GeoJSON
Compiles all `index.md` files (including the embedded availability data) into a single `campsites.json` FeatureCollection. Validates data integrity.
```bash
uv run generate
```
