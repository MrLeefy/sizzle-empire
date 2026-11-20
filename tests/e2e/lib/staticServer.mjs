import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/**
 * Starts an ephemeral 127.0.0.1:0 static HTTP server for dist/.
 * - Strips query parameters (e.g. Workbox ?__WB_REVISION__=...)
 * - Guards against path traversal
 * - Returns clean 404 JSON on /api/*
 * - Sets Cache-Control: no-cache and explicit MIME types
 */
export async function startStaticServer(rootDir) {
  const absRoot = path.resolve(rootDir);
  const realRoot = fs.realpathSync(absRoot);

  const server = http.createServer((req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      let pathname;
      try {
        pathname = decodeURIComponent(reqUrl.pathname);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
        return;
      }

      if (pathname.includes('\0')) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
        return;
      }

      if (pathname === '/api' || pathname.startsWith('/api/')) {
        res.writeHead(404, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ error: 'offline_static_server', offline: true }));
        return;
      }

      if (pathname === '/') {
        pathname = '/index.html';
      }

      const resolved = path.resolve(absRoot, `.${pathname}`);
      if (resolved !== absRoot && !resolved.startsWith(absRoot + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      let realFile;
      try {
        realFile = fs.realpathSync(resolved);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      const ext = path.extname(realFile).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const body = fs.readFileSync(realFile);

      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Internal Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to obtain ephemeral static server port');
  }

  const port = addr.port;
  const url = `http://127.0.0.1:${port}`;

  async function close() {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  return { server, port, url, close };
}
