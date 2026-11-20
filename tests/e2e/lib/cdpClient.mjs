import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROMIUM_ARGS, CHROMIUM_BIN, PRIMARY_VIEWPORT } from './config.mjs';

const DEVTOOLS_RE = /DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[^\s]+)/;

const AUDIO_SPY_SCRIPT = `(() => {
  if (window.__e2eAudioSpy) return;
  const spy = { instances: [], createdCount: 0 };
  window.__e2eAudioSpy = spy;
  const wrap = (Orig) => {
    if (typeof Orig !== 'function') return Orig;
    return new Proxy(Orig, {
      construct(target, args, newTarget) {
        const inst = Reflect.construct(target, args, newTarget);
        spy.createdCount += 1;
        spy.instances.push(inst);
        return inst;
      },
    });
  };
  if (window.AudioContext) window.AudioContext = wrap(window.AudioContext);
  if (window.webkitAudioContext) window.webkitAudioContext = wrap(window.webkitAudioContext);
})();`;

const activeBrowsers = new Set();
const ephemeralDirs = new Set();
let signalHooksInstalled = false;
let signalCleanupRunning = false;

function isProcExited(proc) {
  return !proc || !proc.pid || proc.exitCode !== null || proc.signalCode !== null;
}

function killProcGroup(proc, signal = 'SIGKILL', { evenIfExited = false } = {}) {
  if (!proc) return;
  if (!evenIfExited && isProcExited(proc)) return;
  let killedGroup = false;
  if (typeof proc.pid === 'number' && proc.pid > 0) {
    try {
      process.kill(-proc.pid, signal);
      killedGroup = true;
    } catch {
      // ESRCH or unsupported group signal; fall back to direct child kill below
    }
  }
  if (!killedGroup && !isProcExited(proc)) {
    try {
      proc.kill(signal);
    } catch {
      // ignore
    }
  }
}

function rmDirRobustSync(dir, maxRetries = 6, retryDelay = 40) {
  if (!dir) return;
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries, retryDelay });
    }
  } catch {
    // best effort
  }
}

function waitWithTimeout(promise, ms) {
  let timer = null;
  const timeoutP = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([
    promise.then(
      () => 'settled',
      () => 'settled',
    ),
    timeoutP,
  ]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  });
}

function emergencySyncCleanup() {
  for (const entry of [...activeBrowsers]) {
    killProcGroup(entry.proc, 'SIGKILL', { evenIfExited: true });
    rmDirRobustSync(entry.userDataDir, 5, 30);
  }
  activeBrowsers.clear();

  for (const dir of [...ephemeralDirs]) {
    rmDirRobustSync(dir, 5, 30);
  }
  ephemeralDirs.clear();
}

async function asyncSignalCleanup(exitCode) {
  if (signalCleanupRunning) return;
  signalCleanupRunning = true;

  const deadline = Date.now() + 1500;
  const entries = [...activeBrowsers];
  activeBrowsers.clear();

  const waitList = [];
  for (const entry of entries) {
    const proc = entry.proc;
    if (proc && !isProcExited(proc)) {
      const exitP = new Promise((resolve) => proc.once('exit', () => resolve()));
      killProcGroup(proc, 'SIGKILL');
      waitList.push(exitP);
    } else if (proc) {
      killProcGroup(proc, 'SIGKILL', { evenIfExited: true });
    }
  }

  for (const exitP of waitList) {
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining <= 0) break;
    await waitWithTimeout(exitP, Math.min(500, remaining));
  }

  const settleMs = Math.min(40, Math.max(0, deadline - Date.now()));
  if (entries.length > 0 && settleMs > 0) {
    await sleep(settleMs);
  }

  for (const entry of entries) {
    rmDirRobustSync(entry.userDataDir, 6, 40);
  }
  for (const dir of [...ephemeralDirs]) {
    rmDirRobustSync(dir, 6, 40);
  }
  ephemeralDirs.clear();

  process.exit(exitCode);
}

function ensureSignalHooks() {
  if (signalHooksInstalled) return;
  signalHooksInstalled = true;

  process.on('SIGINT', () => {
    void asyncSignalCleanup(130);
  });
  process.on('SIGTERM', () => {
    void asyncSignalCleanup(143);
  });
  process.on('exit', () => {
    emergencySyncCleanup();
  });
}

