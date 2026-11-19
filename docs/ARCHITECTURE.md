# Sizzle Empire — System Architecture

## Layer Separation

Sizzle Empire enforces strict separation between simulation, economy, persistence, 3D rendering, React UI, native platform bridges, and optional backend sync:

```text
src/
├── types/game.ts                 # Canonical TypeScript domain types
├── data/                         # 100% data-driven game content (zero logic)
│   ├── restaurants.ts            # 38+ venues across 5 tiers, 6 archetypes, events & adventures
│   ├── cities.ts                 # 60 original cities in repeating infinite cycle
│   ├── gear.ts                   # Equipment catalog (6 slots, 6 rarities, Forge recipes)
│   ├── pets.ts                   # 14 companion pet species (delivery, tips, multipliers)
│   ├── vault.ts                  # 12 permanent Vault artifacts
│   ├── achievements.ts           # 5-category multi-tier achievements + 10 Chef Ranks
│   └── events.ts                 # 4 Major Events, 2 Timed Adventures, Potion Shop, Merchant, Club 50-tier table
├── engine/
│   ├── rng.ts                    # Serializable Mulberry32 deterministic PRNG
│   ├── economy/
│   │   ├── bigNumber.ts          # break_infinity.js Decimal wrapper & notation formatter
│   │   ├── balanceConfig.ts      # Single source of truth for all economy curves
│   │   ├── stats.ts              # (1 + own) * (1 + allWorkers) - 1 aggregator
│   │   └── economy.ts            # Bulk/max purchase math, dish payout pipeline, analytical offline EPS & tips
│   ├── sim/
│   │   ├── pathfinding.ts        # Cached 2D nav-grid A* + separation steering
│   │   ├── layoutBuilder.ts      # Floorplan generator for all 6 restaurant archetypes
│   │   └── restaurantSim.ts      # Fixed-timestep entity simulation (customers, workers, pets, skills)
│   ├── meta/                     # Equipment, Forge, Loot Boxes, Pets, Vault, Achievements
│   ├── events/eventEngine.ts     # Isolated state manager for Major Events, Adventures, Potion Shop & Activities
│   ├── social/                   # Club manager + optional online leaderboard/cloud sync client
│   ├── anticheat/verifier.ts     # Hash-chained checkpoints & plausibility verification
│   ├── persistence/              # Versioned save schema (v1->v2) & double-buffered atomic IndexedDB storage
│   └── GameController.ts         # Central fixed-timestep coordinator (30 Hz sim, 10 Hz UI notify)
├── renderer/
│   ├── meshFactory.ts            # Shared-material procedural low-poly 3D assets (stations, characters w/ gear, pets, cars)
│   └── SceneRenderer.ts          # Zero-React-overhead Three.js renderer (60/30 FPS, adaptive DPR, raycast picking)
├── audio/soundEngine.ts          # Procedural Web Audio SFX (zero external audio files, 100% offline)
├── native/capacitorBridge.ts     # Capacitor Android lifecycle, back button, haptics, Play Integrity hook
└── ui/                           # Portrait-first React 19 UI + imperative WorldOverlayPainter
api/                              # Optional Vercel serverless endpoints (cloud backup, clubs, anti-cheat leaderboards)
android/                          # Native Capacitor Android project with packaged dist/ web bundle
tools/simulate-economy.ts         # Headless multi-strategy bot balance simulator
tests/                            # 6 Vitest suites covering all major subsystems
```

## Performance & Mobile Engineering Guarantees

1. **Zero Per-Frame React State Updates**: `SceneRenderer` reads entity positions directly from `GameController` using render interpolation `alpha` and paints 3D-projected speech bubbles, station badges, tips, and floating cash callouts via `WorldOverlayPainter` (pooled DOM elements). React only re-renders on user interaction or throttled ~8–10 Hz HUD ticks.
2. **Fixed Timestep + Battery Saving**: Simulation ticks at deterministic `FIXED_DT = 1/30s`; renderer supports both **60 FPS** primary and **30 FPS** battery-saving mode plus `low` / `medium` / `high` shadow & DPR profiles.
3. **Offline-First Persistence**: Atomic double-buffered IndexedDB storage writes previous verified snapshots into `save_backup` before committing `save_primary`, automatically healing from interrupted writes or corrupted checksums. Offline earnings are computed analytically in $O(\text{stations})$ time without replaying frames.
4. **Packaged Android Release**: Capacitor packages the Vite `dist/` bundle inside `android/app/src/main/assets/public` so Google Play builds work 100% offline and never unexpectedly break from web deployments.
