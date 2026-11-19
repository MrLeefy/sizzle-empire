import type { GameSaveData, ProgressionCheckpoint } from '@/types/game';
import { computePlayerStats } from '@/engine/economy/stats';

export interface VerificationResult {
  accepted: boolean;
  division: 'verified' | 'provisional' | 'unranked';
  flags: string[];
  reason?: string;
}

/**
 * Deterministic 64-bit hex digest (FNV-1a pair) for checkpoint chain integrity.
 * Runs synchronously in browser, Capacitor WebView, and Vercel serverless functions.
 */
export function hashString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch ^ ((i * 31) & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function buildProgressionCheckpoint(
  save: GameSaveData,
  challengeNonce: string,
  nowMs: number,
  offlineDurationClaimedSec = 0,
  playIntegrityToken?: string,
): ProgressionCheckpoint {
  const stats = computePlayerStats(save, save.mainRestaurant.chefCount + save.mainRestaurant.waiterCount, nowMs);
  const highestStationLevel = Math.max(
    0,
    ...save.mainRestaurant.stations.map((s) => (s.unlocked ? s.level : 0)),
  );
  const claimedRewardIdsCount =
    Object.values(save.achievementsClaimedTiers).reduce((a, b) => a + b, 0) +
    save.claimedChefRanks.length;

  const clientTimeDeltaMs = Math.max(0, nowMs - (save.social.lastCheckpointAtMs || nowMs));
  const payload = {
    checkpointId: `chk_${nowMs.toString(36)}_${save.social.checkpointsSubmitted + 1}`,
    playerId: save.social.playerId,
    displayName: save.social.displayName,
    challengeNonce,
    createdAtMs: nowMs,
    cityNumber: save.cityNumber,
    restaurantStageIndex: save.restaurantStageIndex,
    totalRestaurantsRenovated: save.stats.restaurantsRenovated,
    gems: save.gems,
    totalGemsSpent: save.stats.gemsSpent,
    allProfitPct: Math.round(stats.allProfitPercent),
    highestStationLevel,
    ordersPrepared: save.stats.ordersPrepared,
    claimedRewardIdsCount,
    clientTimeDeltaMs,
    offlineDurationClaimedSec,
    playIntegrityToken,
    previousHash: save.lastCheckpointHash || 'genesis',
  };

  const canonical = JSON.stringify(payload);
  return {
    ...payload,
    checkpointHash: hashString(canonical),
  };
}

/**
 * Verifies a client-submitted checkpoint against the previous trusted checkpoint.
 * Designed explicitly to:
 *  - Detect clock manipulation, duplicate claims, impossible gem/city jumps, hash tampering,
 *    and forged progression.
 *  - NEVER permanently ban/penalize a legitimate player solely for a large mathematically
 *    possible income jump (e.g., equipping Mythic gear + Red Panda + Divine/Golden combo):
 *    borderline spikes route cleanly to `provisional` for review rather than permanent ban!
 */
export function verifyCheckpointPair(
  current: ProgressionCheckpoint,
  previous: ProgressionCheckpoint | null,
  expectedChallengeNonce: string | null,
  serverNowMs: number,
): VerificationResult {
  const flags: string[] = [];

  // 1. Verify checkpoint self-hash integrity
  const { checkpointHash, ...unsigned } = current;
  const recomputed = hashString(JSON.stringify(unsigned));
  if (recomputed !== checkpointHash) {
    return {
      accepted: false,
      division: 'unranked',
      flags: ['tampered_checkpoint_hash'],
      reason: 'Checkpoint hash mismatch',
    };
  }

  // 2. Verify server-issued challenge nonce when online verification is active
  if (expectedChallengeNonce && current.challengeNonce !== expectedChallengeNonce) {
    flags.push('stale_or_mismatched_nonce');
  }

  // 3. Detect clock manipulation (client timestamp > 5 min into the future or jumping backwards)
  if (current.createdAtMs - serverNowMs > 5 * 60 * 1000) {
    flags.push('future_clock_skew');
  }
  if (current.offlineDurationClaimedSec > 12 * 3600) {
    flags.push('excessive_offline_claim');
  }

  // 4. Negative or NaN value checks
  if (
    !Number.isFinite(current.gems) ||
    current.gems < 0 ||
    current.cityNumber < 1 ||
    current.allProfitPct < 0
  ) {
    return {
      accepted: false,
      division: 'unranked',
      flags: ['invalid_numeric_bounds'],
      reason: 'Invalid negative or non-finite values',
    };
  }

  // 5. All-Profit hard theoretical ceiling (6 Mythic Lv50 slots + 2 Ultimate Lv50 pets ≈ 75,000%)
  if (current.allProfitPct > 120_000) {
    flags.push('all_profit_exceeds_max_theoretical_gear');
  }

  if (previous) {
    // 6. Hash chain continuity
    if (current.previousHash !== previous.checkpointHash) {
      flags.push('broken_checkpoint_chain');
    }

    // 7. Monotonic counters cannot decrease (prevents save rollback + reward duplication)
    if (current.totalRestaurantsRenovated < previous.totalRestaurantsRenovated) {
      flags.push('renovation_rollback');
    }
    if (current.cityNumber < previous.cityNumber) {
      flags.push('city_rollback');
    }
    if (current.ordersPrepared < previous.ordersPrepared) {
      flags.push('order_counter_rollback');
    }
    if (current.claimedRewardIdsCount < previous.claimedRewardIdsCount) {
      flags.push('reward_claim_rollback_duplication_risk');
    }

    // 8. Time & velocity plausibility checks
    const elapsedSec = Math.max(1, (current.createdAtMs - previous.createdAtMs) / 1000);
    if (current.createdAtMs < previous.createdAtMs - 15_000) {
      flags.push('clock_moved_backwards');
    }

    const citiesDelta = current.cityNumber - previous.cityNumber;
    const renovationsDelta = current.totalRestaurantsRenovated - previous.totalRestaurantsRenovated;

    // Even a top-end Mythic speedrunner takes >= 3 minutes per full city (6–7 restaurants)
    const maxPlausibleCities = Math.max(2, Math.ceil(elapsedSec / 160));
    if (citiesDelta > maxPlausibleCities) {
      flags.push('implausible_city_velocity');
    }

    // Renovating without preparing any orders is impossible
    if (renovationsDelta > 0 && current.ordersPrepared <= previous.ordersPrepared && current.offlineDurationClaimedSec < 15) {
      flags.push('renovation_without_orders_or_offline');
    }

    // Gem inflow check (total earned = net balance gain + gems spent)
    const gemsEarnedDelta =
      current.gems - previous.gems + Math.max(0, current.totalGemsSpent - previous.totalGemsSpent);
    // Generous upper bound allowing rank claims + club season rewards + achievements + cities
    const maxPlausibleGems = 6500 + citiesDelta * 450 + Math.ceil(elapsedSec * 5);
    if (gemsEarnedDelta > maxPlausibleGems) {
      flags.push('implausible_gem_inflow');
    }
  }

  // Classify without harsh permanent bans on borderline anomalies
  const hardFlags = new Set([
    'tampered_checkpoint_hash',
    'all_profit_exceeds_max_theoretical_gear',
    'implausible_gem_inflow',
    'implausible_city_velocity',
    'reward_claim_rollback_duplication_risk',
    'renovation_without_orders_or_offline',
  ]);

  const hasHardFlag = flags.some((f) => hardFlags.has(f));
  if (hasHardFlag) {
    return {
      accepted: true,
      division: 'unranked',
      flags,
      reason: 'Routed to unranked division for admin review due to progression anomaly',
    };
  }

  if (flags.length > 0) {
    return {
      accepted: true,
      division: 'provisional',
      flags,
      reason: 'Placed in provisional division pending next verified checkpoint',
    };
  }

  return {
    accepted: true,
    division: 'verified',
    flags: [],
  };
}
