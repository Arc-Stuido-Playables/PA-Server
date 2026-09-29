import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { createApp } from '../src/app.js';
import { createAttemptLimiter } from '../src/auth.js';
import { decodeFilename, safeName } from '../src/storage.js';

const MB = 1024 * 1024;

async function startServer(options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pa-server-'));
  const server = await createApp({ dataDir, maxUploadBytes: MB, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    dataDir,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

function upload(base, name, content, init = {}) {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  return fetch(`${base}/upload`, { method: 'POST', body: form, redirect: 'manual', ...init });
}

const fileLink = (name) => `/files/${encodeURIComponent(name)}`;

describe('safeName', () => {
  test('keeps real-world names intact', () => {
    for (const n of [
      '04_G5_31пак_EH1234i001v001.html',
      '01_KC_play040_01 на основе Frost & Flame.html',
      'zm_pl_ХХХ_OOO_v1_AG-unmuted (2).html',
      '06_BG_CM_1пак_электрическая цепь.html.html',
    ]) assert.equal(safeName(n), n);
  });
  test('strips paths and rejects traversal', () => {
    assert.equal(safeName('C:\\fakepath\\x.html'), 'x.html');
    assert.equal(safeName('../../etc/passwd'), 'passwd');
    for (const bad of ['', '..', '.', 'a/..', 'x\u0000.html', 'x\n.html', 'a'.repeat(256), null]) {
      assert.equal(safeName(bad), null, JSON.stringify(bad));
    }
  });
});

describe('decodeFilename', () => {
  test('UTF-8, cp1251 and already-decoded input', () => {
    assert.equal(decodeFilename(Buffer.from('1пак.html').toString('latin1')), '1пак.html');
    assert.equal(decodeFilename(Buffer.from([0xef, 0xe0, 0xea]).toString('latin1')), 'пак');
    assert.equal(decodeFilename('уже.html'), 'уже.html');
    assert.equal(decodeFilename('plain.html'), 'plain.html');
  });
});

describe('HTTP server', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await srv.close(); });

  test('GET / redirects to /list', async () => {
    const res = await fetch(`${srv.base}/`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/list');
  });

  test('empty list shows the upload form', async () => {
    const res = await fetch(`${srv.base}/list`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html; charset=utf-8/);
    const html = await res.text();
    assert.match(html, /Доступные файлы/);
    assert.match(html, /<form enctype="multipart\/form-data" action="\/upload" method="post"/);
    assert.match(html, /<input type="file" name="file"/);
    assert.match(html, />Загрузить</);
  });

  test('US1: upload a Cyrillic-named playable and see it in the list', async () => {
    const name = '04_G5_31пак_EH1234i001v001.html';
    const res = await upload(srv.base, name, '<!doctype html><p>v1</p>');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `/list?uploaded=${encodeURIComponent(name)}`);

    const html = await (await fetch(`${srv.base}${res.headers.get('location')}`)).text();
    assert.ok(html.includes(`href="${fileLink(name)}"`), 'link present');
    assert.ok(html.includes(`>${name}</span>`), 'readable name');
    assert.match(html, /class="file fresh"/);
  });

  test('US1: cp1251-encoded filename (Windows curl) is decoded, not garbled', async () => {
    const boundary = '----pa1251';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="01_BG_BS_1`),
      Buffer.from([0xef, 0xe0, 0xea]), // "пак" in windows-1251
      Buffer.from(`.html"\r\nContent-Type: text/html\r\n\r\nhi\r\n--${boundary}--\r\n`),
    ]);
    const res = await fetch(`${srv.base}/upload`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      redirect: 'manual',
    });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `/list?uploaded=${encodeURIComponent('01_BG_BS_1пак.html')}`);
  });

  test('US1: names with spaces, & and brackets survive', async () => {
    const name = '01_KC_play040_01 на основе Frost & Flame (2).html';
    assert.equal((await upload(srv.base, name, 'x')).status, 303);
    const html = await (await fetch(`${srv.base}/list`)).text();
    assert.ok(html.includes('Frost &amp; Flame (2).html'));
    assert.equal((await fetch(`${srv.base}${fileLink(name)}`)).status, 200);
  });

  test('US1: list is sorted by name', async () => {
    await upload(srv.base, 'b.html', 'b');
    await upload(srv.base, 'a.html', 'a');
    const html = await (await fetch(`${srv.base}/list`)).text();
    const names = [...html.matchAll(/class="file-name">([^<]+)</g)].map((m) => m[1]);
    assert.deepEqual(names, [...names].sort());
  });

  test('US1: upload without a file is rejected', async () => {
    const form = new FormData();
    form.append('file', new Blob([]), '');
    const res = await fetch(`${srv.base}/upload`, { method: 'POST', body: form, redirect: 'manual' });
    assert.equal(res.status, 400);

    const plain = await fetch(`${srv.base}/upload`, { method: 'POST', body: 'hello' });
    assert.equal(plain.status, 400);
  });

  test('US1: path traversal in filename stays inside storage', async () => {
    const res = await upload(srv.base, '../../evil.html', 'x');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/list?uploaded=evil.html');
    assert.ok((await readdir(path.join(srv.dataDir, 'files'))).includes('evil.html'));
    assert.equal((await upload(srv.base, '..', 'x')).status, 400);
  });

  test('GET /upload -> 405', async () => {
    const res = await fetch(`${srv.base}/upload`);
    assert.equal(res.status, 405);
    assert.equal(await res.text(), 'Метод не поддерживается');
  });

  test('US2: re-upload with the same name replaces content, single entry', async () => {
    const name = 'reupload.html';
    await upload(srv.base, name, '<p>OLD</p>');
    await upload(srv.base, name, '<p>NEW</p>');
    const viewer = await (await fetch(`${srv.base}${fileLink(name)}`)).text();
    assert.match(viewer, /NEW/);
    assert.doesNotMatch(viewer, /OLD/);
    const list = await (await fetch(`${srv.base}/list`)).text();
    assert.equal(list.split(`href="${fileLink(name)}"`).length - 1, 1);
  });

  test('US2: oversize upload -> 413, previous version intact, no temp leftovers', async () => {
    const name = 'big.html';
    await upload(srv.base, name, 'SMALL');
    const res = await upload(srv.base, name, Buffer.alloc(MB + 10, 97));
    assert.equal(res.status, 413);
    assert.equal(await readFile(path.join(srv.dataDir, 'files', name), 'utf8'), 'SMALL');
    assert.deepEqual(await readdir(path.join(srv.dataDir, 'tmp')), []);
  });

  test('US2: aborted upload leaves the published file intact', async () => {
    const name = 'abort.html';
    await upload(srv.base, name, 'STABLE');
    const boundary = '----pa';
    const { port } = new URL(srv.base);
    await new Promise((resolve) => {
      const req = http.request({
        port,
        host: '127.0.0.1',
        method: 'POST',
        path: '/upload',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': 100000 },
      });
      req.on('error', () => {});
      req.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n\r\npartial`);
      setTimeout(() => { req.destroy(); setTimeout(resolve, 150); }, 100);
    });
    assert.equal(await readFile(path.join(srv.dataDir, 'files', name), 'utf8'), 'STABLE');
    assert.deepEqual(await readdir(path.join(srv.dataDir, 'tmp')), []);
  });

  test('US3: HTML file opens in the viewer with escaped srcdoc', async () => {
    const name = '02_ToH_1пак_playable049.html';
    const playable = `<!doctype html><script>var a = "q" + 'x' && 1 < 2;</script><p>A&B</p>`;
    await upload(srv.base, name, playable);
    const res = await fetch(`${srv.base}${fileLink(name)}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    const html = await res.text();
    assert.ok(html.includes(`<title>${name}</title>`));
    for (const r of ['9:16', '16:9', '3:4', '4:3']) assert.ok(html.includes(`>${r}</button>`), r);
    assert.match(html, /class="action-btn reload"/);
    assert.match(html, /class="action-btn fullscreen"/);
    assert.match(html, /class="burger-menu"/);

    const srcdoc = /srcdoc="([^"]*)"/.exec(html)[1];
    const decoded = srcdoc
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    assert.equal(decoded, playable);
  });

  test('US4: only .html/.htm uploads are accepted', async () => {
    for (const name of ['build.zip', 'script.js', 'image.png', 'noext', 'page.html.zip']) {
      const res = await upload(srv.base, name, 'x');
      assert.equal(res.status, 415, name);
      assert.equal(await res.text(), 'Можно загружать только .html файлы');
    }
    assert.deepEqual(
      (await readdir(path.join(srv.dataDir, 'files'))).filter((n) => !/\.html?$/i.test(n)),
      [],
    );
    assert.equal((await upload(srv.base, 'UPPER.HTML', 'x')).status, 303);
    assert.equal((await upload(srv.base, 'old.htm', 'x')).status, 303);
  });

  test('US4: non-HTML files already on disk are still served as-is', async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 255]);
    await writeFile(path.join(srv.dataDir, 'files', '07_BG_CM_plb_2pack_google.zip'), bytes);
    const res = await fetch(`${srv.base}${fileLink('07_BG_CM_plb_2pack_google.zip')}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/zip');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);

    const head = await fetch(`${srv.base}${fileLink('07_BG_CM_plb_2pack_google.zip')}`, { method: 'HEAD' });
    assert.equal(head.headers.get('content-length'), String(bytes.length));
  });

  test('404 for missing files, /files/ and unknown paths', async () => {
    for (const p of ['/files/nope.html', '/files/', '/nope', '/files/..%2Fx', '/files/%E0%A4%A']) {
      const res = await fetch(`${srv.base}${p}`);
      assert.equal(res.status, 404, p);
      assert.equal(await res.text(), '404 page not found');
    }
    const res = await fetch(`${srv.base}/files`, { redirect: 'manual' });
    assert.equal(res.status, 301);
  });

  test('static assets are served', async () => {
    for (const a of ['/assets/app.css', '/assets/viewer.js', '/assets/list.js', '/assets/favicon.svg']) {
      assert.equal((await fetch(`${srv.base}${a}`)).status, 200, a);
    }
    assert.equal((await fetch(`${srv.base}/healthz`)).status, 200);
  });

  test('files dropped on disk directly also appear', async () => {
    await writeFile(path.join(srv.dataDir, 'files', 'manual.html'), 'm');
    const html = await (await fetch(`${srv.base}/list`)).text();
    assert.ok(html.includes(fileLink('manual.html')));
  });
});

describe('optional basic auth', () => {
  let srv;
  before(async () => { srv = await startServer({ adminUser: 'arc', adminPassword: 's3cret' }); });
  after(async () => { await srv.close(); });
  const auth = { Authorization: `Basic ${Buffer.from('arc:s3cret').toString('base64')}` };

  test('list and upload require credentials, files stay public', async () => {
    const denied = await fetch(`${srv.base}/list`);
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get('www-authenticate'), /Basic/);
    assert.equal((await upload(srv.base, 'x.html', 'x')).status, 401);

    assert.equal((await fetch(`${srv.base}/list`, { headers: auth })).status, 200);
    assert.equal((await upload(srv.base, 'x.html', 'x', { headers: auth })).status, 303);
    assert.equal((await fetch(`${srv.base}${fileLink('x.html')}`)).status, 200);
  });
});

describe('delete (002)', () => {
  let srv;
  let clock = 0;
  const limiter = createAttemptLimiter({ max: 5, windowMs: 15 * 60 * 1000, now: () => clock });
  before(async () => {
    srv = await startServer({ deletePassword: '9999', deleteLimiter: limiter });
  });
  after(async () => { await srv.close(); });

  const del = (name, password) => fetch(`${srv.base}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });

  test('list shows delete buttons and dialog when enabled', async () => {
    await upload(srv.base, 'shown.html', 'x');
    const html = await (await fetch(`${srv.base}/list`)).text();
    assert.match(html, /class="icon-btn delete"/);
    assert.match(html, /id="delete-dialog"/);
  });

  test('US1: correct password deletes the file', async () => {
    await upload(srv.base, 'гоним_v1.html', 'x');
    const res = await del('гоним_v1.html', '9999');
    assert.equal(res.status, 200);
    assert.equal((await fetch(`${srv.base}${fileLink('гоним_v1.html')}`)).status, 404);
    assert.ok(!(await (await fetch(`${srv.base}/list`)).text()).includes('гоним_v1.html'));
  });

  test('US1: wrong password keeps the file', async () => {
    await upload(srv.base, 'keep.html', 'x');
    const res = await del('keep.html', '0000');
    assert.equal(res.status, 403);
    assert.equal(await res.text(), 'Неверный пароль');
    assert.equal((await fetch(`${srv.base}${fileLink('keep.html')}`)).status, 200);
    limiter.reset('127.0.0.1');
    limiter.reset('::ffff:127.0.0.1');
  });

  test('US1: missing file, bad names, bad body, wrong method', async () => {
    assert.equal((await del('nope.html', '9999')).status, 404);
    assert.equal((await del('../keep.html', '9999')).status, 400);
    assert.equal((await del(null, '9999')).status, 400);
    const bad = await fetch(`${srv.base}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    assert.equal(bad.status, 400);
    assert.equal((await fetch(`${srv.base}/delete`)).status, 405);
    assert.equal((await fetch(`${srv.base}${fileLink('keep.html')}`)).status, 200);
  });

  test('US1: form-encoded body works too', async () => {
    await upload(srv.base, 'form.html', 'x');
    const res = await fetch(`${srv.base}/delete`, {
      method: 'POST',
      body: new URLSearchParams({ name: 'form.html', password: '9999' }),
    });
    assert.equal(res.status, 200);
  });

  test('US2: 5 wrong attempts lock out even the right password for 15 min', async () => {
    await upload(srv.base, 'target.html', 'x');
    for (let i = 0; i < 5; i++) assert.equal((await del('target.html', `000${i}`)).status, 403);
    const locked = await del('target.html', '9999');
    assert.equal(locked.status, 429);
    assert.equal(locked.headers.get('retry-after'), '900');
    assert.equal((await fetch(`${srv.base}${fileLink('target.html')}`)).status, 200);

    clock += 15 * 60 * 1000 + 1;
    assert.equal((await del('target.html', '9999')).status, 200);
  });

  test('US2: a success resets the failure counter', async () => {
    await upload(srv.base, 'r1.html', 'x');
    await upload(srv.base, 'r2.html', 'x');
    for (let i = 0; i < 4; i++) await del('r1.html', 'bad');
    assert.equal((await del('r1.html', '9999')).status, 200);
    for (let i = 0; i < 4; i++) await del('r2.html', 'bad');
    assert.equal((await del('r2.html', '9999')).status, 200);
  });
});

describe('delete disabled without DELETE_PASSWORD', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await srv.close(); });

  test('no buttons, endpoint refuses', async () => {
    await upload(srv.base, 'safe.html', 'x');
    const html = await (await fetch(`${srv.base}/list`)).text();
    assert.doesNotMatch(html, /icon-btn delete/);
    assert.doesNotMatch(html, /delete-dialog/);
    const res = await fetch(`${srv.base}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'safe.html', password: '' }),
    });
    assert.equal(res.status, 403);
    assert.equal((await fetch(`${srv.base}${fileLink('safe.html')}`)).status, 200);
  });
});
