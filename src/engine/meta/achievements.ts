import type { ChefRankDefinition, GameSaveData } from '@/types/game';
import { ACHIEVEMENTS, CHEF_RANKS } from '@/data/achievements';
import { createGearInstance } from './equipment';

export function getTotalAchievementStars(save: GameSaveData): number {
  let stars = 0;
  for (const ach of ACHIEVEMENTS) {
    const claimed = save.achievementsClaimedTiers[ach.id] ?? 0;
    stars += claimed * ach.starsPerTier;
  }
  return stars;
}

export function getCurrentChefRank(save: GameSaveData): ChefRankDefinition {
  const stars = getTotalAchievementStars(save);
  let current = CHEF_RANKS[0];
  for (const r of CHEF_RANKS) {
    if (stars >= r.requiredStars) current = r;
  }
  return current;
}

export function getClaimableAchievementCount(save: GameSaveData): number {
  let count = 0;
  for (const ach of ACHIEVEMENTS) {
    const claimed = save.achievementsClaimedTiers[ach.id] ?? 0;
    const val = save.stats[ach.statKey] ?? 0;
    if (claimed < ach.tiers.length && val >= ach.tiers[claimed].goal) {
      count++;
    }
  }
  const stars = getTotalAchievementStars(save);
  for (const rank of CHEF_RANKS) {
    if (stars >= rank.requiredStars && !save.claimedChefRanks.includes(rank.rank)) {
      count++;
    }
  }
  return count;
}

export function claimAchievementTier(
  save: GameSaveData,
  achievementId: string,
): { gems: number; stars: number } | null {
  const ach = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!ach) return null;

  const claimed = save.achievementsClaimedTiers[ach.id] ?? 0;
  if (claimed >= ach.tiers.length) return null;

  const tier = ach.tiers[claimed];
  const statVal = save.stats[ach.statKey] ?? 0;
  if (statVal < tier.goal) return null;

  save.achievementsClaimedTiers[ach.id] = claimed + 1;
  save.gems += tier.gems;
  return { gems: tier.gems, stars: ach.starsPerTier };
}

export function claimChefRankReward(
  save: GameSaveData,
  rankNum: number,
): ChefRankDefinition | null {
  const rank = CHEF_RANKS.find((r) => r.rank === rankNum);
  if (!rank) return null;
  if (save.claimedChefRanks.includes(rankNum)) return null;

  const stars = getTotalAchievementStars(save);
  if (stars < rank.requiredStars) return null;

  save.claimedChefRanks.push(rankNum);
  save.gems += rank.gems;
  save.boxes.small = (save.boxes.small ?? 0) + rank.smallBoxes;
  save.boxes.big = (save.boxes.big ?? 0) + rank.bigBoxes;
  save.petFood += rank.petFood;

  if (rank.bonusGearTemplateId) {
    save.inventory.push(createGearInstance(rank.bonusGearTemplateId, false));
  }
  return rank;
}
