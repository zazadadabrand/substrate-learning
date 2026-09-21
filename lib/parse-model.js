// Salvage a substrate model from model text or a partial object.
// Client contract: { lane, layers: [{ name, sub, atoms: [{ n, hrs, ex[], pass }] }] }

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(x)));
}

export function extractJsonText(text) {
  if (text == null) return '';
  const stripped = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  if (start < 0) return '';
  return stripped.slice(start);
}

export function tryParseJson(text) {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function sliceFirstJsonObject(text) {
  const src = extractJsonText(text);
  if (!src) return '';
  let inString = false;
  let escape = false;
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(0, i + 1);
    }
  }
  return src;
}

function scanStructure(s) {
  let inString = false;
  let escape = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop();
    }
  }
  return { inString, escape, stack };
}

function trimIncompleteTail(s) {
  let t = s.replace(/\s+$/g, '');
  if (t.endsWith('\\')) t = t.slice(0, -1);
  t = t.replace(/,?\s*"[^"]*$/, '');
  t = t.replace(/,?\s*"[^"\\]*(?:\\.[^"\\]*)*"\s*:\s*$/, '');
  t = t.replace(/,?\s*(?:-?\d+\.(?:\d+)?)?$/, (m) => {
    const lit = m.trim();
    if (!lit) return '';
    if (/^-?\d+$/.test(lit)) return m;
    if (/^-?\d+\.\d+$/.test(lit)) return m;
    return '';
  });
  t = t.replace(/,?\s*(?:true|false|null|tru|fals?|nul)?$/i, (m) => {
    const lit = m.trim().toLowerCase();
    if (lit === 'true' || lit === 'false' || lit === 'null') return m;
    return '';
  });
  t = t.replace(/,\s*$/, '');
  return t;
}

export function closeTruncatedJson(text) {
  const src = extractJsonText(text);
  if (!src) return '';
  let out = src;
  let state = scanStructure(out);
  if (state.inString) {
    if (state.escape && out.endsWith('\\')) out = out.slice(0, -1);
    out += '"';
  }
  out = trimIncompleteTail(out);
  state = scanStructure(out);
  if (state.inString) out += '"';
  out = out.replace(/,\s*$/, '');
  state = scanStructure(out);
  while (state.stack.length) {
    out += state.stack.pop();
    state = scanStructure(out);
  }
  return out;
}

export function repairTruncatedJson(text) {
  const slice = sliceFirstJsonObject(text);
  const direct = tryParseJson(slice);
  if (direct) return direct;
  const closed = closeTruncatedJson(slice);
  const repaired = tryParseJson(closed);
  if (repaired) return repaired;
  return null;
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => String(x == null ? '' : x).trim())
    .filter(Boolean);
}

function normalizeAtom(atom) {
  if (!atom || typeof atom !== 'object') return null;
  const n = String(atom.n || atom.name || atom.title || '').trim();
  if (!n) return null;
  const hrs = clamp(atom.hrs != null ? atom.hrs : atom.hours, 2, 16);
  let ex = asStringList(atom.ex);
  if (!ex.length) ex = asStringList(atom.exercises);
  if (!ex.length) ex = asStringList(atom.exercise);
  const pass = String(atom.pass || atom.pass_condition || atom.passWhen || '').trim();
  return { n, hrs, ex: ex.slice(0, 4), pass };
}

function normalizeLayer(layer) {
  if (!layer || typeof layer !== 'object') return null;
  const name = String(layer.name || layer.title || '').trim();
  if (!name) return null;
  const rawAtoms = Array.isArray(layer.atoms) ? layer.atoms : [];
  const atoms = rawAtoms.map(normalizeAtom).filter(Boolean);
  if (!atoms.length) return null;
  return {
    name,
    sub: String(layer.sub || layer.subtitle || layer.blurb || '').trim(),
    atoms
  };
}

export function normalizeModel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const root = raw.model && raw.model.layers ? raw.model : raw;
  const layersIn = Array.isArray(root.layers) ? root.layers : [];
  const layers = layersIn.map(normalizeLayer).filter(Boolean);
  if (!layers.length) return null;
  return {
    lane: String(root.lane || root.domain || '').trim(),
    layers
  };
}

export function parseModel(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const fromObj = normalizeModel(input);
    if (fromObj) return { model: fromObj, via: 'object' };
  }
  const text = typeof input === 'string' ? input : '';
  if (!text.trim()) return { model: null, via: 'empty' };

  const slice = sliceFirstJsonObject(text);
  let obj = tryParseJson(slice);
  let via = 'json';
  if (!obj) {
    obj = repairTruncatedJson(slice);
    via = obj ? 'repaired' : 'fail';
  }
  const model = normalizeModel(obj);
  if (!model) return { model: null, via: via === 'fail' ? 'fail' : 'empty' };
  return { model, via };
}

export function modelStats(model) {
  const layers = (model && model.layers) || [];
  let atoms = 0;
  layers.forEach((l) => {
    atoms += (l.atoms || []).length;
  });
  return { layers: layers.length, atoms };
}
