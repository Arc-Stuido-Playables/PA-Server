import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import busboy from 'busboy';

import { createBasicAuth } from './auth.js';
import { LimitError, Storage, decodeFilename, isHtml, safeName } from './storage.js';
import { listPage, viewerPage } from './views.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
};

const mimeOf = (name) => MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(text);
}

function sendHtml(req, res, html) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    // Re-uploads must show up immediately under the same link.
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const notFound = (res) => sendText(res, 404, '404 page not found');
const redirect = (res, status, location) => {
  res.writeHead(status, { Location: location });
  res.end();
};

/** Static assets are indexed once at startup; only these exact paths are served. */
async function loadAssets() {
  const assets = new Map();
  for (const entry of await readdir(PUBLIC_DIR, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const abs = path.join(entry.parentPath ?? entry.path, entry.name);
    const rel = path.relative(PUBLIC_DIR, abs).split(path.sep).join('/');
    assets.set(`/assets/${rel}`, { body: await readFile(abs), type: mimeOf(abs) });
  }
  return assets;
}

export async function createApp({ dataDir, maxUploadBytes, adminUser, adminPassword }) {
  const storage = new Storage(dataDir);
  await storage.init();
  const assets = await loadAssets();
  const authorized = createBasicAuth(adminUser, adminPassword);
  const maxUploadMb = Math.round(maxUploadBytes / 1024 / 1024);

  function requireAuth(req, res) {
    if (!authorized || authorized(req)) return true;
    sendText(res, 401, 'Требуется авторизация', {
      'WWW-Authenticate': 'Basic realm="PA-Server", charset="UTF-8"',
    });
    return false;
  }

  async function handleList(req, res, url) {
    if (!requireAuth(req, res)) return;
    const files = await storage.list();
    sendHtml(req, res, listPage(files, { uploaded: url.searchParams.get('uploaded'), maxUploadMb }));
  }

  function handleUpload(req, res) {
    if (!requireAuth(req, res)) return;

    let bb;
    try {
      bb = busboy({
        headers: req.headers,
        // Keep raw bytes; decodeFilename() picks UTF-8 or cp1251.
        defParamCharset: 'latin1',
        limits: { files: 1, fileSize: maxUploadBytes, fields: 20, parts: 30 },
      });
    } catch {
      sendText(res, 400, 'Ожидается multipart/form-data с полем file');
      return;
    }

    let job = null;
    let current = null;

    bb.on('file', (field, stream, info) => {
      if (field !== 'file' || job) {
        stream.resume();
        return;
      }
      if (!info.filename) {
        stream.resume();
        job = Promise.resolve({ status: 400, text: 'Файл не выбран' });
        return;
      }
      const name = safeName(decodeFilename(info.filename));
      if (!name) {
        stream.resume();
        job = Promise.resolve({ status: 400, text: 'Недопустимое имя файла' });
        return;
      }
      current = stream;
      job = storage.save(stream, name).then(
        () => ({ status: 303, name }),
        (err) => {
          if (err instanceof LimitError) return { status: 413, text: `Файл больше ${maxUploadMb} МБ` };
          if (err.code === 'EINVAL' || err.code === 'ENOENT') return { status: 400, text: 'Недопустимое имя файла' };
          if (err.message === 'aborted') return { status: 400, text: 'Загрузка прервана' };
          console.error('upload failed:', err);
          return { status: 500, text: 'Не удалось сохранить файл' };
        },
      );
    });

    const finish = async () => {
      const result = job ? await job : { status: 400, text: 'Файл не выбран' };
      if (res.headersSent) return;
      if (result.status === 303) {
        console.log(`uploaded: ${result.name}`);
        redirect(res, 303, `/list?uploaded=${encodeURIComponent(result.name)}`);
      } else {
        sendText(res, result.status, result.text);
      }
    };

    bb.on('close', finish);
    bb.on('error', () => {
      current?.destroy(new Error('aborted'));
      if (job) finish();
      else if (!res.headersSent) sendText(res, 400, 'Некорректный запрос');
    });
    // A dropped connection must not leave a half-written temp file behind.
    req.on('close', () => {
      if (!req.complete) current?.destroy(new Error('aborted'));
    });
    req.pipe(bb);
  }

  async function handleFile(req, res, rawName) {
    let name;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      return notFound(res);
    }
    if (safeName(name) !== name) return notFound(res);
    const st = await storage.stat(name);
    if (!st) return notFound(res);

    if (isHtml(name)) {
      const content = await readFile(storage.pathOf(name), 'utf8');
      return sendHtml(req, res, viewerPage(name, content));
    }

    res.writeHead(200, {
      'Content-Type': mimeOf(name),
      'Content-Length': st.size,
      'Last-Modified': st.mtime.toUTCString(),
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(storage.pathOf(name)).on('error', () => res.destroy()).pipe(res);
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const readOnly = req.method === 'GET' || req.method === 'HEAD';

    if (pathname === '/upload') {
      if (req.method !== 'POST') return sendText(res, 405, 'Метод не поддерживается', { Allow: 'POST' });
      return handleUpload(req, res);
    }
    if (!readOnly) return sendText(res, 405, 'Метод не поддерживается', { Allow: 'GET, HEAD' });

    if (pathname === '/') return redirect(res, 302, '/list');
    if (pathname === '/list') return handleList(req, res, url);
    if (pathname === '/files') return redirect(res, 301, '/files/');
    if (pathname === '/healthz') return sendText(res, 200, 'ok');
    if (pathname.startsWith('/files/') && pathname.length > '/files/'.length) {
      return handleFile(req, res, pathname.slice('/files/'.length));
    }

    const asset = assets.get(pathname);
    if (asset) {
      res.writeHead(200, {
        'Content-Type': asset.type,
        'Content-Length': asset.body.length,
        'Cache-Control': 'public, max-age=300',
      });
      return res.end(req.method === 'HEAD' ? undefined : asset.body);
    }
    return notFound(res);
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) sendText(res, 500, 'Внутренняя ошибка сервера');
      else res.destroy();
    });
  });
  // Large builds over slow connections: allow long uploads.
  server.requestTimeout = 30 * 60 * 1000;
  return server;
}
