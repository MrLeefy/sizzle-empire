/**
 * Lightweight Web Audio procedural SFX engine.
 * Zero network fetches, 100% offline, minimal CPU overhead, mobile gesture unlock safe.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private lastCoinAt = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.08,
    delay = 0,
    endFreq?: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  play(
    sfx:
      | 'tap'
      | 'upgrade'
      | 'milestone'
      | 'coin'
      | 'perfect'
      | 'divine'
      | 'tip'
      | 'order'
      | 'sizzle'
      | 'box'
      | 'renovate'
      | 'error',
  ): void {
    if (!this.enabled) return;
    const nowMs = Date.now();
    if (sfx === 'coin' && nowMs - this.lastCoinAt < 110) return;
    if (sfx === 'coin') this.lastCoinAt = nowMs;

    switch (sfx) {
      case 'tap':
        this.tone(520, 0.05, 'triangle', 0.05, 0, 660);
        break;
      case 'upgrade':
        this.tone(440, 0.08, 'triangle', 0.08, 0, 620);
        this.tone(660, 0.09, 'sine', 0.07, 0.04, 880);
        break;
      case 'milestone':
        this.tone(523.25, 0.12, 'triangle', 0.1, 0);
        this.tone(659.25, 0.12, 'triangle', 0.1, 0.08);
        this.tone(783.99, 0.14, 'triangle', 0.1, 0.16);
        this.tone(1046.5, 0.24, 'sine', 0.11, 0.24);
        break;
      case 'coin':
        this.tone(987.77, 0.07, 'sine', 0.05, 0);
        this.tone(1318.5, 0.11, 'sine', 0.05, 0.04);
        break;
      case 'perfect':
        this.tone(784, 0.1, 'triangle', 0.08, 0);
        this.tone(1174.66, 0.16, 'sine', 0.08, 0.05);
        break;
      case 'divine':
        this.tone(587.33, 0.12, 'triangle', 0.09, 0);
        this.tone(880, 0.14, 'sine', 0.09, 0.05);
        this.tone(1174.66, 0.18, 'sine', 0.1, 0.1);
        this.tone(1760, 0.26, 'sine', 0.09, 0.15);
        break;
      case 'tip':
        this.tone(1046.5, 0.08, 'sine', 0.07, 0);
        this.tone(1567.98, 0.14, 'sine', 0.08, 0.05);
        break;
      case 'order':
        this.tone(420, 0.06, 'sine', 0.035, 0, 560);
        break;
      case 'sizzle':
        this.tone(240, 0.06, 'sawtooth', 0.02, 0, 320);
        break;
      case 'box':
        this.tone(392, 0.1, 'triangle', 0.09, 0);
        this.tone(493.88, 0.1, 'triangle', 0.09, 0.08);
        this.tone(587.33, 0.12, 'triangle', 0.1, 0.16);
        this.tone(783.99, 0.28, 'sine', 0.12, 0.24);
        break;
      case 'renovate':
        this.tone(523.25, 0.14, 'triangle', 0.1, 0);
        this.tone(659.25, 0.14, 'triangle', 0.1, 0.1);
        this.tone(783.99, 0.16, 'triangle', 0.1, 0.2);
        this.tone(1046.5, 0.35, 'sine', 0.13, 0.3);
        break;
      case 'error':
        this.tone(220, 0.12, 'sawtooth', 0.06, 0, 160);
        break;
    }
  }
}
