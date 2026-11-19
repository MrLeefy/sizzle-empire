# Clean-Room Functional Specification — Eatventure-Style Idle Restaurant Tycoon Reference

> **Project**: **Sizzle Empire** (100% original IP, branding, world, items, pets, artwork, audio, and TypeScript implementation)
> **Methodology**: Clean-room functional analysis based exclusively on public community documentation (`eatventuregear.com`, `eatventuretools.app`, public Fandom wiki pages, public patch notes on `r/eatventureofficial`), observable gameplay mechanics, and mathematical modeling.
> **Reverse Engineering Toolkit Note**: `morluto/rea` (`npx rea-agents setup`, MIT license) was evaluated for binary/runtime investigation. Because no lawfully obtained APK or connected Android device with the original app is present in this remote Linux VM, no binary inspection or decompilation was performed. No DRM was bypassed, and zero proprietary assets or code were extracted or copied.

---

## Confidence Legend

- **Confirmed**: Independently corroborated by multiple public community databases (`eatventuregear.com`, official patch notes, Fandom wiki tables).
- **Inferred**: Reconstructed from observable player reports, build-comparer math, and community guides; exact internal constants may vary across patches.
- **Unknown**: Exact server-side or internal implementation formula is not publicly documented; Sizzle Empire implements a clean-room balanced equivalent validated via headless simulation.

---

## 1. Core Restaurant Simulation Mechanics

### 1.1 Customer Lifecycle
- **Trigger**: Active restaurant with at least 1 unlocked station and available customer capacity (`activeCustomers < maxCustomerCapacity`).
- **State Machine**:
  1. `SPAWNING` → spawns at entrance / sidewalk / drive-thru lane entry after spawn interval cooldown.
  2. `MOVING_TO_SLOT` → navigates to an available counter slot, dining table seat, or drive-thru window slot.
  3. `WAITING_TO_ORDER` → requests order taking. If `instantOrderChance` triggers (e.g., from companion pet or potion), skips worker order-taking delay immediately. Otherwise waits for nearest free cashier/waiter/chef to walk over and take order (`baseOrderTime / registerMultiplier`, where base ≈ 1.0s and max Register ≈ 0.2s — **Confirmed** via `eatventuregear.com/guide/`).
  4. `WAITING_FOR_FOOD` → customer orders `1–3` dishes normally, or `8–11` dishes if rolled as a **Greedy Customer** (**Confirmed** via `eatventuregear.com/guide/`). Dish selection chooses uniformly among currently unlocked stations, weighted heavily toward the active **Popular Dish** if that skill is active (**Inferred**).
  5. `RECEIVING_AND_PAYING` → as each dish is delivered, immediate payment is credited to restaurant cash. Once all ordered dishes are delivered:
     - **Tip Roll**: For seated/counter customers (never drive-thru cars — **Confirmed**), rolls `tipChance` (Vault Tip Jar: 12% → 50%). Tips accumulate on the table/counter until tapped by the player or collected by a Tip Pet.
     - **Repeat Order Roll**: Rolls `reorderChance`. If triggered, customer stays seated and places another order (preserving Golden status if already Golden — **Confirmed**). Can chain multiple times.
  6. `LEAVING` → navigates to exit and despawns/returns to object pool.
- **Movement Speed**: Base walk speed multiplied by Vault Mop (`×1.05` → `×2.0`, **Confirmed**).
- **Edge Cases**:
  - Station unlocked mid-session becomes immediately orderable for new orders.
  - Drive-thru cars occupy lane slots sequentially; cars never leave tips.
  - No customer can remain permanently orphaned if a worker is reassigned; unclaimed orders re-enter the shared order queue.

### 1.2 Establishment Archetypes
- **Confirmed** from `eatventuregear.com/restaurants/`: 5 restaurant types across 60 cities (43 templates in reference):
  1. **Small Stand** (1 station, max level 25) — counter-service, chef takes orders, cooks, and serves directly.
  2. **Big Stand** (2 stations, max level 50) — counter-service with 2 stations and optional extra chefs.
  3. **Food Truck** (3 stations, max level 75) — window counter with outdoor queue and multiple stations.
  4. **Restaurant / Café / Drive-Thru** (4–7 stations, max level 150) — introduces dining tables with separate Waiter/Cashier roles, kitchen pass counters, or Drive-Thru car lanes.
  5. **Big Restaurant** (10 stations, max level 250) — multi-area kitchen + dining room or dual service zones (counter + tables or drive-thru + takeout).
