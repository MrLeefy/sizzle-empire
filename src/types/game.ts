export type DecimalString = string;

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'ultimate' | 'mythic';

export type GearSlot = 'head' | 'body' | 'hand' | 'ring' | 'necklace';

export type EquippedSlotKey = 'head' | 'body' | 'hand1' | 'hand2' | 'ring' | 'necklace';

export type RestaurantTier = 'mini_kiosk' | 'street_stall' | 'food_van' | 'eatery' | 'flagship';

export type RestaurantArchetype =
  | 'counter_stand'
  | 'food_truck'
  | 'cafe_tables'
  | 'waiter_dining'
  | 'drive_thru'
  | 'grand_hall';

export type WorkerRole = 'player' | 'chef' | 'waiter' | 'cashier' | 'helper';

export type BuyMode = '1' | '10' | '50' | '100' | 'max';

export type NumberNotation = 'alphabetic' | 'scientific';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type FrameRateTarget = 30 | 60;

export type EventDifficulty = 'normal' | 'hard' | 'extreme' | 'impossible' | 'nightmare';

export type EventMedal = 'none' | 'bronze' | 'silver' | 'gold';

export interface Vec2 {
  x: number;
  z: number;
}

export interface StationTemplate {
  id: string;
  name: string;
  icon: string;
  color: string;
  accentColor: string;
  modelStyle:
    | 'juicer'
    | 'grill'
    | 'oven'
    | 'espresso'
    | 'fryer'
    | 'sushi'
    | 'blender'
    | 'wok'
    | 'cauldron'
    | 'dessert';
  baseUnlockCost: number;
  baseUpgradeCost: number;
  baseRevenue: number;
  basePrepTime: number; // seconds
  initialMachines: number;
  maxMachines: number;
  servedByRole?: 'chef' | 'waiter' | 'any';
  ingredientId?: string; // used in Potion Shop event
}

export interface RestaurantUpgradeTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number; // scaled by city difficulty & restaurant base
  kind:
    | 'hire_chef'
    | 'hire_waiter'
    | 'hire_cashier'
    | 'add_customer'
    | 'add_table'
    | 'add_machine'
    | 'station_profit'
    | 'global_profit'
    | 'worker_speed'
    | 'cook_speed';
  stationIndex?: number;
  value: number; // e.g., +1 chef, x2 profit, +0.25 speed
}

export interface RestaurantTemplate {
  id: string;
  name: string;
  subtitle: string;
  tier: RestaurantTier;
  archetype: RestaurantArchetype;
  maxStationLevel: number;
  baseCostScale: number;
  themeFloorColor: string;
  themeWallColor: string;
  themeAccentColor: string;
  themeRoofColor: string;
  initialCustomerCap: number;
  maxCustomerCap: number;
  initialWaiters: number;
  initialCashiers: number;
  stations: StationTemplate[];
  upgrades: RestaurantUpgradeTemplate[];
}

export interface CityDefinition {
  index: number; // 0..59
  name: string;
  region: string;
  tagline: string;
  skyColor: string;
  groundColor: string;
  accentColor: string;
  restaurantIds: string[]; // 6 or 7 restaurant template IDs
}

// ---------- Simulation Runtime Entities ----------

export interface StationState {
  index: number;
  templateId: string;
  unlocked: boolean;
  level: number;
  machines: number;
  profitMultiplier: number; // from restaurant one-time upgrades
  speedMultiplier: number;
  milestonesClaimed: number; // bitmask or count
  occupiedByWorkerIds: string[]; // worker IDs currently cooking at each machine slot
  worldPos: Vec2;
  workSpots: Vec2[];
}

export type CustomerStatus =
  | 'entering'
  | 'waiting_to_order'
  | 'ordering'
  | 'waiting_for_food'
  | 'leaving';

export interface OrderItem {
  id: string;
  customerId: string;
  stationIndex: number;
  status: 'queued' | 'cooking' | 'ready_at_pass' | 'delivering' | 'delivered';
  assignedWorkerId: string | null;
  assignedPetId: string | null;
  deliveryTargetPos: Vec2;
  quality: 'normal' | 'perfect' | 'divine';
  isDouble: boolean;
  isGolden: boolean;
  deliveryPetMult: number;
  isPlayerCooked: boolean;
}

