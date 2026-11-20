import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SoundEngine,
  type OfflineAudioSampleResult,
  type SfxName,
  type SfxPlayOptions,
  type SoundEngineStateSummary,
} from '@/audio/soundEngine';
import { ALL_SFX_NAMES, MAX_CONCURRENT_VOICES, PENTATONIC_SEMITONES } from '@/audio/audioTypes';
import { LIMITER_PARAMS, MASTER_GAIN_CEILING } from '@/audio/audioGraph';
import { DUCK_FACTOR, MAX_AMBIENT_VOICES } from '@/audio/ambientLoop';
import { FANFARE_SFX, SFX_COOLDOWN_MS, buildSfxRecipe } from '@/audio/sfxRecipes';

// ============================================================================
// Realistic Spec-Faithful Web Audio Mock Harness (Strict TS, Zero `any`)
// ============================================================================

interface ParamEvent {
  type:
    | 'setValueAtTime'
    | 'linearRampToValueAtTime'
    | 'exponentialRampToValueAtTime'
    | 'setTargetAtTime'
    | 'cancelScheduledValues';
  value?: number;
  time: number;
  timeConstant?: number;
}

class MockAudioParam {
  private _value: number;
  readonly events: ParamEvent[] = [];
  private readonly maxAllowed?: number;
  private readonly onRangeError?: () => void;

  constructor(initialValue = 0, maxAllowed?: number, onRangeError?: () => void) {
    this._value = initialValue;
    this.maxAllowed = maxAllowed;
    this.onRangeError = onRangeError;
  }

  get value(): number {
    return this._value;
  }

  set value(v: number) {
    this.assertRange(v, 'value');
    this._value = v;
  }

  private assertFinite(val: number, label: string): void {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      this.onRangeError?.();
      throw new RangeError(`Non-finite ${label}: ${String(val)}`);
    }
  }

  private assertRange(val: number, label: string): void {
    this.assertFinite(val, label);
    if (this.maxAllowed !== undefined && val > this.maxAllowed) {
      this.onRangeError?.();
      throw new RangeError(`${label} ${val} exceeds Nyquist ${this.maxAllowed}`);
    }
  }

  setValueAtTime(value: number, startTime: number): this {
    this.assertRange(value, 'value');
    this.assertFinite(startTime, 'startTime');
    this._value = value;
    this.events.push({ type: 'setValueAtTime', value, time: startTime });
    return this;
  }

  linearRampToValueAtTime(value: number, endTime: number): this {
    this.assertRange(value, 'value');
    this.assertFinite(endTime, 'endTime');
    this._value = value;
    this.events.push({ type: 'linearRampToValueAtTime', value, time: endTime });
    return this;
  }

  exponentialRampToValueAtTime(value: number, endTime: number): this {
    this.assertRange(value, 'value');
    this.assertFinite(endTime, 'endTime');
    if (value <= 0) {
      this.onRangeError?.();
      throw new RangeError(`exponentialRampToValueAtTime requires positive value, got ${value}`);
    }
    this._value = value;
    this.events.push({ type: 'exponentialRampToValueAtTime', value, time: endTime });
    return this;
  }

  setTargetAtTime(target: number, startTime: number, timeConstant: number): this {
    this.assertFinite(target, 'target');
    this.assertFinite(startTime, 'startTime');
    this.assertFinite(timeConstant, 'timeConstant');
    this.value = target;
    this.events.push({ type: 'setTargetAtTime', value: target, time: startTime, timeConstant });
    return this;
  }

  cancelScheduledValues(cancelTime: number): this {
    this.assertFinite(cancelTime, 'cancelTime');
    this.events.push({ type: 'cancelScheduledValues', time: cancelTime });
    return this;
  }

  firstValue(): number | undefined {
    const ev = this.events.find((e) => e.value !== undefined);
    return ev?.value;
  }

  lastValue(): number | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].value !== undefined) return this.events[i].value;
    }
    return undefined;
  }

  peakScheduled(): number {
    let peak = -Infinity;
    for (const ev of this.events) {
      if (ev.value !== undefined && ev.value > peak) peak = ev.value;
    }
    return peak;
  }

  minScheduled(): number {
    let min = Infinity;
    for (const ev of this.events) {
      if (ev.value !== undefined && ev.value < min) min = ev.value;
    }
    return min;
  }
}

class MockAudioNode {
  readonly kind: string;
  readonly connections: MockAudioNode[] = [];
  readonly allConnectedTargets: MockAudioNode[] = [];
  disconnected = false;
  disconnectCount = 0;
  throwOnConnect = false;
  throwOnDisconnect = false;

  constructor(kind: string) {
    this.kind = kind;
  }

  connect(destination: MockAudioNode): MockAudioNode {
    if (this.throwOnConnect) {
      throw new Error(`Simulated connect failure on ${this.kind}`);
    }
    this.connections.push(destination);
    this.allConnectedTargets.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnectCount += 1;
    if (this.throwOnDisconnect) {
      throw new Error(`Simulated disconnect failure on ${this.kind}`);
    }
    this.disconnected = true;
    this.connections.length = 0;
  }
}

class MockGainNode extends MockAudioNode {
  readonly gain = new MockAudioParam(1);
  constructor() {
    super('gain');
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency: MockAudioParam;
  readonly Q = new MockAudioParam(1);
  readonly gain = new MockAudioParam(0);
  readonly detune = new MockAudioParam(0);

  constructor(maxFreq?: number, onRangeError?: () => void) {
    super('biquadFilter');
    this.frequency = new MockAudioParam(350, maxFreq, onRangeError);
  }
}

class MockDynamicsCompressorNode extends MockAudioNode {
  readonly threshold = new MockAudioParam(-24);
  readonly knee = new MockAudioParam(30);
  readonly ratio = new MockAudioParam(12);
  readonly attack = new MockAudioParam(0.003);
  readonly release = new MockAudioParam(0.25);

  constructor() {
    super('dynamicsCompressor');
  }
}

class MockAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = sampleRate > 0 ? length / sampleRate : 0;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

class MockOscillatorNode extends MockAudioNode {
  type: OscillatorType = 'sine';
  readonly frequency = new MockAudioParam(440);
  readonly detune = new MockAudioParam(0);
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  throwOnStart = false;
  syncEndOnStart = false;

  constructor() {
    super('oscillator');
  }

  start(when = 0): void {
    if (this.throwOnStart) {
      throw new Error('Simulated oscillator start failure');
    }
    this.startedAt = when;
    if (this.syncEndOnStart) {
      this.triggerEnded();
    }
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }

  triggerEnded(): void {
    this.onended?.();
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: MockAudioBuffer | null = null;
  loop = false;
  readonly playbackRate = new MockAudioParam(1);
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  startOffset: number | null = null;
  startDuration: number | null = null;
  stoppedAt: number | null = null;
  throwOnStart = false;
  onStart?: () => void;

  constructor() {
    super('bufferSource');
  }

  start(when = 0, offset?: number, duration?: number): void {
    this.onStart?.();
    if (this.throwOnStart) {
      throw new Error('Simulated bufferSource start failure');
    }
    this.startedAt = when;
    this.startOffset = offset ?? 0;
    this.startDuration = duration ?? null;
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }

  triggerEnded(): void {
    this.onended?.();
  }
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err?: unknown) => void;
}

function createDeferred(): Deferred {
  let resolveFn: () => void = () => {};
  let rejectFn: (err?: unknown) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}

interface MockAudioContextOptions {
  initialState?: 'suspended' | 'running' | 'closed' | 'interrupted';
  sampleRate?: number;
  autoTransitionOnSuspend?: boolean;
  autoTransitionOnResume?: boolean;
  rejectSuspend?: boolean;
  rejectResume?: boolean;
  throwSyncOnResume?: boolean;
  omitDynamicsCompressor?: boolean;
  omitBiquadFilter?: boolean;
  omitBuffers?: boolean;
  omitGain?: boolean;
  throwOnClose?: boolean;
  throwOnStateRead?: boolean;
  throwOnSampleRateRead?: boolean;
  throwOnCompConnect?: boolean;
  strictFilterNyquist?: boolean;
  syncEndOscillators?: boolean;
  throwNextOscStart?: boolean;
  throwAllStarts?: boolean;
  onResume?: () => void;
  onBufferStart?: () => void;
}

class MockAudioContext {
  private _state: 'suspended' | 'running' | 'closed' | 'interrupted';
  private _sampleRate: number;
  currentTime = 0;
  readonly destination = new MockAudioNode('destination');

  readonly oscillators: MockOscillatorNode[] = [];
  readonly gains: MockGainNode[] = [];
  readonly bufferSources: MockAudioBufferSourceNode[] = [];
  readonly buffers: MockAudioBuffer[] = [];
  readonly filters: MockBiquadFilterNode[] = [];
  readonly compressors: MockDynamicsCompressorNode[] = [];

  suspendCalls = 0;
  resumeCalls = 0;
  closeCalls = 0;
  filterRangeErrors = 0;

  throwOnClose: boolean;
  throwOnStateRead: boolean;
  throwOnSampleRateRead: boolean;
  throwSyncOnResume: boolean;
  syncEndOscillators: boolean;
  throwNextOscStart: boolean;
  throwAllStarts: boolean;
  autoTransitionOnSuspend: boolean;
  autoTransitionOnResume: boolean;
  rejectSuspend: boolean;
  rejectResume: boolean;
  onResume?: () => void;
  onBufferStart?: () => void;

  readonly pendingSuspends: Deferred[] = [];
  readonly pendingResumes: Deferred[] = [];

  createDynamicsCompressor?: () => MockDynamicsCompressorNode;
  createBiquadFilter?: () => MockBiquadFilterNode;
  createBuffer?: (channels: number, length: number, sampleRate: number) => MockAudioBuffer;
  createBufferSource?: () => MockAudioBufferSourceNode;
  createGain?: () => MockGainNode;

  constructor(opts: MockAudioContextOptions = {}) {
    this._state = opts.initialState ?? 'running';
    this._sampleRate = opts.sampleRate ?? 44100;
    this.autoTransitionOnSuspend = opts.autoTransitionOnSuspend ?? true;
    this.autoTransitionOnResume = opts.autoTransitionOnResume ?? true;
    this.rejectSuspend = opts.rejectSuspend ?? false;
    this.rejectResume = opts.rejectResume ?? false;
    this.throwSyncOnResume = opts.throwSyncOnResume ?? false;
    this.throwOnClose = opts.throwOnClose ?? false;
    this.throwOnStateRead = opts.throwOnStateRead ?? false;
    this.throwOnSampleRateRead = opts.throwOnSampleRateRead ?? false;
    this.syncEndOscillators = opts.syncEndOscillators ?? false;
    this.throwNextOscStart = opts.throwNextOscStart ?? false;
    this.throwAllStarts = opts.throwAllStarts ?? false;
    this.onResume = opts.onResume;
    this.onBufferStart = opts.onBufferStart;

    if (!opts.omitDynamicsCompressor) {
      this.createDynamicsCompressor = () => {
        const comp = new MockDynamicsCompressorNode();
        if (opts.throwOnCompConnect) {
          comp.throwOnConnect = true;
        }
        this.compressors.push(comp);
        return comp;
      };
    }

    if (!opts.omitBiquadFilter) {
      this.createBiquadFilter = () => {
        const maxFreq = opts.strictFilterNyquist ? this._sampleRate / 2 : undefined;
        const filter = new MockBiquadFilterNode(maxFreq, () => {
          this.filterRangeErrors += 1;
        });
        this.filters.push(filter);
        return filter;
      };
    }

    if (!opts.omitBuffers) {
      this.createBuffer = (channels: number, length: number, sampleRate: number) => {
        const buf = new MockAudioBuffer(channels, length, sampleRate);
        this.buffers.push(buf);
        return buf;
      };
      this.createBufferSource = () => {
        const src = new MockAudioBufferSourceNode();
        if (this.throwAllStarts) {
          src.throwOnStart = true;
        }
        src.onStart = () => this.onBufferStart?.();
        this.bufferSources.push(src);
        return src;
      };
    }

    if (!opts.omitGain) {
      this.createGain = () => {
        const g = new MockGainNode();
        this.gains.push(g);
        return g;
      };
    }
  }

  get sampleRate(): number {
    if (this.throwOnSampleRateRead) {
      throw new Error('Simulated sampleRate getter error');
    }
    return this._sampleRate;
  }

  get state(): 'suspended' | 'running' | 'closed' | 'interrupted' {
    if (this.throwOnStateRead) {
      throw new Error('Simulated state getter error');
    }
    return this._state;
  }

  set state(next: 'suspended' | 'running' | 'closed' | 'interrupted') {
    this._state = next;
  }

  createOscillator(): MockOscillatorNode {
    const osc = new MockOscillatorNode();
    osc.syncEndOnStart = this.syncEndOscillators;
    if (this.throwAllStarts) {
      osc.throwOnStart = true;
    } else if (this.throwNextOscStart) {
      osc.throwOnStart = true;
      this.throwNextOscStart = false;
    }
    this.oscillators.push(osc);
    return osc;
  }

  suspend(): Promise<void> {
    this.suspendCalls += 1;
    if (this.rejectSuspend) {
      return Promise.reject(new Error('Simulated suspend rejection'));
    }
    if (this.autoTransitionOnSuspend) {
      this._state = 'suspended';
      return Promise.resolve();
    }
    const def = createDeferred();
    this.pendingSuspends.push(def);
    return def.promise;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.onResume?.();
    if (this.throwSyncOnResume) {
      throw new Error('Simulated sync resume failure');
    }
    if (this.rejectResume) {
      return Promise.reject(new Error('Simulated resume rejection'));
    }
    if (this.autoTransitionOnResume) {
      this._state = 'running';
      return Promise.resolve();
    }
    const def = createDeferred();
    this.pendingResumes.push(def);
    return def.promise;
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    if (this.throwOnClose) {
      throw new Error('Simulated close failure');
    }
    this._state = 'closed';
    return Promise.resolve();
  }

  resolveNextSuspend(nextState: 'suspended' | 'interrupted' = 'suspended'): void {
    const def = this.pendingSuspends.shift();
    if (!def) return;
    this._state = nextState;
    def.resolve();
  }

