import type { GameSaveData } from '@/types/game';
import { BALANCE } from '@/engine/economy/balanceConfig';
import { VAULT_BY_ID, getVaultUpgradeCost } from '@/data/vault';

export function getNextVaultUnlockCost(save: GameSaveData): number {
  const unlockedCount = save.vault.unlockedIds.length;
  return BALANCE.VAULT_UNLOCK_GEMS[Math.min(unlockedCount, BALANCE.VAULT_UNLOCK_GEMS.length - 1)];
}

export function unlockVaultArtifact(save: GameSaveData, artifactId: string): boolean {
  const tpl = VAULT_BY_ID[artifactId];
  if (!tpl) return false;
  if (save.vault.unlockedIds.includes(artifactId)) return false;

  const cost = getNextVaultUnlockCost(save);
  if (save.gems < cost) return false;

  save.gems -= cost;
  save.stats.gemsSpent += cost;
  save.vault.unlockedIds.push(artifactId);
  save.vault.levels[artifactId] = 1;
  save.stats.vaultUpgradesBought += 1;
  return true;
}

export function upgradeVaultArtifact(save: GameSaveData, artifactId: string): boolean {
  const tpl = VAULT_BY_ID[artifactId];
  if (!tpl) return false;
  if (!save.vault.unlockedIds.includes(artifactId)) return false;

  const currentLv = save.vault.levels[artifactId] ?? 1;
  if (currentLv >= tpl.maxLevel) return false;

  const cost = getVaultUpgradeCost(tpl, currentLv);
  if (save.gems < cost) return false;

  save.gems -= cost;
  save.stats.gemsSpent += cost;
  save.vault.levels[artifactId] = currentLv + 1;
  save.stats.vaultUpgradesBought += 1;
  return true;
}
