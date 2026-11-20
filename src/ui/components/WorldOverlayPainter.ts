import type { GameController } from '@/engine/GameController';
import type { ProjectedOverlayFrame } from '@/renderer/overlayTypes';
import type { BuyMode, NumberNotation } from '@/types/game';
import { Decimal, d, formatMoney } from '@/engine/economy/bigNumber';
import {
  getStationMaxLevel,
  resolveStationPurchasePlan,
} from '@/engine/economy/economy';

const MAX_COOK_PIE_POOL = 24;
const MAX_ORDER_POOL = 32;
const MAX_FLOAT_POOL = 28;

const VALID_COOK_QUALITIES = new Set(['normal', 'perfect', 'divine']);
const VALID_FLOAT_KINDS = new Set([
  'cash',
  'perfect',
  'divine',
  'golden',
  'tip',
  'gem',
  'milestone',
]);

interface AnchorTrackable {
  anchor: HTMLElement;
  lastX: number;
  lastY: number;
  lastVisible: boolean;
}

interface StationPlanCacheEntry {
  templateId: string;
  stationTemplateId: string;
  cityNum: number;
  difficultyMultiplier: number;
  maxLv: number;
  buyMode: BuyMode;
  bulkStep: 50 | 100;
  notation: NumberNotation;
  cashStr: string;
  unlocked: boolean;
  level: number;
  // Memoized outputs:
  isUnlock: boolean;
  levelsToBuy: number;
  canAfford: boolean;
  formattedCost: string;
}

interface StationBadgeNode extends AnchorTrackable {
  stationIndex: number;
  scaleWrap: HTMLDivElement;
  popularRibbon: HTMLDivElement;
  btn: HTMLButtonElement;
  lockIcon: HTMLSpanElement;
  giftIcon: HTMLSpanElement;
  dishIcon: HTMLSpanElement;
  textEl: HTMLSpanElement;
  arrowEl: HTMLSpanElement;
  maxStarEl: HTMLSpanElement;
  baseBtnClass: string;
  lastDishIcon: string;
  lastText: string;
  lastShowLock: boolean;
  lastShowGift: boolean;
  lastShowArrow: boolean;
  lastShowMax: boolean;
  lastIsPopular: boolean;
  lastScaleQ: number;
  localPulseUntilMs: number;
}

interface CookPieNode extends AnchorTrackable {
  pieEl: HTMLDivElement;
  lastQuality: string;
  lastDeg: number;
}

type ResolvedOrderStatus = 'waiting_to_order' | 'ordering' | 'waiting_for_food';

interface OrderBubbleNode extends AnchorTrackable {
  scaleWrap: HTMLDivElement;
  bubbleEl: HTMLDivElement;
  crownEl: HTMLSpanElement;
  ringEl: HTMLSpanElement;
  dotsEl: HTMLSpanElement;
  iconEl: HTMLSpanElement;
  qtyEl: HTMLSpanElement;
  lastClass: string;
  lastShowCrown: boolean;
  lastShowRing: boolean;
  lastShowDots: boolean;
  lastShowIcon: boolean;
  lastShowQty: boolean;
  lastIconText: string;
  lastQtyText: string;
  lastRingDeg: number;
  lastScaleQ: number;
  prevRemaining: number | null;
  prevStatus: ResolvedOrderStatus | null;
  localPulseUntilMs: number;
}

interface TipPillNode extends AnchorTrackable {
  btn: HTMLButtonElement;
  amountEl: HTMLSpanElement;
  lastRawAmount: string;
  lastNotation: NumberNotation | null;
}

interface FloatCalloutNode extends AnchorTrackable {
  scaleWrap: HTMLDivElement;
  labelEl: HTMLDivElement;
  mainEl: HTMLSpanElement;
  subEl: HTMLSpanElement;
  lastKind: string;
  lastText: string;
  lastSubtext: string;
  lastScaleQ: number;
  lastOpacityQ: number;
}

function updateAnchorPosition(node: AnchorTrackable, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const qx = Math.round(x * 10);
  const qy = Math.round(y * 10);
  if (qx !== node.lastX || qy !== node.lastY) {
    node.lastX = qx;
    node.lastY = qy;
    node.anchor.style.transform = `translate3d(${(qx / 10).toFixed(1)}px, ${(qy / 10).toFixed(1)}px, 0)`;
  }
  return true;
}

