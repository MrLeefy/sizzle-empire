import { sleep } from './cdpClient.mjs';

export class E2EAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'E2EAssertionError';
  }
}

export function assert(condition, message) {
  if (!condition) {
    throw new E2EAssertionError(message || 'Assertion failed');
  }
}

export function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new E2EAssertionError(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertGte(actual, min, label) {
  if (!(typeof actual === 'number' && Number.isFinite(actual) && actual >= min)) {
    throw new E2EAssertionError(`${label}: expected >= ${min}, got ${actual}`);
  }
}

export function assertLte(actual, max, label) {
  if (!(typeof actual === 'number' && Number.isFinite(actual) && actual <= max)) {
    throw new E2EAssertionError(`${label}: expected <= ${max}, got ${actual}`);
  }
}

/**
 * Polls an async predicate until truthy or timeoutMs expires.
 * Returns the truthy value resolved by fn().
 */
export async function waitFor(fn, { timeoutMs = 10000, intervalMs = 150, label = 'condition' } = {}) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start <= timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await sleep(intervalMs);
  }
  const suffix = lastError ? ` (last error: ${lastError instanceof Error ? lastError.message : String(lastError)})` : '';
  throw new E2EAssertionError(`Timed out after ${timeoutMs}ms waiting for ${label}${suffix}`);
}

// --- CSS Color, linear-gradient(...) Stop Parsing & WCAG Contrast Math ---

export function parseCssColor(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();

  // #RGB or #RRGGBB or #RRGGBBAA
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (hexMatch) {
    const h = hexMatch[1];
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
        a: 1,
      };
    }
    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: 1,
      };
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: parseInt(h.slice(6, 8), 16) / 255,
    };
  }

  // rgb(r, g, b) / rgba(r, g, b, a) / rgb(r g b / a)
  const rgbMatch =
    /^rgba?\(\s*([0-9]*\.?[0-9]+)\s*[,\s]\s*([0-9]*\.?[0-9]+)\s*[,\s]\s*([0-9]*\.?[0-9]+)(?:\s*[,/]\s*([0-9]*\.?[0-9]+)(%?))?\s*\)$/i.exec(s);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = Number(rgbMatch[4]);
      if (rgbMatch[5] === '%') a /= 100;
    }
    if (![r, g, b, a].every(Number.isFinite)) return null;
    return {
      r: Math.max(0, Math.min(255, r)),
      g: Math.max(0, Math.min(255, g)),
      b: Math.max(0, Math.min(255, b)),
      a: Math.max(0, Math.min(1, a)),
    };
  }

  // CSS Color 4: color(srgb r g b) / color(srgb r g b / a) (e.g. Chromium color-mix(in srgb, ...))
  const srgbMatch =
    /^color\(\s*srgb\s+([+-]?(?:\d+\.?\d*|\.\d+))(%?)\s+([+-]?(?:\d+\.?\d*|\.\d+))(%?)\s+([+-]?(?:\d+\.?\d*|\.\d+))(%?)(?:\s*\/\s*([+-]?(?:\d+\.?\d*|\.\d+))(%?))?\s*\)$/i.exec(s);
  if (srgbMatch) {
    const parseUnit = (valStr, isPct) => {
      const n = Number(valStr);
      if (!Number.isFinite(n)) return NaN;
      return isPct === '%' ? n / 100 : n;
    };
    const r0 = parseUnit(srgbMatch[1], srgbMatch[2]);
    const g0 = parseUnit(srgbMatch[3], srgbMatch[4]);
    const b0 = parseUnit(srgbMatch[5], srgbMatch[6]);
    const a0 = srgbMatch[7] !== undefined ? parseUnit(srgbMatch[7], srgbMatch[8]) : 1;
    if (![r0, g0, b0, a0].every(Number.isFinite)) return null;
    return {
      r: Math.max(0, Math.min(255, r0 * 255)),
      g: Math.max(0, Math.min(255, g0 * 255)),
      b: Math.max(0, Math.min(255, b0 * 255)),
      a: Math.max(0, Math.min(1, a0)),
    };
  }

  return null;
}

