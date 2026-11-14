// Saving state in the browser. Small JSON in localStorage, vendor files in IndexedDB.
window.QP = window.QP || {};

(function () {
  const KEY = 'quotepilot_state_v1';

  function freshState() {
    return {
      rfx: null,                  // the SENT, locked RFx (stages 3–7 judge every quote against it)
      rfxSent: false,
      draft: null,                // stage 1–2 working draft (see js/rfx.js)
      sent: null,                 // send record: { at, channel, to, ignored, aiCheck }
      vendors: {},                // vendorId -> { status, files:[{id,name,mime,size,source}], pastedText, extraction, error, processedAt, model }
      decisions: {},              // flagId -> { action, value, reason, at }
      changeLog: [],              // { at, flagId, vendorId, line, action, from, to, reason }
      freightEstimates: {}        // vendorId -> { perBox, reason }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && ('draft' in s || s.rfx)) return s;
      }
    } catch (e) { /* storage blocked or corrupt */ }
    return freshState();
  }

  QP.state = load();

  QP.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(QP.state)); } catch (e) { console.warn('Could not save', e); }
  };

  QP.resetAll = async function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    await QP.files.clear();
    QP.state = freshState();
    QP.save();
  };

  QP.vendorState = function (id) {
    if (!QP.state.vendors[id]) QP.state.vendors[id] = { status: 'not_responded', files: [], pastedText: '' };
    return QP.state.vendors[id];
  };

  // ---------- IndexedDB for file bytes ----------
  const DB = 'quotepilot_files', STORE = 'files';
  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const out = fn(store);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  QP.files = {
    put: (id, blob) => tx('readwrite', s => s.put(blob, id)),
    get: async (id) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const r = db.transaction(STORE).objectStore(STORE).get(id);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    },
    del: (id) => tx('readwrite', s => s.delete(id)),
    clear: () => tx('readwrite', s => s.clear()).catch(() => {})
  };
})();
