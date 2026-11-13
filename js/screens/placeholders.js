// Stages built in later layers. Stage 1–2 show the RFx as sent so the demo has context.
window.QP = window.QP || {};
QP.screens = QP.screens || {};

(function () {
  const esc = s => QP.esc(s);
  function rfxTable() {
    const r = QP.state.rfx;
    return `<div class="card"><div class="ch"><h3>${esc(r.id)} · ${esc(r.title)}</h3><span class="pill green">Sent to 5 vendors</span></div>
      <div class="cb small muted">${esc(r.period)} · ${esc(r.priceBasis)} · Payment standard ${r.paymentDaysStandard} days · Validity ≥ ${r.minValidityDays} days · FX 1 USD = ₹${r.fxRates.USD} · Quotes due ${esc(r.dueDate)}</div>
      <div style="overflow:auto;max-height:60vh"><table class="t"><thead><tr><th>#</th><th>Item</th><th>Ply / board</th><th>Size (mm)</th><th class="num">Weight (g)</th><th>Printing</th><th>Plant</th><th class="num">Annual qty</th></tr></thead><tbody>
      ${r.lines.map(l => `<tr><td>${l.line}</td><td>${esc(l.desc)}</td><td>${esc(l.board)}</td><td>${esc(l.size)}</td><td class="num">${l.weightG}</td><td>${esc(l.printing)}</td><td>${esc(l.plant)}</td><td class="num">${l.qty.toLocaleString('en-IN')}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card"><div class="ch"><h3>Questionnaire</h3></div><div class="cb">${r.questionnaire.map(q => `<div>• ${esc(q.text)} ${q.mustPass ? '<span class="pill grey">must-pass</span>' : ''}</div>`).join('')}</div></div>`;
  }
  QP.screens.create = main => {
    main.innerHTML = `<div class="head"><div><h1>Create RFx</h1><p>Coming in the next build: upload last year's contract + a short brief, and the AI structures it into editable lines (never inventing items, specs or quantities). Below is the RFx that was sent.</p></div></div>${rfxTable()}`;
  };
  QP.screens.review = main => {
    main.innerHTML = `<div class="head"><div><h1>Review &amp; send</h1><p>Coming in the next build: checks before sending and a locked sent version. Vendors see no last-year prices.</p></div></div>${rfxTable()}`;
  };
  QP.screens.ask = main => {
    main.innerHTML = `<div class="head"><div><h1>Ask AI</h1><p>Coming in the next build: ask questions in plain English; the AI plans the steps, plain code computes on the live comparison data, and every answer shows its method and caveats.</p></div></div>`;
  };
  QP.screens.award = main => {
    main.innerHTML = `<div class="head"><div><h1>Award</h1><p>Coming in the next build: must-pass qualification, award options on true cost (conditional discounts and freight included), and your decision with a written reason.</p></div></div>`;
  };
})();