  rejectNextSuspend(): void {
    const def = this.pendingSuspends.shift();
    if (!def) return;
    def.reject(new Error('Suspend superseded'));
  }

  resolveNextResume(nextState: 'running' | 'suspended' = 'running'): void {
    const def = this.pendingResumes.shift();
    if (!def) return;
    this._state = nextState;
    def.resolve();
  }

  rejectNextResume(): void {
    const def = this.pendingResumes.shift();
    if (!def) return;
    def.reject(new Error('Autoplay blocked'));
  }

  triggerAllVoiceEnded(): void {
    for (const osc of this.oscillators) osc.triggerEnded();
    for (const src of this.bufferSources) {
      if (src.buffer && src.buffer.length > 1) {
        src.triggerEnded();
      }
    }
  }
}

interface MockOfflineOptions {
  rejectWith?: Error;
  injectNaN?: boolean;
}

class MockOfflineAudioContext {
  readonly channels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly currentTime = 0;
  readonly state = 'suspended';
  readonly destination = new MockAudioNode('destination');

  readonly oscillators: MockOscillatorNode[] = [];
  readonly gains: MockGainNode[] = [];
  readonly bufferSources: MockAudioBufferSourceNode[] = [];
  readonly buffers: MockAudioBuffer[] = [];
  readonly filters: MockBiquadFilterNode[] = [];
  readonly compressors: MockDynamicsCompressorNode[] = [];

  private readonly opts: MockOfflineOptions;

  constructor(channels: number, length: number, sampleRate: number, opts: MockOfflineOptions = {}) {
    this.channels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.opts = opts;
  }

  createGain(): MockGainNode {
    const g = new MockGainNode();
    this.gains.push(g);
    return g;
  }

  createDynamicsCompressor(): MockDynamicsCompressorNode {
    const comp = new MockDynamicsCompressorNode();
    this.compressors.push(comp);
    return comp;
  }

  createBiquadFilter(): MockBiquadFilterNode {
    const f = new MockBiquadFilterNode();
    this.filters.push(f);
    return f;
  }

  createOscillator(): MockOscillatorNode {
    const osc = new MockOscillatorNode();
    this.oscillators.push(osc);
    return osc;
  }

  createBuffer(channels: number, length: number, sampleRate: number): MockAudioBuffer {
    const buf = new MockAudioBuffer(channels, length, sampleRate);
    this.buffers.push(buf);
    return buf;
  }

  createBufferSource(): MockAudioBufferSourceNode {
    const src = new MockAudioBufferSourceNode();
    this.bufferSources.push(src);
    return src;
  }

  async startRendering(): Promise<MockAudioBuffer> {
    if (this.opts.rejectWith) {
      throw this.opts.rejectWith;
    }
    const rendered = new MockAudioBuffer(this.channels, this.length, this.sampleRate);
    const data = rendered.getChannelData(0);

    // Synthesize genuine deterministic non-zero signal from scheduled oscillators & buffers
    for (const osc of this.oscillators) {
      const freq = osc.frequency.firstValue() ?? 440;
      const startSample = Math.floor((osc.startedAt ?? 0) * this.sampleRate);
      const endSample = Math.min(
        this.length,
        Math.ceil((osc.stoppedAt ?? this.length / this.sampleRate) * this.sampleRate),
      );
      for (let i = Math.max(0, startSample); i < endSample; i++) {
        data[i] += 0.12 * Math.sin((2 * Math.PI * freq * (i - startSample)) / this.sampleRate);
      }
    }
    for (const src of this.bufferSources) {
      if (!src.buffer) continue;
      const srcData = src.buffer.getChannelData(0);
      const startSample = Math.floor((src.startedAt ?? 0) * this.sampleRate);
      const endSample = Math.min(
        this.length,
        Math.ceil((src.stoppedAt ?? this.length / this.sampleRate) * this.sampleRate),
      );
      for (let i = Math.max(0, startSample); i < endSample; i++) {
        data[i] += 0.08 * srcData[(i - startSample) % srcData.length];
      }
    }

    for (let i = 0; i < data.length; i++) {
      data[i] = Math.max(-0.95, Math.min(0.95, data[i]));
    }

    if (this.opts.injectNaN && data.length > 0) {
      data[Math.min(10, data.length - 1)] = Number.NaN;
    }

    return rendered;
  }
}

function reaches(start: MockAudioNode, target: MockAudioNode): boolean {
  const visited = new Set<MockAudioNode>();
  const queue: MockAudioNode[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of current.allConnectedTargets) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return false;
}

interface MockEnvOptions {
  contextOptions?: MockAudioContextOptions | (() => MockAudioContextOptions);
  useWebkitPrefix?: boolean;
  includeOfflineOnWindow?: boolean;
  offlineOptions?: MockOfflineOptions;
}

interface MockAudioEnv {
  contexts: MockAudioContext[];
  offlineContexts: MockOfflineAudioContext[];
  listeners: Map<string, Set<() => void>>;
  dispatchWindowEvent: (type: string) => void;
  totalListenerCount: () => number;
}

function installMockAudioEnv(opts: MockEnvOptions = {}): MockAudioEnv {
  const contexts: MockAudioContext[] = [];
  const offlineContexts: MockOfflineAudioContext[] = [];
  const listeners = new Map<string, Set<() => void>>();

  const CtxCtor = function MockCtxFactory() {
    const ctxOpts =
      typeof opts.contextOptions === 'function'
        ? opts.contextOptions()
        : (opts.contextOptions ?? {});
    const ctx = new MockAudioContext(ctxOpts);
    contexts.push(ctx);
    return ctx;
  };

  const OfflineCtor = function MockOfflineFactory(
    channels: number,
    length: number,
    sampleRate: number,
  ) {
    const off = new MockOfflineAudioContext(channels, length, sampleRate, opts.offlineOptions);
    offlineContexts.push(off);
    return off;
  };

  const mockWindow: Record<string, unknown> = {
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    addEventListener: (type: string, handler: () => void) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(handler);
    },
    removeEventListener: (type: string, handler: () => void) => {
      listeners.get(type)?.delete(handler);
    },
  };

  if (opts.useWebkitPrefix) {
    mockWindow.webkitAudioContext = CtxCtor;
    if (opts.includeOfflineOnWindow) {
      mockWindow.webkitOfflineAudioContext = OfflineCtor;
    }
  } else {
    mockWindow.AudioContext = CtxCtor;
    if (opts.includeOfflineOnWindow) {
      mockWindow.OfflineAudioContext = OfflineCtor;
    }
  }

  vi.stubGlobal('window', mockWindow);

  return {
    contexts,
    offlineContexts,
    listeners,
    dispatchWindowEvent: (type: string) => {
      const set = listeners.get(type);
      if (!set) return;
      for (const fn of Array.from(set)) {
        fn();
      }
    },
    totalListenerCount: () => {
      let count = 0;
      for (const set of listeners.values()) count += set.size;
      return count;
    },
  };
}

const activeEngines: SoundEngine[] = [];

function createEngine(): SoundEngine {
  const engine = new SoundEngine();
  activeEngines.push(engine);
  return engine;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  for (const eng of activeEngines) {
    eng.dispose();
  }
  activeEngines.length = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ============================================================================
// Suite 1: Node Safety (window === undefined)
// ============================================================================

describe('Suite 1: Node Safety (window === undefined)', () => {
  it('safely no-ops every public method and all 21 SFX in pure Node with zero timers', () => {
    expect(typeof window).toBe('undefined');
    const engine = createEngine();

    const initial: SoundEngineStateSummary = engine.getStateSummary();
    expect(initial).toEqual({
      enabled: true,
      sfxVolume: 0.85,
      ambientEnabled: true,
      ambientVolume: 0.35,
      unlocked: false,
      contextState: 'unavailable',
      activeVoices: 0,
    });

    expect(() => {
      engine.unlock();
      engine.setEnabled(false);
      engine.setEnabled(true);
      engine.setSfxVolume(0.6);
      engine.setAmbientEnabled(false);
      engine.setAmbientEnabled(true);
      engine.setAmbientVolume(0.5);
      engine.setPaused(true);
      engine.setPaused(false);
      for (const sfx of ALL_SFX_NAMES) {
        engine.play(sfx);
        engine.play(sfx, { combo: 8, intensity: 0.7, pitchJitter: 1.05 });
      }
      engine.dispose();
      engine.dispose();
    }).not.toThrow();

    expect(engine.getStateSummary().contextState).toBe('unavailable');
    expect(engine.getStateSummary().activeVoices).toBe(0);
  });
});

// ============================================================================
// Suite 2: Public Contract Surface & Parameter Sanitization
// ============================================================================

describe('Suite 2: Public Contract Surface & Parameter Sanitization', () => {
  it('preserves exact 21 SfxName literals and all 10 SoundEngine public methods', () => {
    const exhaustiveCheck: Record<SfxName, true> = {
      tap: true,
      tab: true,
      sheet_open: true,
      sheet_close: true,
      upgrade: true,
      unlock: true,
      milestone: true,
      achievement: true,
      coin: true,
      perfect: true,
      divine: true,
      tip: true,
      order: true,
      sizzle: true,
      instant_cook: true,
      customer_happy: true,
      boost: true,
      box: true,
      renovate: true,
      city_flight: true,
      error: true,
    };
    expect(Object.keys(exhaustiveCheck)).toHaveLength(21);
    expect(ALL_SFX_NAMES).toHaveLength(21);

    const engine = createEngine();
    const methods = [
      'setEnabled',
      'setSfxVolume',
      'setAmbientEnabled',
      'setAmbientVolume',
      'setPaused',
      'unlock',
      'play',
      'getStateSummary',
      'renderOfflineSample',
      'dispose',
    ] as const;

    for (const m of methods) {
      expect(typeof engine[m]).toBe('function');
    }
  });

  it('clamps volumes to [0, 1], preserves previous valid value on NaN/Infinity, and sanitizes SfxPlayOptions', () => {
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.unlock();

    engine.setSfxVolume(-5);
    expect(engine.getStateSummary().sfxVolume).toBe(0);
    engine.setSfxVolume(2.5);
    expect(engine.getStateSummary().sfxVolume).toBe(1);
    engine.setSfxVolume(0.62);
    engine.setSfxVolume(Number.NaN);
    engine.setSfxVolume(Number.POSITIVE_INFINITY);
    engine.setSfxVolume(Number.NEGATIVE_INFINITY);
    expect(engine.getStateSummary().sfxVolume).toBe(0.62);

    engine.setAmbientVolume(-2);
    expect(engine.getStateSummary().ambientVolume).toBe(0);
    engine.setAmbientVolume(9);
    expect(engine.getStateSummary().ambientVolume).toBe(1);
    engine.setAmbientVolume(0.41);
    engine.setAmbientVolume(Number.NaN);
    engine.setAmbientVolume(Number.POSITIVE_INFINITY);
    engine.setAmbientVolume(Number.NEGATIVE_INFINITY);
    expect(engine.getStateSummary().ambientVolume).toBe(0.41);

    const ctx = env.contexts[0];
    const oscBefore = ctx.oscillators.length;

    // intensity <= 0 skips scheduling completely
    engine.play('unlock', { intensity: 0 });
    engine.play('unlock', { intensity: -2 });
    expect(ctx.oscillators.length).toBe(oscBefore);
    expect(engine.getStateSummary().activeVoices).toBe(0);

    // Adversarial options clamp safely with zero RangeErrors on AudioParams
    const adversarialOpts: SfxPlayOptions[] = [
      { intensity: 5, combo: -5, pitchJitter: 0 },
      { intensity: Number.NaN, combo: Number.NaN, pitchJitter: -1 },
      { intensity: Number.POSITIVE_INFINITY, combo: Number.POSITIVE_INFINITY, pitchJitter: Number.NaN },
      { intensity: 0.8, combo: 999, pitchJitter: Number.POSITIVE_INFINITY },
      { intensity: 0.9, combo: 24, pitchJitter: 99 },
    ];
    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 500;
      return now;
    });
    for (const opts of adversarialOpts) {
      expect(() => engine.play('upgrade', opts)).not.toThrow();
    }
    expect(ctx.oscillators.length).toBeGreaterThan(oscBefore);
  });
});

// ============================================================================
// Suite 3: Master Bus Wiring & Graceful Degradation Fallback
// ============================================================================

