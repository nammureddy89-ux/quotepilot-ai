// Award engine — plain code only, no AI. Used by the Award screen AND by Ask AI, so both always agree.
//   1. qualify(m)            → must-pass rules per vendor (pass / fail with the reason)
//   2. evaluate(m, assign)   → true cost of ANY split: prices + freight for the volume each vendor gets
//                              − conditional discount only if THIS split meets its condition
//   3. buildOptions(m, ids)  → one vendor · cheapest per line · best split of max 2 vendors
window.QP = window.QP || {};

(function () {
  const A = QP.award = {};
  const fmt = (n, d) => QP.fmt(n, d);
  A.PAY_RATE_DEFAULT = 0.10;   // interest rate used to put payment terms into rupees (editable on screen)

  // ---------- 1. Qualification (must-pass questions) ----------
  const RULES = {
    iso_9001: { label: 'ISO 9001 with certificate', check(ex, vo) {
      const q = (ex.questionnaire || {}).iso_9001 || {};
      const doc = (ex.attachments || []).find(a => a.type === 'iso_certificate');
      if (q.answer === 'in_process') return { pass: false, text: 'Applied, not yet certified', source: q.source };
      if (!doc) return { pass: false, text: q.answer === 'yes' ? 'Claimed, no certificate attached' : QP.NOT_MENTIONED, source: q.source };
      if (doc.company_named && !QP.namesMatch(doc.company_named, vo.name)) return { pass: false, text: `Certificate names “${doc.company_named}”`, source: q.source };
      const start = QP.state.rfx.periodStart, end = QP.state.rfx.contractEnd;
      if (doc.valid_until && start && doc.valid_until < start) return { pass: false, text: `Certificate expired ${doc.valid_until}`, source: q.source };
      return { pass: true, text: 'Certificate attached' + (doc.valid_until ? `, valid to ${doc.valid_until}` : ''), note: doc.valid_until && end && doc.valid_until < end ? 'Expires during the contract' : null, source: q.source, file: doc.file };
    } },
    monthly_capacity: { label: 'Monthly capacity stated', check(ex, vo, m) {
      const q = (ex.questionnaire || {}).monthly_capacity || {};
      if (q.boxes_per_month == null) return { pass: false, text: QP.NOT_MENTIONED, source: q.source };
      const full = q.boxes_per_month >= m.monthlyNeed;
      return { pass: true, text: `${fmt(q.boxes_per_month, 0)} / month`, note: full ? null : `Below full need (~${fmt(m.monthlyNeed, 0)}); checked per award option`, source: q.source };
    } },
    test_report: { label: 'Strength test report', check(ex) {
      const q = (ex.questionnaire || {}).test_report || {};
      const doc = (ex.attachments || []).find(a => a.type === 'test_report');
      if (doc) return { pass: true, text: 'Report attached', source: q.source, file: doc.file };
      return { pass: false, text: q.answer === 'claimed_not_attached' ? 'Mentioned, no report attached' : QP.NOT_MENTIONED, source: q.source };
    } },
    food_safe_inks: { label: 'Food-safe inks', check(ex) {
      const q = (ex.questionnaire || {}).food_safe_inks || {};
      if (q.answer === 'yes') return { pass: true, text: 'Yes', source: q.source };
      return { pass: false, text: q.answer === 'no' ? 'No' : QP.NOT_MENTIONED, source: q.source };
    } }
  };
  A.RULES = RULES;

  // Which questions are must-pass: ticked in Create RFx; Priya can untick one in Award (saved in the award record).
  A.mustPassList = function () {
    const off = ((QP.state.awardPrefs || {}).mustOff) || [];
    return (QP.state.rfx.questionnaire || []).filter(q => q.mustPass).map(q => ({
      id: q.id, topic: q.topic, text: q.text, auto: !!RULES[q.topic], on: !off.includes(q.id), label: RULES[q.topic] ? RULES[q.topic].label : q.text
    }));
  };

  A.qualify = function (m) {
    const rules = A.mustPassList();
    const out = {};
    QP.VENDORS.forEach(V => {
      const vo = m.vendors[V.id];
      if (!vo.processed) { out[V.id] = { id: V.id, processed: false, pass: false, results: [], failed: [], why: 'Reply not read yet' }; return; }
      const results = rules.map(r => {
        if (!r.auto) return { rule: r, pass: null, text: 'Not checked automatically — read the reply' };
        return { rule: r, ...RULES[r.topic].check(vo.ex, vo, m) };
      });
      const failed = results.filter(x => x.rule.on && x.pass === false);
      out[V.id] = { id: V.id, processed: true, pass: failed.length === 0, results, failed,
        why: failed.map(f => `${f.rule.label}: ${f.text}`).join(' · ') };
    });
    return out;
  };

  // ---------- 2. True cost of a split ----------
  // An item can be awarded to a vendor only if the VENDOR priced it (your own estimates never count).
  A.eligible = (c) => c && c.value != null && !c.estimate;

  function freightPerBox(vo) {
    const f = QP.freightEstimate(vo, 12000);
    if (f.amount == null) return 0;
    return f.amount / 12000;
  }
  function capacityOf(vo) { const q = ((vo.ex || {}).questionnaire || {}).monthly_capacity || {}; return q.boxes_per_month || null; }
  function paymentDays(vo) {
    const t = ((vo.ex || {}).commercial_terms || {}).payment || {};
    if (t.days != null) return { days: t.days, assumed: false };
    const d = QP.state.decisions[`${vo.id}:payment_missing:x`];
    if (d && d.action === 'assume' && d.value != null) return { days: Number(d.value), assumed: true };
    return { days: null, assumed: false };
  }

  // assign: { lineNo: vendorId }. Lines not in assign are "not covered".
  A.evaluate = function (m, assign, opts = {}) {
    const rfx = QP.state.rfx, std = rfx.paymentDaysStandard || 60;
    const rate = opts.payRate != null ? opts.payRate : ((QP.state.awardPrefs || {}).payRate ?? A.PAY_RATE_DEFAULT);
    const per = {};
    const uncovered = [];
    let lyLines = 0, lyCost = 0, lyNow = 0;
    rfx.lines.forEach(L => {
      const id = assign[L.line];
      if (!id) { uncovered.push(L.line); return; }
      const vo = m.vendors[id], c = vo.cells[L.line];
      const p = per[id] = per[id] || { id, name: vo.name, lines: [], goods: 0, boxes: 0, assumptions: [], openRedLines: [] };
      p.lines.push(L.line); p.goods += c.value * L.qty; p.boxes += L.qty;
      if (c.badges.includes('assumed_last_year')) p.assumptions.push(`Line ${L.line}: last year's price, vendor to confirm`);
      if (c.badges.includes('corrected')) p.assumptions.push(`Line ${L.line}: price corrected by you`);
      if (c.openRed) p.openRedLines.push(L.line);
      if (L.lastYear) { lyLines++; lyCost += L.lastYear * L.qty; lyNow += c.value * L.qty; }
    });
    let goods = 0, freight = 0, discount = 0, incomplete = false, payImpact = 0;
    const risks = [], lostDiscounts = [];
    Object.values(per).forEach(p => {
      const vo = m.vendors[p.id];
      p.freight = QP.freightEstimate(vo, p.boxes);
      if (p.freight.amount == null) { incomplete = true; risks.push({ sev: 'red', text: `${p.name}: freight extra, amount unknown — total incomplete` }); }
      if (p.freight.kind === 'buyer_assumption') p.assumptions.push(`Freight: your estimate (${p.freight.text})`);
      p.discount = 0; p.discounts = [];
      ((vo.ex.commercial_terms || {}).discounts || []).forEach(d => {
        const thr = QP.thresholdRupees(d);
        if (!d || !d.percent || d.condition_type !== 'annual_order_value_above' || !thr) return;
        const met = p.goods > thr;
        const amt = met ? p.goods * d.percent / 100 : 0;
        p.discount += amt; p.discounts.push({ percent: d.percent, threshold: thr, met, amount: amt });
        if (!met) lostDiscounts.push({ id: p.id, name: p.name, percent: d.percent, threshold: thr, wouldSave: p.goods * d.percent / 100, gap: thr - p.goods });
      });
      p.total = p.goods + (p.freight.amount || 0) - p.discount;
      goods += p.goods; freight += p.freight.amount || 0; discount += p.discount;
      // capacity: monthly boxes this split gives the vendor vs what the vendor says it can make
      p.capacity = capacityOf(vo); p.monthly = Math.round(p.boxes / 12);
      if (p.capacity && p.monthly > p.capacity) risks.push({ sev: 'red', text: `${p.name}: needs ~${fmt(p.monthly, 0)} boxes/month, capacity ${fmt(p.capacity, 0)}` });
      else if (p.capacity && p.monthly > 0.85 * p.capacity) risks.push({ sev: 'yellow', text: `${p.name}: uses ${Math.round(p.monthly / p.capacity * 100)}% of stated capacity` });
      const pd = paymentDays(vo); p.paymentDays = pd.days;
      if (pd.days != null && pd.days !== std) {
        p.payImpact = p.total * (std - pd.days) / 365 * rate;   // + = costs us (we pay earlier than standard)
        payImpact += p.payImpact;
      }
      const pvc = (vo.ex.commercial_terms || {}).price_variation_clause;
      if (pvc && pvc.present) risks.push({ sev: 'yellow', text: `${p.name}: prices can change during the year (price-variation clause)` });
      if (p.freight.kind === 'estimated') risks.push({ sev: 'yellow', text: `${p.name}: freight is an estimate (${p.freight.text})` });
      if (!QP.VENDOR_HISTORY[p.id]) risks.push({ sev: 'info', text: `${p.name}: no supply history with us` });
    });
    lostDiscounts.forEach(d => risks.push({ sev: 'yellow', text: `Loses ${d.name}${/s$/.test(d.name) ? "'" : "'s"} ${d.percent}% discount (worth ${QP.fmtL(d.wouldSave)}): its share ${QP.fmtCr(d.wouldSave * 100 / d.percent)} is below ${QP.fmtCr(d.threshold)}` }));
    const vendorsUsed = Object.keys(per);
    if (vendorsUsed.length === 1 && !uncovered.length) risks.push({ sev: 'yellow', text: 'Single supplier: no backup if they have a problem' });
    if (uncovered.length) risks.push({ sev: 'red', text: `${uncovered.length} item${uncovered.length > 1 ? 's' : ''} not covered (line ${uncovered.join(', ')}) — need another supplier` });
    // open must-resolve issues on what this split actually uses: vendor-level ones, plus line ones on lines given to that vendor
    const openRed = m.flags.filter(f => f.open && f.sev === 'red' && per[f.vendor] && (f.line == null || per[f.vendor].lines.includes(f.line)));
    const assumptions = vendorsUsed.flatMap(id => per[id].assumptions.map(a => `${per[id].name} — ${a}`));
    const total = goods + freight - discount;
    return { assign, per, vendorsUsed, uncovered, covered: rfx.lines.length - uncovered.length, goods, freight, discount, total, incomplete,
      gst: (goods - discount) * rfx.gstRate, payImpact, payRate: rate, risks, lostDiscounts, openRed, assumptions,
      vsLastYear: lyCost ? { lines: lyLines, lastYear: lyCost, now: lyNow, pct: (lyNow - lyCost) / lyCost } : null };
  };

  // ---------- 3. Options ----------
  function cheapestAssign(m, ids, cost) {
    const assign = {};
    QP.state.rfx.lines.forEach(L => {
      let best = null;
      ids.forEach(id => { const c = m.vendors[id].cells[L.line]; if (!A.eligible(c)) return; const u = cost(id, c, L); if (best == null || u < best.u) best = { id, u }; });
      if (best) assign[L.line] = best.id;
    });
    return assign;
  }
  // Rank: complete before incomplete, more items covered first, then lowest total.
  const better = (a, b) => !b || (a.incomplete !== b.incomplete ? !a.incomplete : a.covered !== b.covered ? a.covered > b.covered : a.total < b.total);

  // Best split using at most these vendors: tries each "which discounts do we aim for" case,
  // assigns each item to the cheapest vendor after freight per box and that discount,
  // then tops up a vendor whose discount threshold was just missed. Every candidate is re-costed by evaluate().
  A.bestFor = function (m, ids) {
    const disc = {};
    ids.forEach(id => { const d = ((m.vendors[id].ex.commercial_terms || {}).discounts || []).find(x => x && x.percent && x.condition_type === 'annual_order_value_above' && QP.thresholdRupees(x)); if (d) disc[id] = { pct: d.percent / 100, thr: QP.thresholdRupees(d) }; });
    const fpb = {}; ids.forEach(id => { fpb[id] = freightPerBox(m.vendors[id]); });
    const dIds = Object.keys(disc);
    let best = null;
    for (let mask = 0; mask < (1 << dIds.length); mask++) {
      const aim = dIds.filter((_, i) => mask & (1 << i));
      const cost = (id, c) => c.value * (aim.includes(id) ? 1 - disc[id].pct : 1) + fpb[id];
      const assign = cheapestAssign(m, ids, cost);
      // top up: if a targeted vendor misses its threshold, move items to it, cheapest extra cost first
      aim.forEach(id => {
        const share = () => QP.state.rfx.lines.reduce((a, L) => a + (assign[L.line] === id ? m.vendors[id].cells[L.line].value * L.qty : 0), 0);
        if (share() > disc[id].thr) return;
        const moves = QP.state.rfx.lines.filter(L => assign[L.line] && assign[L.line] !== id && A.eligible(m.vendors[id].cells[L.line]))
          .map(L => { const cur = assign[L.line]; return { L, extra: (cost(id, m.vendors[id].cells[L.line]) - cost(cur, m.vendors[cur].cells[L.line])) * L.qty }; })
          .sort((a, b) => a.extra - b.extra);
        for (const mv of moves) { if (share() > disc[id].thr) break; assign[mv.L.line] = id; }
      });
      const ev = A.evaluate(m, assign);
      if (better(ev, best)) best = ev;
    }
    return best;
  };

  function pairs(ids) { const out = []; ids.forEach((a, i) => ids.slice(i + 1).forEach(b => out.push([a, b]))); return out; }

  // ids = vendors allowed in the award (qualified ones by default)
  A.buildOptions = function (m, ids) {
    const options = [];
    if (!ids.length) return options;
    // One vendor: every allowed vendor alone; show the best, keep the others for "compare"
    const singles = ids.map(id => { const assign = {}; QP.state.rfx.lines.forEach(L => { if (A.eligible(m.vendors[id].cells[L.line])) assign[L.line] = id; }); return A.evaluate(m, assign); });
    const singleBest = singles.reduce((b, x) => better(x, b) ? x : b, null);
    options.push({ key: 'single', title: `One vendor: ${singleBest.per[singleBest.vendorsUsed[0]].name}`, how: 'Every item to one vendor. Shown: the one with the lowest true cost among vendors who cover the most items.', ev: singleBest, others: singles.filter(s => s !== singleBest) });
    // Cheapest per line: the "obvious" answer — lowest unit price on each item, then the true cost is worked out
    const naive = A.evaluate(m, cheapestAssign(m, ids, (id, c) => c.value));
    options.push({ key: 'cheapest', title: 'Cheapest vendor on each item', how: 'Each item to the vendor with the lowest price per piece. Freight and discounts are then worked out for the volume each vendor actually gets.', ev: naive });
    // Best split, max 2 vendors
    if (ids.length >= 2) {
      let best = null;
      pairs(ids).forEach(p => { const ev = A.bestFor(m, p); if (ev.vendorsUsed.length === 2 && better(ev, best)) best = ev; });
      if (best) options.push({ key: 'split2', title: `Best split: ${best.vendorsUsed.map(id => best.per[id].name).join(' + ')}`, how: 'Every pair of vendors tried. Each item goes where it is cheapest after freight per box and any discount the pair can reach.', ev: best });
    }
    // lowest true cost (only among complete, full-coverage options)
    const ranked = options.filter(o => !o.ev.incomplete).sort((a, b) => b.ev.covered - a.ev.covered || a.ev.total - b.ev.total);
    if (ranked[0]) ranked[0].lowest = true;
    return options;
  };

  // Lines given to each vendor, as text: "Lines 1–6, 9, 12"
  A.ranges = function (lines) {
    const s = [...lines].sort((a, b) => a - b), out = [];
    for (let i = 0; i < s.length; i++) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; out.push(j > i ? `${s[i]}–${s[j]}` : `${s[i]}`); i = j; }
    return out.join(', ');
  };
})();
