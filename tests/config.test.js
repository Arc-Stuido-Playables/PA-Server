import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { createApp } from '../src/app.js';
import { applyValues, readParams } from '../public/pa-config.js';

async function startServer(options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pa-server-'));
  const server = await createApp({ dataDir, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
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

const TAIL = '<body><script>var a = 1 < 2 && "$&";</script></body></html>';
const playable = (cfg) => `<!doctype html><html><head><title>t</title>
<script type="application/json" id="pa-config">${cfg}</script></head>${TAIL}`;
const CFG = '{ "speed": { "value": 5, "min": 1, "max": 20, "step": 0.5, "label": "Скорость" }, "lives": 3, "title": "text stays", "flag": true }';

describe('playable config (005)', () => {
  let open;
  let locked;
  const save = (srv, name, values, init = {}) => fetch(`${srv.base}/config/${encodeURIComponent(name)}`, {
    method: 'POST',
    body: JSON.stringify({ values }),
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  before(async () => {
    open = await startServer();
    locked = await startServer({ accessPassword: '4321' });
  });
  after(async () => { await open.close(); await locked.close(); });

  test('readParams lists only numeric params; applyValues keeps everything else', () => {
    const html = playable(CFG);
    assert.deepEqual(readParams(html), [
      { key: 'speed', label: 'Скорость', value: 5, min: 1, max: 20, step: 0.5 },
      { key: 'lives', label: 'lives', value: 3 },
    ]);
    const out = applyValues(html, { speed: 7.5, lives: 1 });
    const block = JSON.parse(/id="pa-config">([\s\S]*?)<\/script>/.exec(out)[1]);
    assert.deepEqual(block, {
      speed: { value: 7.5, min: 1, max: 20, step: 0.5, label: 'Скорость' },
      lives: 1,
      title: 'text stays',
      flag: true,
    });
    assert.ok(out.endsWith(TAIL), 'rest of the playable is untouched');
    assert.deepEqual(readParams('<p>no config</p>'), []);
    assert.deepEqual(readParams(playable('{broken')), []);
  });

  test('a "<" in a label cannot break out of the script block', () => {
    const out = applyValues(playable('{ "n": { "value": 1, "label": "x <b> y" } }'), { n: 2 });
    const block = /id="pa-config">([\s\S]*?)<\/script>/.exec(out)[1];
    assert.ok(!block.includes('<'), 'no raw "<" inside the block');
    assert.ok(block.includes(`${String.fromCharCode(92)}u003cb>`));
    assert.deepEqual(readParams(out), [{ key: 'n', label: 'x <b> y', value: 2 }]);
  });

  test('applyValues rejects unknown keys, non-numbers and out-of-range values', () => {
    const html = playable(CFG);
    assert.throws(() => applyValues(html, { nope: 1 }), /Неизвестный параметр/);
    assert.throws(() => applyValues(html, { title: 1 }), /Неизвестный параметр/);
    assert.throws(() => applyValues(html, { speed: '7' }), /нужно число/);
    assert.throws(() => applyValues(html, { speed: 21 }), /максимум 20/);
    assert.throws(() => applyValues(html, { speed: 0 }), /минимум 1/);
    assert.throws(() => applyValues('<p>x</p>', { speed: 1 }), /нет конфига/);
  });

  test('viewer shows the panel with the params of the playable; none without a config', async () => {
    await upload(open.base, 'cfg.html', playable(CFG));
    await upload(open.base, 'plain.html', '<!doctype html><p>x</p>');
    const html = await (await fetch(`${open.base}/files/cfg.html`)).text();
    assert.match(html, /id="params-panel"/);
    assert.match(html, /class="action-btn params"/);
    const params = JSON.parse(/id="pa-params">([^<]*)</.exec(html)[1]);
    assert.equal(params[0].key, 'speed');
    assert.doesNotMatch(await (await fetch(`${open.base}/files/plain.html`)).text(), /params-panel|pa-params/);
    for (const a of ['/assets/params.js', '/assets/pa-config.js']) assert.equal((await fetch(`${open.base}${a}`)).status, 200);
  });

  test('saving rewrites the stored playable; the public link serves the new value', async () => {
    await upload(open.base, 'save.html', playable(CFG));
    const res = await save(open, 'save.html', { speed: 12 });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).params[0].value, 12);
    const stored = await readFile(path.join(open.dataDir, 'files', 'save.html'), 'utf8');
    assert.deepEqual(readParams(stored).map((p) => p.value), [12, 3]);
    assert.ok(stored.endsWith(TAIL));
    assert.deepEqual(await readdir(path.join(open.dataDir, 'tmp')), []);
    const viewer = await (await fetch(`${open.base}/files/save.html`)).text();
    assert.match(viewer, /&quot;value&quot;: 12/);
  });

  test('bad saves change nothing', async () => {
    await upload(open.base, 'bad.html', playable(CFG));
    const file = path.join(open.dataDir, 'files', 'bad.html');
    const original = await readFile(file, 'utf8');
    assert.equal((await save(open, 'bad.html', { speed: 999 })).status, 400);
    assert.equal((await save(open, 'bad.html', { hack: 1 })).status, 400);
    assert.equal((await save(open, 'plain.html', { speed: 1 })).status, 400);
    assert.equal((await save(open, 'missing.html', { speed: 1 })).status, 404);
    assert.equal((await fetch(`${open.base}/config/bad.html`)).status, 405);
    assert.equal(await readFile(file, 'utf8'), original);
  });

  test('with a list password: clients see no panel and cannot save, the team can', async () => {
    const login = await fetch(`${locked.base}/login`, {
      method: 'POST',
      body: new URLSearchParams({ password: '4321' }),
      redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    await upload(locked.base, 'team.html', playable(CFG), { headers: { cookie } });
    assert.doesNotMatch(await (await fetch(`${locked.base}/files/team.html`)).text(), /params-panel|pa-params/);
    assert.match(await (await fetch(`${locked.base}/files/team.html`, { headers: { cookie } })).text(), /id="params-panel"/);
    assert.equal((await save(locked, 'team.html', { speed: 9 })).status, 401);
    assert.equal((await save(locked, 'team.html', { speed: 9 }, { headers: { cookie } })).status, 200);
  });
});