- **Event Venues**: 10–12 stations, max level 1000 (**Confirmed** via `eatventuregear.com/events/`).

### 1.3 Worker AI & Scheduling
- **Worker Roles**:
  - `PLAYER_CHEF`: Always present from start of every restaurant, works automatically with zero hired staff, inherits both **Own** and **All-Workers** gear stats (**Confirmed**).
  - `CHEF`: Hired via restaurant upgrades; prepares dishes at kitchen stations and delivers to pass counter or counter customers; inherits **All-Workers** stats only.
  - `WAITER` / `CASHIER`: In dining-room or hybrid restaurants, takes customer orders at tables/counters, fetches plated dishes from the kitchen pass (or direct beverage stations), and delivers to customers.
  - `HELPER`: Temporarily invited geared chef (duration ~4–5 min, cooldown ~30 min — **Inferred** from community guides); contributes equipped bonuses.
- **Task Priority & Reservation**:
  - Orders enter a central task queue (`NEED_ORDER_TAKEN`, `NEED_COOK`, `NEED_DELIVERY`).
  - Workers claim tasks atomically via reservation tokens so no two workers cook or deliver the same order item.
  - Each station supports `machineSlots` concurrent cooks (`1` initially, expandable via upgrades). If all slots at station `S` are occupied, workers pick another station's pending dish or queue briefly without deadlock.
  - Walk speed and cooking speed scale with worker modifiers (`effectiveCookTime = baseCookTime / cookSpeedMultiplier`, or `0` on Instant Cook).

---

## 2. Combat / Calculation Pipeline (Dish Pricing & Modifiers)

### 2.1 Own vs All-Workers Stat Combining (**Confirmed** — `eatventuregear.com/guide/`)
When both personal (`own`) and team (`allWorkers`) bonuses exist for the same stat on the Player Chef:
```text
total = (1 + own) × (1 + allWorkers) - 1
```
- Probability stats (`instantCook`, `perfect`, `divine`, `double`, `instantOrder`, `golden`, `greedy`, `reorder`) are clamped to `[0, 1]` (chances above 100% have no additional effect).
- Hired workers use `allWorkers` only.
- Customer-level stats (`golden`, `greedy`, `reorder`, `instantOrder`) apply globally to the restaurant.

### 2.2 Dish Value Pipeline (**Confirmed** — `eatventuregear.com/guide/`)
1. **Base Station Revenue**: `baseValue(station, level) × stationMilestoneMultipliers × restaurantUpgradeMultipliers`
2. **Global Profit Multiplier**:
   - Equipment + Pet All Profit bonuses sum additively: `allProfitMult = 1 + sum(itemAllProfitPct)` (Note: Rings and Necklaces provide `2×` the base gear All Profit table — **Confirmed**).
   - Multiplied by:
     - `vroombaMult = 1 + 0.05 × hiredWorkerCount` (if worker-scaling pet equipped — **Confirmed**).
     - `clubAllProfitMult` (`×1.00` to `×2.00` — **Confirmed**).
     - `activeBoostMult` (base `×2`, scaled by Vault Remote `×1.1` → `×6.0` — **Confirmed**).
     - `potionBuffMult` (active bottled/event potions).
3. **Quality Roll (Mutually Exclusive Hierarchy — Confirmed)**:
   - First roll `divineChance`: if hit → `qualityMult = 26 × (1 + divineValueBonus)` (e.g., Red Panda `+20%`, Baby Kraken `+40%`).
   - Else roll `perfectChance`: if hit → `qualityMult = 6 × (1 + perfectValueBonus)` (e.g., Dark Horse/Tortoise `+100%`).
   - Else → `qualityMult = 1`.
4. **Double Food Roll**:
   - Roll `doubleChance`: if hit → `doubleMult = 2` (produces 2× value/portions simultaneously).
5. **Golden Customer Multiplier**:
   - If customer is Golden → `goldenMult = 16` (persists across re-orders — **Confirmed**).
