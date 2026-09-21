// Substrate Learning · Commission Engine
// POST { name, outcome } -> { ok, model: { lane, layers: [ { name, sub, atoms: [ { n, hrs, ex[], pass } ] } ] } }
// Requires ANTHROPIC_API_KEY set in Vercel environment variables.

import { parseModel, modelStats } from '../lib/parse-model.js';

const METHODOLOGY = `You are the Substrate Learning engine. You reverse engineer a specific outcome into a deterministic curriculum.

Hard rules:
1. Every atom is a deterministic hard skill: you know it or you do not. Never vague checkpoints like "understand branding". Always testable: "Name the six color harmonies and build a palette in each".
2. Every atom is written so simply a kid could learn from it. Plain words. Real terms arrive as labels for pictures already understood.
3. Every atom gets an honest hour estimate (2 to 16 hours), guided exercises written like expert coaching with concrete daily reps, and one explicit pass condition that is binary and testable.
4. Layers stack bottom up: perception and foundation skills at the bottom, production craft in the middle, systems and judgment above, canon and cohort at the top.
5. The top layer always includes studying the specific best practitioners who ever did this (the cohort): recall atoms about real named people, their moves, their methods.
6. Include a one line lane description of the domain.
7. SPEED CONTRACT: exactly 4 layers, exactly 4 atoms each, exactly 3 exercises per atom. Atom names under 70 characters, exercises under 90, pass conditions under 90. Finish the JSON. Do not stop mid-object.

Return the curriculum by calling submit_substrate. Do not write markdown. Do not write a preamble.`;

const COMPACT_METHODOLOGY = `You are the Substrate Learning engine. Build a compact first-pass curriculum.

Hard rules:
1. Every atom is a deterministic hard skill, written so simply a kid could learn from it.
2. EMERGENCY COMPACT: exactly 4 layers, exactly 3 atoms each, exactly 2 exercises per atom. Names under 60 characters, exercises under 70, pass conditions under 70.
3. Layers bottom up. Top layer names real practitioners in this field.
4. Finish the entire JSON. Never truncate a string or an array.

Return the curriculum by calling submit_substrate. No markdown. No preamble.`;

const SUBMIT_TOOL = {
  name: 'submit_substrate',
  description: 'Submit the completed substrate curriculum as structured JSON.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['lane', 'layers'],
    properties: {
      lane: { type: 'string', description: 'One-line domain description' },
      layers: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'sub', 'atoms'],
          properties: {
            name: { type: 'string' },
            sub: { type: 'string' },
            atoms: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['n', 'hrs', 'ex', 'pass'],
                properties: {
                  n: { type: 'string' },
                  hrs: { type: 'number' },
                  ex: { type: 'array', items: { type: 'string' } },
                  pass: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }
};

function logEngine(event, extra) {
  console.log(JSON.stringify({
    tag: 'substrate-commission',
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

async function callAnthropic(key, { name, outcome, compact }) {
  const body = {
    model: 'claude-haiku-4-5',
    max_tokens: 8192,
    system: compact ? COMPACT_METHODOLOGY : METHODOLOGY,
    tools: [SUBMIT_TOOL],
    tool_choice: { type: 'tool', name: 'submit_substrate' },
    messages: [{
      role: 'user',
      content: `Destination: ${name}\nWhat done looks like: ${outcome}\n\nBuild the substrate. Call submit_substrate with the complete curriculum.`
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

function salvageFromResponse(data) {
  const payload = extractPayload(data);
  const textLen = payload.kind === 'text'
    ? String(payload.value || '').length
    : JSON.stringify(payload.value || {}).length;
  const parsed = parseModel(payload.value);
  return {
    payloadKind: payload.kind,
    textLen,
    stopReason: data && data.stop_reason,
    usage: usageOf(data),
    ...parsed
  };
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
  const { name, outcome } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
    return;
  }

  const dest = String(name).trim();
  const doneLooks = String(outcome || 'not specified, infer the sharpest version').trim();

  try {
    const first = await callAnthropic(key, { name: dest, outcome: doneLooks, compact: false });
    if (!first.ok) {
      logEngine('upstream', {
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

    let result = salvageFromResponse(first.data);
    logEngine('pass1', {
      stop_reason: result.stopReason,
      usage: result.usage,
      textLen: result.textLen,
      kind: result.payloadKind,
      via: result.via,
      stats: modelStats(result.model)
    });

    if (!result.model) {
      const retry = await callAnthropic(key, { name: dest, outcome: doneLooks, compact: true });
      if (!retry.ok) {
        logEngine('retry_upstream', { status: retry.status, usage: usageOf(retry.data) });
      } else {
        result = salvageFromResponse(retry.data);
        logEngine('pass2', {
          stop_reason: result.stopReason,
          usage: result.usage,
          textLen: result.textLen,
          kind: result.payloadKind,
          via: result.via,
          stats: modelStats(result.model)
        });
      }
    }

    if (!result.model) {
      res.status(500).json({
        ok: false,
        error: 'ENGINE_PARSE',
        detail: result.via || 'empty model',
        stop_reason: result.stopReason,
        usage: result.usage
      });
      return;
    }

    res.status(200).json({ ok: true, model: result.model, via: result.via });
  } catch (e) {
    logEngine('throw', { detail: String(e && e.message) });
    res.status(500).json({ ok: false, error: 'ENGINE_PARSE', detail: String(e && e.message) });
  }
}