describe('Suite 3: Master Bus Wiring & Compressor Fallback', () => {
  it('wires sfxBusGain + ambientBusGain -> masterGain (0.95) -> DynamicsCompressorNode -> destination', () => {
    vi.useFakeTimers();
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.unlock();

    const ctx = env.contexts[0];
    expect(ctx.compressors).toHaveLength(1);
    const comp = ctx.compressors[0];
    expect(comp.threshold.value).toBe(LIMITER_PARAMS.threshold);
    expect(comp.knee.value).toBe(LIMITER_PARAMS.knee);
    expect(comp.ratio.value).toBe(LIMITER_PARAMS.ratio);
    expect(comp.attack.value).toBe(LIMITER_PARAMS.attack);
    expect(comp.release.value).toBe(LIMITER_PARAMS.release);

    // Bus gains created in order: sfxBusGain, ambientBusGain, masterGain
    const [sfxBusGain, ambientBusGain, masterGain] = ctx.gains;
    expect(sfxBusGain).not.toBe(ambientBusGain);
    expect(masterGain.gain.firstValue()).toBeCloseTo(MASTER_GAIN_CEILING, 5);
    expect(reaches(sfxBusGain, masterGain)).toBe(true);
    expect(reaches(ambientBusGain, masterGain)).toBe(true);
    expect(reaches(masterGain, comp)).toBe(true);
    expect(reaches(comp, ctx.destination)).toBe(true);

    // Trigger SFX and confirm voice routes through sfxBusGain -> masterGain -> compressor -> destination
    engine.play('tap');
    const sfxOsc = ctx.oscillators[0];
    expect(reaches(sfxOsc, sfxBusGain)).toBe(true);
    expect(reaches(sfxOsc, comp)).toBe(true);
    expect(reaches(sfxOsc, ctx.destination)).toBe(true);

    // Advance ambient timer and confirm ambient voice routes through ambientBusGain -> masterGain -> compressor
    const oscCountBeforeAmbient = ctx.oscillators.length;
    vi.advanceTimersByTime(200);
    expect(ctx.oscillators.length).toBeGreaterThan(oscCountBeforeAmbient);
    const ambientOsc = ctx.oscillators[oscCountBeforeAmbient];
    expect(reaches(ambientOsc, ambientBusGain)).toBe(true);
    expect(reaches(ambientOsc, sfxBusGain)).toBe(false);
    expect(reaches(ambientOsc, comp)).toBe(true);

    // Disabling sound silences masterGain and blocks playback
    engine.setEnabled(false);
    expect(masterGain.gain.lastValue()).toBe(0);
    const countWhileDisabled = ctx.oscillators.length;
    engine.play('milestone');
    expect(ctx.oscillators.length).toBe(countWhileDisabled);
  });

  it('degrades gracefully when DynamicsCompressor, BiquadFilter, Buffers, or Gain are unavailable', () => {
    // 1. Missing DynamicsCompressorNode: masterGain connects directly to destination
    const envNoComp = installMockAudioEnv({
      contextOptions: { initialState: 'running', omitDynamicsCompressor: true },
    });
    const engineNoComp = createEngine();
    engineNoComp.unlock();
    const ctxNoComp = envNoComp.contexts[0];
    expect(ctxNoComp.compressors).toHaveLength(0);
    const [sfxBus, ambientBus, master] = ctxNoComp.gains;
    expect(reaches(sfxBus, master)).toBe(true);
    expect(reaches(ambientBus, master)).toBe(true);
    expect(reaches(master, ctxNoComp.destination)).toBe(true);
    expect(() => engineNoComp.play('sizzle')).not.toThrow();
    expect(ctxNoComp.oscillators.length).toBeGreaterThan(0);

    // 2. Minimal mock omitting compressor + biquad + buffers + gain
    vi.unstubAllGlobals();
    const envMinimal = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        omitDynamicsCompressor: true,
        omitBiquadFilter: true,
        omitBuffers: true,
        omitGain: true,
      },
    });
    const engineMinimal = createEngine();
    expect(() => {
      engineMinimal.unlock();
      engineMinimal.play('sizzle');
      engineMinimal.play('milestone');
    }).not.toThrow();
    expect(envMinimal.contexts[0].oscillators.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Suite 4: Noise Buffer Caching & Filtered Noise Textures
// ============================================================================

describe('Suite 4: Noise Buffer Caching & Filtered Noise Textures', () => {
  it('allocates white and pink AudioBuffers at most once per AudioContext, filters every noise layer safely, and recreates after close', () => {
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.unlock();

    let now = 50_000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 1000;
      return now;
    });

    const noiseSfx: SfxName[] = [
      'sizzle',
      'sheet_open',
      'sheet_close',
      'unlock',
      'instant_cook',
      'boost',
      'box',
      'city_flight',
    ];
    for (let round = 0; round < 3; round++) {
      for (const sfx of noiseSfx) {
        engine.play(sfx);
      }
      env.contexts[0].triggerAllVoiceEnded();
    }

    const ctx1 = env.contexts[0];
    // Excluding the 1-sample silent unlock buffer, exactly 2 noise buffers (white + pink) exist
    const noiseBuffers = ctx1.buffers.filter((b) => b.length > 1);
    expect(noiseBuffers).toHaveLength(2);

    const [whiteBuf, pinkBuf] = noiseBuffers;
    const white = whiteBuf.getChannelData(0);
    const pink = pinkBuf.getChannelData(0);

    const inspectBuffer = (samples: Float32Array) => {
      let peak = 0;
      let sum = 0;
      let energy = 0;
      let lag1 = 0;
      let nonFiniteCount = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = samples[i];
        if (!Number.isFinite(v)) {
          nonFiniteCount += 1;
          continue;
        }
        const abs = Math.abs(v);
        if (abs > peak) peak = abs;
        sum += v;
        energy += v * v;
        if (i > 0) lag1 += v * samples[i - 1];
      }
      return {
        nonFiniteCount,
        peak,
        mean: Math.abs(sum / samples.length),
        autocorr1: energy > 0 ? lag1 / energy : 0,
      };
    };

    const whiteStats = inspectBuffer(white);
    const pinkStats = inspectBuffer(pink);
    expect(whiteStats.nonFiniteCount).toBe(0);
    expect(pinkStats.nonFiniteCount).toBe(0);
    expect(whiteStats.peak).toBeGreaterThan(0.5);
    expect(whiteStats.peak).toBeLessThanOrEqual(0.95);
    expect(whiteStats.mean).toBeLessThan(0.01);
    expect(pinkStats.peak).toBeGreaterThan(0.5);
    expect(pinkStats.peak).toBeLessThanOrEqual(0.95);
    expect(pinkStats.mean).toBeLessThan(0.01);
    // Paul Kellet pink noise has strong positive lag-1 autocorrelation compared to white noise
    expect(pinkStats.autocorr1).toBeGreaterThan(whiteStats.autocorr1 + 0.4);

    // Every noise AudioBufferSourceNode routes through a BiquadFilterNode with Nyquist-safe cutoff
    const sfxBusGain = ctx1.gains[0];
    const noiseSources = ctx1.bufferSources.filter((s) => s.buffer && s.buffer.length > 1);
    expect(noiseSources.length).toBeGreaterThan(0);
    for (const src of noiseSources) {
      expect(src.allConnectedTargets[0]?.kind).toBe('biquadFilter');
      const filter = src.allConnectedTargets[0] as MockBiquadFilterNode;
      expect(['bandpass', 'highpass', 'lowpass']).toContain(filter.type);
      for (const ev of filter.frequency.events) {
        if (ev.value !== undefined) {
          expect(ev.value).toBeGreaterThanOrEqual(40);
          expect(ev.value).toBeLessThanOrEqual(ctx1.sampleRate * 0.45);
        }
      }
      expect(reaches(src, sfxBusGain)).toBe(true);
    }

    // External close -> recovery creates a new context with fresh buffers
    ctx1.state = 'closed';
    engine.play('sizzle');
    expect(env.contexts).toHaveLength(2);
    const ctx2NoiseBuffers = env.contexts[1].buffers.filter((b) => b.length > 1);
    expect(ctx2NoiseBuffers).toHaveLength(2);
    expect(ctx2NoiseBuffers[0]).not.toBe(whiteBuf);
  });
});

// ============================================================================
// Suite 5: 21-SFX Distinctness, Zero Raw Sawtooth, Rising Pentatonic & Coin Jitter
// ============================================================================

describe('Suite 5: 21-SFX Distinctness, Zero Raw Sawtooth, Pentatonic Combo & Coin Jitter', () => {
  it('spawns >=1 voice for all 21 SFX with zero sawtooth/square oscillators and 21 unique fingerprints', () => {
    const fingerprints = new Set<string>();

    for (const sfx of ALL_SFX_NAMES) {
      vi.unstubAllGlobals();
      const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
      const engine = createEngine();
      engine.setAmbientEnabled(false);
      engine.unlock();

      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      engine.play(sfx, { pitchJitter: 1 });

      const ctx = env.contexts[0];
      const noiseSources = ctx.bufferSources.filter((s) => s.buffer && s.buffer.length > 1);
      expect(ctx.oscillators.length + noiseSources.length).toBeGreaterThan(0);

      for (const osc of ctx.oscillators) {
        expect(osc.type === 'sine' || osc.type === 'triangle').toBe(true);
        expect(osc.type).not.toBe('sawtooth');
        expect(osc.type).not.toBe('square');
      }

      const oscSig = ctx.oscillators
        .map(
          (o) =>
            `${o.type}:${Math.round(o.frequency.firstValue() ?? 0)}->${Math.round(o.frequency.lastValue() ?? 0)}@${Math.round((o.startedAt ?? 0) * 1000)}`,
        )
        .join(',');
      const noiseSig = noiseSources
        .map((s) => {
          const f = s.allConnectedTargets[0] as MockBiquadFilterNode | undefined;
          return `${s.buffer?.length}:${f?.type}:${Math.round(f?.frequency.firstValue() ?? 0)}`;
        })
        .join(',');
      const fp = `${oscSig}|${noiseSig}`;
      expect(fingerprints.has(fp)).toBe(false);
      fingerprints.add(fp);

      engine.dispose();
    }

    expect(fingerprints.size).toBe(21);
  });

  it('produces strictly monotonic major pentatonic upgrade combo (0..24), clamps >24, and layers sparkle overtones', () => {
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    engine.unlock();

    let now = 20_000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 100;
      return now;
    });

    const ctx = env.contexts[0];
    const fundamentals: number[] = [];
    const toneCounts: number[] = [];
    const noiseCounts: number[] = [];

    for (let combo = 0; combo <= 24; combo++) {
      const oscStart = ctx.oscillators.length;
      const noiseStart = ctx.bufferSources.length;
      engine.play('upgrade', { combo, pitchJitter: 1 });
      const addedOscs = ctx.oscillators.slice(oscStart);
      const addedNoise = ctx.bufferSources.slice(noiseStart);
      expect(addedOscs.length).toBeGreaterThanOrEqual(2);
      const fund = addedOscs[0].frequency.firstValue()!;
      fundamentals.push(fund);
      toneCounts.push(addedOscs.length);
      noiseCounts.push(addedNoise.length);
      ctx.triggerAllVoiceEnded();
    }

    // Strictly monotonic across 0..24 and well under 10 kHz
    for (let i = 0; i < fundamentals.length; i++) {
      const expectedSemi = Math.floor(i / 5) * 12 + PENTATONIC_SEMITONES[i % 5];
      const expectedHz = 220 * Math.pow(2, expectedSemi / 12);
      expect(fundamentals[i]).toBeCloseTo(expectedHz, 2);
      expect(fundamentals[i]).toBeLessThan(10_000);
      if (i > 0) {
        expect(fundamentals[i]).toBeGreaterThan(fundamentals[i - 1]);
      }
    }

    // Progressive sparkle layers activate at step >= 6 (crystal tone) and step >= 10 (airy highpass shimmer)
    expect(toneCounts[6]).toBeGreaterThan(toneCounts[0]);
    expect(noiseCounts[10]).toBeGreaterThan(noiseCounts[0]);

    // Clamps combo = 30 identically to combo = 24
    const oscStart30 = ctx.oscillators.length;
    engine.play('upgrade', { combo: 30, pitchJitter: 1 });
    const fund30 = ctx.oscillators[oscStart30].frequency.firstValue()!;
    expect(fund30).toBeCloseTo(fundamentals[24], 2);
  });

  it('applies natural +/-3.5% live pitch jitter on coin and honors explicit pitchJitter override deterministically', () => {
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    engine.unlock();
    const ctx = env.contexts[0];

    let now = 30_000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 200;
      return now;
    });

    const randomSpy = vi.spyOn(Math, 'random');

    const playAndReadFreq = (randVal: number, override?: number): number => {
      randomSpy.mockReturnValue(randVal);
      const before = ctx.oscillators.length;
      engine.play('coin', override !== undefined ? { pitchJitter: override } : undefined);
      const freq = ctx.oscillators[before].frequency.firstValue()!;
      ctx.triggerAllVoiceEnded();
      return freq;
    };

    const low = playAndReadFreq(0.0);
    const mid = playAndReadFreq(0.5);
    const high = playAndReadFreq(1.0);

    expect(low).toBeCloseTo(mid * 0.965, 2);
    expect(high).toBeCloseTo(mid * 1.035, 2);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);

    // Explicit pitchJitter overrides Math.random deterministically
    const overrideA = playAndReadFreq(0.0, 1.15);
    const overrideB = playAndReadFreq(1.0, 1.15);
    expect(overrideA).toBeCloseTo(mid * 1.15, 2);
    expect(overrideB).toBeCloseTo(overrideA, 5);
  });
});

// ============================================================================
// Suite 6: Cooldowns, Backwards-Clock Immunity, Polyphony Cap & Lifecycle Isolation
// ============================================================================

