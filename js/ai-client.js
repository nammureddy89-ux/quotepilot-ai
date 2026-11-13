// BROWSER side (not the server). The one place in the browser that talks to the AI.
// Retries automatically when the AI is busy, and can be cancelled.
window.QP = window.QP || {};

(function () {
  const RETRY_WAITS = [20, 40, 60]; // seconds between automatic retries when the AI is busy

  class Cancelled extends Error { constructor() { super('Cancelled'); this.cancelled = true; } }
  QP.Cancelled = Cancelled;

  function wait(sec, signal, onTick) {
    return new Promise((resolve, reject) => {
      let left = sec;
      onTick && onTick(left);
      const t = setInterval(() => {
        left--; onTick && onTick(left);
        if (left <= 0) { clearInterval(t); resolve(); }
      }, 1000);
      if (signal) signal.addEventListener('abort', () => { clearInterval(t); reject(new Cancelled()); }, { once: true });
    });
  }

  async function once({ system, parts, json, maxTokens, signal }) {
    let r;
    try {
      r = await fetch('/api/ai', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, parts, json, maxTokens })
      });
    } catch (e) {
      if (signal && signal.aborted) throw new Cancelled();
      const err = new Error('Could not reach the AI. Check your internet connection and try again.'); err.busy = true; throw err;
    }
    if (r.status === 413) throw new Error('These files are too large to send in one go (about 4 MB). Try a smaller photo or fewer attachments.');
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const busy = data.busy || [429, 500, 502, 503, 504].includes(r.status);
      const err = new Error(busy ? 'The AI is busy right now.' : (data.error || 'The AI could not read this reply.'));
      err.busy = busy; throw err;
    }
    if (data.finishReason === 'MAX_TOKENS') { const err = new Error('The AI answer was cut off.'); err.busy = true; throw err; }
    return data;
  }

  // onStatus(text) is called with progress messages like "AI is busy, retrying in 20 s (attempt 2 of 4)"
  QP.callAI = async function ({ system, parts, json = true, maxTokens, signal, onStatus }) {
    for (let attempt = 0; ; attempt++) {
      try {
        const data = await once({ system, parts, json, maxTokens, signal });
        if (!json) return { text: data.text, model: data.model };
        const parsed = QP.parseJSONLoose(data.text);
        if (!parsed) { const err = new Error('The AI answer could not be read.'); err.busy = true; throw err; }
        return { data: parsed, model: data.model };
      } catch (e) {
        if (e.cancelled || (signal && signal.aborted)) throw new Cancelled();
        if (!e.busy || attempt >= RETRY_WAITS.length) {
          throw new Error(e.busy ? 'The AI is busy right now. Please try again in a few minutes.' : e.message);
        }
        await wait(RETRY_WAITS[attempt], signal, left =>
          onStatus && onStatus(`AI is busy, retrying in ${left}s (attempt ${attempt + 2} of ${RETRY_WAITS.length + 1})`));
        onStatus && onStatus('AI reading…');
      }
    }
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
})();
