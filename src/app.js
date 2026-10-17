import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import busboy from 'busboy';

import { createAttemptLimiter, createBasicAuth, createSecretCheck, createSessions } from './auth.js';
import { LimitError, Storage, decodeFilename, isHtml, safeName } from './storage.js';
import { listPage, loginPage, viewerPage } from './views.js';

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

function sendHtml(req, res, html, status = 200) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    // Re-uploads must show up immediately under the same link.
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const notFound = (res) => sendText(res, 404, '404 page not found');

/** attachment header that keeps Cyrillic names (RFC 6266 filename*) with an ASCII fallback. */
function contentDisposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
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

/** Read a small request body; rejects bodies over `limit` bytes. */
async function readSmallBody(req, limit = 8 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function createApp({
  dataDir,
  maxUploadBytes = 0,
  adminUser,
  adminPassword,
  accessPassword,
  deletePassword,
  deleteLimiter,
  loginLimiter,
}) {
  const storage = new Storage(dataDir);
  await storage.init();
  const assets = await loadAssets();
  const authorized = createBasicAuth(adminUser, adminPassword);
  const sessions = createSessions(accessPassword);
  // 0 / unset = no size limit.
  const uploadLimit = maxUploadBytes > 0 ? maxUploadBytes : Infinity;
  const maxUploadMb = maxUploadBytes > 0 ? Math.round(maxUploadBytes / 1024 / 1024) : 0;
  const deleteAllowed = createSecretCheck(deletePassword);
  const limiter = deleteLimiter ?? createAttemptLimiter();
  const loginAttempts = loginLimiter ?? createAttemptLimiter();

  /** Team-only routes: optional Basic auth plus the password login session. */
  function requireAuth(req, res, { page = false } = {}) {
    if (authorized && !authorized(req)) {
      sendText(res, 401, 'Требуется авторизация', {
        'WWW-Authenticate': 'Basic realm="PA-Server", charset="UTF-8"',
      });
      return false;
    }
    if (!sessions || sessions.valid(req)) return true;
    if (page) sendHtml(req, res, loginPage({}), 401);
    else sendText(res, 401, 'Требуется вход: откройте /list и введите пароль');
    return false;
  }

  async function handleList(req, res, url) {
    if (!requireAuth(req, res, { page: true })) return;
    const files = await storage.list();
    sendHtml(req, res, listPage(files, {
      uploaded: url.searchParams.get('uploaded'),
      maxUploadMb,
      canDelete: Boolean(deleteAllowed),
      canLogout: Boolean(sessions),
    }));
  }

  async function handleLogin(req, res) {
    if (!sessions) return redirect(res, 303, '/list');
    const ip = req.socket.remoteAddress;
    const wait = loginAttempts.retryAfter(ip);
    if (wait) {
      const minutes = Math.ceil(wait / 60000);
      return sendHtml(req, res, loginPage({ error: `Слишком много попыток. Попробуйте через ${minutes} мин.` }), 429);
    }
    let password;
    try {
      password = new URLSearchParams(await readSmallBody(req)).get('password');
    } catch {
      return sendHtml(req, res, loginPage({ error: 'Некорректный запрос' }), 400);
    }
    if (!sessions.checkPassword(password ?? '')) {
      loginAttempts.fail(ip);
      return sendHtml(req, res, loginPage({ error: 'Неверный пароль' }), 403);
    }
    loginAttempts.reset(ip);
    res.writeHead(303, { Location: '/list', 'Set-Cookie': sessions.issue() });
    res.end();
  }

  function handleUpload(req, res) {
    if (!requireAuth(req, res)) return;

    let bb;
    try {
      bb = busboy({
        headers: req.headers,
        // Keep raw bytes; decodeFilename() picks UTF-8 or cp1251.
        defParamCharset: 'latin1',
        limits: { files: 1, fileSize: uploadLimit, fields: 20, parts: 30 },
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
      if (!isHtml(name)) {
        stream.resume();
        job = Promise.resolve({ status: 415, text: 'Можно загружать только .html файлы' });
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

  async function handleDelete(req, res) {
    if (!requireAuth(req, res)) return;
    if (!deleteAllowed) return sendText(res, 403, 'Удаление отключено');

    const ip = req.socket.remoteAddress;
    const wait = limiter.retryAfter(ip);
    if (wait) {
      const minutes = Math.ceil(wait / 60000);
      return sendText(res, 429, `Слишком много попыток. Попробуйте через ${minutes} мин.`, {
        'Retry-After': String(Math.ceil(wait / 1000)),
      });
    }

    let body;
    try {
      const raw = await readSmallBody(req);
      body = (req.headers['content-type'] || '').includes('application/json')
        ? JSON.parse(raw)
        : Object.fromEntries(new URLSearchParams(raw));
    } catch {
      return sendText(res, 400, 'Некорректный запрос');
    }
    const { name, password } = body ?? {};
    if (typeof name !== 'string' || safeName(name) !== name) return sendText(res, 400, 'Недопустимое имя файла');

    if (!deleteAllowed(password)) {
      limiter.fail(ip);
      return sendText(res, 403, 'Неверный пароль');
    }
    limiter.reset(ip);

    if (!(await storage.remove(name))) return notFound(res);
    console.log(`deleted: ${name} (by ${ip})`);
    return sendText(res, 200, 'Удалено');
  }

  /** Decode and validate a file name from the URL; null if invalid or missing. */
  async function lookup(rawName) {
    let name;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      return null;
    }
    if (safeName(name) !== name) return null;
    const st = await storage.stat(name);
    return st ? { name, st } : null;
  }

  function sendRaw(req, res, { name, st }, { attachment = false } = {}) {
    res.writeHead(200, {
      'Content-Type': mimeOf(name),
      'Content-Length': st.size,
      'Last-Modified': st.mtime.toUTCString(),
      'Cache-Control': 'no-cache',
      ...(attachment ? { 'Content-Disposition': contentDisposition(name) } : {}),
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(storage.pathOf(name)).on('error', () => res.destroy()).pipe(res);
  }

  async function handleFile(req, res, rawName) {
    const file = await lookup(rawName);
    if (!file) return notFound(res);
    if (isHtml(file.name)) {
      const content = await readFile(storage.pathOf(file.name), 'utf8');
      return sendHtml(req, res, viewerPage(file.name, content));
    }
    return sendRaw(req, res, file);
  }

  /** The original file as an attachment, for the list's download button. */
  async function handleDownload(req, res, rawName) {
    if (!requireAuth(req, res)) return;
    const file = await lookup(rawName);
    if (!file) return notFound(res);
    return sendRaw(req, res, file, { attachment: true });
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const readOnly = req.method === 'GET' || req.method === 'HEAD';

    if (pathname === '/upload') {
      if (req.method !== 'POST') return sendText(res, 405, 'Метод не поддерживается', { Allow: 'POST' });
      return handleUpload(req, res);
    }
    if (pathname === '/login') {
      if (req.method !== 'POST') return redirect(res, 303, '/list');
      return handleLogin(req, res);
    }
    if (pathname === '/logout') {
      res.writeHead(303, { Location: '/list', ...(sessions ? { 'Set-Cookie': sessions.clear() } : {}) });
      return res.end();
    }
    if (pathname === '/delete') {
      if (req.method !== 'POST') return sendText(res, 405, 'Метод не поддерживается', { Allow: 'POST' });
      return handleDelete(req, res);
    }
    if (!readOnly) return sendText(res, 405, 'Метод не поддерживается', { Allow: 'GET, HEAD' });

    if (pathname === '/') return redirect(res, 302, '/list');
    if (pathname === '/list') return handleList(req, res, url);
    if (pathname === '/files') return redirect(res, 301, '/files/');
    if (pathname === '/healthz') return sendText(res, 200, 'ok');
    if (pathname.startsWith('/files/') && pathname.length > '/files/'.length) {
      return handleFile(req, res, pathname.slice('/files/'.length));
    }
    if (pathname.startsWith('/download/') && pathname.length > '/download/'.length) {
      return handleDownload(req, res, pathname.slice('/download/'.length));
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
  // No upload size limit, so no request time limit either (slow links, big builds).
  server.requestTimeout = 0;
  return server;
}
