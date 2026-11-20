import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const DIST_DIR = path.join(REPO_ROOT, 'dist');
export const SRC_DIR = path.join(REPO_ROOT, 'src');
export const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

export const STANDALONE_HTML =
  '/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/ceae6d9f-7dc5-49f9-a364-9a36ff76915c/sizzle_empire.html';
export const STANDALONE_METADATA = `${STANDALONE_HTML}.metadata.json`;

export const CHROMIUM_BIN = '/usr/lib/chromium/chromium';
export const PYTHON_BIN = 'python3';
export const ANALYZE_IMAGE_PY = path.join(__dirname, 'analyze_image.py');

/**
 * Empirically verified Chromium 156 headless flags (with SwiftShader WebGL2).
 * NEVER include --virtual-time-budget (stalls on continuous rAF).
 * NEVER include --autoplay-policy=no-user-gesture-required (masks mobile Web Audio unlock).
 */
export const CHROMIUM_ARGS = [
  '--headless=new',
  '--no-sandbox',
  '--no-zygote',
  '--disable-crash-reporter',
  '--disable-breakpad',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--remote-debugging-port=0',
];

export const PRIMARY_VIEWPORT = {
  name: '390x844',
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
};

export const PORTRAIT_VIEWPORTS = [
  { name: '360x640', width: 360, height: 640, deviceScaleFactor: 2, mobile: true },
  PRIMARY_VIEWPORT,
  { name: '430x932', width: 430, height: 932, deviceScaleFactor: 2, mobile: true },
];

/**
 * Standard W3C XML namespaces permitted in SVG/HTML/source files.
 */
export const XML_NAMESPACE_ALLOWLIST = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
];

/**
 * Static vendor string allowlist permitted ONLY inside minified dist JS bundles.
 * Never fetched over network (independently verified at runtime via CDP Network events).
 */
export const DIST_JS_VENDOR_ALLOWLIST = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/XML/1998/namespace',
  'https://react.dev/errors/',
  'https://capacitorjs.com/',
  'https://bit.ly/wb-precache',
];

export const FORBIDDEN_CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'googleapis.com',
  'gstatic.com',
  'unpkg.com',
  'jsdelivr.net',
  'cdnjs.cloudflare.com',
  'cdnjs.',
];

/**
 * Legacy dark-purple tokens forbidden after visual overhaul (TEST_INFRA.md §4.1).
 */
export const MAIN_FORBIDDEN_SHELL_TOKENS = [
  '#1b1426',
  '#130e1d',
  '#1f1730',
  '#2b2142',
  'rgba(19, 14, 29',
  'rgba(19,14,29',
  'rgba(20, 14, 33',
  'rgba(20,14,33',
  'rgba(24, 17, 39',
  'rgba(24,17,39',
  'rgba(27, 20, 44',
  'rgba(27,20,44',
];

export const MAIN_FORBIDDEN_INLINE_TOKENS = [
  '#130e1d',
  '#1f1730',
  '#2b2142',
  '#b8b2d0',
  'rgba(19,14,29',
  'rgba(19, 14, 29',
];

/**
 * Matches `#cbd5e1` ONLY inside inline React CSS style assignments so silver SVG gradient
 * stops in CartoonIcons.tsx (`stopColor="#cbd5e1"`) are never falsely flagged.
 */
export const MAIN_FORBIDDEN_INLINE_STYLE_PATTERNS = [
  {
    label: 'inline CSS #cbd5e1',
    re: /\b(?:color|background(?:Color)?|border(?:Color)?)\s*:\s*['"]#cbd5e1['"]/i,
  },
];

export const STANDALONE_FORBIDDEN_CSS_TOKENS = [
  '#140f21',
  '#161126',
  '#1d152e',
  '#120d1d',
  'rgba(20, 14, 34',
  'rgba(20,14,34',
  'rgba(18, 13, 29',
  'rgba(18,13,29',
  'rgba(18, 12, 30',
  'rgba(18,12,30',
  'rgba(45, 35, 70',
  'rgba(45,35,70',
];

/**
 * Calibrated quantitative pass gates from TEST_INFRA.md §4.3 & §4.4 (v1.2).
 */
export const THRESHOLDS = {
  expectedPngWidth: 780,
  expectedPngHeight: 1688,

  // Canvas non-blankness & sunlit richness (kitchen scene)
  fullDistinctColorsMin: 400,
  centerDistinctColorsMin: 300,
  centerLumaMin: 115,
  centerMeanStdRgbMin: 15,
  centerPctDarkMax: 25,

  // Bright UI chrome (top HUD 0..16% & bottom dock 88..100%)
  topHudLumaMin: 145,
  topHudPctDarkMax: 22,
  bottomNavLumaMin: 140,
  bottomNavPctDarkMax: 25,

  // Bright cream open sheet (panel 50..88%)
  sheetPanelLumaMin: 150,
  sheetPanelPctDarkMax: 25,
  sheetPanelPctBrightMin: 35,
  sheetPanelMeanStdRgbMin: 8,

  // Computed DOM CSS bright panel & ink contrast
  cssPanelWcagLumaMin: 0.65,
  cssTextContrastMin: 4.5,

  // Mobile portrait layout
  primaryButtonMinHeightPx: 36,

  // Web Audio waveform & burst stress
  offlinePeakMin: 0.01,
  offlinePeakMax: 1.0,
  audioBurstCount: 25,
  maxActiveVoices: 32,

  // Overlays, particles & rAF budget (calibrated for 2vCPU headless ANGLE SwiftShader
  // software rasterization at 780x1688 DPR 2 + 2048px PCFSoftShadowMap; real JS frame work is ~4ms)
  maxOverlayDomNodes: 120,
  maxStandaloneParticles: 250,
  rafSampleFrames: 30,
  rafMaxFrameStallMs: 3500,
  rafMedianDeltaMsStandalone: 400,
  rafMedianDeltaMsMain: 1800,
  jsFrameMedianMaxMs: 35,

  // Timing budgets (calibrated for post-M2 SwiftShader PMREM + 2048 shadows, rawDt clamp, and authentic Eatventure Lv 1 pacing)
  bootTimeoutMs: 40000,
  organicDeliveryTimeoutMs: 50000,
  organicCashUpgradeTimeoutMsMain: 100000,
  organicCashUpgradeTimeoutMsStandalone: 70000,
  standaloneSavePollTimeoutMs: 8500,
};

export const CORE_OFFLINE_SFX_MAIN = [
  'coin',
  'upgrade',
  'sizzle',
  'milestone',
  'renovate',
  'box',
  'error',
  'divine',
];

export const CORE_OFFLINE_SFX_STANDALONE = [
  'coin',
  'upgrade',
  'sizzle',
  'milestone',
  'renovate',
  'box',
  'error',
  'divine',
];

export const TIER4_GALLERY_SUFFIXES = [
  '01_kitchen.png',
  '02_action.png',
  '03_popover.png',
  '04_sheet.png',
  '05_crate_modal.png',
  '06_event.png',
];
