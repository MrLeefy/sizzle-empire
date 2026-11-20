import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerEphemeralDir, sleep, unregisterEphemeralDir } from '../lib/cdpClient.mjs';
import {
  CORE_OFFLINE_SFX_MAIN,
  CORE_OFFLINE_SFX_STANDALONE,
  DIST_DIR,
  DIST_JS_VENDOR_ALLOWLIST,
  FORBIDDEN_CDN_HOSTS,
  MAIN_FORBIDDEN_INLINE_STYLE_PATTERNS,
  MAIN_FORBIDDEN_INLINE_TOKENS,
  MAIN_FORBIDDEN_SHELL_TOKENS,
  PUBLIC_DIR,
  REPO_ROOT,
  SRC_DIR,
  STANDALONE_FORBIDDEN_CSS_TOKENS,
  STANDALONE_HTML,
  STANDALONE_METADATA,
  THRESHOLDS,
  XML_NAMESPACE_ALLOWLIST,
} from '../lib/config.mjs';
import { analyzeImage } from '../lib/imageAnalyzer.mjs';
import {
  activateBoost,
  bootTargetSession,
  closeActiveSheet,
  closeStationPopover,
  inspectCssSurface,
  openBottomTab,
  openStation0Popover,
  readAudioStatus,
} from '../lib/targetHelpers.mjs';

const URL_RE = /https?:\/\/[^\s"'`)<>\\]+/gi;

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function isUrlAllowed(url, allowlist) {
  const lower = url.toLowerCase();
  return allowlist.some((prefix) => lower.startsWith(prefix.toLowerCase()));
}

function scanTextForUrls(text, relPath, allowlist, findings) {
  let match;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    const rawUrl = match[0].replace(/[.,;:'")\]}]+$/, '');
    if (!isUrlAllowed(rawUrl, allowlist)) {
      findings.push(`${relPath}: disallowed URL ${rawUrl}`);
    }
  }
  const lower = text.toLowerCase();
  for (const host of FORBIDDEN_CDN_HOSTS) {
    if (lower.includes(host)) {
      findings.push(`${relPath}: forbidden CDN host "${host}"`);
    }
  }
}

/**
 * Verifies every `localStorage` reference inside inline <script> blocks sits inside a `try { ... } catch` scope.
 */
export function checkLocalStorageTryCatch(html) {
  const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const unguarded = [];
  let totalRefs = 0;

  for (const m of scriptMatches) {
    const code = m[1];
    // Single left-to-right lexical pass strips comments and string/template literals while
    // preserving newlines and character offsets so '//' inside URLs and '}' inside multi-line
    // template literals never corrupt brace tracking.
    const clean = code.replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g,
      (s) => s.replace(/[^\n]/g, ' '),
    );

    const refRe = /\blocalStorage\b/g;
    let rm;
    while ((rm = refRe.exec(clean)) !== null) {
      totalRefs += 1;
      const idx = rm.index;
      // Walk backward from idx tracking brace depth to find enclosing `try {` block
      let depth = 0;
      let insideTry = false;
      for (let i = idx - 1; i >= 0; i--) {
        const ch = clean[i];
        if (ch === '}') {
          depth += 1;
        } else if (ch === '{') {
          if (depth === 0) {
            const before = clean.slice(Math.max(0, i - 16), i);
            if (/\btry\s*$/.test(before)) {
              insideTry = true;
              break;
            }
          } else {
            depth -= 1;
          }
        }
      }
      if (!insideTry) {
        const lineNum = code.slice(0, idx).split('\n').length;
        unguarded.push(`script line ~${lineNum}`);
      }
    }
  }

  return { totalRefs, unguarded };
}

function checkTokenMatches(text, tokens) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const tok of tokens) {
    if (lower.includes(tok.toLowerCase())) {
      hits.push(tok);
    }
  }
  return hits;
}

