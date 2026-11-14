// Stage 7 — Award: 1 qualify on must-pass answers · 2 options on true cost · 3 pick, give a reason, keep a record.
// All numbers come from js/award.js (plain code). The AI is not used on this screen.
window.QP = window.QP || {};
QP.screens = QP.screens || {};

(function () {
  const esc = s => QP.esc(s);
  let picked = null;          // option key chosen (before confirming)
  const ACTION_LABEL = { confirm: 'Accepted', confirm_gap: 'Accepted as not quoted', correct: 'Corrected', assume: 'Your estimate', accept_proposal: "Last year's price used", ask: 'Asked vendor (waiting)', remove_reply: 'Reply removed' };
  const dot = s => `<span class="mk mk-${s === 'red' ? 'red' : s === 'yellow' ? 'amber' : 'grey'}">●</span>`;
  const prefs = () => (QP.state.awardPrefs = QP.state.awardPrefs || { mustOff: [], payRate: QP.award.PAY_RATE_DEFAULT });

  function qualifyCard(m, q) {
    const rules = QP.award.mustPassList();
    const vids = QP.VENDORS.map(v => v.id);
    const failed = vids.filter(id => q[id].processed && !q[id].pass);
    return `<div class="card"><div class="ch"><h3>1 · Qualify</h3><span class="muted small">Plain rules on the answers the AI read. Untick a rule to stop it being must-pass (recorded with the award).</span></div>
      <div class="cb" style="padding:0"><div class="gridwrap" style="max-height:none;border:0"><table class="t">
      <thead><tr><th>Vendor</th>${rules.map(r => `<th><label style="display:flex;gap:6px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-must="${esc(r.id)}" ${r.on ? 'checked' : ''}><span>${esc(r.label)}<br><span style="font-weight:400">${r.on ? 'must-pass' : 'not must-pass'}</span></span></label></th>`).join('')}<th>Result</th></tr></thead>
      <tbody>${vids.map(id => { const x = q[id], V = QP.VENDORS.find(v => v.id === id);
        if (!x.processed) return `<tr><td><b>${esc(V.name)}</b></td><td colspan="${rules.length}" class="muted">Reply not read yet</td><td><span class="pill grey">Not in options</span></td></tr>`;
        return `<tr><td><b>${esc(V.name)}</b><div class="small muted">${V.status2026 === 'Incumbent' ? 'Current supplier' : 'New vendor'}</div></td>${x.results.map(r => `<td style="${r.rule.on ? '' : 'opacity:.5'}">${r.pass === true ? `<span class="pill green">✓ ${esc(r.text)}</span>` : r.pass === false ? `<span class="pill red">✗ ${esc(r.text)}</span>` : `<span class="pill grey">${esc(r.text)}</span>`}${r.note ? `<div class="small" style="color:var(--amber)">${esc(r.note)}</div>` : ''}${r.source ? ` <button class="icon-btn" title="View in original file" data-qsrc='${esc(JSON.stringify({ id, s: r.source }))}'>📍</button>` : ''}</td>`).join('')}
          <td>${x.pass ? '<span class="pill green">Qualifies</span>' : '<span class="pill red">Not awarded</span>'}</td></tr>`; }).join('')}</tbody></table></div>
      ${failed.length ? `<div class="small" style="padding:10px 16px;border-top:1px solid var(--line);color:#475467">Not awarded: ${failed.map(id => `<b>${esc(QP.VENDORS.find(v => v.id === id).name)}</b> (${esc(q[id].failed.map(f => f.rule.label + ' — ' + f.text).join('; '))})`).join(' · ')}. They are left out of every option below. If a vendor sends the missing proof, read its new reply and it is checked again.</div>` : ''}
      </div></div>`;
  }

  function optionCard(o, m) {
    const e = o.ev, on = picked === o.key;
    const per = Object.values(e.per).sort((a, b) => b.goods - a.goods);
    const risks = e.risks.slice().sort((a, b) => ({ red: 0, yellow: 1, info: 2 }[a.sev] - { red: 0, yellow: 1, info: 2 }[b.sev]));
    const ly = e.vsLastYear;
    return `<div class="opt ${on ? 'on' : ''} ${o.lowest ? 'low' : ''}">
      <div class="row" style="gap:6px">${o.lowest ? '<span class="pill green">Lowest true cost</span>' : ''}${e.incomplete ? '<span class="pill red">Total incomplete</span>' : ''}${e.uncovered.length ? `<span class="pill red">${e.covered}/${QP.state.rfx.lines.length} items</span>` : `<span class="pill grey">${QP.state.rfx.lines.length}/${QP.state.rfx.lines.length} items</span>`}</div>
      <h4>${esc(o.title)}</h4>
      <div class="ot">${QP.fmtCr(e.total)}${e.incomplete ? '<span class="small" style="color:var(--red)"> + unknown freight</span>' : ''}</div>
      <div class="small muted">landed, before GST · ${ly ? `<span style="color:${ly.pct <= 0 ? 'var(--green)' : 'var(--red)'}">${ly.pct > 0 ? '+' : ''}${QP.fmt(ly.pct * 100, 1)}%</span> vs last year's prices on the ${ly.lines} continuing items` : ''}</div>
      <table class="bu">
        <tr><td>Items</td><td>${QP.fmtCr(e.goods)}</td></tr>
        <tr><td>+ Freight</td><td>${e.freight ? QP.fmtL(e.freight) + ' <span class="small muted">est.</span>' : '<span class="muted">included</span>'}</td></tr>
        <tr><td>− Discount</td><td>${e.discount ? `<span style="color:var(--green)">−${QP.fmtL(e.discount)}</span>` : '<span class="muted">none</span>'}</td></tr>
        <tr class="tt"><td>= Total</td><td>${QP.fmtCr(e.total)}</td></tr>
        <tr><td class="muted">Payment terms impact</td><td class="muted">${e.payImpact ? `${e.payImpact > 0 ? '+' : '−'}${QP.fmtL(Math.abs(e.payImpact))}` : '—'}</td></tr>
      </table>
      <div class="who">${per.map(p => `<div><b>${esc(p.name)}</b> <span class="muted">· ${p.lines.length} item${p.lines.length > 1 ? 's' : ''} (${QP.award.ranges(p.lines)})</span><div class="small muted">${QP.fmtCr(p.goods)}${p.freight.amount ? ` + freight ${QP.fmtL(p.freight.amount)}` : ''}${p.discount ? ` − ${QP.fmtL(p.discount)} discount` : ''}${p.paymentDays != null ? ` · pays in ${p.paymentDays} days` : ''}${p.capacity ? ` · ~${QP.fmt(p.monthly, 0)}/month of ${QP.fmt(p.capacity, 0)} capacity` : ''}</div></div>`).join('')}</div>
      <div class="risks">${risks.length ? risks.map(r => `<div>${dot(r.sev)}${esc(r.text)}</div>`).join('') : '<div class="muted">No risks found by the rules</div>'}
        ${e.openRed.length ? `<div>${dot('red')}<b>${e.openRed.length} must-resolve issue${e.openRed.length > 1 ? 's' : ''} still open</b> — needs your written reason</div>` : `<div class="tile-ok">✓ No open must-resolve issues on this option</div>`}
        ${e.assumptions.length ? `<div>${dot('yellow')}${e.assumptions.length} value${e.assumptions.length > 1 ? 's' : ''} not straight from a quote (corrected / last year's price / your freight estimate)</div>` : ''}</div>
      ${o.others && o.others.length ? `<div class="small muted" style="margin-top:6px">Other single vendors: ${o.others.map(s => `${esc(s.per[s.vendorsUsed[0]] ? s.per[s.vendorsUsed[0]].name : '')} ${s.incomplete ? 'incomplete' : QP.fmtCr(s.total)}${s.uncovered.length ? ` (${s.covered}/${QP.state.rfx.lines.length} items)` : ''}`).join(' · ')}</div>` : ''}
      <details class="small muted" style="margin-top:6px"><summary style="cursor:pointer">How this is worked out</summary>${esc(o.how)} Freight is recalculated for the boxes each vendor gets; a discount counts only if this option meets its condition. Payment terms impact = cost of paying earlier (or later) than our ${QP.state.rfx.paymentDaysStandard}-day standard at ${QP.fmt(e.payRate * 100, 0)}% a year — shown separately, not in the total.</details>
      <button class="btn ${on ? 'primary' : ''}" data-pick="${o.key}" style="margin-top:10px;width:100%">${on ? '✓ Selected' : 'Choose this option'}</button>
    </div>`;
  }

  function decideCard(o) {
    const e = o.ev;
    return `<div class="card" id="decide"><div class="ch"><h3>3 · Your decision: ${esc(o.title)} — ${QP.fmtCr(e.total)}</h3></div><div class="cb">
      ${e.openRed.length ? `<div class="banner" style="background:var(--red-soft);border-color:#fecdca"><b>${e.openRed.length} must-resolve issue${e.openRed.length > 1 ? 's are' : ' is'} still open on this option:</b>
        <ul style="margin:6px 0 8px;padding-left:18px">${e.openRed.map(f => `<li>${esc(QP.VENDORS.find(v => v.id === f.vendor).name)} — ${esc(f.title)}${f.line ? ` (line ${f.line})` : ''}</li>`).join('')}</ul>
        <a href="#" data-goissues>Resolve them in Review Issues →</a> or award anyway with a reason:
        <textarea id="ovr" class="reasonbox" placeholder="Why are you awarding with these issues open?"></textarea></div>` : ''}
      ${e.incomplete ? `<div class="say err" style="margin:0 0 10px">The total is incomplete (freight amount unknown). Enter a freight estimate in Review Issues first.</div>` : ''}
      ${e.uncovered.length ? `<div class="say err" style="margin:0 0 10px">${e.uncovered.length} item(s) are not covered by this option (line ${e.uncovered.join(', ')}).</div>` : ''}
      <label class="small" style="color:#344054">Reason for this decision <span class="muted">(saved in the award record)</span></label>
      <textarea id="why" class="reasonbox" placeholder="e.g. Lowest true cost; keeps Deccan's 3% discount; two suppliers reduce supply risk."></textarea>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="confirmAward" disabled>Confirm award</button><span class="small muted">Numbers are frozen at this moment in the award record.</span></div>
    </div></div>`;
  }

  function snapshot(o, m, q, why, ovr) {
    const e = o.ev;
    return {
      at: new Date().toISOString(), key: o.key, title: o.title, reason: why, overrideReason: ovr || null,
      total: e.total, goods: e.goods, freight: e.freight, discount: e.discount, gst: e.gst, payImpact: e.payImpact, payRate: e.payRate, covered: e.covered, uncovered: e.uncovered,
      vsLastYear: e.vsLastYear, risks: e.risks, assumptions: e.assumptions,
      per: Object.values(e.per).map(p => ({ id: p.id, name: p.name, lines: p.lines, goods: p.goods, freight: p.freight.amount, freightText: p.freight.text, discount: p.discount, total: p.total, paymentDays: p.paymentDays })),
      lines: QP.state.rfx.lines.filter(L => e.assign[L.line]).map(L => { const c = m.vendors[e.assign[L.line]].cells[L.line]; return { line: L.line, desc: L.desc, plant: L.plant, qty: L.qty, vendor: m.vendors[e.assign[L.line]].name, price: c.value, basis: c.badges.join(' ') || 'extracted', lastYear: L.lastYear }; }),
      openRed: e.openRed.map(f => ({ vendor: QP.VENDORS.find(v => v.id === f.vendor).name, title: f.title, line: f.line })),
      qualification: QP.VENDORS.map(V => ({ name: V.name, pass: q[V.id].pass, processed: q[V.id].processed, why: q[V.id].why })),
      mustPass: QP.award.mustPassList().map(r => ({ label: r.label, on: r.on })),
      otherOptions: (QP._awardOptions || []).filter(x => x.key !== o.key).map(x => ({ title: x.title, total: x.ev.total, incomplete: x.ev.incomplete })),
      issueDecisions: m.flags.filter(f => f.decision && (o.ev.per[f.vendor])).map(f => ({ vendor: QP.VENDORS.find(v => v.id === f.vendor).name, title: f.title, line: f.line, action: ACTION_LABEL[f.decision.action] || f.decision.action, value: f.decision.value, reason: f.decision.reason || '' }))
    };
  }

  function recordCard(a) {
    const when = new Date(a.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    return `<div class="card"><div class="ch"><h3>✓ Awarded: ${esc(a.title)}</h3><span class="grow"></span>
        <button class="btn sm" id="xlsAward">Download award record (Excel)</button><button class="btn sm" id="changeAward">Change decision</button></div>
      <div class="cb">
        <div class="kpis"><div class="kpi"><div class="l">Landed total, before GST</div><div class="v">${QP.fmtCr(a.total)}</div></div>
          <div class="kpi"><div class="l">vs last year's prices (${a.vsLastYear ? a.vsLastYear.lines : 0} continuing items)</div><div class="v" style="color:${a.vsLastYear && a.vsLastYear.pct <= 0 ? 'var(--green)' : 'var(--red)'}">${a.vsLastYear ? (a.vsLastYear.pct > 0 ? '+' : '') + QP.fmt(a.vsLastYear.pct * 100, 1) + '%' : '—'}</div></div>
          <div class="kpi"><div class="l">Items covered</div><div class="v">${a.covered}/${QP.state.rfx.lines.length}</div></div>
          <div class="kpi"><div class="l">Incl. ${QP.state.rfx.gstRate * 100}% GST (cash outlay)</div><div class="v">${QP.fmtCr(a.total + a.gst)}</div></div></div>
        <table class="t"><thead><tr><th>Vendor</th><th>Items</th><th class="num">Items value</th><th class="num">Freight</th><th class="num">Discount</th><th class="num">Total</th><th>Payment</th></tr></thead><tbody>
          ${a.per.map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${p.lines.length} (lines ${QP.award.ranges(p.lines)})</td><td class="num">${QP.fmtCr(p.goods)}</td><td class="num">${p.freight ? QP.fmtL(p.freight) : 'incl.'}</td><td class="num">${p.discount ? '−' + QP.fmtL(p.discount) : '—'}</td><td class="num"><b>${QP.fmtCr(p.total)}</b></td><td>${p.paymentDays != null ? p.paymentDays + ' days' : '—'}</td></tr>`).join('')}
        </tbody></table>
        <div class="kv" style="margin-top:14px">
          <div class="k">Reason</div><div>${esc(a.reason)}</div>
          ${a.overrideReason ? `<div class="k">Open issues accepted</div><div>${a.openRed.map(f => esc(f.vendor + ' — ' + f.title)).join('; ')}<br><i>${esc(a.overrideReason)}</i></div>` : ''}
          <div class="k">Other options</div><div>${a.otherOptions.map(x => `${esc(x.title)}: ${x.incomplete ? 'incomplete' : QP.fmtCr(x.total)}`).join(' · ') || '—'}</div>
          <div class="k">Qualification</div><div>${a.qualification.filter(x => x.processed).map(x => `${esc(x.name)}: ${x.pass ? '✓ qualifies' : '✗ ' + esc(x.why)}`).join('<br>')}</div>
          <div class="k">Risks accepted</div><div>${a.risks.map(r => esc(r.text)).join('<br>') || '—'}</div>
          <div class="k">Review decisions used</div><div>${a.issueDecisions.length ? a.issueDecisions.map(d => `${esc(d.vendor)} — ${esc(d.title)}: ${esc(d.action)}${d.value != null ? ' ₹' + esc(d.value) : ''}${d.reason ? ` <i>(“${esc(d.reason)}”)</i>` : ''}`).join('<br>') : 'none'}</div>
          <div class="k">Decided</div><div>${when} · Priya Deshmukh · numbers frozen at this moment</div>
        </div>
        <div id="memoSlot"></div>
      </div></div>`;
  }

  function downloadRecord(a) {
    const wb = XLSX.utils.book_new();
    const sum = [['Award record', QP.state.rfx.id + ' — ' + QP.state.rfx.title], ['Decided', a.at], ['Option', a.title], ['Landed total before GST (Rs)', Math.round(a.total)], ['Items', Math.round(a.goods)], ['Freight', Math.round(a.freight)], ['Discount', Math.round(a.discount)], ['Payment terms impact (separate)', Math.round(a.payImpact)], ['Reason', a.reason], ['Open issues accepted', a.overrideReason || ''], [],
      ['Vendor', 'Items', 'Items value', 'Freight', 'Discount', 'Total', 'Payment days'], ...a.per.map(p => [p.name, p.lines.join(' '), Math.round(p.goods), Math.round(p.freight || 0), Math.round(p.discount), Math.round(p.total), p.paymentDays]),
      [], ['Risks'], ...a.risks.map(r => [r.text]), [], ['Qualification'], ...a.qualification.map(x => [x.name, x.processed ? (x.pass ? 'Qualifies' : 'Not awarded: ' + x.why) : 'Not read'])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Award');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(a.lines.map(l => ({ Line: l.line, Item: l.desc, Plant: l.plant, 'Annual qty': l.qty, Vendor: l.vendor, 'Rs per piece': l.price, Basis: l.basis, 'Last year Rs/pc': l.lastYear ?? '', 'Value Rs': Math.round(l.price * l.qty) }))), 'Lines');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(a.issueDecisions.map(d => ({ Vendor: d.vendor, Issue: d.title, Line: d.line ?? '', Decision: d.action, Value: d.value ?? '', Reason: d.reason }))), 'Review decisions');
    XLSX.writeFile(wb, 'award-record.xlsx');
  }

  QP.screens.award = function (main) {
    const m = QP.model;
    if (!m.processedIds.length) {
      main.innerHTML = `<div class="head"><div><h1>Award</h1></div></div><div class="card empty">Read at least one vendor reply first.<br><br><button class="btn primary" onclick="QP.go('responses')">Go to Vendor Responses</button></div>`;
      return;
    }
    const a = QP.state.award;
    const q = QP.award.qualify(m);
    const ids = QP.VENDORS.map(v => v.id).filter(id => q[id].pass);
    const opts = QP.award.buildOptions(m, ids);
    QP._awardOptions = opts;
    if (picked && !opts.find(o => o.key === picked)) picked = null;
    const pendingVendors = QP.VENDORS.filter(V => !m.vendors[V.id].processed).map(V => V.name);
    main.innerHTML = `
      <div class="head"><div><h1>Award</h1><p>Qualify vendors on the must-pass answers, compare whole award options on <b>true cost</b> (prices + freight for the volume each vendor gets − discounts only when the option meets the condition), then record your decision and reason.</p></div></div>
      ${a ? recordCard(a) : ''}
      ${pendingVendors.length ? `<div class="say info" style="margin:0 0 12px">Not read yet: ${esc(pendingVendors.join(', '))}. Options below use the replies read so far.</div>` : ''}
      ${qualifyCard(m, q)}
      <div class="card"><div class="ch"><h3>2 · Award options</h3><span class="muted small">Only vendors that qualify · before GST · items only the vendor priced (your estimates are never awarded)</span><span class="grow"></span>
        <label class="small muted">Payment terms impact at <input id="payRate" type="number" min="0" max="30" step="0.5" value="${QP.fmt(prefs().payRate * 100, 1).replace(/\.0$/, '')}" style="width:56px;border:1px solid var(--line);border-radius:6px;padding:3px 6px"> % a year</label></div>
        <div class="cb">${opts.length ? `<div class="opts">${opts.map(o => optionCard(o, m)).join('')}</div>` : '<div class="empty">No vendor qualifies, so there is nothing to award. The table above shows which rule each vendor failed.</div>'}</div></div>
      ${!a && picked ? decideCard(opts.find(o => o.key === picked)) : ''}`;

    main.querySelectorAll('[data-must]').forEach(cb => cb.onchange = () => {
      const p = prefs(); p.mustOff = p.mustOff.filter(x => x !== cb.dataset.must); if (!cb.checked) p.mustOff.push(cb.dataset.must); QP.save(); QP.render();
    });
    main.querySelectorAll('[data-qsrc]').forEach(b => b.onclick = () => { const { id, s } = JSON.parse(b.getAttribute('data-qsrc')); QP.showSource(id, s, { title: 'Source' }); });
    const pr = main.querySelector('#payRate'); if (pr) pr.onchange = () => { const v = Number(pr.value); if (v >= 0 && v <= 30) { prefs().payRate = v / 100; QP.save(); QP.render(); } };
    main.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
      if (a) { QP.say(b, 'An award is already recorded. Use “Change decision” at the top first.', 'info'); return; }
      picked = b.dataset.pick; QP.render(); const d = document.getElementById('decide'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const gi = main.querySelector('[data-goissues]'); if (gi) gi.onclick = e => { e.preventDefault(); QP.issueFilter = { sev: 'red', vendor: 'all' }; QP.go('issues'); };
    const btn = main.querySelector('#confirmAward');
    if (btn) {
      const o = opts.find(x => x.key === picked);
      const why = main.querySelector('#why'), ovr = main.querySelector('#ovr');
      const ok = () => { btn.disabled = !(why.value.trim().length > 2 && (!ovr || ovr.value.trim().length > 2) && !o.ev.incomplete && !o.ev.uncovered.length); };
      why.oninput = ok; if (ovr) ovr.oninput = ok;
      btn.onclick = () => { QP.state.award = snapshot(o, m, q, why.value.trim(), ovr ? ovr.value.trim() : null); QP.save(); picked = null; QP.flash = { text: 'Award recorded.', kind: 'ok' }; QP.render(); window.scrollTo(0, 0); };
    }
    if (a) {
      main.querySelector('#xlsAward').onclick = () => downloadRecord(a);
      main.querySelector('#changeAward').onclick = async () => {
        if (!await QP.confirmBox('Change the decision?', 'The current award record will be removed so you can choose again. The options below are recalculated from the latest data.', 'Change decision')) return;
        QP.state.award = null; QP.save(); QP.render();
      };
      if (QP.awardMemo) QP.awardMemo(main.querySelector('#memoSlot'), a);
    }
  };
})();