export function registerEphemeralDir(dirPath) {
  ensureSignalHooks();
  if (dirPath) ephemeralDirs.add(dirPath);
}

export function unregisterEphemeralDir(dirPath) {
  if (dirPath) ephemeralDirs.delete(dirPath);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RawCdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.onceWaiters = new Set();
    this.closed = false;
  }

  async connect(timeoutMs = 10000) {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error(`Timed out connecting to CDP WebSocket: ${this.wsUrl}`));
      }, timeoutMs);

      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener('error', (evt) => {
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket error: ${evt?.message || 'connection failed'}`));
      });
      ws.addEventListener('message', (evt) => {
        this._handleMessage(String(evt.data));
      });
      ws.addEventListener('close', () => {
        this.closed = true;
        this._rejectAllPending('CDP WebSocket closed');
      });
    });
  }

  _rejectAllPending(reason) {
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`${reason} before response for ${entry.method} (id=${id})`));
    }
    this.pending.clear();

    for (const waiter of [...this.onceWaiters]) {
      waiter.rejectWith(new Error(`${reason} while waiting for CDP event ${waiter.method}`));
    }
    this.onceWaiters.clear();
  }

  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof msg.id === 'number') {
      const entry = this.pending.get(msg.id);
      if (entry) {
        this.pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) {
          entry.reject(new Error(`CDP ${entry.method} error (${msg.error.code}): ${msg.error.message}`));
        } else {
          entry.resolve(msg.result ?? {});
        }
      }
      return;
    }

    if (msg.method) {
      const handlers = this.listeners.get(msg.method);
      if (handlers) {
        for (const fn of [...handlers]) {
          try {
            fn(msg.params ?? {});
          } catch {
            // never crash CDP dispatcher from listener errors
          }
        }
      }
    }
  }

  send(method, params = {}, timeoutMs = 15000) {
    if (!this.ws || this.closed || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Cannot send CDP ${method}: WebSocket is not open`));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) {
      this.listeners.set(method, new Set());
    }
    this.listeners.get(method).add(fn);
    return () => this.off(method, fn);
  }

  off(method, fn) {
    const set = this.listeners.get(method);
    if (set) {
      set.delete(fn);
      if (set.size === 0) this.listeners.delete(method);
    }
  }

  waitForEvent(method, timeoutMs = 15000) {
    if (!this.ws || this.closed || this.ws.readyState !== WebSocket.OPEN) {
      const rejected = Promise.reject(new Error(`Cannot wait for CDP event ${method}: WebSocket is not open`));
      return {
        promise: rejected,
        cancel() {
          rejected.catch(() => {});
        },
      };
    }

    let settled = false;
    let timer = null;
    let resolveFn;
    let rejectFn;

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      this.off(method, handler);
      this.onceWaiters.delete(waiter);
    };

    const handler = (params) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveFn(params);
    };

    const waiter = {
      method,
      rejectWith(err) {
        if (settled) return;
        settled = true;
        cleanup();
        rejectFn(err);
      },
    };

    const promise = new Promise((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    this.on(method, handler);
    this.onceWaiters.add(waiter);

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        waiter.rejectWith(new Error(`Timed out after ${timeoutMs}ms waiting for CDP event ${method}`));
      }, timeoutMs);
    }

    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveFn(null);
    };

    return { promise, cancel };
  }

  once(method, timeoutMs = 15000) {
    return this.waitForEvent(method, timeoutMs).promise;
  }

  close() {
    this.closed = true;
    this._rejectAllPending('CDP client closed');
    try {
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        this.ws.close();
      }
    } catch {
      // ignore
    }
  }
}

async function discoverPageTarget(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const remaining = Math.max(100, deadline - Date.now());
      const resp = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(Math.min(3000, remaining)),
      });
      if (resp.ok) {
        const targets = await resp.json();
        // Chromium 156 exposes browser_ui omnibox targets; strictly pick type === 'page'
        const pageTarget = Array.isArray(targets)
          ? targets.find((t) => t && t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string')
          : null;
        if (pageTarget) return pageTarget;
      }
    } catch (err) {
      lastErr = err;
    }
    await sleep(60);
  }
  throw new Error(
    `Failed to discover CDP page target on port ${port}: ${lastErr instanceof Error ? lastErr.message : 'no page target found'}`,
  );
}

