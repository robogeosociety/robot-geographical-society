# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**robot-geographical-society** is a robotic trip planner for human adventure — a modern, computer-driven equivalent of the Royal Geographical Society, focused on helping users discover and reserve campsites across Washington State Parks, USFS, and the National Park Service.

### Core Features (Functional Prototype)
- **Map interface** built on Mapbox GL JS showing campsites currently open for reservation
- **Static JSON dataset** of all campsites with metadata (site count, parameters, links)
- **Static RSS feed** of reservation opening dates for tracked campsites (year-round sites excluded)
- **Rich popups** per campsite: site count, site types (RV/tent/bike-in/parking), ICS calendar links, and links to official pages

## Setup

This project is in early development. No dependency manager or build tooling has been committed yet. Based on the `.gitignore`, the project is expected to use one of: `uv`, `poetry`, `pipenv`, or `pdm` for dependency management, and `pytest` for testing.

Once tooling is established, update this file with the actual commands.

## Expected Tooling (from .gitignore signals)

- **Testing:** `pytest`
- **Linting/Formatting:** `ruff`
- **Type checking:** `mypy`
- **Dependency management:** `uv` (preferred) or `poetry`

## Development Protocol

1. **Branch isolation**: Develop on a descriptive feature branch. Never commit directly to `main`.
2. **Never merge your own PRs**: Open a PR targeting `main` and wait for a human maintainer to merge.

## Issue Lifecycle

### Phase 1: Exploration
- Use Grep/Glob to locate relevant components, logic, and tests before proposing changes.
- Identify test and lint commands.

### Phase 2: Implementation & Verification
1. Implement on a feature branch.
2. Run unit tests, linting, and type checks locally.
3. Fix any failures before opening a PR.

### Phase 3: Pull Request
1. Open a PR to `main`, using `Fixes #N` or `Closes #N` in the PR body so GitHub auto-closes the issue on merge.
2. Respond to review feedback with new commits on the same branch. Do NOT merge.
