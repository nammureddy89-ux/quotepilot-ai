// Stage 5 — Compare: 30 × 5 grid in ₹/piece (before GST, before freight), totals, and questionnaire side by side.
window.QP = window.QP || {};
QP.screens = QP.screens || {};

(function () {
  const esc = s => QP.esc(s);
  let tab = 'prices';
  const BADGE = { converted: 'conv', buyer_assumption: 'assumption', assumed_last_year: 'last yr?', corrected: 'corrected' };

  function cellHtml(m, id, L) {
    const vo = m.vendors[id];
    if (!vo.processed) return `<td class="cell gap">—</td>`;
    const c = vo.cells[L.line];
    const flags = c.flagIds.map(fid => m.flags.find(f => f.id === fid)).filter(f => f && f.open);
    const cls = flags.some(f => f.sev === 'red') ? 'red' : flags.length ? 'amber' : '';
    const best = m.cheapest[L.line] && m.cheapest[L.line].id === id && c.value != null;
    if (c.value == null) {
      const label = { not_quoted: 'not quoted', unreadable: 'unreadable', reference: '“same as last yr”', unit_problem: 'unit unclear' }[c.status] || 'missing';
      return `<td class="cell gap ${cls}" data-c="${id}|${L.line}"><span class="small">${label}</span></td>`;
    }
    const badges = c.badges.filter(b => BADGE[b]).map(b => `<span class="badge b-${b}">${BADGE[b]}</span>`).join('');
    return `<td class="cell ${cls} ${best ? 'best' : ''}" data-c="${id}|${L.line}"><span class="v">${QP.fmt(c.value)}</span>${badges}</td>`;
  }

  function openCell(m, id, line) {
    const vo = m.vendors[id], c = vo.cells[line], L = QP.state.rfx.lines.find(x => x.line === line);
    const flags = c.flagIds.map(fid => m.flags.find(f => f.id === fid)).filter(Boolean);
    const note = [
      `Line ${line}: ${L.desc}, ${L.plant}, ${L.qty.toLocaleString('en-IN')} pcs/yr. Spec ${L.weightG} g.`,
      c.badges.includes('buyer_assumption') ? `Your assumption: ₹${c.value} — ${c.note || ''}` : '',
      c.badges.includes('corrected') ? `Corrected by you: ₹${c.value} — ${c.note || ''}` : '',
      c.badges.includes('assumed_last_year') ? `Using last year's price ₹${c.value} — vendor to confirm.` : '',
      flags.length ? 'Flags: ' + flags.map(f => (f.sev === 'red' ? '🔴 ' : '🟡 ') + f.title + (f.open ? '' : ' (resolved)')).join(' · ') : 'No flags: read clearly and passed all checks.'
    ].filter(Boolean).join('\n');
    QP.showSource(id, c.source, { title: `${vo.name} — line ${line}`, steps: c.steps, note });
  }

  function csv(m) {
    const ids = m.processedIds;
    const rows = [['Line', 'Item', 'Plant', 'Ply', 'Annual qty', 'Last year Rs/pc', ...ids.map(id => m.vendors[id].name + ' Rs/pc'), ...ids.map(id => m.vendors[id].name + ' status')]];
    QP.state.rfx.lines.forEach(L => rows.push([L.line, L.desc, L.plant, L.ply, L.qty, L.lastYear ?? '', ...ids.map(id => m.vendors[id].cells[L.line].value ?? ''), ...ids.map(id => { const c = m.vendors[id].cells[L.line]; return c.value == null ? c.status : c.badges.join(' '); })]));
    const text = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
    a.download = 'quote-comparison.csv'; a.click();
  }

  function pricesTab(m) {
    const ids = QP.VENDORS.map(v => v.id);
    const lines = QP.state.rfx.lines;
    const lflN = m.likeForLikeLines.length;
    const foot = (label, fn, cls = '') => `<tr><td class="l" colspan="2">${label}</td><td class="num"></td>${ids.map(id => `<td class="num ${cls}">${m.vendors[id].processed ? fn(m.vendors[id]) : ''}</td>`).join('')}</tr>`;
    const minOf = key => Math.min(...m.processedIds.map(id => m.vendors[id].totals[key]).filter(v => v > 0));
    const lflMin = minOf('likeForLike');
    return `
      <div class="legend"><span><span class="pill green">12.34</span> cheapest on the line</span><span><span class="badge b-converted">conv</span> converted by code (unit / currency / GST)</span><span><span class="badge b-buyer_assumption">assumption</span> your estimate</span><span><span class="badge b-assumed_last_year">last yr?</span> “same as last year”, vendor to confirm</span><span style="box-shadow:inset 3px 0 0 var(--red);padding-left:6px">open 🔴 issue</span><span style="box-shadow:inset 3px 0 0 #f79009;padding-left:6px">open 🟡 check</span><span>Click any number to see where it came from.</span></div>
      <div class="gridwrap"><table class="grid">
        <thead><tr><th class="l">#</th><th class="l">Item · plant · qty/yr</th><th>Last year</th>${ids.map(id => `<th style="white-space:normal;min-width:110px">${esc(m.vendors[id].name)}<div class="small muted" style="font-weight:400">${m.vendors[id].processed ? m.vendors[id].totals.quoted + '/30 priced' : 'not processed'}</div></th>`).join('')}</tr></thead>
        <tbody>${lines.map(L => `<tr><td class="l">${L.line}</td><th>${esc(L.desc)}<span class="sub">${L.ply}-ply · ${esc(L.plant.split(' ')[0])} · ${(L.qty / 1000).toLocaleString('en-IN')}k/yr</span></th><td class="num muted">${L.lastYear ? QP.fmt(L.lastYear) : 'new'}</td>${ids.map(id => cellHtml(m, id, L)).join('')}</tr>`).join('')}</tbody>
        <tfoot>
          ${foot('Coverage', v => `${v.totals.quoted}/30${v.totals.missing ? ` <span style="color:var(--red)">⚠ ${v.totals.missing} missing</span>` : ''}`)}
          ${foot(`Like-for-like total <span class="small muted">(${lflN} lines every vendor priced)</span>`, v => `<span style="${v.totals.likeForLike === lflMin ? 'color:var(--green)' : ''}">${QP.fmtCr(v.totals.likeForLike)}</span>`)}
          ${foot('Full total, priced lines only', v => QP.fmtCr(v.totals.full) + (v.totals.missing ? `<div class="small" style="color:var(--red)">${v.totals.missing} lines not in total</div>` : ''))}
          ${foot('Freight <span class="small muted">(if all priced lines awarded)</span>', v => v.freight.amount == null ? `<span style="color:var(--red)">${esc(v.freight.text)}</span>` : v.freight.kind === 'included' ? '<span class="muted">included</span>' : `+ ${QP.fmtL(v.freight.amount)}<div class="small muted">${esc(v.freight.text)}</div>`)}
          ${foot('Landed total', v => v.freight.amount == null ? '<span style="color:var(--red)">incomplete</span>' : QP.fmtCr(v.totals.full + v.freight.amount))}
          ${foot('Open must-resolve issues', v => v.openRed ? `<span style="color:var(--red)">${v.openRed} 🔴</span>` : '<span style="color:var(--green)">0</span>')}
        </tfoot></table></div>
      <p class="small muted">Prices are ₹ per piece before GST. Conditional discounts (e.g. a volume discount) are not in these numbers — they depend on what is awarded, and are applied in the Award stage only if their condition is met. Last year's 29-line contract value: ${QP.fmtCr(m.lastYear.full)}.</p>`;
  }

  function qTab(m) {
    const ids = m.processedIds;
    if (!ids.length) return '';
    const srcBtn = (id, s) => s ? ` <a href="#" data-qs='${esc(JSON.stringify({ id, s }))}' class="small">source</a>` : '';
    const pill = (ok, txt) => `<span class="pill ${ok === true ? 'green' : ok === false ? 'red' : 'amber'}">${esc(txt)}</span>`;
    const row = (label, fn) => `<tr><th>${label}</th>${ids.map(id => `<td>${fn(m.vendors[id].ex || {}, id, m.vendors[id])}</td>`).join('')}</tr>`;
    const att = (ex, type) => (ex.attachments || []).find(a => a.type === type);
    return `<div class="gridwrap"><table class="t">
      <thead><tr><th style="width:170px"></th>${ids.map(id => `<th>${esc(m.vendors[id].name)}</th>`).join('')}</tr></thead><tbody>
      ${row('ISO 9001 <span class="pill grey">must-pass</span>', (ex, id) => { const q = (ex.questionnaire || {}).iso_9001 || {}; const d = att(ex, 'iso_certificate'); return pill(q.answer === 'yes' && !!d ? true : false, q.answer === 'yes' ? (d ? 'Certificate attached' : 'Claimed, no certificate') : (q.answer || 'not stated')) + (d ? `<div class="small muted">${esc(d.certificate_number || '')} ${d.valid_until ? '· valid until ' + esc(d.valid_until) : ''}</div>` : '') + srcBtn(id, q.source); })}
      ${row('Monthly capacity <span class="pill grey">must-pass</span>', (ex, id) => { const q = (ex.questionnaire || {}).monthly_capacity || {}; return q.boxes_per_month ? pill(q.boxes_per_month >= m.monthlyNeed ? true : null, QP.fmt(q.boxes_per_month, 0) + ' / month') + `<div class="small muted">need ≈ ${QP.fmt(m.monthlyNeed, 0)} for full award</div>` + srcBtn(id, q.source) : pill(false, 'not stated'); })}
      ${row('Strength test report <span class="pill grey">must-pass</span>', (ex, id) => { const d = att(ex, 'test_report'); const q = (ex.questionnaire || {}).test_report || {}; return pill(!!d, d ? 'Attached' : 'Not provided') + (d ? `<div class="small muted">${esc(d.summary || '')}</div>` : '') + srcBtn(id, q.source); })}
      ${row('Food-safe inks <span class="pill grey">must-pass</span>', (ex, id) => { const q = (ex.questionnaire || {}).food_safe_inks || {}; return pill(q.answer === 'yes' ? true : q.answer === 'no' ? false : null, q.answer || 'not stated') + `<div class="small muted">${esc(q.text || '')}</div>` + srcBtn(id, q.source); })}
      ${row('Box weights', (ex, id) => { const q = (ex.questionnaire || {}).box_weight_confirmation || {}; return `${esc(q.answer || 'not stated')}<div class="small muted">${esc(q.text || '')}</div>` + srcBtn(id, q.source); })}
      ${row('Payment', (ex, id) => { const t = (ex.commercial_terms || {}).payment || {}; return t.days != null ? pill(t.days >= 60 ? true : null, t.days + ' days') + srcBtn(id, t.source) : pill(false, 'not stated'); })}
      ${row('Validity', (ex, id) => { const t = (ex.commercial_terms || {}).validity || {}; return t.stated ? esc(t.text || (t.days + ' days')) + srcBtn(id, t.source) : pill(false, 'not stated'); })}
      ${row('Freight', (ex, id, vo) => { const t = (ex.commercial_terms || {}).freight || {}; return esc(t.text || t.basis || '—') + srcBtn(id, t.source); })}
      ${row('Lead time', (ex, id) => { const t = (ex.commercial_terms || {}).lead_time || {}; return t.stated ? esc(t.text || t.days + ' days') + srcBtn(id, t.source) : '<span class="muted">not stated</span>'; })}
      ${row('Discounts', (ex, id) => ((ex.commercial_terms || {}).discounts || []).map(d => esc(d.text) + srcBtn(id, d.source)).join('<br>') || '<span class="muted">none</span>')}
      ${row('Price variation', (ex, id) => { const p = (ex.commercial_terms || {}).price_variation_clause || {}; return p.present ? pill(null, 'Yes') + `<div class="small">${esc(p.text || '')}</div>` + srcBtn(id, p.source) : '<span class="muted">Fixed prices</span>'; })}
      ${row('Documents', (ex) => (ex.attachments || []).map(a => `📄 ${esc(a.file)}`).join('<br>') || '<span class="muted">none</span>')}
      ${row('Our history (info only)', (ex, id) => { const h = QP.VENDOR_HISTORY[id]; return h ? `On-time ${Math.round(h.onTime * 100)}% · rejects ${(h.rejection * 100).toFixed(1)}% · ${h.complaints} complaints<div class="small muted">${esc(h.note)}</div>` : '<span class="muted">No history with us</span>'; })}
      </tbody></table></div>`;
  }

  QP.screens.compare = function (main) {
    const m = QP.model;
    if (!m.processedIds.length) {
      main.innerHTML = `<div class="head"><div><h1>Compare quotes</h1></div></div><div class="card empty">Process at least one vendor reply first.<br><br><button class="btn primary" onclick="QP.go('responses')">Go to Vendor responses</button></div>`;
      return;
    }
    const red = m.flags.filter(f => f.open && f.sev === 'red').length;
    main.innerHTML = `
      <div class="head"><div><h1>Compare quotes</h1><p>All prices normalized by plain code to <b>₹ per piece, before GST</b>. Gaps are never filled with zero or a guess. ${red ? `<a href="#issues" style="color:var(--red)">${red} must-resolve issues open →</a>` : ''}</p></div>
        <div class="actions"><button class="btn" id="csvBtn">Download CSV</button></div></div>
      <div class="tabs"><button data-t="prices" class="${tab === 'prices' ? 'on' : ''}">Prices (30 lines)</button><button data-t="q" class="${tab === 'q' ? 'on' : ''}">Questionnaire, terms &amp; documents</button></div>
      ${tab === 'prices' ? pricesTab(m) : qTab(m)}`;
    main.querySelectorAll('.tabs [data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; QP.render(); });
    main.querySelector('#csvBtn').onclick = () => csv(m);
    main.querySelectorAll('[data-c]').forEach(td => td.onclick = () => { const [id, line] = td.dataset.c.split('|'); openCell(m, id, Number(line)); });
    main.querySelectorAll('[data-qs]').forEach(a => a.onclick = e => { e.preventDefault(); const { id, s } = JSON.parse(a.getAttribute('data-qs')); QP.showSource(id, s, { title: 'Source' }); });
  };
})();
