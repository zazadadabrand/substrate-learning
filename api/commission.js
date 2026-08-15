// Substrate Learning · Commission Engine
// POST { name, outcome } -> { ok, model: { lane, layers: [ { name, sub, atoms: [ { n, hrs, ex[], pass } ] } ] } }
// Requires ANTHROPIC_API_KEY set in Vercel environment variables.

const METHODOLOGY = `You are the Substrate Learning engine. You reverse engineer a specific outcome into a deterministic curriculum.

Hard rules:
1. Every atom is a deterministic hard skill: you know it or you do not. Never vague checkpoints like "understand branding". Always testable: "Name the six color harmonies and build a palette in each".
2. Every atom is written so simply a kid could learn from it. Plain words. Real terms arrive as labels for pictures already understood.
3. Every atom gets an honest hour estimate (2 to 16 hours), 3 to 4 guided exercises written like expert coaching with concrete daily reps, and one explicit pass condition that is binary and testable.
4. Layers stack bottom up: perception and foundation skills at the bottom, production craft in the middle, systems and judgment above, canon and cohort at the top. 4 or 5 layers, 5 to 8 atoms each.
5. The top layer always includes studying the specific best practitioners who ever did this (the cohort): recall atoms about real named people, their moves, their methods.
6. Include a one line lane description of the domain.

Respond with ONLY valid JSON, no markdown fences, no preamble, exactly this shape:
{"lane":"...","layers":[{"name":"...","sub":"...","atoms":[{"n":"...","hrs":6,"ex":["...","...","..."],"pass":"..."}]}]}
Layers ordered bottom first. Keep every string tight.`;

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
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: METHODOLOGY,
        messages: [{
          role: 'user',
          content: `Destination: ${String(name).trim()}\nWhat done looks like: ${String(outcome || 'not specified, infer the sharpest version').trim()}\n\nBuild the substrate.`
        }]
      })
    });
    const data = await r.json();
    if (!r.ok) {
      res.status(502).json({ ok: false, error: 'ENGINE_UPSTREAM', detail: data && data.error && data.error.message });
      return;
    }
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const clean = text.replace(/```json|```/g, '').trim();
    const model = JSON.parse(clean);
    if (!model.layers || !model.layers.length) throw new Error('empty model');
    res.status(200).json({ ok: true, model });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'ENGINE_PARSE', detail: String(e && e.message) });
  }
}
