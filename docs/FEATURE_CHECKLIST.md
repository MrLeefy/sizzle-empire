# Sizzle Empire — Milestone & Feature Completion Checklist

Every checked item below is implemented in TypeScript, integrated into the playable app, and verified via automated Vitest suites (`npm test`), headless economy simulations (`npm run sim:economy`), or production Vite/Capacitor builds.

## Phase 1 — Research & Clean-Room Specification
- [x] Public community mechanics & formulas researched and documented (`docs/CLEAN_ROOM_SPEC.md`) with Confirmed / Inferred / Unknown confidence ratings
- [x] Open-source reference projects & licenses audited (`THIRD_PARTY_NOTICES.md`) — zero unlicensed code copied
- [x] `morluto/rea` evaluated and documented (no APK binary present on VM; strictly clean-room)

## Phase 2 — Complete Restaurant Simulation (Milestones A & B)
- [x] Real customer entity lifecycle: enter → seat/counter/lane → order taking (or Instant Order) → wait → receive → pay → tip roll → repeat order roll → exit
- [x] All 6 establishment archetypes: Counter Stands, Food Trucks, Table Cafés, Waiter Dining Halls (pass counter), Drive-Thru Lanes (cars that never tip), 10-Station Grand Flagships
- [x] Deterministic worker AI (`player`, `chef`, `waiter`, `cashier`, `helper`) with atomic order reservation, machine occupancy limits, cached 2D A* pathfinding, separation steering, deadlock-free task reassignment
- [x] Player Chef avatar operates automatically from second 0 without hired staff
- [x] 10 distinct 3D food station styles with cooking animation, 3D radial progress halo, Divine (×26) / Perfect (×6) / Double (×2) / Instant Cook / Golden Customer (×16) / Greedy Customer (8–11 dishes)

## Phase 3 — Economy & Upgrades (Milestone B & C)
- [x] Station unlock, individual leveling, milestone thresholds (`×2` profit + Gems + Merchant Tokens + Race Stars), max caps (`25 / 50 / 75 / 150 / 250 / 1000`)
- [x] Purchase controls: `×1`, `×10`, configurable `×50`/`×100`, `MAX`, and scroll-safe press-and-hold repeating upgrade
- [x] Distinct Restaurant Upgrades panel (hire chefs/waiters/cashiers, expand customers/tables, add machines, station & global profit multipliers, walk & cook speed)
- [x] Centralized `break_infinity.js` Decimal engine (`src/engine/economy/economy.ts`) with alphabetic (`K, M, B, T, aa, ab...`) & scientific notation and zero negative-currency / overflow bugs
- [x] Headless multi-strategy bot economy simulator (`tools/simulate-economy.ts`) testing Beginner, Tall Method, First-Last, and Geared Veteran across full city cycles

## Phase 4 — Restaurants, Renovation & 60 Cities (Milestone C)
- [x] 38+ original restaurant templates across 5 tiers and 6 archetypes
- [x] 60 unique original cities with 6–7 restaurants each and infinite prestige cycling past City 60
- [x] Renovation & City Flight transitions awarding Small Crates & Gems while resetting venue cash/staff/stations and preserving meta-progression

## Phase 5 — Equipment, Forge, Loot Boxes & Pets (Milestone D)
- [x] 6 equipment slots (Head, Body, Hand 1, Hand 2, Ring, Necklace), 6 rarities (Common → Mythic), Lv 1–50 leveling via salvage, Forge blueprint crafting, sorting, stat breakdown, and live 3D visual gear accessories on Player Chef
- [x] 11 Loot Crate types (Small, Grand, 5 Event Crates, Club Crate, Pet Egg Crate, Ring Chest, Necklace Chest) with transparent odds display and single/bulk opening — 100% earnable via gameplay
- [x] 14 original companion pets, egg hatching with Pet Food, pet leveling (1–50), 3→1 pet merging, 5→1 egg merging, 2 pet slots, physical 3D delivery pets (×8/×11/×17) & tip sweep pets (15s/20s/30s)

## Phase 6 — Permanent Progression (Milestone D)
- [x] 12 Permanent Vault artifacts with progressive gem unlock curve (`0` → `1000` gems) & upgrades
- [x] 5-category multi-tier Achievements + Stars + 10 Chef Ranks with claimable milestone rewards

## Phase 7 — Events & Secondary Game Modes (Milestone E)
- [x] Isolated Event Engine preserving main restaurant state intact
- [x] 4 Major Themed Events (*Crystal Cavern*, *Tidewater Pier*, *Lunar Outpost*, 3-stage *Citadel Banquet*) with Normal → Nightmare difficulties, Bronze/Silver/Gold medals, and themed Ultimate blueprints
- [x] 2 Timed Adventures (*Olympian Trial* for Rings, *Corsair Cove* for Necklaces) with 4-minute countdown, regenerating keys, Vault Keycard refund chance, 100 scaling levels, win/fail screens
- [x] *Alchemist's Apothecary* Potion Shop (gear disabled inside, 10 ingredient stations, 10 brewable recipes, bottling with Corks for Main Game buffs, 7 persistent Arcane Vault artifacts)
- [x] Rotating Activities: Traveling Merchant, Kitchen Sprint Race, Harvest Collection

## Phase 8 — Clubs, Leaderboards & Anti-Cheat (Milestone E & F)
- [x] Social Clubs (City 7 unlock, create/discover/join public & private clubs, salvage spare gear for shared XP, 50 seasonal levels up to ×2.0 Club All Profit, seasonal reset)
- [x] Anti-Cheat progression checkpoints (hash chain, server challenge nonces, plausibility checks for clock skew, rollback duplication, gem inflow, city velocity, generous tolerance against false positives)
- [x] Verified / Provisional / Unranked leaderboard divisions + Vercel serverless APIs (`api/leaderboard.ts`, `api/clubs.ts`, `api/account.ts`) + Admin review queue + honest offline mode (zero fabricated opponents)

## Phase 9 & 10 — Mobile Experience, PWA, Capacitor & Saves (Milestone F)
- [x] Stylized low-poly 3D visuals (shared materials, instanced checkerboard floor tiles, shadows, animations, zero placeholder cubes)
- [x] Portrait-first safe-area mobile UI, 60 FPS / 30 FPS battery saver, adaptive Low/Med/High graphics, procedural Web Audio SFX
- [x] Installable Vercel PWA (`vite-plugin-pwa`, offline Workbox precache, `vercel.json`)
- [x] Native Capacitor Android project generated & synced (`android/`, packaged offline assets, lifecycle save/resume, back-button handler, haptics, Play Integrity native hook)
- [x] Atomic double-buffered IndexedDB persistence with checksum verification, corruption backup recovery, v1→v2 schema migrations, and JSON export/import

## Remaining / Device-Specific Production Notes
- [ ] Real physical Android APK/AAB signing & Google Play Console upload (requires keystore & Android SDK/Gradle on developer workstation or CI runner — Gradle project is already generated in `android/`)
- [ ] Production persistent DB binding (Vercel KV / Postgres) to swap in for the default in-memory `api/_store.ts` adapter when deploying multi-instance cloud leaderboards/clubs
- [ ] Optional native Google Play Integrity Java/Kotlin Capacitor plugin registration inside `android/` for Play Store hardware attestation
