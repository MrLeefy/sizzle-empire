import { pathToFileURL } from 'node:url';
import { launchChromium, sleep } from './cdpClient.mjs';
import { PRIMARY_VIEWPORT, STANDALONE_HTML, THRESHOLDS } from './config.mjs';
import { evaluateComputedSurface, waitFor } from './runner.mjs';

export function getStandaloneUrl() {
  return pathToFileURL(STANDALONE_HTML).href;
}

export function parseDisplayMoney(raw) {
  if (typeof raw !== 'string') return 0;
  const cleaned = raw.replace(/,/g, '').trim();
  const match = /\$\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\s*([a-zA-Z]*)/i.exec(cleaned);
  if (!match) return 0;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return 0;
  const suffix = (match[2] || '').toLowerCase();
  const mults = {
    '': 1,
    k: 1e3,
    m: 1e6,
    b: 1e9,
    t: 1e12,
    qa: 1e15,
    qi: 1e18,
    aa: 1e15,
    ab: 1e18,
  };
  return num * (mults[suffix] ?? 1);
}

/**
 * Boots a fresh isolated Chromium session for either 'main' or 'standalone'.
 */
export async function bootTargetSession(target, { staticUrl, viewport = PRIMARY_VIEWPORT } = {}) {
  const isMain = target === 'main';
  const url = isMain ? `${staticUrl}/` : getStandaloneUrl();
  const session = await launchChromium({
    mode: target,
    allowedOrigin: isMain ? staticUrl : null,
    viewport,
  });

  try {
    await session.navigateAndWait(url, THRESHOLDS.bootTimeoutMs);
    await waitForTargetBoot(session, target);
    return session;
  } catch (err) {
    await session.close();
    throw err;
  }
}

export async function waitAnimationFrames(session, count = 2, timeoutMs = 25000) {
  await session.evaluate(
    `new Promise((resolve) => {
      let rem = Math.max(1, ${Number(count)});
      const step = () => {
        rem -= 1;
        if (rem <= 0) resolve(true);
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    })`,
    { awaitPromise: true, timeoutMs },
  );
}

export async function waitForTargetBoot(session, target, timeoutMs = THRESHOLDS.bootTimeoutMs) {
  if (target === 'main') {
    await waitFor(
      async () =>
        session.evaluate(
          `(() => {
            const s = window.__sizzle;
            const canvas = document.querySelector('.viewport-3d canvas');
            const navBtns = document.querySelectorAll('nav.bottom-nav button');
            const cashEl = document.querySelector('.top-hud .currency-pill.cash');
            const rt = typeof s?.getActiveRuntime === 'function' ? s.getActiveRuntime() : null;
            const uiVer = typeof s?.getUiVersion === 'function' ? s.getUiVersion() : 0;
            return Boolean(
              s &&
              s.save &&
              rt &&
              uiVer >= 1 &&
              rt.simTime > 0 &&
              canvas &&
              canvas.width > 0 &&
              canvas.height > 0 &&
              navBtns.length >= 7 &&
              cashEl
            );
          })()`,
          { timeoutMs: 30000 },
        ),
      { timeoutMs, intervalMs: 120, label: 'main app boot (controller.boot() + IndexedDB + WebGL canvas + HUD)' },
    );
  } else {
    await waitFor(
      async () =>
        session.evaluate(
          `(() => {
            const canvas = document.getElementById('world');
            const navBtns = document.querySelectorAll('.bottom-nav button, .bottom-nav .nav-tab');
            const cashEl = document.getElementById('hud-cash');
            return Boolean(
              canvas &&
              canvas.width > 0 &&
              canvas.height > 0 &&
              navBtns.length >= 6 &&
              cashEl &&
              cashEl.textContent.trim().length > 0
            );
          })()`,
          { timeoutMs: 30000 },
        ),
      { timeoutMs, intervalMs: 120, label: 'standalone artifact boot (canvas#world + HUD)' },
    );
  }
  await waitAnimationFrames(session, 1, 30000);
}

/**
 * Waits for a mounted, non-hidden element to settle any finite CSS entrance animation
 * (sheetSlideUp, popoverSpringIn, popSpring, modalPopIn).
 *
 * Chromium 156 --headless=new under software rendering can freeze finite (iterations===1,
 * <=1000ms) CSS @keyframes entrance animations at currentTime===0 for 6-10+ seconds.
 * Always waits naturally past the animation duration (~700ms) first, then invokes anim.finish()
 * strictly on stalled finite entrance animations — NEVER touching infinite animations, rAF, or game state.
 */
