import type { RestaurantLayout, Vec2 } from '@/types/game';

interface PathNode {
  gx: number;
  gz: number;
  g: number;
  f: number;
  parent: PathNode | null;
}

/**
 * Lightweight, cached 2D grid A* pathfinder tailored for restaurant floorplans.
 * Caches paths by quantized start->end cell key to keep frame allocations near zero.
 */
export class RestaurantPathfinder {
  private cache = new Map<string, Vec2[]>();
  private maxCacheSize = 256;

  clearCache(): void {
    this.cache.clear();
  }

  private toGrid(pos: Vec2, layout: RestaurantLayout): { gx: number; gz: number } {
    const halfW = layout.width / 2;
    const halfD = layout.depth / 2;
    const gx = Math.max(
      0,
      Math.min(
        Math.floor(layout.width / layout.cellSize) - 1,
        Math.floor((pos.x + halfW) / layout.cellSize),
      ),
    );
    const gz = Math.max(
      0,
      Math.min(
        Math.floor(layout.depth / layout.cellSize) - 1,
        Math.floor((pos.z + halfD) / layout.cellSize),
      ),
    );
    return { gx, gz };
  }

  private toWorld(gx: number, gz: number, layout: RestaurantLayout): Vec2 {
    const halfW = layout.width / 2;
    const halfD = layout.depth / 2;
    return {
      x: -halfW + (gx + 0.5) * layout.cellSize,
      z: -halfD + (gz + 0.5) * layout.cellSize,
    };
  }

  findPath(from: Vec2, to: Vec2, layout: RestaurantLayout): Vec2[] {
    const s = this.toGrid(from, layout);
    const e = this.toGrid(to, layout);

    if (s.gx === e.gx && s.gz === e.gz) {
      return [{ x: to.x, z: to.z }];
    }

    const cacheKey = `${s.gx},${s.gz}->${e.gx},${e.gz}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // Return shallow copy with exact target tail
      const out = cached.slice();
      out[out.length - 1] = { x: to.x, z: to.z };
      return out;
    }

    const maxX = Math.floor(layout.width / layout.cellSize);
    const maxZ = Math.floor(layout.depth / layout.cellSize);

    const open: PathNode[] = [
      {
        gx: s.gx,
        gz: s.gz,
        g: 0,
        f: Math.abs(e.gx - s.gx) + Math.abs(e.gz - s.gz),
        parent: null,
      },
    ];
    const closed = new Set<string>();
    const bestG = new Map<string, number>();
    bestG.set(`${s.gx},${s.gz}`, 0);

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [-1, 1, 1.414],
      [1, -1, 1.414],
      [-1, -1, 1.414],
    ];

    let iterations = 0;
    let found: PathNode | null = null;

    while (open.length > 0 && iterations < 240) {
      iterations++;
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const cur = open.splice(bestIdx, 1)[0];
      const curKey = `${cur.gx},${cur.gz}`;
      if (cur.gx === e.gx && cur.gz === e.gz) {
        found = cur;
        break;
      }
      if (closed.has(curKey)) continue;
      closed.add(curKey);

      for (const [dx, dz, cost] of dirs) {
        const nx = cur.gx + dx;
        const nz = cur.gz + dz;
        if (nx < 0 || nz < 0 || nx >= maxX || nz >= maxZ) continue;
        const nKey = `${nx},${nz}`;
        if (closed.has(nKey)) continue;

        // Allow stepping onto start or end cell even if adjacent to furniture
        const isEndpoint = nx === e.gx && nz === e.gz;
        if (!isEndpoint && layout.blockedCells.has(nKey)) continue;

        const ng = cur.g + cost;
        const prevG = bestG.get(nKey);
        if (prevG !== undefined && ng >= prevG) continue;
        bestG.set(nKey, ng);
        const h = Math.hypot(e.gx - nx, e.gz - nz);
        open.push({ gx: nx, gz: nz, g: ng, f: ng + h, parent: cur });
      }
    }

    if (!found) {
      // Safe fallback: direct path guarantees zero permanent deadlocks
      return [{ x: to.x, z: to.z }];
    }

    const waypoints: Vec2[] = [];
    let node: PathNode | null = found;
    while (node && node.parent) {
      waypoints.push(this.toWorld(node.gx, node.gz, layout));
      node = node.parent;
    }
    waypoints.reverse();
    if (waypoints.length === 0) {
      waypoints.push({ x: to.x, z: to.z });
    } else {
      waypoints[waypoints.length - 1] = { x: to.x, z: to.z };
    }

    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, waypoints.slice());
    return waypoints;
  }
}

/**
 * Simple deterministic entity separation vector so workers never stack on exact same pixel.
 */
export function computeSeparationOffset(
  selfId: string,
  pos: Vec2,
  others: ReadonlyArray<{ id: string; pos: Vec2 }>,
  radius = 0.55,
): Vec2 {
  let sx = 0;
  let sz = 0;
  for (const o of others) {
    if (o.id === selfId) continue;
    const dx = pos.x - o.pos.x;
    const dz = pos.z - o.pos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > 0.0001 && distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      const push = (radius - dist) / radius;
      sx += (dx / dist) * push * 0.45;
      sz += (dz / dist) * push * 0.45;
    }
  }
  return { x: sx, z: sz };
}
