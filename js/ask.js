// Ask AI engine (use case 3). Three steps, and only the first and last use the AI:
//   1. AI PLANS: turns the question into a few fixed operations (JSON). It sees item names and vendors, never prices.
//   2. CODE COMPUTES: runs the operations on the live, reviewed comparison data (same maths as Compare and Award).
//   3. AI WRITES 2–4 sentences from the computed results only; code checks every number in the text appears in the
//      results. If one doesn't, the plain code summary is shown instead.
window.QP = window.QP || {};

(function () {
  const K = QP.ask = {};
  const fmt = (n, d) => QP.fmt(n, d);
  QP.poss = n => n + (/s$/.test(n) ? "'" : "'s");
  const pct = x => (x > 0 ? '+' : '') + fmt(x * 100, 1) + '%';

  // ---------- prompts ----------
  K.PLAN_SYSTEM = `You are the analysis planner inside a procurement quote-comparison tool. A buyer asks a question about vendor quotations. You do NOT answer it and you do NOT calculate anything. You translate the question into a short plan of operations from the fixed list below; plain code runs them on the real data.

Rules:
- Use only the operations and fields listed. 1–3 steps. Prefer one step.
- Never invent vendors, items or numbers. Vendor ids are A–E as listed.
- "Cleared the quality questionnaire" / "qualified" = vendors that pass the must-pass rules → vendors.qualified_only = true.
- "Cheapest per line / item" award questions → award_options with methods ["cheapest"] (add "split2" and "single" when the buyer asks what is best overall or to compare).
- "What if" questions that change a price, exchange rate or freight, or treat a vendor as qualified → what_if. These are labelled scenarios, never real quotes. Never use what_if for a question that does not ask "what if".
- Questions about prices, costs or a chart of prices → line_prices or vendor_totals, never vendor_facts (vendor_facts is for terms, questionnaire answers, certificates and history only).
- "Last year", "2026", "current contract", "this year vs last year", "2026 vs 2027" → our 2026 contract price per item (one price per item, not each vendor's own 2026 price). Per vendor overall → vendor_totals measure "vs_last_year_pct"; per item → line_prices compare_to "last_year".
- Certificates, ISO, expiry, validity of documents → vendor_facts with "iso_9001" (and "test_report" if asked); add an issues step with severity "all" when the buyer asks about warnings or problems.
- If the question is genuinely ambiguous in a way that changes the result (e.g. which vendors, which items, which measure), set "clarify" with one short question and 2–4 short options, and give no steps. Do not ask back when a sensible default exists.
- If earlier turns are given, the new question may refer to them ("now only 5-ply", "same but exclude Deccan").
- Output JSON only.

Operations:
1. award_options { vendors: VF, methods: ["single"|"cheapest"|"split2"] } — whole-award options on true cost (prices + freight for the volume each vendor gets − conditional discounts only if met).
2. line_prices { lines: LF, vendors: VF, compare_to: "none"|"last_year", sort: "line"|"cheapest_saving_vs_last_year"|"price_spread", limit: number|null } — ₹/piece per item per vendor, cheapest vendor per item.
3. vendor_totals { lines: LF, vendors: VF, measure: "landed_total"|"items_value"|"like_for_like"|"vs_last_year_pct"|"items_quoted" } — one number per vendor, ranked.
4. vendor_facts { vendors: VF, fields: ["qualification","iso_9001","capacity","test_report","food_safe_inks","payment_days","validity","freight","lead_time","discounts","price_variation","history","open_issues","items_quoted"] }
5. issues { vendors: VF, severity: "red"|"yellow"|"all", status: "open"|"all" } — review issues found in the quotes.
6. what_if { changes: [ {type:"price_change_pct", vendor, lines: LF, pct} | {type:"fx_rate", currency:"USD", rate} | {type:"freight_per_box", vendor, rupees} | {type:"treat_as_qualified", vendor} | {type:"exclude_vendor", vendor} ], methods: ["single"|"cheapest"|"split2"] } — re-runs award_options with the changes.

VF (vendor filter): { ids: [ids]|null, qualified_only: boolean, exclude: [ids]|null, min_on_time_pct: number|null, max_rejection_pct: number|null }
LF (line filter): { lines: [line numbers]|null, ply: [3|5|7]|null, plant: ["Ranjangaon"|"Jejuri"|"Sinnar"]|null, text: string|null, new_items_only: boolean, quoted_by_all: boolean }  — use {} for all items.`;

  K.PLAN_SCHEMA = `Return JSON: { "understood": string (one plain sentence restating the question), "clarify": null | { "question": string, "options": [string] }, "steps": [ { "op": string, ...params } ] }`;

  K.WRITE_SYSTEM = `You write the answer to a procurement buyer's question, using ONLY the computed results provided. Rules:
- 2–4 short sentences, plain Indian business English, lead with the direct answer.
- Every number you write must be copied exactly as it appears in the results (same rounding and units, e.g. "₹3.73 cr", "₹41.4 L", "27/30" for 27 of 30 items). Do not calculate, round differently or add numbers of your own.
- Only if the results are marked SCENARIO, call it a what-if scenario. Otherwise never use the words "scenario" or "what-if".
- Answer exactly what was asked; if the results show the question assumed something the data does not have, say so plainly in one sentence. Do not recommend beyond what the results show.
- caveats: up to 3 short points the buyer should know (only from the results' notes). Output JSON only: { "answer": string, "caveats": [string] }`;

  // ---------- context for the planner (no prices) ----------
  function planContext(m, history) {
    const q = QP.award.qualify(m), R = QP.state.rfx;
    const vend = QP.VENDORS.map(V => { const vo = m.vendors[V.id], h = QP.VENDOR_HISTORY[V.id];
      return `${V.id} = ${V.name} (${V.status2026 === 'Incumbent' ? 'current supplier' : 'new'}; ${vo.processed ? `reply read, ${vo.totals.quoted}/${QP.state.rfx.lines.length} items quoted, ${q[V.id].pass ? 'qualifies' : 'fails must-pass'}` : 'reply not read yet'}${h ? `; history on-time ${Math.round(h.onTime * 100)}%, rejection ${(h.rejection * 100).toFixed(1)}%` : '; no history'})`; }).join('\n');
    const lines = R.lines.map(L => `${L.line} | ${L.desc} | ${L.ply}-ply | ${L.plant.split(' ')[0]}${L.lastYear ? '' : ' | new item'}`).join('\n');
    const prev = (history || []).slice(-3).map((t, i) => `Earlier question ${i + 1}: ${t.q}\nPlan used: ${JSON.stringify(t.plan && t.plan.steps || [])}`).join('\n');
    return `VENDORS:\n${vend}\n\nITEMS (line | item | ply | plant):\n${lines}\n\nMust-pass rules: ${QP.award.mustPassList().filter(r => r.on).map(r => r.label).join('; ')}.${prev ? '\n\n' + prev : ''}`;
  }

  // ---------- filters ----------
  function vendorIds(m, vf = {}, q, extraQualified = []) {
    vf = vf || {};
    const notes = [];
    let ids = QP.VENDORS.map(v => v.id).filter(id => m.vendors[id].processed);
    const unread = QP.VENDORS.filter(v => !m.vendors[v.id].processed).map(v => v.name);
    if (unread.length) notes.push(`Not read yet, so not included: ${unread.join(', ')}.`);
    if (vf.ids && vf.ids.length) ids = ids.filter(id => vf.ids.includes(id));
    if (vf.exclude && vf.exclude.length) ids = ids.filter(id => !vf.exclude.includes(id));
    if (vf.qualified_only) {
      const out = ids.filter(id => !q[id].pass && !extraQualified.includes(id));
      if (out.length) notes.push(`Left out for failing must-pass rules: ${out.map(id => `${m.vendors[id].name} (${q[id].failed.map(f => f.rule.label).join(', ')})`).join('; ')}.`);
      ids = ids.filter(id => q[id].pass || extraQualified.includes(id));
    }
    if (vf.min_on_time_pct != null || vf.max_rejection_pct != null) {
      const out = [];
      ids = ids.filter(id => { const h = QP.VENDOR_HISTORY[id];
        const ok = h && (vf.min_on_time_pct == null || h.onTime * 100 >= vf.min_on_time_pct) && (vf.max_rejection_pct == null || h.rejection * 100 <= vf.max_rejection_pct);
        if (!ok) out.push(m.vendors[id].name + (h ? '' : ' (no history with us)')); return ok; });
      if (out.length) notes.push(`Left out by the history filter: ${out.join(', ')}.`);
    }
    return { ids, notes };
  }
  function lineSet(lf = {}, m, ids) {
    lf = lf || {};
    return QP.state.rfx.lines.filter(L =>
      (!lf.lines || !lf.lines.length || lf.lines.includes(L.line)) &&
      (!lf.ply || !lf.ply.length || lf.ply.map(Number).includes(L.ply)) &&
      (!lf.plant || !lf.plant.length || lf.plant.some(p => L.plant.toLowerCase().includes(String(p).toLowerCase()))) &&
      (!lf.text || (L.desc + ' ' + (L.use || '')).toLowerCase().includes(String(lf.text).toLowerCase())) &&
      (!lf.new_items_only || !L.lastYear) &&
      (!lf.quoted_by_all || ids.every(id => QP.award.eligible(m.vendors[id].cells[L.line]))));
  }
  function describeLines(lf, n) {
    lf = lf || {}; const p = [];
    if (lf.lines && lf.lines.length) p.push('lines ' + lf.lines.join(', '));
    if (lf.ply && lf.ply.length) p.push(lf.ply.join('/') + '-ply');
    if (lf.plant && lf.plant.length) p.push(lf.plant.join('/') + ' plant');
    if (lf.text) p.push(`“${lf.text}”`);
    if (lf.new_items_only) p.push('new items');
    if (lf.quoted_by_all) p.push('items every vendor quoted');
    return (p.length ? p.join(', ') : 'all items') + ` (${n} item${n === 1 ? '' : 's'})`;
  }
  const vname = (m, id) => m.vendors[id] ? m.vendors[id].name : id;

  // ---------- operations ----------
  function awardResult(m, ids, methods, q, notes, label) {
    const all = QP.award.buildOptions(m, ids);
    const want = (methods && methods.length ? methods : ['single', 'cheapest', 'split2']);
    const opts = all.filter(o => want.includes(o.key));
    if (want.includes('split2') && ids.length < 2) notes.push('A 2-vendor split needs at least two vendors.');
    const rows = opts.map(o => ({ Option: o.title, 'Landed total (before GST)': QP.fmtCr(o.ev.total) + (o.ev.incomplete ? ' + unknown freight' : ''), Items: QP.fmtCr(o.ev.goods), Freight: o.ev.freight ? QP.fmtL(o.ev.freight) : 'included', Discount: o.ev.discount ? '−' + QP.fmtL(o.ev.discount) : '—', Coverage: `${o.ev.covered}/${QP.state.rfx.lines.length}`, 'Who gets what': Object.values(o.ev.per).map(p => `${p.name}: ${p.lines.length} items`).join('; '), 'Open must-resolve': o.ev.openRed.length }));
    const facts = opts.map(o => { const e = o.ev;
      return `${o.title}: landed total ${QP.fmtCr(e.total)}${e.incomplete ? ' (incomplete: freight unknown)' : ''} = items ${QP.fmtCr(e.goods)} + freight ${QP.fmtL(e.freight)} − discount ${QP.fmtL(e.discount)}; covers ${e.covered}/${QP.state.rfx.lines.length} items; split: ${Object.values(e.per).map(p => `${p.name} ${p.lines.length} items ${QP.fmtCr(p.goods)}${p.freight.amount ? ` freight ${QP.fmtL(p.freight.amount)}` : ''}${p.discount ? ` discount ${QP.fmtL(p.discount)}` : ''}`).join(', ')}${e.vsLastYear ? `; prices ${pct(e.vsLastYear.pct)} vs last year on ${e.vsLastYear.lines} continuing items` : ''}${e.lostDiscounts.length ? `; loses ${e.lostDiscounts.map(d => `${QP.poss(d.name)} ${d.percent}% discount (${QP.fmtL(d.wouldSave)})`).join(', ')}` : ''}${e.openRed.length ? `; ${e.openRed.length} must-resolve issues open` : ''}${o.lowest ? '; LOWEST true cost' : ''}.`; });
    // detail table: who gets each item (for the cheapest / split options)
    const detail = opts.filter(o => o.key !== 'single').slice(0, 1).map(o => ({ title: `Who gets each item — ${o.title}`, rows: QP.state.rfx.lines.map(L => { const id = o.ev.assign[L.line]; const c = id && m.vendors[id].cells[L.line];
      return { Line: L.line, Item: L.desc, Plant: L.plant.split(' ')[0], 'Qty/yr': L.qty, Vendor: id ? vname(m, id) : 'not covered', '₹/pc': c ? fmt(c.value) : '—', 'Last year ₹/pc': L.lastYear ? fmt(L.lastYear) : 'new' }; }) }));
    const low = opts.find(o => o.lowest);
    const summary = opts.map(o => `${o.title}: ${QP.fmtCr(o.ev.total)}${o.ev.incomplete ? ' + unknown freight' : ''}${o.ev.freight ? ` (incl. freight ${QP.fmtL(o.ev.freight)})` : ''}`).join('; ') + '.' + (low ? ` Lowest true cost: ${low.title}.` : '');
    return { title: label || 'Award options on true cost', vendors: ids, rows, facts, notes, summary,
      chart: { label: 'Landed total, ₹ crore (before GST)', bars: opts.filter(o => !o.ev.incomplete).map(o => ({ label: o.title, value: o.ev.total / 1e7, text: QP.fmtCr(o.ev.total), hl: o.lowest })) },
      extra: detail, method: `Vendors: ${ids.map(id => vname(m, id)).join(', ') || 'none'}. Options: ${opts.map(o => o.title).join(' · ')}. ${opts.map(o => o.how).join(' ')} Freight is recalculated for the boxes each vendor gets; a conditional discount counts only if the option meets it. Your own estimates are never awarded.` };
  }

  const OPS = {
    award_options(m, s, q) {
      const { ids, notes } = vendorIds(m, s.vendors, q);
      if (!(s.vendors && s.vendors.qualified_only) && ids.some(id => !q[id].pass)) notes.push(`Includes vendors that fail must-pass rules (${ids.filter(id => !q[id].pass).map(id => vname(m, id)).join(', ')}) because the question did not limit to qualified vendors. The Award screen never awards them.`);
      return awardResult(m, ids, s.methods, q, notes);
    },
    line_prices(m, s, q) {
      const { ids, notes } = vendorIds(m, s.vendors, q);
      let L = lineSet(s.lines, m, ids);
      const rows = L.map(Ln => { const r = { Line: Ln.line, Item: Ln.desc, Plant: Ln.plant.split(' ')[0], Ply: Ln.ply, 'Qty/yr': Ln.qty };
        let best = null, worst = null;
        ids.forEach(id => { const c = m.vendors[id].cells[Ln.line]; const ok = QP.award.eligible(c);
          r[vname(m, id)] = ok ? fmt(c.value) : c.estimate ? `${fmt(c.value)} (your est.)` : ({ not_quoted: 'not quoted', unreadable: 'unreadable', reference: '“same as last yr”' }[c.status] || '—');
          if (ok && (!best || c.value < best.v)) best = { id, v: c.value }; if (ok && (!worst || c.value > worst.v)) worst = { id, v: c.value }; });
        r.Cheapest = best ? `${vname(m, best.id)} ${fmt(best.v)}` : '—';
        if (s.compare_to === 'last_year' || s.sort === 'cheapest_saving_vs_last_year') { r['Last year'] = Ln.lastYear ? fmt(Ln.lastYear) : 'new'; r['Cheapest vs last year'] = best && Ln.lastYear ? pct((best.v - Ln.lastYear) / Ln.lastYear) : '—'; }
        r._best = best; r._spread = best && worst ? (worst.v - best.v) / best.v : 0; r._sav = best && Ln.lastYear ? (best.v - Ln.lastYear) / Ln.lastYear : 0; r._ly = Ln.lastYear; return r; });
      if (s.sort === 'price_spread') { rows.sort((a, b) => b._spread - a._spread); rows.forEach(r => { r['Spread'] = pct(r._spread); }); }
      if (s.sort === 'cheapest_saving_vs_last_year') rows.sort((a, b) => a._sav - b._sav);
      const shown = s.limit ? rows.slice(0, s.limit) : rows;
      const wins = {}; shown.forEach(r => { if (r._best) wins[r._best.id] = (wins[r._best.id] || 0) + 1; });
      const facts = [`${describeLines(s.lines, L.length)}; showing ${shown.length}.`, `Cheapest vendor by number of items: ${Object.entries(wins).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${vname(m, id)} ${n}`).join(', ') || 'none'}.`,
        ...shown.slice(0, 12).map(r => `Line ${r.Line} ${r.Item} (${r.Plant}): cheapest ${r.Cheapest}${r['Last year'] ? `, last year ${r['Last year']}, ${r['Cheapest vs last year']}` : ''}${r.Spread ? `, spread ${r.Spread}` : ''}.`)];
      if (L.some(Ln => ids.some(id => m.vendors[id].cells[Ln.line].estimate))) notes.push('Your own estimates are shown as “your est.” and never count as cheapest.');
      shown.forEach(r => { delete r._best; delete r._spread; delete r._sav; delete r._ly; });
      return { title: 'Prices per item (₹ per piece, before GST and freight)', rows: shown, facts, notes, summary: facts.slice(0, 2).join(' '),
        chart: Object.keys(wins).length ? { label: 'Items where each vendor is cheapest', bars: Object.entries(wins).map(([id, n]) => ({ label: vname(m, id), value: n, text: String(n) })) } : null,
        method: `Items: ${describeLines(s.lines, L.length)}. Vendors: ${ids.map(id => vname(m, id)).join(', ')}. ₹ per piece after the unit / currency / GST conversions shown in Compare; cheapest uses vendor prices only.` };
    },
    vendor_totals(m, s, q) {
      const { ids, notes } = vendorIds(m, s.vendors, q);
      const L = lineSet(s.lines, m, ids), allLines = L.length === QP.state.rfx.lines.length;
      const measure = s.measure || 'landed_total';
      let landedNote = false;
      const rows = ids.map(id => { const vo = m.vendors[id];
        let val = 0, n = 0, ly = 0, now = 0;
        L.forEach(Ln => { const c = vo.cells[Ln.line]; if (!QP.award.eligible(c)) return; val += c.value * Ln.qty; n++; if (Ln.lastYear) { ly += Ln.lastYear * Ln.qty; now += c.value * Ln.qty; } });
        let v, txt;
        if (measure === 'landed_total' && allLines) { v = vo.landed.total; txt = v == null ? 'incomplete (freight unknown)' : QP.fmtCr(v); }
        else if (measure === 'like_for_like') { v = vo.totals.likeForLike; txt = QP.fmtCr(v); }
        else if (measure === 'vs_last_year_pct') { v = ly ? (now - ly) / ly * 100 : null; txt = v == null ? '—' : pct(v / 100); }
        else if (measure === 'items_quoted') { v = n; txt = `${n}/${L.length}`; }
        else { if (measure === 'landed_total') landedNote = true; v = val; txt = QP.fmtCr(val); }
        if (measure === 'vs_last_year_pct') return { id, v, Vendor: vo.name, Value: txt, 'Items priced': `${n}/${L.length}`, now, ly };
        return { id, v, Vendor: vo.name, Value: txt, 'Items priced': `${n}/${L.length}` }; });
      if (landedNote) notes.push('Landed total (with freight and discounts) exists only for the whole RFx; for a subset of items the items value is shown.');
      if (measure === 'like_for_like') notes.push(`Fair comparison uses only the ${m.likeForLikeLines.length} items every vendor quoted.`);
      if (rows.some(r => r['Items priced'].split('/')[0] !== r['Items priced'].split('/')[1]) && measure !== 'items_quoted') notes.push('Vendors that did not price every item have lower totals partly because items are missing — check “Items priced”.');
      const asc = measure !== 'items_quoted';
      rows.sort((a, b) => a.v == null ? 1 : b.v == null ? -1 : asc ? a.v - b.v : b.v - a.v);
      const mlabel = { landed_total: 'Landed total', items_value: 'Items value', like_for_like: 'Fair comparison total', vs_last_year_pct: 'Prices vs last year', items_quoted: 'Items quoted' }[measure];
      if (measure === 'vs_last_year_pct') {
        // 2027 quote vs the SAME items at what we paid on the 2026 contract. "Last year" is our own contract price per item,
        // not each vendor's own 2026 price (we only have a 2026 price for the items we bought last year).
        notes.push('“Last year / 2026” is what we paid on our 2026 contract for each item — one price per item, not each vendor’s own 2026 price. New items have no 2026 price and are left out of this comparison.');
        const nNew = L.filter(Ln => !Ln.lastYear).length;
        const lab = r => `${r.Vendor}`;
        return { title: `2027 quotes vs our 2026 contract prices — ${describeLines(s.lines, L.length - nNew)}`,
          rows: rows.map(r => ({ Vendor: r.Vendor, '2027 quote (same items)': r.ly ? QP.fmtCr(r.now) : '—', 'At our 2026 contract price': r.ly ? QP.fmtCr(r.ly) : '—', Change: r.Value, 'Items priced': r['Items priced'] })),
          facts: rows.map((r, i) => `${i + 1}. ${r.Vendor}: 2027 quote ${r.ly ? QP.fmtCr(r.now) : '—'} vs ${r.ly ? QP.fmtCr(r.ly) : '—'} for the same items at our 2026 contract price, change ${r.Value} (${r['Items priced']} items priced).`),
          notes, summary: rows.map(r => `${r.Vendor} ${r.Value}`).join('; ') + ' vs our 2026 contract prices.',
          chart: { label: '₹ crore before GST — dark: 2027 quote · grey: same items at our 2026 contract price', bars: rows.filter(r => r.ly).flatMap(r => [
            { label: lab(r) + ' — 2027 quote', value: r.now / 1e7, text: QP.fmtCr(r.now) + ' (' + r.Value + ')' },
            { label: lab(r) + ' — 2026 contract price', value: r.ly / 1e7, text: QP.fmtCr(r.ly), alt: true }]) },
          method: `For each vendor: Σ (2027 ₹ per piece × annual quantity) over the continuing items it priced, compared with Σ (our 2026 contract ₹ per piece × the same quantity) for exactly the same items. Your estimates are excluded.` };
      }
      return { title: `${mlabel} by vendor — ${describeLines(s.lines, L.length)}`, rows: rows.map(r => ({ Vendor: r.Vendor, [mlabel]: r.Value, 'Items priced': r['Items priced'] })),
        facts: rows.map((r, i) => `${i + 1}. ${r.Vendor}: ${r.Value} (${r['Items priced']} items priced).`), notes, summary: rows.slice(0, 3).map(r => `${r.Vendor} ${r.Value} (${r['Items priced']})`).join('; ') + '.',
        chart: { label: mlabel + (measure === 'vs_last_year_pct' ? ' (%)' : measure === 'items_quoted' ? '' : ', ₹ crore'), bars: rows.filter(r => r.v != null).map(r => ({ label: r.Vendor, value: measure.match(/pct|quoted/) ? r.v : r.v / 1e7, text: r.Value })) },
        method: `${mlabel} for ${describeLines(s.lines, L.length)}: Σ (₹ per piece × annual quantity) over items the vendor priced${measure === 'landed_total' && allLines ? ', + freight − conditional discount when its condition is met' : ''}. Your estimates are excluded.` };
    },
    vendor_facts(m, s, q) {
      const { ids, notes } = vendorIds(m, s.vendors, q);
      const F = (s.fields && s.fields.length) ? s.fields : ['qualification', 'payment_days', 'freight', 'capacity', 'history', 'open_issues'];
      const get = (id, f) => { const vo = m.vendors[id], ex = vo.ex || {}, t = ex.commercial_terms || {}, qq = ex.questionnaire || {};
        switch (f) {
          case 'qualification': return q[id].pass ? 'Qualifies' : 'Fails: ' + q[id].failed.map(x => x.rule.label + ' (' + x.text + ')').join('; ');
          case 'iso_9001': { const r = QP.award.RULES.iso_9001.check(ex, vo, m);
            return r.text + (r.note ? ' — ' + r.note.toUpperCase() : '') + (!r.pass && /expired/i.test(r.text) ? ' — EXPIRED BEFORE THE CONTRACT STARTS' : ''); }
          case 'capacity': return qq.monthly_capacity && qq.monthly_capacity.boxes_per_month ? fmt(qq.monthly_capacity.boxes_per_month, 0) + '/month' : QP.NOT_MENTIONED;
          case 'test_report': return QP.qLabel('test_report', qq.test_report || {}, ex).text;
          case 'food_safe_inks': return QP.qLabel('food_safe_inks', qq.food_safe_inks || {}, ex).text;
          case 'payment_days': return t.payment && t.payment.days != null ? t.payment.days + ' days' : QP.NOT_MENTIONED;
          case 'validity': return t.validity && t.validity.stated ? (t.validity.text || t.validity.days + ' days') : QP.NOT_MENTIONED;
          case 'freight': return vo.freight ? vo.freight.text : '—';
          case 'lead_time': return t.lead_time && t.lead_time.stated ? (t.lead_time.text || t.lead_time.days + ' days') : QP.NOT_MENTIONED;
          case 'discounts': return (t.discounts || []).map(d => d.text).join('; ') || 'none';
          case 'price_variation': return t.price_variation_clause && t.price_variation_clause.present ? 'Yes — ' + (t.price_variation_clause.text || '') : 'Fixed prices';
          case 'history': { const h = QP.VENDOR_HISTORY[id]; return h ? `On-time ${Math.round(h.onTime * 100)}%, rejection ${(h.rejection * 100).toFixed(1)}%, ${h.complaints} complaints (${h.note})` : 'No history with us'; }
          case 'open_issues': return `${vo.openRed} must-resolve, ${vo.openYellow} worth a look`;
          case 'items_quoted': return `${vo.totals.quoted}/${QP.state.rfx.lines.length}` + (vo.extraItems && vo.extraItems.length ? ` (+${vo.extraItems.length} items not in our RFx, not compared)` : '');
          default: return '—';
        } };
      const LBL = { qualification: 'Qualification', iso_9001: 'ISO 9001', capacity: 'Capacity', test_report: 'Test report', food_safe_inks: 'Food-safe inks', payment_days: 'Payment', validity: 'Validity', freight: 'Freight', lead_time: 'Lead time', discounts: 'Discounts', price_variation: 'Price variation', history: 'History with us', open_issues: 'Open issues', items_quoted: 'Items quoted' };
      const rows = ids.map(id => { const r = { Vendor: vname(m, id) }; F.forEach(f => { r[LBL[f] || f] = get(id, f); }); return r; });
      if (F.includes('history')) notes.push('History is our own record for current suppliers only; it does not change any rupee total.');
      const R = QP.state.rfx;
      if (F.includes('iso_9001')) {
        const exp = ids.filter(id => /EXPIRES DURING THE CONTRACT/.test(get(id, 'iso_9001'))).map(id => vname(m, id));
        rows.forEach(r => { r[LBL.iso_9001] = r[LBL.iso_9001].replace(' — EXPIRES DURING THE CONTRACT', ' — expires during the contract').replace(' — EXPIRED BEFORE THE CONTRACT STARTS', ' — expired before the contract starts'); });
        notes.push(`Contract period: ${R.periodStart && R.contractEnd ? R.periodStart + ' to ' + R.contractEnd : (R.period || 'not stated')}. ISO certificate expiring during the contract: ${exp.length ? exp.join(', ') : 'none of the vendors read'}.`);
      }
      return { title: 'Vendor facts', rows, facts: rows.map(r => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join('; ') + '.'), notes, chart: null,
        method: `Read from each vendor's extracted reply (questionnaire, terms, attachments) and our supplier history. Every value links to its source in Compare → Questionnaire.` };
    },
    issues(m, s, q) {
      const { ids, notes } = vendorIds(m, s.vendors, q);
      const fl = m.flags.filter(f => ids.includes(f.vendor) && (s.severity === 'all' || !s.severity || (s.severity === 'red' ? f.sev === 'red' : f.sev === 'yellow')) && (s.status === 'all' || f.open));
      const rows = fl.map(f => ({ Vendor: vname(m, f.vendor), Level: f.sev === 'red' ? '🔴 must resolve' : '🟡 worth a look', Issue: f.title, Line: f.line ?? '', Status: f.open ? (f.decision && f.decision.action === 'ask' ? 'Waiting for vendor' : 'Open') : 'Resolved' }));
      const by = {}; fl.forEach(f => { by[f.vendor] = (by[f.vendor] || 0) + 1; });
      return { title: 'Issues found in the quotes', rows, facts: [`${fl.length} issues match.`, ...ids.map(id => `${vname(m, id)}: ${by[id] || 0}.`)], notes,
        chart: { label: 'Issues per vendor', bars: ids.map(id => ({ label: vname(m, id), value: by[id] || 0, text: String(by[id] || 0) })) },
        method: 'Issues raised by the plain-code rules in Review Issues (missing items, unreadable values, conversions, missing terms, must-pass evidence), with your decisions.' };
    },
    what_if(m, s, q) {
      // Work on a copy: the real data and decisions are never changed by a scenario.
      const real = QP.state, copy = JSON.parse(JSON.stringify(real)), applied = [], extraQ = [], excl = [];
      (s.changes || []).forEach(c => {
        if (c.type === 'fx_rate' && c.rate) { copy.rfx.fxRates[c.currency || 'USD'] = Number(c.rate); applied.push(`${c.currency || 'USD'} at ₹${fmt(c.rate)} instead of ₹${fmt(real.rfx.fxRates[c.currency || 'USD'])}`); }
        if (c.type === 'freight_per_box' && c.vendor && copy.vendors[c.vendor] && copy.vendors[c.vendor].extraction) { copy.vendors[c.vendor].extraction.commercial_terms.freight = { basis: 'extra_amount_stated', amount: Number(c.rupees), currency: 'INR', per: 'box', text: 'scenario' }; applied.push(`${vname(m, c.vendor)} freight ₹${fmt(c.rupees)} per box`); }
        if (c.type === 'treat_as_qualified' && c.vendor) { extraQ.push(c.vendor); applied.push(`${vname(m, c.vendor)} treated as qualified`); }
        if (c.type === 'exclude_vendor' && c.vendor) { excl.push(c.vendor); applied.push(`${vname(m, c.vendor)} excluded`); }
      });
      let m2;
      try { QP.state = copy; m2 = QP.compute(); } finally { QP.state = real; }
      (s.changes || []).filter(c => c.type === 'price_change_pct' && c.vendor && m2.vendors[c.vendor]).forEach(c => {
        const L = lineSet(c.lines, m2, [c.vendor]);
        L.forEach(Ln => { const cell = m2.vendors[c.vendor].cells[Ln.line]; if (cell.value != null) cell.value = cell.value * (1 + Number(c.pct) / 100); });
        applied.push(`${vname(m, c.vendor)} prices ${c.pct > 0 ? '+' : ''}${c.pct}% on ${describeLines(c.lines, L.length)}`);
      });
      const vf = Object.assign({ qualified_only: true }, s.vendors || {}); vf.exclude = (vf.exclude || []).concat(excl);
      let ids, notes;
      try { QP.state = copy; ({ ids, notes } = vendorIds(m2, vf, q, extraQ)); } finally { QP.state = real; }
      let r;
      try { QP.state = copy; r = awardResult(m2, ids, s.methods, q, notes, 'Scenario — not real quotes'); } finally { QP.state = real; }
      r.scenario = applied;
      r.summary = `In this what-if (${applied.join('; ')}): ${r.summary}`;
      r.facts.unshift(`SCENARIO (what-if, not real quotes): ${applied.join('; ') || 'no change applied'}.`);
      const base = QP.award.buildOptions(m, vendorIds(m, { qualified_only: true }, q).ids);
      r.facts.push('For reference, without the changes: ' + base.filter(o => !s.methods || !s.methods.length || s.methods.includes(o.key)).map(o => `${o.title} ${QP.fmtCr(o.ev.total)}`).join('; ') + '.');
      r.method = `Scenario applied to a copy of the data (${applied.join('; ')}); then the same award calculation. ${r.method}`;
      return r;
    }
  };
  K.OPS = OPS;

  function stepText(s) {
    const names = { award_options: 'Award options on true cost', line_prices: 'Prices per item', vendor_totals: 'Totals by vendor', vendor_facts: 'Vendor facts', issues: 'Issues', what_if: 'What-if scenario' };
    return names[s.op] || s.op;
  }

  K.run = function (plan) {
    const m = QP.model || QP.compute(), q = QP.award.qualify(m);
    return (plan.steps || []).slice(0, 3).map(s => {
      const fn = OPS[s.op];
      if (!fn) return { title: stepText(s), error: `The AI asked for an operation that does not exist (“${s.op}”). Nothing was computed for it.` };
      try { return Object.assign(fn(m, s, q), { op: s.op, stepName: stepText(s) }); }
      catch (e) { console.error(e); return { title: stepText(s), error: 'This step could not be computed: ' + e.message }; }
    });
  };

  // ---------- number check ----------
  const nums = t => (String(t).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => x.replace(/,/g, '').replace(/^0+(?=\d)/, ''));
  K.checkNumbers = function (text, sourceText) {
    const R = QP.state.rfx || {};
    const allowed = new Set(nums(sourceText + ' ' + (R.title || '') + ' ' + (R.period || '') + ' ' + (R.id || '')));
    return nums(text).filter(n => !allowed.has(n) && !(Number(n) <= 10 && /^\d+$/.test(n)));
  };

  // ---------- the whole flow ----------
  K.ask = async function (question, history, { signal, onStatus } = {}) {
    const m = QP.model, t0 = Date.now();
    onStatus && onStatus('AI is planning the steps…');
    const p = await QP.callAI({ system: K.PLAN_SYSTEM, parts: [{ type: 'text', text: planContext(m, history) + `\n\nBUYER'S QUESTION: ${question}\n\n` + K.PLAN_SCHEMA }], json: true, maxTokens: 2048, signal, onStatus });
    const plan = p.data || {};
    const turn = { q: question, plan, at: new Date().toISOString(), models: [p.model], timing: {} };
    if (plan.clarify && plan.clarify.question && !(plan.steps || []).length) { turn.clarify = plan.clarify; turn.timing.totalMs = Date.now() - t0; return turn; }
    onStatus && onStatus('Code is computing on the live data…');
    turn.results = K.run(plan);
    const facts = turn.results.map((r, i) => `RESULT ${i + 1} — ${r.title}\n${r.error ? 'ERROR: ' + r.error : (r.facts || []).join('\n')}${r.notes && r.notes.length ? '\nNotes: ' + r.notes.join(' ') : ''}`).join('\n\n');
    turn.codeSummary = turn.results.map(r => r.error ? r.error : r.summary || `${r.title}: see the table below.`).join(' ');
    onStatus && onStatus('AI is writing the answer…');
    try {
      const w = await QP.callAI({ system: K.WRITE_SYSTEM, parts: [{ type: 'text', text: `BUYER'S QUESTION: ${question}\nPLAN: ${plan.understood || ''}\n\nCOMPUTED RESULTS (the only source of numbers):\n${facts}` }], json: true, maxTokens: 1024, signal, onStatus });
      turn.models.push(w.model);
      const ans = (w.data && w.data.answer) || '';
      const cav = ((w.data && w.data.caveats) || []).slice(0, 3);
      const bad = K.checkNumbers(ans + ' ' + cav.join(' '), facts + ' ' + question);
      const hasScenario = turn.results.some(r => r.scenario);
      const fakeScenario = !hasScenario && /\b(what[- ]if|scenario)\b/i.test(ans);
      if (ans && !bad.length && !fakeScenario) { turn.answer = ans; turn.aiCaveats = cav; turn.check = 'ok'; }
      else if (fakeScenario) { turn.answer = turn.codeSummary; turn.check = 'scenario_word'; }
      else { turn.answer = turn.codeSummary; turn.check = ans ? 'mismatch' : 'empty'; turn.badNumbers = bad; }
    } catch (e) {
      if (e.cancelled) throw e;
      turn.answer = turn.codeSummary; turn.check = 'ai_busy';
    }
    turn.timing.totalMs = Date.now() - t0;
    return turn;
  };
})();
