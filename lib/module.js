// Compact interactive module for one commissioned atom.
// Stored on the atom as `mod` and rendered as lesson + reference + drill.
//
// mod: {
//   ls: [{ k, t, b, q?, yes?, no?, why? }],  // lesson steps, checks on most steps
//   rf: [{ t, b }],                          // reference cards
//   dr: [{ q, c: [string], i, y }]           // drill items, i indexes the correct choice
// }

import { repairTruncatedJson, sliceFirstJsonObject, tryParseJson } from './parse-model.js';

function clip(value, max) {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function normalizeStep(step) {
  if (!step || typeof step !== 'object') return null;
  const t = clip(step.t || step.title, 80);
  const b = clip(step.body || step.text || step.b, 700);
  if (!t || !b) return null;
  const out = {
    k: clip(step.k || step.kicker || 'Lesson', 40),
    t,
    b
  };
  const q = clip(step.q || step.question, 160);
  const yes = clip(step.yes || step.right || step.a, 80);
  const no = clip(step.no || step.wrong || (step.body || step.text ? step.b : ''), 80);
  const why = clip(step.why || step.because, 220);
  if (q && yes && no && why && yes.toLowerCase() !== no.toLowerCase()) {
    out.q = q;
    out.yes = yes;
    out.no = no;
    out.why = why;
  }
  return out;
}

function normalizeRef(card) {
  if (!card || typeof card !== 'object') return null;
  const t = clip(card.t || card.title || card.name, 60);
  const b = clip(card.b || card.body || card.text, 280);
  if (!t || !b) return null;
  return { t, b };
}

function normalizeDrill(item) {
  if (!item || typeof item !== 'object') return null;
  const q = clip(item.q || item.question, 180);
  const y = clip(item.y || item.why || item.because, 220);
  const rawChoices = Array.isArray(item.c) ? item.c : (Array.isArray(item.choices) ? item.choices : []);
  const c = [];
  rawChoices.forEach((choice) => {
    const text = clip(choice, 80);
    if (!text) return;
    if (c.some((existing) => existing.toLowerCase() === text.toLowerCase())) return;
    c.push(text);
  });
  if (!q || !y || c.length < 2) return null;
  let i = Number(item.i != null ? item.i : item.correct);
  if (!Number.isInteger(i)) i = 0;
  if (i < 0 || i >= c.length) return null;
  return { q, c: c.slice(0, 4), i, y };
}

export function normalizeModule(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw.mod && typeof raw.mod === 'object' ? raw.mod : raw;
  const stepsIn = src.ls || src.lesson || src.steps || [];
  const refsIn = src.rf || src.ref || src.reference || src.cards || [];
  const drillsIn = src.dr || src.drill || src.drills || [];
  const ls = (Array.isArray(stepsIn) ? stepsIn : []).map(normalizeStep).filter(Boolean).slice(0, 5);
  const rf = (Array.isArray(refsIn) ? refsIn : []).map(normalizeRef).filter(Boolean).slice(0, 6);
  const dr = (Array.isArray(drillsIn) ? drillsIn : []).map(normalizeDrill).filter(Boolean).slice(0, 8);
  const checks = ls.filter((s) => s.q).length;
  if (ls.length < 3 || checks < 1 || rf.length < 3 || dr.length < 4) return null;
  return { ls, rf, dr };
}

export function moduleOk(mod) {
  return !!normalizeModule(mod);
}

function moduleListFrom(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw.modules)) return raw.modules;
  if (raw.mod) return [raw];
  if (raw.ls || raw.lesson || raw.steps) return [raw];
  return null;
}

export function alignModules(list, expected) {
  const src = Array.isArray(list) ? list : [];
  const n = expected || src.length;
  const modules = [];
  for (let i = 0; i < n; i++) {
    modules.push(normalizeModule(src[i]));
  }
  return modules;
}

export function parseModules(input, expected) {
  if (input && typeof input === 'object') {
    const list = moduleListFrom(input);
    if (list) {
      const modules = alignModules(list, expected || list.length);
      const covered = modules.filter(Boolean).length;
      if (!covered) return { modules: null, via: 'empty', covered: 0 };
      return { modules, via: 'object', covered };
    }
  }

  const text = typeof input === 'string' ? input : '';
  if (!text.trim()) return { modules: null, via: 'empty', covered: 0 };

  const slice = sliceFirstJsonObject(text);
  let obj = tryParseJson(slice);
  let via = 'json';
  if (!obj) {
    obj = repairTruncatedJson(slice);
    via = obj ? 'repaired' : 'fail';
  }
  const list = moduleListFrom(obj);
  if (!list) return { modules: null, via: via === 'fail' ? 'fail' : 'empty', covered: 0 };
  const modules = alignModules(list, expected || list.length);
  const covered = modules.filter(Boolean).length;
  if (!covered) return { modules: null, via: via === 'fail' ? 'fail' : 'empty', covered: 0 };
  return { modules, via, covered };
}

export function missingModuleIndexes(atoms) {
  const list = Array.isArray(atoms) ? atoms : [];
  const missing = [];
  list.forEach((atom, i) => {
    if (!atom || !moduleOk(atom.mod)) missing.push(i);
  });
  return missing;
}

export function modelModuleStats(model) {
  const layers = (model && model.layers) || [];
  let atoms = 0;
  let modules = 0;
  layers.forEach((layer) => {
    (layer.atoms || []).forEach((atom) => {
      atoms += 1;
      if (moduleOk(atom && atom.mod)) modules += 1;
    });
  });
  return { atoms, modules, missing: atoms - modules };
}

