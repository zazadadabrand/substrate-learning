// Substrate Learning · Materials pass
// POST { name, outcome, layer: { name, sub }, atoms: [{ n, hrs, ex, pass }] }
//  -> { ok, modules: [mod|null], via, covered, expected }
// One atom per call. A full track is many short calls, not one long one.
// The function must return before Vercel's 60s limit, so the upstream call
// is compact, capped at 2048 tokens, and aborted at 45s with a JSON body.

import { parseModules } from '../lib/module.js';

const MAX_ATOMS = 1;
const MAX_TOKENS = 2048;
const UPSTREAM_MS = 45000;

const MATERIALS_RULES = `You are the Substrate Learning materials writer. A curriculum atom already exists. Write its module: a from-zero lesson, a reference sheet, and a drill.

Hard rules:
1. Write so a smart kid could learn it. Short sentences. When you use a real term, mark it with **double asterisks** once, then say what it means in plain words.
2. Deterministic only. Every check and every drill item has one right answer a careful reader can defend from the lesson. No taste questions. No invented statistics, quotes, dates, or citations.
3. Teach from zero. The first lesson step assumes nothing. The last lesson step says how the drill is passed.
4. Lesson checks: q is the question, yes is the right short answer, no is a plausible wrong answer, why explains in one or two sentences.
5. Drill: each item has q, c (three short choices), i (the index of the one correct choice), and y (why). Wrong choices must be actually wrong.
6. SPEED CONTRACT: exactly 3 lesson steps. Steps 1 and 2 include q, yes, no, and why. Step 3 has no check. Exactly 3 reference cards. Exactly 4 drill items. Lesson body under 140 characters. Reference body under 70. Drill question under 60. Each choice under 24 characters. why under 80.
7. One module, finished JSON. Do not stop mid-object.

Return the module by calling submit_modules. No markdown. No preamble.`;

