# Third-Party Notices & Open-Source Evaluation Record

## Reference Repositories Evaluated (Phase 1)

All candidate repositories listed in the project brief were inspected via GitHub API before architecture design:

| Repository | Detected License | Evaluation & Reuse Decision |
|---|---|---|
| `morluto/rea` | MIT | Evaluated as reverse-engineering toolkit (`npx rea-agents setup`). Not bundled into Sizzle Empire runtime; no APK was present in the build VM. |
| `carlomigueldy/restaurant-city-threejs` | **None (All Rights Reserved)** | Architectural inspiration only (Vite + TS + raw Three.js isometric restaurant). **Zero code or assets copied.** |
| `mehmetmutllu/tea-house-tycoon-game` | **None (All Rights Reserved)** | Architectural inspiration only (centralized economy config, headless economy simulator, Capacitor mobile build). **Zero code or assets copied.** |
| `enesbabekoglu/Restaurant-Game-Canvas-JS` | MIT | 2D HTML5 Canvas implementation; not reused (Sizzle Empire is built in strict TypeScript + Three.js 3D). |
| `Ojansen/idle_tycoon` | MIT | Nuxt/Vue incremental tycoon; not reused (Sizzle Empire uses React + Vite + Three.js). |
| `sutheimernico/incremental-game` | MIT | Reviewed CI-asserted headless bot-player pacing test concept; Sizzle Empire implements an original TypeScript `break_infinity.js` bot simulator from scratch. |

---

## Runtime & Build Dependencies

All direct dependencies used in **Sizzle Empire** carry permissive OSI-approved licenses:

- **react / react-dom** — MIT License (Meta Platforms, Inc.)
- **three** (`@types/three`) — MIT License (Three.js Authors)
- **break_infinity.js** — MIT License (Patashu)
- **lucide-react** — ISC License (Lucide Contributors)
- **vite** — MIT License (Evan You & Vite Contributors)
- **@vitejs/plugin-react** — MIT License
- **vite-plugin-pwa** / **workbox** — MIT License
- **@capacitor/core**, **@capacitor/cli**, **@capacitor/android**, **@capacitor/app**, **@capacitor/haptics**, **@capacitor/status-bar** — MIT License (Ionic / Capacitor)
- **typescript** — Apache-2.0 License (Microsoft)
- **vitest** / **fake-indexeddb** — MIT License / Apache-2.0 License

All 3D geometry, materials, audio synthesis, icons, world names, restaurants, items, pets, events, and simulation code in **Sizzle Empire** are 100% originally authored for this project.