export async function settleFiniteEntranceAnimations(
  session,
  selector,
  {
    mountTimeoutMs = 3000,
    naturalWaitMs = 700,
    settleTimeoutMs = 3000,
    maxTy = 12,
    minOpacity = 0.9,
    requireSheetInView = false,
    backdropSelector = null,
    excludeSelectors = [],
    minWidth = 0,
    minHeight = 0,
    checkSubtree = false,
    label = `${selector} settled`,
    throwIfMissing = true,
  } = {},
) {
  const queryMatchesExpr = `(() => {
    const backdropSel = ${JSON.stringify(backdropSelector)};
    if (backdropSel) {
      const bd = document.querySelector(backdropSel);
      if (!bd || bd.classList.contains('hidden')) return [];
      const bcs = getComputedStyle(bd);
      if (bcs.display === 'none' || bcs.visibility === 'hidden') return [];
    }
    const excludes = ${JSON.stringify(excludeSelectors)};
    const minW = ${Number(minWidth)};
    const minH = ${Number(minHeight)};
    return [...document.querySelectorAll(${JSON.stringify(selector)})].filter((el) => {
      if (!el || el.classList?.contains('hidden')) return false;
      for (const ex of excludes) {
        if (el.matches(ex) || el.closest(ex)) return false;
      }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > minW && r.height > minH;
    });
  })()`;

  const checkMounted = async () =>
    session.evaluate(`(${queryMatchesExpr}).length > 0`);

  const checkSettled = async () =>
    session.evaluate(`(() => {
      const matches = ${queryMatchesExpr};
      if (matches.length === 0) return false;
      const maxTy = ${Number(maxTy)};
      const minOpacity = ${Number(minOpacity)};
      const requireSheetInView = ${Boolean(requireSheetInView)};
      const isSettled = (el) => {
        const cs = getComputedStyle(el);
        const op = parseFloat(cs.opacity);
        if (!Number.isFinite(op) || op < minOpacity) return false;
        let anc = el.parentElement;
        while (anc && anc !== document.body && anc !== document.documentElement) {
          const acs = getComputedStyle(anc);
          const aop = parseFloat(acs.opacity);
          if (Number.isFinite(aop) && aop < minOpacity) return false;
          anc = anc.parentElement;
        }
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        if (requireSheetInView && r.top >= window.innerHeight - 100) return false;
        const tf = cs.transform;
        let ty = 0;
        if (tf && tf.startsWith('matrix3d(')) ty = Number(tf.slice(9, -1).split(',')[13]) || 0;
        else if (tf && tf.startsWith('matrix(')) ty = Number(tf.slice(7, -1).split(',')[5]) || 0;
        return Math.abs(ty) <= maxTy;
      };
      return matches.every(isSettled);
    })()`);

  const hasStalledSubtreeFiniteAnim = async () =>
    session.evaluate(`(() => {
      const matches = ${queryMatchesExpr};
      if (matches.length === 0) return false;
      for (const el of matches) {
        const anims = typeof el.getAnimations === 'function' ? el.getAnimations({ subtree: true }) : [];
        for (const anim of anims) {
          if (!anim || anim.playState !== 'running') continue;
          const timing =
            (typeof anim.effect?.getComputedTiming === 'function' && anim.effect.getComputedTiming()) ||
            (typeof anim.effect?.getTiming === 'function' && anim.effect.getTiming()) ||
            null;
          if (!timing || timing.iterations !== 1) continue;
          const dur = Number(timing.duration);
          if (!Number.isFinite(dur) || dur <= 0 || dur > 1000) continue;
          const delay = Number(timing.delay) || 0;
          const endDur = Math.max(dur, dur + Math.max(0, delay));
          const rawCur = anim.currentTime;
          const cur =
            rawCur === null || rawCur === undefined
              ? null
              : typeof rawCur === 'number'
                ? rawCur
                : Number(rawCur.value);
          if (cur === null || cur === 0 || (Number.isFinite(cur) && cur >= endDur)) {
            return true;
          }
        }
      }
      return false;
    })()`);

  // 1. Wait for element to be mounted & non-hidden in DOM
  let mounted = await checkMounted();
  if (!mounted && mountTimeoutMs > 0) {
    try {
      await waitFor(checkMounted, {
        timeoutMs: mountTimeoutMs,
        intervalMs: 60,
        label: `${label} (DOM mount)`,
      });
      mounted = true;
    } catch (err) {
      if (!throwIfMissing) return { mounted: false, settled: false, finishedCount: 0 };
      throw err;
    }
  }
  if (!mounted) {
    if (!throwIfMissing) return { mounted: false, settled: false, finishedCount: 0 };
    throw new Error(`Element not mounted/visible for ${label} (${selector})`);
  }

  // 2. Wait naturally for organic compositor settle (~700ms > 240-280ms entrance duration)
  const settledNow = (await checkSettled()) && (!checkSubtree || !(await hasStalledSubtreeFiniteAnim()));
  if (settledNow) {
    return { mounted: true, settled: true, finishedCount: 0 };
  }
  if (naturalWaitMs > 0) {
    try {
      await waitFor(
        async () => (await checkSettled()) && (!checkSubtree || !(await hasStalledSubtreeFiniteAnim())),
        {
          timeoutMs: naturalWaitMs,
          intervalMs: 60,
          label: `${label} (natural settle)`,
        },
      );
      return { mounted: true, settled: true, finishedCount: 0 };
    } catch {
      // Still mid-entrance after natural wait -> check for Chromium 156 headless cur===0 freeze
    }
  }

  // 3. Finish ONLY stalled finite entrance animations (iterations===1, 0<dur<=1000, running, cur===null|0|>=dur)
  const finishedCount = await session.evaluate(`(() => {
    const matches = ${queryMatchesExpr};
    if (matches.length === 0) return 0;
    const animSet = new Set();
    const collect = (node) => {
      if (!node || typeof node.getAnimations !== 'function') return;
      for (const a of node.getAnimations()) animSet.add(a);
    };
    for (const el of matches) {
      collect(el);
      if (typeof el.getAnimations === 'function') {
        for (const a of el.getAnimations({ subtree: true })) animSet.add(a);
      }
      let anc = el.parentElement;
      while (anc && anc !== document.body && anc !== document.documentElement) {
        const aop = parseFloat(getComputedStyle(anc).opacity);
        if (Number.isFinite(aop) && aop < ${Number(minOpacity)}) {
          collect(anc);
        }
        anc = anc.parentElement;
      }
    }

    let finished = 0;
    for (const anim of animSet) {
      if (!anim || anim.playState !== 'running') continue;
      const timing =
        (typeof anim.effect?.getComputedTiming === 'function' && anim.effect.getComputedTiming()) ||
        (typeof anim.effect?.getTiming === 'function' && anim.effect.getTiming()) ||
        null;
      if (!timing || timing.iterations !== 1) continue;
      const dur = Number(timing.duration);
      if (!Number.isFinite(dur) || dur <= 0 || dur > 1000) continue;
      const delay = Number(timing.delay) || 0;
      const endDur = Math.max(dur, dur + Math.max(0, delay));
      const rawCur = anim.currentTime;
      const cur =
        rawCur === null || rawCur === undefined
          ? null
          : typeof rawCur === 'number'
            ? rawCur
            : Number(rawCur.value);
      if (cur === null || cur === 0 || (Number.isFinite(cur) && cur >= endDur)) {
        try {
          anim.finish();
          finished += 1;
        } catch {
          // ignore non-finishable animation
        }
      }
    }
    return finished;
  })()`);

  // 4. Wait 1 rAF and verify the element is genuinely settled
  if (finishedCount > 0) {
    await waitAnimationFrames(session, 1);
  }
  if (await checkSettled()) {
    return { mounted: true, settled: true, finishedCount };
  }
  if (settleTimeoutMs > 0) {
    try {
      await waitFor(checkSettled, {
        timeoutMs: settleTimeoutMs,
        intervalMs: 60,
        label,
      });
      return { mounted: true, settled: true, finishedCount };
    } catch (err) {
      if (!throwIfMissing) return { mounted: true, settled: false, finishedCount };
      throw err;
    }
  }
  if (!throwIfMissing) return { mounted: true, settled: false, finishedCount };
  throw new Error(`Timed out waiting for ${label} (${selector})`);
}

