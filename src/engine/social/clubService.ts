import type { ClubState, GameSaveData } from '@/types/game';
import { BALANCE } from '@/engine/economy/balanceConfig';
import { CLUB_SEASON_REWARDS } from '@/data/events';
import { getGearSalvageXp } from '@/engine/meta/equipment';
import { addEggToSave } from '@/engine/meta/lootBoxes';

export function getCurrentSeasonId(nowMs = Date.now()): string {
  // 14-day seasonal cycles
  const seasonNum = Math.floor(nowMs / (14 * 24 * 3600 * 1000));
  return `S${seasonNum}`;
}

export function computeClubLevelFromXp(totalXp: number): number {
  let lv = 1;
  for (const row of CLUB_SEASON_REWARDS) {
    if (totalXp >= row.cumulativeXp) {
      lv = row.level;
    } else {
      break;
    }
  }
  return lv;
}

export function canAccessClubs(save: GameSaveData): boolean {
  return save.cityNumber >= BALANCE.CLUB_UNLOCK_CITY || save.social.club !== null;
}

export function createClubLocal(
  save: GameSaveData,
  name: string,
  tag: string,
  isPublic: boolean,
  nowMs = Date.now(),
): { ok: boolean; error?: string } {
  if (save.social.club) return { ok: false, error: 'Leave your current club first.' };
  if (nowMs < save.social.clubLeaveCooldownUntilMs) {
    return { ok: false, error: 'Club rejoin cooldown is active.' };
  }
  const createCost = 1000;
  if (save.gems < createCost) {
    return { ok: false, error: `Requires ${createCost} Gems to found a Club.` };
  }
  const cleanName = name.trim().slice(0, 24);
  if (cleanName.length < 3) return { ok: false, error: 'Club name must be at least 3 characters.' };

  save.gems -= createCost;
  save.stats.gemsSpent += createCost;
  const clubId = `CLB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  save.social.club = {
    id: clubId,
    name: cleanName,
    tag: (tag.trim().toUpperCase().slice(0, 4) || cleanName.slice(0, 3).toUpperCase()),
    isPublic,
    seasonId: getCurrentSeasonId(nowMs),
    totalXp: 0,
    level: 1,
    claimedLevels: [],
    members: [
      {
        playerId: save.social.playerId,
        displayName: save.social.displayName,
        role: 'leader',
        seasonXp: 0,
        cityNumber: save.cityNumber,
        lastActiveMs: nowMs,
      },
    ],
  };

  return { ok: true };
}

export function joinClubByObject(
  save: GameSaveData,
  club: ClubState,
  nowMs = Date.now(),
): { ok: boolean; error?: string } {
  if (save.social.club) return { ok: false, error: 'Already in a club.' };
  if (nowMs < save.social.clubLeaveCooldownUntilMs) {
    return { ok: false, error: 'Wait for your club cooldown to expire.' };
  }
  if (club.members.length >= 10) return { ok: false, error: 'Club is full (10/10 members).' };

  const joined: ClubState = {
    ...club,
    members: [
      ...club.members.filter((m) => m.playerId !== save.social.playerId),
      {
        playerId: save.social.playerId,
        displayName: save.social.displayName,
        role: club.members.length === 0 ? 'leader' : 'member',
        seasonXp: 0,
        cityNumber: save.cityNumber,
        lastActiveMs: nowMs,
      },
    ],
  };
  save.social.club = joined;
  return { ok: true };
}

export function leaveClub(save: GameSaveData, nowMs = Date.now()): void {
  if (!save.social.club) return;
  save.social.club = null;
  save.social.clubLeaveCooldownUntilMs = nowMs + 12 * 3600 * 1000;
}

/**
 * Salvages spare unequipped gear items into the active Club to contribute seasonal XP
 * and automatically unlock seasonal milestone rewards!
 */
export function salvageGearToClub(
  save: GameSaveData,
  instanceIds: string[],
  nowMs = Date.now(),
): { xpDonated: number; itemsConsumed: number; newClubLevel: number } {
  const club = save.social.club;
  if (!club) return { xpDonated: 0, itemsConsumed: 0, newClubLevel: 1 };

  // Seasonal reset check
  const curSeason = getCurrentSeasonId(nowMs);
  if (club.seasonId !== curSeason) {
    club.seasonId = curSeason;
    club.totalXp = 0;
    club.level = 1;
    club.claimedLevels = [];
    for (const m of club.members) m.seasonXp = 0;
  }

  const equippedIds = new Set(Object.values(save.equipped).filter(Boolean));
  const idSet = new Set(instanceIds.filter((id) => !equippedIds.has(id)));

  let xpDonated = 0;
  let itemsConsumed = 0;
  save.inventory = save.inventory.filter((inst) => {
    if (!idSet.has(inst.instanceId)) return true;
    xpDonated += getGearSalvageXp(inst);
    itemsConsumed++;
    return false;
  });

  if (xpDonated <= 0) return { xpDonated: 0, itemsConsumed: 0, newClubLevel: club.level };

  club.totalXp += xpDonated;
  club.level = computeClubLevelFromXp(club.totalXp);

  const selfMember = club.members.find((m) => m.playerId === save.social.playerId);
  if (selfMember) {
    selfMember.seasonXp += xpDonated;
    selfMember.cityNumber = save.cityNumber;
    selfMember.lastActiveMs = nowMs;
  }

  save.stats.clubItemsSalvaged += itemsConsumed;
  save.stats.itemsSalvaged += itemsConsumed;

  return { xpDonated, itemsConsumed, newClubLevel: club.level };
}

export function claimClubLevelReward(save: GameSaveData, level: number): string | null {
  const club = save.social.club;
  if (!club || club.level < level || club.claimedLevels.includes(level)) return null;
  const reward = CLUB_SEASON_REWARDS.find((r) => r.level === level);
  if (!reward) return null;

  club.claimedLevels.push(level);
  if (reward.gems) save.gems += reward.gems;
  if (reward.petFood) save.petFood += reward.petFood;
  if (reward.smallBoxes) save.boxes.small = (save.boxes.small ?? 0) + reward.smallBoxes;
  if (reward.bigBoxes) save.boxes.big = (save.boxes.big ?? 0) + reward.bigBoxes;
  if (reward.clubBoxes) save.boxes.club = (save.boxes.club ?? 0) + reward.clubBoxes;
  if (reward.epicEggs) addEggToSave(save, 'epic', reward.epicEggs);

  return reward.label;
}
