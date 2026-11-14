// App shell: sidebar navigation, simple router, modal and toast helpers.
window.QP = window.QP || {};

(function () {
  // Show how long each AI reading took (for measuring speed). Set to false to hide it.
  QP.SHOW_TIMING = true;

  QP.STAGES = [
    { id: 'create', n: 1, label: 'Create RFx', pre: true },
    { id: 'review', n: 2, label: 'Review & Send', pre: true },
    { id: 'responses', n: 3, label: 'Vendor Responses' },
    { id: 'issues', n: 4, label: 'Review Issues' },
    { id: 'compare', n: 5, label: 'Compare' },
    { id: 'ask', n: 6, label: 'Ask AI', later: true },
    { id: 'award', n: 7, label: 'Award', later: true }
  ];
  QP.screens = QP.screens || {};

  function current() { return (location.hash || (QP.state.rfxSent ? '#responses' : '#create')).slice(1).split('?')[0]; }
  // Read a parameter from the hash, e.g. #create?focus=line-r9-weightG
  QP.hashParam = name => { const q = (location.hash.split('?')[1] || ''); const m = q.match(new RegExp('(?:^|&)' + name + '=([^&]*)')); return m ? decodeURIComponent(m[1]) : null; };

  // Stages 3–7 need a sent RFx (every quote is judged against the locked version).
  function gate(main, s) {
    main.innerHTML = `<div class="head"><div><h1>${s.label}</h1><p>This step opens once the RFx has been sent to vendors.</p></div></div>
      <div class="card"><div class="cb empty">The RFx is still a draft.<br><br>
      <button class="btn primary" onclick="QP.go('${QP.state.draft ? 'review' : 'create'}')">${QP.state.draft ? 'Go to Review &amp; Send →' : 'Create the RFx →'}</button></div></div>`;
  }

  QP.render = function () {
    if (QP._lastScreen && QP._lastScreen !== current()) QP.closeAllModals();
    QP._lastScreen = current();
    const cur = current();
    let issuesOpen = 0;
    if (QP.state.rfxSent) try { const m = QP.compute(); issuesOpen = m.flags.filter(f => f.open && f.sev === 'red').length; QP.model = m; } catch (e) { console.error(e); }
    const sent = QP.state.rfxSent;
    document.getElementById('nav').innerHTML = QP.STAGES.map(s =>
      `<a href="#${s.id}" class="${s.id === cur ? 'on' : ''} ${!sent && !s.pre ? 'dim' : ''}"><span class="num">${sent && s.pre ? '✓' : s.n}</span>${s.label}` +
      (s.id === 'issues' && issuesOpen ? `<span class="later" style="color:#fda29b">${issuesOpen} 🔴</span>` : '') +
      (s.later ? '<span class="later">next build</span>' : '') + '</a>'
    ).join('');
    const R = QP.state.rfx, D = QP.state.draft;
    document.querySelector('.side .proj').innerHTML = sent
      ? `<b>${QP.esc(R.title)}</b>${QP.esc(QP.COMPANY.name.replace(' Pvt. Ltd.', ''))} · Priya Deshmukh<br>${R.lines.length} lines · ${QP.VENDORS.length} vendors · <span style="color:#75e0a7">Sent</span>`
      : `<b>${D && D.meta.title ? QP.esc(D.meta.title) : 'New RFx'}</b>${QP.esc(QP.COMPANY.name.replace(' Pvt. Ltd.', ''))} · Priya Deshmukh<br>${D ? D.lines.length + ' lines · ' : ''}<span style="color:#fec84b">Draft</span>`;
    const stage = QP.STAGES.find(s => s.id === cur) || QP.STAGES[0];
    const screen = QP.screens[cur] || QP.screens.create;
    const main = document.getElementById('main');
    try { if (!sent && !stage.pre) gate(main, stage); else screen(main); } catch (e) { console.error(e); main.innerHTML = `<div class="card"><div class="cb err">Something went wrong drawing this screen: ${QP.esc(e.message)}</div></div>`; }
    if (QP.flash) { const h = main.querySelector('.head'); if (h) QP.say(h, QP.flash.text, QP.flash.kind, 6000); QP.flash = null; }
  };

  QP.go = id => { if (location.hash === '#' + id) QP.render(); else location.hash = id; };
  window.addEventListener('hashchange', QP.render);

  // Modals stack: opening one from inside another (e.g. a source file from View quote)
  // hides the first; closing the top one brings the previous one back exactly as it was.
  QP.modal = function (title, html, opts = {}) {
    const root = document.getElementById('modalRoot');
    root.querySelectorAll(':scope > .modal-bg').forEach(l => { l.style.display = 'none'; });
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" style="${opts.width ? 'width:min(' + opts.width + 'px,100%)' : ''}"><div class="mh"><h3>${title}</h3><span class="grow"></span><button class="btn sm" data-close>${root.children.length ? '← Back' : 'Close'}</button></div><div class="mb"></div></div>`;
    bg.querySelector('.mb').innerHTML = html;
    root.appendChild(bg);
    bg.addEventListener('click', e => { if (e.target === bg || e.target.hasAttribute('data-close')) QP.closeModal(bg); });
    return bg.querySelector('.mb');
  };
  // Close one layer (the given one, or the top one) and show the one underneath.
  QP.closeModal = (layer) => {
    const root = document.getElementById('modalRoot');
    const layers = [...root.querySelectorAll(':scope > .modal-bg')];
    const target = layer || layers[layers.length - 1];
    if (!target) return;
    target.remove();
    const rest = [...root.querySelectorAll(':scope > .modal-bg')];
    if (rest.length) rest[rest.length - 1].style.display = '';
  };
  QP.closeAllModals = () => { document.getElementById('modalRoot').innerHTML = ''; };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') QP.closeModal(); });

  // Messages appear next to what they are about (never at the bottom of the page).
  // QP.say(anchorEl, text, kind) — kind: 'err' | 'ok' | 'info'. 'ok' and 'info' fade after a few seconds.
  QP.say = function (anchor, text, kind = 'err', ms) {
    if (!anchor) return;
    let el = anchor.nextElementSibling;
    if (!el || !el.classList || !el.classList.contains('say')) {
      el = document.createElement('div');
      anchor.insertAdjacentElement('afterend', el);
    }
    el.className = 'say ' + kind;
    el.textContent = text;
    clearTimeout(el._t);
    const life = ms != null ? ms : kind === 'err' ? 0 : 4000;
    if (life) el._t = setTimeout(() => el.remove(), life);
    return el;
  };
  // A one-off note shown at a fixed place on the next screen draw (e.g. after a reset or a removal).
  QP.flash = null;   // { where: 'responses-head' | vendorId, text, kind }

  // In-app confirmation (browser pop-ups are blocked in some browsers). Resolves true/false.
  QP.confirmBox = function (title, message, yesLabel = 'Yes', danger = false) {
    return new Promise(resolve => {
      const body = QP.modal(title, `<p style="margin:0 0 16px">${message}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'danger-solid' : 'primary'}" data-yes>${yesLabel}</button></div>`, { width: 460 });
      const layer = body.closest('.modal-bg');
      const done = v => { QP.closeModal(layer); resolve(v); };
      body.querySelector('[data-yes]').onclick = () => done(true);
      body.querySelector('[data-no]').onclick = () => done(false);
      layer.addEventListener('click', e => { if (e.target === layer || e.target.hasAttribute('data-close')) resolve(false); });
    });
  };

  QP.toast = function (msg, ms = 3200) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), ms);
  };

  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (!await QP.confirmBox('Reset demo?', 'This clears the RFx draft, the sent RFx, all vendor replies, AI results, sent messages and your decisions in this browser.', 'Reset', true)) return;
    Object.values(QP.busy || {}).forEach(b => b && b.ctrl && b.ctrl.abort()); QP.queue = [];
    await QP.resetAll(); QP.closeAllModals(); QP.flash = { where: 'head', text: 'Demo reset. The RFx, replies, AI results and decisions were cleared.', kind: 'ok' }; QP.go('create');
  });

  QP.render();
})();
