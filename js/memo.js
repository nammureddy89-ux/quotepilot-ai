// AI award note for the VP (use case 6). Drafted only when Priya clicks the button on a recorded award.
// The AI writes from the frozen award record only; code checks every number it uses. Priya edits before sending.
window.QP = window.QP || {};

(function () {
  const esc = s => QP.esc(s);
  QP.MEMO_SYSTEM = `You draft a short award note from a procurement buyer to her VP, in clear Indian business English.
Rules:
- Use ONLY the facts in the award record. Copy every number exactly as written there (same rounding and units, e.g. "₹3.73 cr", "₹9.6 L", "-2.0%"). No arithmetic, no new numbers.
- Structure (plain text, short headings in capitals, max 220 words): DECISION (who supplies what), COST (landed total vs other options and vs last year), WHY (the buyer's reason), RISKS AND HOW WE MANAGE THEM, VENDORS NOT AWARDED (and the rule they failed), ASSUMPTIONS / OVERRIDES (only if any).
- Do not invent risks, mitigations, dates or names. No markdown symbols. Sign off as Priya Deshmukh, Packaging Category Manager.`;

  function facts(a) {
    const R = QP.state.rfx;
    return [
      `RFx: ${R.id} — ${R.title}, period ${R.period}.`,
      `Decision: ${a.title}.`,
      ...a.per.map(p => `${p.name}: ${p.lines.length} items (lines ${QP.award.ranges(p.lines)}), items value ${QP.fmtCr(p.goods)}, freight ${p.freight ? QP.fmtL(p.freight) : 'included'}, discount ${p.discount ? QP.fmtL(p.discount) : 'none'}, total ${QP.fmtCr(p.total)}, payment ${p.paymentDays != null ? p.paymentDays + ' days' : 'not stated'}.`),
      `Landed total before GST: ${QP.fmtCr(a.total)} (items ${QP.fmtCr(a.goods)} + freight ${QP.fmtL(a.freight)} − discount ${QP.fmtL(a.discount)}); incl. GST ${QP.fmtCr(a.total + a.gst)}. Items covered ${a.covered}/${QP.state.rfx.lines.length}.`,
      a.vsLastYear ? `Prices vs last year on ${a.vsLastYear.lines} continuing items: ${(a.vsLastYear.pct > 0 ? '+' : '') + QP.fmt(a.vsLastYear.pct * 100, 1)}%.` : '',
      a.payImpact ? `Payment terms impact (shown separately, at ${QP.fmt(a.payRate * 100, 0)}% a year): ${QP.fmtL(Math.abs(a.payImpact))} ${a.payImpact > 0 ? 'cost' : 'benefit'}.` : '',
      `Other options: ${a.otherOptions.map(x => `${x.title} ${x.incomplete ? 'incomplete' : QP.fmtCr(x.total)}`).join('; ') || 'none'}.`,
      `Buyer's reason: ${a.reason}`,
      `Risks: ${a.risks.map(r => r.text).join('; ') || 'none'}.`,
      `Not awarded: ${a.qualification.filter(x => x.processed && !x.pass).map(x => `${x.name} (${x.why})`).join('; ') || 'none'}.`,
      a.overrideReason ? `Open must-resolve issues accepted: ${a.openRed.map(f => f.vendor + ' — ' + f.title).join('; ')}. Reason: ${a.overrideReason}` : '',
      a.assumptions.length ? `Assumptions: ${a.assumptions.join('; ')}.` : '',
      `Decided ${new Date(a.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`
    ].filter(Boolean).join('\n');
  }

  function plainMemo(a) {   // used when the AI is busy or uses a number not in the record
    const notAw = a.qualification.filter(x => x.processed && !x.pass);
    return `DECISION\n${a.title}: ${a.per.map(p => `${p.name} supplies ${p.lines.length} items (lines ${QP.award.ranges(p.lines)})`).join('; ')}.\n\nCOST\nLanded total ${QP.fmtCr(a.total)} before GST. Other options: ${a.otherOptions.map(x => `${x.title} ${x.incomplete ? 'incomplete' : QP.fmtCr(x.total)}`).join('; ')}.${a.vsLastYear ? ` Prices ${(a.vsLastYear.pct > 0 ? '+' : '') + QP.fmt(a.vsLastYear.pct * 100, 1)}% vs last year on ${a.vsLastYear.lines} continuing items.` : ''}\n\nWHY\n${a.reason}\n\nRISKS\n${a.risks.map(r => '- ' + r.text).join('\n') || '- None found by the rules'}\n${notAw.length ? `\nVENDORS NOT AWARDED\n${notAw.map(x => `- ${x.name}: ${x.why}`).join('\n')}\n` : ''}${a.overrideReason ? `\nOVERRIDES\n${a.overrideReason}\n` : ''}\nPriya Deshmukh\nPackaging Category Manager`;
  }

  QP.awardMemo = function (slot, a) {
    if (!slot) return;
    const m = a.memo;
    slot.innerHTML = `<div style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px">
      <div class="row"><b>Award note for the VP</b><span class="grow"></span>
        <button class="btn sm ${m ? '' : 'primary'}" id="memoBtn">${m ? '↻ Redraft with AI' : '✨ Draft award note with AI'}</button>
        ${m ? '<button class="btn sm" id="memoCopy">Copy</button><button class="btn sm" id="memoDl">Download .txt</button>' : ''}</div>
      ${m ? `<div class="small" style="margin:6px 0">${m.check === 'ok' ? '<span class="tile-ok">✓ Every number checked against the award record</span>' : `<span style="color:var(--amber)">${m.check === 'mismatch' ? `The AI used a number not in the award record (${esc((m.bad || []).join(', '))}), so a plain note built from the record is shown.` : 'The AI was busy, so a plain note built from the record is shown.'}</span>`} · edit freely before sending <span class="info" title="${esc(m.model || '')}">ⓘ</span></div>
        <textarea id="memoText" class="reasonbox" style="min-height:300px;font-size:13px">${esc(m.text)}</textarea>` : '<div class="small muted" style="margin-top:4px">The AI drafts a short note (decision, cost, reason, risks, vendors not awarded) from the frozen award record only. You edit it before sending.</div>'}
    </div>`;
    const btn = slot.querySelector('#memoBtn');
    btn.onclick = async () => {
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Drafting…';
      const st = QP.say(btn.closest('.row'), 'AI is drafting…', 'info', 0);
      const F = facts(a);
      let memo;
      try {
        const r = await QP.callAI({ system: QP.MEMO_SYSTEM, parts: [{ type: 'text', text: `AWARD RECORD (the only source of facts):\n${F}\n\nWrite the note.` }], json: false, maxTokens: 1024, onStatus: s => { st.textContent = s; } });
        const text = (r.text || '').replace(/\*\*|^#+\s*/gm, '').trim();
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
