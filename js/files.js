// Turning vendor files into (1) something the AI can read and (2) something the buyer can view as the source.
// PDFs and images go to the AI as-is. Excel and Word are converted to text here, keeping cell / paragraph references.
window.QP = window.QP || {};

(function () {
  function kindOf(name, mime) {
    const n = (name || '').toLowerCase();
    if (n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv') || /sheet|excel/.test(mime || '')) return 'excel';
    if (n.endsWith('.docx') || /wordprocessingml/.test(mime || '')) return 'word';
    if (n.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
    if (/\.(jpe?g|png|webp|heic|gif)$/.test(n) || /^image\//.test(mime || '')) return 'image';
    return 'text';
  }
  QP.kindOf = kindOf;

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  QP.esc = esc;

  // ---------- Excel ----------
  async function excelPrepare(blob, name) {
    if (!window.XLSX) throw new Error('Excel reader did not load. Check your internet connection and reload.');
    const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array', cellFormula: true });
    let text = '';
    const sheets = [];
    wb.SheetNames.forEach(sn => {
      const ws = wb.Sheets[sn];
      if (!ws['!ref']) return;
      const range = XLSX.utils.decode_range(ws['!ref']);
      text += `\n=== Sheet "${sn}" ===\n`;
      const rows = [];
      for (let r = range.s.r; r <= range.e.r; r++) {
        const cells = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr];
          if (!cell) { cells.push(null); continue; }
          let v = cell.w != null ? cell.w : cell.v;
          if ((v === undefined || v === '') && cell.f) v = '=' + cell.f + ' (formula, no stored value)';
          cells.push({ addr, v });
        }
        rows.push({ r: r + 1, cells });
        const parts = cells.filter(x => x && x.v !== undefined && x.v !== '').map(x => `${x.addr}: ${x.v}`);
        if (parts.length) text += `Row ${r + 1} | ` + parts.join(' | ') + '\n';
      }
      sheets.push({ name: sn, rows, cols: range.e.c - range.s.c + 1, startCol: range.s.c });
    });
    return {
      kind: 'excel',
      aiParts: [{ type: 'text', text: `--- FILE: "${name}" (Excel workbook, shown as cell references) ---\n${text}` }],
      view: { sheets }
    };
  }

  // ---------- Word ----------
  async function wordPrepare(blob, name) {
    if (!window.mammoth) throw new Error('Word reader did not load. Check your internet connection and reload.');
    const res = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
    const doc = new DOMParser().parseFromString(`<div>${res.value}</div>`, 'text/html');
    let text = '', p = 0, t = 0;
    const blocks = [];
    doc.body.firstChild.childNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.tagName === 'TABLE') {
        t++;
        node.querySelectorAll('tr').forEach((tr, i) => {
          const cells = [...tr.querySelectorAll('td,th')].map(td => td.textContent.trim());
          const ref = `Table ${t}, row ${i + 1}`;
          text += `[${ref}] ` + cells.join(' | ') + '\n';
          blocks.push({ ref, cells });
        });
      } else {
        const s = node.textContent.trim();
        if (!s) return;
        p++;
        const ref = `Paragraph ${p}`;
        text += `[${ref}] ${s}\n`;
        blocks.push({ ref, text: s });
      }
    });
    return {
      kind: 'word',
      aiParts: [{ type: 'text', text: `--- FILE: "${name}" (Word document, paragraphs and table rows labelled) ---\n${text}` }],
      view: { blocks }
    };
  }

  // ---------- Image (downscale to keep under upload limits) ----------
  async function imagePrepare(blob, name) {
    const url = URL.createObjectURL(blob);
    const img = await new Promise((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Could not open image')); i.src = url;
    });
    const max = 2000;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return {
      kind: 'image',
      aiParts: [
        { type: 'text', text: `--- FILE: "${name}" (photo / image, follows) ---` },
        { type: 'file', mime: 'image/jpeg', data: await blobToBase64(jpg) }
      ],
      view: { url }
    };
  }

  async function pdfPrepare(blob, name) {
    return {
      kind: 'pdf',
      aiParts: [
        { type: 'text', text: `--- FILE: "${name}" (PDF, follows) ---` },
        { type: 'file', mime: 'application/pdf', data: await blobToBase64(blob) }
      ],
      view: { url: URL.createObjectURL(blob) }
    };
  }

  async function textPrepare(text, name) {
    const lines = String(text).split(/\r?\n/);
    const numbered = lines.map((l, i) => `[Line ${i + 1}] ${l}`).join('\n');
    return {
      kind: 'text',
      aiParts: [{ type: 'text', text: `--- FILE: "${name}" (email / plain text, lines labelled) ---\n${numbered}` }],
      view: { lines }
    };
  }

  // fileRec: { id, name, mime } ; returns prepared object (cached per session)
  const cache = {};
  QP.prepareFile = async function (fileRec) {
    if (cache[fileRec.id]) return cache[fileRec.id];
    const blob = await QP.files.get(fileRec.id);
    if (!blob) throw new Error(`File "${fileRec.name}" is no longer stored in this browser. Upload it again.`);
    const k = kindOf(fileRec.name, fileRec.mime);
    let out;
    if (k === 'excel') out = await excelPrepare(blob, fileRec.name);
    else if (k === 'word') out = await wordPrepare(blob, fileRec.name);
    else if (k === 'image') out = await imagePrepare(blob, fileRec.name);
    else if (k === 'pdf') out = await pdfPrepare(blob, fileRec.name);
    else out = await textPrepare(await blob.text(), fileRec.name);
    out.name = fileRec.name;
    cache[fileRec.id] = out;
    return out;
  };
  QP.forgetPrepared = id => { delete cache[id]; };
})();