describe('Suite 6: Cooldowns, Backwards-Clock Immunity, Polyphony Cap & Lifecycle Isolation', () => {
  it('enforces per-SFX cooldowns, keeps upgrade <55ms for hold-action, and handles backwards clock jumps cleanly', () => {
    expect(SFX_COOLDOWN_MS.upgrade).toBeDefined();
    expect(SFX_COOLDOWN_MS.upgrade!).toBeLessThan(55);

    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    engine.unlock();
    const ctx = env.contexts[0];

    let now = 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    // First coin plays, second coin within 90ms drops, unrelated sizzle still plays (per-SFX)
    engine.play('coin');
    expect(engine.getStateSummary().activeVoices).toBe(1);
    now += 40;
    engine.play('coin');
    expect(engine.getStateSummary().activeVoices).toBe(1);
    engine.play('sizzle');
    expect(engine.getStateSummary().activeVoices).toBe(2);

    // After 90ms passes, coin plays again
    now += 60;
    engine.play('coin');
    expect(engine.getStateSummary().activeVoices).toBe(3);

    // Hold-upgrade at 55ms cadence succeeds every step
    engine.play('upgrade', { combo: 0 });
    expect(engine.getStateSummary().activeVoices).toBe(4);
    now += 55;
    engine.play('upgrade', { combo: 1 });
    expect(engine.getStateSummary().activeVoices).toBe(5);

    // Backwards clock jump (100_155 -> 50_000) immediately allows playback instead of jamming
    now = 50_000;
    engine.play('coin');
    expect(engine.getStateSummary().activeVoices).toBe(6);

    // Celebratory unthrottled SFX never drop within same ms
    const beforeUnlock = engine.getStateSummary().activeVoices;
    engine.play('unlock');
    engine.play('unlock');
    expect(engine.getStateSummary().activeVoices).toBe(beforeUnlock + 2);
    ctx.triggerAllVoiceEnded();
    expect(engine.getStateSummary().activeVoices).toBe(0);
  });

  it('tracks both oscillator and noise buffer sources per logical voice, caps at 24 voices, and recovers via resetIfClosed() BEFORE cap', () => {
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    engine.unlock();
    const ctx1 = env.contexts[0];

    // Sizzle has both tone oscillators AND noise buffer sources: must wait for BOTH to end
    engine.play('sizzle');
    expect(engine.getStateSummary().activeVoices).toBe(1);
    for (const osc of ctx1.oscillators) osc.triggerEnded();
    // Noise buffer sources haven't ended yet -> logical voice still active!
    expect(engine.getStateSummary().activeVoices).toBe(1);
    for (const src of ctx1.bufferSources) {
      if (src.buffer && src.buffer.length > 1) src.triggerEnded();
    }
    expect(engine.getStateSummary().activeVoices).toBe(0);

    // Fill activeVoices all the way to MAX_CONCURRENT_VOICES (24) using tap (with LOD trimming optional overtones >= 44)
    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 100;
      return now;
    });
    for (let i = 0; i < 35; i++) {
      engine.play('tap');
    }
    expect(engine.getStateSummary().activeVoices).toBe(MAX_CONCURRENT_VOICES);

    // External context close while saturated at 24 voices:
    // 1. Read-only getStateSummary() immediately reports closed & 0 activeVoices
    ctx1.state = 'closed';
    expect(engine.getStateSummary().contextState).toBe('closed');
    expect(engine.getStateSummary().activeVoices).toBe(0);

    // 2. Next play() executes resetIfClosed() BEFORE polyphony cap check and recovers on Context #2
    engine.play('tap');
    expect(env.contexts).toHaveLength(2);
    expect(engine.getStateSummary().contextState).toBe('running');
    expect(engine.getStateSummary().activeVoices).toBe(1);

    // 3. Stale onended from Context #1 MUST NOT decrement Context #2's activeVoices (contextGeneration isolation)
    ctx1.triggerAllVoiceEnded();
    expect(engine.getStateSummary().activeVoices).toBe(1);

    env.contexts[1].triggerAllVoiceEnded();
    expect(engine.getStateSummary().activeVoices).toBe(0);
  });

  it('handles split try/catch disconnect errors, throwing start() rollback, and synchronous onended without leaking voices', () => {
    // 1. Throwing osc.disconnect() still disconnects downstream gain & decrements activeVoices
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    engine.unlock();
    const ctx = env.contexts[0];

    engine.play('customer_happy');
    expect(engine.getStateSummary().activeVoices).toBe(1);
    const oscs = [...ctx.oscillators];
    oscs[0].throwOnDisconnect = true;
    const downstreamGain = oscs[0].allConnectedTargets[0];
    expect(downstreamGain.kind).toBe('gain');
    for (const osc of oscs) osc.triggerEnded();
    expect(downstreamGain.disconnected).toBe(true);
    expect(engine.getStateSummary().activeVoices).toBe(0);

    // 2. Throwing osc.start() on all layers rolls back activeVoices cleanly to 0
    ctx.throwNextOscStart = true;
    const beforeCount = ctx.oscillators.length;
    // Play a single-oscillator fallback or check partial throw rollback
    let now = 50_000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 300;
      return now;
    });
    engine.play('customer_happy'); // osc 0 throws on start, osc 1 & 2 succeed
    const newOscs = ctx.oscillators.slice(beforeCount);
    expect(newOscs[0].startedAt).toBeNull();
    expect(engine.getStateSummary().activeVoices).toBe(1);
    // Ending only the started oscs (1 & 2) releases the logical voice cleanly!
    for (let i = 1; i < newOscs.length; i++) newOscs[i].triggerEnded();
    expect(engine.getStateSummary().activeVoices).toBe(0);

    // 3. Synchronous onended firing INSIDE osc.start() releases logical voice once without underflow
    ctx.syncEndOscillators = true;
    engine.play('customer_happy');
    expect(engine.getStateSummary().activeVoices).toBe(0);
  });

  it('enforces the 64 active source-node ceiling and sheds optional layers at >=44 nodes under multi-voice fanfare flood', () => {
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    engine.unlock();
    const ctx = env.contexts[0];

    for (let i = 0; i < 30; i++) {
      engine.play('milestone');
    }

    const totalStartedNoise = ctx.bufferSources.filter(
      (s) => s.buffer && s.buffer.length > 1 && s.startedAt !== null,
    ).length;
    const totalStartedOscs = ctx.oscillators.filter((o) => o.startedAt !== null).length;
    expect(totalStartedOscs + totalStartedNoise).toBeLessThanOrEqual(64);
    // 5 full 10-node milestones (50 nodes) + 3 LOD-trimmed 5-node milestones (capped at 64) = 8 voices
    expect(engine.getStateSummary().activeVoices).toBe(8);
    expect(engine.getStateSummary().activeVoices).toBeLessThanOrEqual(MAX_CONCURRENT_VOICES);

    ctx.triggerAllVoiceEnded();
    expect(engine.getStateSummary().activeVoices).toBe(0);
  });
});

// ============================================================================
// Suite 7: Pre-Unlock Protection, Capture Gesture Unlock & Async W3C Races
// ============================================================================

describe('Suite 7: Pre-Unlock Protection, Capture Gesture Unlock & Async W3C Races', () => {
  it('blocks background sim ticks when suspended pre-unlock without burning cooldowns or spamming resume()', () => {
    const env = installMockAudioEnv({
      contextOptions: { initialState: 'suspended', autoTransitionOnResume: false },
    });
    const engine = createEngine();

    // Background 30Hz simulation fires SFX before any user gesture
    engine.play('sizzle');
    engine.play('order');
    engine.play('coin');
    engine.play('customer_happy');

    expect(env.contexts).toHaveLength(1);
    const ctx = env.contexts[0];
    expect(ctx.resumeCalls).toBe(0);
    expect(ctx.oscillators).toHaveLength(0);
    expect(ctx.bufferSources).toHaveLength(0);
    expect(engine.getStateSummary().activeVoices).toBe(0);
    expect(engine.getStateSummary().unlocked).toBe(false);
    expect(engine.getStateSummary().contextState).toBe('suspended');

    // Now user unlocks and immediately plays 'coin' at same timestamp (cooldown was NOT poisoned!)
    engine.unlock();
    expect(ctx.resumeCalls).toBe(1);
    // 1-sample silent buffer was played
    expect(ctx.buffers.some((b) => b.length === 1 && b.sampleRate === 22050)).toBe(true);

    // Synchronous play right after unlock() while resume() is STILL pending works AND does NOT double-call resume()!
    engine.play('coin');
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    expect(engine.getStateSummary().activeVoices).toBe(1);
    expect(engine.getStateSummary().unlocked).toBe(true);

    // Even if resume() hangs indefinitely, pre-running scheduling caps at 2 triggers (never queues 24 voices)
    engine.play('unlock');
    for (let i = 0; i < 20; i++) {
      engine.play('unlock');
    }
    expect(engine.getStateSummary().activeVoices).toBe(2);
  });

  it('auto-unlocks via capture-phase window pointerdown listener, detaches once running, and cleans up on dispose()', async () => {
    const env = installMockAudioEnv({
      contextOptions: { initialState: 'suspended', autoTransitionOnResume: true },
    });
    const engine = createEngine();
    expect(env.totalListenerCount()).toBe(3); // pointerdown, touchstart, keydown

    // Simulate real browser capture pointerdown followed by bubble click calling play('boost')
    env.dispatchWindowEvent('pointerdown');
    await flushMicrotasks();

    expect(env.contexts).toHaveLength(1);
    expect(engine.getStateSummary().unlocked).toBe(true);
    expect(engine.getStateSummary().contextState).toBe('running');
    // Listeners detach automatically once silentBufferUnlocked && running
    expect(env.totalListenerCount()).toBe(0);

    engine.play('boost');
    expect(engine.getStateSummary().activeVoices).toBe(1);

    // External close re-arms capture listeners for future recovery
    env.contexts[0].state = 'closed';
    engine.play('tap'); // resets closed ctx -> re-arms listeners & creates suspended ctx #2
    expect(env.totalListenerCount()).toBe(3);

    engine.dispose();
    expect(env.totalListenerCount()).toBe(0);
  });

  it('guards unlock() while paused, supports iOS interrupted symmetry, and recovers via setEnabled(true) post-pause', async () => {
    const env = installMockAudioEnv({
      contextOptions: { initialState: 'suspended', autoTransitionOnResume: true },
    });
    const engine = createEngine();

    // Paused unlock() is a complete no-op
    engine.setPaused(true);
    engine.unlock();
    expect(env.contexts).toHaveLength(0);
    expect(engine.getStateSummary().unlocked).toBe(false);

    // Unpause -> unlock -> running
    engine.setPaused(false);
    engine.unlock();
    await flushMicrotasks();
    const ctx = env.contexts[0];
    expect(ctx.state).toBe('running');

    // iOS 'interrupted' state symmetry on setPaused(false)
    ctx.state = 'interrupted';
    engine.setPaused(true);
    engine.setPaused(false);
    await flushMicrotasks();
    expect(ctx.state).toBe('running');

    // setPaused(true) -> setEnabled(false) -> setPaused(false) -> setEnabled(true) resumes cleanly!
    engine.setPaused(true);
    await flushMicrotasks();
    expect(ctx.state).toBe('suspended');
    engine.setEnabled(false);
    engine.setPaused(false);
    await flushMicrotasks();
    expect(ctx.state).toBe('suspended'); // stays suspended while disabled
    engine.setEnabled(true);
    await flushMicrotasks();
    expect(ctx.state).toBe('running');
  });

  it('reconciles async W3C suspend()/resume() settlement races and swallows rejections & hostile dispose()', async () => {
    const env = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        autoTransitionOnSuspend: false,
        autoTransitionOnResume: false,
      },
    });
    const engine = createEngine();
    engine.unlock();
    const ctx = env.contexts[0];

    // Race A: setPaused(true) -> pending suspend -> setPaused(false) -> suspend resolves -> auto-calls resume()
    engine.setPaused(true);
    expect(ctx.suspendCalls).toBe(1);
    engine.setPaused(false);
    ctx.resolveNextSuspend('suspended');
    await flushMicrotasks();
    expect(ctx.resumeCalls).toBe(1);

    // Race B: pending resume -> setPaused(true) -> resume resolves ('running') -> auto-calls suspend()
    engine.setPaused(true);
    ctx.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctx.suspendCalls).toBe(2);

    // Race C: rejected resume clears unlocked when context stays suspended, with zero unhandled rejections
    vi.unstubAllGlobals();
    const envRej = installMockAudioEnv({
      contextOptions: { initialState: 'suspended', autoTransitionOnResume: false },
    });
    const engineRej = createEngine();
    engineRej.unlock();
    envRej.contexts[0].rejectNextResume();
    await flushMicrotasks();
    expect(engineRej.getStateSummary().unlocked).toBe(false);
    engineRej.play('tap');
    expect(envRej.contexts[0].oscillators).toHaveLength(0);

    // Hostile dispose(): throwing ctx.state getter & throwing ctx.close() never throw
    envRej.contexts[0].throwOnStateRead = true;
    envRej.contexts[0].throwOnClose = true;
    expect(() => {
      engineRej.dispose();
      engineRej.dispose();
    }).not.toThrow();
  });
});

// ============================================================================
// Suite 8: Cozy Bistro Ambient Loop & Overlap-Safe Fanfare Ducking
// ============================================================================

