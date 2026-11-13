// Source viewer: shows the original vendor file at the place a value came from.
window.QP = window.QP || {};

(function () {
  const esc = s => QP.esc(s);
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();

  function findFile(vendorId, name) {
    const vs = QP.state.vendors[vendorId];
    if (!vs || !vs.files.length) return null;
    if (!name) return vs.files[0];
    const n = norm(name);
    return vs.files.find(f => norm(f.name) === n) || vs.files.find(f => norm(f.name).includes(n) || n.includes(norm(f.name))) || vs.files[0];
  }

  function quoteHit(text, quote) {
    if (!quote) return false;
    const a = norm(text), q = norm(quote);
    if (!q) return false;
    if (a.includes(q)) return true;
    // loose: most words of the quote appear
    const words = q.split(' ').filter(w => w.length > 2);
    return words.length > 2 && words.filter(w => a.includes(w)).length / words.length >= 0.75;
  }

  // extra: { title, steps: [], note }
  QP.showSource = async function (vendorId, source, extra = {}) {
    const V = QP.VENDORS.find(v => v.id === vendorId);
    const src = source || {};
    const f = findFile(vendorId, src.file);
    const head = `<div class="srcbox">
      <div><b>${esc(V ? V.name : vendorId)}</b> · ${esc(src.file || (f && f.name) || 'reply')} · <span class="muted">${esc(src.location || 'location not given')}</span></div>
      ${src.quote ? `<div style="margin-top:4px">“${esc(src.quote)}”</div>` : ''}
      ${extra.steps && extra.steps.length ? `<div class="steps" style="margin-top:6px">${extra.steps.map(esc).join('<br>')}</div>` : ''}
      ${extra.note ? `<div class="small" style="margin-top:6px">${esc(extra.note)}</div>` : ''}
    </div>`;
    const body = QP.modal(esc(extra.title || 'Source'), head + '<div id="srcView"><span class="spinner"></span> Opening file…</div>');
    const view = body.querySelector('#srcView');
    if (!f) { view.innerHTML = '<div class="empty">No file stored for this vendor.</div>'; return; }
    let prep;
    try { prep = await QP.prepareFile(f); } catch (e) { view.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    const loc = src.location || '';

    if (prep.kind === 'excel') {
      const refs = [...loc.matchAll(/\b([A-Z]{1,2})(\d{1,4})\b/g)].map(m => m[0]);
      view.innerHTML = prep.view.sheets.map(sh => {
        const colN = sh.cols;
        const letters = Array.from({ length: colN }, (_, i) => XLSX.utils.encode_col(sh.startCol + i));
        return `<h4 style="margin:8px 0">Sheet: ${esc(sh.name)}</h4><div style="overflow:auto"><table class="sheet"><tr><th></th>${letters.map(l => `<th>${l}</th>`).join('')}</tr>` +
          sh.rows.map(r => `<tr><th>${r.r}</th>${r.cells.map((c, i) => {
            const addr = letters[i] + r.r;
            const v = c ? c.v : '';
            const hit = refs.includes(addr) || (!refs.length && c && quoteHit(String(v), src.quote) && String(v).length > 3);
            return `<td class="${hit ? 'hit' : ''}">${esc(v == null ? '' : v)}</td>`;
          }).join('')}</tr>`).join('') + '</table></div>';
      }).join('');
    } else if (prep.kind === 'word') {
      const m = loc.match(/(Table \d+, row \d+|Paragraph \d+)/i);
      const ref = m ? m[1].toLowerCase() : null;
      let html = '<div class="doc">', inTable = false;
      prep.view.blocks.forEach(b => {
        const hit = (ref && b.ref.toLowerCase() === ref) || (!ref && quoteHit(b.text || (b.cells || []).join(' '), src.quote));
        if (b.cells) {
          if (!inTable) { html += '<table>'; inTable = true; }
          html += `<tr class="${hit ? 'hit' : ''}">${b.cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
        } else {
          if (inTable) { html += '</table>'; inTable = false; }
          html += `<p class="${hit ? 'hit' : ''}">${esc(b.text)}</p>`;
        }
      });
      view.innerHTML = html + (inTable ? '</table>' : '') + '</div>';
    } else if (prep.kind === 'pdf') {
      const pm = loc.match(/page\s*(\d+)/i);
      view.innerHTML = `<iframe class="pdf" src="${prep.view.url}#page=${pm ? pm[1] : 1}"></iframe>`;
    } else if (prep.kind === 'image') {
      view.innerHTML = `<p class="small muted">Original photo. The AI's note on where it read the value is shown above.</p><img class="photo" src="${prep.view.url}">`;
    } else {
      const lm = loc.match(/line\s*(\d+)/i);
      const ln = lm ? Number(lm[1]) : null;
      view.innerHTML = '<div class="email">' + prep.view.lines.map((l, i) => {
        const lineOk = ln && prep.view.lines[ln - 1] && prep.view.lines[ln - 1].trim() && (!src.quote || quoteHit(prep.view.lines[ln - 1], src.quote));
        const hit = lineOk ? i + 1 === ln : quoteHit(l, src.quote);
        return `<div class="${hit ? 'hit' : ''}">${esc(l) || '&nbsp;'}</div>`;
      }).join('') + '</div>';
    }
    const h = view.querySelector('.hit'); if (h) h.scrollIntoView({ block: 'center', inline: 'nearest' });
  };

  QP.showFile = function (vendorId, fileRec) {
    QP.showSource(vendorId, { file: fileRec.name, location: 'whole file' }, { title: fileRec.name });
  };
})();
