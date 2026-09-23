// Substrate Learning · Materials pass
// POST { name, outcome, layer: { name, sub }, atoms: [{ n, hrs, ex, pass }] }
//  -> { ok, modules: [mod|null], via, covered }
// One batch is 1 to 4 atoms. The client runs this after the curriculum pass,
// then again for any atom that came back empty. Modules are required at commission.

import { parseModules } from '../lib/module.js';

const MATERIALS_RULES = `You are the Substrate Learning materials writer. A curriculum atom already exists. You write the interactive module that ships with it: a from-zero lesson, a reference sheet, and a drill.

Hard rules:
1. Write so a smart kid could learn it. Short sentences. When you use a real term, mark it with **double asterisks** once, then say what it means in plain words.
2. Deterministic only. Every check and every drill item has one right answer a careful reader can defend from the lesson. No taste questions. No "which feels better".
3. Do not invent statistics, quotes, dates, or citations. Do not fake a study. Teach the move. If the atom names a person, only keep the name when you are sure; otherwise teach the skill without a name.
4. Teach from zero. The first lesson step assumes nothing. The last lesson step says how the drill is passed.
5. Lesson checks: q is the question, yes is the right short answer, no is a plausible wrong answer, why explains in one or two sentences.
6. Drill: each item has q, c (three or four short choices), i (the index of the one correct choice), and y (why). Wrong choices must be actually wrong.
7. SPEED CONTRACT: exactly 4 lesson steps. Steps 1, 2, and 3 include q, yes, no, and why. Step 4 has no check. Exactly 4 reference cards. Exactly 6 drill items. Lesson body under 240 characters. Reference body under 110. Drill question under 90. Each choice under 40 characters. why under 90.
8. Return one module per atom, in the same order. Do not skip an atom. Finish the JSON. Do not stop mid-object.

Return the modules by calling submit_modules. No markdown. No preamble.`;

const COMPACT_RULES = `You are the Substrate Learning materials writer. Write a compact module for each atom: lesson, reference, drill.

Hard rules:
1. Kid-simple. Deterministic right answers only. No invented statistics, quotes, or citations.
2. EMERGENCY COMPACT: exactly 3 lesson steps (steps 1 and 2 have q, yes, no, why). Exactly 3 reference cards. Exactly 4 drill items. Lesson body under 140 characters. Reference body under 70. Drill question under 60. Choices under 24 characters.
3. One module per atom, same order. Finish the entire JSON. Never truncate a string or an array.

Return the modules by calling submit_modules. No markdown. No preamble.`;

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

async function callAnthropic(key, { name, outcome, layer, atoms, compact }) {
  const layerName = layer && layer.name ? String(layer.name) : 'Layer';
  const layerSub = layer && layer.sub ? String(layer.sub) : '';
  const body = {
    model: 'claude-haiku-4-5',
    max_tokens: 8192,
    system: compact ? COMPACT_RULES : MATERIALS_RULES,
    tools: [SUBMIT_MODULES],
    tool_choice: { type: 'tool', name: 'submit_modules' },
    messages: [{
      role: 'user',
      content: [
        `Destination: ${name}`,
        `What done looks like: ${outcome}`,
        `Layer: ${layerName}${layerSub ? ' — ' + layerSub : ''}`,
        `Write ${atoms.length} module${atoms.length === 1 ? '' : 's'}, in this order.`,
        '',
        atoms.map(atomLine).join('\n\n'),
        '',
        'Call submit_modules with the finished modules array.'
      ].join('\n')
    }]
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  return { ok: r.ok, status: r.status, data };
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
    .slice(0, 4);
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
  const atoms = cleanAtoms(body.atoms);
  if (!atoms.length) {
    res.status(400).json({ ok: false, error: 'ATOMS_REQUIRED' });
    return;
  }
  const outcome = String(body.outcome || 'not specified').trim().slice(0, 240);
  const layer = body.layer && typeof body.layer === 'object'
    ? { name: String(body.layer.name || '').slice(0, 80), sub: String(body.layer.sub || '').slice(0, 120) }
    : { name: '', sub: '' };

  try {
    const first = await callAnthropic(key, { name, outcome, layer, atoms, compact: false });
    if (!first.ok) {
      logMaterials('upstream', {
        status: first.status,
        stop_reason: first.data && first.data.stop_reason,
        usage: usageOf(first.data)
      });
      res.status(502).json({
        ok: false,
        error: 'ENGINE_UPSTREAM',
        detail: first.data && first.data.error && first.data.error.message
      });
      return;
    }

    let result = salvageFromResponse(first.data, atoms.length);
    logMaterials('pass1', {
      stop_reason: result.stopReason,
      usage: result.usage,
      textLen: result.textLen,
      kind: result.payloadKind,
      via: result.via,
      covered: result.covered || 0,
      expected: atoms.length
    });

    if (!result.modules) {
      const retry = await callAnthropic(key, { name, outcome, layer, atoms, compact: true });
      if (!retry.ok) {
        logMaterials('retry_upstream', { status: retry.status, usage: usageOf(retry.data) });
      } else {
        result = salvageFromResponse(retry.data, atoms.length);
        logMaterials('pass2', {
          stop_reason: result.stopReason,
          usage: result.usage,
          textLen: result.textLen,
          kind: result.payloadKind,
          via: result.via,
          covered: result.covered || 0,
          expected: atoms.length
        });
      }
    }

    if (!result.modules) {
      res.status(500).json({
        ok: false,
        error: 'ENGINE_PARSE',
        detail: result.via || 'empty modules',
        stop_reason: result.stopReason,
        usage: result.usage
      });
      return;
    }

    res.status(200).json({
      ok: true,
      modules: result.modules,
      via: result.via,
      covered: result.covered,
      expected: atoms.length
    });
  } catch (e) {
    logMaterials('throw', { detail: String(e && e.message) });
    res.status(500).json({ ok: false, error: 'ENGINE_PARSE', detail: String(e && e.message) });
  }
}
