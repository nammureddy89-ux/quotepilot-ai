// Stage 2 — Review & Send: plain checks + an AI read-through, Fix or Ignore (with reason), vendor copy, send and lock.
window.QP = window.QP || {};
QP.screens = QP.screens || {};

(function () {
  const esc = s => QP.esc(s);
  QP.rfxCheckJob = QP.rfxCheckJob || null;
  const aiId = f => 'ai-' + String(f.title + ' ' + (f.quote || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);

  function allChecks(D) {
    const rule = QP.rfxChecks(D);
    if (QP.rfxCheckJob) return rule;   // AI findings are hidden while the AI re-reads the latest version
    const ai = (D.aiCheck && D.aiCheck.findings || []).map(f => {
      let id = aiId(f);
      // same point, new wording: keep it ignored (same category at the same place)
      const prev = Object.keys(D.ignored).find(k => { const g = D.ignored[k]; return g.src === 'ai' && g.category && g.category === f.category && g.whereKey === f.whereKey; });
      if (prev) id = prev;
      return Object.assign({}, f, { id });
    });
    return rule.concat(ai);
  }

  QP.runRfxAiCheck = async function () {
    const D = QP.state.draft, ctrl = new AbortController();
    QP.rfxCheckJob = { ctrl, status: 'AI is reading the RFx…', started: Date.now() };
    QP.render();
    try {
      const res = await QP.aiCheckRfx(D, { signal: ctrl.signal, onStatus: t => { QP.rfxCheckJob.status = t; const el = document.getElementById('aiChkStatus'); if (el) el.textContent = t; } });
      res.timing = Object.assign({}, res.timing, { totalMs: Date.now() - QP.rfxCheckJob.started });
      D.aiCheck = res; D.aiCheckError = null;
    } catch (e) {
      D.aiCheckError = e.cancelled ? 'Cancelled.' : e.message; D.aiCheckErrorRev = D.rev;
    }
    QP.rfxCheckJob = null; QP.save(); QP.render();
  };

  function checkRow(c, D, ro) {
    const ig = D.ignored[c.id];
    const srcChip = c.src === 'ai' ? '<span class="o ai">AI check</span>' : '<span class="o">Plain check</span>';
    return `<div class="flag ${ig ? 'done' : ''}" data-cid="${esc(c.id)}">
      <div class="dot ${c.sev === 'red' ? 'red' : 'yellow'}"></div>
      <div><div class="title">${esc(c.title)} ${srcChip}</div>
        ${c.detail ? `<div class="small" style="margin-top:2px">${esc(c.detail)}</div>` : ''}
        ${c.quote ? `<div class="small muted" style="margin-top:2px">“${esc(c.quote)}”</div>` : ''}
        ${ig ? `<div class="small" style="margin-top:6px">Ignored — <i>${esc(ig.reason)}</i> ${ro ? '' : '<a href="#" data-undo>Undo</a>'}</div>`
          : ro ? '' : `<div class="act">
            ${c.rerun ? '<button class="btn sm" data-rerun>Re-run AI check</button>' : c.focus ? '<button class="btn sm primary" data-fix>Fix →</button>' : ''}
            ${c.canIgnore ? '<button class="btn sm" data-ignore>Ignore…</button>' : '<span class="small muted">Must be fixed — vendors can\'t quote correctly without it.</span>'}
          </div>`}
      </div></div>`;
  }

  function vendorCopy(D) {
    const M = D.meta, C = QP.COMPANY;
    const q = D.questionnaire.filter(x => x.status === 'accepted'), t = D.terms.filter(x => x.status === 'accepted');
    return `<div class="vcopy">
      <div class="small muted">From: ${esc(C.buyer.split(',')[0])} &lt;${esc(C.email)}&gt; · To: each vendor separately · Channel: email (simulated)</div>
      <div style="margin:4px 0 10px"><b>Subject:</b> Request for quotation ${esc(M.id)} — ${esc(M.title)} · due ${esc(QP.fmtDate(M.dueDate))}</div>
      <div class="doc">
        <h3 style="margin:0">${esc(M.title)}</h3>
        <div class="small muted">RFx ${esc(M.id)} · Issued ${esc(QP.fmtDate(M.issueDate))} by ${esc(C.name)}, ${esc(C.address)} · GSTIN ${esc(C.gstin)}</div>
        <p style="margin-top:10px">${esc(M.scope)}</p>
        <div class="kv small" style="margin:8px 0 12px">
          <div class="k">Quotes due</div><div>${esc(QP.fmtDate(M.dueDate))}</div>
          <div class="k">Contract period</div><div>${esc(QP.fmtDate(M.periodStart))} – ${esc(QP.fmtDate(M.periodEnd))}</div>
          <div class="k">Price basis</div><div>${esc(M.priceBasis)}</div>
          <div class="k">Payment</div><div>${esc(M.paymentDays)} days from GRN</div>
          <div class="k">Quote validity</div><div>at least ${esc(M.minValidityDays)} days</div>
          <div class="k">Foreign currency</div><div>converted at 1 USD = ₹${esc(M.fxUSD)}</div>
          <div class="k">Delivery plants</div><div>${C.plants.map(p => `${esc(p)} — ${esc(C.plantAddresses[p])}`).join('<br>')}</div>
        </div>
        <table class="t" style="font-size:12px"><thead><tr><th>#</th><th>Item</th><th>Ply / board</th><th>Size (mm)</th><th class="num">Box weight (g)</th><th>Printing</th><th>Plant</th><th class="num">Annual qty</th><th class="num">Your price ₹/pc</th></tr></thead><tbody>
          ${D.lines.map(L => `<tr><td>${L.line}</td><td>${esc(L.desc)}${L.use ? `<div class="muted">${esc(L.use)}</div>` : ''}</td><td>${esc(L.board || L.ply + '-ply')}</td><td>${esc(L.size)}</td><td class="num">${esc(L.weightG || '—')}</td><td>${esc(L.printing)}</td><td>${esc(L.plant)}</td><td class="num">${Number(L.qty || 0).toLocaleString('en-IN')}</td><td class="num muted">______</td></tr>`).join('')}
        </tbody></table>
        <h4>Questionnaire</h4><ol>${q.map(x => `<li>${esc(x.text)}</li>`).join('')}</ol>
        ${t.length ? `<h4>Other terms</h4><ol>${t.map(x => `<li>${esc(x.text)}</li>`).join('')}</ol>` : ''}
      </div>
    </div>`;
  }

  function sentView(main) {
    const S = QP.state.sent, D = QP.state.draft;
    const ig = (S.ignored || []);
    main.innerHTML = `<div class="head"><div><h1>Review &amp; Send</h1><p>Sent and locked. Every quote is judged against this version.</p></div>
        <div class="actions"><button class="btn primary" onclick="QP.go('responses')">Vendor responses →</button></div></div>
      <div class="banner green">🔒 RFx ${esc(QP.state.rfx.id)} sent by email (simulated) on ${esc(new Date(S.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))} to ${S.to.length} vendors.</div>
      <div class="card"><div class="ch"><h3>Send record</h3></div><div class="cb small kv">
        <div class="k">Sent to</div><div>${S.to.map(v => `${esc(v.name)} &lt;${esc(v.email)}&gt;`).join('<br>')}</div>
        <div class="k">Warnings ignored</div><div>${ig.length ? ig.map(x => `${x.sev === 'red' ? '🔴' : '🟡'} ${esc(x.title)} <span class="muted">(${x.src === 'ai' ? 'AI check' : 'plain check'})</span> — <i>${esc(x.reason)}</i>`).join('<br>') : 'None'}</div>
        <div class="k">AI check</div><div>${S.aiCheck ? `${S.aiCheck.findings} finding${S.aiCheck.findings === 1 ? '' : 's'} on the sent version${S.aiCheck.current ? '' : ' <span class="muted">(run on an earlier version)</span>'}` : 'Not run'}</div>
      </div></div>
      ${D ? `<details class="card" open><summary class="ch"><h3>What vendors received</h3></summary><div class="cb">${vendorCopy(D)}</div></details>` : ''}`;
  }

  QP.screens.review = main => {
    const D = QP.state.draft;
    if (QP.state.rfxSent && QP.state.sent) return sentView(main);
    if (!D) {
      main.innerHTML = `<div class="head"><div><h1>Review &amp; Send</h1><p>Create the RFx first.</p></div></div><div class="card"><div class="cb empty"><button class="btn primary" onclick="QP.go('create')">Create RFx →</button></div></div>`;
      return;
    }
    // Read automatically on first visit, and again whenever the RFx changed since the last check.
    const stale = !D.aiCheck || D.aiCheck.rev !== D.rev;
    if (stale && !QP.rfxCheckJob && D.aiCheckErrorRev !== D.rev && D.lines.length) setTimeout(QP.runRfxAiCheck, 0);

    const checks = allChecks(D);
    const open = checks.filter(c => !D.ignored[c.id]);
    const red = open.filter(c => c.sev === 'red'), yel = open.filter(c => c.sev === 'yellow');
    const ignored = checks.filter(c => D.ignored[c.id]);
    const job = QP.rfxCheckJob, A = D.aiCheck;
    const aiStatus = job ? `<span class="spinner"></span> <span id="aiChkStatus">${esc(job.status)}</span> <a href="#" class="stoplink" data-aicancel>Cancel</a>`
      : D.aiCheckError && D.aiCheckErrorRev === D.rev ? `<span style="color:var(--red)">${esc(D.aiCheckError)}</span> <button class="btn sm" data-rerun>Try again</button>`
      : A ? `${A.findings.length ? `<b>${A.findings.length} finding${A.findings.length > 1 ? 's' : ''}</b> — in the list below, marked “AI check”` : '<span style="color:var(--green)">✓ No problems found</span>'}
          ${A.timing && A.timing.totalMs ? `<span class="muted"> · checked in ${QP.fmtDur(A.timing.totalMs) || '1 s'}</span>` : ''} <span class="info" title="Model: ${esc(A.model || '')}">ⓘ</span> <button class="btn sm" data-rerun style="margin-left:8px">Run again</button>`
      : '<button class="btn sm" data-rerun>Run AI check</button>';
    const sorted = [...red, ...yel];

    main.innerHTML = `
      <div class="head"><div><h1>Review &amp; Send</h1><p>Plain checks and an AI read-through before any vendor sees the RFx. Sending is blocked until every 🔴 is fixed or consciously ignored with a reason.</p></div>
        <div class="actions"><button class="btn" onclick="QP.go('create')">← Edit RFx</button></div></div>
      <div class="kpis">
        <div class="kpi"><div class="l">Must fix</div><div class="v" style="color:${red.length ? 'var(--red)' : 'var(--green)'}">${red.length || '✓ 0'}</div></div>
        <div class="kpi"><div class="l">Worth a look</div><div class="v" style="color:${yel.length ? 'var(--amber)' : '#98a2b3'}">${yel.length}</div></div>
        <div class="kpi"><div class="l">Ignored with a reason</div><div class="v">${ignored.length}</div></div>
      </div>
      <div class="card"><div class="cb"><div class="row" style="align-items:flex-start"><div style="flex:1"><b>✨ AI check</b>
        <div class="aiwhat">Reads the RFx the way a vendor would and looks for contradictions, the wrong year or period, items you asked to drop that are still there, and old supplier names or contract numbers. It runs again by itself after you edit.</div></div></div>
        <div class="small" style="margin-top:8px">${aiStatus}</div></div></div>
      <div class="card"><div class="ch"><h3>Checks before sending</h3><span class="grow"></span><span class="small muted">${D.lines.length} lines · ${D.questionnaire.filter(q => q.status === 'accepted').length} questions</span></div>
        ${sorted.map(c => checkRow(c, D, false)).join('')}
        ${job ? `<div class="flag"><div><span class="spinner"></span></div><div><div class="title">AI check is reading your latest version…</div><div class="small muted" style="margin-top:2px">Its findings will appear here in a few seconds.</div></div></div>` : !sorted.length ? '<div class="cb tile-ok">✓ Everything checks out.</div>' : ''}
        ${ignored.length ? `<div class="cb small muted" style="border-top:1px solid var(--line)">Ignored (saved with the send record):</div>${ignored.map(c => checkRow(c, D, false)).join('')}` : ''}
      </div>
      <div class="card"><div class="ch"><h3>Send</h3></div><div class="cb">
        <div class="kv small"><div class="k">Channel</div><div>✉ Email <span class="muted">(simulated — no real email leaves the app)</span></div>
          <div class="k">Recipients</div><div><div class="muted" style="margin-bottom:4px">From your approved supplier list (vendor master). In this prototype the list is stored in the app; in a live system it would come from the ERP / supplier master.</div>${QP.VENDORS.map(v => `${esc(v.name)} · ${esc(v.contact)} &lt;${esc(v.email)}&gt; <span class="pill ${v.status2026 === 'Incumbent' ? 'grey' : 'blue'}">${v.status2026 === 'Incumbent' ? 'current supplier' : 'new'}</span>`).join('<br>')}</div></div>
        <div class="row" style="margin-top:10px"><button class="btn" data-preview>👁 Preview what vendors receive</button></div>
        <div class="row" style="margin-top:14px"><button class="btn primary" id="sendBtn" ${red.length || job ? 'disabled' : ''}>Send RFx to ${QP.VENDORS.length} vendors</button>
          ${job ? '<span class="small muted">Waiting for the AI check to finish…</span>' : red.length ? `<span class="small" style="color:var(--red)">Fix or ignore ${red.length} must-fix item${red.length > 1 ? 's' : ''} first.</span>` : yel.length ? `<span class="small muted">${yel.length} item${yel.length > 1 ? 's' : ''} worth a look — sending is allowed.</span>` : ''}</div>
      </div></div>`;

    // actions on check rows
    main.querySelectorAll('.flag[data-cid]').forEach(row => {
      const c = checks.find(x => x.id === row.dataset.cid);
      const fix = row.querySelector('[data-fix]'); if (fix) fix.onclick = () => { location.hash = 'create?focus=' + encodeURIComponent(c.focus); };
      const undo = row.querySelector('[data-undo]'); if (undo) undo.onclick = e => { e.preventDefault(); delete D.ignored[c.id]; QP.save(); QP.render(); };
      const ign = row.querySelector('[data-ignore]');
      if (ign) ign.onclick = () => {
        const act = row.querySelector('.act');
        act.outerHTML = `<div class="actform"><label class="small">Why are you ignoring this?<input class="reason" placeholder="e.g. False alarm — the due date is correct"></label>
          <div class="row"><button class="btn sm primary" data-ok disabled>Ignore</button><button class="btn sm" data-cx>Cancel</button><span class="small muted">Saved with the send record.</span></div></div>`;
        const f = row.querySelector('.actform'), inp = f.querySelector('input'), ok = f.querySelector('[data-ok]');
        inp.focus(); inp.oninput = () => { ok.disabled = !inp.value.trim(); };
        f.querySelector('[data-cx]').onclick = () => QP.render();
        ok.onclick = () => { D.ignored[c.id] = { reason: inp.value.trim(), at: new Date().toISOString(), title: c.title, detail: c.detail, sev: c.sev, src: c.src, category: c.category || null, whereKey: c.whereKey || null }; QP.save(); QP.render(); };
      };
    });
    main.querySelector('[data-preview]').onclick = () => QP.modal('What each vendor receives', vendorCopy(D), { width: 1100 });
    main.querySelectorAll('[data-rerun]').forEach(b => b.onclick = () => QP.runRfxAiCheck());
    const ac = main.querySelector('[data-aicancel]'); if (ac) ac.onclick = e => { e.preventDefault(); QP.rfxCheckJob && QP.rfxCheckJob.ctrl.abort(); };

    main.querySelector('#sendBtn').onclick = async () => {
      if (!await QP.confirmBox('Send the RFx?', `RFx ${esc(D.meta.id)} will be emailed to ${QP.VENDORS.length} vendors (simulated in this prototype). After sending you can't edit it. Every quote is compared against this exact version.`, 'Send to vendors')) return;
      if (QP.rfxCheckJob) QP.rfxCheckJob.ctrl.abort();
      const ignoredList = Object.values(D.ignored);
      QP.state.rfx = QP.buildSentRfx(D);
      QP.state.rfxSent = true;
      QP.state.sent = { at: new Date().toISOString(), channel: 'email_simulated', to: QP.VENDORS.map(v => ({ id: v.id, name: v.name, email: v.email })), ignored: ignoredList,
        aiCheck: D.aiCheck ? { findings: D.aiCheck.findings.length, model: D.aiCheck.model, at: D.aiCheck.at, current: D.aiCheck.rev === D.rev } : null };
      Object.assign(QP.state, { vendors: {}, decisions: {}, changeLog: [], freightEstimates: {} });
      QP.save();
      QP.flash = { text: `RFx sent to ${QP.VENDORS.length} vendors (email simulated). Replies will appear here as they arrive.`, kind: 'ok' };
      QP.go('responses');
    };
  };
})();
