#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerEphemeralDir, unregisterEphemeralDir } from './lib/cdpClient.mjs';
import { CHROMIUM_BIN, DIST_DIR, PYTHON_BIN, STANDALONE_HTML } from './lib/config.mjs';
import { TestSuiteRunner } from './lib/runner.mjs';
import { startStaticServer } from './lib/staticServer.mjs';
import { runTier1 } from './suites/tier1-core.mjs';
import { runTier2 } from './suites/tier2-boundaries.mjs';
import { runTier3 } from './suites/tier3-pairwise.mjs';
import { runTier4 } from './suites/tier4-workloads.mjs';

const VALID_TIERS = new Set(['1', '2', '3', '4', 'all']);
const VALID_TARGETS = new Set(['main', 'standalone', 'all']);

function printHelp() {
  process.stdout.write(`Sizzle Empire — Zero-Dependency 4-Tier Opaque-Box E2E Test Suite

Usage:
  node tests/e2e/run-e2e.mjs [options]

Options:
  --tier=1|2|3|4|all         Run a specific tier or all tiers (default: all)
  --target=main|standalone|all
                             Target main dist/ app, standalone sizzle_empire.html, or both (default: all)
  --screenshots-dir=<path>   Directory to preserve Tier 4 780x1688 PNG gallery
                             (if omitted, an ephemeral /tmp dir is used and deleted on exit)
  --json                     Emit machine-readable JSON report to stdout
  --help, -h                 Show this help message and exit 0

Exit Codes:
  0  All selected tests passed
  1  One or more tests failed
  2  Invalid CLI arguments or missing runtime prerequisites
`);
}

function parseCliArgs(argv) {
  const opts = {
    tier: 'all',
    target: 'all',
    screenshotsDir: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg === '--json') {
      opts.json = true;
      continue;
    }
    if (arg.startsWith('--tier=')) {
      opts.tier = arg.slice('--tier='.length);
      continue;
    }
    if (arg === '--tier') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
        return { error: 'Missing value for --tier.' };
      }
      opts.tier = argv[++i];
      continue;
    }
    if (arg.startsWith('--target=')) {
      opts.target = arg.slice('--target='.length);
      continue;
    }
    if (arg === '--target') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
        return { error: 'Missing value for --target.' };
      }
      opts.target = argv[++i];
      continue;
    }
    if (arg.startsWith('--screenshots-dir=')) {
      opts.screenshotsDir = arg.slice('--screenshots-dir='.length);
      continue;
    }
    if (arg === '--screenshots-dir') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
        return { error: 'Missing value for --screenshots-dir.' };
      }
      opts.screenshotsDir = argv[++i];
      continue;
    }
    return { error: `Unknown or malformed CLI argument: ${arg}` };
  }

  if (!VALID_TIERS.has(opts.tier)) {
    return { error: `Invalid --tier value "${opts.tier}". Expected one of: 1, 2, 3, 4, all.` };
  }
  if (!VALID_TARGETS.has(opts.target)) {
    return { error: `Invalid --target value "${opts.target}". Expected one of: main, standalone, all.` };
  }
  if (opts.screenshotsDir !== null && opts.screenshotsDir.trim().length === 0) {
    return { error: '--screenshots-dir must not be empty.' };
  }

  return { opts };
}

function checkPrerequisites(targets) {
  const missing = [];

  try {
    fs.accessSync(CHROMIUM_BIN, fs.constants.X_OK);
  } catch {
    missing.push(`Chromium binary not executable at ${CHROMIUM_BIN}`);
  }

  try {
    execFileSync(PYTHON_BIN, ['-c', 'import PIL'], { stdio: 'ignore', timeout: 5000 });
  } catch {
    missing.push(`Python + Pillow (PIL) unavailable via "${PYTHON_BIN} -c 'import PIL'"`);
  }

  if (targets.includes('main')) {
    const distIndex = path.join(DIST_DIR, 'index.html');
    if (!fs.existsSync(distIndex)) {
      missing.push(`Main production build missing (${distIndex}); run "npm run build" first`);
    }
  }

  if (targets.includes('standalone')) {
    if (!fs.existsSync(STANDALONE_HTML)) {
      missing.push(`Standalone HTML artifact missing at ${STANDALONE_HTML}`);
    }
  }

  return missing;
}

async function main() {
  const { opts, error } = parseCliArgs(process.argv.slice(2));
  if (error) {
    process.stderr.write(`Error: ${error}\nRun with --help for usage.\n`);
    process.exit(2);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const targets = opts.target === 'all' ? ['main', 'standalone'] : [opts.target];
  const tiers = opts.tier === 'all' ? [1, 2, 3, 4] : [Number(opts.tier)];

  const missing = checkPrerequisites(targets);
  if (missing.length > 0) {
    process.stderr.write(`Missing E2E prerequisite(s):\n  - ${missing.join('\n  - ')}\n`);
    process.exit(2);
  }

  let screenshotsDir = opts.screenshotsDir ? path.resolve(opts.screenshotsDir) : null;
  let autoCreatedShotsDir = false;

  if (screenshotsDir) {
    try {
      fs.mkdirSync(screenshotsDir, { recursive: true });
      const st = fs.statSync(screenshotsDir);
      if (!st.isDirectory()) {
        throw new Error(`Path exists and is not a directory: ${screenshotsDir}`);
      }
      fs.accessSync(screenshotsDir, fs.constants.W_OK);
    } catch (err) {
      process.stderr.write(
        `Error: Invalid --screenshots-dir "${opts.screenshotsDir}": ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(2);
    }
  } else {
    screenshotsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sizzle_e2e_shots_'));
    autoCreatedShotsDir = true;
    registerEphemeralDir(screenshotsDir);
  }

  let staticServer = null;
  const runner = new TestSuiteRunner({ quiet: opts.json });

  try {
    if (targets.includes('main')) {
      staticServer = await startStaticServer(DIST_DIR);
    }

    const staticUrl = staticServer ? staticServer.url : null;
    const suiteCtx = { targets, staticUrl, screenshotsDir };

    if (!opts.json) {
      process.stdout.write(
        `Sizzle Empire E2E Runner — tiers=[${tiers.join(',')}] targets=[${targets.join(',')}]` +
          `${staticUrl ? ` main=${staticUrl}` : ''}\n`,
      );
    }

    for (const t of tiers) {
      if (!opts.json) {
        process.stdout.write(`\n--- Tier ${t} ---\n`);
      }
      if (t === 1) await runTier1(runner, suiteCtx);
      else if (t === 2) await runTier2(runner, suiteCtx);
      else if (t === 3) await runTier3(runner, suiteCtx);
      else if (t === 4) await runTier4(runner, suiteCtx);
    }

    const reportMeta = {
      filters: { tier: opts.tier, target: opts.target },
      screenshotsDir: autoCreatedShotsDir ? null : screenshotsDir,
      screenshotsPreserved: !autoCreatedShotsDir,
    };

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(runner.toJsonReport(reportMeta), null, 2)}\n`);
    } else {
      runner.printPrettySummary(reportMeta);
    }

    const summary = runner.getSummary();
    process.exitCode = summary.ok ? 0 : 1;
  } catch (err) {
    process.stderr.write(
      `Fatal E2E runner error: ${err instanceof Error ? err.stack || err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  } finally {
    if (staticServer) {
      try {
        await staticServer.close();
      } catch {
        // ignore
      }
    }
    if (autoCreatedShotsDir && screenshotsDir) {
      unregisterEphemeralDir(screenshotsDir);
      try {
        fs.rmSync(screenshotsDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

await main();
