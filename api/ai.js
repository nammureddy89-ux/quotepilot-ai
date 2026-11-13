// Vercel serverless function: the ONLY job is to keep the Gemini API key secret.
// The browser sends { system, parts, json } and gets back { text, model }.
// Set GEMINI_API_KEY (required) and optionally GEMINI_MODEL in Vercel → Settings → Environment Variables.

const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];

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
  const { system, parts, json, maxTokens } = body || {};
  if (!Array.isArray(parts) || parts.length === 0) {
    res.status(400).json({ error: 'No content sent to the AI.' });
    return;
  }

  // Convert our simple parts into Gemini's format
  const geminiParts = parts.map(p => {
    if (p.type === 'text') return { text: p.text };
    if (p.type === 'file') return { inline_data: { mime_type: p.mime, data: p.data } };
    return { text: String(p.text || '') };
  });

  const payload = {
    contents: [{ role: 'user', parts: geminiParts }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: maxTokens || 32768
    }
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  if (json) payload.generationConfig.responseMimeType = 'application/json';

  const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL, ...FALLBACK_MODELS] : FALLBACK_MODELS;
  let lastError = 'Unknown error';
  let lastStatus = 500;

  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(payload)
        }
      );
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const cand = (data.candidates || [])[0] || {};
        const text = ((cand.content || {}).parts || []).map(p => p.text || '').join('');
        res.status(200).json({ text, model, finishReason: cand.finishReason || null });
        return;
      }
      lastStatus = r.status;
      lastError = (data.error && data.error.message) || `HTTP ${r.status}`;
      // Model not found / not allowed → try the next model. Anything else → stop.
      if (r.status === 404 || (r.status === 400 && /model/i.test(lastError))) continue;
      break;
    } catch (e) {
      lastError = e.message;
      break;
    }
  }

  if (lastStatus === 429) {
    res.status(429).json({ error: 'AI free-tier limit reached. Wait a minute and press Retry.' });
    return;
  }
  res.status(lastStatus >= 400 ? lastStatus : 500).json({ error: lastError });
};
