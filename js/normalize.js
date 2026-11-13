// Plain-code normalization and checks. No AI here: every number is computed by fixed rules the buyer can see.
// Output: ₹ per piece, before GST, before freight and before conditional discounts.
window.QP = window.QP || {};

(function () {
  const fmt = (n, d = 2) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  QP.fmt = fmt;
  QP.fmtRs = (n, d = 2) => n == null || isNaN(n) ? '—' : '₹' + fmt(n, d);
  QP.fmtCr = n => n == null ? '—' : '₹' + (n / 1e7).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' cr';
  QP.fmtL = n => n == null ? '—' : '₹' + (n / 1e5).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' L';

  const UNUSUAL = 0.30;      // ±30% from other vendors / last year
  const WEIGHT_TOL = 0.10;   // ±10% box weight

  function median(a) {
    const s = a.filter(x => x != null).sort((x, y) => x - y);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Convert one extracted price to ₹/piece excl. GST. Returns { value, steps[], problems[], converted:{unit,currency,gst,perKg} }
  function convert(raw, rfxLine, rfx) {
    const steps = [], problems = [], converted = {};
    let v = raw.price_value;
    if (v == null || isNaN(v)) return { value: null, steps, problems: ['No number'], converted };
    let cur = (raw.currency || 'INR').toUpperCase();
    const basis = raw.price_basis;
    const label = `${cur === 'INR' ? '₹' : cur + ' '}${fmt(v, v < 1 ? 3 : 2)}`;

    if (basis === 'per_piece') { steps.push(`${label} per piece`); }
    else if (basis === 'per_100') { steps.push(`${label} per 100 pcs ÷ 100`); v = v / 100; converted.unit = 'per 100'; }
    else if (basis === 'per_1000') { steps.push(`${label} per 1,000 pcs ÷ 1,000`); v = v / 1000; converted.unit = 'per 1,000'; }
    else if (basis === 'per_kg') {
      if (!rfxLine.weightG) { problems.push('Priced per kg but this RFx line has no box weight'); return { value: null, steps, problems, converted }; }
      steps.push(`${label} per kg × ${rfxLine.weightG} g spec weight`);
      v = v * rfxLine.weightG / 1000; converted.perKg = true;
    } else {
      problems.push(`Price basis not clear ("${raw.price_basis_text || 'unknown'}")`);
      return { value: null, steps, problems, converted };
    }

    if (cur !== 'INR') {
      const fx = rfx.fxRates[cur];
      if (!fx) { problems.push(`No exchange rate set in the RFx for ${cur}`); return { value: null, steps, problems, converted }; }
      steps.push(`× ₹${fmt(fx)} per ${cur} (RFx rate)`);
      v = v * fx; converted.currency = cur;
    }
    if (raw.includes_gst === true) {
      steps.push(`÷ ${1 + rfx.gstRate} to remove ${rfx.gstRate * 100}% GST`);
      v = v / (1 + rfx.gstRate); converted.gst = true;
    }
    v = Math.round(v * 10000) / 10000;
    steps.push(`= ₹${fmt(v, 3)} per piece`);
    return { value: v, steps, problems, converted };
  }

  function srcOf(x) { return x && x.source ? x.source : (x && x.file ? x : null); }

  QP.compute = function () {
    const S = QP.state, rfx = S.rfx;
    const decisions = S.decisions || {};
    const monthlyNeed = Math.round(rfx.lines.reduce((a, l) => a + l.qty, 0) / 12);
    const contractEnd = rfx.contractEnd;
    const out = { vendors: {}, flags: [], monthlyNeed, processedIds: [] };

    // ---------- pass 1: per-vendor cells ----------
    QP.VENDORS.forEach(V => {
      const vs = S.vendors[V.id];
      const ex = vs && vs.extraction;
      const vo = { id: V.id, name: V.name, status: vs ? vs.status : 'not_responded', processed: !!ex, cells: {}, flags: [], ex };
      out.vendors[V.id] = vo;
      if (!ex) return;
      out.processedIds.push(V.id);

      const byLine = {};
      (ex.lines || []).forEach(l => { if (l && l.rfx_line != null) { (byLine[l.rfx_line] = byLine[l.rfx_line] || []).push(l); } });
      const nq = {};
      (ex.not_quoted || []).forEach(n => { if (n && n.rfx_line != null) nq[n.rfx_line] = n; });

      rfx.lines.forEach(L => {
        const entries = byLine[L.line] || [];
        const e = entries[0];
        const cell = { line: L.line, status: 'missing', value: null, aiValue: null, badges: [], steps: [], source: null, raw: e || null, flagIds: [] };
        if (entries.length > 1) cell.duplicate = entries;
        if (e) {
          cell.source = srcOf(e);
          cell.clarity = e.clarity;
          if (e.price_status === 'quoted' && e.price_value != null && e.clarity !== 'unreadable') {
            const c = convert(e, L, rfx);
            cell.steps = c.steps; cell.converted = c.converted; cell.problems = c.problems;
            if (c.value != null) { cell.status = 'priced'; cell.aiValue = c.value; cell.value = c.value; cell.badges.push('extracted'); if (Object.keys(c.converted).length) cell.badges.push('converted'); }
            else cell.status = 'unit_problem';
          } else if (e.price_status === 'reference_only') {
            cell.status = 'reference';
          } else if (e.price_status === 'unreadable' || e.clarity === 'unreadable') {
            cell.status = 'unreadable';
          } else {
            cell.status = 'not_quoted';
            cell.reason = e.clarity_note || null;
          }
        } else if (nq[L.line]) {
          cell.status = 'not_quoted'; cell.reason = nq[L.line].reason; cell.source = srcOf(nq[L.line]);
        } else {
          cell.status = 'not_quoted'; cell.reason = 'Vendor did not mention this line';
        }
        vo.cells[L.line] = cell;
      });
    });

    // ---------- pass 2: flags ----------
    function addFlag(vo, f) {
      f.vendor = vo.id;
      f.id = `${vo.id}:${f.type}:${f.line == null ? 'x' : f.line}`;
      const d = decisions[f.id];
      f.decision = d || null;
      f.open = !d || d.action === 'ask';
      vo.flags.push(f); out.flags.push(f);
      if (f.line != null && vo.cells[f.line]) vo.cells[f.line].flagIds.push(f.id);
      return f;
    }

    out.processedIds.forEach(id => {
      const vo = out.vendors[id], ex = vo.ex;
      const unitGroups = {}; let currencyHit = null, gstHit = false, perKgLines = [];

      rfx.lines.forEach(L => {
        const c = vo.cells[L.line];
        const lineLbl = `Line ${L.line} · ${L.desc} · ${L.plant}`;
        if (c.status === 'not_quoted') {
          addFlag(vo, { type: 'not_quoted', line: L.line, sev: 'red', title: 'Line not quoted', detail: `${lineLbl}. ${c.reason ? 'Vendor says: ' + String(c.reason).replace(/\.?$/, '.') : 'No price given.'} The gap stays empty in totals unless you enter an assumption.`, source: c.source, actions: ['confirm_gap', 'assume', 'ask'] });
        } else if (c.status === 'unreadable') {
          addFlag(vo, { type: 'unreadable', line: L.line, sev: 'red', title: 'Price unreadable', detail: `${lineLbl}. ${c.raw && c.raw.clarity_note ? c.raw.clarity_note + '. ' : ''}The AI did not guess a value. Read the source and enter the price, or ask the vendor.`, source: c.source, actions: ['correct', 'ask'], unitHint: c.raw && c.raw.price_basis });
        } else if (c.status === 'reference') {
          const ly = L.lastYear;
          addFlag(vo, { type: 'vague_reference', line: L.line, sev: 'red', title: 'Vague price reference', detail: `${lineLbl}. Vendor wrote "${c.raw.reference_text || 'see previous'}". ${ly ? `Proposed: last year's contract price ₹${fmt(ly)}/pc, tagged "vendor to confirm".` : 'No last-year price exists for this line.'}`, source: c.source, proposal: ly || null, actions: ly ? ['accept_proposal', 'correct', 'ask'] : ['correct', 'ask'] });
        } else if (c.status === 'unit_problem') {
          addFlag(vo, { type: 'unit_problem', line: L.line, sev: 'red', title: 'Price could not be converted', detail: `${lineLbl}. ${(c.problems || []).join('; ')}.`, source: c.source, actions: ['correct', 'ask'] });
        } else if (c.status === 'priced') {
          if (c.raw.clarity === 'unclear') addFlag(vo, { type: 'unclear', line: L.line, sev: 'yellow', title: 'Read with some doubt', detail: `${lineLbl}. AI read ${c.raw.price_value} but noted: ${c.raw.clarity_note || 'not fully clear'}.`, source: c.source, actions: ['confirm', 'correct'] });
          if (c.raw.match_confidence === 'low') addFlag(vo, { type: 'match', line: L.line, sev: 'yellow', title: 'Item match uncertain', detail: `${lineLbl}. Vendor item "${c.raw.vendor_item_text}" matched by ${c.raw.match_basis}.`, source: c.source, actions: ['confirm', 'correct'] });
          if (c.duplicate) addFlag(vo, { type: 'conflict_line', line: L.line, sev: 'red', title: 'Two different prices for one line', detail: `${lineLbl}. Values found: ${c.duplicate.map(d => d.price_value + ' (' + (d.source && d.source.location) + ')').join(' vs ')}.`, source: c.source, actions: ['confirm', 'correct'] });
          if (c.converted.unit) (unitGroups[c.converted.unit] = unitGroups[c.converted.unit] || []).push(L.line);
          if (c.converted.currency) currencyHit = c.converted.currency;
          if (c.converted.gst) gstHit = true;
          if (c.converted.perKg) perKgLines.push(L.line);
          const w = c.raw.stated_weight_g;
          if (w && L.weightG && Math.abs(w - L.weightG) / L.weightG > WEIGHT_TOL) {
            addFlag(vo, { type: 'weight', line: L.line, sev: 'yellow', title: 'Box weight differs from spec', detail: `${lineLbl}. Vendor states ${w} g vs spec ${L.weightG} g (${w > L.weightG ? '+' : ''}${fmt((w - L.weightG) / L.weightG * 100, 1)}%). Heavier board can mean a different spec than asked.`, source: c.source, actions: ['confirm', 'ask'] });
          }
        }
      });

      Object.entries(unitGroups).forEach(([u, lines]) => addFlag(vo, { type: 'unit_' + u.replace(/\W/g, ''), line: null, sev: 'yellow', title: `Prices quoted ${u} pcs — converted`, detail: `${lines.length} lines were priced ${u} pieces and divided to ₹ per piece. Check one to be sure the column was read correctly.`, source: vo.cells[lines[0]].source, actions: ['confirm'] }));
      if (currencyHit) addFlag(vo, { type: 'currency', line: null, sev: 'yellow', title: `Quoted in ${currencyHit} — converted`, detail: `All prices converted at the RFx rate ₹${fmt(rfx.fxRates[currencyHit])} per ${currencyHit}. Real cost will move with the exchange rate.`, source: (ex.lines.find(l => l.currency === currencyHit) || {}).source, actions: ['confirm'] });
      if (gstHit) addFlag(vo, { type: 'gst', line: null, sev: 'yellow', title: 'Prices included GST — removed', detail: `Prices were stated including GST; ${rfx.gstRate * 100}% removed to compare like for like.`, source: null, actions: ['confirm'] });
      if (perKgLines.length) addFlag(vo, { type: 'perkg', line: null, sev: 'yellow', title: 'Priced per kg — converted using spec box weight', detail: `${perKgLines.length} lines priced per kg were multiplied by the RFx box weight. If the vendor's boxes weigh more, the real price per box is higher. It is also not stated whether printing is included.`, source: vo.cells[perKgLines[0]].source, actions: ['confirm', 'ask'] });

      // ---------- commercial terms ----------
      const t = ex.commercial_terms || {};
      const pay = t.payment || {};
      if (!pay.stated || pay.days == null) addFlag(vo, { type: 'payment_missing', line: null, sev: 'red', title: 'Payment terms missing', detail: 'Vendor did not state payment terms. Standard is 60 days from GRN.', source: pay.source, actions: ['assume', 'ask'], assumeLabel: 'Payment days' });
      else if (pay.days !== rfx.paymentDaysStandard) addFlag(vo, { type: 'payment_dev', line: null, sev: 'yellow', title: `Payment ${pay.days} days (standard ${rfx.paymentDaysStandard})`, detail: `Vendor: "${pay.text || pay.days + ' days'}". ${pay.days < rfx.paymentDaysStandard ? 'Shorter credit means Sahyadri pays earlier.' : ''}`, source: pay.source, actions: ['confirm', 'ask'] });

      const val = t.validity || {};
      let valDays = val.days;
      if (valDays == null && val.until_date && ex.quote_date) {
        const d1 = Date.parse(val.until_date), d0 = Date.parse(ex.quote_date);
        if (!isNaN(d1) && !isNaN(d0)) valDays = Math.round((d1 - d0) / 86400000);
      }
      if (!val.stated) addFlag(vo, { type: 'validity_missing', line: null, sev: 'red', title: 'Quote validity missing', detail: `RFx asked for at least ${rfx.minValidityDays} days validity. Not stated.`, source: null, actions: ['confirm', 'ask'] });
      else if (valDays != null && valDays < rfx.minValidityDays) addFlag(vo, { type: 'validity_short', line: null, sev: 'yellow', title: `Validity ${valDays} days (RFx asked ≥ ${rfx.minValidityDays})`, detail: `Vendor: "${val.text || ''}". Prices may lapse before the award is final.`, source: val.source, actions: ['confirm', 'ask'] });

      const fr = t.freight || {};
      if (fr.basis === 'extra_amount_not_stated') addFlag(vo, { type: 'freight_missing', line: null, sev: 'red', title: 'Freight extra — amount unknown', detail: `Vendor: "${fr.text || 'freight extra'}". Landed cost cannot be completed. Enter an estimate (tagged as your assumption) or ask the vendor.`, source: fr.source, actions: ['assume', 'ask'], assumeLabel: 'Freight estimate, ₹ per box' });
      else if (fr.basis === 'extra_amount_stated') addFlag(vo, { type: 'freight_extra', line: null, sev: 'yellow', title: 'Freight billed separately', detail: `Vendor: "${fr.text}". ${fr.per === 'truck' ? 'Freight is added to this vendor\'s totals as an estimate based on the volume it would get.' : ''} Prices in the grid are before this freight.`, source: fr.source, actions: ['confirm'] });
      else if (fr.basis === 'not_mentioned') addFlag(vo, { type: 'freight_unclear', line: null, sev: 'yellow', title: 'Freight not mentioned', detail: 'RFx asked for landed prices. Vendor did not say whether freight is included.', source: null, actions: ['confirm', 'ask'] });

      if (t.price_variation_clause && t.price_variation_clause.present) addFlag(vo, { type: 'pvc', line: null, sev: 'yellow', title: 'Price-variation clause', detail: `Prices are not fixed for the year: "${t.price_variation_clause.text}"`, source: t.price_variation_clause.source, actions: ['confirm'] });
      (t.discounts || []).forEach((d, i) => {
        if (!d || d.condition_type === 'none' && !d.percent) return;
        addFlag(vo, { type: 'discount' + i, line: null, sev: 'yellow', title: `Conditional discount ${d.percent != null ? d.percent + '%' : ''}`, detail: `"${d.text}". Not included in line prices. It is applied in the award options only if the condition is met.`, source: d.source, actions: ['confirm'] });
      });

      // ---------- questionnaire ----------
      const q = ex.questionnaire || {};
      const atts = ex.attachments || [];
      const iso = q.iso_9001 || {};
      const isoDoc = atts.find(a => a.type === 'iso_certificate');
      if (iso.answer === 'yes' && !isoDoc) addFlag(vo, { type: 'iso_noevidence', line: null, sev: 'red', title: 'ISO 9001 claimed — no certificate', detail: `Vendor says: "${iso.claim_text || 'ISO certified'}" but no certificate was attached. Must-pass rule needs the certificate.`, source: iso.source, actions: ['confirm', 'ask'] });
      else if (iso.answer === 'in_process') addFlag(vo, { type: 'iso_inprocess', line: null, sev: 'red', title: 'ISO 9001 not held (in process)', detail: `Vendor says: "${iso.claim_text || 'in process'}". Fails the must-pass rule today.`, source: iso.source, actions: ['confirm', 'ask'] });
      else if (iso.answer === 'no' || iso.answer === 'not_stated' || !iso.answer) addFlag(vo, { type: 'iso_missing', line: null, sev: 'red', title: 'ISO 9001 not answered', detail: 'Must-pass question not answered.', source: iso.source, actions: ['confirm', 'ask'] });
      if (isoDoc) {
        const nameOk = !isoDoc.company_named || QP.namesMatch(isoDoc.company_named, vo.name) ;
        if (!nameOk) addFlag(vo, { type: 'iso_name', line: null, sev: 'red', title: 'Certificate is in another company\'s name', detail: `Certificate names "${isoDoc.company_named}", vendor is ${vo.name}.`, source: { file: isoDoc.file, location: 'certificate', quote: isoDoc.company_named }, actions: ['confirm', 'ask'] });
        if (isoDoc.valid_until && isoDoc.valid_until < contractEnd) addFlag(vo, { type: 'iso_expiry', line: null, sev: 'yellow', title: 'ISO certificate expires during the contract', detail: `Valid until ${isoDoc.valid_until}; contract runs to ${contractEnd}. Ask for the renewed certificate before expiry.`, source: { file: isoDoc.file, location: 'certificate', quote: 'Valid until ' + isoDoc.valid_until }, actions: ['confirm', 'ask'] });
      }
      const cap = q.monthly_capacity || {};
      if (cap.answer !== 'stated' || cap.boxes_per_month == null) addFlag(vo, { type: 'cap_missing', line: null, sev: 'red', title: 'Monthly capacity not stated', detail: `Need is about ${fmt(monthlyNeed, 0)} boxes/month if this vendor got everything.`, source: cap.source, actions: ['confirm', 'ask'] });
      else if (cap.boxes_per_month < monthlyNeed) addFlag(vo, { type: 'cap_low', line: null, sev: 'yellow', title: 'Capacity below full requirement', detail: `${fmt(cap.boxes_per_month, 0)} boxes/month vs ~${fmt(monthlyNeed, 0)} needed for the full contract. Fine for a partial award only.`, source: cap.source, actions: ['confirm'] });
      const tr = q.test_report || {};
      const trDoc = atts.find(a => a.type === 'test_report');
      if (!trDoc) addFlag(vo, { type: 'test_missing', line: null, sev: 'red', title: 'No strength test report', detail: tr.answer === 'claimed_not_attached' ? 'Vendor mentions a test report but none is attached.' : 'Must-pass test report not provided.', source: tr.source, actions: ['confirm', 'ask'] });
      const fs = q.food_safe_inks || {};
      if (fs.answer !== 'yes') addFlag(vo, { type: 'inks', line: null, sev: 'yellow', title: 'Food-safe inks not confirmed', detail: fs.answer === 'no' ? 'Vendor says no.' : 'Not answered. Needed for printed boxes.', source: fs.source, actions: ['confirm', 'ask'] });

      (ex.conflicts || []).forEach((cf, i) => addFlag(vo, { type: 'conflict' + i, line: cf.rfx_line || null, sev: 'red', title: 'Conflicting information', detail: cf.description, source: (cf.sources || [])[0] || null, actions: ['confirm', 'correct', 'ask'] }));
    });

    // ---------- unusual prices (needs all vendors) ----------
    QP.state.rfx.lines.forEach(L => {
      out.processedIds.forEach(id => {
        const c = out.vendors[id].cells[L.line];
        if (c.aiValue == null) return;
        const others = out.processedIds.filter(o => o !== id).map(o => out.vendors[o].cells[L.line].aiValue).filter(x => x != null);
        const med = others.length >= 2 ? median(others) : null;
        const reasons = [];
        if (med && Math.abs(c.aiValue - med) / med > UNUSUAL) reasons.push(`${fmt((c.aiValue - med) / med * 100, 0)}% vs other vendors' median ₹${fmt(med)}`);
        if (L.lastYear && Math.abs(c.aiValue - L.lastYear) / L.lastYear > UNUSUAL) reasons.push(`${fmt((c.aiValue - L.lastYear) / L.lastYear * 100, 0)}% vs last year ₹${fmt(L.lastYear)}`);
        if (reasons.length) addFlag(out.vendors[id], { type: 'unusual', line: L.line, sev: 'yellow', title: 'Unusual price', detail: `Line ${L.line} · ${L.desc}: ₹${fmt(c.aiValue)} is ${reasons.join(' and ')}. Possible misread or different spec.`, source: c.source, actions: ['confirm', 'correct'] });
      });
    });

    // ---------- apply buyer decisions to cell values ----------
    out.processedIds.forEach(id => {
      const vo = out.vendors[id];
      vo.flags.forEach(f => {
        const d = f.decision; if (!d || f.line == null) return;
        const c = vo.cells[f.line];
        if (d.action === 'correct' && d.value != null) { c.value = Number(d.value); c.badges = ['corrected']; c.status = 'priced'; c.note = d.reason; }
        if (d.action === 'assume' && d.value != null) { c.value = Number(d.value); c.badges = ['buyer_assumption']; c.status = 'priced'; c.note = d.reason; }
        if (d.action === 'accept_proposal' && f.proposal != null) { c.value = f.proposal; c.badges = ['assumed_last_year']; c.status = 'priced'; }
      });
      // a line still carrying an open red flag
      Object.values(vo.cells).forEach(c => { c.openRed = c.flagIds.some(fid => { const f = out.flags.find(x => x.id === fid); return f && f.open && f.sev === 'red'; }); });
    });

    // ---------- totals ----------
    const lines = rfx.lines;
    const ids = out.processedIds;
    const allPricedLines = lines.filter(L => ids.length && ids.every(id => out.vendors[id].cells[L.line].value != null)).map(L => L.line);
    out.likeForLikeLines = allPricedLines;
    ids.forEach(id => {
      const vo = out.vendors[id];
      let full = 0, n = 0, boxes = 0, lfl = 0;
      lines.forEach(L => {
        const c = vo.cells[L.line];
        if (c.value != null) { full += c.value * L.qty; n++; boxes += L.qty; if (allPricedLines.includes(L.line)) lfl += c.value * L.qty; }
      });
      vo.totals = { full, likeForLike: lfl, quoted: n, missing: lines.length - n, boxes };
      vo.freight = QP.freightEstimate(vo, boxes);
      vo.openRed = vo.flags.filter(f => f.open && f.sev === 'red').length;
      vo.openYellow = vo.flags.filter(f => f.open && f.sev === 'yellow').length;
    });
    out.lastYear = { full: lines.reduce((a, L) => a + (L.lastYear ? L.lastYear * L.qty : 0), 0) };
    // cheapest per line
    out.cheapest = {};
    lines.forEach(L => {
      let best = null;
      ids.forEach(id => { const v = out.vendors[id].cells[L.line].value; if (v != null && (best == null || v < best.v)) best = { id, v }; });
      out.cheapest[L.line] = best;
    });
    return out;
  };

  // Freight for a given number of boxes, from the vendor's own terms (or the buyer's estimate).
  QP.freightEstimate = function (vo, boxes) {
    const t = (vo.ex && vo.ex.commercial_terms && vo.ex.commercial_terms.freight) || {};
    const rfx = QP.state.rfx;
    if (t.basis === 'included') return { kind: 'included', amount: 0, text: 'Included (delivered)' };
    if (t.basis === 'extra_amount_stated' && t.amount != null) {
      const fx = (t.currency && t.currency !== 'INR') ? rfx.fxRates[t.currency] : 1;
      if (t.per === 'truck' && t.boxes_per_unit) {
        const trucks = Math.ceil(boxes / t.boxes_per_unit);
        const amt = trucks * t.amount * (fx || 0);
        return { kind: 'estimated', amount: amt, text: `${trucks} trucks × ${t.currency || '₹'} ${t.amount}${fx && fx !== 1 ? ' × ₹' + fmt(fx) : ''} ≈ ${QP.fmtL(amt)}`, perTruck: t.amount * (fx || 0), boxesPerTruck: t.boxes_per_unit };
      }
      if (t.per === 'box') { const amt = boxes * t.amount * (fx || 1); return { kind: 'estimated', amount: amt, text: `${fmt(boxes, 0)} boxes × ${t.amount}` }; }
      if (t.per === 'lump_sum') { const amt = t.amount * (fx || 1); return { kind: 'estimated', amount: amt, text: 'Lump sum' }; }
    }
    const d = QP.state.decisions[`${vo.id}:freight_missing:x`];
    if (d && d.action === 'assume' && d.value != null) { const amt = boxes * Number(d.value); return { kind: 'buyer_assumption', amount: amt, text: `Your estimate ₹${d.value}/box × ${fmt(boxes, 0)} boxes` }; }
    if (t.basis === 'extra_amount_not_stated' || t.basis === 'extra_amount_stated') return { kind: 'unknown', amount: null, text: 'Freight extra — amount unknown' };
    return { kind: 'unknown_basis', amount: 0, text: 'Not mentioned (treated as included)' };
  };

  QP.namesMatch = function (a, b) {
    const norm = s => String(s).toLowerCase().replace(/pvt|ltd|private|limited|pte|\.|,|—|-|works/g, ' ').split(/\s+/).filter(w => w.length > 2);
    const A = norm(a), B = norm(b);
    return B.filter(w => A.includes(w)).length >= Math.min(2, B.length);
  };
})();