/**
 * Launches an isolated headless Chromium 156 session with zero third-party deps,
 * pre-document AudioContext spy, strict error/network tracker, and guaranteed teardown.
 *
 * @param {{
 *   mode?: 'main' | 'standalone',
 *   allowedOrigin?: string | null,
 *   viewport?: { width: number, height: number, deviceScaleFactor?: number, mobile?: boolean },
 * }} [options]
 */
export async function launchChromium(options = {}) {
  ensureSignalHooks();

  const mode = options.mode ?? 'main';
  const allowedOrigin = options.allowedOrigin ? options.allowedOrigin.replace(/\/$/, '') : null;
  const viewport = options.viewport ?? PRIMARY_VIEWPORT;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sizzle_e2e_profile_'));
  const args = [...CHROMIUM_ARGS, `--user-data-dir=${userDataDir}`, 'about:blank'];

  const proc = spawn(CHROMIUM_BIN, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  });

  const registryEntry = { proc, userDataDir };
  activeBrowsers.add(registryEntry);

  const stderrChunks = [];
  let cdp = null;
  let closed = false;

  async function close() {
    if (closed) return;
    closed = true;

    const exitP = isProcExited(proc)
      ? Promise.resolve()
      : new Promise((resolve) => proc.once('exit', () => resolve()));

    if (cdp && !isProcExited(proc)) {
      try {
        await cdp.send('Browser.close', {}, 3000);
      } catch {
        // fallback to signals below
      }
    }

    if (!isProcExited(proc)) {
      await waitWithTimeout(exitP, 3000);
    }

    if (!isProcExited(proc)) {
      killProcGroup(proc, 'SIGTERM');
      await waitWithTimeout(exitP, 1500);
    }

    if (!isProcExited(proc)) {
      killProcGroup(proc, 'SIGKILL');
      await waitWithTimeout(exitP, 1000);
    } else {
      // Ensure any child helpers in the detached process group are also terminated
      killProcGroup(proc, 'SIGKILL', { evenIfExited: true });
    }

    if (cdp) {
      cdp.close();
    }

    rmDirRobustSync(userDataDir, 6, 40);
    activeBrowsers.delete(registryEntry);
  }

  try {
    const { port } = await new Promise((resolve, reject) => {
      let settled = false;

      const onStderrData = (chunk) => {
        const text = chunk.toString('utf8');
        stderrChunks.push(text);
        if (stderrChunks.length > 50) stderrChunks.shift();
        const match = DEVTOOLS_RE.exec(stderrChunks.join(''));
        if (match && !settled) {
          settled = true;
          clearTimeout(timer);
          proc.stderr.off('data', onStderrData);
          proc.stderr.resume();
          resolve({ browserWsUrl: match[1], port: Number(match[2]) });
        }
      };

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          proc.stderr.off('data', onStderrData);
          reject(
            new Error(
              `Timed out waiting for Chromium DevTools port. stderr:\n${stderrChunks.join('').slice(-1200)}`,
            ),
          );
        }
      }, 15000);

      proc.stderr.on('data', onStderrData);

      proc.once('exit', (code, signal) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          proc.stderr.off('data', onStderrData);
          reject(
            new Error(
              `Chromium exited early (code=${code}, signal=${signal}). stderr:\n${stderrChunks.join('').slice(-1200)}`,
            ),
          );
        }
      });

      proc.once('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          proc.stderr.off('data', onStderrData);
          reject(err);
        }
      });
    });

    const pageTarget = await discoverPageTarget(port);
    cdp = new RawCdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    const tracker = {
      consoleErrors: [],
      consoleWarnings: [],
      exceptions: [],
      logErrors: [],
      logWarnings: [],
      ignoredLocalApi404s: [],
      requests: [],
      externalRequests: [],
    };

    const isAllowedRequestUrl = (reqUrl) => {
      if (typeof reqUrl !== 'string' || reqUrl.length === 0) return true;
      if (reqUrl === 'about:blank' || reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) {
        return true;
      }
      if (mode === 'standalone') {
        return reqUrl.startsWith('file://');
      }
      if (allowedOrigin) {
        return reqUrl === allowedOrigin || reqUrl.startsWith(`${allowedOrigin}/`);
      }
      return reqUrl.startsWith('http://127.0.0.1:');
    };

    cdp.on('Runtime.consoleAPICalled', (params) => {
      const text = Array.isArray(params.args)
        ? params.args
            .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type || ''))
            .join(' ')
        : '';
      if (params.type === 'error') {
        tracker.consoleErrors.push(text);
      } else if (params.type === 'warning') {
        tracker.consoleWarnings.push(text);
      }
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
      const details = params.exceptionDetails || {};
      const msg =
        details.exception?.description ||
        details.exception?.value ||
        details.text ||
        'Uncaught exception';
      tracker.exceptions.push(String(msg));
    });

    cdp.on('Log.entryAdded', (params) => {
      const entry = params.entry || {};
      if (entry.level === 'error') {
        const isLocalApi404 =
          mode === 'main' &&
          allowedOrigin &&
          entry.source === 'network' &&
          typeof entry.url === 'string' &&
          entry.url.startsWith(`${allowedOrigin}/api/`);

        if (isLocalApi404) {
          tracker.ignoredLocalApi404s.push(`${entry.url}: ${entry.text || '404'}`);
        } else {
          tracker.logErrors.push(
            `[${entry.source || 'log'}] ${entry.text || 'error'}${entry.url ? ` (${entry.url})` : ''}`,
          );
        }
      } else if (entry.level === 'warning') {
        tracker.logWarnings.push(`[${entry.source || 'log'}] ${entry.text || 'warning'}`);
      }
    });

    cdp.on('Network.requestWillBeSent', (params) => {
      const reqUrl = params.request?.url;
      if (!reqUrl) return;
      tracker.requests.push(reqUrl);
      if (!isAllowedRequestUrl(reqUrl)) {
        tracker.externalRequests.push(reqUrl);
      }
    });

    await Promise.all([
      cdp.send('Runtime.enable'),
      cdp.send('Page.enable'),
      cdp.send('Log.enable'),
      cdp.send('Network.enable'),
    ]);

    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: AUDIO_SPY_SCRIPT });

    const session = {
      proc,
      cdp,
      userDataDir,
      tracker,
      mode,
      allowedOrigin,
      close,

      async setViewport(vp) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: vp.deviceScaleFactor ?? 2,
          mobile: vp.mobile ?? true,
        });
      },

      async navigateAndWait(url, timeoutMs = 15000) {
        return navigateAndWait(cdp, url, timeoutMs);
      },

      async reloadAndWait(ignoreCache = false, timeoutMs = 15000) {
        return reloadAndWait(cdp, ignoreCache, timeoutMs);
      },

      async evaluate(expression, evalOpts = {}) {
        const res = await cdp.send(
          'Runtime.evaluate',
          {
            expression,
            returnByValue: true,
            awaitPromise: Boolean(evalOpts.awaitPromise),
          },
          evalOpts.timeoutMs ?? 15000,
        );
        if (res.exceptionDetails) {
          const msg =
            res.exceptionDetails.exception?.description ||
            res.exceptionDetails.text ||
            'Evaluation failed';
          throw new Error(`Runtime.evaluate exception: ${msg}`);
        }
        return res.result?.value;
      },

      async clickAt(x, y, holdMs = 35) {
        return clickAt(cdp, x, y, holdMs);
      },

      async holdAt(x, y, holdMs = 700) {
        return clickAt(cdp, x, y, holdMs);
      },

      async clickElement(selectorOrFn, holdMs = 35) {
        return clickElement(session, selectorOrFn, holdMs);
      },

      async captureScreenshot(outPath) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, 45000);
        const buf = Buffer.from(data, 'base64');
        fs.writeFileSync(outPath, buf);
        return { path: outPath, bytes: buf.length };
      },

      getErrorReport() {
        const issues = [];
        if (tracker.consoleErrors.length > 0) {
          issues.push(`console.error(${tracker.consoleErrors.length}): ${tracker.consoleErrors.slice(0, 3).join(' | ')}`);
        }
        if (tracker.exceptions.length > 0) {
          issues.push(`exceptions(${tracker.exceptions.length}): ${tracker.exceptions.slice(0, 3).join(' | ')}`);
        }
        if (tracker.logErrors.length > 0) {
          issues.push(`logErrors(${tracker.logErrors.length}): ${tracker.logErrors.slice(0, 3).join(' | ')}`);
        }
        if (tracker.externalRequests.length > 0) {
          issues.push(`externalRequests(${tracker.externalRequests.length}): ${tracker.externalRequests.slice(0, 3).join(', ')}`);
        }
        return {
          ok: issues.length === 0,
          consoleErrors: tracker.consoleErrors,
          exceptions: tracker.exceptions,
          logErrors: tracker.logErrors,
          externalRequests: tracker.externalRequests,
          ignoredLocalApi404s: tracker.ignoredLocalApi404s,
          summary: issues.join('; '),
        };
      },

      resetErrors() {
        tracker.consoleErrors.length = 0;
        tracker.exceptions.length = 0;
        tracker.logErrors.length = 0;
        tracker.externalRequests.length = 0;
      },
    };

    await session.setViewport(viewport);
    return session;
  } catch (err) {
    await close();
    throw err;
  }
}

