import { describe, expect, it } from 'vitest';
import { createNewGameSave } from '@/engine/persistence/saveSchema';
import { SeededRNG } from '@/engine/rng';
import {
  checkBlueprintForgeable,
  createGearInstance,
  equipGearItem,
  forgeBlueprint,
  salvageGearIntoTarget,
} from '@/engine/meta/equipment';
import { buyBoxWithGems, openBoxes } from '@/engine/meta/lootBoxes';
import {
  createPetInstance,
  equipPet,
  feedEggToHatch,
  feedPetLevel,
  mergeEggs,
  mergePets,
} from '@/engine/meta/pets';
import { unlockVaultArtifact, upgradeVaultArtifact } from '@/engine/meta/vault';
import { claimAchievementTier, claimChefRankReward } from '@/engine/meta/achievements';
import { createClubLocal, salvageGearToClub, claimClubLevelReward } from '@/engine/social/clubService';

describe('Phase 5, 6 & 8: Equipment, Forge, Boxes, Pets, Vault, Achievements & Clubs', () => {
  it('supports gear equipping, XP leveling via salvage, and Mythic/Legendary Forge crafting', () => {
    const save = createNewGameSave(11);
    const bp = createGearInstance('l_head_plumcap', true);
    save.inventory.push(
      bp,
      createGearInstance('e_head_hood', false),
      createGearInstance('e_head_hood', false),
      createGearInstance('r_head_beret', false),
      createGearInstance('r_head_beret', false),
      createGearInstance('r_head_beret', false),
    );

    const check = checkBlueprintForgeable(save, bp.instanceId);
    expect(check.canForge).toBe(true);

    const forged = forgeBlueprint(save, bp.instanceId);
    expect(forged).not.toBeNull();
    expect(forged?.isBlueprint).toBe(false);
    expect(save.stats.itemsForged).toBe(1);

    expect(equipGearItem(save, bp.instanceId)).toBe(true);
    expect(save.equipped.head).toBe(bp.instanceId);

    // Salvage 10 spare commons into forged legendary
    const fodderIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const f = createGearInstance('c_head_cap', false);
      save.inventory.push(f);
      fodderIds.push(f.instanceId);
    }
    const res = salvageGearIntoTarget(save, bp.instanceId, fodderIds);
    expect(res.itemsConsumed).toBe(10);
    expect(res.levelsGained).toBeGreaterThanOrEqual(1);
    expect(forged!.level).toBeGreaterThan(1);
  });

  it('buys and bulk-opens loot boxes cleanly with documented drop tables', () => {
    const save = createNewGameSave(22);
    save.gems = 1000;
    const rng = new SeededRNG(22);

    expect(buyBoxWithGems(save, 'big', 2)).toBe(true);
    expect(save.gems).toBe(600);
    const rewards = openBoxes(save, 'big', 2, rng);
    expect(rewards.length).toBe(12); // 6 rolls * 2 boxes
    expect(save.stats.boxesOpened).toBe(2);

    expect(buyBoxWithGems(save, 'pet', 1)).toBe(true);
    const petRewards = openBoxes(save, 'pet', 1, rng);
    // 1 guaranteed 150 pet food + 3 eggs
    expect(petRewards.length).toBe(4);
  });

  it('hatches eggs, levels pets, merges 3 pets -> next rarity, and merges 5 eggs -> next rarity', () => {
    const save = createNewGameSave(33);
    const rng = new SeededRNG(33);
    save.petFood = 500;

    // Hatch starter common egg (100 food)
    const h = feedEggToHatch(save, 'common', 100, rng);
    expect(h.hatchedPet).not.toBeNull();
    expect(save.pets.length).toBe(1);

    // Feed pet to level up
    const lvRes = feedPetLevel(save, h.hatchedPet!.instanceId, 100);
    expect(lvRes.levelsGained).toBeGreaterThanOrEqual(1);

    // Merge 3 rare pets -> 1 epic
    const p1 = createPetInstance('pet_corgi', 'rare');
    const p2 = createPetInstance('pet_tabby', 'rare');
    const p3 = createPetInstance('pet_corgi', 'rare');
    save.pets.push(p1, p2, p3);
    expect(equipPet(save, p1.instanceId, 0)).toBe(true);
    expect(mergePets(save, p1.instanceId, [p2.instanceId, p3.instanceId])).toBe(true);
    expect(p1.rarity).toBe('epic');

    // Merge 5 common eggs -> 1 rare egg
    save.eggs = [{ rarity: 'common', count: 5, hatchingProgress: 0 }];
    expect(mergeEggs(save, 'common')).toBe(true);
    expect(save.eggs.find((e) => e.rarity === 'rare')?.count).toBe(1);
  });

  it('unlocks and upgrades Vault artifacts with progressive fees and claims Achievements + Chef Ranks', () => {
    const save = createNewGameSave(44);
    save.gems = 500;
    // 1st unlock is free (0 gems)
    expect(unlockVaultArtifact(save, 'tip_jar')).toBe(true);
    expect(save.gems).toBe(500);
    // 2nd unlock costs 30 gems
    expect(unlockVaultArtifact(save, 'boost_amp')).toBe(true);
    expect(save.gems).toBe(470);
    expect(upgradeVaultArtifact(save, 'tip_jar')).toBe(true);
    expect(save.vault.levels['tip_jar']).toBe(2);

    // Achievements + Rank 1 claim
    save.stats.ordersPrepared = 30;
    const claimed = claimAchievementTier(save, 'ach_orders');
    expect(claimed?.gems).toBe(5);
    const rank1 = claimChefRankReward(save, 1);
    expect(rank1?.rank).toBe(1);
  });

  it('supports Club creation, item salvage XP, seasonal leveling, and reward claims', () => {
    const save = createNewGameSave(55);
    save.cityNumber = 7;
    save.gems = 1500;

    const created = createClubLocal(save, 'Flame Collective', 'FLAM', true);
    expect(created.ok).toBe(true);
    expect(save.gems).toBe(500);

    // Donate spare Ultimate items to trigger club levels
    const donations: string[] = [];
    for (let i = 0; i < 4; i++) {
      const u = createGearInstance('u_head_astro', false);
      save.inventory.push(u);
      donations.push(u.instanceId);
    }
    const res = salvageGearToClub(save, donations);
    expect(res.xpDonated).toBeGreaterThanOrEqual(500);
    expect(res.newClubLevel).toBeGreaterThanOrEqual(3);

    const lbl = claimClubLevelReward(save, 2);
    expect(lbl).toContain('Small Box');
  });
});
