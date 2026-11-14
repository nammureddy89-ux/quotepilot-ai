// Stages built in later layers (6 Ask AI, 7 Award).
window.QP = window.QP || {};
QP.screens = QP.screens || {};

(function () {
  const esc = s => QP.esc(s);
  QP.screens.ask = main => {
    main.innerHTML = `<div class="head"><div><h1>Ask AI</h1><p>Coming in the next build: ask questions in plain English; the AI plans the steps, plain code computes on the live comparison data, and every answer shows its method and caveats.</p></div></div>`;
  };
  QP.screens.award = main => {
    main.innerHTML = `<div class="head"><div><h1>Award</h1><p>Coming in the next build: must-pass qualification, award options on true cost (conditional discounts and freight included), and your decision with a written reason.</p></div></div>`;
  };
})();