export interface CustomerEntity {
  id: string;
  slotIndex: number;
  isCar: boolean;
  isGolden: boolean;
  isGreedy: boolean;
  status: CustomerStatus;
  pos: Vec2;
  prevPos: Vec2;
  targetPos: Vec2;
  path: Vec2[];
  facing: number;
  orderTakeProgress: number; // 0..1
  orderTakeDuration: number;
  orderTakenByWorkerId: string | null;
  pendingOrders: OrderItem[];
  deliveredCount: number;
  totalOrderedCount: number;
  reorderCount: number;
  primaryDishIcon: string;
  shirtColor: string;
  hairColor: string;
  patienceTimer: number;
}

export type WorkerStatus =
  | 'idle'
  | 'walking_to_order'
  | 'taking_order'
  | 'walking_to_station'
  | 'cooking'
  | 'walking_to_pass'
  | 'walking_to_customer'
  | 'returning_idle';

export interface WorkerEntity {
  id: string;
  role: WorkerRole;
  name: string;
  status: WorkerStatus;
  pos: Vec2;
  prevPos: Vec2;
  targetPos: Vec2;
  path: Vec2[];
  facing: number;
  homePos: Vec2;
  activeOrderId: string | null;
  activeCustomerId: string | null;
  activeStationIndex: number | null;
  activeMachineSlot: number | null;
  cookProgress: number; // 0..1
  cookDuration: number;
  carryingDish: boolean;
  carryingDishColor: string;
  carryingQuality: 'normal' | 'perfect' | 'divine';
  shirtColor: string;
  expiresAtSimTime: number | null; // for invited helpers
}

export type PetSimStatus = 'following' | 'delivering_to_customer' | 'collecting_tip' | 'returning';

export interface ActivePetEntity {
  id: string;
  instanceId: string;
  speciesId: string;
  status: PetSimStatus;
  pos: Vec2;
  prevPos: Vec2;
  targetPos: Vec2;
  facing: number;
  activeOrderId: string | null;
  activeTipId: string | null;
  tipCooldownTimer: number;
  carryingDish: boolean;
  carryingQuality: 'normal' | 'perfect' | 'divine';
  color: string;
  accentColor: string;
  deliveryMultiplier: number;
  tipInterval: number;
}

export interface TipPileEntity {
  id: string;
  slotIndex: number;
  pos: Vec2;
  amount: DecimalString;
  createdAt: number;
}

export interface FloatingFeedback {
  id: number;
  text: string;
  subtext?: string;
  worldPos: Vec2;
  heightOffset: number;
  kind: 'cash' | 'perfect' | 'divine' | 'golden' | 'tip' | 'gem' | 'milestone';
  age: number;
  maxAge: number;
}

export interface ServiceSlot {
  index: number;
  kind: 'counter' | 'table' | 'drive_thru';
  customerPos: Vec2;
  servePos: Vec2;
  tipPos: Vec2;
  occupiedByCustomerId: string | null;
  unlocked: boolean;
}

export interface RestaurantLayout {
  width: number;
  depth: number;
  entrancePos: Vec2;
  exitPos: Vec2;
  /**
   * Pedestrian sidewalk lane (z) customers stroll along from/to off-screen, and the |x| where they
   * spawn/despawn out of view. `null` for drive-thru venues (cars use their own road lane).
   */
  sidewalkLaneZ: number | null;
  offscreenX: number;
  passCounterPos: Vec2 | null;
  usesWaiterPass: boolean;
  isDriveThru: boolean;
  slots: ServiceSlot[];
  stationPositions: Vec2[];
  chefHomePositions: Vec2[];
  waiterHomePositions: Vec2[];
  gridSize: number;
  cellSize: number;
  blockedCells: Set<string>;
}

export interface RestaurantRuntimeState {
  templateId: string;
  cityIndex: number;
  cityLoop: number;
  restaurantStageIndex: number;
  cash: DecimalString;
  totalCashEarnedHere: DecimalString;
  stations: StationState[];
  purchasedUpgradeIds: string[];
  customerCapacity: number;
  tableCount: number;
  chefCount: number;
  waiterCount: number;
  cashierCount: number;
  workerSpeedMult: number;
  cookSpeedMult: number;
  globalProfitMult: number;
  customers: CustomerEntity[];
  workers: WorkerEntity[];
  pets: ActivePetEntity[];
  tips: TipPileEntity[];
  orders: OrderItem[];
  floatingFeedback: FloatingFeedback[];
  simTime: number;
  spawnTimer: number;
  dishesServedHere: number;
  startedAtMs: number;
  hiredAnyStaffHere: boolean;
  popularDishStationIndex: number | null;
  popularDishEndsAt: number;
  popularDishCooldownEndsAt: number;
  helperCooldownEndsAt: number;
  investorAvailable: boolean;
  investorKind: 'cash' | 'gems';
  investorOfferValue: DecimalString;
  investorCooldownTimer: number;
  investorExpiresTimer: number;
  deliveryContractAvailable: boolean;
  deliveryContractStationIndex: number;
  deliveryContractQty: number;
  deliveryContractReward: DecimalString;
  deliveryContractCooldownTimer: number;
  recentEarningsWindow: Array<{ t: number; amount: number }>;
  estimatedEps: DecimalString;
  modeContext: 'main' | 'major_event' | 'adventure' | 'potion_shop';
  difficultyMultiplier: number;
  stationMaxLevelOverride?: number;
  ignoreGear?: boolean; // true inside Potion Shop event
}

