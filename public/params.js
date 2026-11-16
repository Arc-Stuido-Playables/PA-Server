// Parameter panel of the viewer: edits the numeric values the playable declares in its
// pa-config block, previews them live and saves them back to the server.
import { applyValues } from './pa-config.js';

const iframe = document.querySelector('.phone iframe');
const panel = document.getElementById('params-panel');
const form = document.getElementById('params-form');
const status = document.getElementById('params-status');
const toggle = document.querySelector('.action-btn.params');
const saveBtn = document.getElementById('params-save');
const resetBtn = document.getElementById('params-reset');

let saved = JSON.parse(document.getElementById('pa-params').textContent);
const inputs = new Map();

function setStatus(text, kind = '') {
  status.textContent = text;
  status.dataset.kind = kind;
}

function currentValues() {
  const values = {};
  for (const [key, { number }] of inputs) values[key] = number.valueAsNumber;
  return values;
}

function changedValues() {
  const now = currentValues();
  return Object.fromEntries(saved.filter((p) => now[p.key] !== p.value).map((p) => [p.key, now[p.key]]));
}

function syncDirty() {
  const dirty = Object.keys(changedValues()).length > 0;
  saveBtn.disabled = !dirty;
  resetBtn.disabled = !dirty;
  toggle.classList.toggle('dirty', dirty);
  for (const p of saved) inputs.get(p.key).row.classList.toggle('changed', inputs.get(p.key).number.valueAsNumber !== p.value);
  return dirty;
}

/** Restart the playable with the values currently in the form. */
function preview() {
  try {
    iframe.srcdoc = applyValues(iframe.getAttribute('srcdoc'), currentValues());
    if (syncDirty()) setStatus('Предпросмотр: изменения не сохранены', 'warn');
    else setStatus('');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

let timer;
function schedulePreview() {
  syncDirty();
  clearTimeout(timer);
  timer = setTimeout(preview, 350);
}

function build() {
  form.textContent = '';
  inputs.clear();
  for (const p of saved) {
    const row = document.createElement('label');
    row.className = 'param';
    const name = document.createElement('span');
    name.className = 'param-name';
    name.textContent = p.label;
    name.title = p.key;
    row.append(name);

    const number = document.createElement('input');
    number.type = 'number';
    number.value = p.value;
    number.step = p.step ?? 'any';
    if (p.min !== undefined) number.min = p.min;
    if (p.max !== undefined) number.max = p.max;

    let range = null;
    if (p.min !== undefined && p.max !== undefined) {
      range = document.createElement('input');
      range.type = 'range';
      range.min = p.min;
      range.max = p.max;
      range.step = p.step ?? (p.max - p.min) / 100;
      range.value = p.value;
      range.setAttribute('aria-label', p.label);
      range.addEventListener('input', () => { number.value = range.value; schedulePreview(); });
      row.append(range);
    }
    number.addEventListener('input', () => {
      if (range && !Number.isNaN(number.valueAsNumber)) range.value = number.value;
      schedulePreview();
    });
    row.append(number);
    form.append(row);
    inputs.set(p.key, { row, number, range });
  }
  syncDirty();
}

resetBtn.addEventListener('click', () => {
  build();
  preview();
});

saveBtn.addEventListener('click', async () => {
  const values = changedValues();
  if (Object.values(values).some(Number.isNaN)) return setStatus('Заполните все поля числами', 'error');
  saveBtn.disabled = true;
  setStatus('Сохраняю…');
  try {
    const res = await fetch(`/config/${location.pathname.split('/').pop()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    if (!res.ok) {
      syncDirty();
      return setStatus(res.status === 401 ? 'Нужен вход: откройте /list и введите пароль' : await res.text(), 'error');
    }
    saved = (await res.json()).params;
    build();
    preview();
    setStatus('Сохранено — плеебл по ссылке обновлён', 'ok');
  } catch {
    syncDirty();
    setStatus('Сеть недоступна — не сохранено', 'error');
  }
});

form.addEventListener('submit', (e) => e.preventDefault());

function setOpen(open) {
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.classList.toggle('active', open);
}
toggle.addEventListener('click', () => setOpen(panel.hidden));
document.getElementById('params-close').addEventListener('click', () => setOpen(false));

build();