function setAnchorVisible(node: AnchorTrackable, visible: boolean): void {
  if (node.lastVisible !== visible) {
    node.lastVisible = visible;
    node.anchor.style.display = visible ? '' : 'none';
  }
}

/**
 * Zero-React-overhead imperative DOM overlay painter for 3D-projected HUD elements.
 * - Strictly GPU-composited via CSS translate3d on outer .wo-anchor nodes (zero layout-thrashing offsets).
 * - 100% XSS-safe DOM node creation & textContent updates (zero raw HTML string injection).
 * - Zero-allocation memoization of resolveStationPurchasePlan & formatMoney.
 * - Free-list pooled radial cooking pies, order speech balloons, and floating callouts.
 */
export class WorldOverlayPainter {
  private layer: HTMLElement;
  private controller: GameController;
  private onSelectStation: (stationIndex: number) => void;
  private onTapTip: (tipId: string) => void;
  private selectedStationIndex: number | null = null;
  private disposed = false;

  private stationNodes = new Map<number, StationBadgeNode>();
  private stationPlanCache = new Map<number, StationPlanCacheEntry>();
  private cookPieNodes = new Map<string, CookPieNode>();
  private cookPiePool: CookPieNode[] = [];
  private orderNodes = new Map<string, OrderBubbleNode>();
  private orderPool: OrderBubbleNode[] = [];
  private tipNodes = new Map<string, TipPillNode>();
  private floatNodes = new Map<number, FloatCalloutNode>();
  private floatPool: FloatCalloutNode[] = [];