export async function runTier1(runner, { targets, staticUrl }) {
  // =========================================================================
  // T1.1: Static Offline & Zero-External-URL Audit
  // =========================================================================
  if (targets.includes('main')) {
    await runner.runTest(
      { id: 'T1.1-main', tier: 1, target: 'main', name: 'Static offline & zero-external-URL audit' },
      async (ctx) => {
        const requiredDist = [
          path.join(DIST_DIR, 'index.html'),
          path.join(DIST_DIR, 'manifest.webmanifest'),
          path.join(DIST_DIR, 'sw.js'),
        ];
        for (const f of requiredDist) {
          ctx.assert(fs.existsSync(f) && fs.statSync(f).size > 0, `Missing or empty build artifact: ${f}`);
        }

        const strictFiles = [
          path.join(REPO_ROOT, 'index.html'),
          path.join(REPO_ROOT, 'vite.config.ts'),
          path.join(REPO_ROOT, 'capacitor.config.ts'),
          ...walkFiles(SRC_DIR),
          ...walkFiles(PUBLIC_DIR),
        ];

        const distFiles = walkFiles(DIST_DIR);
        const distJsFiles = [];
        for (const f of distFiles) {
          const ext = path.extname(f).toLowerCase();
          if (ext === '.js' || ext === '.mjs') {
            // dist/sw.js gets strict audit; minified bundles get vendor-string allowlist
            if (path.basename(f) === 'sw.js') strictFiles.push(f);
            else distJsFiles.push(f);
          } else if (['.html', '.css', '.svg', '.webmanifest', '.json'].includes(ext)) {
            strictFiles.push(f);
          }
        }

        const findings = [];
        for (const f of strictFiles) {
          if (!fs.existsSync(f)) continue;
          const text = fs.readFileSync(f, 'utf8');
          scanTextForUrls(text, path.relative(REPO_ROOT, f), XML_NAMESPACE_ALLOWLIST, findings);
        }
        for (const f of distJsFiles) {
          const text = fs.readFileSync(f, 'utf8');
          scanTextForUrls(text, path.relative(REPO_ROOT, f), DIST_JS_VENDOR_ALLOWLIST, findings);
        }

        ctx.assert(
          findings.length === 0,
          `Found ${findings.length} disallowed external URL/CDN reference(s): ${findings.slice(0, 6).join('; ')}`,
        );
        ctx.detail(`scanned ${strictFiles.length} strict files + ${distJsFiles.length} dist JS chunks, 0 external URLs`);
      },
    );
  }

  if (targets.includes('standalone')) {
    await runner.runTest(
      { id: 'T1.1-standalone', tier: 1, target: 'standalone', name: 'Static offline, metadata & classic script audit' },
      async (ctx) => {
        ctx.assert(fs.existsSync(STANDALONE_HTML), `Missing standalone artifact: ${STANDALONE_HTML}`);
        ctx.assert(fs.existsSync(STANDALONE_METADATA), `Missing standalone metadata: ${STANDALONE_METADATA}`);

        const meta = JSON.parse(fs.readFileSync(STANDALONE_METADATA, 'utf8'));
        ctx.assertEqual(meta.userFacing, true, 'sizzle_empire.html.metadata.json userFacing');
        ctx.assert(
          typeof meta.summary === 'string' && meta.summary.trim().length > 10,
          'sizzle_empire.html.metadata.json summary must be non-empty',
        );

        const html = fs.readFileSync(STANDALONE_HTML, 'utf8');
        const failures = [];

        scanTextForUrls(html, 'sizzle_empire.html', XML_NAMESPACE_ALLOWLIST, failures);

        const forbiddenPatterns = [
          { re: /<link\b/gi, label: '<link> tag' },
          { re: /@import\b/gi, label: 'CSS @import' },
          { re: /url\(\s*['"]?https?:/gi, label: 'CSS external url()' },
          { re: /\bfetch\s*\(/g, label: 'fetch() call' },
          { re: /\bXMLHttpRequest\b/g, label: 'XMLHttpRequest' },
          { re: /\bWebSocket\b/g, label: 'WebSocket' },
          { re: /cloudflare/gi, label: 'cloudflare host' },
          { re: /<script[^>]*\btype\s*=\s*['"]?module/gi, label: '<script type="module">' },
        ];
        for (const p of forbiddenPatterns) {
          const hits = html.match(p.re);
          if (hits && hits.length > 0) {
            failures.push(`forbidden ${p.label} (${hits.length} hit(s))`);
          }
        }

        const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
        if (scriptTags.length === 0) {
          failures.push('missing classic inline <script> tag');
        }

        const lsCheck = checkLocalStorageTryCatch(html);
        if (lsCheck.unguarded.length > 0) {
          failures.push(`unguarded localStorage access at ${lsCheck.unguarded.join(', ')}`);
        }

        ctx.assert(failures.length === 0, failures.join('; '));
        ctx.detail(
          `${html.length} bytes, userFacing=true, ${scriptTags.length} classic <script>, ${lsCheck.totalRefs} try/catch localStorage refs`,
        );
      },
    );
  }

  // =========================================================================
  // T1.2: Bright Warm PWA / Capacitor / UI Static Theme Audit
  // =========================================================================
  if (targets.includes('main')) {
    await runner.runTest(
      { id: 'T1.2-main', tier: 1, target: 'main', name: 'Bright warm PWA/Capacitor/UI static theme audit' },
      async (ctx) => {
        const failures = [];

        const distCssFiles = walkFiles(path.join(DIST_DIR, 'assets')).filter((f) => f.endsWith('.css'));
        if (distCssFiles.length < 1) {
          failures.push('missing built CSS bundle(s) in dist/assets/*.css');
        }

        const shellFiles = [
          path.join(REPO_ROOT, 'index.html'),
          path.join(DIST_DIR, 'index.html'),
          path.join(REPO_ROOT, 'vite.config.ts'),
          path.join(DIST_DIR, 'manifest.webmanifest'),
          path.join(REPO_ROOT, 'capacitor.config.ts'),
          path.join(REPO_ROOT, 'src/native/capacitorBridge.ts'),
          path.join(SRC_DIR, 'ui', 'styles.css'),
          ...distCssFiles,
        ];

        for (const f of shellFiles) {
          if (!fs.existsSync(f)) {
            failures.push(`missing expected file ${path.relative(REPO_ROOT, f)}`);
            continue;
          }
          const content = fs.readFileSync(f, 'utf8');
          const hits = checkTokenMatches(content, MAIN_FORBIDDEN_SHELL_TOKENS);
          if (hits.length > 0) {
            failures.push(`${path.relative(REPO_ROOT, f)} contains legacy dark-purple token(s): ${hits.join(', ')}`);
          }
        }

        const uiDir = path.join(SRC_DIR, 'ui');
        const tsxFiles = walkFiles(uiDir).filter((f) => f.endsWith('.tsx'));
        let inlineViolatingFiles = 0;
        for (const f of tsxFiles) {
          const content = fs.readFileSync(f, 'utf8');
          const hits = checkTokenMatches(content, MAIN_FORBIDDEN_INLINE_TOKENS);
          for (const pat of MAIN_FORBIDDEN_INLINE_STYLE_PATTERNS) {
            if (pat.re.test(content)) {
              hits.push(pat.label);
            }
          }
          if (hits.length > 0) {
            inlineViolatingFiles += 1;
            failures.push(`${path.relative(REPO_ROOT, f)} contains legacy dark inline token(s): ${hits.join(', ')}`);
          }
        }

        ctx.assert(
          failures.length === 0,
          `${failures.length} legacy dark-purple theme violation(s) (${inlineViolatingFiles} TSX files): ${failures.slice(0, 6).join(' | ')}`,
        );
        ctx.detail(`0 dark-purple tokens across ${shellFiles.length} shell/CSS files and ${tsxFiles.length} TSX files`);
      },
    );
  }

  if (targets.includes('standalone')) {
    await runner.runTest(
      { id: 'T1.2-standalone', tier: 1, target: 'standalone', name: 'Bright candy-cartoon CSS static theme audit' },
      async (ctx) => {
        const html = fs.readFileSync(STANDALONE_HTML, 'utf8');
        const hits = checkTokenMatches(html, STANDALONE_FORBIDDEN_CSS_TOKENS);
        ctx.assert(
          hits.length === 0,
          `sizzle_empire.html still contains ${hits.length} legacy dark-purple CSS token(s): ${hits.join(', ')}`,
        );
        ctx.detail('0 legacy dark-purple CSS tokens found in sizzle_empire.html');
      },
    );
  }

  // =========================================================================
  // T1.3 + T1.4: Clean Headless Boot & Visual Bright UI / Non-Blank Canvas
  // =========================================================================
  for (const target of targets) {
    let sharedSession = null;
    try {
      await runner.runTest(
        { id: `T1.3-${target}`, tier: 1, target, name: 'Clean headless Chromium boot, renderer & core DOM' },
        async (ctx) => {
          sharedSession = await bootTargetSession(target, { staticUrl });
          await sleep(450);

          const errReport = sharedSession.getErrorReport();
          ctx.assert(errReport.ok, `Runtime/network errors on boot: ${errReport.summary}`);

          if (target === 'main') {
            const probe = await sharedSession.evaluate(`(() => {
              const canvas = document.querySelector('.viewport-3d canvas');
              const gl2 = canvas ? Boolean(canvas.getContext('webgl2')) : false;
              const hud = document.querySelector('.top-hud');
              const cash = document.querySelector('.top-hud .currency-pill.cash');
              const gems = document.querySelector('.top-hud .currency-pill.gems');
              const boost = document.querySelector('.top-hud button.boost-pill');
              const banner = document.querySelector('.top-hud .city-banner');
              const navBtns = document.querySelectorAll('nav.bottom-nav button');
              const skills = document.querySelector('.skills-rail');
              const badges = document.querySelectorAll('.world-overlay-layer .station-badge');
              return {
                gl2,
                canvasW: canvas?.width || 0,
                canvasH: canvas?.height || 0,
                hasHud: Boolean(hud && hud.getBoundingClientRect().height > 0),
                hasCash: Boolean(cash && cash.textContent.trim().length > 0),
                hasGems: Boolean(gems && gems.textContent.trim().length > 0),
                hasBoost: Boolean(boost),
                hasBanner: Boolean(banner),
                navCount: navBtns.length,
                hasSkills: Boolean(skills),
                badgeCount: badges.length,
              };
            })()`);

            ctx.assert(probe.gl2, 'WebGL2 context is NOT active on .viewport-3d canvas');
            ctx.assert(probe.canvasW > 0 && probe.canvasH > 0, `Invalid canvas size ${probe.canvasW}x${probe.canvasH}`);
            ctx.assert(probe.hasHud && probe.hasCash && probe.hasGems && probe.hasBoost && probe.hasBanner, 'Top HUD elements missing');
            ctx.assertGte(probe.navCount, 7, 'Bottom nav tab count');
            ctx.assert(probe.hasSkills, 'Active skills rail missing');
            ctx.assertGte(probe.badgeCount, 1, 'Projected station badge count');
            ctx.detail(`WebGL2 active (${probe.canvasW}x${probe.canvasH}), ${probe.navCount} nav tabs, ${probe.badgeCount} badge(s), 0 errors`);
          } else {
            const probe = await sharedSession.evaluate(`(() => {
              const canvas = document.getElementById('world');
              const ctx2d = canvas ? Boolean(canvas.getContext('2d')) : false;
              const hud = document.querySelector('.top-hud');
              const cash = document.getElementById('hud-cash');
              const gems = document.getElementById('hud-gems');
              const boost = document.getElementById('btn-boost');
              const cityCard = document.querySelector('.city-card');
              const navBtns = document.querySelectorAll('.bottom-nav button, .bottom-nav .nav-tab');
              const skills = document.querySelector('.skills-rail');
              const helper = document.getElementById('fab-helper');
              return {
                ctx2d,
                canvasW: canvas?.width || 0,
                canvasH: canvas?.height || 0,
                hasHud: Boolean(hud && hud.getBoundingClientRect().height > 0),
                hasCash: Boolean(cash && cash.textContent.trim().length > 0),
                hasGems: Boolean(gems && gems.textContent.trim().length > 0),
                hasBoost: Boolean(boost),
                hasCityCard: Boolean(cityCard),
                navCount: navBtns.length,
                hasSkills: Boolean(skills),
                hasHelper: Boolean(helper && !helper.classList.contains('hidden')),
              };
            })()`);

            ctx.assert(probe.ctx2d, 'Canvas 2D context is NOT active on canvas#world');
            ctx.assert(probe.canvasW > 0 && probe.canvasH > 0, `Invalid canvas size ${probe.canvasW}x${probe.canvasH}`);
            ctx.assert(probe.hasHud && probe.hasCash && probe.hasGems && probe.hasBoost && probe.hasCityCard, 'Top HUD elements missing');
            ctx.assertGte(probe.navCount, 6, 'Bottom nav tab count');
            ctx.assert(probe.hasSkills && probe.hasHelper, 'Skills rail / Helper button missing');
            ctx.detail(`Canvas 2D active (${probe.canvasW}x${probe.canvasH}), ${probe.navCount} nav tabs, 0 errors`);
          }
        },
      );

      await runner.runTest(
        { id: `T1.4-${target}`, tier: 1, target, name: 'Non-blank rich canvas & bright candy-cartoon UI visual gate' },
        async (ctx) => {
          if (!sharedSession) {
            sharedSession = await bootTargetSession(target, { staticUrl });
            await sleep(450);
          }

          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sizzle_e2e_t1vis_'));
          registerEphemeralDir(tmpDir);
          try {
            const kitchenPng = path.join(tmpDir, `${target}_kitchen.png`);
            const sheetPng = path.join(tmpDir, `${target}_sheet.png`);

            await sharedSession.captureScreenshot(kitchenPng);
            const kStats = await analyzeImage(kitchenPng);

            const failures = [];

            // 1. Exact DPR-2 dimensions
            if (kStats.width !== THRESHOLDS.expectedPngWidth || kStats.height !== THRESHOLDS.expectedPngHeight) {
              failures.push(
                `kitchen PNG dims ${kStats.width}x${kStats.height} != ${THRESHOLDS.expectedPngWidth}x${THRESHOLDS.expectedPngHeight}`,
              );
            }

            // 2. Non-blank sunlit canvas richness
            const kFull = kStats.regions.full;
            const kCenter = kStats.regions.center;
            if (kFull.distinct_colors < THRESHOLDS.fullDistinctColorsMin) {
              failures.push(`kitchen full.distinct_colors=${kFull.distinct_colors} < ${THRESHOLDS.fullDistinctColorsMin}`);
            }
            if (kCenter.distinct_colors < THRESHOLDS.centerDistinctColorsMin) {
              failures.push(`kitchen center.distinct_colors=${kCenter.distinct_colors} < ${THRESHOLDS.centerDistinctColorsMin}`);
            }
            if (kCenter.luma_255 < THRESHOLDS.centerLumaMin) {
              failures.push(`kitchen center.luma_255=${kCenter.luma_255} < ${THRESHOLDS.centerLumaMin}`);
            }
            if (kCenter.mean_std_rgb < THRESHOLDS.centerMeanStdRgbMin) {
              failures.push(`kitchen center.mean_std_rgb=${kCenter.mean_std_rgb} < ${THRESHOLDS.centerMeanStdRgbMin}`);
            }
            if (kCenter.pct_dark_lt50 > THRESHOLDS.centerPctDarkMax) {
              failures.push(`kitchen center.pct_dark_lt50=${kCenter.pct_dark_lt50}% > ${THRESHOLDS.centerPctDarkMax}%`);
            }

            // 3. Bright UI Chrome on kitchen (Top HUD & Bottom Dock)
            const kTop = kStats.regions.top_hud;
            const kBot = kStats.regions.bottom_nav;
            if (kTop.luma_255 < THRESHOLDS.topHudLumaMin) {
              failures.push(`top_hud.luma_255=${kTop.luma_255} < ${THRESHOLDS.topHudLumaMin}`);
            }
            if (kTop.pct_dark_lt50 > THRESHOLDS.topHudPctDarkMax) {
              failures.push(`top_hud.pct_dark_lt50=${kTop.pct_dark_lt50}% > ${THRESHOLDS.topHudPctDarkMax}%`);
            }
            if (kBot.luma_255 < THRESHOLDS.bottomNavLumaMin) {
              failures.push(`bottom_nav.luma_255=${kBot.luma_255} < ${THRESHOLDS.bottomNavLumaMin}`);
            }
            if (kBot.pct_dark_lt50 > THRESHOLDS.bottomNavPctDarkMax) {
              failures.push(`bottom_nav.pct_dark_lt50=${kBot.pct_dark_lt50}% > ${THRESHOLDS.bottomNavPctDarkMax}%`);
            }

            // 4. Open Upgrades sheet & evaluate pixel brightness + computed CSS
            await openBottomTab(sharedSession, target, 'Upgrades');
            await sleep(250);
            await sharedSession.captureScreenshot(sheetPng);
            const sStats = await analyzeImage(sheetPng);

            const sPanel = sStats.regions.panel;
            const sFull = sStats.regions.full;
            if (sStats.width !== THRESHOLDS.expectedPngWidth || sStats.height !== THRESHOLDS.expectedPngHeight) {
              failures.push(
                `sheet PNG dims ${sStats.width}x${sStats.height} != ${THRESHOLDS.expectedPngWidth}x${THRESHOLDS.expectedPngHeight}`,
              );
            }
            if (sFull.distinct_colors < THRESHOLDS.fullDistinctColorsMin) {
              failures.push(`sheet full.distinct_colors=${sFull.distinct_colors} < ${THRESHOLDS.fullDistinctColorsMin}`);
            }
            if (sPanel.mean_std_rgb < THRESHOLDS.sheetPanelMeanStdRgbMin) {
              failures.push(`sheet panel.mean_std_rgb=${sPanel.mean_std_rgb} < ${THRESHOLDS.sheetPanelMeanStdRgbMin}`);
            }
            if (sPanel.luma_255 < THRESHOLDS.sheetPanelLumaMin) {
              failures.push(`sheet panel.luma_255=${sPanel.luma_255} < ${THRESHOLDS.sheetPanelLumaMin}`);
            }
            if (sPanel.pct_dark_lt50 > THRESHOLDS.sheetPanelPctDarkMax) {
              failures.push(`sheet panel.pct_dark_lt50=${sPanel.pct_dark_lt50}% > ${THRESHOLDS.sheetPanelPctDarkMax}%`);
            }
            if (sPanel.pct_bright_ge180 < THRESHOLDS.sheetPanelPctBrightMin) {
              failures.push(`sheet panel.pct_bright_ge180=${sPanel.pct_bright_ge180}% < ${THRESHOLDS.sheetPanelPctBrightMin}%`);
            }

            // Computed CSS luminance & WCAG ink contrast (solid + linear-gradient + color(srgb ...))
            const sheetSel = target === 'main' ? '.sheet-panel' : '#sheet-panel';
            const sheetTitleSel = target === 'main' ? '.sheet-title' : '#sheet-title';
            const citySel = target === 'main' ? '.top-hud .city-banner' : '.top-hud .city-card';
            const cityTextSel = target === 'main' ? '.city-banner-top' : '#hud-city';
            const popSel = target === 'main' ? '.station-popover' : '#station-pop';
            const popTextSel = target === 'main' ? '.popover-title' : '#pop-name';

            const sheetCss = await inspectCssSurface(sharedSession, sheetSel, sheetTitleSel);
            const cityCss = await inspectCssSurface(sharedSession, citySel, cityTextSel);

            await closeActiveSheet(sharedSession, target);
            await openStation0Popover(sharedSession, target);
            await sleep(200);
            const popCss = await inspectCssSurface(sharedSession, popSel, popTextSel);
            await closeStationPopover(sharedSession, target);

            for (const surface of [sheetCss, cityCss, popCss]) {
              if (!surface.visible) {
                failures.push(`${surface.selector} not visible for CSS luminance check`);
                continue;
              }
              if (!surface.ok || surface.source === 'transparent') {
                failures.push(`${surface.selector} has transparent/missing CSS background (source=${surface.source})`);
                continue;
              }
              if (surface.bgLuminance < THRESHOLDS.cssPanelWcagLumaMin) {
                failures.push(
                  `${surface.selector} WCAG bgLuma=${surface.bgLuminance} (${surface.source} rgb=${JSON.stringify(surface.meanBgRgb)}) < ${THRESHOLDS.cssPanelWcagLumaMin}`,
                );
              }
              if (surface.contrastRatio < THRESHOLDS.cssTextContrastMin) {
                failures.push(
                  `${surface.selector} text contrast=${surface.contrastRatio}:1 < ${THRESHOLDS.cssTextContrastMin}:1`,
                );
              }
            }

            const errReport = sharedSession.getErrorReport();
            if (!errReport.ok) {
              failures.push(`runtime errors: ${errReport.summary}`);
            }

            ctx.assert(failures.length === 0, failures.join('; '));
            ctx.detail(
              `${kStats.width}x${kStats.height}, centerLuma=${kCenter.luma_255} (${kFull.distinct_colors} colors), panelLuma=${sPanel.luma_255}, sheetWcag=${sheetCss.bgLuminance} (${sheetCss.contrastRatio}:1)`,
            );
          } finally {
            unregisterEphemeralDir(tmpDir);
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        },
      );
    } finally {
      if (sharedSession) await sharedSession.close();
    }
  }

  // =========================================================================
  // T1.5: Web Audio Gesture Unlock, Core SFX, OfflineAudioContext & Contract
  // =========================================================================
  for (const target of targets) {
    await runner.runTest(
      { id: `T1.5-${target}`, tier: 1, target, name: 'Web Audio gesture unlock, core SFX & OfflineAudioContext gate' },
      async (ctx) => {
        const session = await bootTargetSession(target, { staticUrl });
        try {
          // Verify pre-gesture AudioContext is NOT running (no --autoplay-policy cheat!)
          const before = await readAudioStatus(session, target);
          ctx.assert(
            !before.running,
            `AudioContext already running before user gesture! states=${JSON.stringify(before.spyStates)}`,
          );

          // Trigger real CDP user gesture click
          if (target === 'main') {
            // Tap unlocked station badge (or boost) with real CDP pointer events
            try {
              await openStation0Popover(session, 'main');
              await closeStationPopover(session, 'main');
            } catch {
              await activateBoost(session, 'main');
            }
            // Also click Boost to exercise HUD gesture path
            await activateBoost(session, 'main');
          } else {
            await activateBoost(session, 'standalone');
          }

          await sleep(250);
          const after = await readAudioStatus(session, target);
          ctx.assert(
            after.running,
            `AudioContext did NOT transition to 'running' after real CDP click (spyStates=${JSON.stringify(after.spyStates)}, summary=${JSON.stringify(after.summary)})`,
          );

          const contractFailures = [];

          if (target === 'main') {
            if (!after.hasGetStateSummary) {
              contractFailures.push('SoundEngine.getStateSummary() missing (pending M1/M4 CTR-01/AUD-05)');
            } else {
              const s = after.summary;
              if (!s || s.contextState !== 'running') {
                contractFailures.push(`SoundEngine.getStateSummary().contextState=${s?.contextState} !== 'running'`);
              }
              if (s && s.unlocked !== true) {
                contractFailures.push(`SoundEngine.getStateSummary().unlocked=${s.unlocked} !== true`);
              }
              if (s && typeof s.enabled !== 'boolean') {
                contractFailures.push(`SoundEngine.getStateSummary().enabled not boolean: ${typeof s.enabled}`);
              }
              if (s && !(typeof s.sfxVolume === 'number' && Number.isFinite(s.sfxVolume))) {
                contractFailures.push(`SoundEngine.getStateSummary().sfxVolume not finite number: ${s.sfxVolume}`);
              }
              if (s && typeof s.ambientEnabled !== 'boolean') {
                contractFailures.push(`SoundEngine.getStateSummary().ambientEnabled not boolean: ${typeof s.ambientEnabled}`);
              }
              if (s && !(typeof s.ambientVolume === 'number' && Number.isFinite(s.ambientVolume))) {
                contractFailures.push(`SoundEngine.getStateSummary().ambientVolume not finite number: ${s.ambientVolume}`);
              }
              if (s && !Number.isFinite(s.activeVoices)) {
                contractFailures.push(`SoundEngine.getStateSummary().activeVoices not finite: ${s.activeVoices}`);
              }
            }

            // Trigger core SFX live (must throw 0 exceptions)
            const livePlay = await session.evaluate(`(() => {
              const snd = window.__sizzle?.sound;
              if (!snd || typeof snd.play !== 'function') return { ok: false, error: 'sound.play missing' };
              const names = ['tap', 'coin', 'upgrade', 'sizzle', 'milestone'];
              for (const n of names) snd.play(n);
              return { ok: true, count: names.length };
            })()`);
            ctx.assert(livePlay.ok, `Live SFX trigger failed: ${livePlay.error}`);

            if (!after.hasRenderOfflineSample) {
              contractFailures.push('SoundEngine.renderOfflineSample() missing (pending M4 AUD-05)');
            } else {
              const offlineResults = await session.evaluate(
                `(async () => {
                  const snd = window.__sizzle.sound;
                  const names = ${JSON.stringify(CORE_OFFLINE_SFX_MAIN)};
                  const out = [];
                  for (const name of names) {
                    const r = await snd.renderOfflineSample(name);
                    out.push({ name, ...r });
                  }
                  return out;
                })()`,
                { awaitPromise: true, timeoutMs: 20000 },
              );
              for (const r of offlineResults) {
                if (
                  r.finite !== true ||
                  !(typeof r.peak === 'number' && r.peak > THRESHOLDS.offlinePeakMin && r.peak <= THRESHOLDS.offlinePeakMax) ||
                  !(typeof r.rms === 'number' && Number.isFinite(r.rms) && r.rms > 0)
                ) {
                  contractFailures.push(
                    `renderOfflineSample('${r.name}') failed gate: finite=${r.finite}, peak=${r.peak}, rms=${r.rms}`,
                  );
                }
              }
            }
          } else {
            if (!after.hasArtifact) {
              contractFailures.push(
                `window.__sizzleArtifact missing (pending M5 SA-TEST-01/SA-AUD-01; gesture unlock verified via AudioSpy: ${JSON.stringify(after.spyStates)})`,
              );
            } else {
              if (!after.hasGetStateSummary) {
                contractFailures.push('window.__sizzleArtifact.getStateSummary() missing');
              } else if (after.summary?.audioState !== 'running') {
                contractFailures.push(
                  `window.__sizzleArtifact.getStateSummary().audioState=${after.summary?.audioState} !== 'running'`,
                );
              }

              if (!after.hasPlayTestSfx) {
                contractFailures.push('window.__sizzleArtifact.playTestSfx() missing');
              } else {
                const played = await session.evaluate(`(() => {
                  const names = ['coin', 'upgrade', 'sizzle', 'milestone'];
                  return names.map((n) => ({ name: n, ok: Boolean(window.__sizzleArtifact.playTestSfx(n)) }));
                })()`);
                const bad = played.filter((p) => !p.ok);
                if (bad.length > 0) {
                  contractFailures.push(`playTestSfx returned falsy for: ${bad.map((b) => b.name).join(', ')}`);
                }
              }

              if (!after.hasRenderOfflineSfxTest) {
                contractFailures.push('window.__sizzleArtifact.renderOfflineSfxTest() missing');
              } else {
                const offlineResults = await session.evaluate(
                  `(async () => {
                    const names = ${JSON.stringify(CORE_OFFLINE_SFX_STANDALONE)};
                    const out = [];
                    for (const name of names) {
                      const r = await window.__sizzleArtifact.renderOfflineSfxTest(name);
                      out.push({ name, ...r });
                    }
                    return out;
                  })()`,
                  { awaitPromise: true, timeoutMs: 20000 },
                );
                for (const r of offlineResults) {
                  if (
                    r.finite !== true ||
                    !(typeof r.peak === 'number' && r.peak > THRESHOLDS.offlinePeakMin && r.peak <= THRESHOLDS.offlinePeakMax) ||
                    !(typeof r.rms === 'number' && Number.isFinite(r.rms) && r.rms > 0)
                  ) {
                    contractFailures.push(
                      `renderOfflineSfxTest('${r.name}') failed gate: finite=${r.finite}, peak=${r.peak}, rms=${r.rms}`,
                    );
                  }
                }
              }
            }
          }

          const errReport = session.getErrorReport();
          ctx.assert(errReport.ok, `Runtime errors during audio check: ${errReport.summary}`);
          ctx.assert(contractFailures.length === 0, contractFailures.join('; '));
          ctx.detail(`gesture unlock suspended->running OK, offline SFX waveforms valid, 0 errors`);
        } finally {
          await session.close();
        }
      },
    );
  }
}