const SUBMIT_MODULES = {
  name: 'submit_modules',
  description: 'Submit one interactive module per atom, in the same order.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['modules'],
    properties: {
      modules: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ls', 'rf', 'dr'],
          properties: {
            ls: {
              type: 'array',
              minItems: 3,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['k', 't', 'b'],
                properties: {
                  k: { type: 'string' },
                  t: { type: 'string' },
                  b: { type: 'string' },
                  q: { type: 'string' },
                  yes: { type: 'string' },
                  no: { type: 'string' },
                  why: { type: 'string' }
                }
              }
            },
            rf: {
              type: 'array',
              minItems: 3,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['t', 'b'],
                properties: {
                  t: { type: 'string' },
                  b: { type: 'string' }
                }
              }
            },
            dr: {
              type: 'array',
              minItems: 4,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['q', 'c', 'i', 'y'],
                properties: {
                  q: { type: 'string' },
                  c: { type: 'array', items: { type: 'string' }, minItems: 2 },
                  i: { type: 'integer' },
                  y: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }
};

function logMaterials(event, extra) {
  console.log(JSON.stringify({
    tag: 'substrate-materials',
    event,
    ...extra
  }));
}

function extractPayload(data) {
  const blocks = Array.isArray(data && data.content) ? data.content : [];
  for (const b of blocks) {
    if (b && b.type === 'tool_use' && b.input && typeof b.input === 'object') {
      return { kind: 'tool', value: b.input };
    }
  }
  const text = blocks
    .filter((b) => b && b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n');
  return { kind: 'text', value: text };
}

function usageOf(data) {
  const u = (data && data.usage) || {};
  return {
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0
  };
}

function atomLine(atom, index) {
  const ex = Array.isArray(atom.ex) ? atom.ex.map((x) => String(x)).filter(Boolean).slice(0, 4) : [];
  return [
    `ATOM ${index + 1}: ${String(atom.n || '').trim()}`,
    `Hours: ${atom.hrs || ''}`,
    `Pass when: ${String(atom.pass || '').trim()}`,
    ex.length ? `Exercises already on the map:\n- ${ex.join('\n- ')}` : ''
  ].filter(Boolean).join('\n');
}

async function callAnthropic(key, { name, outcome, layer, atoms }) {
  const layerName = layer && layer.name ? String(layer.name) : 'Layer';
  const layerSub = layer && layer.sub ? String(layer.sub) : '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_MS);
  const body = {
    model: 'claude-haiku-4-5',
    max_tokens: MAX_TOKENS,
    system: MATERIALS_RULES,
    tools: [SUBMIT_MODULES],
    tool_choice: { type: 'tool', name: 'submit_modules' },
    messages: [{
      role: 'user',
      content: [
        `Destination: ${name}`,
        `What done looks like: ${outcome}`,
        `Layer: ${layerName}${layerSub ? ' — ' + layerSub : ''}`,
        'Write exactly 1 module for this atom.',
        '',
        atoms.map(atomLine).join('\n\n'),
        '',
        'Call submit_modules with a modules array of length 1.'
      ].join('\n')
    }]
  };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const data = await r.json();
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function salvageFromResponse(data, expected) {
  const payload = extractPayload(data);
  const textLen = payload.kind === 'text'
    ? String(payload.value || '').length
    : JSON.stringify(payload.value || {}).length;
  const parsed = parseModules(payload.value, expected);
  return {
    payloadKind: payload.kind,
    textLen,
    stopReason: data && data.stop_reason,
    usage: usageOf(data),
    ...parsed
  };
}

function cleanAtoms(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((atom) => {
      if (!atom || typeof atom !== 'object') return null;
      const n = String(atom.n || atom.name || '').trim();
      if (!n) return null;
      const ex = Array.isArray(atom.ex) ? atom.ex.map((x) => String(x)).filter(Boolean).slice(0, 4) : [];
      return {
        n: n.slice(0, 140),
        hrs: atom.hrs,
        ex,
        pass: String(atom.pass || '').trim().slice(0, 180)
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ATOMS);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ ok: false, error: 'ENGINE_KEY_MISSING' });
    return;
  }
  const body = req.body || {};
  const name = String(body.name || '').trim();
  if (name.length < 2) {
    res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
    return;
  }
  const rawAtoms = Array.isArray(body.atoms) ? body.atoms : [];
  if (rawAtoms.length > MAX_ATOMS) {
    res.status(400).json({ ok: false, error: 'BATCH_TOO_BIG', detail: 'Send one atom per request.' });
    return;
  }
  const atoms = cleanAtoms(body.atoms);
  if (!atoms.length) {
    res.status(400).json({ ok: false, error: 'ATOMS_REQUIRED' });
    return;
  }
  const outcome = String(body.outcome || 'not specified').trim().slice(0, 240);
  const layer = body.layer && typeof body.layer === 'object'
    ? { name: String(body.layer.name || '').slice(0, 80), sub: String(body.layer.sub || '').slice(0, 120) }
    : { name: '', sub: '' };

  const empty = () => atoms.map(() => null);
  try {
    const first = await callAnthropic(key, { name, outcome, layer, atoms });
    if (!first.ok) {
      logMaterials('upstream', {
        status: first.status,
        stop_reason: first.data && first.data.stop_reason,
        usage: usageOf(first.data)
      });
      res.status(200).json({
        ok: true,
        modules: empty(),
        via: 'upstream',
        covered: 0,
        expected: atoms.length
      });
      return;
    }

    const result = salvageFromResponse(first.data, atoms.length);
    logMaterials('pass1', {
      stop_reason: result.stopReason,
      usage: result.usage,
      textLen: result.textLen,
      kind: result.payloadKind,
      via: result.via,
      covered: result.covered || 0,
      expected: atoms.length
    });

    res.status(200).json({
      ok: true,
      modules: result.modules || empty(),
      via: result.via,
      covered: result.covered || 0,
      expected: atoms.length
    });
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e && e.message)));
    logMaterials(aborted ? 'timeout' : 'throw', { detail: String(e && e.message) });
    res.status(200).json({
      ok: true,
      modules: empty(),
      via: aborted ? 'timeout' : 'throw',
      covered: 0,
      expected: atoms.length
    });
  }
}