export function parseGradientColorStops(backgroundImage) {
  if (typeof backgroundImage !== 'string' || !backgroundImage.includes('gradient(')) {
    return [];
  }
  const stops = [];
  const tokenRe =
    /color\(\s*srgb\s+[^)]+\)|rgba?\(\s*[0-9]*\.?[0-9]+\s*[,\s]\s*[0-9]*\.?[0-9]+\s*[,\s]\s*[0-9]*\.?[0-9]+(?:\s*[,/]\s*[0-9]*\.?[0-9]+%?)?\s*\)|#[0-9a-f]{3,8}\b/gi;
  let match;
  while ((match = tokenRe.exec(backgroundImage)) !== null) {
    const parsed = parseCssColor(match[0]);
    if (parsed) stops.push(parsed);
  }
  return stops;
}

function srgbToLinear(c255) {
  const c = Math.max(0, Math.min(1, c255 / 255));
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function wcagRelativeLuminance(color) {
  return (
    0.2126 * srgbToLinear(color.r) +
    0.7152 * srgbToLinear(color.g) +
    0.0722 * srgbToLinear(color.b)
  );
}

export function wcagContrastRatio(c1, c2) {
  const l1 = wcagRelativeLuminance(c1);
  const l2 = wcagRelativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Evaluates computed background luminance & foreground contrast, handling BOTH
 * solid backgroundColor and CSS linear-gradient(...) color stops (including color(srgb ...)).
 * Transparent surfaces (all bg alpha < 0.2) explicitly return ok: false.
 */
export function evaluateComputedSurface({ backgroundColor, backgroundImage, color }) {
  const solidBg = parseCssColor(backgroundColor);
  const fg = parseCssColor(color);
  const gradStops = parseGradientColorStops(backgroundImage);
  const opaqueGradStops = gradStops.filter((s) => s.a >= 0.75);

  let effectiveColors = [];
  let source = 'none';

  // If background-image paints an opaque gradient over background-color, use the gradient stops.
  // If backgroundColor is transparent (a < 0.2), fall back to any visible (a >= 0.2) gradient stops.
  // Otherwise, use solid backgroundColor (e.g. solid cream surface with translucent top gloss overlay).
  if (opaqueGradStops.length >= 2) {
    effectiveColors = opaqueGradStops;
    source = 'gradient';
  } else if (solidBg && solidBg.a >= 0.2) {
    effectiveColors = [solidBg];
    source = 'solid';
  } else if (gradStops.some((s) => s.a >= 0.2)) {
    effectiveColors = gradStops.filter((s) => s.a >= 0.2);
    source = 'gradient-translucent';
  } else if (solidBg) {
    source = 'transparent';
  }

  if (effectiveColors.length === 0) {
    return {
      ok: false,
      source,
      bgLuminance: 0,
      minStopLuminance: 0,
      contrastRatio: 0,
      meanBgRgb: null,
      fgRgb: fg ? [Math.round(fg.r), Math.round(fg.g), Math.round(fg.b)] : null,
    };
  }

  const lumas = effectiveColors.map((c) => wcagRelativeLuminance(c));
  const avgLuma = lumas.reduce((a, b) => a + b, 0) / lumas.length;
  const minLuma = Math.min(...lumas);

  // Average effective background RGB for contrast against foreground ink
  const meanBg = {
    r: effectiveColors.reduce((s, c) => s + c.r, 0) / effectiveColors.length,
    g: effectiveColors.reduce((s, c) => s + c.g, 0) / effectiveColors.length,
    b: effectiveColors.reduce((s, c) => s + c.b, 0) / effectiveColors.length,
    a: 1,
  };

  const contrastRatio = fg ? wcagContrastRatio(meanBg, fg) : 0;

  return {
    ok: true,
    source,
    bgLuminance: Number(avgLuma.toFixed(4)),
    minStopLuminance: Number(minLuma.toFixed(4)),
    contrastRatio: Number(contrastRatio.toFixed(2)),
    meanBgRgb: [Math.round(meanBg.r), Math.round(meanBg.g), Math.round(meanBg.b)],
    fgRgb: fg ? [Math.round(fg.r), Math.round(fg.g), Math.round(fg.b)] : null,
  };
}

// --- Structured Test Runner & Reporter ---

export class TestSuiteRunner {
  constructor({ quiet = false } = {}) {
    this.results = [];
    this.screenshots = [];
    this.quiet = quiet;
    this.startedAt = Date.now();
  }

  addScreenshot(entry) {
    this.screenshots.push(entry);
  }

  async runTest({ id, tier, target, name }, fn) {
    const start = Date.now();
    const details = [];
    const ctx = {
      assert,
      assertEqual,
      assertGte,
      assertLte,
      detail(msg) {
        if (msg) details.push(String(msg));
      },
      recordScreenshot: (entry) => this.addScreenshot(entry),
    };

    try {
      await fn(ctx);
      const durationMs = Date.now() - start;
      const result = {
        id,
        tier,
        target,
        name,
        status: 'PASS',
        durationMs,
        details,
        error: null,
      };
      this.results.push(result);
      if (!this.quiet) {
        const suffix = details.length ? ` — ${details.join(' | ')}` : '';
        process.stdout.write(`  [PASS] ${id} (${target}, ${durationMs}ms): ${name}${suffix}\n`);
      }
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      const result = {
        id,
        tier,
        target,
        name,
        status: 'FAIL',
        durationMs,
        details,
        error: errorMsg,
      };
      this.results.push(result);
      if (!this.quiet) {
        process.stdout.write(`  [FAIL] ${id} (${target}, ${durationMs}ms): ${name}\n         ${errorMsg}\n`);
      }
      return result;
    }
  }

  getSummary() {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.status === 'PASS').length;
    const failed = total - passed;
    const durationMs = Date.now() - this.startedAt;

    const byTier = {};
    for (const r of this.results) {
      const k = `tier${r.tier}`;
      if (!byTier[k]) byTier[k] = { passed: 0, failed: 0, total: 0 };
      byTier[k].total += 1;
      if (r.status === 'PASS') byTier[k].passed += 1;
      else byTier[k].failed += 1;
    }

    const byTarget = {};
    for (const r of this.results) {
      if (!byTarget[r.target]) byTarget[r.target] = { passed: 0, failed: 0, total: 0 };
      byTarget[r.target].total += 1;
      if (r.status === 'PASS') byTarget[r.target].passed += 1;
      else byTarget[r.target].failed += 1;
    }

    return {
      ok: failed === 0 && total > 0,
      total,
      passed,
      failed,
      durationMs,
      byTier,
      byTarget,
    };
  }

  toJsonReport(meta = {}) {
    return {
      ok: this.getSummary().ok,
      timestamp: new Date().toISOString(),
      ...meta,
      summary: this.getSummary(),
      screenshots: this.screenshots,
      results: this.results,
    };
  }

  printPrettySummary(meta = {}) {
    const s = this.getSummary();
    process.stdout.write('\n======================================================================\n');
    process.stdout.write(
      `Sizzle Empire E2E Summary — ${s.ok ? 'PASS' : 'FAIL'} (${s.passed}/${s.total} passed, ${s.failed} failed, ${(s.durationMs / 1000).toFixed(1)}s)\n`,
    );
    process.stdout.write('----------------------------------------------------------------------\n');

    for (const [tierKey, counts] of Object.entries(s.byTier)) {
      process.stdout.write(
        `  ${tierKey.toUpperCase().padEnd(8)} : ${counts.passed}/${counts.total} passed (${counts.failed} failed)\n`,
      );
    }
    for (const [targetKey, counts] of Object.entries(s.byTarget)) {
      process.stdout.write(
        `  target=${targetKey.padEnd(10)} : ${counts.passed}/${counts.total} passed (${counts.failed} failed)\n`,
      );
    }

    const failures = this.results.filter((r) => r.status === 'FAIL');
    if (failures.length > 0) {
      process.stdout.write('----------------------------------------------------------------------\n');
      process.stdout.write('Failures:\n');
      for (const f of failures) {
        process.stdout.write(`  - [${f.id} | ${f.target}] ${f.name}: ${f.error}\n`);
      }
    }

    if (meta.screenshotsPreserved && meta.screenshotsDir && this.screenshots.length > 0) {
      process.stdout.write('----------------------------------------------------------------------\n');
      process.stdout.write(`Saved ${this.screenshots.length} screenshots in ${meta.screenshotsDir}\n`);
    }
    process.stdout.write('======================================================================\n');
  }
}