export async function readHudCash(session, target) {
  const text = await session.evaluate(
    target === 'main'
      ? `(() => (document.querySelector('.top-hud .currency-pill.cash')?.textContent || '').trim())()`
      : `(() => (document.getElementById('hud-cash')?.textContent || '').trim())()`,
  );
  return { text: String(text || ''), value: parseDisplayMoney(String(text || '')) };
}

export async function readHudGems(session, target) {
  const text = await session.evaluate(
    target === 'main'
      ? `(() => (document.querySelector('.top-hud .currency-pill.gems')?.textContent || '').trim())()`
      : `(() => (document.getElementById('hud-gems')?.textContent || '').trim())()`,
  );
  const digits = String(text || '').replace(/[^\d]/g, '');
  return { text: String(text || ''), value: digits ? Number(digits) : 0 };
}

export async function readAudioStatus(session, target) {
  return session.evaluate(`(() => {
    const spy = window.__e2eAudioSpy;
    const spyInstances = Array.isArray(spy?.instances) ? spy.instances : [];
    const spyStates = spyInstances.map((c) => {
      try { return c.state; } catch { return 'unknown'; }
    });
    const anySpyRunning = spyStates.includes('running');

    if (${JSON.stringify(target)} === 'main') {
      const snd = window.__sizzle?.sound;
      const hasGetStateSummary = typeof snd?.getStateSummary === 'function';
      const hasRenderOfflineSample = typeof snd?.renderOfflineSample === 'function';
      const hasUnlock = typeof snd?.unlock === 'function';
      let summary = null;
      if (hasGetStateSummary) {
        try { summary = snd.getStateSummary(); } catch {}
      }
      const rawCtxState = snd?.ctx?.state || null;
      return {
        spyCount: spyInstances.length,
        spyStates,
        anySpyRunning,
        hasGetStateSummary,
        hasRenderOfflineSample,
        hasUnlock,
        summary,
        rawCtxState,
        running: anySpyRunning || summary?.contextState === 'running' || rawCtxState === 'running',
      };
    }

    const art = window.__sizzleArtifact;
    const hasArtifact = Boolean(art && typeof art === 'object');
    const hasGetStateSummary = typeof art?.getStateSummary === 'function';
    const hasRenderOfflineSfxTest = typeof art?.renderOfflineSfxTest === 'function';
    const hasPlayTestSfx = typeof art?.playTestSfx === 'function';
    const hasGetStationHitRegions = typeof art?.getStationHitRegions === 'function';
    let summary = null;
    if (hasGetStateSummary) {
      try { summary = art.getStateSummary(); } catch {}
    }
    return {
      spyCount: spyInstances.length,
      spyStates,
      anySpyRunning,
      hasArtifact,
      hasGetStateSummary,
      hasRenderOfflineSfxTest,
      hasPlayTestSfx,
      hasGetStationHitRegions,
      summary,
      running: anySpyRunning || summary?.audioState === 'running',
    };
  })()`);
}

/**
 * Clicks a bottom navigation tab by semantic English label (emoji-free, strips .nav-badge).
 */
export async function openBottomTab(session, target, tabName) {
  const lower = tabName.toLowerCase();
  const rect = await session.evaluate(`(() => {
    const target = ${JSON.stringify(target)};
    const lower = ${JSON.stringify(lower)};

    const getCleanLabel = (btn) => {
      const clone = btn.cloneNode(true);
      clone.querySelectorAll('.nav-badge').forEach((n) => n.remove());
      return (clone.textContent || '').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\\s+/g, ' ').trim().toLowerCase();
    };

    let btn = null;
    if (target === 'standalone') {
      btn = document.querySelector(\`.bottom-nav [data-sheet="\${lower}"]\`);
    }
    if (!btn) {
      const all = [...document.querySelectorAll('nav.bottom-nav button, .bottom-nav button, .bottom-nav .nav-tab')];
      btn = all.find((b) => getCleanLabel(b) === lower || getCleanLabel(b).includes(lower)) || null;
    }
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const cs = getComputedStyle(btn);
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      width: r.width,
      height: r.height,
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
      alreadyActive: btn.classList.contains('active'),
      label: getCleanLabel(btn),
    };
  })()`);

  if (!rect || !rect.visible) {
    throw new Error(`Bottom nav tab "${tabName}" not found/visible on ${target}`);
  }
  await session.clickAt(rect.x, rect.y, 35);

  await settleFiniteEntranceAnimations(
    session,
    target === 'main' ? '.sheet-panel' : '#sheet-panel',
    {
      backdropSelector: target === 'standalone' ? '#sheet-backdrop' : null,
      mountTimeoutMs: 3000,
      naturalWaitMs: 700,
      settleTimeoutMs: 4000,
      requireSheetInView: true,
      label: `${target} sheet panel settled for tab "${tabName}"`,
    },
  );
}

