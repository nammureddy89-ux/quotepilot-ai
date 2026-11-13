// "Ask vendor": the AI drafts a clarification email; the buyer edits and sends it.
// Sending is SIMULATED (no real email leaves the app) — it is logged on the vendor and the issue waits for a reply.
window.QP = window.QP || {};

(function () {
  const esc = s => QP.esc(s);

  const SYSTEM = `You draft short, polite clarification emails from a procurement buyer to a supplier, in clear Indian business English.
Rules: ask only about the issues listed; do not invent numbers, prices, dates or facts; do not accuse; ask the vendor to reply with the missing or corrected information (and documents if relevant); keep it under 140 words; plain text only, no subject line, no markdown. Sign off as the buyer.`;

  function templateDraft(V, issues) {
    return `Dear ${V.contact.split(' ')[0]} ji,\n\nThank you for your quotation for our corrugated box requirement for 2027 (RFx ${QP.state.rfx.id}). Before we can complete our evaluation, could you please clarify the following:\n\n${issues.map((f, i) => `${i + 1}. ${f.title}${f.line ? ' (line ' + f.line + ')' : ''}: ${f.detail}`).join('\n')}\n\nA reply by return email would be appreciated.\n\nRegards,\nPriya Deshmukh\nPackaging Category Manager, Sahyadri Foods`;
  }

  async function aiDraft(V, issues) {
    const lines = issues.map((f, i) => `${i + 1}. ${f.title}${f.line ? ` (RFx line ${f.line})` : ''}: ${f.detail}`).join('\n');
    const prompt = `Supplier: ${V.name}, contact person ${V.contact}.
Buyer: Priya Deshmukh, Packaging Category Manager, Sahyadri Foods. RFx ${QP.state.rfx.id} — ${QP.state.rfx.title}.
Issues found in the supplier's quotation that need clarification:
${lines}
Write the email body.`;
    const { text } = await QP.callAI({ system: SYSTEM, parts: [{ type: 'text', text: prompt }], json: false, maxTokens: 1024 });
    return String(text || '').trim();
  }

  QP.askVendor = function (flag) {
    const m = QP.model;
    const V = QP.VENDORS.find(v => v.id === flag.vendor);
    const askable = m.flags.filter(f => f.vendor === flag.vendor && f.open && (f.actions || []).includes('ask') && !(f.decision && f.decision.action === 'ask'));
    if (!askable.find(f => f.id === flag.id)) askable.unshift(flag);
    const body = QP.modal(`Ask ${esc(V.name)}`, `
      <div class="kv" style="margin-bottom:10px"><div class="k">To</div><div>${esc(V.contact)} &lt;${esc(V.email)}&gt;</div>
        <div class="k">Subject</div><div><input id="avSubj" class="btn" style="width:100%;text-align:left;cursor:text" value="Clarification on your quotation — RFx ${esc(QP.state.rfx.id)}"></div></div>
      <div class="small muted" style="margin-bottom:4px">Include these issues:</div>
      <div id="avIssues" style="margin-bottom:10px">${askable.map(f => `<label style="display:block;margin:3px 0"><input type="checkbox" value="${esc(f.id)}" ${f.id === flag.id ? 'checked' : ''}> <span class="dot-inline" style="color:${f.sev === 'red' ? 'var(--red)' : 'var(--amber)'}">●</span> ${esc(f.title)}${f.line ? ' · line ' + f.line : ''}</label>`).join('')}</div>
      <div class="row" style="margin-bottom:8px"><button class="btn" id="avDraft">✨ Draft with AI</button><span id="avStatus" class="small muted"></span></div>
      <textarea class="paste" id="avBody" placeholder="Click “Draft with AI”, or write your own message."></textarea>
      <div class="row" style="margin-top:10px"><span class="small muted">Email delivery is simulated in this prototype.</span><span class="grow"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="avSend">Send</button></div>`, { width: 760 });

    const selected = () => [...body.querySelectorAll('#avIssues input:checked')].map(i => m.flags.find(f => f.id === i.value)).filter(Boolean);
    const draftBtn = body.querySelector('#avDraft'), status = body.querySelector('#avStatus'), ta = body.querySelector('#avBody');

    async function draft() {
      const issues = selected();
      if (!issues.length) { QP.toast('Tick at least one issue.'); return; }
      draftBtn.disabled = true; status.innerHTML = '<span class="spinner"></span> Drafting…';
      try {
        ta.value = await aiDraft(V, issues);
        status.textContent = 'AI draft — edit as needed.';
      } catch (e) {
        ta.value = templateDraft(V, issues);
        status.textContent = 'AI is busy — a basic template was filled in instead. Edit as needed.';
      }
      draftBtn.disabled = false;
    }
    draftBtn.onclick = draft;
    draft();

    body.querySelector('#avSend').onclick = () => {
      const issues = selected();
      const text = ta.value.trim();
      if (!issues.length) { QP.toast('Tick at least one issue.'); return; }
      if (!text) { QP.toast('Write or draft the message first.'); return; }
      const vs = QP.vendorState(V.id);
      vs.sent = vs.sent || [];
      const at = new Date().toISOString();
      vs.sent.push({ at, to: `${V.contact} <${V.email}>`, subject: body.querySelector('#avSubj').value, body: text, flagIds: issues.map(f => f.id) });
      issues.forEach(f => {
        QP.state.decisions[f.id] = { action: 'ask', value: null, reason: 'Clarification emailed', at };
        QP.state.changeLog.push({ at, flagId: f.id, vendorId: V.id, line: f.line, action: 'ask' });
      });
      QP.save(); QP.closeModal();
      QP.toast(`Sent to ${V.contact}. ${issues.length} issue${issues.length > 1 ? 's' : ''} now waiting for the vendor's reply.`);
      QP.render();
    };
  };

  QP.showSent = function (vendorId) {
    const V = QP.VENDORS.find(v => v.id === vendorId);
    const sent = (QP.state.vendors[vendorId] || {}).sent || [];
    QP.modal(`Messages sent to ${esc(V.name)}`, sent.slice().reverse().map(msg => `
      <div class="card" style="margin-bottom:10px"><div class="cb">
        <div class="small muted">${new Date(msg.at).toLocaleString('en-IN')} · To ${esc(msg.to)} · <i>Sent (simulated)</i></div>
        <div style="font-weight:600;margin:4px 0">${esc(msg.subject)}</div>
        <div class="email">${esc(msg.body)}</div></div></div>`).join('') || '<div class="empty">No messages sent.</div>', { width: 760 });
  };
})();