// ---------- Equipment, Pets, Vault, Achievements ----------

export type GearEffectType =
  | 'walk_speed'
  | 'all_walk_speed'
  | 'cook_speed'
  | 'all_cook_speed'
  | 'instant_cook'
  | 'all_instant_cook'
  | 'perfect_chance'
  | 'all_perfect_chance'
  | 'divine_chance'
  | 'all_divine_chance'
  | 'double_chance'
  | 'all_double_chance'
  | 'instant_order'
  | 'golden_customer'
  | 'greedy_customer'
  | 'reorder_chance'
  | 'perfect_value'
  | 'divine_value'
  | 'profit_per_worker';

export interface GearEffect {
  type: GearEffectType;
  value: number; // e.g., 0.30 = +30%
}

export interface GearTemplate {
  id: string;
  name: string;
  slot: GearSlot;
  rarity: Rarity;
  source: 'standard' | 'event_cavern' | 'event_pier' | 'event_lunar' | 'event_citadel' | 'event_potion' | 'adventure_olympus' | 'adventure_corsair' | 'club' | 'rank';
  color: string;
  accentColor: string;
  visualStyle: string;
  effects: GearEffect[];
  forgeRecipe?: Array<{ templateId: string; count: number }>;
}

export interface GearInstance {
  instanceId: string;
  templateId: string;
  level: number; // 1..50
  xp: number;
  isBlueprint: boolean;
  acquiredAt: number;
}

export interface PetSpeciesTemplate {
  id: string;
  name: string;
  baseRarity: Rarity;
  color: string;
  accentColor: string;
  modelStyle: 'chick' | 'pup' | 'kitten' | 'pony' | 'turtle' | 'penguin' | 'bot' | 'lucky_cat' | 'panda' | 'red_fox' | 'dragon' | 'kraken' | 'mole' | 'gnome';
  deliveryMultiplier: number; // 0 if not a delivery pet, else 8, 11, or 17
  tipInterval: number; // 0 if not tip collector, else seconds (15, 20, 30)
  effects: GearEffect[];
  description: string;
}

export interface PetInstance {
  instanceId: string;
  speciesId: string;
  rarity: Rarity;
  level: number; // 1..50
  xp: number;
  acquiredAt: number;
}

export interface EggStack {
  rarity: Exclude<Rarity, 'mythic'>;
  count: number;
  hatchingProgress: number; // pet food invested into current egg of this rarity
}

export type LootBoxType = 'small' | 'big' | 'event_cavern' | 'event_pier' | 'event_lunar' | 'event_citadel' | 'event_potion' | 'club' | 'pet' | 'ring_box' | 'necklace_box';

export interface LootRewardItem {
  kind: 'gear' | 'blueprint' | 'egg' | 'pet_food' | 'gems';
  rarity?: Rarity;
  templateId?: string;
  amount?: number;
  label: string;
}

export interface VaultArtifactTemplate {
  id:
    | 'tip_jar'
    | 'boost_amp'
    | 'patron_compass'
    | 'chrono_glass'
    | 'quick_register'
    | 'signal_tower'
    | 'tip_vault'
    | 'offline_blade'
    | 'swift_floor'
    | 'vip_briefcase'
    | 'starter_check'
    | 'adventure_keyring';
  name: string;
  icon: string;
  description: string;
  maxLevel: number;
  baseGemCost: number;
  gemCostStep: number;
  minValue: number;
  maxValue: number;
  unit: 'percent' | 'multiplier' | 'cash';
}

export interface VaultState {
  unlockedIds: string[];
  levels: Record<string, number>;
}

export type AchievementCategory = 'restaurant' | 'gear' | 'events' | 'pets' | 'mastery';

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  statKey: keyof PlayerStatsCounters;
  starsPerTier: number;
  tiers: Array<{ goal: number; gems: number }>;
}

