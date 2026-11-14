// AI award note for the VP (use case 6). Drafted only when Priya clicks the button on a recorded award.
// The AI writes from the frozen award record only; code checks every number it uses. Priya edits before sending.
window.QP = window.QP || {};

(function () {
  const esc = s => QP.esc(s);
  QP.MEMO_SYSTEM = `You draft a short, professional email from a procurement buyer to her VP recommending a supplier award, in clear Indian business English.
Use ONLY the facts in the award record. Copy every number exactly as written there (same rounding and units, e.g. "₹3.73 cr", "₹9.6 L", "-2.0%"). No arithmetic, no new numbers, no line numbers of items.
Format (plain text, max 200 words):
Subject: Award recommendation — <contract title>
<one or two sentences: the recommendation — who supplies how many items, the contract period, landed cost before GST and including GST>

Why this option
• 2–4 bullets: the buyer's reasons first (in her words, tidied), then supporting facts from the record (comparison with the other options, prices vs last year, discount earned).

Risks
• one bullet per risk in the record, in plain words. Add how it is managed ONLY if the record gives the buyer's risk plan; never invent a mitigation, owner or date.

Vendors not selected
• one bullet per vendor in the record's "Vendors not selected" list, with the stated reason.

Regards,
<buyer name>
<buyer role>, <company>
Rules: no markdown symbols (no **, no #); use "•" for bullets; leave out anything the record does not state; no headings in capital letters; do not mention internal tools, AI or "award record".`;

  const cr = v => QP.fmtCr(v), L = v => QP.fmtL(v);
  // VP-level facts only: no line numbers, no zero amounts, every vendor's outcome.
  function facts(a) {
    const R = QP.state.rfx, C = QP.COMPANY, std = R.paymentDaysStandard || 60;
    const [bName, bRole] = String(C.buyer || 'Priya Deshmukh, Packaging Category Manager').split(/,\s*/);
    const used = a.per.map(p => p.name);
    const others = a.otherOptions || [];
    const singleOf = name => others.find(x => x.title === 'One vendor: ' + name);
    const notSel = [];
    a.qualification.forEach(x => {
      if (used.includes(x.name)) return;
      if (!x.processed) { notSel.push(`${x.name}: reply not yet evaluated.`); return; }
      if (!x.pass) { notSel.push(`${x.name}: did not meet the must-have requirements (${x.why}).`); return; }
      const so = singleOf(x.name);
      notSel.push(`${x.name}: qualified, not selected${so && !so.incomplete ? `; supplying everything it priced alone would cost ${cr(so.total)}${so.covered < R.lines.length ? ` and cover only ${so.covered}/${R.lines.length} items` : ''}` : ''}.`);
    });
    const pay = a.per.filter(p => p.paymentDays != null && p.paymentDays !== std).map(p => `${p.name} payment terms ${p.paymentDays} days against our standard ${std} days`);
    return [
      `Company: ${String(C.name).replace(/\.$/, '')}. Buyer: ${bName}, role: ${bRole || 'Packaging Category Manager'}.`,
      `Contract: ${R.title}, period ${R.period}, ${R.lines.length} items.`,
      `Recommendation: ${a.per.map(p => `${p.name} supplies ${p.lines.length} items (${cr(p.total)})`).join('; ')}. Items covered ${a.covered}/${R.lines.length}.`,
      `Landed cost before GST ${cr(a.total)}; including GST ${cr(a.total + a.gst)}.`,
      a.freight > 0 ? `Freight included in that total: ${L(a.freight)}.` : 'Freight is included in the vendors\' prices.',
      a.discount > 0 ? `Discount earned: ${a.per.filter(p => p.discount > 0).map(p => `${p.name} ${L(p.discount)}`).join('; ')}.` : '',
      a.vsLastYear ? `Prices vs last year on the ${a.vsLastYear.lines} continuing items: ${(a.vsLastYear.pct > 0 ? '+' : '') + QP.fmt(a.vsLastYear.pct * 100, 1)}%.` : '',
      `Other options evaluated: ${others.filter(x => !String(x.key || '').startsWith('single_')).map(x => `${x.title.replace(/^One vendor: /, '')}${x.title.startsWith('One vendor') ? ' alone' : ''} ${x.incomplete ? '(total incomplete)' : cr(x.total)}`).join('; ') || 'none'}.`,
      `Buyer's reasons: ${a.reason}`,
      `Risks: ${[...a.risks.filter(r => r.sev !== 'info').map(r => r.text), ...pay.map(t => t + (a.payImpact > 0 ? ` (about ${L(Math.abs(a.payImpact))} a year in working capital)` : ''))].join('; ') || 'none'}.`,
      a.riskPlan ? `Buyer's plan for managing the risks: ${a.riskPlan}` : 'Buyer has not stated how the risks are managed.',
      a.overrideReason ? `Open issues accepted: ${a.openRed.map(f => f.vendor + ' — ' + f.title).join('; ')}. Buyer's reason: ${a.overrideReason}` : '',
      `Vendors not selected: ${notSel.join(' ') || 'none'}`
    ].filter(Boolean).join('\n');
  }

  const reasons = a => [...(a.reasonChips || []), a.reasonText].filter(Boolean).map(x => x.replace(/\.?$/, '.')).concat(a.reasonChips || a.reasonText ? [] : [a.reason]);
  function plainMemo(a) {   // used when the AI is busy or uses a number not in the record
    const R = QP.state.rfx, C = QP.COMPANY, [bName, bRole] = String(C.buyer || '').split(/,\s*/);
    const F = facts(a).split('\n'), get = k => (F.find(x => x.startsWith(k)) || '').slice(k.length).trim();
    const risks = get('Risks:').replace(/\.$/, '');
    return `Subject: Award recommendation — ${R.title}

I recommend the following award for ${R.title} (${R.period}): ${a.per.map(p => `${p.name} — ${p.lines.length} items (${cr(p.total)})`).join('; ')}. Landed cost ${cr(a.total)} before GST, ${cr(a.total + a.gst)} including GST.

Why this option
${reasons(a).map(r => '• ' + r).join('\n')}
${get('Other options evaluated:') && get('Other options evaluated:') !== 'none.' ? `• Other options evaluated: ${get('Other options evaluated:')}\n` : ''}${a.vsLastYear ? `• Prices ${(a.vsLastYear.pct > 0 ? '+' : '') + QP.fmt(a.vsLastYear.pct * 100, 1)}% vs last year on the ${a.vsLastYear.lines} continuing items.\n` : ''}
Risks
${risks && risks !== 'none' ? risks.split('; ').map(r => '• ' + r).join('\n') : '• None identified in the comparison.'}${a.riskPlan ? `\n• How we will manage them: ${a.riskPlan}` : ''}

Vendors not selected
${get('Vendors not selected:').split(/(?<=\.)\s+/).filter(Boolean).map(x => '• ' + x).join('\n') || '• None'}

Regards,
${bName || 'Priya Deshmukh'}
${bRole || 'Packaging Category Manager'}, ${C.name}`;
  }

  QP._memo = { facts, plainMemo };   // exposed for testing
  QP.awardMemo = function (slot, a) {
    if (!slot) return;
    const m = a.memo;
    slot.innerHTML = `<div style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px">
      <div class="row"><b>Award note for the VP</b><span class="grow"></span>
        <button class="btn sm ${m ? '' : 'primary'}" id="memoBtn">${m ? '↻ Redraft with AI' : '✨ Draft award note with AI'}</button>
        ${m ? '<button class="btn sm" id="memoCopy">Copy</button><button class="btn sm" id="memoDl">Download .txt</button>' : ''}</div>
      ${m ? `<div class="small" style="margin:6px 0">${m.check === 'ok' ? '<span class="tile-ok">✓ Every number checked against the award record</span>' : `<span style="color:var(--amber)">${m.check === 'mismatch' ? `The AI used a number not in the award record (${esc((m.bad || []).join(', '))}), so a plain note built from the record is shown.` : 'The AI was busy, so a plain note built from the record is shown.'}</span>`} · edit freely before sending <span class="info" title="${esc(m.model || '')}">ⓘ</span></div>
        <textarea id="memoText" class="reasonbox" style="min-height:300px;font-size:13px">${esc(m.text)}</textarea>` : '<div class="small muted" style="margin-top:4px">The AI drafts a short email to your VP (recommendation, why, risks, vendors not selected) using only the saved award record. You edit it before sending.</div>'}
    </div>`;
    const btn = slot.querySelector('#memoBtn');
    btn.onclick = async () => {
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Drafting…';
      const st = QP.say(btn.closest('.row'), 'AI is drafting…', 'info', 0);
      const F = facts(a);
      let memo;
      try {
        const r = await QP.callAI({ system: QP.MEMO_SYSTEM, parts: [{ type: 'text', text: `AWARD RECORD (the only source of facts):\n${F}\n\nWrite the note.` }], json: false, maxTokens: 1024, onStatus: s => { st.textContent = s; } });
        const text = (r.text || '').replace(/\*\*|^#+\s*/gm, '').replace(/^[-*]\s+/gm, '• ').trim();
        const bad = QP.ask.checkNumbers(text, F);
        memo = text && !bad.length ? { text, check: 'ok', model: r.model } : { text: plainMemo(a), check: 'mismatch', bad, model: r.model };
      } catch (e) { memo = { text: plainMemo(a), check: 'ai_busy' }; }
      a.memo = memo; QP.save(); QP.render();
    };
    if (m) {
      const ta = slot.querySelector('#memoText');
      ta.oninput = () => { a.memo.text = ta.value; QP.save(); };
      slot.querySelector('#memoCopy').onclick = e => { navigator.clipboard.writeText(ta.value).then(() => QP.say(e.target.closest('.row'), 'Copied.', 'ok')); };
      slot.querySelector('#memoDl').onclick = () => { const x = document.createElement('a'); x.href = URL.createObjectURL(new Blob([ta.value], { type: 'text/plain' })); x.download = 'award-note.txt'; x.click(); };
    }
  };
})();
