// Stage 1 — Create RFx: last year's contract + a short brief → AI draft → Priya edits.
// The AI only organises what Priya gives it. Code checks every value against her file and brief.
window.QP = window.QP || {};
QP.screens = QP.screens || {};

(function () {
  const esc = s => QP.esc(s);
  const UPLOAD_ID = 'rfx-upload';
  QP.rfxJob = QP.rfxJob || null;   // { ctrl, status, started }

  const input = () => (QP.state.draftInput = QP.state.draftInput || { fileName: null, brief: '' });
  const touch = () => { QP.state.draft.rev = (QP.state.draft.rev || 1) + 1; QP.state.draft.aiCheckStale = true; QP.save(); };

  // ---------- start: upload + brief ----------
  function startView(main) {
    const I = input(), job = QP.rfxJob;
    main.innerHTML = `
      <div class="head"><div><h1>Create RFx</h1><p>Start from last year's contract and a short brief. The AI organises them into an editable draft — it never invents items, specs or quantities, and plain code checks every value it returns against your file.</p></div></div>
      <div class="card"><div class="ch"><h3>1 · Last year's line items</h3></div><div class="cb">
        ${I.fileName ? `<div class="row"><span class="file">📄 ${esc(I.fileName)} <span class="fx" data-clearfile title="Remove">✕</span></span></div>`
          : `<div class="row"><label class="btn">Choose Excel file…<input type="file" id="rfxFile" accept=".xlsx,.xls" hidden></label><button class="btn" data-samplefile>Use sample: Sahyadri_Box_Contract_2026.xlsx</button></div>`}
        <div class="small muted" style="margin-top:8px">🔒 Price, value and supplier columns are removed before the AI reads the file. They stay in this browser as your private baseline and are never shown to vendors.</div>
      </div></div>
      <div class="card"><div class="ch"><h3>2 · Your brief</h3><span class="grow"></span><button class="btn sm" data-samplebrief>Use sample brief</button></div><div class="cb">
        <textarea class="paste" id="rfxBrief" style="min-height:170px;font-family:inherit;font-size:13px" placeholder="What changes this year? Items to drop or add, new sizes, plants, payment and validity, what vendors must confirm, due date…">${esc(I.brief)}</textarea>
      </div></div>
      <div class="card"><div class="cb">
        <div class="row"><button class="btn primary" id="rfxGo" ${!I.fileName || !I.brief.trim() || job ? 'disabled' : ''}>✨ Create draft with AI</button>
          ${job ? `<span class="status-line"><span class="spinner"></span> <span id="rfxStatus">${esc(job.status)}</span></span><a href="#" class="stoplink" data-cancel>Cancel</a>` : (!I.fileName || !I.brief.trim() ? '<span class="small muted">Add the file and your brief first.</span>' : '')}</div>
        <div class="small muted" style="margin-top:14px">Or <a href="#" data-empty>start with an empty table</a> and type the lines yourself.
          <span style="margin-left:14px;padding-left:14px;border-left:1px solid var(--line)">Demo backup: <a href="#" data-backup>Load prepared RFx (skips the AI)</a></span></div>
      </div></div>`;

    const f = main.querySelector('#rfxFile');
    if (f) f.onchange = async () => { const file = f.files[0]; if (!file) return; await QP.files.put(UPLOAD_ID, file); I.fileName = file.name; QP.save(); QP.render(); };
    const sf = main.querySelector('[data-samplefile]');
    if (sf) sf.onclick = async () => {
      const r = await fetch(QP.SAMPLE_CONTRACT_FILE);
      if (!r.ok) return QP.say(sf.parentElement, 'Could not load the sample file.', 'err');
      await QP.files.put(UPLOAD_ID, await r.blob()); I.fileName = 'Sahyadri_Box_Contract_2026.xlsx'; QP.save(); QP.render();
    };
    const cf = main.querySelector('[data-clearfile]'); if (cf) cf.onclick = () => { I.fileName = null; QP.save(); QP.render(); };
    const ta = main.querySelector('#rfxBrief');
    ta.oninput = () => { I.brief = ta.value; QP.save(); const g = main.querySelector('#rfxGo'); if (g && !QP.rfxJob) g.disabled = !I.fileName || !I.brief.trim(); };
    main.querySelector('[data-samplebrief]').onclick = () => { I.brief = QP.SAMPLE_BRIEF; QP.save(); QP.render(); };
    main.querySelector('#rfxGo').onclick = run;
    const c = main.querySelector('[data-cancel]'); if (c) c.onclick = e => { e.preventDefault(); QP.rfxJob && QP.rfxJob.ctrl.abort(); };
    main.querySelector('[data-empty]').onclick = e => { e.preventDefault(); QP.state.draft = emptyDraft(); QP.save(); QP.render(); };
    main.querySelector('[data-backup]').onclick = async e => {
      e.preventDefault();
      if (!await QP.confirmBox('Load prepared RFx?', 'This skips the AI and loads a prepared 30-line RFx so the rest of the demo can continue. It will be labelled "Prepared — AI skipped".', 'Load prepared RFx')) return;
      QP.state.draft = QP.prepareBackupDraft(); QP.save(); QP.render();
    };
  }

  function emptyDraft() {
    const D = QP.prepareBackupDraft();
    Object.assign(D, { source: 'manual', lines: [], questionnaire: [], brief: input().brief || '' });
    Object.assign(D.meta, { title: '', periodStart: '', periodEnd: '', dueDate: '', priceBasis: 'Rs per piece, landed at plant, excluding GST', paymentDays: QP.COMPANY.standardPaymentDays, minValidityDays: '', fxUSD: '', scope: '' });
    return D;
  }

  async function run() {
    const I = input();
    const ctrl = new AbortController();
    QP.rfxJob = { ctrl, status: 'Reading your file…', started: Date.now() };
    QP.render();
    const setStatus = t => { QP.rfxJob.status = t; const el = document.getElementById('rfxStatus'); if (el) el.textContent = t; };
    try {
      const blob = await QP.files.get(UPLOAD_ID);
      if (!blob) throw new Error('The file is no longer stored in this browser. Choose it again.');
      const contract = await QP.prepareContract(blob, I.fileName);
      setStatus(`AI is organising ${contract.dataRows.length} lines and your brief…`);
      const ai = await QP.structureRfx(contract, I.brief, { signal: ctrl.signal, onStatus: setStatus });
      ai.timing = Object.assign({}, ai.timing, { totalMs: Date.now() - QP.rfxJob.started });
      const yr = ((ai.data.contract || {}).period_start || '').slice(0, 4) || String(new Date().getFullYear() + 1);
      QP.state.draft = QP.buildDraft(ai, contract, I.brief, { id: `SF/RFX/${yr}/003` });
      QP.rfxJob = null; QP.save(); QP.render();
    } catch (e) {
      QP.rfxJob = null; QP.render();
      const anchor = document.querySelector('#rfxGo');
      if (anchor) QP.say(anchor.parentElement, e.cancelled ? 'Cancelled. Nothing was imported.' : e.message + (/Nothing was imported/.test(e.message) ? '' : ' Nothing was imported.'), e.cancelled ? 'info' : 'err');
    }
  }

  // ---------- draft view ----------
  const ORIGIN = {
    upload: r => `<span class="srcchip" title="From your file">📄 Row ${r.srcRow}</span>`,
    brief: r => `<span class="srcchip violet" title="${esc(r.briefQuote || 'From your brief')}">📝 Brief</span>`,
    manual: () => '<span class="srcchip">✍ You</span>',
    prepared: () => '<span class="srcchip">Prepared</span>'
  };

  function draftView(main) {
    const D = QP.state.draft, M = D.meta, ro = !!QP.state.rfxSent;
    const checks = QP.rfxChecks(D);
    const byFocus = {};
    checks.forEach(c => { if (!D.ignored[c.id] && (!byFocus[c.focus] || c.sev === 'red')) byFocus[c.focus] = c; });
    const mark = focus => { const c = byFocus[focus]; return c ? ` bad-${c.sev}" title="${esc(c.title + (c.detail ? ' — ' + c.detail : ''))}` : ''; };
    const red = checks.filter(c => c.sev === 'red' && !D.ignored[c.id]).length, yel = checks.filter(c => c.sev === 'yellow' && !D.ignored[c.id]).length;
    const dis = ro ? 'disabled' : '';

    const kept = D.lines.filter(L => L.origin === 'upload'), added = D.lines.filter(L => L.origin === 'brief');
    const verBad = kept.filter(L => (L.verify || []).length).length;
    const aiInfo = D.ai ? `${esc(D.ai.model || '')}${D.ai.timing && D.ai.timing.totalMs && QP.SHOW_TIMING ? ' · ' + QP.fmtDur(D.ai.timing.totalMs) : ''}` : '';
    let banner = '';
    if (ro) banner = `<div class="banner green">🔒 Sent to ${QP.state.sent ? QP.state.sent.to.length : 5} vendors on ${esc(new Date(QP.state.sent ? QP.state.sent.at : Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}. This version is locked — every quote is judged against it.</div>`;
    else if (D.source === 'ai') banner = `<div class="banner">✨ <b>AI drafted this</b> from ${esc(D.upload.name)} and your brief <span class="info" title="Model: ${aiInfo}">ⓘ</span>
        <div class="chips"><span>${kept.length} lines kept from your file</span><span>${D.dropped.length} dropped per your brief</span><span>${added.length} added from your brief</span>
        <span class="${verBad ? 'warn' : 'ok'}">${verBad ? `⚠ ${verBad} line${verBad > 1 ? 's differ' : ' differs'} from your file` : `✓ Code check: ${kept.length}/${kept.length} kept lines match your file`}</span>
        ${D.skipped.length ? `<span class="warn">⚠ ${D.skipped.length} file row${D.skipped.length > 1 ? 's' : ''} missing</span>` : ''}
        <span>🔒 ${D.upload.privateCols.length} private column${D.upload.privateCols.length === 1 ? '' : 's'} kept from the AI (${esc(D.upload.privateCols.join(', '))})</span></div></div>`;
    else if (D.source === 'prepared') banner = `<div class="banner violet">Prepared RFx loaded — <b>the AI was skipped</b> (demo backup). Everything below is editable.</div>`;

    const fld = (k, label, type = 'text', origin = '', extra = '') => `<label class="fld"><span>${label} ${origin}</span><input ${dis} data-m="${k}" data-focus="meta-${k}" type="${type}" value="${esc(M[k])}" class="${mark('meta-' + k)}" ${extra}></label>`;
    const fromB = k => D.source === 'ai' && M.fromBrief[k] ? '<span class="o">from brief</span>' : '';

    main.innerHTML = `
      <div class="head"><div><h1>Create RFx</h1><p>${ro ? 'The sent version (read-only).' : 'Every field is editable. Blank means nobody told us — it is flagged, never filled with a typical value.'}</p></div>
        <div class="actions">${ro ? '' : `<button class="btn" data-restart>Start over</button>`}<button class="btn primary" onclick="QP.go('review')">${ro ? 'View send record' : 'Review &amp; Send'} →</button></div></div>
      ${banner}
      ${!ro && (red || yel) ? `<div class="small" style="margin:-4px 0 12px">${red ? `<span style="color:var(--red)">● ${red} must fix</span>` : ''} ${yel ? `<span style="color:var(--amber);margin-left:10px">● ${yel} worth a look</span>` : ''} <span class="muted">— marked in the fields below; all listed in Review &amp; Send.</span></div>` : ''}

      <div class="card"><div class="ch"><h3>Contract details</h3></div><div class="cb">
        <div class="form">
          <label class="fld"><span>RFx number <span class="o">system</span></span><input disabled value="${esc(M.id)}"></label>
          <label class="fld"><span>Issue date <span class="o">system</span></span><input disabled value="${esc(QP.fmtDate(M.issueDate))}"></label>
          ${fld('title', 'Title', 'text', fromB('title'), 'style="min-width:280px"')}
          ${fld('dueDate', 'Quotes due', 'date', fromB('dueDate'))}
          ${fld('periodStart', 'Contract start', 'date', fromB('periodStart'))}
          ${fld('periodEnd', 'Contract end', 'date', fromB('periodEnd'))}
        </div>
        <label class="fld" style="margin-top:12px"><span>Scope (vendors read this first) ${D.source === 'ai' ? '<span class="o ai">AI draft</span>' : ''}</span>
          <textarea ${dis} data-m="scope" data-focus="meta-scope" rows="3" class="${mark('meta-scope')}">${esc(M.scope)}</textarea></label>
      </div></div>

      <div class="card" data-focus="lines"><div class="ch"><h3>Line items <span class="muted" style="font-weight:400">(${D.lines.length})</span></h3><span class="grow"></span><span class="small muted">🔒 Last year column is private — never sent to vendors or the AI</span></div>
        <div style="overflow:auto;max-height:62vh"><table class="t edit"><thead><tr><th>#</th><th>Description</th><th>Product use</th><th>Ply</th><th>Board</th><th>Size L×W×H mm</th><th>Weight g</th><th>Printing</th><th>Plant</th><th class="num">Annual qty</th><th>Source</th><th class="num priv">Last year ₹/pc</th><th></th></tr></thead><tbody>
        ${D.lines.map(L => {
          const inp = (k, w, type = 'text') => `<input ${dis} data-l="${L.key}" data-k="${k}" data-focus="line-${L.key}-${k}" type="${type}" style="width:${w}px" value="${esc(L[k])}" class="${mark('line-' + L.key + '-' + k)}">`;
          const chg = (L.changed || []).length ? `<div class="small" style="color:var(--brand)" title="${esc(L.changed.map(c => c.quote).join(' / '))}">changed per brief</div>` : '';
          return `<tr><td title="Item code ${esc(L.code || '—')}">${L.line}</td><td>${inp('desc', 165)}${chg}</td><td>${inp('use', 125)}</td><td>${inp('ply', 40, 'number')}</td><td>${inp('board', 140)}</td><td>${inp('size', 105)}</td><td>${inp('weightG', 62, 'number')}</td><td>${inp('printing', 100)}</td>
            <td><select ${dis} data-l="${L.key}" data-k="plant" data-focus="line-${L.key}-plant" class="${mark('line-' + L.key + '-plant')}"><option value="">— choose —</option>${QP.COMPANY.plants.concat(L.plant && !QP.COMPANY.plants.includes(L.plant) ? [L.plant] : []).map(p => `<option ${p === L.plant ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></td>
            <td class="num">${inp('qty', 78, 'number')}</td><td>${(ORIGIN[L.origin] || ORIGIN.manual)(L)}</td><td class="num priv">${L.lastYear != null ? QP.fmt(L.lastYear, 2) : '<span class="muted">new</span>'}</td>
            <td>${ro ? '' : `<button class="icon-btn" data-delline="${L.key}" title="Remove line">✕</button>`}</td></tr>`;
        }).join('')}
        </tbody></table></div>
        <div class="cb" style="border-top:1px solid var(--line)">${ro ? '' : `<button class="btn sm" data-addline data-focus="addline">+ Add line</button>`}
          ${D.dropped.length ? `<div data-focus="dropped" style="margin-top:${ro ? 0 : 12}px"><div class="small muted" style="margin-bottom:4px">Dropped per your brief (not sent to vendors):</div>
            ${D.dropped.map(x => `<div class="small dropped">✕ <b>${esc(x.desc)}</b> <span class="muted">(row ${x.srcRow}${x.lastYear != null ? ', last year ₹' + QP.fmt(x.lastYear, 2) : ''})</span> — <i>"${esc(x.quote)}"</i> ${ro ? '' : `<a href="#" data-restore="${x.srcRow}">Restore</a>`}</div>`).join('')}</div>` : ''}
        </div></div>

      <div class="card" data-focus="questionnaire"><div class="ch"><h3>Questionnaire</h3><span class="grow"></span><span class="small muted">Tick must-pass: a vendor who fails it can't be awarded</span></div><div class="cb">
        ${D.questionnaire.map((q, i) => itemRow('q', q, i, ro, true)).join('') || '<div class="muted small">No questions yet.</div>'}
        ${ro ? '' : '<button class="btn sm" data-addq style="margin-top:8px">+ Add question</button>'}
      </div></div>

      <div class="card" data-focus="terms"><div class="ch"><h3>Commercial terms</h3></div><div class="cb">
        <div class="form">
          ${fld('priceBasis', 'Price basis', 'text', fromB('priceBasis'), 'style="min-width:340px"')}
          ${fld('paymentDays', 'Payment (days from GRN)', 'number', fromB('paymentDays') || '<span class="o">company standard</span>')}
          ${fld('minValidityDays', 'Quote validity ≥ (days)', 'number', fromB('minValidityDays'))}
          ${fld('fxUSD', '1 USD = ₹', 'number', fromB('fxUSD'), 'step="0.01"')}
        </div>
        <div class="small muted" style="margin:12px 0 4px">Other terms</div>
        ${D.terms.map((t, i) => itemRow('t', t, i, ro, false)).join('') || '<div class="muted small">None.</div>'}
        ${ro ? '' : '<button class="btn sm" data-addt style="margin-top:8px">+ Add term</button>'}
      </div></div>

      <div class="card"><div class="ch"><h3>Company profile</h3><span class="o" style="margin-left:4px">filled in automatically</span></div><div class="cb small kv">
        <div class="k">Company</div><div>${esc(QP.COMPANY.name)} · GSTIN ${esc(QP.COMPANY.gstin)}</div>
        <div class="k">Address</div><div>${esc(QP.COMPANY.address)}</div>
        <div class="k">Buyer</div><div>${esc(QP.COMPANY.buyer)} · ${esc(QP.COMPANY.email)} · ${esc(QP.COMPANY.phone)}</div>
        <div class="k">Delivery plants</div><div>${QP.COMPANY.plants.map(p => `<b>${esc(p)}</b>: ${esc(QP.COMPANY.plantAddresses[p])}`).join('<br>')}</div>
      </div></div>`;

    if (ro) return focusFromHash(main);
    // edits (on change = when leaving the field)
    main.querySelectorAll('[data-m]').forEach(el => el.onchange = () => {
      const k = el.dataset.m; M[k] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; touch(); QP.render();
    });
    main.querySelectorAll('[data-l]').forEach(el => el.onchange = () => {
      const L = D.lines.find(x => x.key === el.dataset.l), k = el.dataset.k;
      L[k] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
      L.verify = (L.verify || []).filter(v => v.field !== k && !(k === 'size' && v.field === 'size'));   // you checked it
      L.changed = (L.changed || []).filter(c => c.field !== k);
      touch(); QP.render();
    });
    main.querySelectorAll('[data-delline]').forEach(b => b.onclick = async () => {
      const L = D.lines.find(x => x.key === b.dataset.delline);
      if (!await QP.confirmBox('Remove this line?', `Line ${L.line} · ${esc(L.desc || 'blank')} will be removed from the RFx.`, 'Remove', true)) return;
      D.lines = D.lines.filter(x => x !== L); renumber(); touch(); QP.render();
    });
    const al = main.querySelector('[data-addline]');
    if (al) al.onclick = () => {
      const key = 'm' + Date.now().toString(36);
      D.lines.push({ key, origin: 'manual', srcRow: null, code: '', desc: '', use: '', ply: '', board: '', size: '', weightG: '', printing: '', plant: '', qty: '', lastYear: null, supplier2026: null, verify: [], changed: [] });
      renumber(); touch(); history.replaceState(null, '', `#create?focus=line-${key}-desc`); QP.render();
    };
    main.querySelectorAll('[data-restore]').forEach(a => a.onclick = e => {
      e.preventDefault();
      const x = D.dropped.find(d => d.srcRow === Number(a.dataset.restore));
      D.dropped = D.dropped.filter(d => d !== x);
      const key = 'r' + x.srcRow;
      D.lines.push({ key, origin: 'upload', srcRow: x.srcRow, code: '', desc: x.desc, use: '', ply: '', board: '', size: '', weightG: '', printing: '', plant: '', qty: '', lastYear: x.lastYear, supplier2026: x.supplier2026, verify: [], changed: [] });
      renumber(); touch(); history.replaceState(null, '', `#create?focus=line-${key}-ply`); QP.render();
    });
    main.querySelector('[data-restart]').onclick = async () => {
      if (!await QP.confirmBox('Start over?', 'This discards the draft and all your edits. Your file and brief are kept.', 'Discard draft', true)) return;
      QP.state.draft = null; QP.save(); QP.render();
    };
    // questionnaire + terms
    const list = t => t === 'q' ? D.questionnaire : D.terms;
    main.querySelectorAll('[data-it]').forEach(el => {
      const arr = list(el.dataset.it), item = arr[Number(el.dataset.i)];
      if (el.dataset.act === 'text') el.onchange = () => { item.text = el.value; touch(); QP.render(); };
      if (el.dataset.act === 'must') el.onchange = () => { item.mustPass = el.checked; touch(); QP.render(); };
      if (el.dataset.act === 'accept') el.onclick = () => { item.status = 'accepted'; touch(); QP.render(); };
      if (el.dataset.act === 'reject' || el.dataset.act === 'del') el.onclick = () => { arr.splice(Number(el.dataset.i), 1); touch(); QP.render(); };  // rejected = gone, no trace
    });
    const aq = main.querySelector('[data-addq]'); if (aq) aq.onclick = () => { D.questionnaire.push({ id: 'q' + Date.now().toString(36), topic: 'other', text: '', origin: 'manual', status: 'accepted', mustPass: false }); touch(); QP.render(); };
    const at = main.querySelector('[data-addt]'); if (at) at.onclick = () => { D.terms.push({ id: 't' + Date.now().toString(36), text: '', origin: 'manual', status: 'accepted' }); touch(); QP.render(); };
    focusFromHash(main);
  }

  function itemRow(t, x, i, ro, isQ) {
    const dis = ro ? 'disabled' : '';
    const pending = x.status === 'pending';
    const chip = x.origin === 'ai_suggestion' ? `<span class="o ai">AI suggestion${pending ? '' : ' · accepted'}</span>` : x.origin === 'brief' ? '<span class="o">from brief</span>' : '<span class="o">added by you</span>';
    return `<div class="item ${pending ? 'sugg' : ''}">
      ${isQ ? `<label class="small must" title="Must-pass"><input type="checkbox" ${dis} ${pending ? 'disabled' : ''} data-it="${t}" data-i="${i}" data-act="must" ${x.mustPass ? 'checked' : ''}> must-pass</label>` : ''}
      <div class="grow"><input ${dis} class="itext" data-it="${t}" data-i="${i}" data-act="text" value="${esc(x.text)}" placeholder="${isQ ? 'Question for vendors' : 'Term'}">
        <div class="small" style="margin-top:3px">${chip}${pending && x.reason ? ` <span class="muted">${esc(x.reason)}</span>` : ''}</div></div>
      ${ro ? '' : pending ? `<button class="btn sm primary" data-it="${t}" data-i="${i}" data-act="accept">Accept</button><button class="btn sm" data-it="${t}" data-i="${i}" data-act="reject">Reject</button>`
        : `<button class="icon-btn" data-it="${t}" data-i="${i}" data-act="del" title="Remove">✕</button>`}
    </div>`;
  }

  function renumber() { QP.state.draft.lines.forEach((L, i) => { L.line = i + 1; }); }

  function focusFromHash(main) {
    const f = QP.hashParam('focus');
    if (!f) return;
    history.replaceState(null, '', '#create');
    const el = main.querySelector(`[data-focus="${CSS.escape(f)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    if (el.focus && /INPUT|SELECT|TEXTAREA|BUTTON/.test(el.tagName)) el.focus();
    el.classList.add('flashfocus'); setTimeout(() => el.classList.remove('flashfocus'), 2200);
  }

  QP.screens.create = main => {
    if (QP.state.rfxSent && !QP.state.draft) {
      main.innerHTML = `<div class="head"><div><h1>Create RFx</h1><p>This RFx was sent with an earlier version of the app. Reset the demo to create one here.</p></div></div>`;
      return;
    }
    if (!QP.state.draft) return startView(main);
    draftView(main);
  };
})();