6. **Delivery Pet Multiplier**:
   - When the Player Chef begins cooking (including Instant Cook), the first idle Delivery Pet nearby intercepts delivery, saving the player's walk and multiplying dish price by `×8` (Epic tier), `×11` (Legendary tier), or `×17` (Ultimate tier) (**Confirmed**).
   - Stacks multiplicatively with Divine/Perfect/Double/Golden (**Confirmed**).
7. **Final Dish Payout**:
   ```text
   payout = stationRevenue × globalProfitMult × qualityMult × doubleMult × goldenMult × deliveryPetMult
   ```

### 2.3 Tips & Offline Earnings (**Confirmed** — `eatventuregear.com/guide/` & `/pets/`)
- **Offline Earnings Rate**: Calculated analytically from current unlocked stations' expected revenue per second scaled by `allProfitMult`, Vault `Knife` (`×1.2` → `×10`), and capped by Vault `Hourglass` max duration (base 30 min × `1.33` → `10.7`, ~5.35 hrs max — **Inferred** base duration, **Confirmed** multiplier range).
- **Tip Value**: `50 seconds of offline earnings × Vault Piggy multiplier (×1.2 → ×10)` (**Confirmed**). Tips scale with All Profit but NOT with Divine/Perfect/Golden/Delivery multipliers.

---

## 3. Economy Curves & Scaling (**Inferred / Clean-Room Tuned**)

Exact internal station polynomial/exponential coefficients are **Unknown** from public docs alone; community observations confirm:
- Station upgrade cost grows exponentially per level (~`1.14` to `1.17` per level depending on tier), while station revenue grows smoothly per level (~`1.07` to `1.09`) punctuated by strong **milestone multiplier jumps** at levels `10, 25, 50, 75, 100, 150, 200, 250` (and every 50/100 levels in events up to 1000).
- Reaching each station milestone awards **1 Gem** (plus extra gems at higher milestones/renovations — **Inferred**).
- Station unlock costs step exponentially across stations 1..10 within a restaurant so later stations leapfrog earlier ones once unlocked (creating the classic "Tall Method", "First-Last", and "Balanced" strategic dynamics observed on `r/eatventureofficial`).
- **City Difficulty Scaling**: Each city increases station base costs and upgrade costs by an exponential factor (`~1.12–1.18` per city early, moderating smoothly in late loops) so permanent gear/vault progression remains meaningful without hitting hard brick walls (**Inferred**, validated in Sizzle Empire via our headless multi-city bot simulator).
- **Renovation Rewards**:
  - Small Stand / Big Stand / Food Truck / Eatery renovations award `1–3` Small Boxes depending on stage within the city (**Confirmed** via wiki).
  - Completing the final Flagship restaurant in a city enables **City Travel** and awards `5` Small Boxes (**Confirmed**).

---

## 4. Meta-Progression Systems

### 4.1 Equipment, Rarities & All Profit Scaling (**Confirmed** — `eatventuregear.com/guide/`)
- **Slots**: Head, Body, Hand 1, Hand 2 (unlocks at City 5 in Sizzle Empire / City 60 in reference — we tune Hand 2 unlock to City 4 so players experience dual-wielding early enough in progression while keeping City milestones exciting), Ring (Adventure 1), Necklace (Adventure 2).
- **Item Levels**: Level `1` to `50`. Leveling increases All Profit only; mechanical effects stay constant (**Confirmed**).
- **Reference All Profit Benchmarks (Level 1 → Level 50)**:
  - Common: `+3%` → `+52%` (Pet L50: `+55%`)
  - Rare: `+9%` → `+118%` (Pet L50: `+153%`)
  - Epic: `+27%` → `+295%` (Pet L50: `+590%`)
  - Legendary: `+81%` → `+885%` (Pet L50: `+1769%`)
  - Ultimate: `+243%` → `+2654%` (Pet L50: `+5308%`)
  - Mythic: `+729%` → `+7962%`
  - Rings & Necklaces: `2×` gear values (`+1458%` at Mythic L1 — **Confirmed**).
- **Salvage XP** (**Confirmed** via community table): Common `4 XP`, Rare `9 XP`, Epic `22 XP`, Legendary `54 XP`, Ultimate `130 XP`, Common Egg `25 XP`, Rare Egg `50 XP`, Epic Egg `150 XP`, Legendary Egg `425 XP`, Ultimate Egg `1000 XP`.
- **Forging Recipes** (**Confirmed** — `eatventuregear.com/forge/`):
  - Legendary Blueprint = `2× specific Epic + 3× specific Rare`
  - Ultimate Blueprint = `1× specific Legendary + 2× specific Epic + 3× specific Rare`
  - Mythic Blueprint = `4× specific Ultimate items` (same slot)