/**
 * Registers Page.loadEventFired BEFORE sending Page.navigate to prevent fast-load races.
 */
export async function navigateAndWait(cdp, url, timeoutMs = 15000) {
  const { promise: loadP, cancel } = cdp.waitForEvent('Page.loadEventFired', timeoutMs);
  // Pre-attach noop rejection handler so WS close mid-send never fires unhandledRejection;
  // awaiting loadP below still rethrows any rejection from loadP.
  loadP.catch(() => {});
  try {
    await cdp.send('Page.navigate', { url }, timeoutMs);
  } catch (err) {
    cancel();
    loadP.catch(() => {});
    throw err;
  }
  await loadP;
}

/**
 * Registers Page.loadEventFired BEFORE sending Page.reload to prevent SW/file:// reload races.
 */
export async function reloadAndWait(cdp, ignoreCache = false, timeoutMs = 15000) {
  const { promise: loadP, cancel } = cdp.waitForEvent('Page.loadEventFired', timeoutMs);
  loadP.catch(() => {});
  try {
    await cdp.send('Page.reload', { ignoreCache }, timeoutMs);
  } catch (err) {
    cancel();
    loadP.catch(() => {});
    throw err;
  }
  await loadP;
}

/**
 * Dispatches real CDP pointer input (mouseMoved -> mousePressed -> wait -> mouseReleased).
 * Essential for pointerdown-bound handlers (.hold-upgrade-btn, #pop-buy, canvas#world)
 * and genuine Web Audio user gesture unlock.
 */
