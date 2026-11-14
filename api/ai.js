// Vercel serverless function: the ONLY job is to keep the Gemini API key secret.
// The browser sends { system, parts, json } and gets back { text, model }.
// Set GEMINI_API_KEY (required) and optionally GEMINI_MODEL in Vercel → Settings → Environment Variables.
//
// If a model is busy (503), over its free limit (429), missing (404) or has a server error (500),
// we wait briefly and try the next model. Free-tier limits are per model, so another model often works.

const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
const TIME_BUDGET_MS = 240000; // stay under Vercel's 300 s limit (vercel.json)

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY. Add it in Vercel project settings and redeploy.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { system, parts, json, maxTokens, thinking } = body || {};
  if (!Array.isArray(parts) || parts.length === 0) {
    res.status(400).json({ error: 'No content sent to the AI.' });
    return;
  }

  const geminiParts = parts.map(p => {
    if (p.type === 'text') return { text: p.text };
    if (p.type === 'file') return { inline_data: { mime_type: p.mime, data: p.data } };
    return { text: String(p.text || '') };
  });

  const payload = {
    contents: [{ role: 'user', parts: geminiParts }],
    generationConfig: { temperature: 0, maxOutputTokens: maxTokens || 32768 }
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  if (json) payload.generationConfig.responseMimeType = 'application/json';

  const models = process.env.GEMINI_MODEL
    ? [process.env.GEMINI_MODEL, ...FALLBACK_MODELS.filter(m => m !== process.env.GEMINI_MODEL)]
    : FALLBACK_MODELS;
  const started = Date.now();
  const tried = [];
  let lastError = 'Unknown error', lastStatus = 500;

  // Short thinking (thinking='low'): Gemini's hidden "thinking" counts against maxOutputTokens.
  // On big answers (the 30-line RFx draft) unlimited thinking made replies run 4–5 min and get cut off.
  const thinkingFor = model => {
    if (thinking !== 'low') return null;
    return /^gemini-2\./.test(model) ? { thinkingBudget: 1024 } : { thinkingLevel: 'low' };
  };
  const call = (model, body, ms) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(30000, ms))
  });

  for (const model of models) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const left = TIME_BUDGET_MS + 30000 - (Date.now() - started);   // never run past Vercel's 300 s
      const tc = thinkingFor(model);
      const body1 = tc ? { ...payload, generationConfig: { ...payload.generationConfig, thinkingConfig: tc } } : payload;
      let r = await call(model, body1, left);
      let data = await r.json().catch(() => ({}));
      if (tc && r.status === 400 && /thinking/i.test((data.error && data.error.message) || '')) {
        // This model doesn't accept the thinking setting: ask again without it rather than failing.
        r = await call(model, payload, TIME_BUDGET_MS + 30000 - (Date.now() - started));
        data = await r.json().catch(() => ({}));
      }
      if (r.ok) {
        const cand = (data.candidates || [])[0] || {};
        const text = ((cand.content || {}).parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
        res.status(200).json({ text, model, finishReason: cand.finishReason || null, tried });
        return;
      }
      lastStatus = r.status;
      lastError = (data.error && data.error.message) || `HTTP ${r.status}`;
      tried.push(`${model}: ${r.status}`);
      const retryable = [404, 429, 500, 503].includes(r.status) || (r.status === 400 && /model/i.test(lastError));
      if (!retryable) break;            // e.g. bad key or bad request: no point trying other models
      if (r.status === 503 || r.status === 500) await sleep(1500);
    } catch (e) {
      lastError = e.name === 'TimeoutError' ? 'timed out' : e.message; lastStatus = e.name === 'TimeoutError' ? 504 : lastStatus; tried.push(`${model}: ${e.name === 'TimeoutError' ? 'timed out' : 'network error'}`);
    }
  }

  // Friendly message only. The browser retries automatically for 'busy'.
  const busy = [429, 500, 503, 504].includes(lastStatus) || /high demand|overloaded|unavailable/i.test(lastError);
  console.error('AI failed', lastStatus, lastError, tried.join(', '));
  res.status(busy ? 503 : (lastStatus >= 400 ? lastStatus : 500)).json({
    error: busy ? 'The AI is busy right now.' : 'The AI could not read this reply.',
    busy
  });
};
