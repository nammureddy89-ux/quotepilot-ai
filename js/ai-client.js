// BROWSER side (not the server). The one place in the browser that talks to the AI. To switch AI provider, only api/ai.js changes.
window.QP = window.QP || {};

QP.callAI = async function ({ system, parts, json = true, maxTokens }) {
  let r;
  try {
    r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, parts, json, maxTokens })
    });
  } catch (e) {
    throw new Error('Could not reach the AI service. Check your connection and press Retry.');
  }
  if (r.status === 413) throw new Error('Files are too large to send in one go (limit about 4 MB). Try a smaller photo or fewer attachments.');
  if (r.status === 504) throw new Error('The AI took too long to answer (Google is busy). Press Retry.');
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `AI service error (${r.status}).`);
  if (data.finishReason === 'MAX_TOKENS') throw new Error('The AI answer was cut off (too long). Press Retry.');
  if (!json) return { text: data.text, model: data.model };
  const parsed = QP.parseJSONLoose(data.text);
  if (!parsed) throw new Error('The AI returned an answer that could not be read as data. Press Retry.');
  return { data: parsed, model: data.model };
};

QP.parseJSONLoose = function (text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) {}
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) {} }
  return null;
};
