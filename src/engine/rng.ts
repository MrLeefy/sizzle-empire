/**
 * Deterministic serializable Mulberry32 PRNG so gameplay rolls, loot boxes,
 * and headless economy simulations are 100% reproducible and saveable.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number = 0x51a2e7d3) {
    this.state = seed >>> 0 || 0x12345678;
  }

  getState(): number {
    return this.state >>> 0;
  }

  setState(state: number): void {
    this.state = state >>> 0 || 0x12345678;
  }

  /** Returns float in [0, 1) */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns integer in [min, max] inclusive */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Returns true with probability p in [0, 1] */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}