  // Reusable per-frame visibility sets (zero per-frame allocations)
  private seenStations = new Set<number>();
  private seenCookPies = new Set<string>();
  private seenOrders = new Set<string>();
  private seenTips = new Set<string>();
  private seenFloat = new Set<number>();

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
    if (this.disposed) return;
    this.selectedStationIndex = idx;
    // Immediately reflect selection ring for 0ms click responsiveness
    for (const [stnIdx, node] of this.stationNodes.entries()) {
      const fullClass =
        stnIdx === this.selectedStationIndex
          ? `${node.baseBtnClass} selected`
          : node.baseBtnClass;
      if (node.btn.className !== fullClass) {
        node.btn.className = fullClass;
      }
    }
  }

  paint(frame: ProjectedOverlayFrame): void {
    if (this.disposed) return;

    const runtime = this.controller.getActiveRuntime();
    const template = this.controller.getActiveTemplate();
    const maxLv = getStationMaxLevel(template, runtime);
    const settings = this.controller.save.settings;
    const notation = settings.notation;
    const bulkStep = settings.bulkStep;
    const buyMode: BuyMode =
      settings.buyMode === '50' || settings.buyMode === '100'
        ? (String(bulkStep) as BuyMode)
        : settings.buyMode;
    const cityNum = this.controller.getActiveCityNumber();
    const difficultyMultiplier = Number.isFinite(runtime.difficultyMultiplier)
      ? runtime.difficultyMultiplier
      : 1;
    const cashStr = runtime.cash;
    const nowMs = performance.now();

    let parsedCash: Decimal | null = null;

    this.seenStations.clear();
    this.seenCookPies.clear();
    this.seenOrders.clear();
    this.seenTips.clear();
    this.seenFloat.clear();

    // -----------------------------------------------------------------------
    // Layer 1 (Station Badges) & Layer 2 (Radial Cooking Pies)
    // -----------------------------------------------------------------------
    const isDense = frame.stations.length >= 8;
    for (const s of frame.stations) {
      const stn = runtime.stations[s.stationIndex];
      const stnTpl = template.stations[s.stationIndex];
      if (!stn || !stnTpl) continue;

      this.seenStations.add(s.stationIndex);
      let node = this.stationNodes.get(s.stationIndex);
      if (!node) {
        node = this.createStationBadgeNode(s.stationIndex);
        this.layer.appendChild(node.anchor);
        this.stationNodes.set(s.stationIndex, node);
      }

      // Evaluate 11-field memoized purchase plan (zero alloc on cache hit)
      const prevCached = this.stationPlanCache.get(s.stationIndex);
      const isSameStationContext =
        prevCached !== undefined &&
        prevCached.templateId === template.id &&
        prevCached.stationTemplateId === stnTpl.id &&
        prevCached.cityNum === cityNum;

      let cached: StationPlanCacheEntry;
      if (
        prevCached !== undefined &&
        isSameStationContext &&
        prevCached.difficultyMultiplier === difficultyMultiplier &&
        prevCached.maxLv === maxLv &&
        prevCached.buyMode === buyMode &&
        prevCached.bulkStep === bulkStep &&
        prevCached.notation === notation &&
        prevCached.cashStr === cashStr &&
        prevCached.unlocked === stn.unlocked &&
        prevCached.level === stn.level
      ) {
        cached = prevCached;
      } else {
        // Trigger local upgrade pop pulse fallback when level/unlock increased on same station
        if (
          isSameStationContext &&
          prevCached !== undefined &&
          (stn.level > prevCached.level || (stn.unlocked && !prevCached.unlocked))
        ) {
          node.localPulseUntilMs = nowMs + 260;
        }

        if (parsedCash === null) {
          parsedCash = d(cashStr);
        }
        const plan = resolveStationPurchasePlan(
          stnTpl,
          stn,
          maxLv,
          parsedCash,
          buyMode,
          cityNum,
          difficultyMultiplier,
        );
        const formattedCost = formatMoney(plan.totalCost, notation);

        if (prevCached !== undefined) {
          prevCached.templateId = template.id;
          prevCached.stationTemplateId = stnTpl.id;
          prevCached.cityNum = cityNum;
          prevCached.difficultyMultiplier = difficultyMultiplier;
          prevCached.maxLv = maxLv;
          prevCached.buyMode = buyMode;
          prevCached.bulkStep = bulkStep;
          prevCached.notation = notation;
          prevCached.cashStr = cashStr;
          prevCached.unlocked = stn.unlocked;
          prevCached.level = stn.level;
          prevCached.isUnlock = plan.isUnlock;
          prevCached.levelsToBuy = plan.levelsToBuy;
          prevCached.canAfford = plan.canAfford;
          prevCached.formattedCost = formattedCost;
          cached = prevCached;
        } else {
          cached = {
            templateId: template.id,
            stationTemplateId: stnTpl.id,
            cityNum,
            difficultyMultiplier,
            maxLv,
            buyMode,
            bulkStep,
            notation,
            cashStr,
            unlocked: stn.unlocked,
            level: stn.level,
            isUnlock: plan.isUnlock,
            levelsToBuy: plan.levelsToBuy,
            canAfford: plan.canAfford,
            formattedCost,
          };
          this.stationPlanCache.set(s.stationIndex, cached);
        }
      }

      if (!s.visible || !updateAnchorPosition(node, s.x, s.y)) {
        setAnchorVisible(node, false);
      } else {
        setAnchorVisible(node, true);

        const isMax = stn.unlocked && stn.level >= maxLv;
        const isPopular =
          s.isPopular ??
          (runtime.popularDishStationIndex === s.stationIndex &&
            runtime.simTime < runtime.popularDishEndsAt);

        let baseCls = 'station-badge';
        if (!stn.unlocked) {
          baseCls += ' locked';
          if (cached.canAfford) baseCls += ' unlock-ready can-buy';
        } else if (isMax) {
          baseCls += ' maxed';
        } else if (cached.canAfford) {
          baseCls += ' can-buy';
        }
        if (isPopular) baseCls += ' popular';
        if (isDense) baseCls += ' dense';

        node.baseBtnClass = baseCls;
        const fullCls =
          this.selectedStationIndex === s.stationIndex ? `${baseCls} selected` : baseCls;
        if (node.btn.className !== fullCls) node.btn.className = fullCls;

        if (node.lastIsPopular !== isPopular) {
          node.lastIsPopular = isPopular;
          node.popularRibbon.hidden = !isPopular;
        }

        // Warm amber locked badge + 3D gift-wrapped crate already indicate locked state;
        // omitting the extra lock glyph keeps dense 5-column event prices crisp and readable.
        const showLock = false;
        const showGift = !stn.unlocked && cached.canAfford;
        const showArrow = stn.unlocked && !isMax && cached.canAfford;
        const showMax = isMax;

        if (node.lastShowLock !== showLock) {
          node.lastShowLock = showLock;
          node.lockIcon.hidden = !showLock;
        }
        if (node.lastShowGift !== showGift) {
          node.lastShowGift = showGift;
          node.giftIcon.hidden = !showGift;
        }
        if (node.lastShowArrow !== showArrow) {
          node.lastShowArrow = showArrow;
          node.arrowEl.hidden = !showArrow;
        }
        if (node.lastShowMax !== showMax) {
          node.lastShowMax = showMax;
          node.maxStarEl.hidden = !showMax;
        }

        if (node.lastDishIcon !== stnTpl.icon) {
          node.lastDishIcon = stnTpl.icon;
          node.dishIcon.textContent = stnTpl.icon;
        }

        const text = !stn.unlocked
          ? cached.formattedCost
          : isMax
            ? 'MAX'
            : `Lv${stn.level}`;
        if (node.lastText !== text) {
          node.lastText = text;
          node.textEl.textContent = text;
        }

        // Upgrade spring pop pulse (M2 justUpgradedPulse or local fallback)
        const pulse =
          typeof s.justUpgradedPulse === 'number' && Number.isFinite(s.justUpgradedPulse)
            ? Math.min(1, Math.max(0, s.justUpgradedPulse))
            : node.localPulseUntilMs > nowMs
              ? Math.max(0, (node.localPulseUntilMs - nowMs) / 260)
              : 0;
        const scale = pulse > 0.005 ? 1 + pulse * 0.22 : 1;
        const scaleQ = Math.round(scale * 1000);
        if (scaleQ !== node.lastScaleQ) {
          node.lastScaleQ = scaleQ;
          node.scaleWrap.style.transform =
            scaleQ === 1000
              ? 'translate(-50%, -100%)'
              : `translate(-50%, -100%) scale(${(scaleQ / 1000).toFixed(3)})`;
        }
      }

      // Layer 2: Radial Cooking Pies (CSS conic-gradient, zero SVG URLs)
      const slots = s.cookingSlots;
      if (slots && slots.length > 0) {
        for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
          const slot = slots[slotIdx];
          if (!slot) continue;
          const key = `${s.stationIndex}:${slotIdx}`;
          this.seenCookPies.add(key);

          let pieNode = this.cookPieNodes.get(key);
          if (!pieNode) {
            pieNode = this.acquireCookPieNode();
            this.cookPieNodes.set(key, pieNode);
          }

          if (!updateAnchorPosition(pieNode, slot.x, slot.y)) {
            setAnchorVisible(pieNode, false);
            continue;
          }
          setAnchorVisible(pieNode, true);

          const safeQuality = VALID_COOK_QUALITIES.has(slot.quality) ? slot.quality : 'normal';
          if (pieNode.lastQuality !== safeQuality) {
            pieNode.lastQuality = safeQuality;
            pieNode.pieEl.className = `cook-pie ${safeQuality}`;
          }

          const rawProg = Number.isFinite(slot.progress) ? slot.progress : 0;
          const clampedProg = Math.min(1, Math.max(0, rawProg));
          const deg = Math.round(clampedProg * 360);
          if (pieNode.lastDeg !== deg) {
            pieNode.lastDeg = deg;
            pieNode.pieEl.style.setProperty('--pie-deg', `${deg}deg`);
          }
        }
      }
    }

    // Prune absent station badges & memo entries
    for (const [idx, node] of this.stationNodes.entries()) {
      if (!this.seenStations.has(idx)) {
        node.anchor.remove();
        this.stationNodes.delete(idx);
        this.stationPlanCache.delete(idx);
      }
    }

    // Recycle finished cooking pies into pool
    for (const [key, pieNode] of this.cookPieNodes.entries()) {
      if (!this.seenCookPies.has(key)) {
        this.cookPieNodes.delete(key);
        this.releaseCookPieNode(pieNode);
      }
    }

    // -----------------------------------------------------------------------
    // Layer 3: Customer Order Speech Balloons
    // -----------------------------------------------------------------------
    for (const o of frame.orders) {
      this.seenOrders.add(o.customerId);
      let node = this.orderNodes.get(o.customerId);
      if (!node) {
        node = this.acquireOrderBubbleNode();
        this.orderNodes.set(o.customerId, node);
      }

      if (!updateAnchorPosition(node, o.x, o.y)) {
        setAnchorVisible(node, false);
        continue;
      }
      setAnchorVisible(node, true);

      const isOrdering = o.orderingProgress !== null || o.status === 'ordering';
      const status: ResolvedOrderStatus = isOrdering
        ? 'ordering'
        : o.status === 'waiting_to_order' || o.status === 'waiting_for_food'
          ? o.status
          : o.remaining > 0
            ? 'waiting_for_food'
            : 'waiting_to_order';

      // Delivered happy pop (M2 deliveredPulse or local remaining-decrease fallback)
      if (
        typeof o.deliveredPulse !== 'number' &&
        node.prevStatus === 'waiting_for_food' &&
        node.prevRemaining !== null &&
        o.remaining < node.prevRemaining
      ) {
        node.localPulseUntilMs = nowMs + 240;
      }
      node.prevRemaining = o.remaining;
      node.prevStatus = status;

      const deliveredPulse =
        typeof o.deliveredPulse === 'number' && Number.isFinite(o.deliveredPulse)
          ? Math.min(1, Math.max(0, o.deliveredPulse))
          : node.localPulseUntilMs > nowMs
            ? Math.max(0, (node.localPulseUntilMs - nowMs) / 240)
            : 0;

      let bubbleCls = 'order-bubble';
      if (o.isGolden) bubbleCls += ' golden';
      if (o.isGreedy) bubbleCls += ' greedy';
      if (deliveredPulse > 0.05) bubbleCls += ' delivered-pop';
      if (node.lastClass !== bubbleCls) {
        node.lastClass = bubbleCls;
        node.bubbleEl.className = bubbleCls;
      }

      const showCrown = o.isGolden;
      const showRing = status === 'ordering';
      const showDots = status === 'waiting_to_order';
      const showIcon = status === 'waiting_for_food';
      const showQty = status === 'waiting_for_food';

      if (node.lastShowCrown !== showCrown) {
        node.lastShowCrown = showCrown;
        node.crownEl.hidden = !showCrown;
      }
      if (node.lastShowRing !== showRing) {
        node.lastShowRing = showRing;
        node.ringEl.hidden = !showRing;
      }
      if (node.lastShowDots !== showDots) {
        node.lastShowDots = showDots;
        node.dotsEl.hidden = !showDots;
      }
      if (node.lastShowIcon !== showIcon) {
        node.lastShowIcon = showIcon;
        node.iconEl.hidden = !showIcon;
      }
      if (node.lastShowQty !== showQty) {
        node.lastShowQty = showQty;
        node.qtyEl.hidden = !showQty;
      }

      if (showRing) {
        const rawProg = o.orderingProgress ?? 0;
        const clamped = Number.isFinite(rawProg) ? Math.min(1, Math.max(0, rawProg)) : 0;
        const deg = Math.round(clamped * 360);
        if (node.lastRingDeg !== deg) {
          node.lastRingDeg = deg;
          node.ringEl.style.setProperty('--ring-deg', `${deg}deg`);
        }
      } else if (showIcon) {
        if (node.lastIconText !== o.icon) {
          node.lastIconText = o.icon;
          node.iconEl.textContent = o.icon;
        }
        const qtyStr = `×${Math.max(1, Math.floor(Number.isFinite(o.remaining) ? o.remaining : 1))}`;
        if (node.lastQtyText !== qtyStr) {
          node.lastQtyText = qtyStr;
          node.qtyEl.textContent = qtyStr;
        }
      }

      const scale = deliveredPulse > 0.005 ? 1 + deliveredPulse * 0.24 : 1;
      const scaleQ = Math.round(scale * 1000);
      if (scaleQ !== node.lastScaleQ) {
        node.lastScaleQ = scaleQ;
        node.scaleWrap.style.transform =
          scaleQ === 1000
            ? 'translate(-50%, -100%)'
            : `translate(-50%, -100%) scale(${(scaleQ / 1000).toFixed(3)})`;
      }
    }

    for (const [id, node] of this.orderNodes.entries()) {
      if (!this.seenOrders.has(id)) {
        this.orderNodes.delete(id);
        this.releaseOrderBubbleNode(node);
      }
    }

    // -----------------------------------------------------------------------
    // Layer 4: Tappable World Tip Pills
    // -----------------------------------------------------------------------
    for (const t of frame.tips) {
      this.seenTips.add(t.tipId);
      let node = this.tipNodes.get(t.tipId);
      if (!node) {
        node = this.createTipPillNode(t.tipId);
        this.layer.appendChild(node.anchor);
        this.tipNodes.set(t.tipId, node);
      }

      if (!updateAnchorPosition(node, t.x, t.y)) {
        setAnchorVisible(node, false);
        continue;
      }
      setAnchorVisible(node, true);

      if (node.lastRawAmount !== t.amount || node.lastNotation !== notation) {
        node.lastRawAmount = t.amount;
        node.lastNotation = notation;
        node.amountEl.textContent = formatMoney(t.amount, notation);
      }
    }

    for (const [id, node] of this.tipNodes.entries()) {
      if (!this.seenTips.has(id)) {
        node.anchor.remove();
        this.tipNodes.delete(id);
      }
    }

    // -----------------------------------------------------------------------
    // Layer 5: Floating Earnings & Perfect/Divine Callouts
    // -----------------------------------------------------------------------
    for (const f of frame.floating) {
      this.seenFloat.add(f.id);
      let node = this.floatNodes.get(f.id);
      if (!node) {
        node = this.acquireFloatCalloutNode();
        this.floatNodes.set(f.id, node);
      }

      if (!updateAnchorPosition(node, f.x, f.y)) {
        setAnchorVisible(node, false);
        continue;
      }
      setAnchorVisible(node, true);

      const safeKind = VALID_FLOAT_KINDS.has(f.kind) ? f.kind : 'cash';
      if (node.lastKind !== safeKind) {
        node.lastKind = safeKind;
        node.labelEl.className = `float-label ${safeKind}`;
      }

      if (node.lastText !== f.text) {
        node.lastText = f.text;
        node.mainEl.textContent = f.text;
      }

      const subtext = f.subtext ?? '';
      if (node.lastSubtext !== subtext) {
        node.lastSubtext = subtext;
        node.subEl.textContent = subtext;
        node.subEl.hidden = subtext.length === 0;
      }

      const clampedOpacity = Math.min(
        1,
        Math.max(0, Number.isFinite(f.opacity) ? f.opacity : 1),
      );
      const progress =
        typeof f.progress === 'number' && Number.isFinite(f.progress)
          ? Math.min(1, Math.max(0, f.progress))
          : Math.sqrt(Math.max(0, 1 - clampedOpacity));

      const isBigKind =
        safeKind === 'divine' ||
        safeKind === 'perfect' ||
        safeKind === 'milestone' ||
        safeKind === 'gem';
      const peak = isBigKind ? 1.24 : 1.16;

      let scale: number;
      if (progress < 0.14) {
        const t = progress / 0.14;
        scale = 0.52 + (1 - Math.pow(1 - t, 3)) * (peak - 0.52);
      } else if (progress < 0.3) {
        const t = (progress - 0.14) / 0.16;
        scale = peak - t * (peak - 1.0);
      } else {
        const t = (progress - 0.3) / 0.7;
        scale = 1.0 - t * 0.06;
      }

      const scaleQ = Math.round(scale * 200);
      if (scaleQ !== node.lastScaleQ) {
        node.lastScaleQ = scaleQ;
        node.scaleWrap.style.transform = `translate(-50%, -50%) scale(${(scaleQ / 200).toFixed(3)})`;
      }

      const opacityQ = Math.round(clampedOpacity * 100);
      if (opacityQ !== node.lastOpacityQ) {
        node.lastOpacityQ = opacityQ;
        node.scaleWrap.style.opacity = (opacityQ / 100).toFixed(2);
      }
    }

    for (const [id, node] of this.floatNodes.entries()) {
      if (!this.seenFloat.has(id)) {
        this.floatNodes.delete(id);
        this.releaseFloatCalloutNode(node);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.layer.replaceChildren();
    this.stationNodes.clear();
    this.stationPlanCache.clear();
    this.cookPieNodes.clear();
    this.cookPiePool.length = 0;
    this.orderNodes.clear();
    this.orderPool.length = 0;
    this.tipNodes.clear();
    this.floatNodes.clear();
    this.floatPool.length = 0;
    this.seenStations.clear();
    this.seenCookPies.clear();
    this.seenOrders.clear();
    this.seenTips.clear();
    this.seenFloat.clear();
    this.selectedStationIndex = null;
  }

  // -------------------------------------------------------------------------
  // Pooled DOM Factory Methods (Pure createElement & textContent)
  // -------------------------------------------------------------------------

  private createStationBadgeNode(stationIndex: number): StationBadgeNode {
    const anchor = document.createElement('div');
    anchor.className = 'wo-anchor wo-station-anchor';

    const scaleWrap = document.createElement('div');
    scaleWrap.className = 'wo-station-scale';

    const popularRibbon = document.createElement('div');
    popularRibbon.className = 'station-popular-ribbon';
    popularRibbon.textContent = '★ POPULAR';
    popularRibbon.hidden = true;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'station-badge';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.disposed) return;
      this.onSelectStation(stationIndex);
    });

    const lockIcon = document.createElement('span');
    lockIcon.className = 'sb-lock-icon';
    lockIcon.setAttribute('aria-hidden', 'true');
    lockIcon.textContent = '🔒';
    lockIcon.hidden = true;

    const giftIcon = document.createElement('span');
    giftIcon.className = 'sb-gift-icon';
    giftIcon.setAttribute('aria-hidden', 'true');
    giftIcon.textContent = '🎁';
    giftIcon.hidden = true;

    const dishIcon = document.createElement('span');
    dishIcon.className = 'sb-dish-icon';

    const textEl = document.createElement('span');
    textEl.className = 'sb-text';

    const arrowEl = document.createElement('span');
    arrowEl.className = 'sb-arrow';
    arrowEl.setAttribute('aria-hidden', 'true');
    arrowEl.textContent = '▲';
    arrowEl.hidden = true;

    const maxStarEl = document.createElement('span');
    maxStarEl.className = 'sb-max-star';
    maxStarEl.setAttribute('aria-hidden', 'true');
    maxStarEl.textContent = '★';
    maxStarEl.hidden = true;

    btn.append(lockIcon, giftIcon, dishIcon, textEl, arrowEl, maxStarEl);
    scaleWrap.append(popularRibbon, btn);
    anchor.append(scaleWrap);

    return {
      stationIndex,
      anchor,
      scaleWrap,
      popularRibbon,
      btn,
      lockIcon,
      giftIcon,
      dishIcon,
      textEl,
      arrowEl,
      maxStarEl,
      baseBtnClass: 'station-badge',
      lastX: Number.NaN,
      lastY: Number.NaN,
      lastVisible: true,
      lastDishIcon: '',
      lastText: '',
      lastShowLock: false,
      lastShowGift: false,
      lastShowArrow: false,
      lastShowMax: false,
      lastIsPopular: false,
      lastScaleQ: 1000,
      localPulseUntilMs: 0,
    };
  }

  private acquireCookPieNode(): CookPieNode {
    const recycled = this.cookPiePool.pop();
    if (recycled) {
      setAnchorVisible(recycled, true);
      return recycled;
    }

    const anchor = document.createElement('div');
    anchor.className = 'wo-anchor wo-cook-anchor';

    const pieEl = document.createElement('div');
    pieEl.className = 'cook-pie normal';

    anchor.append(pieEl);
    this.layer.appendChild(anchor);

    return {
      anchor,
      pieEl,
      lastX: Number.NaN,
      lastY: Number.NaN,
      lastVisible: true,
      lastQuality: 'normal',
      lastDeg: -1,
    };
  }

  private releaseCookPieNode(node: CookPieNode): void {
    if (this.cookPiePool.length < MAX_COOK_PIE_POOL) {
      setAnchorVisible(node, false);
      this.cookPiePool.push(node);
    } else {
      node.anchor.remove();
    }
  }

  private acquireOrderBubbleNode(): OrderBubbleNode {
    const recycled = this.orderPool.pop();
    if (recycled) {
      recycled.prevRemaining = null;
      recycled.prevStatus = null;
      recycled.localPulseUntilMs = 0;
      setAnchorVisible(recycled, true);
      return recycled;
    }

    const anchor = document.createElement('div');
    anchor.className = 'wo-anchor wo-order-anchor';

    const scaleWrap = document.createElement('div');
    scaleWrap.className = 'wo-order-scale';

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'order-bubble';

    const crownEl = document.createElement('span');
    crownEl.className = 'ob-crown';
    crownEl.setAttribute('aria-hidden', 'true');
    crownEl.textContent = '👑';
    crownEl.hidden = true;

    const ringEl = document.createElement('span');
    ringEl.className = 'order-radial-ring';
    ringEl.setAttribute('aria-hidden', 'true');
    ringEl.hidden = true;

    const dotsEl = document.createElement('span');
    dotsEl.className = 'ob-dots';
    dotsEl.setAttribute('aria-hidden', 'true');
    dotsEl.hidden = true;
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = 'ob-dot';
      dotsEl.append(dot);
    }

    const iconEl = document.createElement('span');
    iconEl.className = 'ob-icon';
    iconEl.hidden = true;

    const qtyEl = document.createElement('span');
    qtyEl.className = 'ob-qty';
    qtyEl.hidden = true;

    const tailEl = document.createElement('span');
    tailEl.className = 'order-bubble-tail';
    tailEl.setAttribute('aria-hidden', 'true');

    bubbleEl.append(crownEl, ringEl, dotsEl, iconEl, qtyEl, tailEl);
    scaleWrap.append(bubbleEl);
    anchor.append(scaleWrap);
    this.layer.appendChild(anchor);

    return {
      anchor,
      scaleWrap,
      bubbleEl,
      crownEl,
      ringEl,
      dotsEl,
      iconEl,
      qtyEl,
      lastX: Number.NaN,
      lastY: Number.NaN,
      lastVisible: true,
      lastClass: 'order-bubble',
      lastShowCrown: false,
      lastShowRing: false,
      lastShowDots: false,
      lastShowIcon: false,
      lastShowQty: false,
      lastIconText: '',
      lastQtyText: '',
      lastRingDeg: -1,
      lastScaleQ: 1000,
      prevRemaining: null,
      prevStatus: null,
      localPulseUntilMs: 0,
    };
  }

  private releaseOrderBubbleNode(node: OrderBubbleNode): void {
    if (this.orderPool.length < MAX_ORDER_POOL) {
      setAnchorVisible(node, false);
      this.orderPool.push(node);
    } else {
      node.anchor.remove();
    }
  }

  private createTipPillNode(tipId: string): TipPillNode {
    const anchor = document.createElement('div');
    anchor.className = 'wo-anchor wo-tip-anchor';

    const centerWrap = document.createElement('div');
    centerWrap.className = 'wo-tip-center';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tip-pill-world';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.disposed) return;
      this.onTapTip(tipId);
    });

    const coinDisc = document.createElement('span');
    coinDisc.className = 'tip-coin-disc';
    coinDisc.setAttribute('aria-hidden', 'true');
    coinDisc.textContent = '$';

    const amountEl = document.createElement('span');
    amountEl.className = 'tip-amount';

    btn.append(coinDisc, amountEl);
    centerWrap.append(btn);
    anchor.append(centerWrap);

    return {
      anchor,
      btn,
      amountEl,
      lastX: Number.NaN,
      lastY: Number.NaN,
      lastVisible: true,
      lastRawAmount: '',
      lastNotation: null,
    };
  }

  private acquireFloatCalloutNode(): FloatCalloutNode {
    const recycled = this.floatPool.pop();
    if (recycled) {
      setAnchorVisible(recycled, true);
      return recycled;
    }

    const anchor = document.createElement('div');
    anchor.className = 'wo-anchor wo-float-anchor';

    const scaleWrap = document.createElement('div');
    scaleWrap.className = 'wo-float-scale';

    const labelEl = document.createElement('div');
    labelEl.className = 'float-label cash';

    const mainEl = document.createElement('span');
    mainEl.className = 'float-main';

    const subEl = document.createElement('span');
    subEl.className = 'float-sub';
    subEl.hidden = true;

    labelEl.append(mainEl, subEl);
    scaleWrap.append(labelEl);
    anchor.append(scaleWrap);
    this.layer.appendChild(anchor);

    return {
      anchor,
      scaleWrap,
      labelEl,
      mainEl,
      subEl,
      lastX: Number.NaN,
      lastY: Number.NaN,
      lastVisible: true,
      lastKind: 'cash',
      lastText: '',
      lastSubtext: '',
      lastScaleQ: -1,
      lastOpacityQ: -1,
    };
  }

  private releaseFloatCalloutNode(node: FloatCalloutNode): void {
    if (this.floatPool.length < MAX_FLOAT_POOL) {
      setAnchorVisible(node, false);
      this.floatPool.push(node);
    } else {
      node.anchor.remove();
    }
  }
}
