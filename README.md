# Sizzle Empire — 3D Culinary Tycoon (Vercel PWA + Capacitor Android)

**Sizzle Empire** is a complete, original, offline-capable stylized 3D idle restaurant tycoon built with **TypeScript, Vite, React 19, Three.js, `break_infinity.js`, IndexedDB, Vercel Serverless APIs, and Capacitor Android**.

## Quick Start

```bash
npm install
npm run dev           # Launch local dev server
npm run build         # Type-check & build production PWA bundle (dist/)
npm test              # Run all 6 automated Vitest test suites (29 tests)
npm run sim:economy   # Run headless multi-strategy economy balance simulator
npm run cap:sync      # Build & sync packaged offline web bundle into android/
```

## Key Features

- **Real-Time 3D Restaurant Simulation**: Customer queues, dining tables, kitchen pass waiters, drive-thru lanes with animated cars, cached A* pathfinding, machine occupancy, automatic Player Chef AI from second 0, and physical 3D delivery & tip-sweeping pets.
- **60 Original Cities & 38+ Venues**: Repeating infinite prestige cycle across Mini Kiosks (Lv 25), Street Stalls (Lv 50), Food Vans (Lv 75), Eateries (Lv 150), and 10-Station Grand Flagships (Lv 250).
- **Deep Meta-Progression**: 6 Equipment slots with live 3D visual gear accessories, Common→Mythic rarities, Salvage leveling, Forge Blueprints, 11 transparent Loot Crates, 14 Companion Pet species with hatching & merging, 12 Permanent Vault artifacts, Multi-tier Achievements & 10 Chef Ranks.
- **Events & Secondary Modes**: 4 Major Themed Events (*Crystal Cavern*, *Tidewater Pier*, *Lunar Outpost*, 3-stage *Citadel Banquet*), 2 Timed 4-Minute Adventures (*Olympian Trial* & *Corsair Cove*), *Alchemist's Apothecary* Potion Crafting + Arcane Vault, Traveling Merchant, Kitchen Sprint Race, and Harvest Collection.
- **Clubs & Verified Leaderboards**: 50-level seasonal Clubs, hash-chained anti-cheat checkpoints, `verified` / `provisional` / `unranked` divisions, and optional Vercel serverless APIs (`api/`) — while keeping all gameplay 100% playable offline.
- **Mobile-First Performance**: Zero per-frame React entity updates, shared GPU materials, instanced floor tiles, 60 FPS / 30 FPS battery saver, adaptive Low/Med/High graphics, safe-area portrait controls, and atomic double-buffered IndexedDB persistence.

## Documentation

- [Clean-Room Functional Specification](docs/CLEAN_ROOM_SPEC.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [Feature Completion Checklist](docs/FEATURE_CHECKLIST.md)
- [Third-Party Notices & License Audit](THIRD_PARTY_NOTICES.md)