export async function closeActiveSheet(session, target) {
  const isSheetClosed = async () =>
    session.evaluate(
      target === 'main'
        ? `(() => {
            const panels = [...document.querySelectorAll('.sheet-panel, .modal-card')];
            return panels.every((p) => {
              if (!p || p.classList.contains('hidden')) return true;
              const cs = getComputedStyle(p);
              if (cs.display === 'none' || cs.visibility === 'hidden') return true;
              const r = p.getBoundingClientRect();
              return r.width <= 0 || r.height <= 0;
            });
          })()`
        : `(() => {
            const bd = document.getElementById('sheet-backdrop');
            if (!bd || bd.classList.contains('hidden')) return true;
            const cs = getComputedStyle(bd);
            return cs.display === 'none' || cs.visibility === 'hidden';
          })()`,
    );

  // Return early ONLY if no sheet/modal is currently open
  if (await isSheetClosed()) return;

  const findCloseBtn = async () =>
    session.evaluate(`(() => {
      const target = ${JSON.stringify(target)};
      const selectors = target === 'main'
        ? [
            '.modal-card button[aria-label*="close" i]',
            '.modal-card .modal-header button.icon-btn',
            '.modal-card .modal-header button',
            '.modal-card .sheet-header button[aria-label*="close" i]',
            '.modal-card .sheet-header button.icon-btn',
            '.sheet-header button[aria-label*="close" i]',
            '.sheet-header button.icon-btn',
            '.sheet-panel button[aria-label*="close" i]',
          ]
        : [
            '#sheet-close',
            '#sheet-panel button[aria-label*="close" i]',
          ];
      let btn = null;
      for (const sel of selectors) {
        const candidates = [...document.querySelectorAll(sel)];
        btn = candidates.find((el) => {
          if (!el || el.classList?.contains('hidden')) return false;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }) || null;
        if (btn) break;
      }
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const obstructed = Boolean(!hit || (hit !== btn && !btn.contains(hit)));
      const hitTag = !hit
        ? 'off-viewport'
        : hit.id
          ? '#' + hit.id
          : hit.className
            ? hit.tagName.toLowerCase() + '.' + String(hit.className).trim().split(/\\s+/)[0]
            : hit.tagName.toLowerCase();
      return { x: cx, y: cy, obstructed, hitTag };
    })()`);

  for (let attempt = 0; attempt < 2; attempt++) {
    if (await isSheetClosed()) return;
    let btn = await findCloseBtn();
    if (!btn) {
      if (await isSheetClosed()) return;
      throw new Error(`Failed to close active ${target} sheet/modal: close button not found while sheet/modal is still open`);
    }

    if (btn.obstructed) {
      // Settle any stalled finite entrance animation before polling for unobstructed close button
      await settleFiniteEntranceAnimations(
        session,
        target === 'main' ? '.sheet-panel, .modal-card' : '#sheet-panel',
        {
          backdropSelector: target === 'standalone' ? '#sheet-backdrop' : null,
          mountTimeoutMs: 0,
          naturalWaitMs: 700,
          settleTimeoutMs: 300,
          throwIfMissing: false,
          label: `${target} sheet/modal settle before close`,
        },
      );
      if (await isSheetClosed()) return;

      let lastBtn = btn;
      let clearBtn = null;
      try {
        clearBtn = await waitFor(
          async () => {
            if (await isSheetClosed()) return { alreadyClosed: true };
            const b = await findCloseBtn();
            lastBtn = b;
            return b && !b.obstructed ? b : false;
          },
          { timeoutMs: 1200, intervalMs: 80, label: `${target} close button unobstructed` },
        );
      } catch {
        // Never blindly click an element still reporting obstructed === true
        if (await isSheetClosed()) return;
        throw new Error(
          `Failed to close active ${target} sheet/modal: close button remained obstructed (${lastBtn?.hitTag ?? 'missing'}) at (${lastBtn?.x?.toFixed(1) ?? '?'}, ${lastBtn?.y?.toFixed(1) ?? '?'})`,
        );
      }
      if (clearBtn?.alreadyClosed || (await isSheetClosed())) return;
      btn = clearBtn;
    }

    await session.clickAt(btn.x, btn.y, 30);
    try {
      await waitFor(isSheetClosed, { timeoutMs: 1200, intervalMs: 80, label: `${target} active sheet closed` });
      return;
    } catch {
      // retry once if sheet did not close on first attempt
    }
  }

  if (!(await isSheetClosed())) {
    throw new Error(`Failed to close active ${target} sheet/modal: still open after clicking close button`);
  }
}

export async function clickSubTab(session, target, labelPattern) {
  const rect = await session.evaluate(`(() => {
    const target = ${JSON.stringify(target)};
    const re = new RegExp(${JSON.stringify(labelPattern)}, 'i');
    const sel = target === 'main' ? '.sheet-tabs button.sheet-tab' : '#sheet-tabs button.stab, .sheet-tabs button';
    const tabs = [...document.querySelectorAll(sel)];
    const btn = tabs.find((b) => re.test((b.textContent || '').trim()));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (btn.textContent || '').trim() };
  })()`);

  if (!rect) {
    throw new Error(`Sub-tab matching /${labelPattern}/i not found on ${target}`);
  }
  await session.clickAt(rect.x, rect.y, 35);
  await sleep(140);
  return rect;
}

/**
 * Clicks a button inside the active sheet matching regex text (ignoring disabled unless allowDisabled=true).
 */
export async function clickSheetButton(session, target, textPattern, { allowDisabled = false, holdMs = 35 } = {}) {
  const rect = await session.evaluate(`(() => {
    const target = ${JSON.stringify(target)};
    const re = new RegExp(${JSON.stringify(textPattern)}, 'i');
    const allowDisabled = ${Boolean(allowDisabled)};
    const root = target === 'main'
      ? (document.querySelector('.sheet-panel') || document.querySelector('.modal-card'))
      : document.getElementById('sheet-panel');
    if (!root) return null;
    const btns = [...root.querySelectorAll('button')];
    const btn = btns.find((b) => {
      if (!allowDisabled && b.disabled) return false;
      const r = b.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      return re.test((b.textContent || '').trim());
    });
    if (!btn) return null;
    btn.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = btn.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      disabled: Boolean(btn.disabled),
      text: (btn.textContent || '').trim(),
    };
  })()`);

  if (!rect) {
    return null;
  }
  await session.clickAt(rect.x, rect.y, holdMs);
  await sleep(140);
  return rect;
}

/**
 * Opens Station 0 popover using real opaque-box pointer tap:
 * - main: clicks visible unlocked .station-badge inside .world-overlay-layer
 * - standalone: uses dual-mode resolver (window.__sizzleArtifact.getStationHitRegions -> geometric fallback)
 */
