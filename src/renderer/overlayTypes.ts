export interface ProjectedCookingSlot {
  progress: number; // 0..1
  /** Seconds left on this dish (shown as a countdown next to the progress bar). */
  remainingSec?: number;
  quality: 'normal' | 'perfect' | 'divine';
  x: number;
  y: number;
}

export interface ProjectedStationBadge {
  stationIndex: number;
  x: number;
  y: number;
  visible: boolean;
  isPopular?: boolean;
  cookingSlots?: ProjectedCookingSlot[];
  justUpgradedPulse?: number; // 0..1 spring decay
}

/** Screen-space rectangle of a character that overlays must never hide (e.g. the player chef). */
export interface ProjectedOccluderRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ProjectedOverlayFrame {
  stations: ProjectedStationBadge[];
  /** Characters to keep visible: overlapping bubbles/badges turn see-through. */
  occluders?: ProjectedOccluderRect[];
  orders: Array<{
    customerId: string;
    x: number;
    y: number;
    icon: string;
    remaining: number;
    isGolden: boolean;
    isGreedy: boolean;
    orderingProgress: number | null;
    status?: 'waiting_to_order' | 'ordering' | 'waiting_for_food';
    deliveredPulse?: number; // 0..1 happy pop
  }>;
  tips: Array<{ tipId: string; x: number; y: number; amount: string }>;
  floating: Array<{
    id: number;
    x: number;
    y: number;
    text: string;
    subtext?: string;
    kind: string;
    opacity: number;
    progress?: number; // 0..1 normalized lifetime
  }>;
}