describe('Suite 8: Cozy Bistro Ambient Loop & Overlap-Safe Fanfare Ducking', () => {
  it('starts cozy sine/triangle bistro notes only after unlock, enforces voice cap, stops cleanly on toggles/interrupted, and clears all timers on dispose()', async () => {
    vi.useFakeTimers();
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();

    // Before unlock: advancing 15s schedules zero ambient voices
    vi.advanceTimersByTime(15_000);
    expect(env.contexts).toHaveLength(0);

    // Unlock starts ambient loop
    engine.unlock();
    const ctx = env.contexts[0];
    const ambientBusGain = ctx.gains[1];
    expect(vi.getTimerCount()).toBe(1);

    // Advance timers + audio clock so multiple bars play
    for (let i = 0; i < 6; i++) {
      ctx.currentTime += 0.35;
      vi.advanceTimersByTime(200);
    }

    expect(ctx.oscillators.length).toBeGreaterThan(0);
    // Strictly warm sine/triangle waves routed through ambientBusGain
    for (const osc of ctx.oscillators) {
      expect(osc.type === 'sine' || osc.type === 'triangle').toBe(true);
      expect(reaches(osc, ambientBusGain)).toBe(true);
    }
    // Never exceeds MAX_AMBIENT_VOICES live concurrently without onended
    expect(ctx.oscillators.length).toBeLessThanOrEqual(MAX_AMBIENT_VOICES);

    // Toggling off stops active ambient voices and clears scheduler timer
    engine.setAmbientEnabled(false);
    expect(vi.getTimerCount()).toBe(0);
    const countAfterDisable = ctx.oscillators.length;
    ctx.currentTime += 2.0;
    vi.advanceTimersByTime(5_000);
    expect(ctx.oscillators.length).toBe(countAfterDisable);

    // Re-enabling resumes loop; setPaused(true) stops; setPaused(false) resumes once resume() settles
    engine.setAmbientEnabled(true);
    expect(vi.getTimerCount()).toBe(1);
    engine.setPaused(true);
    expect(vi.getTimerCount()).toBe(0);
    engine.setPaused(false);
    await flushMicrotasks();
    expect(vi.getTimerCount()).toBe(1);

    // Setting ambientVolume(0) stops; setting >0 restarts; iOS 'interrupted' self-terminates cleanly on next tick
    engine.setAmbientVolume(0);
    expect(vi.getTimerCount()).toBe(0);
    engine.setAmbientVolume(0.4);
    expect(vi.getTimerCount()).toBe(1);

    ctx.state = 'interrupted';
    vi.advanceTimersByTime(200);
    expect(vi.getTimerCount()).toBe(0);

    // dispose() leaves zero active timers
    engine.dispose();
    expect(vi.getTimerCount()).toBe(0);
    const countAfterDispose = ctx.oscillators.length;
    vi.advanceTimersByTime(30_000);
    expect(ctx.oscillators.length).toBe(countAfterDispose);
  });

  it('ducks ambientBusGain on all 6 fanfares, ignores normal SFX, extends overlapping fanfares, and preserves mid-duck setAmbientVolume()', () => {
    vi.useFakeTimers();
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.setAmbientVolume(0.4);
    engine.unlock();
    const ctx = env.contexts[0];
    const ambientBusGain = ctx.gains[1];
    ctx.currentTime = 1.0;

    // Normal SFX must NOT trigger ambient ducking
    const eventsBeforeNormal = ambientBusGain.gain.events.length;
    engine.play('tap');
    engine.play('coin');
    engine.play('sizzle');
    expect(ambientBusGain.gain.events.length).toBe(eventsBeforeNormal);
    ctx.triggerAllVoiceEnded();

    // Every one of the 6 fanfares triggers ducking to DUCK_FACTOR * ambientVolume and recovers to ambientVolume
    expect(FANFARE_SFX.size).toBe(6);
    for (const fanfare of FANFARE_SFX) {
      ctx.currentTime += 5.0;
      vi.advanceTimersByTime(5_000);
      const beforeEvents = ambientBusGain.gain.events.length;
      engine.play(fanfare);
      const added = ambientBusGain.gain.events.slice(beforeEvents);
      const rampValues = added.filter((e) => e.value !== undefined).map((e) => e.value!);
      expect(rampValues.some((v) => Math.abs(v - 0.4 * DUCK_FACTOR) < 1e-4)).toBe(true);
      expect(rampValues[rampValues.length - 1]).toBeCloseTo(0.4, 4);
      ctx.triggerAllVoiceEnded();
    }

    // Overlapping fanfares: renovate (hold 0.68s) then shorter divine (hold 0.52s) shortly after
    // -> duckUntil MUST stay monotonic (never shortened), and a later fanfare extends it
    ctx.currentTime += 5.0;
    vi.advanceTimersByTime(5_000);
    const evStartOverlap = ambientBusGain.gain.events.length;
    engine.play('renovate');
    const firstReleaseTime =
      ambientBusGain.gain.events[ambientBusGain.gain.events.length - 1].time;

    ctx.currentTime += 0.05;
    vi.advanceTimersByTime(50);
    engine.play('divine');
    const secondReleaseTime =
      ambientBusGain.gain.events[ambientBusGain.gain.events.length - 1].time;
    expect(secondReleaseTime).toBeGreaterThanOrEqual(firstReleaseTime);

    ctx.currentTime += 0.4;
    vi.advanceTimersByTime(400);
    engine.play('city_flight');
    const thirdReleaseTime =
      ambientBusGain.gain.events[ambientBusGain.gain.events.length - 1].time;
    expect(thirdReleaseTime).toBeGreaterThan(secondReleaseTime);
    expect(ambientBusGain.gain.events.length).toBeGreaterThan(evStartOverlap);

    // Mid-duck setAmbientVolume(0.8) scales duck hold to 0.8 * 0.25 = 0.20 and swells to 0.80 without breaking duck!
    ctx.currentTime += 0.1;
    vi.advanceTimersByTime(100);
    const beforeVolChange = ambientBusGain.gain.events.length;
    engine.setAmbientVolume(0.8);
    const volEvents = ambientBusGain.gain.events.slice(beforeVolChange);
    const volValues = volEvents.filter((e) => e.value !== undefined).map((e) => e.value!);
    expect(volValues.some((v) => Math.abs(v - 0.8 * DUCK_FACTOR) < 1e-4)).toBe(true);
    expect(volValues[volValues.length - 1]).toBeCloseTo(0.8, 4);
    expect(volEvents[volEvents.length - 1].time).toBeCloseTo(thirdReleaseTime, 4);
  });
});

// ============================================================================
// Suite 9: renderOfflineSample (Node Analytical Fallback & Mocked OfflineAudioContext)
// ============================================================================

