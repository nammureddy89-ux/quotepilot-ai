// Stage 1–2 logic: turn last year's contract + Priya's brief into a draft RFx (real AI),
// check the AI's work against the file with plain code, run the pre-send checks, and build the sent RFx.
// Rule: the AI never invents line items, specs or quantities. Code verifies every value it returns.
window.QP = window.QP || {};

(function () {
  const PRIVATE_PRICE = /price|rate\b|cost|₹\s*\/\s*pc/i;
  const PRIVATE_VALUE = /value|amount|total/i;
  const PRIVATE_SUPPLIER = /supplier|vendor/i;
  const MUST_PASS_TOPICS = ['iso_9001', 'monthly_capacity', 'test_report', 'food_safe_inks'];
  const TOPICS = [...MUST_PASS_TOPICS, 'box_weight', 'other'];

  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  const numsIn = s => (String(s || '').replace(/(\d),(?=\d)/g, '$1').match(/\d+(\.\d+)?/g) || []).map(Number);
  QP.todayISO = () => new Date().toISOString().slice(0, 10);

  // ---------- 1. Read the uploaded Excel: keep prices and suppliers private ----------
  // Returns { aiText, rows: {rowNum: [values]}, dataRows: [rowNum], priv: {rowNum: {price, supplier}}, privateCols: [header], descCol }
  QP.prepareContract = async function (blob, name) {
    if (!window.XLSX) throw new Error('Excel reader did not load. Reload the page and try again.');
    let wb;
    try { wb = XLSX.read(await blob.arrayBuffer(), { type: 'array', cellFormula: true }); }
    catch (e) { throw new Error('This file could not be opened as an Excel workbook. Nothing was imported.'); }
    let aiText = '';
    const rows = {}, priv = {}, dataRows = [], privateCols = [];
    let mainSheet = null, descCol = null;
    wb.SheetNames.forEach(sn => {
      const ws = wb.Sheets[sn];
      if (!ws['!ref']) return;
      const range = XLSX.utils.decode_range(ws['!ref']);
      const val = (r, c) => { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (!cell) return ''; return cell.w != null ? cell.w : (cell.v != null ? cell.v : ''); };
      // header row = first row with ≥5 text cells including a description/item column
      let header = -1;
      for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 30) && header < 0; r++) {
        const texts = [];
        for (let c = range.s.c; c <= range.e.c; c++) { const v = val(r, c); if (typeof v === 'string' && v.trim() && isNaN(Number(v))) texts.push(v); }
        if (texts.length >= 5 && texts.some(t => /desc|item/i.test(t))) header = r;
      }
      const hidden = {}; let priceCol = null, supplierCol = null, dCol = null;
      if (header >= 0 && !mainSheet) {
        mainSheet = sn;
        for (let c = range.s.c; c <= range.e.c; c++) {
          const h = String(val(header, c));
          if (PRIVATE_SUPPLIER.test(h)) { hidden[c] = 1; supplierCol = c; privateCols.push(h); }
          else if (PRIVATE_PRICE.test(h) && !/basis/i.test(h)) { hidden[c] = 1; if (priceCol == null) priceCol = c; privateCols.push(h); }
          else if (PRIVATE_VALUE.test(h)) { hidden[c] = 1; privateCols.push(h); }
          if (dCol == null && /desc/i.test(h)) dCol = c;
        }
        if (dCol == null) for (let c = range.s.c; c <= range.e.c; c++) if (/item/i.test(String(val(header, c))) && !/code/i.test(String(val(header, c)))) { dCol = c; break; }
        descCol = dCol;
      }
      aiText += `\n=== Sheet "${sn}" ===\n`;
      for (let r = range.s.r; r <= range.e.r; r++) {
        const parts = [], values = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          if (sn === mainSheet && hidden[c]) continue;
          let v = val(r, c);
          if (v === '' || v == null) continue;
          if (typeof v === 'string' && v.startsWith('=')) continue;
          const addr = XLSX.utils.encode_cell({ r, c });
          parts.push(`${addr}: ${v}`); values.push(v);
        }
        // Prices also hide inside free text on other rows? Only the main table's private columns are removed.
        if (parts.length) aiText += `Row ${r + 1} | ` + parts.join(' | ') + '\n';
        if (sn === mainSheet) {
          rows[r + 1] = values;
          if (header >= 0 && r > header && dCol != null) {
            const d = String(val(r, dCol)).trim();
            if (d && !/^total/i.test(d) && !/^note/i.test(d)) {
              dataRows.push(r + 1);
              const p = priceCol != null ? Number(String(val(r, priceCol)).replace(/[^\d.]/g, '')) : NaN;
              priv[r + 1] = { price: isFinite(p) && p > 0 ? p : null, supplier: supplierCol != null ? String(val(r, supplierCol)).trim() || null : null };
            }
          }
        }
      }
    });
    if (!mainSheet || !dataRows.length) throw new Error('No line-item table was found in this file (looked for a header row with a Description column). Nothing was imported.');
    return { name, sheet: mainSheet, aiText, rows, dataRows, priv, privateCols, descCol };
  };

  // ---------- 2. The AI call ----------
  const SYSTEM = `You help a procurement buyer turn LAST YEAR'S CONTRACT FILE and HER SHORT BRIEF into a draft RFx (request for quotation) for vendors.

Hard rules:
- Never invent line items, specs, quantities, box weights, plants or dates. Every value must come from the uploaded file or the brief.
- Continuing lines: copy every value exactly as written in the file row and give source_row (the Excel row number shown as "Row N").
- Apply the brief: lines she asks to drop go in lines_dropped with her words. Keep all other lines unchanged, unless the brief explicitly changes a value; then report it in "changes" with her words.
- New lines from the brief: use only values she wrote. Anything she did not give (box weight, board grade, product use, item code) = null. Never copy a value from a similar line and never use a "typical" value.
- Plant names: use the buyer's plant list exactly (e.g. "Ranjangaon" → "Ranjangaon (Pune)").
- Questionnaire: include every point the brief asks vendors to confirm (origin "brief"). You may add up to 3 extra questions (origin "ai_suggestion") with a one-line reason. Give each a topic.
- Terms: commercial points from the brief (origin "brief"). You may add up to 4 extra terms (origin "ai_suggestion") with a one-line reason. Suggestions must not contain new numbers (no amounts, percentages or day counts unless taken from the brief or company profile).
- scope_text: 2–4 plain sentences addressed to vendors. No prices, no current or past supplier names, no old contract numbers.
- Report items that appear twice (same description, size, ply and plant) in "duplicates".
- Dates as YYYY-MM-DD. Output JSON only, matching the format exactly.`;

  const SCHEMA = `Return JSON in exactly this format:
{
  "contract": { "title": string, "period_start": "YYYY-MM-DD"|null, "period_end": "YYYY-MM-DD"|null, "quote_due_date": "YYYY-MM-DD"|null,
                "price_basis": string|null, "payment_days": number|null, "min_validity_days": number|null, "fx_usd_inr": number|null },
  "scope_text": string,
  "lines_kept": [ { "source_row": number, "code": string|null, "desc": string, "use": string|null, "ply": number|null, "board": string|null,
                    "length_mm": number|null, "width_mm": number|null, "height_mm": number|null, "weight_g": number|null,
                    "printing": string|null, "plant": string|null, "annual_qty": number|null } ],
  "lines_dropped": [ { "source_row": number, "desc": string, "brief_quote": string } ],
  "changes": [ { "source_row": number, "field": "desc"|"use"|"ply"|"board"|"length_mm"|"width_mm"|"height_mm"|"weight_g"|"printing"|"plant"|"annual_qty", "new_value": string|number, "brief_quote": string } ],
  "lines_new": [ { "desc": string, "use": string|null, "ply": number|null, "board": string|null, "length_mm": number|null, "width_mm": number|null,
                   "height_mm": number|null, "weight_g": number|null, "printing": string|null, "plant": string|null, "annual_qty": number|null,
                   "brief_quote": string } ],
  "questionnaire": [ { "topic": "iso_9001"|"monthly_capacity"|"test_report"|"food_safe_inks"|"box_weight"|"other", "text": string, "origin": "brief"|"ai_suggestion", "reason": string|null } ],
  "terms": [ { "text": string, "origin": "brief"|"ai_suggestion", "reason": string|null } ],
  "duplicates": [ { "source_rows": [number], "note": string } ],
  "notes": [ string ]
}
"lines_kept" values must be the file's values (before any change from the brief; changes go in "changes"). Every data row of the file must appear in either lines_kept or lines_dropped.`;

  QP.structureRfx = async function (contract, brief, opts = {}) {
    const C = QP.COMPANY;
    const parts = [
      { type: 'text', text: `BUYER: ${C.name}. Plants (use these names exactly): ${C.plants.join('; ')}. Company standard payment: ${C.standardPaymentDays} days from GRN. Today: ${QP.todayISO()}.` },
      { type: 'text', text: `--- FILE: "${contract.name}" (last year's contract, Excel, shown as cell references; price, value and supplier columns were removed for privacy) ---\n${contract.aiText}` },
      { type: 'text', text: `--- BUYER'S BRIEF ---\n${brief}` },
      { type: 'text', text: SCHEMA }
    ];
    const { data, model, timing } = await QP.callAI({ system: SYSTEM, parts, json: true, maxTokens: 16384, signal: opts.signal, onStatus: opts.onStatus });
    if (!data || !Array.isArray(data.lines_kept)) throw new Error('The AI answer did not contain the line items. Nothing was imported — try again.');
    return { data, model, timing };
  };
  QP.RFX_PROMPTS = { SYSTEM, SCHEMA };

  // ---------- 3. Build the draft + code verification of every AI value ----------
  const plantOf = p => {
    if (!p) return { plant: '', ok: false };
    const hit = QP.COMPANY.plants.find(x => norm(x) === norm(p)) || QP.COMPANY.plants.find(x => norm(x).split(' ')[0] === norm(p).split(/[ (]/)[0]);
    return hit ? { plant: hit, ok: true } : { plant: String(p), ok: false };
  };
  const sizeStr = (l, w, h) => [l, w, h].every(v => v != null && v !== '') ? `${l}x${w}x${h}` : '';
  const FIELD_KEY = { desc: 'desc', use: 'use', ply: 'ply', board: 'board', weight_g: 'weightG', printing: 'printing', plant: 'plant', annual_qty: 'qty' };

  QP.buildDraft = function (ai, contract, brief, meta) {
    const d = ai.data;
    const rowVals = r => (contract.rows[r] || []).map(v => norm(v));
    const rowNums = r => (contract.rows[r] || []).flatMap(v => numsIn(v));
    const briefN = norm(brief), briefNums = numsIn(brief);
    const lines = [];
    const seenRows = {};
    const changes = Array.isArray(d.changes) ? d.changes : [];

    (d.lines_kept || []).slice().sort((a, b) => (a.source_row || 0) - (b.source_row || 0)).forEach(k => {
      const r = Number(k.source_row);
      const L = {
        key: 'r' + r, origin: 'upload', srcRow: r, code: k.code || '', desc: k.desc || '', use: k.use || '', ply: k.ply ?? '', board: k.board || '',
        size: sizeStr(k.length_mm, k.width_mm, k.height_mm), weightG: k.weight_g ?? '', printing: k.printing || '', plant: '', qty: k.annual_qty ?? '',
        lastYear: (contract.priv[r] || {}).price ?? null, supplier2026: (contract.priv[r] || {}).supplier ?? null, verify: [], changed: []
      };
      const pl = plantOf(k.plant); L.plant = pl.plant;
      // Verify against the file row (layout-agnostic: the value must appear in that row)
      if (!contract.dataRows.includes(r)) L.verify.push({ field: 'row', msg: `Row ${r} is not a line in your file` });
      else {
        if (seenRows[r]) L.verify.push({ field: 'row', msg: `Row ${r} was used twice by the AI` });
        seenRows[r] = 1;
        const vals = rowVals(r), nums = rowNums(r);
        const has = s => vals.some(v => v === norm(s) || (norm(s).length > 3 && v.includes(norm(s))));
        if (L.desc && !has(L.desc)) L.verify.push({ field: 'desc', msg: `"${L.desc}" is not in row ${r}` });
        if (L.code && !has(L.code)) L.verify.push({ field: 'code', msg: `Code not in row ${r}` });
        [['ply', L.ply], ['weightG', L.weightG], ['qty', L.qty], ['size', k.length_mm], ['size', k.width_mm], ['size', k.height_mm]].forEach(([f, v]) => {
          if (v !== '' && v != null && !nums.includes(Number(v))) L.verify.push({ field: f, msg: `${v} is not in row ${r}` });
        });
        if (L.printing && !has(L.printing)) L.verify.push({ field: 'printing', msg: `"${L.printing}" is not in row ${r}` });
        if (L.board && !has(L.board)) L.verify.push({ field: 'board', msg: `"${L.board}" is not in row ${r}` });
        if (k.plant && !vals.some(v => v.split(/[ (]/)[0] === norm(L.plant).split(/[ (]/)[0])) L.verify.push({ field: 'plant', msg: `Plant not in row ${r}` });
      }
      // Changes the brief asked for (value must appear in the brief)
      changes.filter(c => Number(c.source_row) === r).forEach(c => {
        const inBrief = c.brief_quote && briefN.includes(norm(c.brief_quote).slice(0, 25));
        const numOk = typeof c.new_value !== 'number' || briefNums.includes(Number(c.new_value));
        if (['length_mm', 'width_mm', 'height_mm'].includes(c.field)) {
          const dims = L.size.split('x'); dims[['length_mm', 'width_mm', 'height_mm'].indexOf(c.field)] = c.new_value; L.size = dims.join('x');
          L.changed.push({ field: 'size', from: '', quote: c.brief_quote, ok: inBrief && numOk });
        } else if (FIELD_KEY[c.field]) {
          const f = FIELD_KEY[c.field];
          L.changed.push({ field: f, from: L[f], quote: c.brief_quote, ok: inBrief && numOk });
          L[f] = f === 'plant' ? plantOf(c.new_value).plant : c.new_value;
        }
      });
      lines.push(L);
    });

    const dropped = (d.lines_dropped || []).map(x => {
      const r = Number(x.source_row);
      seenRows[r] = (seenRows[r] || 0) + 1;
      const quoteOk = x.brief_quote && briefN.includes(norm(x.brief_quote).slice(0, 25));
      return { srcRow: r, desc: x.desc, quote: x.brief_quote || '', quoteOk: !!quoteOk, lastYear: (contract.priv[r] || {}).price ?? null, supplier2026: (contract.priv[r] || {}).supplier ?? null };
    });
    const skipped = contract.dataRows.filter(r => !seenRows[r]);

    // New lines from the brief: every number must appear in the brief
    let maxCode = 0, codePrefix = '';
    lines.forEach(L => { const m = String(L.code).match(/^(.*?)(\d+)$/); if (m) { codePrefix = m[1]; maxCode = Math.max(maxCode, Number(m[2])); } });
    dropped.forEach(x => { const vals = contract.rows[x.srcRow] || []; vals.forEach(v => { const m = String(v).match(/^(.*?-)(\d{3})$/); if (m) { codePrefix = codePrefix || m[1]; maxCode = Math.max(maxCode, Number(m[2])); } }); });
    (d.lines_new || []).forEach((n, i) => {
      const L = {
        key: 'n' + i + '-' + Date.now().toString(36), origin: 'brief', srcRow: null, briefQuote: n.brief_quote || '',
        code: maxCode ? `${codePrefix}${String(maxCode + 1 + i).padStart(3, '0')}` : '', desc: n.desc || '', use: n.use || '', ply: n.ply ?? '', board: n.board || '',
        size: sizeStr(n.length_mm, n.width_mm, n.height_mm), weightG: n.weight_g ?? '', printing: n.printing || '', plant: plantOf(n.plant).plant, qty: n.annual_qty ?? '',
        lastYear: null, supplier2026: null, verify: [], changed: []
      };
      [['ply', L.ply], ['weightG', L.weightG], ['qty', L.qty], ['size', n.length_mm], ['size', n.width_mm], ['size', n.height_mm]].forEach(([f, v]) => {
        if (v !== '' && v != null && !briefNums.includes(Number(v))) L.verify.push({ field: f, msg: `${v} is not in your brief` });
      });
      if (L.board && !briefN.includes(norm(L.board).slice(0, 12))) L.verify.push({ field: 'board', msg: `"${L.board}" is not in your brief` });
      if (n.plant && !briefN.includes(norm(n.plant).split(/[ (]/)[0])) L.verify.push({ field: 'plant', msg: 'Plant not in your brief' });
      lines.push(L);
    });
    lines.forEach((L, i) => { L.line = i + 1; });

    const c = d.contract || {};
    const qn = []; const usedTopic = {};
    (d.questionnaire || []).forEach((q, i) => {
      const topic = TOPICS.includes(q.topic) ? q.topic : 'other';
      const id = topic !== 'other' && !usedTopic[topic] ? topic : `q${i + 1}`;
      usedTopic[topic] = 1;
      qn.push({ id, topic, text: q.text || '', origin: q.origin === 'ai_suggestion' ? 'ai_suggestion' : 'brief', reason: q.reason || '',
        status: q.origin === 'ai_suggestion' ? 'pending' : 'accepted', mustPass: q.origin !== 'ai_suggestion' && MUST_PASS_TOPICS.includes(topic) });
    });
    const terms = (d.terms || []).map((t, i) => ({ id: 't' + i, text: t.text || '', origin: t.origin === 'ai_suggestion' ? 'ai_suggestion' : 'brief', reason: t.reason || '', status: t.origin === 'ai_suggestion' ? 'pending' : 'accepted' }));

    return {
      stage: 'drafted', rev: 1, source: 'ai',
      upload: { name: contract.name, privateCols: contract.privateCols, dataRows: contract.dataRows.length },
      brief,
      meta: {
        id: meta.id, issueDate: QP.todayISO(), title: c.title || '', periodStart: c.period_start || '', periodEnd: c.period_end || '', dueDate: c.quote_due_date || '',
        priceBasis: c.price_basis || '', paymentDays: c.payment_days ?? '', minValidityDays: c.min_validity_days ?? '', fxUSD: c.fx_usd_inr ?? '', gstRate: 0.05,
        scope: d.scope_text || '',
        fromBrief: { title: !!c.title, periodStart: !!c.period_start, periodEnd: !!c.period_end, dueDate: !!c.quote_due_date, priceBasis: !!c.price_basis, paymentDays: c.payment_days != null, minValidityDays: c.min_validity_days != null, fxUSD: c.fx_usd_inr != null }
      },
      lines, dropped, skipped, questionnaire: qn, terms,
      duplicatesAI: d.duplicates || [], notes: d.notes || [],
      ai: { model: ai.model, timing: ai.timing, at: new Date().toISOString() },
      ignored: {}, aiCheck: null
    };
  };

  // Backup path (no AI): the prepared RFx, clearly labelled.
  QP.prepareBackupDraft = function () {
    const S = QP.RFX_SEED;
    return {
      stage: 'drafted', rev: 1, source: 'prepared',
      upload: null, brief: QP.SAMPLE_BRIEF,
      meta: { id: S.id, issueDate: QP.todayISO(), title: S.title, periodStart: '2027-01-01', periodEnd: S.contractEnd, dueDate: S.dueDate, priceBasis: S.priceBasis,
        paymentDays: S.paymentDaysStandard, minValidityDays: S.minValidityDays, fxUSD: S.fxRates.USD, gstRate: S.gstRate,
        scope: 'Sahyadri Foods invites quotations for its annual requirement of corrugated boxes for calendar year 2027, delivered to our three plants (Ranjangaon, Jejuri and Sinnar). Please quote every line in rupees per piece, landed at the named plant and excluding GST, and answer the questionnaire with supporting documents.', fromBrief: {} },
      lines: S.lines.map(l => ({ ...l, key: 'p' + l.line, origin: 'prepared', srcRow: null, verify: [], changed: [] })),
      dropped: [], skipped: [],
      questionnaire: S.questionnaire.map(q => ({ ...q, topic: q.id, origin: 'brief', status: 'accepted', reason: '' })),
      terms: [], duplicatesAI: [], notes: [], ai: null, ignored: {}, aiCheck: null
    };
  };

  // ---------- 4. Pre-send checks (plain code) ----------
  // Each: { id, sev: 'red'|'yellow', title, detail, focus, canIgnore }
  QP.rfxChecks = function (D) {
    const out = [], M = D.meta, today = QP.todayISO();
    const add = (id, sev, title, detail, focus, canIgnore = true) => out.push({ id, sev, title, detail, focus, canIgnore, src: 'rule' });
    const lab = L => `Line ${L.line} · ${L.desc || 'no description'}${L.plant ? ' · ' + L.plant.split(' ')[0] : ''}`;

    if (!D.lines.length) add('nolines', 'red', 'No line items', 'Add at least one line before sending.', 'addline', false);
    D.lines.forEach(L => {
      const miss = [];
      if (!String(L.desc).trim()) miss.push('description');
      if (L.ply === '' || L.ply == null) miss.push('ply');
      if (!/^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/.test(String(L.size).replace(/\s/g, ''))) miss.push('size (L x W x H)');
      if (L.weightG === '' || L.weightG == null || !(Number(L.weightG) > 0)) miss.push('box weight');
      if (!L.plant) miss.push('delivery plant');
      if (!(Number(L.qty) > 0)) miss.push('annual quantity');
      if (miss.length) add('miss-' + L.key, 'red', `Missing ${miss.join(', ')}`, `${lab(L)}. ${miss.includes('box weight') ? 'Box weight is needed to convert per-kg quotes. ' : ''}Never filled with a typical value — please enter it.`,
        `line-${L.key}-${miss.includes('box weight') ? 'weightG' : miss.includes('ply') ? 'ply' : miss.includes('annual quantity') ? 'qty' : 'desc'}`, false);
      if (L.plant && !QP.COMPANY.plants.includes(L.plant)) add('plant-' + L.key, 'red', 'Unknown delivery plant', `${lab(L)}: "${L.plant}" is not one of your 3 plants.`, `line-${L.key}-plant`, false);
      if (!String(L.board || '').trim() && L.desc) add('board-' + L.key, 'yellow', 'Board grade not given', `${lab(L)}. Vendors will quote on ply only. Add GSM and flute if you know them.`, `line-${L.key}-board`);
      (L.verify || []).forEach((v, i) => add(`ver-${L.key}-${i}`, 'red', L.origin === 'brief' ? 'AI value not found in your brief' : 'AI value differs from your file',
        `${lab(L)}: ${v.msg}. Check it before sending.`, `line-${L.key}-${v.field === 'size' ? 'size' : v.field === 'row' ? 'desc' : v.field}`));
      (L.changed || []).filter(c => !c.ok).forEach((c, i) => add(`chg-${L.key}-${i}`, 'red', 'Change not found in your brief', `${lab(L)}: the AI changed ${c.field}, but "${c.quote || '—'}" is not in your brief.`, `line-${L.key}-${c.field}`));
    });
    // duplicates (same spec + plant)
    const seen = {};
    D.lines.forEach(L => {
      const k = [norm(L.desc), L.ply, String(L.size).replace(/\s/g, ''), L.plant, norm(L.printing)].join('|');
      if (seen[k]) add('dup-' + L.key, 'yellow', 'Possible duplicate line', `Line ${L.line} looks the same as line ${seen[k].line} (description, ply, size, printing and plant).`, `line-${L.key}-desc`);
      else seen[k] = L;
    });
    // AI skipped rows of the file / dropped item still present
    (D.skipped || []).forEach(r => add('skip-' + r, 'red', 'A line from your file is missing', `Row ${r} of ${D.upload ? D.upload.name : 'your file'} is neither in the RFx nor in the dropped list. Add it by hand if it should be quoted.`, 'addline'));
    (D.dropped || []).forEach(x => {
      if (D.lines.some(L => L.srcRow === x.srcRow)) add('drop-' + x.srcRow, 'red', 'Dropped item still in the RFx', `"${x.desc}" (row ${x.srcRow}) — your brief says to drop it.`, 'dropped', false);
      if (!x.quoteOk) add('dropq-' + x.srcRow, 'yellow', 'Drop not found in your brief', `The AI dropped "${x.desc}" (row ${x.srcRow}) but quoted "${x.quote}", which is not in your brief. Restore it if this was wrong.`, 'dropped');
    });

    // dates
    if (!M.title) add('title', 'red', 'RFx title is blank', '', 'meta-title', false);
    if (!M.dueDate) add('due', 'red', 'Quote due date is blank', '', 'meta-dueDate', false);
    else if (M.dueDate < today) add('duepast', 'red', 'Quote due date is in the past', `${QP.fmtDate(M.dueDate)} is before today (${QP.fmtDate(today)}).`, 'meta-dueDate', false);
    if (!M.periodStart || !M.periodEnd) add('period', 'red', 'Contract period is incomplete', '', 'meta-periodStart', false);
    else {
      if (M.periodStart < today) add('periodpast', 'red', 'Contract period has already started', `Starts ${QP.fmtDate(M.periodStart)} — is this last year's period?`, 'meta-periodStart');
      if (M.periodEnd <= M.periodStart) add('periodorder', 'red', 'Contract ends before it starts', '', 'meta-periodEnd', false);
      if (M.dueDate && M.dueDate >= M.periodStart) add('dueafter', 'red', 'Quotes are due after the contract starts', `Due ${QP.fmtDate(M.dueDate)}, contract starts ${QP.fmtDate(M.periodStart)}.`, 'meta-dueDate');
    }
    if (!M.priceBasis) add('basis', 'red', 'Price basis is blank', 'Vendors need to know what to quote (e.g. ₹ per piece, landed, excluding GST).', 'meta-priceBasis', false);
    if (M.paymentDays === '' || M.paymentDays == null) add('pay', 'yellow', 'Payment terms not stated', `Company standard is ${QP.COMPANY.standardPaymentDays} days.`, 'meta-paymentDays');
    else if (Number(M.paymentDays) !== QP.COMPANY.standardPaymentDays) add('paystd', 'yellow', 'Payment terms differ from company standard', `${M.paymentDays} days vs standard ${QP.COMPANY.standardPaymentDays} days.`, 'meta-paymentDays');
    if (!(Number(M.fxUSD) > 0)) add('fx', 'yellow', 'No exchange rate for foreign-currency quotes', 'Without it, a USD quote cannot be compared fairly.', 'meta-fxUSD');

    // questionnaire and terms
    const acceptedQ = D.questionnaire.filter(q => q.status === 'accepted');
    if (!acceptedQ.length) add('noq', 'red', 'No questionnaire', 'Add at least one question.', 'questionnaire');
    const pendQ = D.questionnaire.filter(q => q.status === 'pending').length, pendT = D.terms.filter(t => t.status === 'pending').length;
    if (pendQ + pendT) add('pending', 'yellow', `${pendQ + pendT} AI suggestion${pendQ + pendT > 1 ? 's' : ''} not decided`, 'Accept or reject them. Undecided suggestions are not sent to vendors.', pendQ ? 'questionnaire' : 'terms');
    acceptedQ.filter(q => !String(q.text).trim()).forEach(q => add('qblank-' + q.id, 'red', 'Blank question', '', 'questionnaire', false));

    // last year's prices / suppliers leaking into text vendors will see
    const outgoing = [M.title, M.scope, ...D.terms.filter(t => t.status === 'accepted').map(t => t.text), ...acceptedQ.map(q => q.text), ...D.lines.flatMap(L => [L.desc, L.use, L.board, L.printing])].join(' \n ');
    const prices = new Set(D.lines.concat(D.dropped || []).map(L => L.lastYear).filter(v => v != null).map(v => Number(v).toFixed(2)));
    const leaked = [...new Set((outgoing.match(/\d+\.\d{2}/g) || []).filter(n => prices.has(Number(n).toFixed(2))))];
    if (leaked.length) add('leak', 'red', "Last year's price in the outgoing text", `${leaked.slice(0, 4).join(', ')} match last year's contract prices. Remove them — vendors must not see what we paid.`, 'meta-scope', false);
    const suppliers = [...new Set(D.lines.concat(D.dropped || []).map(L => L.supplier2026).filter(Boolean))];
    const named = suppliers.filter(s => norm(outgoing).includes(norm(s)));
    if (named.length) add('supplier', 'red', "Current supplier named in the outgoing text", `${named.join(', ')} — remove before sending.`, 'meta-scope', false);
    return out;
  };

  // ---------- 5. AI final check (meaning, not blanks) ----------
  const CHECK_SYSTEM = `You review a procurement RFx just before it is sent to vendors. Find real problems a careful buyer would want fixed:
- contradictions (e.g. price basis says "landed at plant" but a term or question asks for ex-works prices; validity or payment days stated differently in two places),
- wrong year or contract period (text that still refers to last year's period or contract),
- items the brief asked to drop that are still present, or items the brief asked to add that are missing,
- references to old or current suppliers, old contract numbers, or last year's prices,
- questions or terms that are unclear to a vendor or ask for something already fixed elsewhere.
Do NOT report blank fields, missing weights, date order or format issues — plain checks already cover those. Do NOT invent problems; an empty list is a good answer.
Each finding must quote the exact text it is about (max 15 words). Output JSON only.`;
  const CHECK_SCHEMA = `Return JSON: { "findings": [ { "severity": "red"|"yellow", "category": "contradiction"|"wrong_year"|"dropped_item"|"missing_item"|"old_reference"|"price_leak"|"unclear", "title": string (max 8 words), "detail": string (one plain sentence), "where": { "type": "contract"|"scope"|"line"|"question"|"term", "line": number|null, "index": number|null }, "quote": string } ] }
"red" = would mislead vendors or break the comparison; "yellow" = worth a look. For questions and terms, "index" is the 1-based number shown.`;

  QP.vendorCopyText = function (D) {
    const M = D.meta, C = QP.COMPANY;
    const q = D.questionnaire.filter(x => x.status === 'accepted'), t = D.terms.filter(x => x.status === 'accepted');
    return `RFx ${M.id} — ${M.title}
Issued by ${C.name}, ${C.address}. Buyer: ${C.buyer}, ${C.email}.
Issue date: ${M.issueDate}. Quotes due: ${M.dueDate}. Contract period: ${M.periodStart} to ${M.periodEnd}.

[Scope]
${M.scope}

[Contract details]
Price basis: ${M.priceBasis}
Payment: ${M.paymentDays} days from GRN
Quote validity: at least ${M.minValidityDays} days
Foreign-currency quotes converted at 1 USD = Rs ${M.fxUSD}

[Line items] (line | description | product use | ply | board | size LxWxH mm | box weight g | printing | delivery plant | annual qty pcs)
${D.lines.map(L => `${L.line} | ${L.desc} | ${L.use || '-'} | ${L.ply}-ply | ${L.board || '-'} | ${L.size} | ${L.weightG || 'not specified'} | ${L.printing || '-'} | ${L.plant} | ${L.qty}`).join('\n')}

[Questionnaire]
${q.map((x, i) => `${i + 1}. ${x.text}`).join('\n')}

[Terms]
${t.map((x, i) => `${i + 1}. ${x.text}`).join('\n') || '(none)'}`;
  };

  QP.aiCheckRfx = async function (D, opts = {}) {
    const old = [...new Set(D.lines.concat(D.dropped || []).map(L => L.supplier2026).filter(Boolean))];
    const parts = [
      { type: 'text', text: `--- BUYER'S BRIEF ---\n${D.brief || '(no brief)'}` },
      { type: 'text', text: `--- PRIVATE CONTEXT (never shown to vendors) ---\nLast year's suppliers: ${old.join(', ') || 'unknown'}.\nItems dropped on the brief's instruction: ${(D.dropped || []).map(x => x.desc).join(', ') || 'none'}.\nToday: ${QP.todayISO()}.` },
      { type: 'text', text: `--- RFx AS VENDORS WILL RECEIVE IT ---\n${QP.vendorCopyText(D)}` },
      { type: 'text', text: CHECK_SCHEMA }
    ];
    const { data, model, timing } = await QP.callAI({ system: CHECK_SYSTEM, parts, json: true, maxTokens: 4096, signal: opts.signal, onStatus: opts.onStatus });
    const findings = (data && Array.isArray(data.findings) ? data.findings : []).map((f, i) => {
      const w = f.where || {};
      let focus = 'meta-scope';
      if (w.type === 'line' && w.line) { const L = D.lines.find(x => x.line === Number(w.line)); focus = L ? `line-${L.key}-desc` : 'lines'; }
      else if (w.type === 'question') focus = 'questionnaire';
      else if (w.type === 'term') focus = 'terms';
      else if (w.type === 'contract') focus = 'meta-title';
      return { id: 'ai-' + i, sev: f.severity === 'red' ? 'red' : 'yellow', title: f.title || 'AI finding', detail: f.detail || '', quote: f.quote || '', focus, canIgnore: true, src: 'ai', category: f.category };
    });
    return { findings, model, timing, rev: D.rev, at: new Date().toISOString() };
  };
  QP.RFX_CHECK_PROMPTS = { CHECK_SYSTEM, CHECK_SCHEMA };

  // ---------- 6. Send: lock the version stages 3–7 use ----------
  QP.buildSentRfx = function (D) {
    const M = D.meta;
    return {
      id: M.id, title: M.title, version: 1, issueDate: M.issueDate,
      period: `${QP.fmtDate(M.periodStart)} – ${QP.fmtDate(M.periodEnd)}`, periodStart: M.periodStart, contractEnd: M.periodEnd, dueDate: M.dueDate,
      priceBasis: M.priceBasis, fxRates: { USD: Number(M.fxUSD) || null }, gstRate: M.gstRate || 0.05,
      paymentDaysStandard: Number(M.paymentDays) || QP.COMPANY.standardPaymentDays, minValidityDays: Number(M.minValidityDays) || null,
      scope: M.scope,
      questionnaire: D.questionnaire.filter(q => q.status === 'accepted').map(q => ({ id: q.id, text: q.text, mustPass: !!q.mustPass, topic: q.topic })),
      terms: D.terms.filter(t => t.status === 'accepted').map(t => t.text),
      lines: D.lines.map(L => ({ line: L.line, code: L.code, desc: L.desc, use: L.use, ply: Number(L.ply), board: L.board, size: String(L.size).replace(/\s/g, ''),
        weightG: Number(L.weightG), printing: L.printing, plant: L.plant, qty: Number(L.qty), lastYear: L.lastYear ?? null, supplier2026: L.supplier2026 ?? null }))
    };
  };

  QP.fmtDate = iso => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
})();
