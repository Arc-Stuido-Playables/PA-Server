// Playable config block: <script type="application/json" id="pa-config">{...}</script>
// Shared by the server (read + save) and the viewer (live preview). Pure functions only.
// Format and rules: docs/PLAYABLE-CONFIG.md

const BLOCK = /(<script\b[^>]*\bid\s*=\s*(["'])pa-config\2[^>]*>)([\s\S]*?)(<\/script\s*>)/i;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function parse(html) {
  const m = BLOCK.exec(html);
  if (!m) return null;
  try {
    const data = JSON.parse(m[3]);
    return isObj(data) ? data : null;
  } catch {
    return null;
  }
}

function paramsOf(data) {
  const params = [];
  for (const [key, v] of Object.entries(data)) {
    if (isNum(v)) {
      params.push({ key, label: key, value: v });
    } else if (isObj(v) && isNum(v.value)) {
      const p = { key, label: typeof v.label === 'string' && v.label ? v.label : key, value: v.value };
      for (const f of ['min', 'max', 'step']) if (isNum(v[f])) p[f] = v[f];
      params.push(p);
    }
  }
  return params;
}

/** Numeric parameters declared by the playable, or [] if it has no (valid) config block. */
export function readParams(html) {
  const data = parse(html);
  return data ? paramsOf(data) : [];
}

/**
 * Return `html` with the given numeric values written into its config block.
 * Only parameters the playable already declares can be changed; everything else
 * in the block (other keys, labels, ranges) is kept. Throws Error on invalid input.
 */
export function applyValues(html, values) {
  const data = parse(html);
  if (!data) throw new Error('В плеебле нет конфига pa-config');
  if (!isObj(values)) throw new Error('Некорректные значения');
  const known = new Map(paramsOf(data).map((p) => [p.key, p]));

  for (const [key, value] of Object.entries(values)) {
    const p = known.get(key);
    if (!p) throw new Error(`Неизвестный параметр: ${key}`);
    if (!isNum(value)) throw new Error(`«${p.label}»: нужно число`);
    if (p.min !== undefined && value < p.min) throw new Error(`«${p.label}»: минимум ${p.min}`);
    if (p.max !== undefined && value > p.max) throw new Error(`«${p.label}»: максимум ${p.max}`);
    if (isObj(data[key])) data[key].value = value;
    else data[key] = value;
  }

  // "<" must not appear raw inside a <script> block.
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return html.replace(BLOCK, (_, open, _q, _body, close) => `${open}\n${json}\n${close}`);
}
