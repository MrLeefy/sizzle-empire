import type { GameController } from '@/engine/GameController';
import type { ProjectedOverlayFrame } from '@/renderer/SceneRenderer';
import { d, formatMoney } from '@/engine/economy/bigNumber';
import {
  getStationMaxLevel,
  resolveStationPurchasePlan,
} from '@/engine/economy/economy';

/**
 * Zero-React-overhead imperative DOM overlay painter for 3D-projected HUD elements.
 * Keeps frame pacing locked at 60 FPS on mobile devices by mutating pooled DOM nodes
 * via CSS translate3d transforms instead of triggering React re-renders per frame.
 */
export class WorldOverlayPainter {
  private layer: HTMLElement;
  private controller: GameController;
  private onSelectStation: (stationIndex: number) => void;
  private onTapTip: (tipId: string) => void;
  private selectedStationIndex: number | null = null;

  private stationNodes = new Map<number, HTMLButtonElement>();
  private orderNodes = new Map<string, HTMLDivElement>();
  private tipNodes = new Map<string, HTMLButtonElement>();
  private floatNodes = new Map<number, HTMLDivElement>();

  constructor(params: {
    layer: HTMLElement;
    controller: GameController;
    onSelectStation: (idx: number) => void;
    onTapTip: (tipId: string) => void;
  }) {
    this.layer = params.layer;
    this.controller = params.controller;
    this.onSelectStation = params.onSelectStation;
    this.onTapTip = params.onTapTip;
  }

  setSelectedStation(idx: number | null): void {
    this.selectedStationIndex = idx;
  }

  paint(frame: ProjectedOverlayFrame): void {
    const runtime = this.controller.getActiveRuntime();
    const template = this.controller.getActiveTemplate();
    const maxLv = getStationMaxLevel(template, runtime);
    const notation = this.controller.save.settings.notation;
    const cityNum = this.controller.getActiveCityNumber();
    const cash = d(runtime.cash);

    // 1. Station badges
    const seenStations = new Set<number>();
    for (const s of frame.stations) {
      const stn = runtime.stations[s.stationIndex];
      const stnTpl = template.stations[s.stationIndex];
      if (!stn || !stnTpl) continue;
      seenStations.add(s.stationIndex);

      let btn = this.stationNodes.get(s.stationIndex);
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'station-badge';
        const idx = s.stationIndex;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onSelectStation(idx);
        });
        this.layer.appendChild(btn);
        this.stationNodes.set(s.stationIndex, btn);
      }

      if (!s.visible) {
        btn.style.display = 'none';
        continue;
      }
      btn.style.display = 'flex';
      btn.style.left = `${s.x.toFixed(1)}px`;
      btn.style.top = `${s.y.toFixed(1)}px`;

      const plan = resolveStationPurchasePlan(
        stnTpl,
        stn,
        maxLv,
        cash,
        this.controller.save.settings.buyMode,
        cityNum,
        runtime.difficultyMultiplier,
      );
      const isMax = stn.unlocked && stn.level >= maxLv;

      let cls = 'station-badge';
      if (!stn.unlocked) cls += ' locked';
      if (isMax) cls += ' maxed';
      else if (plan.canAfford) cls += ' can-buy';
      if (this.selectedStationIndex === s.stationIndex) cls += ' selected';
      if (btn.className !== cls) btn.className = cls;

      const label = !stn.unlocked
        ? `🔒 ${stnTpl.icon} ${formatMoney(plan.totalCost, notation)}`
        : isMax
          ? `${stnTpl.icon} ★MAX`
          : `${stnTpl.icon} Lv${stn.level}${plan.canAfford ? ' ▲' : ''}`;

      if (btn.textContent !== label) btn.textContent = label;
    }
    for (const [idx, node] of this.stationNodes.entries()) {
      if (!seenStations.has(idx)) {
        node.remove();
        this.stationNodes.delete(idx);
      }
    }

    // 2. Customer order bubbles
    const seenOrders = new Set<string>();
    for (const o of frame.orders) {
      seenOrders.add(o.customerId);
      let el = this.orderNodes.get(o.customerId);
      if (!el) {
        el = document.createElement('div');
        el.className = 'order-bubble';
        this.layer.appendChild(el);
        this.orderNodes.set(o.customerId, el);
      }
      el.style.left = `${o.x.toFixed(1)}px`;
      el.style.top = `${o.y.toFixed(1)}px`;

      let cls = 'order-bubble';
      if (o.isGolden) cls += ' golden';
      if (o.isGreedy) cls += ' greedy';
      if (el.className !== cls) el.className = cls;

      const text =
        o.orderingProgress !== null
          ? `📝 ${Math.round(o.orderingProgress * 100)}%`
          : o.remaining > 0
            ? `${o.isGolden ? '👑' : ''}${o.icon}×${o.remaining}`
            : '💬';
      if (el.textContent !== text) el.textContent = text;
    }
    for (const [id, node] of this.orderNodes.entries()) {
      if (!seenOrders.has(id)) {
        node.remove();
        this.orderNodes.delete(id);
      }
    }

    // 3. Tappable world Tip coins
    const seenTips = new Set<string>();
    for (const t of frame.tips) {
      seenTips.add(t.tipId);
      let btn = this.tipNodes.get(t.tipId);
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'tip-pill-world';
        const tipId = t.tipId;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onTapTip(tipId);
        });
        this.layer.appendChild(btn);
        this.tipNodes.set(t.tipId, btn);
      }
      btn.style.left = `${t.x.toFixed(1)}px`;
      btn.style.top = `${t.y.toFixed(1)}px`;
      const txt = `🪙 ${formatMoney(t.amount, notation)}`;
      if (btn.textContent !== txt) btn.textContent = txt;
    }
    for (const [id, node] of this.tipNodes.entries()) {
      if (!seenTips.has(id)) {
        node.remove();
        this.tipNodes.delete(id);
      }
    }

    // 4. Floating earnings & Perfect/Divine callouts
    const seenFloat = new Set<number>();
    for (const f of frame.floating) {
      seenFloat.add(f.id);
      let el = this.floatNodes.get(f.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `float-label ${f.kind}`;
        el.innerHTML = f.subtext
          ? `${f.text}<span class="float-sub">${f.subtext}</span>`
          : f.text;
        this.layer.appendChild(el);
        this.floatNodes.set(f.id, el);
      }
      el.style.left = `${f.x.toFixed(1)}px`;
      el.style.top = `${f.y.toFixed(1)}px`;
      el.style.opacity = f.opacity.toFixed(2);
    }
    for (const [id, node] of this.floatNodes.entries()) {
      if (!seenFloat.has(id)) {
        node.remove();
        this.floatNodes.delete(id);
      }
    }
  }

  dispose(): void {
    this.layer.innerHTML = '';
    this.stationNodes.clear();
    this.orderNodes.clear();
    this.tipNodes.clear();
    this.floatNodes.clear();
  }
}