describe('Suite 9: renderOfflineSample (Node Fallback & Mocked OfflineAudioContext)', () => {
  it('renders all 21 SFX deterministically in Node fallback with genuine synthesis, unity gain, and safe adversarial clamping', async () => {
    expect(typeof window).toBe('undefined');
    const engine = createEngine();
    // Mutating live state (muted / paused / zero volume) MUST NOT affect renderOfflineSample
    engine.setEnabled(false);
    engine.setPaused(true);
    engine.setSfxVolume(0);

    const uniqueSignatures = new Set<string>();
    const results: Record<string, OfflineAudioSampleResult> = {};

    for (const sfx of ALL_SFX_NAMES) {
      const r1 = await engine.renderOfflineSample(sfx);
      const r2 = await engine.renderOfflineSample(sfx);
      expect(r1.finite).toBe(true);
      expect(r1.peak).toBeGreaterThan(0.01);
      expect(r1.peak).toBeLessThanOrEqual(1.0);
      expect(r1.rms).toBeGreaterThan(0);
      expect(r1.rms).toBeLessThanOrEqual(r1.peak);
      // Bit-identical determinism across repeated calls (even for noise-led sizzle & coin)
      expect(r2).toEqual(r1);
      results[sfx] = r1;
      uniqueSignatures.add(`${r1.peak.toFixed(5)}:${r1.rms.toFixed(5)}`);
    }

    // Genuine synthesis produces a wide spread of distinct peak/rms measurements (never hardcoded constants)
    expect(uniqueSignatures.size).toBeGreaterThanOrEqual(18);
    expect(engine.getStateSummary().activeVoices).toBe(0);

    // Shorter vs longer explicit durationSec dilutes RMS proportionally
    const shortTap = await engine.renderOfflineSample('tap', 0.2);
    const longTap = await engine.renderOfflineSample('tap', 1.0);
    expect(shortTap.finite && longTap.finite).toBe(true);
    expect(longTap.rms).toBeLessThan(shortTap.rms);

    // Adversarial durations never throw or OOM
    for (const badDur of [undefined, 0, -1, 0.001, 999, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const res = await engine.renderOfflineSample('sizzle', badDur);
      expect(res.finite).toBe(true);
      expect(res.peak).toBeGreaterThan(0.01);
      expect(res.peak).toBeLessThanOrEqual(1.0);
    }

    // Optional 3rd arg SfxPlayOptions works accurately
    const zeroInt = await engine.renderOfflineSample('coin', 0.3, { intensity: 0 });
    expect(zeroInt).toEqual({ peak: 0, rms: 0, finite: true });

    const halfInt = await engine.renderOfflineSample('coin', 0.3, { intensity: 0.5 });
    const fullInt = await engine.renderOfflineSample('coin', 0.3, { intensity: 1.0 });
    expect(halfInt.peak).toBeLessThan(fullInt.peak);

    const combo0 = await engine.renderOfflineSample('upgrade', 0.3, { combo: 0 });
    const combo12 = await engine.renderOfflineSample('upgrade', 0.3, { combo: 12 });
    expect(combo12.rms).not.toBe(combo0.rms);

    const pitched = await engine.renderOfflineSample('coin', 0.3, { pitchJitter: 1.15 });
    expect(pitched.finite).toBe(true);
    expect(pitched.rms).not.toBe(fullInt.rms);

    // Verify recipe sanity helper directly: zero sawtooth/square across all 21 recipes
    for (const sfx of ALL_SFX_NAMES) {
      const recipe = buildSfxRecipe(sfx, 12, 1);
      for (const tone of recipe.tones) {
        expect(tone.type === 'sine' || tone.type === 'triangle').toBe(true);
      }
    }
  });

  it('uses globalThis.OfflineAudioContext (without window) and window.OfflineAudioContext, builds shared bus, falls back on throw, and reports NaN honestly', async () => {
    // 1. globalThis.OfflineAudioContext while window === undefined
    const globalOfflineContexts: MockOfflineAudioContext[] = [];
    vi.stubGlobal(
      'OfflineAudioContext',
      function GlobalOfflineFactory(channels: number, length: number, sampleRate: number) {
        const ctx = new MockOfflineAudioContext(channels, length, sampleRate);
        globalOfflineContexts.push(ctx);
        return ctx;
      },
    );

    const engine = createEngine();
    const resGlobal = await engine.renderOfflineSample('sizzle', 0.5);
    expect(globalOfflineContexts).toHaveLength(1);
    expect(globalOfflineContexts[0].sampleRate).toBe(44100);
    expect(globalOfflineContexts[0].compressors).toHaveLength(1);
    expect(globalOfflineContexts[0].filters.length).toBeGreaterThan(0);
    expect(resGlobal.finite).toBe(true);
    expect(resGlobal.peak).toBeGreaterThan(0.01);
    expect(resGlobal.peak).toBeLessThanOrEqual(1.0);

    // Verify shared master bus topology on OfflineAudioContext
    const [offSfxBus, , offMaster] = globalOfflineContexts[0].gains;
    const offComp = globalOfflineContexts[0].compressors[0];
    expect(reaches(offSfxBus, offMaster)).toBe(true);
    expect(reaches(offMaster, offComp)).toBe(true);
    expect(reaches(offComp, globalOfflineContexts[0].destination)).toBe(true);

    vi.unstubAllGlobals();

    // 2. window.webkitOfflineAudioContext lookup
    const envWebkit = installMockAudioEnv({
      useWebkitPrefix: true,
      includeOfflineOnWindow: true,
    });
    const resWebkit = await engine.renderOfflineSample('milestone');
    expect(envWebkit.offlineContexts).toHaveLength(1);
    expect(resWebkit.finite).toBe(true);
    expect(resWebkit.peak).toBeGreaterThan(0.01);

    vi.unstubAllGlobals();

    // 3. startRendering() throw falls back cleanly to deterministic analytical PCM
    installMockAudioEnv({
      includeOfflineOnWindow: true,
      offlineOptions: { rejectWith: new Error('OfflineAudioContext blocked') },
    });
    const resFallback = await engine.renderOfflineSample('renovate');
    expect(resFallback.finite).toBe(true);
    expect(resFallback.peak).toBeGreaterThan(0.01);
    expect(resFallback.peak).toBeLessThanOrEqual(1.0);

    vi.unstubAllGlobals();

    // 4. NaN sample in rendered OfflineAudioContext buffer honestly reports finite: false
    installMockAudioEnv({
      includeOfflineOnWindow: true,
      offlineOptions: { injectNaN: true },
    });
    const resNaN = await engine.renderOfflineSample('coin');
    expect(resNaN.finite).toBe(false);
  });
});

// ============================================================================
// Suite 10: Adversarial Lifecycle, DSP & Defensive Regressions (BUG-1..BUG-16 + Polish)
// ============================================================================

describe('Suite 10: Adversarial Lifecycle, DSP & Defensive Regressions', () => {
  it('BUG-1: sync throw from ctx.resume() inside unlock() does not poison unlocked or spam resume()', async () => {
    const env = installMockAudioEnv({
      contextOptions: {
        initialState: 'suspended',
        throwSyncOnResume: true,
        autoTransitionOnResume: true,
      },
    });
    const engine = createEngine();

    expect(() => engine.unlock()).not.toThrow();
    const ctx = env.contexts[0];
    expect(ctx.resumeCalls).toBe(1);
    expect(engine.getStateSummary().unlocked).toBe(false);
    expect(engine.getStateSummary().contextState).toBe('suspended');
    // Must NOT have played the 1-sample silent buffer or detached listeners
    expect(ctx.buffers.filter((b) => b.length === 1)).toHaveLength(0);
    expect(env.totalListenerCount()).toBe(3);

    // 10 subsequent play() calls must NOT spam ctx.resume()
    for (let i = 0; i < 10; i++) {
      engine.play('unlock');
    }
    expect(ctx.resumeCalls).toBe(1);
    expect(engine.getStateSummary().activeVoices).toBe(0);

    // Once resume stops throwing on a later genuine gesture, unlock recovers cleanly
    ctx.throwSyncOnResume = false;
    engine.unlock();
    await flushMicrotasks();
    expect(ctx.resumeCalls).toBe(2);
    expect(ctx.buffers.filter((b) => b.length === 1)).toHaveLength(1);
    expect(engine.getStateSummary().unlocked).toBe(true);
    expect(engine.getStateSummary().contextState).toBe('running');
    expect(env.totalListenerCount()).toBe(0);
  });

  it('BUG-2: rejected ctx.resume() resets silentBufferUnlocked so subsequent gesture replays 1-sample silent buffer', async () => {
    const env = installMockAudioEnv({
      contextOptions: {
        initialState: 'suspended',
        autoTransitionOnResume: false,
      },
    });
    const engine = createEngine();

    // First unlock attempt plays 1-sample silent buffer while resume() is pending
    engine.unlock();
    const ctx = env.contexts[0];
    expect(ctx.buffers.filter((b) => b.length === 1)).toHaveLength(1);
    expect(engine.getStateSummary().unlocked).toBe(true);

    // Reject resume() -> must clear BOTH unlocked and silentBufferUnlocked
    ctx.rejectNextResume();
    await flushMicrotasks();
    expect(engine.getStateSummary().unlocked).toBe(false);
    expect(env.totalListenerCount()).toBe(3);

    // Genuine user gesture now unlocks and MUST replay the 1-sample silent buffer
    engine.unlock();
    expect(ctx.buffers.filter((b) => b.length === 1)).toHaveLength(2);
    ctx.resolveNextResume('running');
    await flushMicrotasks();
    expect(engine.getStateSummary().unlocked).toBe(true);
    expect(engine.getStateSummary().contextState).toBe('running');
    expect(env.totalListenerCount()).toBe(0);
  });

  it('BUG-3: overlapping resume() Promises ignore stale p1 rejection while newer p2 is in flight', async () => {
    vi.useFakeTimers();
    const env = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        autoTransitionOnSuspend: false,
        autoTransitionOnResume: false,
      },
    });
    const engine = createEngine();
    engine.unlock();
    const ctx = env.contexts[0];
    expect(engine.getStateSummary().unlocked).toBe(true);

    // External interruption -> unlock() launches p1 (seq=1)
    ctx.state = 'interrupted';
    engine.unlock();
    expect(ctx.pendingResumes).toHaveLength(1);

    // Before p1 settles, ctx briefly returns running -> pause -> unpause -> suspend resolves -> launches p2 (seq=2)
    ctx.state = 'running';
    engine.setPaused(true);
    engine.setPaused(false);
    ctx.resolveNextSuspend('suspended');
    await flushMicrotasks();
    expect(ctx.pendingResumes).toHaveLength(2);
    expect(ctx.resumeCalls).toBe(2);

    // Stale p1 rejects while p2 is still in flight -> MUST NOT clear unlocked or resumeInFlight!
    ctx.rejectNextResume();
    await flushMicrotasks();
    expect(engine.getStateSummary().unlocked).toBe(true);

    // Play while p2 is still in flight must NOT spawn a 3rd resume() because resumeInFlight stayed true
    engine.play('tap');
    expect(ctx.resumeCalls).toBe(2);

    // Newer p2 resolves to running cleanly and restarts ambient
    ctx.resolveNextResume('running');
    await flushMicrotasks();
    expect(engine.getStateSummary().unlocked).toBe(true);
    expect(engine.getStateSummary().contextState).toBe('running');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('BUG-4: total start() throw on fanfare SFX does NOT duck ambient loop or leak activeVoices', () => {
    vi.useFakeTimers();
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.setAmbientVolume(0.4);
    engine.unlock();
    const ctx = env.contexts[0];
    const ambientBusGain = ctx.gains[1];
    ctx.currentTime = 2.0;

    // Make every subsequent oscillator and noise buffer source throw inside start()
    ctx.throwAllStarts = true;
    const eventsBefore = ambientBusGain.gain.events.length;

    expect(() => engine.play('milestone')).not.toThrow();
    expect(engine.getStateSummary().activeVoices).toBe(0);
    expect(ambientBusGain.gain.events.length).toBe(eventsBefore);
  });

  it('BUG-5: throwing ctx.sampleRate getter and unexpected scheduler throws never crash play() or leak activeVoices', () => {
    const env = installMockAudioEnv({
      contextOptions: { initialState: 'running' },
    });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    engine.unlock();
    const ctx = env.contexts[0];

    // Hostile ctx.sampleRate getter throwing during play('sizzle') degrades to 44100 Hz cleanly
    ctx.throwOnSampleRateRead = true;
    expect(() => engine.play('sizzle')).not.toThrow();
    expect(engine.getStateSummary().activeVoices).toBe(1);
    ctx.triggerAllVoiceEnded();
    expect(engine.getStateSummary().activeVoices).toBe(0);

    // Unexpected throw from a hostile ctx.createOscillator getter on tone-only SFX releases activeVoices
    Object.defineProperty(ctx, 'createOscillator', {
      configurable: true,
      get() {
        throw new Error('Hostile createOscillator getter exploded');
      },
    });
    expect(() => engine.play('customer_happy')).not.toThrow();
    expect(engine.getStateSummary().activeVoices).toBe(0);

    // Unexpected throw escaping scheduleSfxRecipe (hostile createBufferSource getter) also releases via finally
    Object.defineProperty(ctx, 'createBufferSource', {
      configurable: true,
      get() {
        throw new Error('Hostile createBufferSource getter exploded');
      },
    });
    expect(() => engine.play('unlock')).not.toThrow();
    expect(engine.getStateSummary().activeVoices).toBe(0);
  });

  it('BUG-6: createAudioBusGraph() disconnects broken compressor and dangling masterGain edge when comp.connect() throws', () => {
    const env = installMockAudioEnv({
      contextOptions: { initialState: 'running', throwOnCompConnect: true },
    });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    expect(() => engine.unlock()).not.toThrow();

    const ctx = env.contexts[0];
    expect(ctx.compressors).toHaveLength(1);
    const brokenComp = ctx.compressors[0];
    const [sfxBusGain, ambientBusGain, masterGain] = ctx.gains;

    // Broken compressor must be disconnected and masterGain must ONLY connect to destination
    expect(brokenComp.disconnected).toBe(true);
    expect(masterGain.connections).toEqual([ctx.destination]);
    expect(sfxBusGain.connections).toEqual([masterGain]);
    expect(ambientBusGain.connections).toEqual([masterGain]);

    expect(() => engine.play('coin')).not.toThrow();
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    expect(reaches(ctx.oscillators[0], ctx.destination)).toBe(true);
  });

  it('BUG-7: hostile unknown runtime SfxName does not crash or leak voices in play() or renderOfflineSample()', async () => {
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    engine.unlock();
    const ctx = env.contexts[0];

    const badNames: SfxName[] = [
      'nonexistent' as unknown as SfxName,
      '__proto__' as unknown as SfxName,
      'toString' as unknown as SfxName,
      '' as unknown as SfxName,
      undefined as unknown as SfxName,
    ];

    for (const bad of badNames) {
      expect(() => engine.play(bad)).not.toThrow();
      expect(engine.getStateSummary().activeVoices).toBe(0);
      const offlineRes = await engine.renderOfflineSample(bad);
      expect(offlineRes).toEqual({ peak: 0, rms: 0, finite: true });
    }
    expect(ctx.oscillators).toHaveLength(0);
  });

  it('BUG-8: W3C minimum sampleRate = 3000 Hz triggers zero BiquadFilterNode RangeErrors across all 21 SFX', () => {
    const env = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        sampleRate: 3000,
        strictFilterNyquist: true,
      },
    });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    engine.unlock();
    const ctx = env.contexts[0];

    let now = 50_000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 1000;
      return now;
    });

    for (const sfx of ALL_SFX_NAMES) {
      expect(() => engine.play(sfx, { combo: 24, pitchJitter: 4 })).not.toThrow();
      ctx.triggerAllVoiceEnded();
    }

    expect(ctx.filters.length).toBeGreaterThan(0);
    expect(ctx.filterRangeErrors).toBe(0);
    for (const filter of ctx.filters) {
      for (const ev of filter.frequency.events) {
        if (ev.value !== undefined) {
          expect(ev.value).toBeGreaterThanOrEqual(40);
          expect(ev.value).toBeLessThanOrEqual(3000 * 0.45);
        }
      }
    }
  });

  it('BUG-9 & Polish: ambient recovers from backwards ctx.currentTime jump, stops eagerly on setAmbientVolume() when non-running, and post-dispose unlock() re-attaches listeners', () => {
    vi.useFakeTimers();
    const env = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engine = createEngine();
    engine.setAmbientVolume(0.4);
    engine.unlock();
    const ctx = env.contexts[0];

    // Advance ambient to t = 100.0s (saturate without ending old far-future voices)
    ctx.currentTime = 100.0;
    vi.advanceTimersByTime(200);
    const oscsBeforeJump = ctx.oscillators.length;
    expect(oscsBeforeJump).toBeGreaterThan(0);

    // Trigger a fanfare duck at t = 100.0, then jump ctx.currentTime backwards to 0.5s
    engine.play('milestone');
    const oscsAfterFanfare = ctx.oscillators.length;

    ctx.currentTime = 0.5;
    vi.advanceTimersByTime(200);
    // Ambient MUST re-anchor, clear stale far-future voices, and schedule new notes immediately!
    expect(ctx.oscillators.length).toBeGreaterThan(oscsAfterFanfare);
    const recoveredOsc = ctx.oscillators[oscsAfterFanfare];
    expect(recoveredOsc.startedAt).toBeCloseTo(0.56, 2);

    // Polish #1: external ctx.state transition -> setAmbientVolume() eagerly stops timer without waiting 160ms
    expect(vi.getTimerCount()).toBe(1);
    ctx.state = 'interrupted';
    engine.setAmbientVolume(0.6);
    expect(vi.getTimerCount()).toBe(0);

    // Polish #2: post-dispose unlock() onto a suspended context re-attaches capture gesture listeners
    engine.dispose();
    expect(env.totalListenerCount()).toBe(0);

    vi.unstubAllGlobals();
    const envSuspended = installMockAudioEnv({
      contextOptions: { initialState: 'suspended', autoTransitionOnResume: false },
    });
    engine.unlock();
    expect(envSuspended.contexts).toHaveLength(1);
    expect(envSuspended.totalListenerCount()).toBe(3);
  });

  it('DEFECT-2: overlapping p1/p2 resume() reconciles running state immediately when p1 fulfills and auto-suspends when paused while pending', async () => {
    vi.useFakeTimers();

    // Case A: Double unlock() (p1, p2) -> p1 fulfills to 'running' while p2 pending -> ambient starts & listeners detach immediately;
    // subsequent p2 rejection while already 'running' keeps ambient running & listeners detached.
    const envA = installMockAudioEnv({
      contextOptions: { initialState: 'suspended', autoTransitionOnResume: false },
    });
    const engineA = createEngine();
    engineA.setAmbientVolume(0.4);

    engineA.unlock(); // p1 (seq = 1)
    engineA.unlock(); // p2 (seq = 2)
    const ctxA = envA.contexts[0];
    expect(ctxA.pendingResumes).toHaveLength(2);
    expect(envA.totalListenerCount()).toBe(3);

    // p1 resolves to 'running' while p2 stays pending
    ctxA.resolveNextResume('running');
    await flushMicrotasks();
    expect(engineA.getStateSummary().contextState).toBe('running');
    expect(engineA.getStateSummary().unlocked).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    expect(envA.totalListenerCount()).toBe(0);

    // Subsequent p2 rejection while already 'running' must NOT stop ambient, clear unlocked, or re-attach listeners
    ctxA.rejectNextResume();
    await flushMicrotasks();
    expect(engineA.getStateSummary().unlocked).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    expect(envA.totalListenerCount()).toBe(0);
    engineA.dispose();

    // Case B: Double unlock() (p1, p2) -> setPaused(true) while still 'suspended' -> p1 resolves to 'running' while p2 pending
    // -> ctx.suspend() called immediately; subsequent p2 rejection does NOT wipe unlocked!
    vi.unstubAllGlobals();
    const envB = installMockAudioEnv({
      contextOptions: {
        initialState: 'suspended',
        autoTransitionOnResume: false,
        autoTransitionOnSuspend: true,
      },
    });
    const engineB = createEngine();
    engineB.unlock(); // p1 (seq = 1)
    engineB.unlock(); // p2 (seq = 2)
    const ctxB = envB.contexts[0];
    expect(ctxB.pendingResumes).toHaveLength(2);

    engineB.setPaused(true);
    expect(ctxB.suspendCalls).toBe(0); // ctx still suspended, so suspend not called yet

    // p1 resolves to 'running' while p2 pending -> must immediately auto-suspend!
    ctxB.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctxB.suspendCalls).toBe(1);
    expect(ctxB.state).toBe('suspended');
    expect(vi.getTimerCount()).toBe(0);
    expect(engineB.getStateSummary().unlocked).toBe(true);

    // Subsequent p2 rejection after suspend moved ctx back to 'suspended' must NOT wipe unlocked
    ctxB.rejectNextResume();
    await flushMicrotasks();
    expect(engineB.getStateSummary().unlocked).toBe(true);

    // Unpausing resumes cleanly because unlocked stayed true
    engineB.setPaused(false);
    expect(ctxB.resumeCalls).toBe(3);
    ctxB.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctxB.state).toBe('running');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('BUG-10: resume() resolving while ctx.state stays suspended resets unlocked & silentBufferUnlocked without spamming resume()', async () => {
    const env = installMockAudioEnv({
      contextOptions: { initialState: 'suspended', autoTransitionOnResume: false },
    });
    const engine = createEngine();

    engine.unlock();
    const ctx = env.contexts[0];
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.buffers.filter((b) => b.length === 1)).toHaveLength(1);

    // Resolve resume() WITHOUT transitioning state (stays 'suspended')
    ctx.resolveNextResume('suspended');
    await flushMicrotasks();

    const summary = engine.getStateSummary();
    expect(summary.unlocked).toBe(false);
    expect(summary.contextState).toBe('suspended');
    expect(env.totalListenerCount()).toBe(3);

    // 5 subsequent background play('sizzle') calls must make 0 extra resume() calls
    let now = 50_000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 1000;
      return now;
    });
    for (let i = 0; i < 5; i++) {
      engine.play('sizzle');
    }
    expect(ctx.resumeCalls).toBe(1);
    expect(engine.getStateSummary().activeVoices).toBe(0);

    // Later genuine capture pointerdown replays the 1-sample silent buffer (#2) and unlocks cleanly
    ctx.autoTransitionOnResume = true;
    env.dispatchWindowEvent('pointerdown');
    await flushMicrotasks();

    expect(ctx.resumeCalls).toBe(2);
    expect(ctx.buffers.filter((b) => b.length === 1)).toHaveLength(2);
    expect(engine.getStateSummary().unlocked).toBe(true);
    expect(engine.getStateSummary().contextState).toBe('running');
    expect(env.totalListenerCount()).toBe(0);
  });

  it('BUG-11: iOS interrupted after prior unlock re-attaches capture gesture listeners on unlock(), setPaused(false), and setEnabled(true) so window tap recovers audio', async () => {
    // Subcase A: Previously unlocked (listeners === 0) -> iOS 'interrupted' -> unlock() with deferred resume()
    const envA = installMockAudioEnv({
      contextOptions: { initialState: 'running', autoTransitionOnResume: false },
    });
    const engineA = createEngine();
    engineA.unlock();
    const ctxA = envA.contexts[0];
    expect(envA.totalListenerCount()).toBe(0);

    ctxA.state = 'interrupted';
    engineA.unlock();
    expect(ctxA.resumeCalls).toBe(1);
    expect(envA.totalListenerCount()).toBe(3);

    // User taps anywhere on window -> capture pointerdown recovers 'running' and detaches listeners
    ctxA.autoTransitionOnResume = true;
    envA.dispatchWindowEvent('pointerdown');
    await flushMicrotasks();
    expect(ctxA.state).toBe('running');
    expect(ctxA.resumeCalls).toBe(2);
    expect(envA.totalListenerCount()).toBe(0);
    engineA.dispose();

    // Subcase B: Previously unlocked (listeners === 0) -> iOS 'interrupted' -> setPaused(false) with deferred resume()
    vi.unstubAllGlobals();
    const envB = installMockAudioEnv({
      contextOptions: { initialState: 'running', autoTransitionOnResume: false },
    });
    const engineB = createEngine();
    engineB.unlock();
    const ctxB = envB.contexts[0];
    expect(envB.totalListenerCount()).toBe(0);

    ctxB.state = 'interrupted';
    engineB.setPaused(true);
    engineB.setPaused(false);
    expect(ctxB.resumeCalls).toBe(1);
    expect(envB.totalListenerCount()).toBe(3);

    ctxB.autoTransitionOnResume = true;
    envB.dispatchWindowEvent('pointerdown');
    await flushMicrotasks();
    expect(ctxB.state).toBe('running');
    expect(envB.totalListenerCount()).toBe(0);
    engineB.dispose();

    // Subcase C: Previously unlocked -> disabled -> 'interrupted' -> setEnabled(true) with deferred resume()
    vi.unstubAllGlobals();
    const envC = installMockAudioEnv({
      contextOptions: { initialState: 'running', autoTransitionOnResume: false },
    });
    const engineC = createEngine();
    engineC.unlock();
    const ctxC = envC.contexts[0];
    expect(envC.totalListenerCount()).toBe(0);

    engineC.setEnabled(false);
    ctxC.state = 'interrupted';
    engineC.setEnabled(true);
    expect(ctxC.resumeCalls).toBe(1);
    expect(envC.totalListenerCount()).toBe(3);

    ctxC.autoTransitionOnResume = true;
    envC.dispatchWindowEvent('pointerdown');
    await flushMicrotasks();
    expect(ctxC.state).toBe('running');
    expect(envC.totalListenerCount()).toBe(0);
  });

  it('DEFECT-1 / BUG-12 / BUG-A1 / BUG-A2: backwards ctx.currentTime jump restores gain after late start and clears stale far-future ducking across tick(), duck(), and setAmbientVolume()', () => {
    vi.useFakeTimers();

    interface ScheduledValueEvent {
      type: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime';
      value: number;
      time: number;
    }

    const getActiveTimeline = (param: MockAudioParam): ScheduledValueEvent[] => {
      const timeline: ScheduledValueEvent[] = [];
      for (const ev of param.events) {
        if (ev.type === 'cancelScheduledValues') {
          for (let i = timeline.length - 1; i >= 0; i--) {
            if (timeline[i].time >= ev.time) {
              timeline.splice(i, 1);
            }
          }
          continue;
        }
        if (
          (ev.type === 'setValueAtTime' ||
            ev.type === 'linearRampToValueAtTime' ||
            ev.type === 'exponentialRampToValueAtTime') &&
          ev.value !== undefined
        ) {
          const entry: ScheduledValueEvent = { type: ev.type, value: ev.value, time: ev.time };
          let insertIdx = timeline.length;
          while (insertIdx > 0 && timeline[insertIdx - 1].time > entry.time) {
            insertIdx -= 1;
          }
          timeline.splice(insertIdx, 0, entry);
        }
      }
      return timeline;
    };

    const evaluateAudioParamAt = (param: MockAudioParam, queryTime: number, initialValue = 1): number => {
      const timeline = getActiveTimeline(param);
      if (timeline.length === 0) return initialValue;

      let prevTime = 0;
      let prevVal = initialValue;

      for (const ev of timeline) {
        if (ev.time <= queryTime) {
          prevTime = ev.time;
          prevVal = ev.value;
        } else {
          if (ev.type === 'linearRampToValueAtTime') {
            if (ev.time <= prevTime) return ev.value;
            const frac = (queryTime - prevTime) / (ev.time - prevTime);
            return prevVal + (ev.value - prevVal) * frac;
          }
          if (ev.type === 'exponentialRampToValueAtTime') {
            if (ev.time <= prevTime || prevVal <= 0 || ev.value <= 0) return ev.value;
            const frac = (queryTime - prevTime) / (ev.time - prevTime);
            return prevVal * Math.pow(ev.value / prevVal, frac);
          }
          return prevVal;
        }
      }
      return prevVal;
    };

    // Subcase 1 (A1b / Repro 1A): Late ambient start at t = 50.0 -> backwards jump to 0.5 -> tick() restores targetVolume (never stuck at 0.0)
    const envLate = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engineLate = createEngine();
    engineLate.setAmbientEnabled(false);
    engineLate.setAmbientVolume(0.4);
    engineLate.unlock();
    const ctxLate = envLate.contexts[0];
    const ambGainLate = ctxLate.gains[1].gain;

    ctxLate.currentTime = 50.0;
    engineLate.setAmbientEnabled(true); // schedules fade 0 -> 0.4 over 50.0..50.25
    ctxLate.currentTime = 0.5;
    vi.advanceTimersByTime(200);

    expect(evaluateAudioParamAt(ambGainLate, 0.5)).toBeCloseTo(0.4, 4);
    expect(evaluateAudioParamAt(ambGainLate, 0.6)).toBeCloseTo(0.4, 4);
    expect(evaluateAudioParamAt(ambGainLate, 25.0)).toBeCloseTo(0.4, 4);
    expect(getActiveTimeline(ambGainLate).every((ev) => ev.time <= 1.0)).toBe(true);
    engineLate.dispose();

    // Subcase 2 (A2a / Repro 1D): Fanfare duck at t = 100.0 -> jump to 0.5 -> tick() cancels far-future duck & restores targetVolume
    vi.unstubAllGlobals();
    const envTick = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engineTick = createEngine();
    engineTick.setAmbientVolume(0.4);
    engineTick.unlock();
    const ctxTick = envTick.contexts[0];
    const ambGainTick = ctxTick.gains[1].gain;

    ctxTick.currentTime = 100.0;
    vi.advanceTimersByTime(200);
    engineTick.play('milestone');
    ctxTick.currentTime = 100.1;
    engineTick.play('city_flight');

    ctxTick.currentTime = 0.5;
    vi.advanceTimersByTime(200);

    expect(getActiveTimeline(ambGainTick).every((ev) => ev.time <= 1.0)).toBe(true);
    expect(evaluateAudioParamAt(ambGainTick, 0.6)).toBeCloseTo(0.4, 4);
    expect(evaluateAudioParamAt(ambGainTick, 100.2)).toBeCloseTo(0.4, 4);

    // Subsequent setAmbientVolume(0.45) at t = 0.7 must ramp from 0.4 (not stale 0.1) to 0.45
    ctxTick.currentTime = 0.7;
    engineTick.setAmbientVolume(0.45);
    expect(evaluateAudioParamAt(ambGainTick, 0.7)).toBeCloseTo(0.4, 4);
    expect(evaluateAudioParamAt(ambGainTick, 0.75)).toBeCloseTo(0.45, 4);
    engineTick.dispose();

    // Subcase 3 (A2b / Repro 1C / BUG-12 N10): Fanfare duck at t = 100.0 -> jump to 0.5 -> second fanfare BEFORE tick()
    // ducks ONLY at t = 0.5..1.5 (never 100.x) and restores to 0.4 by t = 2.0!
    vi.unstubAllGlobals();
    const envDuck = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engineDuck = createEngine();
    engineDuck.setAmbientVolume(0.4);
    engineDuck.unlock();
    const ctxDuck = envDuck.contexts[0];
    const ambGainDuck = ctxDuck.gains[1].gain;

    ctxDuck.currentTime = 100.0;
    vi.advanceTimersByTime(200);
    engineDuck.play('city_flight');

    ctxDuck.currentTime = 0.5;
    vi.advanceTimersByTime(20); // well before 160ms tick
    engineDuck.play('milestone');

    // Now advance past tick at t = 0.66
    ctxDuck.currentTime = 0.66;
    vi.advanceTimersByTime(160);

    const activeDuckTimeline = getActiveTimeline(ambGainDuck);
    expect(activeDuckTimeline.every((ev) => ev.time <= 2.0)).toBe(true);
    expect(evaluateAudioParamAt(ambGainDuck, 0.8)).toBeCloseTo(0.4 * DUCK_FACTOR, 4);
    expect(evaluateAudioParamAt(ambGainDuck, 2.0)).toBeCloseTo(0.4, 4);
    expect(evaluateAudioParamAt(ambGainDuck, 50.0)).toBeCloseTo(0.4, 4);
    engineDuck.dispose();

    // Subcase 4 (A2c / Repro 1B / BUG-12 N13): Fanfare duck at t = 100.0 -> jump to 0.5 -> setAmbientVolume(0.6) BEFORE tick()
    // ramps cleanly to 0.6 by t = 0.6 (never stuck at 0.15 for 100s)!
    vi.unstubAllGlobals();
    const envVol = installMockAudioEnv({ contextOptions: { initialState: 'running' } });
    const engineVol = createEngine();
    engineVol.setAmbientVolume(0.4);
    engineVol.unlock();
    const ctxVol = envVol.contexts[0];
    const ambGainVol = ctxVol.gains[1].gain;

    ctxVol.currentTime = 100.0;
    vi.advanceTimersByTime(200);
    engineVol.play('city_flight');

    ctxVol.currentTime = 0.5;
    vi.advanceTimersByTime(20); // well before 160ms tick
    engineVol.setAmbientVolume(0.6);

    // Advance past tick at t = 0.66
    ctxVol.currentTime = 0.66;
    vi.advanceTimersByTime(160);

    const activeVolTimeline = getActiveTimeline(ambGainVol);
    expect(activeVolTimeline.every((ev) => ev.time <= 1.0)).toBe(true);
    expect(evaluateAudioParamAt(ambGainVol, 0.6)).toBeCloseTo(0.6, 4);
    expect(evaluateAudioParamAt(ambGainVol, 5.0)).toBeCloseTo(0.6, 4);
    expect(evaluateAudioParamAt(ambGainVol, 50.0)).toBeCloseTo(0.6, 4);
  });

  it('BUG-13: resumeContext() symmetrically invalidates suspendSeq/suspendInFlight so re-pausing mid-resume immediately suspends ctx in both Race S-A and Race S-B', async () => {
    vi.useFakeTimers();

    // Race S-A: setPaused(true) -> false -> true -> s1 resolves -> false (p1) -> true -> p1 resolves 'running'
    const envA = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        autoTransitionOnSuspend: false,
        autoTransitionOnResume: false,
      },
    });
    const engineA = createEngine();
    engineA.unlock();
    const ctxA = envA.contexts[0];
    expect(vi.getTimerCount()).toBe(1);

    engineA.setPaused(true); // s1 pending
    engineA.setPaused(false);
    engineA.setPaused(true); // suspendInFlight blocks duplicate s2
    expect(ctxA.suspendCalls).toBe(1);
    expect(ctxA.pendingSuspends).toHaveLength(1);

    ctxA.resolveNextSuspend('suspended');
    await flushMicrotasks();
    expect(ctxA.state).toBe('suspended');
    expect(ctxA.resumeCalls).toBe(0);

    engineA.setPaused(false); // launches p1
    expect(ctxA.resumeCalls).toBe(1);
    engineA.setPaused(true); // re-pauses while p1 is still pending
    expect(ctxA.suspendCalls).toBe(1);

    // p1 resolves 'running' while paused -> reconcileRunningContext MUST immediately suspend ctx!
    ctxA.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctxA.suspendCalls).toBe(2);
    expect(ctxA.pendingSuspends).toHaveLength(1);

    ctxA.resolveNextSuspend('suspended');
    await flushMicrotasks();
    expect(ctxA.state).toBe('suspended');
    expect(vi.getTimerCount()).toBe(0);
    expect(engineA.getStateSummary().unlocked).toBe(true);
    engineA.dispose();

    // Race S-B: setPaused(true) [s1 pending] -> OS 'interrupted' -> setPaused(false) [p1] ->
    // setPaused(true) -> p1 resolves 'running' -> stale s1 rejects -> ctx MUST suspend cleanly (0 leaks)
    vi.unstubAllGlobals();
    const envB = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        autoTransitionOnSuspend: false,
        autoTransitionOnResume: false,
      },
    });
    const engineB = createEngine();
    engineB.unlock();
    const ctxB = envB.contexts[0];
    expect(vi.getTimerCount()).toBe(1);

    engineB.setPaused(true); // s1 pending (suspendInFlight = true)
    expect(ctxB.suspendCalls).toBe(1);
    expect(ctxB.pendingSuspends).toHaveLength(1);

    // OS moves context to 'interrupted' before s1 settles
    ctxB.state = 'interrupted';
    engineB.setPaused(false); // resumeContext() launches p1 AND clears stale suspendInFlight
    expect(ctxB.resumeCalls).toBe(1);
    expect(ctxB.pendingResumes).toHaveLength(1);

    engineB.setPaused(true); // re-pauses while ctx is still 'interrupted'
    expect(ctxB.suspendCalls).toBe(1);

    // p1 resolves 'running' while paused -> reconcileRunningContext MUST issue s2!
    ctxB.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctxB.suspendCalls).toBe(2);
    expect(ctxB.pendingSuspends).toHaveLength(2); // stale s1 + new s2

    // Stale s1 rejects -> ignored cleanly with 0 unhandled rejections; s2 still suspends ctx!
    ctxB.rejectNextSuspend();
    await flushMicrotasks();
    ctxB.resolveNextSuspend('suspended');
    await flushMicrotasks();

    expect(ctxB.state).toBe('suspended');
    expect(vi.getTimerCount()).toBe(0);
    expect(engineB.getStateSummary().unlocked).toBe(true);

    // Subsequent unpause still resumes cleanly
    engineB.setPaused(false);
    expect(ctxB.resumeCalls).toBe(2);
    ctxB.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctxB.state).toBe('running');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('BUG-14: redundant CapacitorBridge pause/foreground events and rapid pause toggling never spawn duplicate suspend() or resume() calls', async () => {
    vi.useFakeTimers();

    // Case 1: CapacitorBridge back-to-back visibilitychange + pagehide (setPaused(true) x2) ->
    // foreground visibilitychange + appStateChange (setPaused(false) x2) -> s1 resolves 'suspended' ->
    // plus an extra duplicate setPaused(false) while p1 is pending -> strictly 1 suspend and 1 resume!
    const envCap = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        autoTransitionOnSuspend: false,
        autoTransitionOnResume: false,
      },
    });
    const engineCap = createEngine();
    engineCap.unlock();
    const ctxCap = envCap.contexts[0];

    engineCap.setPaused(true); // visibilitychange (hidden)
    engineCap.setPaused(true); // pagehide
    expect(ctxCap.suspendCalls).toBe(1);
    expect(ctxCap.pendingSuspends).toHaveLength(1);

    engineCap.setPaused(false); // visibilitychange (visible) while s1 pending
    engineCap.setPaused(false); // appStateChange(isActive: true) while s1 pending
    expect(ctxCap.resumeCalls).toBe(0);

    ctxCap.resolveNextSuspend('suspended');
    await flushMicrotasks();
    expect(ctxCap.suspendCalls).toBe(1);
    expect(ctxCap.resumeCalls).toBe(1);
    expect(ctxCap.pendingResumes).toHaveLength(1);

    // Redundant foreground appStateChange(isActive: true) while p1 is in flight must NOT spawn p2
    engineCap.setPaused(false);
    expect(ctxCap.resumeCalls).toBe(1);

    ctxCap.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctxCap.state).toBe('running');
    expect(vi.getTimerCount()).toBe(1);

    // Also verify post-suspended CapacitorBridge foreground double-fire (ctx already 'suspended'):
    engineCap.setPaused(true);
    ctxCap.resolveNextSuspend('suspended');
    await flushMicrotasks();
    expect(ctxCap.suspendCalls).toBe(2);

    engineCap.setPaused(false); // real true -> false transition launches p2
    engineCap.setPaused(false); // duplicate false -> false while p2 pending is skipped
    expect(ctxCap.resumeCalls).toBe(2);
    ctxCap.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctxCap.state).toBe('running');
    engineCap.dispose();

    // Case 2: Rapid true -> false -> true -> false while s1 is pending -> strictly 1 suspend and 1 resume!
    vi.unstubAllGlobals();
    const envRapid = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        autoTransitionOnSuspend: false,
        autoTransitionOnResume: false,
      },
    });
    const engineRapid = createEngine();
    engineRapid.unlock();
    const ctxRapid = envRapid.contexts[0];

    engineRapid.setPaused(true);
    engineRapid.setPaused(false);
    engineRapid.setPaused(true);
    engineRapid.setPaused(false);
    expect(ctxRapid.suspendCalls).toBe(1);
    expect(ctxRapid.resumeCalls).toBe(0);

    ctxRapid.resolveNextSuspend('suspended');
    await flushMicrotasks();
    expect(ctxRapid.suspendCalls).toBe(1);
    expect(ctxRapid.resumeCalls).toBe(1);

    ctxRapid.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctxRapid.state).toBe('running');
    expect(vi.getTimerCount()).toBe(1);
    engineRapid.dispose();

    // Case 3: Stale s1 resolving 'suspended' while p1 is already in flight (resumeInFlight guard in suspendContext)
    vi.unstubAllGlobals();
    const envStale = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        autoTransitionOnSuspend: false,
        autoTransitionOnResume: false,
      },
    });
    const engineStale = createEngine();
    engineStale.unlock();
    const ctxStale = envStale.contexts[0];

    engineStale.setPaused(true); // s1 pending
    ctxStale.state = 'interrupted'; // OS interrupts before s1 resolves
    engineStale.setPaused(false); // launches p1 (resumeInFlight = true)
    expect(ctxStale.suspendCalls).toBe(1);
    expect(ctxStale.resumeCalls).toBe(1);

    // Stale s1 now fulfills with 'suspended' while p1 is still pending -> MUST NOT fire duplicate p2!
    ctxStale.resolveNextSuspend('suspended');
    await flushMicrotasks();
    expect(ctxStale.resumeCalls).toBe(1);

    ctxStale.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctxStale.state).toBe('running');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('BUG-15: redundant setEnabled(true) during in-flight resume does not spawn duplicate resume() or wipe silentBufferUnlocked, while genuine false->true toggle and idle interrupted recovery still resume', async () => {
    vi.useFakeTimers();

    // (a) unlock() (p1 pending) + 5x redundant setEnabled(true) (mirroring GameController.syncAudioSettings()
    // on slider/zoom/buyMode updates): strictly resumeCalls === 1, gestureUnlockCount preserved,
    // silentBufferUnlocked preserved, and all 3 capture listeners detach cleanly when p1 resolves 'running'.
    const envA = installMockAudioEnv({
      contextOptions: { initialState: 'suspended', autoTransitionOnResume: false },
    });
    const engineA = createEngine();
    engineA.setAmbientVolume(0.4);

    engineA.unlock(); // genuine user gesture -> launches p1, plays 1-sample silent buffer
    const ctxA = envA.contexts[0];
    expect(ctxA.resumeCalls).toBe(1);
    expect(ctxA.pendingResumes).toHaveLength(1);
    expect(envA.totalListenerCount()).toBe(3);

    // Exhaust the 2-trigger pending-gesture cap so we also verify redundant setEnabled(true) does NOT reset gestureUnlockCount
    engineA.play('tap');
    engineA.play('tab');
    expect(engineA.getStateSummary().activeVoices).toBe(2);

    // 5x redundant setEnabled(true) while already enabled and p1 in flight
    for (let i = 0; i < 5; i++) {
      engineA.setEnabled(true);
    }
    expect(ctxA.resumeCalls).toBe(1);
    expect(ctxA.pendingResumes).toHaveLength(1);

    // gestureUnlockCount was NOT reset -> 3rd pre-running play() stays bounded at 2
    engineA.play('coin');
    expect(engineA.getStateSummary().activeVoices).toBe(2);

    // p1 resolves 'running' -> silentBufferUnlocked preserved -> all 3 capture listeners detach & ambient starts
    ctxA.resolveNextResume('running');
    await flushMicrotasks();
    expect(engineA.getStateSummary().contextState).toBe('running');
    expect(engineA.getStateSummary().unlocked).toBe(true);
    expect(envA.totalListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    engineA.dispose();

    // (b) Genuine setEnabled(false) -> setEnabled(true) toggle while p1 is pending still triggers recovery (!wasEnabled),
    // and idle 'interrupted' recovery (!resumeInFlight) still calls resumeContext().
    vi.unstubAllGlobals();
    const envB = installMockAudioEnv({
      contextOptions: { initialState: 'suspended', autoTransitionOnResume: false },
    });
    const engineB = createEngine();
    engineB.setAmbientVolume(0.4);

    engineB.unlock(); // p1 pending (resumeCalls === 1)
    const ctxB = envB.contexts[0];
    expect(ctxB.resumeCalls).toBe(1);

    engineB.setEnabled(false); // wasEnabled transitions true -> false
    engineB.setEnabled(true); // genuine false -> true toggle while p1 still pending -> triggers p2
    expect(ctxB.resumeCalls).toBe(2);
    expect(ctxB.pendingResumes).toHaveLength(2);

    ctxB.resolveNextResume('running'); // p1 resolves
    ctxB.resolveNextResume('running'); // p2 resolves
    await flushMicrotasks();
    expect(ctxB.state).toBe('running');
    expect(envB.totalListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(1);

    // Idle OS 'interrupted' (!resumeInFlight) with enabled already true -> setEnabled(true) recovers via resumeContext()
    ctxB.state = 'interrupted';
    engineB.setEnabled(true);
    expect(ctxB.resumeCalls).toBe(3);
    expect(envB.totalListenerCount()).toBe(3);

    ctxB.resolveNextResume('running');
    await flushMicrotasks();
    expect(ctxB.state).toBe('running');
    expect(envB.totalListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('BUG-16: synchronous re-entrant dispose() inside ctx.resume() or silent-buffer source.start(0) leaves disposed engine cleanly uninitialized with zero leaks', async () => {
    vi.useFakeTimers();

    // Case 1: Re-entrant engine.dispose() synchronously invoked inside ctx.resume() during engine.unlock()
    let engineA: SoundEngine | null = null;
    const envA = installMockAudioEnv({
      contextOptions: {
        initialState: 'suspended',
        autoTransitionOnResume: false,
        onResume: () => {
          engineA?.dispose();
        },
      },
    });
    engineA = createEngine();
    engineA.unlock();

    const ctxA = envA.contexts[0];
    expect(ctxA.resumeCalls).toBe(1);
    expect(ctxA.buffers.filter((b) => b.length === 1)).toHaveLength(0); // 0 silent-buffer leak
    expect(envA.totalListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(engineA.getStateSummary()).toMatchObject({
      unlocked: false,
      contextState: 'uninitialized',
      activeVoices: 0,
    });

    // Deferred resume Promise settling after dispose() must remain a complete no-op
    ctxA.resolveNextResume('running');
    await flushMicrotasks();
    expect(engineA.getStateSummary()).toMatchObject({
      unlocked: false,
      contextState: 'uninitialized',
      activeVoices: 0,
    });
    expect(envA.totalListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    // Case 2: Re-entrant engine.dispose() synchronously invoked inside silent-buffer source.start(0) during engine.unlock()
    vi.unstubAllGlobals();
    let engineB: SoundEngine | null = null;
    const envB = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        onBufferStart: () => {
          engineB?.dispose();
        },
      },
    });
    engineB = createEngine();
    engineB.unlock();

    expect(envB.totalListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(engineB.getStateSummary()).toMatchObject({
      unlocked: false,
      contextState: 'uninitialized',
      activeVoices: 0,
    });

    // Case 2b: Re-entrant dispose() + synchronous throw inside silent-buffer source.start(0)
    vi.unstubAllGlobals();
    let engineB2: SoundEngine | null = null;
    const envB2 = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        throwAllStarts: true,
        onBufferStart: () => {
          engineB2?.dispose();
        },
      },
    });
    engineB2 = createEngine();
    engineB2.unlock();

    expect(envB2.totalListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(engineB2.getStateSummary()).toMatchObject({
      unlocked: false,
      contextState: 'uninitialized',
      activeVoices: 0,
    });

    // Case 3: Re-entrant dispose() inside ctx.resume() invoked via play() -> ensureContext(true) on 'interrupted'
    vi.unstubAllGlobals();
    const envC = installMockAudioEnv({
      contextOptions: {
        initialState: 'running',
        autoTransitionOnResume: false,
      },
    });
    const engineC = createEngine();
    engineC.setAmbientEnabled(false);
    engineC.unlock();
    const ctxC = envC.contexts[0];
    const oscsBeforeInterrupt = ctxC.oscillators.length;

    ctxC.state = 'interrupted';
    ctxC.onResume = () => {
      engineC.dispose();
    };
    engineC.play('coin');

    expect(ctxC.resumeCalls).toBe(1);
    expect(ctxC.oscillators.length).toBe(oscsBeforeInterrupt); // 0 voices scheduled on disposed ctx
    expect(envC.totalListenerCount()).toBe(0);
    expect(engineC.getStateSummary()).toMatchObject({
      unlocked: false,
      contextState: 'uninitialized',
      activeVoices: 0,
    });
  });

  it('BUG-17: stray play() after dispose() (without unlock()) is a zero-allocation, zero-timer no-op with zero split-brain resurrection', () => {
    vi.useFakeTimers();
    // 1. On 'running' context (e.g. Chromium after prior user activation): stray play() must NOT allocate a zombie ctx or start ambient timer
    const envRunning = installMockAudioEnv({
      contextOptions: { initialState: 'running' },
    });
    const engine = createEngine();
    engine.setAmbientVolume(0.4);
    engine.unlock();
    expect(envRunning.contexts).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);

    engine.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(envRunning.totalListenerCount()).toBe(0);

    engine.play('milestone');
    engine.play('city_flight');
    engine.play('coin');

    expect(envRunning.contexts).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(envRunning.totalListenerCount()).toBe(0);
    expect(engine.getStateSummary()).toMatchObject({
      unlocked: false,
      contextState: 'uninitialized',
      activeVoices: 0,
    });

    // Deliberate post-dispose revival via unlock() remains fully functional (with working fanfare ducking)
    engine.unlock();
    expect(envRunning.contexts).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);
    expect(engine.getStateSummary()).toMatchObject({
      unlocked: true,
      contextState: 'running',
    });
    const revivedAmbientBus = envRunning.contexts[1].gains[1];
    const eventsBeforeDuck = revivedAmbientBus.gain.events.length;
    engine.play('milestone');
    expect(revivedAmbientBus.gain.events.length).toBeGreaterThan(eventsBeforeDuck);

    // 2. On 'suspended' context: stray play() after dispose() also allocates zero AudioContexts
    vi.unstubAllGlobals();
    const envSuspended = installMockAudioEnv({
      contextOptions: { initialState: 'suspended' },
    });
    const engine2 = createEngine();
    engine2.unlock();
    expect(envSuspended.contexts).toHaveLength(1);
    engine2.dispose();

    engine2.play('coin');
    expect(envSuspended.contexts).toHaveLength(1);
    expect(engine2.getStateSummary()).toMatchObject({
      unlocked: false,
      contextState: 'uninitialized',
      activeVoices: 0,
    });
  });

  it('BUG-18: re-entrant dispose() during layer 1 osc.start() immediately halts remaining multi-layer SFX scheduling', () => {
    const env = installMockAudioEnv({
      contextOptions: { initialState: 'running' },
    });
    const engine = createEngine();
    engine.setAmbientEnabled(false);
    engine.unlock();
    const ctx = env.contexts[0];
    const bufSourcesBefore = ctx.bufferSources.length;

    const origCreateOsc = ctx.createOscillator.bind(ctx);
    let firstOscWrapped = false;
    ctx.createOscillator = () => {
      const osc = origCreateOsc();
      if (!firstOscWrapped) {
        firstOscWrapped = true;
        const origStart = osc.start.bind(osc);
        osc.start = (when?: number) => {
          origStart(when);
          engine.dispose();
        };
      }
      return osc;
    };

    // 'milestone' has 9 tone layers + 1 noise layer; layer 1 disposes -> remaining layers must abort
    engine.play('milestone');

    const startedOscs = ctx.oscillators.filter((o) => o.startedAt !== null).length;
    expect(startedOscs).toBeLessThanOrEqual(1);
    expect(ctx.bufferSources.length).toBe(bufSourcesBefore);
    expect(engine.getStateSummary()).toMatchObject({
      unlocked: false,
      contextState: 'uninitialized',
      activeVoices: 0,
    });
  });
});
