# Sizzle Empire — Opaque-Box E2E Test Suite (`tests/e2e/`)

Zero-dependency, deterministic 4-tier end-to-end test suite powered by **Node 24 native `WebSocket` + `fetch` CDP**, **`/usr/lib/chromium/chromium`** (SwiftShader WebGL2), and **Python 3.11 + Pillow (`PIL`)**.

Covers **both** playable targets:
1. **`main`**: `/home/antigravity/sizzle-empire/dist/` served via an ephemeral `127.0.0.1:0` static HTTP server.
2. **`standalone`**: Playable single-file HTML artifact `sizzle_empire.html` loaded via `file://`.

## Quick Start

```bash
# Run all 4 tiers across both targets (ephemeral temp screenshots auto-cleaned)
node tests/e2e/run-e2e.mjs

# Run a single tier across both targets
node tests/e2e/run-e2e.mjs --tier=1
node tests/e2e/run-e2e.mjs --tier=2
node tests/e2e/run-e2e.mjs --tier=3
node tests/e2e/run-e2e.mjs --tier=4

# Filter by target and preserve the Tier 4 780x1688 PNG screenshot gallery
SHOTS=$(mktemp -d /tmp/sizzle_shots.XXXXXX)
node tests/e2e/run-e2e.mjs --tier=all --target=all --screenshots-dir="$SHOTS"

# Emit machine-readable JSON report to stdout
node tests/e2e/run-e2e.mjs --tier=1 --target=standalone --json
```

## CLI Options & Exit Codes

- `--tier=1|2|3|4|all` (default: `all`)
- `--target=main|standalone|all` (default: `all`)
- `--screenshots-dir=<path>`: Preserves Tier 4 `780×1688` PNGs (`{main,standalone}_{01_kitchen,02_action,03_popover,04_sheet,05_crate_modal,06_event}.png`). When omitted, an ephemeral `/tmp/sizzle_e2e_shots_XXXXXX` directory is created and deleted automatically on exit.
- `--json`: Outputs pure JSON report to `stdout`.
- `--help`: Prints usage and exits `0`.
- **Exit Codes**: `0` = all passed, `1` = one or more test failures, `2` = invalid CLI arguments or missing prerequisites (`/usr/lib/chromium/chromium`, `python3` + `PIL`, `dist/index.html`, or `sizzle_empire.html`).

## Tier Coverage Summary

| Tier | File | Scope |
|------|------|-------|
| **Tier 1** | `suites/tier1-core.mjs` | Static offline/URL & metadata audit, bright PWA/Capacitor/CSS theme audit, clean headless boot (`0` errors, `0` external requests, WebGL2/Canvas 2D), PIL `780×1688` non-blank canvas + bright UI chrome/sheet + computed CSS luminance/contrast (solid + `linear-gradient`), Web Audio real-gesture unlock (`suspended → running` without autoplay flags) & `OfflineAudioContext` waveform gates |
| **Tier 2** | `suites/tier2-boundaries.mjs` | Portrait mobile viewports (`360×640`, `390×844`, `430×932`), event banner vs `.skills-rail` non-overlap, unaffordable upgrade rejection, buy-mode cycling, `700ms` real CDP hold-to-upgrade, rapid sheet churn & settings toggles, corrupt IndexedDB / `localStorage` recovery, GPU `translate3d` overlay check & particle pool caps, `25×` audio burst stress |
| **Tier 3** | `suites/tier3-pairwise.mjs` | Organic delivery → station upgrade loop (`Boost` + `Helper`, `Popular Dish` hidden on 1-station Venue 0), meta progression (Vault free unlock, Gear → Crates → visible Crate Opening Reveal Modal, Pets feed/hatch, Ranks + badge, Upgrades), `Crystal Cavern` event round-trip & main state preservation |
| **Tier 4** | `suites/tier4-workloads.mjs` | Continuous `390×844 @ DPR 2` mobile session, 6-frame `780×1688` PNG gallery capture & PIL validation, reload persistence (`persistNow()` IndexedDB / `localStorage` flush polling), and 60-frame `rAF` frame-budget stability |