export async function openStation0Popover(session, target) {
  if (target === 'main') {
    const locateBadge = async () =>
      waitFor(
        async () =>
          session.evaluate(`(() => {
            const btn = document.querySelector('.world-overlay-layer .station-badge:not(.locked)');
            if (!btn) return null;
            const r = btn.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return null;
            if (r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight) return null;
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (btn.textContent || '').trim() };
          })()`),
        { timeoutMs: 6000, intervalMs: 120, label: 'main unlocked station-badge in viewport' },
      );

    const isPopoverMounted = async () =>
      session.evaluate(`(() => {
        const pop = document.querySelector('.station-popover');
        if (!pop || pop.classList.contains('hidden')) return false;
        const cs = getComputedStyle(pop);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = pop.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })()`);

    await waitAnimationFrames(session, 1);
    let badge = await locateBadge();
    await session.clickAt(badge.x, badge.y, 35);

    try {
      await waitFor(isPopoverMounted, { timeoutMs: 1800, intervalMs: 80, label: 'main .station-popover mounted' });
    } catch {
      // ONLY retry clicking .station-badge if .station-popover is NOT mounted in DOM!
      // Re-clicking while already mounted would toggle selectedStation(null) and close it.
      if (!(await isPopoverMounted())) {
        await waitAnimationFrames(session, 2);
        badge = await locateBadge();
        if (!(await isPopoverMounted())) {
          await session.clickAt(badge.x, badge.y, 35);
          await waitFor(isPopoverMounted, { timeoutMs: 3000, intervalMs: 80, label: 'main .station-popover mounted' });
        }
      }
    }

    await settleFiniteEntranceAnimations(session, '.station-popover', {
      mountTimeoutMs: 1000,
      naturalWaitMs: 700,
      settleTimeoutMs: 3000,
      label: 'main .station-popover settled',
    });
    return { source: 'station-badge', point: badge };
  }

  // Standalone dual-mode station hitbox resolver (TEST_INFRA & exp_standalone_surface §4.1)
  const locateStandaloneHit = async () =>
    session.evaluate(`(() => {
      const canvas = document.getElementById('world');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();

      if (window.__sizzleArtifact && typeof window.__sizzleArtifact.getStationHitRegions === 'function') {
        const regions = window.__sizzleArtifact.getStationHitRegions() || [];
        const h = regions.find((item) => item && (item.index === 0 || item.idx === 0)) || regions[0];
        if (h && typeof h.x === 'number' && typeof h.y === 'number') {
          const cx = typeof h.w === 'number' ? h.x + h.w / 2 : h.x;
          const cy = typeof h.h === 'number' ? h.y + h.h / 2 : h.y;
          return { x: rect.left + cx, y: rect.top + cy, source: 'artifact-hook' };
        }
      }

      // Verified geometric fallback for Venue 0 Station 0 (x=0, y=1.65, z=-2.0, cameraPanY=0)
      const W = Math.max(300, rect.width);
      const H = Math.max(400, rect.height);
      const scale = Math.min(W / 10.6, H / 16.5);
      const sx = W * 0.5;
      const sy = H * 0.5 + -2.0 * scale * 0.72 - 1.65 * scale * 0.92;
      return { x: rect.left + sx, y: rect.top + (sy - 3), source: 'geometric-fallback' };
    })()`);

  const isStandalonePopoverMounted = async () =>
    session.evaluate(`(() => {
      const pop = document.getElementById('station-pop');
      if (!pop || pop.classList.contains('hidden')) return false;
      const cs = getComputedStyle(pop);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = pop.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })()`);

  let hit = await locateStandaloneHit();
  if (!hit) {
    throw new Error('Standalone canvas#world not found for station tap');
  }

  await session.clickAt(hit.x, hit.y, 35);
  try {
    await waitFor(isStandalonePopoverMounted, {
      timeoutMs: 1800,
      intervalMs: 80,
      label: `standalone #station-pop mounted (tap at ${hit.x.toFixed(1)},${hit.y.toFixed(1)} via ${hit.source})`,
    });
  } catch {
    if (!(await isStandalonePopoverMounted())) {
      await waitAnimationFrames(session, 2);
      hit = (await locateStandaloneHit()) || hit;
      if (!(await isStandalonePopoverMounted())) {
        await session.clickAt(hit.x, hit.y, 35);
        await waitFor(isStandalonePopoverMounted, {
          timeoutMs: 3000,
          intervalMs: 80,
          label: `standalone #station-pop mounted (tap at ${hit.x.toFixed(1)},${hit.y.toFixed(1)} via ${hit.source})`,
        });
      }
    }
  }

  await settleFiniteEntranceAnimations(session, '#station-pop', {
    mountTimeoutMs: 1000,
    naturalWaitMs: 700,
    settleTimeoutMs: 3000,
    label: `standalone #station-pop settled (tap at ${hit.x.toFixed(1)},${hit.y.toFixed(1)} via ${hit.source})`,
  });
  return { source: hit.source, point: hit };
}

export async function closeStationPopover(session, target) {
  const pos = await session.evaluate(
    target === 'main'
      ? `(() => {
          const btn = document.querySelector('.station-popover .popover-header button.icon-btn, .station-popover button[aria-label*="close" i]');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        })()`
      : `(() => {
          const btn = document.getElementById('pop-close');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        })()`,
  );
  if (pos) {
    await session.clickAt(pos.x, pos.y, 30);
    await sleep(120);
  }
}

export async function readStationPopoverInfo(session, target) {
  return session.evaluate(
    target === 'main'
      ? `(() => {
          const pop = document.querySelector('.station-popover');
          if (!pop) return null;
          const titleText = (pop.querySelector('.popover-title')?.textContent || '').trim();
          const lvMatch = /Level\\s+(\\d+)/i.exec(titleText);
          const buyBtn = pop.querySelector('button.hold-upgrade-btn');
          const buyRect = buyBtn ? buyBtn.getBoundingClientRect() : null;
          return {
            titleText,
            level: lvMatch ? Number(lvMatch[1]) : null,
            buyDisabled: Boolean(buyBtn?.disabled),
            buyText: (buyBtn?.textContent || '').trim(),
            buyRect: buyRect ? { x: buyRect.left + buyRect.width / 2, y: buyRect.top + buyRect.height / 2, height: buyRect.height } : null,
          };
        })()`
      : `(() => {
          const pop = document.getElementById('station-pop');
          if (!pop || pop.classList.contains('hidden')) return null;
          const name = (document.getElementById('pop-name')?.textContent || '').trim();
          const meta = (document.getElementById('pop-meta')?.textContent || '').trim();
          const lvMatch = /Level\\s+(\\d+)/i.exec(meta);
          const buyBtn = document.getElementById('pop-buy');
          const buyRect = buyBtn ? buyBtn.getBoundingClientRect() : null;
          return {
            titleText: name + ' ' + meta,
            level: lvMatch ? Number(lvMatch[1]) : null,
            buyDisabled: Boolean(buyBtn?.disabled),
            buyText: (buyBtn?.textContent || '').trim(),
            buyRect: buyRect ? { x: buyRect.left + buyRect.width / 2, y: buyRect.top + buyRect.height / 2, height: buyRect.height } : null,
          };
        })()`,
  );
}

