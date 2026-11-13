// Stage 5 — Compare: 30 × 5 grid in ₹/piece (before GST, before freight), totals, and questionnaire side by side.
window.QP = window.QP || {};
QP.screens = QP.screens || {};

(function () {
  const esc = s => QP.esc(s);
  let tab = 'prices';
  const BADGE = { converted: 'conv', buyer_assumption: 'your estimate', assumed_last_year: 'last yr?', corrected: 'corrected' };

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
    const flags = c.flagIds.concat(c.groupFlagIds || []).map(fid => m.flags.find(f => f.id === fid)).filter(Boolean);
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
      <div class="legend-bar">
        <span><i class="lg lg-red"></i>Red edge = needs your decision</span>
        <span><i class="lg lg-amber"></i>Orange edge = worth a look</span>
        <span><span class="lg-best">12.34</span> cheapest on the line</span>
        <span><span class="badge b-converted">conv</span> converted from the vendor's unit / currency (click to see the maths)</span>
        <span><span class="badge b-buyer_assumption">your estimate</span> entered by you — not a quote, never “cheapest”, not in like-for-like</span>
        <span class="muted">Click any number to see where it came from.</span>
      </div>
      <div class="gridwrap"><table class="grid">
        <thead><tr><th class="l">#</th><th class="l">Item · plant · qty/yr</th><th>Last year</th>${ids.map(id => { const vo = m.vendors[id]; return `<th style="white-space:normal;min-width:110px">${esc(vo.name)}<div class="small muted" style="font-weight:400">${vo.processed ? vo.totals.quoted + '/30 quoted' + (vo.totals.estimates ? ` · <span style="color:var(--violet)">${vo.totals.estimates} your estimate</span>` : '') : 'not processed'}</div>${(vo.discounts || []).map(d => `<div class="disc-chip" title="${esc(d.text)}">${d.percent}% off if order &gt; ${QP.fmtCr(d.threshold)} · applied in Award</div>`).join('')}</th>`; }).join('')}</tr></thead>
        <tbody>${lines.map(L => `<tr><td class="l">${L.line}</td><th>${esc(L.desc)}<span class="sub">${L.ply}-ply · ${esc(L.plant.split(' ')[0])} · ${(L.qty / 1000).toLocaleString('en-IN')}k/yr</span></th><td class="num muted">${L.lastYear ? QP.fmt(L.lastYear) : 'new'}</td>${ids.map(id => cellHtml(m, id, L)).join('')}</tr>`).join('')}</tbody>
        <tfoot>
          ${foot('Coverage', v => `${v.totals.quoted}/30 quoted${v.totals.estimates ? ` <div class="small" style="color:var(--violet)">+ ${v.totals.estimates} your estimate</div>` : ''}${v.totals.missing ? ` <span style="color:var(--red)">⚠ ${v.totals.missing} missing</span>` : ''}`)}
          ${foot(`Like-for-like total <span class="small muted">(${lflN} lines every vendor priced)</span>`, v => `<span style="${v.totals.likeForLike === lflMin ? 'color:var(--green)' : ''}">${QP.fmtCr(v.totals.likeForLike)}</span>`)}
          ${foot('Full total, priced lines only', v => QP.fmtCr(v.totals.full) + (v.totals.estimates ? `<div class="small" style="color:var(--violet)">includes ${QP.fmtL(v.totals.estimateValue)} of your estimates</div>` : '') + (v.totals.missing ? `<div class="small" style="color:var(--red)">${v.totals.missing} ${v.totals.missing === 1 ? 'line' : 'lines'} not in total</div>` : ''))}
          ${m.processedIds.some(id => (m.vendors[id].discounts || []).length) ? foot('Conditional discount <span class="small muted">(not in the totals above)</span>', v => (v.discounts || []).map(d => d.met
            ? `<span style="color:var(--green)">−${QP.fmtL(d.saving)}</span><div class="small muted">if ${esc(v.name.split(' ')[0])} wins all lines it priced (${QP.fmtCr(v.totals.full)} &gt; ${QP.fmtCr(d.threshold)}, condition met)</div>`
            : `<span class="muted">not reached</span><div class="small muted">even with all its lines: ${QP.fmtCr(v.totals.full)} &lt; ${QP.fmtCr(d.threshold)}</div>`).join('') || '') : ''}
          ${foot('Freight', v => v.freight.amount == null ? '<span style="color:var(--red)">extra — amount unknown</span>' : v.freight.kind === 'included' ? '<span class="muted">included</span>' : `+ ${QP.fmtL(v.freight.amount)} <span class="small muted">est.</span> <button class="icon-btn" title="How this is calculated" data-freight="${v.id}">ⓘ</button>`)}
          ${foot('Landed total', v => v.freight.amount == null ? '<span style="color:var(--red)">incomplete</span>' : QP.fmtCr(v.totals.full + v.freight.amount))}
          ${foot(`Priced lines incl. ${QP.state.rfx.gstRate * 100}% GST <span class="small muted">(cash outlay, before freight; GST recoverable as input credit)</span>`, v => QP.fmtCr(v.totals.full * (1 + QP.state.rfx.gstRate)))}
          ${foot('Must-resolve issues', v => v.openRed ? `<a href="#" data-goissues="${v.id}" style="color:var(--red)">${v.openRed} open</a>` : '<span class="tile-ok">✓ resolved</span>')}
        </tfoot></table></div>
      <p class="small muted">Last year's contract: ${QP.fmtCr(m.lastYear.full)}.</p>`;
  }

  function qTab(m) {
    const ids = m.processedIds;
    if (!ids.length) return '';
    const srcBtn = (id, s) => s ? ` <button class="icon-btn" title="View in original file" data-qs='${esc(JSON.stringify({ id, s }))}'>📍</button>` : '';
    const pill = (ok, txt) => `<span class="pill ${ok === true ? 'green' : ok === false ? 'red' : 'amber'}">${esc(txt)}</span>`;
    const row = (label, fn) => `<tr><th>${label}</th>${ids.map(id => `<td>${fn(m.vendors[id].ex || {}, id, m.vendors[id])}</td>`).join('')}</tr>`;
    const att = (ex, type) => (ex.attachments || []).find(a => a.type === type);
    const lbl = (key, q, ex) => { const l = QP.qLabel(key, q, ex); return `<span class="pill ${l.cls}">${esc(l.text)}</span>`; };
    return `<div class="gridwrap"><table class="t">
      <thead><tr><th style="width:170px"></th>${ids.map(id => `<th>${esc(m.vendors[id].name)}</th>`).join('')}</tr></thead><tbody>
      ${row('ISO 9001 <span class="pill grey">must-pass</span>', (ex, id) => { const q = (ex.questionnaire || {}).iso_9001 || {}; const d = att(ex, 'iso_certificate'); return lbl('iso_9001', q, ex) + (d ? `<div class="small muted">${[d.certificate_number, d.valid_until ? 'valid until ' + d.valid_until : ''].filter(Boolean).map(esc).join(' · ')}</div>` : '') + srcBtn(id, q.source); })}
      ${row('Monthly capacity <span class="pill grey">must-pass</span>', (ex, id) => { const q = (ex.questionnaire || {}).monthly_capacity || {}; return q.boxes_per_month ? pill(q.boxes_per_month >= m.monthlyNeed ? true : null, QP.fmt(q.boxes_per_month, 0) + ' / month') + `<div class="small muted">need ≈ ${QP.fmt(m.monthlyNeed, 0)} for full award</div>` + srcBtn(id, q.source) : pill(false, QP.NOT_MENTIONED); })}
      ${row('Strength test report <span class="pill grey">must-pass</span>', (ex, id) => { const d = att(ex, 'test_report'); const q = (ex.questionnaire || {}).test_report || {}; return lbl('test_report', q, ex) + (d ? `<div class="small muted">${esc(d.summary || '')}</div>` : '') + srcBtn(id, q.source); })}
      ${row('Food-safe inks <span class="pill grey">must-pass</span>', (ex, id) => { const q = (ex.questionnaire || {}).food_safe_inks || {}; return lbl('food_safe_inks', q, ex) + `<div class="small muted">${esc(q.text || '')}</div>` + srcBtn(id, q.source); })}
      ${row('Box weights', (ex, id) => { const q = (ex.questionnaire || {}).box_weight_confirmation || {}; return `${lbl('box_weight_confirmation', q, ex)}<div class="small muted">${esc(q.text || '')}</div>` + srcBtn(id, q.source); })}
      ${row('Payment', (ex, id) => { const t = (ex.commercial_terms || {}).payment || {}; return t.days != null ? pill(t.days >= 60 ? true : null, t.days + ' days') + srcBtn(id, t.source) : pill(false, QP.NOT_MENTIONED); })}
      ${row('Validity', (ex, id) => { const t = (ex.commercial_terms || {}).validity || {}; return t.stated ? esc(t.text || (t.days + ' days')) + srcBtn(id, t.source) : pill(false, QP.NOT_MENTIONED); })}
      ${row('Freight', (ex, id, vo) => { const t = (ex.commercial_terms || {}).freight || {}; return esc(t.text || t.basis || '—') + srcBtn(id, t.source); })}
      ${row('Lead time', (ex, id) => { const t = (ex.commercial_terms || {}).lead_time || {}; return t.stated ? esc(t.text || t.days + ' days') + srcBtn(id, t.source) : `<span class="muted">${QP.NOT_MENTIONED}</span>`; })}
      ${row('Discounts', (ex, id) => ((ex.commercial_terms || {}).discounts || []).map(d => esc(d.text) + srcBtn(id, d.source)).join('<br>') || '<span class="muted">none</span>')}
      ${row('Price variation', (ex, id) => { const p = (ex.commercial_terms || {}).price_variation_clause || {}; return p.present ? pill(null, 'Yes') + `<div class="small">${esc(p.text || '')}</div>` + srcBtn(id, p.source) : '<span class="muted">Fixed prices</span>'; })}
      ${row('Documents', (ex, id) => (QP.state.vendors[id].files || []).map(f => `<a href="#" data-doc="${id}|${esc(f.id)}">📄 ${esc(f.name)}</a>`).join('<br>') || '<span class="muted">none</span>')}
      ${row('Our history (info only)', (ex, id) => { const h = QP.VENDOR_HISTORY[id]; return h ? `On-time ${Math.round(h.onTime * 100)}% · rejects ${(h.rejection * 100).toFixed(1)}% · ${h.complaints} complaints<div class="small muted">${esc(h.note)}</div>` : '<span class="muted">No history with us</span>'; })}
      </tbody></table></div>`;
  }

  function freightInfo(vo) {
    const f = vo.freight;
    QP.modal(`Freight estimate — ${esc(vo.name)}`, `
      <p style="font-size:15px"><b>Freight estimate: ~${f.trucks} trucks × ${esc(f.currency)} ${f.unitAmount}${f.fx !== 1 ? ` × ₹${QP.fmt(f.fx)}` : ''} = ${QP.fmtL(f.amount)}</b>, if ${esc(vo.name)} supplies all ${vo.totals.inTotal} lines in its total${vo.totals.estimates ? ` (incl. ${vo.totals.estimates} your estimate)` : ''}. It will be lower if they get fewer lines. Award recalculates this.</p>
      <p class="muted">How it is worked out: the vendor charges freight separately${f.unitAmount ? `: <b>${esc(f.currency)} ${f.unitAmount} per truck</b>, about <b>${QP.fmt(f.boxesPerTruck, 0)} boxes</b> per truck` : ''}.</p>
      <ol>
        <li>Boxes a year on the lines this vendor priced: <b>${QP.fmt(f.boxes, 0)}</b></li>
        <li>Trucks needed: ${QP.fmt(f.boxes, 0)} ÷ ${QP.fmt(f.boxesPerTruck, 0)} = <b>${f.trucks} trucks</b> (rounded up)</li>
        <li>Cost per truck: ${esc(f.currency)} ${f.unitAmount}${f.fx !== 1 ? ` × ₹${QP.fmt(f.fx)} (RFx rate)` : ''} = <b>${QP.fmtRs(f.perTruck, 0)}</b></li>
        <li>Freight: ${f.trucks} × ${QP.fmtRs(f.perTruck, 0)} = <b>${QP.fmtL(f.amount)}</b> a year</li>
      </ol>
`, { width: 600 });
  }

  QP.screens.compare = function (main) {
    const m = QP.model;
    if (!m.processedIds.length) {
      main.innerHTML = `<div class="head"><div><h1>Compare quotes</h1></div></div><div class="card empty">Process at least one vendor reply first.<br><br><button class="btn primary" onclick="QP.go('responses')">Go to Vendor responses</button></div>`;
      return;
    }
    const red = m.flags.filter(f => f.open && f.sev === 'red').length;
    main.innerHTML = `
      <div class="head"><div><h1>Compare quotes</h1><p>All prices in <b>₹ per piece, before GST</b> (${QP.state.rfx.gstRate * 100}%, recoverable). ${red ? `<a href="#" data-allissues style="color:var(--red)">${red} must-resolve issues open →</a>` : '<span class="tile-ok">✓ No open must-resolve issues</span>'}</p></div>
        <div class="actions"><button class="btn" id="csvBtn">Download CSV</button></div></div>
      <div class="tabs"><button data-t="prices" class="${tab === 'prices' ? 'on' : ''}">Prices (30 lines)</button><button data-t="q" class="${tab === 'q' ? 'on' : ''}">Questionnaire, terms &amp; documents</button></div>
      ${tab === 'prices' ? pricesTab(m) : qTab(m)}`;
    main.querySelectorAll('.tabs [data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; QP.render(); });
    main.querySelector('#csvBtn').onclick = () => csv(m);
    main.querySelectorAll('[data-c]').forEach(td => td.onclick = () => { const [id, line] = td.dataset.c.split('|'); openCell(m, id, Number(line)); });
    main.querySelectorAll('[data-qs]').forEach(a => a.onclick = e => { e.preventDefault(); const { id, s } = JSON.parse(a.getAttribute('data-qs')); QP.showSource(id, s, { title: 'Source' }); });
    main.querySelectorAll('[data-doc]').forEach(a => a.onclick = e => { e.preventDefault(); const [id, fid] = a.dataset.doc.split('|'); QP.showFile(id, QP.state.vendors[id].files.find(f => f.id === fid)); });
    main.querySelectorAll('[data-goissues]').forEach(a => a.onclick = e => { e.preventDefault(); QP.issueFilter = { sev: 'red', vendor: a.dataset.goissues }; QP.go('issues'); });
    main.querySelectorAll('[data-allissues]').forEach(a => a.onclick = e => { e.preventDefault(); QP.issueFilter = { sev: 'red', vendor: 'all' }; QP.go('issues'); });
    main.querySelectorAll('[data-freight]').forEach(b => b.onclick = () => freightInfo(m.vendors[b.dataset.freight]));
  };
})();
