// Stage 4 — Review Issues: every flag with its source, and buyer actions (confirm / correct / assumption / ask vendor).
window.QP = window.QP || {};
QP.screens = QP.screens || {};

(function () {
  const esc = s => QP.esc(s);
  QP.issueFilter = QP.issueFilter || { sev: 'open', vendor: 'all' };
  QP.justDone = QP.justDone || {};   // flagId -> time; keeps a just-resolved issue visible for a moment

  QP.decide = function (flag, action, value, reason) {
    const prev = QP.state.decisions[flag.id];
    QP.state.decisions[flag.id] = { action, value: value === '' ? null : value, reason: reason || '', at: new Date().toISOString() };
    QP.state.changeLog.push({ at: new Date().toISOString(), flagId: flag.id, vendorId: flag.vendor, line: flag.line, action, from: prev ? prev.action : null, value, reason });
    QP.save();
    QP.justDone[flag.id] = Date.now();
    QP.render();
    setTimeout(() => { delete QP.justDone[flag.id]; if ((location.hash || '').startsWith('#issues')) QP.render(); }, 2200);
  };
  QP.undoDecision = function (flag) {
    delete QP.state.decisions[flag.id];
    QP.state.changeLog.push({ at: new Date().toISOString(), flagId: flag.id, vendorId: flag.vendor, line: flag.line, action: 'undo' });
    QP.save(); QP.render();
  };

  const ACTION_LABEL = { confirm: 'Accepted', confirm_gap: 'Accepted as not quoted', correct: 'Corrected', assume: 'Your estimate', accept_proposal: "Last year's price used (vendor to confirm)", ask: 'Asked vendor' };

  function flagHtml(f) {
    const V = QP.VENDORS.find(v => v.id === f.vendor);
    const d = f.decision;
    const src = f.source ? `<button class="icon-btn" title="View in original file" data-src="${esc(f.id)}">📍</button>` : '';
    let act = '';
    if (d && d.action !== 'ask') {
      act = `<div class="act"><span class="pill ${f.sev === 'red' ? 'violet' : 'green'}">✓ ${ACTION_LABEL[d.action] || d.action}${d.value != null ? ': ' + esc(d.value) : ''}</span>${d.reason ? `<span class="small muted">“${esc(d.reason)}”</span>` : ''}<button class="btn sm" data-undo="${esc(f.id)}">Undo</button></div>`;
    } else {
      const needReason = f.sev === 'red';
      const parts = [];
      const fresh = QP.justSent && QP.justSent[f.id] && Date.now() - QP.justSent[f.id] < 6000;
      if (d && d.action === 'ask') parts.push(`<span class="pill ${fresh ? 'green' : 'amber'}">${fresh ? '✓ Email sent (simulated) · ' : '✉ '}Waiting for vendor reply · asked ${new Date(d.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span><a href="#" class="small" data-sent="${esc(f.vendor)}">view message</a>`);
      (f.actions || []).forEach(a => {
        if (a === 'confirm') parts.push('<button class="btn sm" data-a="confirm">Accept</button>');
        if (a === 'confirm_gap') parts.push('<button class="btn sm" data-a="confirm_gap">Accept as not quoted</button>');
        if (a === 'remove_reply') parts.push('<button class="btn sm danger" data-a="remove_reply">Remove this reply</button>');
        if (a === 'accept_proposal') parts.push(`<button class="btn sm primary" data-a="accept_proposal">Use last year ₹${QP.fmt(f.proposal)} (vendor to confirm)</button>`);
        if (a === 'correct') parts.push('<button class="btn sm" data-a="correct">Enter correct value…</button>');
        if (a === 'assume') parts.push('<button class="btn sm" data-a="assume">Enter my estimate…</button>');
        if (a === 'ask' && !(d && d.action === 'ask')) parts.push('<button class="btn sm" data-a="ask">Ask vendor</button>');
      });
      act = `<div class="act">${parts.join('')}</div><div class="actform" data-form style="display:none">
        <label class="small" data-vallabel>${esc(f.assumeLabel || '₹ per piece, excl. GST')}<br><input type="number" step="0.001" min="0" data-val></label>
        <label class="small" data-reasonlabel><span data-rlabel></span><br><input class="reason" data-reason></label>
        <div class="row"><button class="btn sm primary" data-save disabled>Save</button><button class="btn sm" data-cancel>Cancel</button></div>
        <div class="small muted" data-hint></div></div>`;
    }
    const just = QP.justDone[f.id] && d;
    return `<div class="flag ${just ? 'just' : d && d.action !== 'ask' ? 'done' : ''}" data-flag="${esc(f.id)}">
      <div><div class="dot ${f.sev}"></div></div>
      <div><div class="row"><span class="title">${esc(f.title)}</span><span class="pill grey">${esc(V.name)}</span>${f.groupLines ? `<span class="pill grey">${f.groupLines.length} lines</span>` : ''}${src}</div>
      <div style="margin-top:4px">${esc(f.detail)}</div>${act}</div></div>`;
  }

  QP.screens.issues = function (main) {
    const filter = QP.issueFilter;
    const m = QP.model;
    // A filter pointing at a vendor that is no longer read (e.g. being re-read) would silently show nothing.
    if (filter.vendor !== 'all' && !m.processedIds.includes(filter.vendor)) filter.vendor = 'all';
    if (!m.processedIds.length) {
      main.innerHTML = `<div class="head"><div><h1>Review issues</h1><p>Nothing processed yet.</p></div></div><div class="card empty">Process vendor replies first. <br><br><button class="btn primary" onclick="QP.go('responses')">Go to Vendor responses</button></div>`;
      return;
    }
    let flags = m.flags.slice();
    if (filter.vendor !== 'all') flags = flags.filter(f => f.vendor === filter.vendor);
    const counts = {
      open: flags.filter(f => f.open).length, red: flags.filter(f => f.open && f.sev === 'red').length,
      yellow: flags.filter(f => f.open && f.sev === 'yellow').length, done: flags.filter(f => !f.open).length
    };
    const showing = f => f.open || QP.justDone[f.id];
    if (filter.sev === 'open') flags = flags.filter(showing);
    if (filter.sev === 'red') flags = flags.filter(f => showing(f) && f.sev === 'red');
    if (filter.sev === 'yellow') flags = flags.filter(f => showing(f) && f.sev === 'yellow');
    if (filter.sev === 'done') flags = flags.filter(f => !f.open);
    flags.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'red' ? -1 : 1) || a.vendor.localeCompare(b.vendor) || (a.line || 0) - (b.line || 0));

    const allRed = m.flags.filter(f => f.open && f.sev === 'red').length;
    main.innerHTML = `
      <div class="head"><div><h1>Review issues</h1><p>Values the AI read clearly and that passed every check are accepted automatically. Everything else is listed here. 🔴 must be resolved before award · 🟡 worth a check · 📍 opens the original file.</p></div>
        <div class="actions"><button class="btn" onclick="QP.go('compare')">Open comparison →</button></div></div>
      <div class="kpis">
        <div class="kpi"><div class="l">Must resolve (all vendors)</div><div class="v">${allRed ? `<span style="color:var(--red)">${allRed}</span>` : '<span class="tile-ok">✓ All resolved</span>'}</div></div>
        ${m.processedIds.map(id => { const vo = m.vendors[id];
          const val = !vo.openRed && !vo.openYellow ? '<span class="tile-ok">✓ All resolved</span>'
            : `<div class="cnt ${vo.openRed ? 'r' : 'z'}">🔴 <b>${vo.openRed}</b> must resolve</div><div class="cnt ${vo.openYellow ? 'y' : 'z'}">🟡 <b>${vo.openYellow}</b> worth a check</div>`;
          return `<div class="kpi"><div class="l">${esc(vo.name)}</div><div class="v" style="font-size:16px">${val}</div><a href="#" class="small" data-msgv="${id}">✉ Message vendor</a></div>`; }).join('')}
      </div>
      <div class="tabs" id="sevTabs">
        <button data-s="open" class="${filter.sev === 'open' ? 'on' : ''}">Open (${counts.open})</button>
        <button data-s="red" class="${filter.sev === 'red' ? 'on' : ''}">🔴 Must resolve (${counts.red})</button>
        <button data-s="yellow" class="${filter.sev === 'yellow' ? 'on' : ''}">🟡 Check (${counts.yellow})</button>
        <button data-s="done" class="${filter.sev === 'done' ? 'on' : ''}">Resolved (${counts.done})</button>
        <span class="grow"></span>
        <select id="vfilter" class="btn sm"><option value="all">All vendors</option>${m.processedIds.map(id => `<option value="${id}" ${filter.vendor === id ? 'selected' : ''}>${esc(m.vendors[id].name)}</option>`).join('')}</select>
      </div>
      <div class="card">${flags.map(flagHtml).join('') || `<div class="empty">${counts.open || counts.done ? 'No issues match this filter.' : 'Nothing to review. 🎉'}</div>`}</div>`;

    main.querySelectorAll('#sevTabs [data-s]').forEach(b => b.onclick = () => { filter.sev = b.dataset.s; QP.render(); });
    main.querySelectorAll('[data-msgv]').forEach(a => a.onclick = e => { e.preventDefault(); QP.messageVendor(a.dataset.msgv); });
    main.querySelector('#vfilter').onchange = e => { filter.vendor = e.target.value; QP.render(); };
    main.querySelectorAll('[data-flag]').forEach(el => {
      const f = m.flags.find(x => x.id === el.dataset.flag);
      const srcEl = el.querySelector('[data-src]');
      if (srcEl) srcEl.onclick = e => { e.stopPropagation();
        const c = f.line ? m.vendors[f.vendor].cells[f.line] : null;
        QP.showSource(f.vendor, f.source, { title: f.title, steps: c && c.steps, note: f.detail });
      };
      const undo = el.querySelector('[data-undo]'); if (undo) undo.onclick = () => QP.undoDecision(f);
      const sentL = el.querySelector('[data-sent]'); if (sentL) sentL.onclick = e => { e.preventDefault(); QP.showSent(f.vendor); };
      const form = el.querySelector('[data-form]');
      let pending = null;
      el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'remove_reply') { QP.removeVendorReply(f.vendor); return; }
        if (a === 'ask') { QP.askVendor(f); return; }
        if (a === 'confirm_gap' || a === 'accept_proposal' || (a === 'confirm' && f.sev !== 'red')) { QP.decide(f, a, null, ''); return; }
        pending = a;
        form.style.display = 'flex';
        const needVal = a !== 'confirm', needReason = f.sev === 'red';
        form.querySelector('[data-vallabel]').style.display = needVal ? '' : 'none';
        form.querySelector('[data-rlabel]').textContent = a === 'confirm' ? 'Why are you accepting this?' : needReason ? 'Reason' : 'Reason (optional)';
        form.querySelector('[data-save]').textContent = a === 'confirm' ? 'Accept' : 'Save';
        form.querySelector('[data-hint]').textContent = needReason ? 'Your reason is saved with the award record.' : '';
        sync();
        (needVal ? form.querySelector('[data-val]') : form.querySelector('[data-reason]')).focus();
      });
      // Save stays greyed out until what is required is filled in, so no error message is needed.
      function sync() {
        if (!form) return;
        const v = form.querySelector('[data-val]').value, r = form.querySelector('[data-reason]').value.trim();
        const valOk = pending === 'confirm' || (v !== '' && !isNaN(Number(v)) && Number(v) > 0);
        const reasonOk = f.sev !== 'red' || !!r;
        form.querySelector('[data-save]').disabled = !(valOk && reasonOk);
      }
      if (form) {
        form.querySelector('[data-val]').oninput = sync;
        form.querySelector('[data-reason]').oninput = sync;
        form.querySelector('[data-reason]').onkeydown = e => { if (e.key === 'Enter' && !form.querySelector('[data-save]').disabled) form.querySelector('[data-save]').click(); };
        form.querySelector('[data-cancel]').onclick = () => { form.style.display = 'none'; };
        form.querySelector('[data-save]').onclick = () => {
          const val = form.querySelector('[data-val]').value;
          const reason = form.querySelector('[data-reason]').value.trim();
          QP.decide(f, pending, pending === 'confirm' ? null : Number(val), reason);
        };
      }
    });
  };
})();