/**
 * Clicks Boost button (unlocks Web Audio via real user gesture + activates profit boost).
 */
export async function activateBoost(session, target) {
  const sel = target === 'main' ? '.top-hud button.boost-pill' : '#btn-boost';
  const info = await session.clickElement(sel, 35);
  await sleep(180);
  return info;
}

/**
 * Clicks Helper Chef skill button (available immediately at boot on both targets).
 */
export async function activateHelper(session, target) {
  const pos = await session.evaluate(
    target === 'main'
      ? `(() => {
          const btn = document.querySelector('.skills-rail button.skill-fab[title*="Helper" i], .skills-rail button.skill-fab[title*="Guest Chef" i]') ||
            [...document.querySelectorAll('.skills-rail button.skill-fab')].find((b) => /helper/i.test(b.textContent || ''));
          if (!btn || btn.disabled) return null;
          const r = btn.getBoundingClientRect();
          return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (btn.textContent || '').trim() } : null;
        })()`
      : `(() => {
          const btn = document.getElementById('fab-helper');
          if (!btn || btn.disabled || btn.classList.contains('hidden')) return null;
          const r = btn.getBoundingClientRect();
          return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (btn.textContent || '').trim() } : null;
        })()`,
  );

  if (!pos) {
    throw new Error(`Helper skill button not found or disabled on ${target}`);
  }
  await session.clickAt(pos.x, pos.y, 35);
  await sleep(160);
  return pos;
}

/**
 * Inspects computed CSS surface luminance & foreground text contrast for a selector.
 * Walks ancestors from textChildSelector up toward el so white text on an opaque colored
 * header ribbon (e.g. .sheet-header / .popover-header) is NEVER mis-paired against el's cream surface.
 */
