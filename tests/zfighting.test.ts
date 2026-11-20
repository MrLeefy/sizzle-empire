import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GeometryPool, MaterialPool, buildEnvironmentRig } from '@/renderer/meshFactory';
import { RESTAURANT_LIST } from '@/data/restaurants';
import { buildRestaurantLayout } from '@/engine/sim/layoutBuilder';

/**
 * Two opaque surfaces whose tops sit at the same height and overlap in X/Z z-fight: the GPU
 * alternates between them as the camera pans, which shows up as a flickering floor.
 */
describe('Environment — no coplanar z-fighting ground surfaces', () => {
  it('keeps every overlapping floor / curb / sidewalk / plaza top at a distinct height in all venues', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const offenders: string[] = [];
    for (const tpl of RESTAURANT_LIST) {
      const layout = buildRestaurantLayout(tpl);
      const env = buildEnvironmentRig(tpl, layout, '#c7d9b7', mats, geos, undefined, '#7ec8e3');
      env.root.updateMatrixWorld(true);
      const boxes: THREE.Box3[] = [];
      env.root.traverseVisible((o) => {
        if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
        if ((o.material as THREE.Material).transparent) return;
        const b = new THREE.Box3().setFromObject(o);
        if (b.max.y < 0.6) boxes.push(b); // ground-level surfaces & low props
      });
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (Math.abs(a.max.y - b.max.y) > 0.003) continue;
          const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
          const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
          if (ox > 0.05 && oz > 0.05 && ox * oz > 0.05) {
            offenders.push(`${tpl.id}: two surfaces share top y=${a.max.y.toFixed(3)}`);
          }
        }
      }
    }
    expect(offenders.slice(0, 10)).toEqual([]);
    geos.dispose();
    mats.dispose();
  });
});
