// Stage 6 — Ask AI: plain-language questions over the live comparison.
// AI plans → code computes (js/ask.js) → AI writes the answer, numbers checked by code. Tables, a chart, CSV / Excel export.
window.QP = window.QP || {};
QP.screens = QP.screens || {};

(function () {
  const esc = s => QP.esc(s);
  let busy = null;   // { ctrl, q, status }
  const SUGGEST = [
    'What if we split it, cheapest per line, but only among vendors who cleared the quality questionnaire?',
    'Compare one vendor, cheapest per item and the best 2-vendor split on true cost',
    'Which vendor is cheapest on 7-ply boxes, and how does that compare to last year?',
    'Show payment terms, capacity and our history with each vendor',
    'What if the dollar rate goes to ₹84?'
  ];
  const turns = () => (QP.state.askTurns = QP.state.askTurns || []);

  // Single-series horizontal bar chart: one hue, thin bars, value label at the end, tooltip on hover.
  function chartSvg(ch) {
    if (!ch || !ch.bars || !ch.bars.length) return '';
    const bars = ch.bars, W = 720, LW = 300, VW = 140, rowH = 30, H = bars.length * rowH + 8;
    const vals = bars.map(b => b.value), max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = (max - min) || 1;
    const plotW = W - LW - VW, x = v => LW + (v - min) / span * plotW, x0 = x(0);
    const g = bars.map((b, i) => { const y = 4 + i * rowH, xa = Math.min(x0, x(b.value)), w = Math.max(2, Math.abs(x(b.value) - x0));
      return `<g><title>${esc(b.label)}: ${esc(b.text)}</title>
        <rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"/>
        <text x="${LW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="12" fill="#344054">${esc(b.label.length > 46 ? b.label.slice(0, 45) + '…' : b.label)}</text>
        <rect x="${xa}" y="${y + 8}" width="${w}" height="${rowH - 16}" rx="4" fill="${b.hl ? '#1d3fb8' : '#2f5bea'}"/>
        <text x="${Math.max(x(b.value), x0) + 6}" y="${y + rowH / 2 + 4}" font-size="12" fill="#1d2433" font-weight="${b.hl ? 650 : 500}">${esc(b.text)}${b.hl ? '  · lowest' : ''}</text></g>`; }).join('');
    return `<div class="achart"><div class="small muted" style="margin-bottom:4px">${esc(ch.label)}</div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${esc(ch.label)}">
      <line x1="${x0}" y1="0" x2="${x0}" y2="${H}" stroke="#d0d5dd" stroke-width="1"/>${g}</svg></div>`;
  }

  function tableHtml(rows, tid) {
    if (!rows || !rows.length) return '<div class="small muted">No rows.</div>';
    const cols = Object.keys(rows[0]), many = rows.length > 10;
    return `<div class="gridwrap" style="max-height:${many ? '360px' : 'none'}"><table class="t atab"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function exportRows(rows, name, kind) {
    if (!rows || !rows.length) return;
    if (kind === 'xlsx') { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Result'); XLSX.writeFile(wb, name + '.xlsx'); return; }
    const cols = Object.keys(rows[0]);
    const text = [cols, ...rows.map(r => cols.map(c => r[c]))].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); a.download = name + '.csv'; a.click();
  }

  function resultHtml(r, ti, ri) {
    if (r.error) return `<div class="say err" style="margin:8px 0">${esc(r.error)}</div>`;
    const key = `${ti}-${ri}`;
    return `<div class="ares">
      ${r.scenario ? `<div class="scen">🧪 <b>Scenario — not real quotes:</b> ${esc(r.scenario.join('; ') || 'no change')}</div>` : ''}
      <div class="row"><b>${esc(r.title)}</b><span class="grow"></span><button class="btn sm" data-exp="${key}|csv">CSV</button><button class="btn sm" data-exp="${key}|xlsx">Excel</button></div>
      ${chartSvg(r.chart)}
      ${tableHtml(r.rows)}
      ${(r.extra || []).map((x, xi) => `<details style="margin-top:8px"><summary class="small" style="cursor:pointer;color:var(--brand)">${esc(x.title)} (${x.rows.length} rows)</summary>
        <div class="row" style="justify-content:flex-end;margin:6px 0"><button class="btn sm" data-exp="${key}|csv|${xi}">CSV</button><button class="btn sm" data-exp="${key}|xlsx|${xi}">Excel</button></div>${tableHtml(x.rows)}</details>`).join('')}
    </div>`;
  }

  function turnHtml(t, ti) {
    const when = new Date(t.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (t.clarify) return `<div class="turn"><div class="qb">${esc(t.q)}</div><div class="ab">
      <div><b>Quick check before I compute:</b> ${esc(t.clarify.question)}</div>
      <div class="row" style="margin-top:8px">${(t.clarify.options || []).map(o => `<button class="btn sm" data-clar="${ti}" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">Or type your own answer below.</div></div></div>`;
    const notes = [...new Set((t.results || []).flatMap(r => r.notes || []))];
    const caveats = [...notes, ...(t.aiCaveats || [])];
    const checkLine = t.check === 'ok' ? '<span class="tile-ok">✓ Every number in this answer was checked against the computed results</span>'
      : t.check === 'mismatch' ? `<span style="color:var(--amber)">The AI's wording used a number not in the results (${esc((t.badNumbers || []).join(', '))}), so the plain code summary is shown instead.</span>`
      : t.check === 'ai_busy' ? '<span style="color:var(--amber)">The AI was busy writing the answer, so the plain code summary is shown. The numbers below are complete.</span>' : '';
    return `<div class="turn"><div class="qb">${esc(t.q)}</div><div class="ab">
      ${t.plan && t.plan.understood ? `<div class="small muted">Understood as: ${esc(t.plan.understood)}</div>` : ''}
      <div class="ans">${esc(t.answer || '')}</div>
      <div class="small" style="margin-top:4px">${checkLine}</div>
      ${(t.results || []).map((r, ri) => resultHtml(r, ti, ri)).join('')}
      ${caveats.length ? `<div class="cav"><b>Caveats</b><ul>${caveats.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      <details class="small" style="margin-top:8px"><summary style="cursor:pointer;color:#475467">Method — how this was worked out</summary>
        <ol style="margin:6px 0;padding-left:18px">
          <li>The AI turned your question into ${(t.plan.steps || []).length} step${(t.plan.steps || []).length === 1 ? '' : 's'} from a fixed list (it never sees prices): <code>${esc(JSON.stringify(t.plan.steps))}</code></li>
          ${(t.results || []).map(r => `<li>Plain code computed “${esc(r.title)}”: ${esc(r.method || r.error || '')}</li>`).join('')}
          <li>The AI wrote the answer from those results only; code checked every number.</li></ol></details>
      <div class="small muted" style="margin-top:6px">${when} · data as of this moment · ${QP.SHOW_TIMING && t.timing && t.timing.totalMs ? `answered in ${Math.round(t.timing.totalMs / 1000)} s · ` : ''}<span class="info" title="${esc((t.models || []).filter(Boolean).join(', '))}">AI model ⓘ</span></div>
    </div></div>`;
  }

  async function send(q, main) {
    q = q.trim(); if (!q || busy) return;
    const ctrl = new AbortController();
    busy = { ctrl, q, status: 'AI is planning the steps…' };
    QP.render();
    try {
      const t = await QP.ask.ask(q, turns().filter(x => !x.clarify), { signal: ctrl.signal, onStatus: s => { if (busy) { busy.status = s; const el = document.getElementById('askStatus'); if (el) el.textContent = s; } } });
      turns().push(t); QP.save(); busy = null; QP.render();
    } catch (e) {
      const cancelled = e.cancelled; busy = null; QP.render();
      const box = document.getElementById('askBox');
      if (box) { box.value = q; QP.say(box.closest('.askbar'), cancelled ? 'Stopped. Your question is still in the box.' : e.message + ' Your question is still in the box.', cancelled ? 'info' : 'err'); }
    }
    const end = document.getElementById('askEnd'); if (end) end.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  QP.screens.ask = function (main) {
    const m = QP.model;
    if (!m.processedIds.length) {
      main.innerHTML = `<div class="head"><div><h1>Ask AI</h1></div></div><div class="card empty">Read at least one vendor reply first.<br><br><button class="btn primary" onclick="QP.go('responses')">Go to Vendor Responses</button></div>`;
      return;
    }
    const T = turns();
    const unread = QP.VENDORS.filter(V => !m.vendors[V.id].processed).map(V => V.name);
    main.innerHTML = `
      <div class="head"><div><h1>Ask AI</h1><p>Ask in plain English. The AI plans the steps, <b>plain code computes</b> on the live comparison (your Review Issues decisions included), and the answer shows its method and caveats.</p></div>
        <div class="actions">${T.length ? '<button class="btn" id="clearAsk">Clear conversation</button>' : ''}</div></div>
      ${unread.length ? `<div class="say info" style="margin:0 0 12px">Not read yet: ${esc(unread.join(', '))} — answers use the ${m.processedIds.length} replies read so far.</div>` : ''}
      <div class="chat">${T.length ? T.map(turnHtml).join('') : `<div class="card"><div class="cb"><div class="muted" style="margin-bottom:8px">Try a question:</div>${SUGGEST.map(s => `<button class="sugg" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`}
        ${busy ? `<div class="turn"><div class="qb">${esc(busy.q)}</div><div class="ab"><span class="spinner"></span> <span id="askStatus">${esc(busy.status)}</span> <button class="btn sm" id="stopAsk" style="margin-left:8px">Stop</button></div></div>` : ''}
        <div id="askEnd"></div></div>
      <div class="askbar"><div class="row" style="flex-wrap:nowrap"><textarea id="askBox" rows="2" placeholder="e.g. What if we split it cheapest per line, only among vendors who cleared the questionnaire?" ${busy ? 'disabled' : ''}></textarea>
        <button class="btn primary" id="askBtn" disabled>Ask</button></div>
        ${T.length ? `<div class="row" style="margin-top:6px;gap:6px">${SUGGEST.slice(0, 3).map(s => `<button class="sugg sm" data-s="${esc(s)}">${esc(s.length > 60 ? s.slice(0, 58) + '…' : s)}</button>`).join('')}</div>` : ''}</div>`;

    const box = main.querySelector('#askBox'), btn = main.querySelector('#askBtn');
    box.oninput = () => { btn.disabled = !box.value.trim() || !!busy; };
    box.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!btn.disabled) send(box.value, main); } };
    btn.onclick = () => send(box.value, main);
    main.querySelectorAll('[data-s]').forEach(b => b.onclick = () => send(b.dataset.s, main));
    main.querySelectorAll('[data-clar]').forEach(b => b.onclick = () => { const t = T[Number(b.dataset.clar)]; send(`${t.q} — ${b.dataset.opt}`, main); });
    const stop = main.querySelector('#stopAsk'); if (stop) stop.onclick = () => busy && busy.ctrl.abort();
    const clr = main.querySelector('#clearAsk'); if (clr) clr.onclick = async () => { if (await QP.confirmBox('Clear the conversation?', 'This removes the questions and answers on this screen. Quotes, decisions and the award are not affected.', 'Clear')) { QP.state.askTurns = []; QP.save(); QP.render(); } };
    main.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => {
      const [key, kind, xi] = b.dataset.exp.split('|'), [ti, ri] = key.split('-').map(Number), r = T[ti].results[ri];
      exportRows(xi != null ? r.extra[Number(xi)].rows : r.rows, `ask-ai-${ti + 1}-${ri + 1}`, kind);
    });
    if (T.length && !busy) setTimeout(() => { const end = document.getElementById('askEnd'); if (end && QP._askScrolled !== T.length) { QP._askScrolled = T.length; end.scrollIntoView({ block: 'end' }); } }, 0);
    if (busy) { const end = document.getElementById('askEnd'); if (end) end.scrollIntoView({ block: 'end' }); }
  };
})();