export interface ChefRankDefinition {
  rank: number;
  title: string;
  requiredStars: number;
  gems: number;
  smallBoxes: number;
  bigBoxes: number;
  petFood: number;
  bonusGearTemplateId?: string;
}

export interface PlayerStatsCounters {
  ordersPrepared: number;
  stationsUpgraded: number;
  employeesHired: number;
  restaurantsRenovated: number;
  citiesCompleted: number;
  tipsCollected: number;
  instantDishesMade: number;
  perfectDishesMade: number;
  divineDishesMade: number;
  petDeliveries: number;
  petTipsCollected: number;
  boxesOpened: number;
  itemsSalvaged: number;
  itemsForged: number;
  eggsHatched: number;
  petsMerged: number;
  petFoodSpent: number;
  vaultUpgradesBought: number;
  gemsSpent: number;
  adventuresCompleted: number;
  potionsBottled: number;
  eventMedalsEarned: number;
  clubItemsSalvaged: number;
  popularDishesUsed: number;
  helpersInvited: number;
  soloRestaurantsFinished: number;
  highestItemLevel: number;
  highestPetLevel: number;
}

// ---------- Events, Adventures, Potion Shop, Merchant & Race ----------

export type MajorEventId = 'crystal_cavern' | 'tidewater_pier' | 'lunar_outpost' | 'citadel_banquet';

export interface MajorEventProgress {
  eventId: MajorEventId;
  unlockedDifficulty: EventDifficulty;
  activeDifficulty: EventDifficulty;
  bestMedalByDifficulty: Partial<Record<EventDifficulty, EventMedal>>;
  bestClearSecondsByDifficulty: Partial<Record<EventDifficulty, number>>;
  activeRun: RestaurantRuntimeState | null;
  stageIndex: number; // for multi-stage events like Citadel Banquet (0..2)
  claimedMilestones: number[];
  completedCurrentRun: boolean;
}

export type AdventureId = 'olympian_trial' | 'corsair_cove';

export interface AdventureProgress {
  adventureId: AdventureId;
  highestClearedLevel: number; // 0..100
  keys: number;
  maxKeys: number;
  lastKeyRegenMs: number;
  activeLevel: number | null;
  activeTimeRemainingSec: number;
  activeRun: RestaurantRuntimeState | null;
  lastOutcome: { won: boolean; level: number; rewards: LootRewardItem[] } | null;
}

export interface PotionRecipeDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  ingredientA: string;
  ingredientB: string;
  effectType: GearEffectType;
  baseEffect: number;
  effectPerLevel: number;
  baseIngredientCost: number;
}

export interface ArcaneVaultArtifact {
  id:
    | 'potion_bandolier'
    | 'distiller'
    | 'crystal_catalyst'
    | 'arcane_ladle'
    | 'alchemy_scales'
    | 'oak_sapling'
    | 'funnel';
  name: string;
  description: string;
  maxLevel: number;
  scrollCostBase: number;
  scrollCostStep: number;
  minVal: number;
  maxVal: number;
}

export interface ActiveBrewedPotion {
  recipeId: string;
  level: number;
}

export interface BottledPotionStack {
  recipeId: string;
  level: number;
  effectValue: number;
  durationSec: number;
  count: number;
}

export interface ActiveMainPotionBuff {
  recipeId: string;
  effectType: GearEffectType;
  effectValue: number;
  expiresAtMs: number;
}

export interface PotionShopState {
  scrolls: number;
  corks: number;
  ingredients: Record<string, number>;
  activePotions: ActiveBrewedPotion[];
  bottledPotions: BottledPotionStack[];
  activeMainBuffs: ActiveMainPotionBuff[];
  arcaneVaultUnlocked: string[];
  arcaneVaultLevels: Record<string, number>;
  activeRun: RestaurantRuntimeState | null;
  completedCurrentRun: boolean;
}

export interface RotatingActivitiesState {
  merchantTokens: number;
  merchantPurchasedIds: string[];
  raceStars: number;
  raceTierClaimed: number;
  harvestPoints: number;
  harvestTierClaimed: number;
}

export interface EventsMetaState {
  activeView: 'main' | 'major_event' | 'adventure' | 'potion_shop';
  activeMajorEventId: MajorEventId;
  activeAdventureId: AdventureId;
  majorEvents: Record<MajorEventId, MajorEventProgress>;
  adventures: Record<AdventureId, AdventureProgress>;
  potionShop: PotionShopState;
  activities: RotatingActivitiesState;
}

