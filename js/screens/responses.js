// Stage 3 — Vendor Responses: who has replied, add replies, run AI extraction.
window.QP = window.QP || {};
QP.screens = QP.screens || {};
QP.busy = QP.busy || {};

(function () {
  const esc = s => QP.esc(s);
  const STATUS = {
    not_responded: ['grey', 'Not responded'],
    responded: ['blue', 'Received — not read yet'],
    processed: ['green', 'Read by AI'],
    stale: ['amber', 'New files — not read yet']
  };

  async function addBlob(vendorId, blob, name, mime) {
    const vs = QP.vendorState(vendorId);
    const id = `${vendorId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await QP.files.put(id, blob);
    vs.files.push({ id, name, mime: mime || blob.type || '', size: blob.size, addedAt: new Date().toISOString() });
    vs.status = vs.extraction ? 'stale' : 'responded';
    vs.error = null;
    QP.save();
  }

  // ---------- automatic processing queue: one vendor at a time ----------
  QP.queue = QP.queue || [];
  let running = false;
  QP.enqueue = function (vendorId) {
    if (!QP.queue.includes(vendorId) && !QP.busy[vendorId]) QP.queue.push(vendorId);
    QP.render();
    runQueue();
  };
  async function runQueue() {
    if (running) return;
    running = true;
    while (QP.queue.length) {
      const id = QP.queue.shift();
      const vs = QP.state.vendors[id];
      if (vs && vs.files.length) await QP.processVendor(id);
    }
    running = false;
  }

  QP.simulateReplies = async function () {
    const btn = document.getElementById('simBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Receiving…'; }
    let n = 0;
    for (const V of QP.VENDORS) {
      if (!V.samples.length) continue;
      const vs = QP.vendorState(V.id);
      if (vs.files.length) continue;
      for (const name of V.samples) {
        const r = await fetch(`samples/${V.id}/${encodeURIComponent(name)}`);
        if (!r.ok) { QP.toast(`Could not load sample ${name}`); continue; }
        const blob = await r.blob();
        await addBlob(V.id, blob, name, blob.type);
      }
      n++;
      QP.enqueue(V.id);
    }
    QP.toast(n ? `${n} vendor replies arrived. The AI will read them one by one.` : 'Sample replies are already loaded.');
    QP.render();
  };

  QP.processVendor = async function (vendorId) {
    const vs = QP.vendorState(vendorId);
    const ctrl = new AbortController();
    QP.busy[vendorId] = { ctrl, status: 'AI reading…' }; vs.error = null; QP.render();
    const onStatus = txt => {
      if (QP.busy[vendorId]) QP.busy[vendorId].status = txt;
      const el = document.getElementById('st-' + vendorId); if (el) el.textContent = txt;
    };
    try {
      const { data, model } = await QP.extractVendor(vendorId, { signal: ctrl.signal, onStatus });
      vs.extraction = data; vs.model = model; vs.processedAt = new Date().toISOString(); vs.status = 'processed';
      // decisions about this vendor's old flags no longer apply to the new reading
      Object.keys(QP.state.decisions).forEach(k => { if (k.startsWith(vendorId + ':')) delete QP.state.decisions[k]; });
    } catch (e) {
      if (e.cancelled) QP.toast('Stopped. Previous results kept.');
      else vs.error = e.message;
    }
    QP.busy[vendorId] = null; QP.save(); QP.render();
  };

  QP.cancelProcessing = function (vendorId) {
    if (QP.queue.includes(vendorId)) { QP.queue = QP.queue.filter(x => x !== vendorId); QP.render(); return; }
    const b = QP.busy[vendorId]; if (b && b.ctrl) b.ctrl.abort();
  };

  QP.reprocess = async function (vendorId) {
    const vs = QP.state.vendors[vendorId];
    const V = QP.VENDORS.find(v => v.id === vendorId);
    if (vs && vs.extraction) {
      const ok = await QP.confirmBox('Read this reply again?', `This replaces the current results for <b>${esc(V.name)}</b> and clears your review decisions for this vendor.`, 'Read again');
      if (!ok) return;
    }
    QP.enqueue(vendorId);
  };

  // Used by the "wrong vendor" issue: removes every file of this vendor's reply.
  QP.removeVendorReply = async function (vendorId) {
    const V = QP.VENDORS.find(v => v.id === vendorId);
    const ok = await QP.confirmBox('Remove this reply?', `All files and AI results for <b>${esc(V.name)}</b> will be removed. You can upload the correct reply afterwards.`, 'Remove', true);
    if (!ok) return;
    const vs = QP.vendorState(vendorId);
    for (const f of vs.files) { await QP.files.del(f.id); QP.forgetPrepared(f.id); }
    QP.state.vendors[vendorId] = { status: 'not_responded', files: [], pastedText: '', sent: vs.sent || [] };
    Object.keys(QP.state.decisions).forEach(k => { if (k.startsWith(vendorId + ':')) delete QP.state.decisions[k]; });
    QP.save(); QP.toast(`${V.name}'s reply removed.`); QP.go('responses');
  };

  QP.processAll = async function () {
    const ids = QP.VENDORS.map(v => v.id).filter(id => { const vs = QP.state.vendors[id]; return vs && vs.files.length && (vs.status === 'responded' || vs.status === 'stale' || vs.error); });
    if (!ids.length) { QP.toast('Nothing waiting to be read.'); return; }
    ids.forEach(id => QP.enqueue(id));
  };

  function pasteDialog(vendorId) {
    const V = QP.VENDORS.find(v => v.id === vendorId);
    const body = QP.modal(`Paste reply from ${esc(V.name)}`, `
      <p class="muted">Paste the vendor's email exactly as received (including the header lines if you have them).</p>
      <textarea class="paste" id="pasteTxt" placeholder="From: …&#10;Subject: …&#10;&#10;Message…"></textarea>
      <div class="row" style="margin-top:10px">
        ${V.pasteSample ? '<button class="btn sm" id="fillSample">Fill with demo email</button>' : ''}
        <span class="grow"></span><button class="btn primary" id="pasteSave">Save reply</button>
      </div>`, { width: 760 });
    const fill = body.querySelector('#fillSample');
    if (fill) fill.onclick = async () => { const r = await fetch(`samples/${vendorId}/${V.pasteSample}`); body.querySelector('#pasteTxt').value = await r.text(); };
    body.querySelector('#pasteSave').onclick = async () => {
      const txt = body.querySelector('#pasteTxt').value.trim();
      if (!txt) { QP.toast('Paste the email text first.'); return; }
      await addBlob(vendorId, new Blob([txt], { type: 'text/plain' }), 'Pasted email.txt', 'text/plain');
      QP.closeModal(); QP.enqueue(vendorId);
    };
  }

  function uploadDialog(vendorId) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.accept = '.pdf,.xlsx,.xls,.csv,.docx,.txt,.eml,image/*';
    inp.onchange = async () => {
      if (!inp.files.length) return;
      for (const f of inp.files) await addBlob(vendorId, f, f.name, f.type);
      QP.enqueue(vendorId);
    };
    inp.click();
  }

  async function removeFile(vendorId, fileId) {
    const vs = QP.vendorState(vendorId);
    vs.files = vs.files.filter(f => f.id !== fileId);
    await QP.files.del(fileId); QP.forgetPrepared(fileId);
    if (!vs.files.length) { vs.status = 'not_responded'; vs.extraction = null; }
    else if (vs.extraction) vs.status = 'stale';
    QP.save(); QP.render();
  }

  QP.showExtraction = function (vendorId) {
    const V = QP.VENDORS.find(v => v.id === vendorId);
    const vs = QP.state.vendors[vendorId]; const ex = vs && vs.extraction;
    if (!ex) return;
    const vo = QP.model.vendors[vendorId];
    const srcBtn = s => s ? `<button class="icon-btn" title="View in original file" data-src='${esc(JSON.stringify(s))}'>📍</button>` : '';
    const lines = QP.state.rfx.lines.map(L => {
      const c = vo.cells[L.line]; const e = c.raw;
      const raw = e && e.price_value != null ? `${e.currency || ''} ${e.price_value} ${e.price_basis_text ? '(' + esc(e.price_basis_text) + ')' : esc(e.price_basis || '')}` : (e && e.reference_text ? `“${esc(e.reference_text)}”` : '');
      const st = { priced: '', not_quoted: '<span class="pill red">not quoted</span>', unreadable: '<span class="pill red">unreadable</span>', reference: '<span class="pill red">vague reference</span>', unit_problem: '<span class="pill red">unit unclear</span>' }[c.status] || '';
      return `<tr><td>${L.line}</td><td>${esc(L.desc)}<div class="small muted">${esc(L.plant)}</div></td><td>${esc(e ? e.vendor_item_text : '')}${e && e.match_confidence !== 'high' ? `<div class="small" style="color:var(--amber)">match ${esc(e.match_confidence)}: ${esc(e.match_basis)}</div>` : ''}</td>
        <td>${raw} ${st}${c.reason ? `<div class="small muted">${esc(c.reason)}</div>` : ''}</td>
        <td>${e ? `<span class="pill ${e.clarity === 'clear' ? 'green' : e.clarity === 'unclear' ? 'amber' : 'red'}">${esc(e.clarity)}</span>` : ''}${e && e.clarity_note ? `<div class="small muted">${esc(e.clarity_note)}</div>` : ''}</td>
        <td class="num">${c.aiValue != null ? QP.fmtRs(c.aiValue, 3) : '—'}</td><td>${srcBtn(c.source)}</td></tr>`;
    }).join('');
    const t = ex.commercial_terms || {}, q = ex.questionnaire || {};
    const term = (k, o) => o ? `<div class="k">${k}</div><div>${esc(o.text || (o.days != null ? o.days + ' days' : '') || o.basis || (o.stated === false ? 'Not stated' : ''))} ${srcBtn(o.source)}</div>` : '';
    const qa = (k, o) => o ? `<div class="k">${k}</div><div><span class="pill ${/yes|attached|stated|confirmed/.test(o.answer) ? 'green' : 'red'}">${esc(o.answer)}</span> ${esc(o.claim_text || o.text || (o.boxes_per_month ? QP.fmt(o.boxes_per_month, 0) + ' boxes/month' : '') || o.evidence_file || '')} ${srcBtn(o.source)}</div>` : '';
    const files = vs.files || [];
    const docRows = files.map(f => {
      const a = (ex.attachments || []).find(x => QP.esc(x.file).toLowerCase() === QP.esc(f.name).toLowerCase() || f.name.toLowerCase().includes(String(x.file || '').toLowerCase().replace(/\.[a-z]+$/, '')));
      const info = a ? [a.type && a.type !== 'other' ? a.type.replace('_', ' ') : '', a.company_named, a.certificate_number, a.valid_until ? 'valid until ' + a.valid_until : '', a.summary].filter(Boolean).map(esc).join(' · ') : '';
      return `<div style="margin-bottom:8px"><button class="icon-btn" title="Open file" data-file="${esc(f.id)}">📄</button> <a href="#" data-file="${esc(f.id)}"><b>${esc(f.name)}</b></a><div class="small muted" style="margin-left:26px">${info || 'Quotation / reply'}</div></div>`;
    }).join('');
    const body = QP.modal(`Extracted quote — ${esc(V.name)}`, `
      <div class="row small muted" style="margin-bottom:10px">Quote ${esc(ex.quote_reference || '—')} · dated ${esc(ex.quote_date || '—')} <span class="grow"></span><span title="Read by ${esc(vs.model || 'AI')} on ${new Date(vs.processedAt).toLocaleString('en-IN')}. Raw values as read; ₹/pc computed by plain code." style="cursor:help">ⓘ</span></div>
      <div style="overflow:auto;max-height:46vh" class="card"><table class="t"><thead><tr><th>RFx</th><th>Our item</th><th>Vendor's item &amp; match</th><th>Raw value read</th><th>Clarity</th><th class="num">₹/pc</th><th></th></tr></thead><tbody>${lines}</tbody></table></div>
      <div class="row" style="align-items:flex-start;margin-top:14px;gap:14px">
        <div class="card grow"><div class="ch"><h3>Commercial terms</h3></div><div class="cb kv">
          ${term('Payment', t.payment)}${term('Validity', t.validity)}${term('Freight', t.freight)}${term('Lead time', t.lead_time)}${term('GST', t.gst)}${term('Price variation', t.price_variation_clause && t.price_variation_clause.present ? t.price_variation_clause : null)}
          ${(t.discounts || []).map(d => `<div class="k">Discount</div><div>${esc(d.text)} ${srcBtn(d.source)}</div>`).join('')}
          ${(t.other_conditions || []).map(d => `<div class="k">Condition</div><div>${esc(d.text)} ${srcBtn(d.source)}</div>`).join('')}
        </div></div>
        <div class="card grow"><div class="ch"><h3>Questionnaire</h3></div><div class="cb kv">
          ${qa('ISO 9001', q.iso_9001)}${qa('Monthly capacity', q.monthly_capacity)}${qa('Test report', q.test_report)}${qa('Food-safe inks', q.food_safe_inks)}${qa('Box weights', q.box_weight_confirmation)}
        </div></div>
      </div>
      <div class="card" style="margin-top:14px"><div class="ch"><h3>Documents sent by the vendor</h3></div><div class="cb">
        ${docRows || '<span class="muted">None</span>'}
        ${(ex.notes || []).length ? '<h4 style="margin:10px 0 4px">Other notes from the reply</h4><ul>' + ex.notes.map(n => `<li>${esc(n)}</li>`).join('') + '</ul>' : ''}
      </div></div>`, { width: 1200 });
    body.querySelectorAll('[data-file]').forEach(b => b.onclick = e => { e.preventDefault(); QP.showFile(vendorId, files.find(f => f.id === b.dataset.file)); });
    body.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { const s = JSON.parse(b.getAttribute('data-src')); QP.showSource(vendorId, s, { title: 'Source' }); });
  };

  QP.screens.responses = function (main) {
    const vids = QP.VENDORS.map(v => v.id);
    const received = vids.filter(id => QP.state.vendors[id] && QP.state.vendors[id].files.length).length;
    const processed = vids.filter(id => QP.state.vendors[id] && QP.state.vendors[id].extraction).length;
    main.innerHTML = `
      <div class="head"><div><h1>Vendor responses</h1><p>RFx ${esc(QP.state.rfx.id)} was sent to 5 vendors (email simulated). Replies arrive in any format — Excel, PDF, Word, a phone photo or a plain email — and the AI reads each one as it arrives, one at a time.</p></div>
        <div class="actions"><button class="btn primary" id="simBtn">Simulate replies arriving</button>${QP.VENDORS.some(V => { const v = QP.state.vendors[V.id]; return v && v.files.length && (v.status !== 'processed' || v.error) && !QP.busy[V.id] && !QP.queue.includes(V.id); }) ? '<button class="btn" id="procAll">Read all waiting replies</button>' : ''}</div></div>
      <div class="kpis">
        <div class="kpi"><div class="l">Replies received</div><div class="v">${received} / 5</div></div>
        <div class="kpi"><div class="l">Read by AI</div><div class="v">${processed} / 5</div></div>
        <div class="kpi"><div class="l">Quotes due</div><div class="v">23 Nov 2026</div></div>
        <div class="kpi"><div class="l">RFx lines</div><div class="v">${QP.state.rfx.lines.length}</div></div>
      </div>
      <div class="card">${QP.VENDORS.map(V => {
        const vs = QP.state.vendors[V.id] || { status: 'not_responded', files: [] };
        const busy = QP.busy[V.id];
        const [cls, label] = STATUS[vs.status] || STATUS.not_responded;
        const vo = QP.model && QP.model.vendors[V.id];
        const sum = vo && vo.processed ? `<div class="small muted" style="margin-top:4px">${vo.totals.quoted}/30 lines priced · ${vo.openRed ? `<span style="color:var(--red)">${vo.openRed} must resolve</span>` : '<span class="tile-ok">✓ must-resolve done</span>'} · ${vo.openYellow ? vo.openYellow + ' to check' : '<span class="tile-ok">✓ checks done</span>'}</div>` : '';
        return `<div class="vrow">
          <div class="avatar">${V.id}</div>
          <div><b>${esc(V.name)}</b><div class="small muted">${esc(V.contact)} · ${V.status2026 === 'Incumbent' ? 'Current supplier' : 'New vendor'}</div></div>
          <div>${QP.queue.includes(V.id) ? `<span class="pill grey">⏳ Queued — #${QP.queue.indexOf(V.id) + 1}</span>` : ''}${busy ? `<span class="pill blue"><span class="spinner"></span> AI reading</span><div class="status-line" id="st-${V.id}">${esc(busy.status)}</div>` : QP.queue.includes(V.id) ? '' : `<span class="pill ${cls}">${label}</span>`}${sum}${(vs.sent || []).length ? `<div class="small" style="margin-top:4px"><a href="#" data-sentv="${V.id}">✉ ${vs.sent.length} message${vs.sent.length > 1 ? 's' : ''} sent</a></div>` : ''}</div>
          <div><div class="files">${vs.files.map(f => `<span class="file" data-view="${V.id}|${f.id}">📄 ${esc(f.name)} <span data-del="${V.id}|${f.id}" title="Remove" style="margin-left:4px;color:#98a2b3">✕</span></span>`).join('') || '<span class="muted small">No reply yet</span>'}</div>
            ${vs.error ? `<div class="err">⚠ ${esc(vs.error)}</div>` : ''}</div>
          <div class="row" style="justify-content:flex-end">
            <button class="btn sm" data-up="${V.id}">Upload</button><button class="btn sm" data-paste="${V.id}">Paste email</button>
            ${busy || QP.queue.includes(V.id) ? `<button class="btn sm danger" data-cancel="${V.id}">Cancel</button>` : vs.files.length ? `<button class="btn sm ${vs.extraction && vs.status === 'processed' ? '' : 'primary'}" data-proc="${V.id}">${vs.error ? 'Retry' : vs.extraction && vs.status === 'processed' ? 'Re-process' : 'Read with AI'}</button>` : ''}
            ${vs.extraction ? `<button class="btn sm" data-ex="${V.id}">View extracted quote</button>` : ''}
          </div></div>`;
      }).join('')}</div>`;

    main.querySelector('#simBtn').onclick = QP.simulateReplies;
    const pa = main.querySelector('#procAll'); if (pa) pa.onclick = QP.processAll;
    main.querySelectorAll('[data-sentv]').forEach(a => a.onclick = e => { e.preventDefault(); QP.showSent(a.dataset.sentv); });
    main.querySelectorAll('[data-up]').forEach(b => b.onclick = () => uploadDialog(b.dataset.up));
    main.querySelectorAll('[data-paste]').forEach(b => b.onclick = () => pasteDialog(b.dataset.paste));
    main.querySelectorAll('[data-proc]').forEach(b => b.onclick = () => QP.reprocess(b.dataset.proc));
    main.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => QP.cancelProcessing(b.dataset.cancel));
    main.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => QP.showExtraction(b.dataset.ex));
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = e => { e.stopPropagation(); const [v, f] = b.dataset.del.split('|'); const fr = (QP.state.vendors[v].files || []).find(x => x.id === f); QP.confirmBox('Remove file?', `Remove <b>${esc(fr ? fr.name : 'this file')}</b> from this vendor's reply?`, 'Remove', true).then(ok => { if (ok) removeFile(v, f); }); });
    main.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { const [v, f] = b.dataset.view.split('|'); QP.showFile(v, QP.state.vendors[v].files.find(x => x.id === f)); });
  };
})();
