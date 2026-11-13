// App shell: sidebar navigation, simple router, modal and toast helpers.
window.QP = window.QP || {};

(function () {
  QP.STAGES = [
    { id: 'create', n: 1, label: 'Create RFx', later: true },
    { id: 'review', n: 2, label: 'Review & Send', later: true },
    { id: 'responses', n: 3, label: 'Vendor Responses' },
    { id: 'issues', n: 4, label: 'Review Issues' },
    { id: 'compare', n: 5, label: 'Compare' },
    { id: 'ask', n: 6, label: 'Ask AI', later: true },
    { id: 'award', n: 7, label: 'Award', later: true }
  ];
  QP.screens = QP.screens || {};

  function current() { return (location.hash || '#responses').slice(1).split('?')[0]; }

  QP.render = function () {
    const cur = current();
    let issuesOpen = 0;
    try { const m = QP.compute(); issuesOpen = m.flags.filter(f => f.open && f.sev === 'red').length; QP.model = m; } catch (e) { console.error(e); }
    document.getElementById('nav').innerHTML = QP.STAGES.map(s =>
      `<a href="#${s.id}" class="${s.id === cur ? 'on' : ''}"><span class="num">${s.n}</span>${s.label}` +
      (s.id === 'issues' && issuesOpen ? `<span class="later" style="color:#fda29b">${issuesOpen} 🔴</span>` : '') +
      (s.later ? '<span class="later">next build</span>' : '') + '</a>'
    ).join('');
    const screen = QP.screens[cur] || QP.screens.responses;
    const main = document.getElementById('main');
    try { screen(main); } catch (e) { console.error(e); main.innerHTML = `<div class="card"><div class="cb err">Something went wrong drawing this screen: ${QP.esc(e.message)}</div></div>`; }
  };

  QP.go = id => { if (location.hash === '#' + id) QP.render(); else location.hash = id; };
  window.addEventListener('hashchange', QP.render);

  QP.modal = function (title, html, opts = {}) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal-bg"><div class="modal" style="${opts.width ? 'width:min(' + opts.width + 'px,100%)' : ''}"><div class="mh"><h3>${title}</h3><span class="grow"></span><button class="btn sm" data-close>Close</button></div><div class="mb">${html}</div></div></div>`;
    const bg = root.firstChild;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.hasAttribute('data-close')) QP.closeModal(); });
    return bg.querySelector('.mb');
  };
  QP.closeModal = () => { document.getElementById('modalRoot').innerHTML = ''; };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') QP.closeModal(); });

  QP.toast = function (msg, ms = 3200) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), ms);
  };

  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (!confirm('Clear all vendor replies, AI results and your decisions in this browser?')) return;
    await QP.resetAll(); QP.toast('Demo reset.'); QP.go('responses');
  });

  QP.render();
})();