export async function clickAt(cdp, x, y, holdMs = 35) {
  const cx = Math.round(x * 100) / 100;
  const cy = Math.round(y * 100) / 100;
  await cdp.send(
    'Input.dispatchMouseEvent',
    {
      type: 'mouseMoved',
      x: cx,
      y: cy,
      button: 'none',
      buttons: 0,
    },
    30000,
  );
  await cdp.send(
    'Input.dispatchMouseEvent',
    {
      type: 'mousePressed',
      x: cx,
      y: cy,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    },
    30000,
  );
  if (holdMs > 0) {
    await sleep(holdMs);
  }
  await cdp.send(
    'Input.dispatchMouseEvent',
    {
      type: 'mouseReleased',
      x: cx,
      y: cy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    },
    30000,
  );
}

/**
 * Locates an element via CSS selector or page-side locator function string,
 * verifies non-zero bounding box, and clicks its center with real CDP mouse events.
 */
export async function clickElement(session, selectorOrFn, holdMs = 35) {
  const expr =
    typeof selectorOrFn === 'function'
      ? `(() => {
          const el = (${selectorOrFn.toString()})();
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
            width: r.width,
            height: r.height,
            disabled: Boolean(el.disabled),
            visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
            text: (el.textContent || '').trim().slice(0, 80),
          };
        })()`
      : `(() => {
          const el = document.querySelector(${JSON.stringify(selectorOrFn)});
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
            width: r.width,
            height: r.height,
            disabled: Boolean(el.disabled),
            visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
            text: (el.textContent || '').trim().slice(0, 80),
          };
        })()`;

  const info = await session.evaluate(expr);
  if (!info || !info.visible) {
    throw new Error(
      `clickElement: element not found or not visible (${typeof selectorOrFn === 'string' ? selectorOrFn : 'custom locator'})`,
    );
  }
  await session.clickAt(info.x, info.y, holdMs);
  return info;
}