### 4.2 Loot Boxes (**Confirmed** — Eatventure Wiki & community analyses)
| Box Type | Gem Cost | Items/Box | Drop Table |
|---|---|---|---|
| Small Box | 40 (or earned via renovation/travel) | 2 | 60% Common Gear, 12% Rare Gear, 3% Epic Gear, 1% Common Egg, 0.25% Rare Egg, 23.75% Pet Food (6–15) |
| Big Box | 200 | 6 | 48% Common, 30% Rare, 15% Epic, 5% Legendary BP, 1.75% Epic Egg, 0.25% Legendary Egg |
| Event Box | 250 | 6 | 48% Common, 30% Rare, 15% Epic, 5% Legendary BP, 2% Themed Ultimate BP |
| Club Box | Earned via Club milestones | 6 | 53% Rare, 33% Epic, 12% Legendary BP, 2% Mythic BP |
| Pet Box | 500 | 3 Eggs + 150 Pet Food | 59% Common Egg, 28% Rare Egg, 11% Epic Egg, 1.5% Legendary Egg, 0.5% Ultimate Egg |

### 4.3 Pets & Hatching (**Confirmed** — `eatventuregear.com/pets/`)
- **Hatch Costs**: Common `100`, Rare `300`, Epic `900`, Legendary `2,700`, Ultimate `8,100` Pet Food.
- **Pet Merging**: `3×` same-rarity pets → `1×` next rarity (up to Ultimate; no Mythic pet). Abilities remain intact; All Profit upgrades to new rarity table.
- **Egg Merging**: `5×` same-rarity eggs → `1×` next rarity egg (up to Ultimate).
- **Pet Movement**: Matches player walk speed, `+25%` catchup boost when returning to player (**Confirmed**).

### 4.4 Permanent Vault (**Confirmed** — `eatventuregear.com/vault/`)
- **12 Artifacts** with progressive unlock costs (`0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 1000` gems = `2,650` total):
  1. Tip Chance (20 levels: 12% → 50%)
  2. Boost Power (50 levels: ×1.1 → ×6.0)
  3. Patron Gem Chance (14 levels: 10% → 50%)
  4. Offline Max Time (29 levels: ×1.33 → ×10.7)
  5. Order Speed (10 levels: ×2.4 → ×6.0)
  6. Boost Duration (24 levels: ×1.1 → ×8.0)
  7. Tip Multiplier (45 levels: ×1.2 → ×10.0)
  8. Offline Income (45 levels: ×1.2 → ×10.0)
  9. Customer Walk Speed (20 levels: ×1.05 → ×2.0)
  10. Patron Cash Bonus (45 levels: ×1.2 → ×10.0)
  11. Starting Cash (20 levels: 100 → 3.64B)
  12. Adventure Key Retention (30 levels: 5% → 35%)

### 4.5 Events, Adventures, Potion Crafting, Clubs & Achievements (**Confirmed** — `eatventuregear.com`)
- **4 Major Themed Events**: Normal → Hard → Extreme → Impossible → Nightmare difficulty tiers; Bronze/Silver/Gold medals; isolated event restaurant economy; max station level 1000.
- **2 Timed Adventures**: 4-minute countdown to max all stations across 100 progressively scaled levels; uses keys; rewards Ring or Necklace boxes.
- **Potion Crafting Event**: Gear temporarily unequipped; 10 ingredient stations brew 10 potions requiring ingredient pairs; limited active slots (expandable via Arcane Vault 7 artifacts bought with Scrolls); potions can be bottled (20%–50% power, 5–20 min duration) for main-game use.
- **Clubs**: Unlocks at City 7; up to 10 members; salvage items for shared Club XP across 50 seasonal levels (241,950 XP total) awarding Gems, Boxes, Pet Food, Eggs, and seasonal Club All Profit up to `×2.0`.
- **Achievements**: 5 categories (Restaurant, Gear, Events, Pets, Mastery), up to 10 tiers per achievement awarding Gems + Stars; Stars advance 10 Chef Ranks (`0` to `150` stars) with milestone rewards.