export async function inspectCssSurface(session, selector, textChildSelector = null) {
  const raw = await session.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || cs.display === 'none' || cs.visibility === 'hidden') {
      return { found: true, visible: false };
    }

    const parseAlpha = (val) => {
      if (!val) return 0;
      const s = String(val).trim();
      if (!s || s === 'transparent' || s === 'none') return 0;
      // 1. Explicit 4-argument comma syntax: rgba(r, g, b, a) or rgb(r, g, b, a)
      const comma4M = /^rgba?\\(\\s*[0-9.]+%?\\s*,\\s*[0-9.]+%?\\s*,\\s*[0-9.]+%?\\s*,\\s*([0-9]*\\.?[0-9]+)(%?)\\s*\\)$/i.exec(s);
      if (comma4M) {
        const a = Number(comma4M[1]);
        return comma4M[2] === '%' ? a / 100 : a;
      }
      // 2. CSS Color 4 slash syntax: rgb(r g b / a), rgba(r g b / a), color(srgb r g b / a)
      const slashM = /^(?:rgba?|color)\\([^/)]+\\/\\s*([0-9]*\\.?[0-9]+)(%?)\\s*\\)$/i.exec(s);
      if (slashM) {
        const a = Number(slashM[1]);
        return slashM[2] === '%' ? a / 100 : a;
      }
      // 3. Valid 3-argument rgb(r, g, b) / space rgb(r g b) / color(srgb r g b) without slash alpha -> opaque (1)
      if (/^rgba?\\(\\s*[0-9.]+%?(?:\\s*,\\s*|\\s+)[0-9.]+%?(?:\\s*,\\s*|\\s+)[0-9.]+%?\\s*\\)$/i.test(s)) {
        return 1;
      }
      if (/^color\\(\\s*[a-z0-9-]+\\s+[^/)]+\\)$/i.test(s)) {
        return 1;
      }
      return 0;
    };

    const hasOpaqueGradient = (bgImg) => {
      if (!bgImg || bgImg === 'none' || !bgImg.includes('gradient(')) return false;
      const tokens = bgImg.match(/color\\(\\s*srgb\\s+[^)]+\\)|rgba?\\([^)]+\\)/gi) || [];
      return tokens.some((tok) => parseAlpha(tok) >= 0.5);
    };

    const hasOwnOpaquePaint = (node) => {
      const ncs = getComputedStyle(node);
      return parseAlpha(ncs.backgroundColor) >= 0.5 || hasOpaqueGradient(ncs.backgroundImage);
    };

    const sitsDirectlyOnRoot = (node, root) => {
      let cur = node;
      while (cur && cur !== root) {
        if (hasOwnOpaquePaint(cur)) return false;
        cur = cur.parentElement;
      }
      return cur === root;
    };

    const isNodeVisible = (node) => {
      if (!node) return false;
      const nr = node.getBoundingClientRect();
      const ncs = getComputedStyle(node);
      return nr.width > 0 && nr.height > 0 && ncs.display !== 'none' && ncs.visibility !== 'hidden';
    };

    const hasDirectText = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3 && (child.nodeValue || '').trim().length > 0) return true;
      }
      return false;
    };

    const reqTextSel = ${JSON.stringify(textChildSelector)};
    const reqTextEl = reqTextSel ? el.querySelector(reqTextSel) : null;
    let resolvedColor = cs.color;
    let fgSource = 'root';

    if (reqTextEl && isNodeVisible(reqTextEl) && sitsDirectlyOnRoot(reqTextEl, el)) {
      resolvedColor = getComputedStyle(reqTextEl).color;
      fgSource = reqTextSel;
    } else {
      // Explicit selector-priority passes (preferring direct non-whitespace text nodes before container wrappers)
      const priorityPasses = ['.sheet-body, #sheet-body, .popover-stats', '.item-card, .card', 'p, span, div'];
      let directBody = null;
      for (const passSel of priorityPasses) {
        const candidates = [...el.querySelectorAll(passSel)].filter((node) => {
          if (!node || !isNodeVisible(node) || !sitsDirectlyOnRoot(node, el)) return false;
          return (node.textContent || '').trim().length > 0;
        });
        if (candidates.length === 0) continue;
        directBody = candidates.find(hasDirectText) || candidates[0];
        if (directBody) break;
      }
      if (directBody) {
        resolvedColor = getComputedStyle(directBody).color;
        fgSource = directBody.className
          ? '.' + String(directBody.className).trim().split(/\\s+/)[0]
          : directBody.id
            ? '#' + directBody.id
            : directBody.tagName.toLowerCase();
      }
    }

    return {
      found: true,
      visible: true,
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      color: resolvedColor,
      fgSource,
    };
  })()`);

  if (!raw || !raw.found || !raw.visible) {
    return { found: Boolean(raw?.found), visible: false, selector };
  }

  return {
    found: true,
    visible: true,
    selector,
    raw,
    ...evaluateComputedSurface(raw),
  };
}

/**
 * Detects a visible Crate Opening Reveal Modal (semantic detection resilient to M3/M5 naming).
 * Always selects the innermost visible modal container and excludes modal wrappers when counting cards.
 */
export async function detectCrateRevealModal(session, target) {
  return session.evaluate(`(() => {
    const target = ${JSON.stringify(target)};
    const isVisible = (el) => {
      if (!el) return false;
      if (el.classList?.contains('hidden')) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
      const r = el.getBoundingClientRect();
      return r.width > 120 && r.height > 120;
    };

    const TAP_OPEN_RE = /tap\\s*to\\s*open|burst\\s*open|open\\s*(?:crate|box|chest)|smash|unbox|crack/i;
    const DISMISS_RE = /awesome|collect|claim|continue|nice|great|ok|done|close|sweet|yay|got\\s*it|woohoo/i;

    const btnLabel = (b) =>
      ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).trim();

    const findTapToOpenBtn = (root) => {
      const btns = [...root.querySelectorAll('button')];
      return btns.find((b) => {
        const r = b.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || b.disabled) return false;
        return TAP_OPEN_RE.test(btnLabel(b));
      }) || null;
    };

    const findDismissBtn = (root, tapOpenBtn) => {
      const btns = [...root.querySelectorAll('button')].filter((b) => {
        if (b === tapOpenBtn) return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !b.disabled;
      });
      return (
        btns.find((b) => DISMISS_RE.test(btnLabel(b))) ||
        btns.find((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 50 && r.height >= 28;
        }) ||
        null
      );
    };

    const countRewardCards = (root) => {
      const WRAPPER_CLS_RE = /(?:modal|backdrop|overlay|grid|list|wrap|container|header|footer|title|body|actions|buttons)/i;
      const INLINE_TAGS = new Set(['SPAN', 'B', 'STRONG', 'SMALL', 'I', 'EM', 'SVG', 'PATH', 'IMG', 'P', 'H1', 'H2', 'H3', 'H4', 'BUTTON']);

      const isValidCardBox = (el) => {
        if (!el || el === root) return false;
        if (el.classList?.contains('modal-card') || /modal-card/i.test(String(el.className || ''))) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
        const r = el.getBoundingClientRect();
        return r.width >= 30 && r.height >= 24;
      };

      const explicitSelector =
        '.item-card-col, .item-card, .card, .card-col, ' +
        '[class*="crate-card" i], [class*="box-card" i], [class*="reveal-card" i], ' +
        '[class*="loot-card" i], [class*="reward-card" i], [class*="drop-card" i]';

      const explicitMatches = [...root.querySelectorAll(explicitSelector)].filter(isValidCardBox);
      if (explicitMatches.length > 0) {
        return explicitMatches.filter((el) => !explicitMatches.some((o) => o !== el && o.contains(el))).length;
      }

      const broadSelector =
        '[class*="reward" i], [class*="drop" i], [class*="loot" i], [class*="rarity-" i], [class*="item" i]';
      const broadMatches = [...root.querySelectorAll(broadSelector)].filter((el) => {
        if (!isValidCardBox(el)) return false;
        if (INLINE_TAGS.has((el.tagName || '').toUpperCase())) return false;
        if (WRAPPER_CLS_RE.test(String(el.className || ''))) return false;
        return true;
      });
      if (broadMatches.length === 0) return 0;

      // Drop container elements that wrap 2+ matched cards, then deduplicate inner parts
      const withoutMultiContainers = broadMatches.filter(
        (el) => broadMatches.filter((o) => o !== el && el.contains(o)).length < 2,
      );
      return withoutMultiContainers.filter((el) => !withoutMultiContainers.some((o) => o !== el && o.contains(el))).length;
    };

    const rectOf = (btn) => {
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (btn.textContent || '').trim() };
    };

    if (target === 'main') {
      const modals = [...document.querySelectorAll('.sheet-backdrop.modal-center .modal-card, .modal-card')].filter(isVisible);
      const modal = modals[modals.length - 1] || null;
      if (!modal) return { found: false, cardCount: 0, dismissBtn: null, tapToOpenBtn: null };
      const tapToOpen = findTapToOpenBtn(modal);
      const dismiss = findDismissBtn(modal, tapToOpen);
      return {
        found: true,
        cardCount: countRewardCards(modal),
        textSnippet: (modal.textContent || '').trim().slice(0, 140),
        tapToOpenBtn: rectOf(tapToOpen),
        dismissBtn: rectOf(dismiss),
      };
    }

    // Standalone: look for a visible dedicated modal/dialog overlay distinct from #sheet-panel and #toast-box
    const candidates = [
      ...document.querySelectorAll(
        '[id*="crate" i], [id*="box" i], [id*="reveal" i], [id*="reward" i], [id*="modal" i], ' +
        '[class*="crate" i], [class*="reveal" i], [class*="modal-card" i], [class*="celebrat" i], [role="dialog"]'
      ),
    ].filter((el) => {
      if (el.id === 'sheet-backdrop' || el.id === 'sheet-panel' || el.id === 'toast-box' || el.id === 'station-pop') return false;
      if (el.closest('#sheet-panel') || el.closest('#toast-box') || el.closest('#station-pop')) return false;
      return isVisible(el);
    });

    // Prefer the INNERMOST visible modal container holding a dismiss or tap-to-open button
    const reversed = [...candidates].reverse();
    const match =
      reversed.find((el) => Boolean(findDismissBtn(el, findTapToOpenBtn(el)) || findTapToOpenBtn(el))) ||
      reversed[0];
    if (!match) return { found: false, cardCount: 0, dismissBtn: null, tapToOpenBtn: null };

    const tapToOpen = findTapToOpenBtn(match);
    const dismiss = findDismissBtn(match, tapToOpen);
    return {
      found: true,
      id: match.id || null,
      className: String(match.className || ''),
      cardCount: countRewardCards(match),
      textSnippet: (match.textContent || '').trim().slice(0, 140),
      tapToOpenBtn: rectOf(tapToOpen),
      dismissBtn: rectOf(dismiss),
    };
  })()`);
}

/**
 * Polls for the Crate Opening Reveal Modal to finish any shake/stagger animation and display
 * reward cards + dismiss button. If an intermediate "Tap to Open" button appears, clicks it once.
 * Catches timeout cleanly and returns the latest detection snapshot.
 */
export async function waitForCrateRevealModal(session, target, { minCards = 1, timeoutMs = 6000 } = {}) {
  let latest = { found: false, cardCount: 0, dismissBtn: null, tapToOpenBtn: null };
  let clickedTapToOpen = false;
  let phaseStartMs = Date.now();
  let settlePasses = 0;

  const modalSelector =
    target === 'main'
      ? '.sheet-backdrop.modal-center .modal-card, .modal-card'
      : '.modal-card, [class*="crate" i], [class*="modal" i], [id*="crate" i], [id*="reveal" i], [id*="modal" i], [role="dialog"]';
  const excludeSelectors =
    target === 'standalone' ? ['#sheet-backdrop', '#sheet-panel', '#toast-box', '#station-pop'] : [];

  try {
    return await waitFor(
      async () => {
        latest = await detectCrateRevealModal(session, target);
        if (latest.found && latest.cardCount < minCards && latest.tapToOpenBtn && !clickedTapToOpen) {
          clickedTapToOpen = true;
          phaseStartMs = Date.now();
          settlePasses = 0;
          await session.clickAt(latest.tapToOpenBtn.x, latest.tapToOpenBtn.y, 35);
          return false;
        }
        if (latest.found && latest.cardCount >= minCards && latest.dismissBtn) {
          // Ensure modal itself isn't frozen mid-entrance before screenshots or dismiss clicks
          await settleFiniteEntranceAnimations(session, modalSelector, {
            mountTimeoutMs: 0,
            naturalWaitMs: 350,
            settleTimeoutMs: 300,
            minWidth: 120,
            minHeight: 120,
            excludeSelectors,
            throwIfMissing: false,
            label: `${target} crate modal settled`,
          });
          latest = await detectCrateRevealModal(session, target);
          if (latest.found && latest.cardCount >= minCards && latest.dismissBtn) {
            return latest;
          }
          return false;
        }

        // Guard against Chromium 156 headless freezing modalPopIn / card reveal at currentTime===0 (opacity: 0)
        const elapsed = Date.now() - phaseStartMs;
        if ((settlePasses === 0 && elapsed >= 700) || (settlePasses === 1 && elapsed >= 1350)) {
          settlePasses += 1;
          await settleFiniteEntranceAnimations(session, modalSelector, {
            mountTimeoutMs: 0,
            naturalWaitMs: 0,
            settleTimeoutMs: 250,
            minWidth: 120,
            minHeight: 120,
            excludeSelectors,
            checkSubtree: true,
            throwIfMissing: false,
            label: `${target} crate modal stalled entrance settle`,
          });
        }
        return false;
      },
      { timeoutMs, intervalMs: 120, label: `${target} Crate Opening Reveal Modal` },
    );
  } catch {
    return latest;
  }
}

/**
 * Clicks the Crate Reveal Modal dismiss button and verifies the modal actually closes.
 */
export async function dismissCrateRevealModal(session, target, modal, timeoutMs = 2000) {
  if (!modal?.dismissBtn) return false;
  await session.clickAt(modal.dismissBtn.x, modal.dismissBtn.y, 35);
  try {
    await waitFor(
      async () => {
        const after = await detectCrateRevealModal(session, target);
        return !after.found;
      },
      { timeoutMs, intervalMs: 100, label: `${target} Crate Reveal Modal dismissal` },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Samples N consecutive requestAnimationFrame frame deltas inside the browser.
 */
export async function sampleRafBudget(session, frames = THRESHOLDS.rafSampleFrames) {
  return session.evaluate(
    `new Promise((resolve) => {
      const timestamps = [];
      const jsWorkMs = [];
      const targetFrames = ${Number(frames)};
      function step(ts) {
        timestamps.push(ts);
        const jsStart = performance.now();
        setTimeout(() => {
          jsWorkMs.push(performance.now() - jsStart);
        }, 0);
        if (timestamps.length >= targetFrames) {
          setTimeout(() => {
            const deltas = [];
            for (let i = 1; i < timestamps.length; i++) {
              deltas.push(timestamps[i] - timestamps[i - 1]);
            }
            const sorted = [...deltas].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)] || 0;
            const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
            const max = sorted[sorted.length - 1] || 0;
            const avg = deltas.reduce((s, v) => s + v, 0) / (deltas.length || 1);
            const jsSorted = [...jsWorkMs].sort((a, b) => a - b);
            const jsMedian = jsSorted[Math.floor(jsSorted.length / 2)] || 0;
            const mem = performance && performance.memory
              ? Math.round((performance.memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10
              : null;
            resolve({
              frames: timestamps.length,
              medianDeltaMs: Math.round(median * 100) / 100,
              p95DeltaMs: Math.round(p95 * 100) / 100,
              maxDeltaMs: Math.round(max * 100) / 100,
              jsMedianMs: Math.round(jsMedian * 100) / 100,
              avgFps: avg > 0 ? Math.round((1000 / avg) * 10) / 10 : 0,
              domNodes: document.querySelectorAll('*').length,
              heapUsedMb: mem,
            });
          }, 20);
          return;
        }
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    })`,
    { awaitPromise: true, timeoutMs: Math.max(75000, frames * 2500) },
  );
}