// ---------- Clubs & Leaderboards / Anti-Cheat ----------

export interface ClubMember {
  playerId: string;
  displayName: string;
  role: 'leader' | 'member';
  seasonXp: number;
  cityNumber: number;
  lastActiveMs: number;
}

export interface ClubState {
  id: string;
  name: string;
  tag: string;
  isPublic: boolean;
  seasonId: string;
  totalXp: number;
  level: number; // 1..50
  claimedLevels: number[];
  members: ClubMember[];
}

export interface SocialState {
  playerId: string;
  displayName: string;
  club: ClubState | null;
  clubLeaveCooldownUntilMs: number;
  leaderboardDivision: 'verified' | 'provisional' | 'unranked';
  lastChallengeNonce: string | null;
  lastCheckpointAtMs: number;
  checkpointsSubmitted: number;
  playIntegrityAttested: boolean;
}

export interface ProgressionCheckpoint {
  checkpointId: string;
  playerId: string;
  displayName: string;
  challengeNonce: string;
  createdAtMs: number;
  cityNumber: number;
  restaurantStageIndex: number;
  totalRestaurantsRenovated: number;
  gems: number;
  totalGemsSpent: number;
  allProfitPct: number;
  highestStationLevel: number;
  ordersPrepared: number;
  claimedRewardIdsCount: number;
  clientTimeDeltaMs: number;
  offlineDurationClaimedSec: number;
  playIntegrityToken?: string;
  previousHash: string;
  checkpointHash: string;
}

export interface SettingsState {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  targetFps: FrameRateTarget;
  graphicsQuality: GraphicsQuality;
  notation: NumberNotation;
  buyMode: BuyMode;
  bulkStep: 50 | 100;
  cameraZoom: number;
  sfxVolume?: number; // 0..1, default 0.85
  ambientEnabled?: boolean; // default true
  ambientVolume?: number; // 0..1, default 0.35
}

export interface BoostState {
  activeUntilMs: number;
  chargesRemaining: number;
  lastChargeRegenMs: number;
}

// ---------- Root Versioned Save State ----------

export interface GameSaveData {
  schemaVersion: number;
  savedAtMs: number;
  rngState: number;
  cityNumber: number; // 1-based global city number (1..infinity)
  restaurantStageIndex: number; // 0..(cityRestaurants.length-1)
  gems: number;
  petFood: number;
  boxes: Record<LootBoxType, number>;
  mainRestaurant: RestaurantRuntimeState;
  inventory: GearInstance[];
  equipped: Record<EquippedSlotKey, string | null>;
  pets: PetInstance[];
  equippedPetIds: [string | null, string | null];
  eggs: EggStack[];
  vault: VaultState;
  achievementsClaimedTiers: Record<string, number>;
  claimedChefRanks: number[];
  stats: PlayerStatsCounters;
  events: EventsMetaState;
  social: SocialState;
  boost: BoostState;
  settings: SettingsState;
  lastCheckpointHash: string;
}

// ---------- Computed Stat Summary ----------

export interface ComputedStats {
  allProfitPercent: number; // sum of all gear + pet All Profit %
  allProfitMultiplier: number; // 1 + allProfitPercent / 100
  vroombaMultiplier: number; // 1 + 0.05 * hiredWorkers if equipped
  clubMultiplier: number; // 1.0 .. 2.0
  activeBoostMultiplier: number; // 1.0 or (2 * vaultRemote)
  totalGlobalProfitMultiplier: number;
  // Player chef combined (own * allWorkers)
  playerWalkSpeedMult: number;
  playerCookSpeedMult: number;
  playerInstantCookChance: number;
  playerPerfectChance: number;
  playerDivineChance: number;
  playerDoubleChance: number;
  // Hired worker (allWorkers only)
  workerWalkSpeedMult: number;
  workerCookSpeedMult: number;
  workerInstantCookChance: number;
  workerPerfectChance: number;
  workerDivineChance: number;
  workerDoubleChance: number;
  // Global restaurant / customer effects
  instantOrderChance: number;
  goldenCustomerChance: number;
  greedyCustomerChance: number;
  reorderChance: number;
  perfectValueBonus: number;
  divineValueBonus: number;
  // Vault derived
  tipChance: number;
  tipValueMult: number;
  customerWalkMult: number;
  registerSpeedMult: number;
  offlineMaxSeconds: number;
  offlineIncomeMult: number;
  startingCash: number;
  investorGemChance: number;
  investorCashMult: number;
  boostDurationSec: number;
  adventureKeyKeepChance: number;
}
