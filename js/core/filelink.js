/* Sigorta Portföy - keeps the agency's own Excel file up to date. A moment after anything changes in the app
   (a new record, an edit, a cancellation) the change is written into the linked workbook, on the page of its
   month and in the file's own layout. Chrome and Edge write to the file itself (File System Access API);
   other browsers, and the app inside a frame, keep an up-to-date copy of the workbook to download. */
(function (root) {
  'use strict';
  var Store = root.Store, DB = root.DB;

  var DELAY = 900;              // ms after the last change
  var RETRY = 15000;            // the file is open in Excel: try again after this
  var BIG_DELETE = 10;          // more rows than this leave the file only after a yes
  var VERSION_EVERY = 30 * 60000;
  var VERSIONS = 5;             // earlier versions kept besides the one from when the file was linked

  var FileLink = {
    link: null,      // { name, kind: 'file' | 'copy', linkedAt, lastSyncAt, lastModified, size, sheets, months, writes }
    status: 'off',   // off | saved | pending | saving | permission | external | locked | missing | confirm | review | error
    error: null,
    dirty: false,    // changes the file does not have yet
    deletes: 0,      // rows a save waiting for a yes would remove
    missing: null,   // policies the file no longer has after it was imported again
    skipped: 0       // policies of a month whose page has no table to put them in
  };
  var handle = null;
  var listeners = new Set();
  var timer = null, retryTimer = null, running = null, again = false, held = 0, allowDeletes = 0;

  /** Can this browser write to a file on disk? (Not inside a frame: pickers are blocked there.) */
  FileLink.canWrite = function () {
    return typeof root.showOpenFilePicker === 'function' && !(root.App && root.App.embedded);
  };
  FileLink.writableName = function (name) { return /\.xlsx$/i.test(name || ''); };

  FileLink.on = function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; };
  function emit() { listeners.forEach(function (fn) { try { fn(FileLink); } catch (e) { console.error(e); } }); }
  function setStatus(s, err) {
    FileLink.status = s;
    FileLink.error = err ? String((err && err.message) || err) : null;
    if (err) console.warn('Excel link:', err);
    emit();
  }

  // ------------------------------------------------------------------ storage
  function saveLink() {
    if (!FileLink.link) return DB.del(DB.FILES, ['link']);
    return DB.putRaw(DB.FILES, [{ key: 'link', value: JSON.parse(JSON.stringify(FileLink.link)) }]);
  }
  function getCopy() { return DB.get(DB.FILES, 'copy').then(function (r) { return r ? r.value : null; }); }

  // The file handle lives in a database of its own that nothing else reads. Some Chrome builds (seen in 153)
  // bring the whole browser down when such a handle is read back from IndexedDB, so the read is guarded:
  // if the browser went down while reading it, this Chrome version keeps no handle and the user picks the file
  // again once per session instead.
  var HANDLE_DB = 'sigorta-portfoy-file';
  function chromeVersion() { var m = /Chrom(?:e|ium)\/(\d+)/.exec(root.navigator ? root.navigator.userAgent : ''); return m ? m[1] : 'other'; }
  function ls(k, v) {
    try {
      if (v === undefined) return root.localStorage.getItem(k);
      if (v === null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, v);
    } catch (e) { return null; }
    return null;
  }
  function handleStoreUsable() {
    try { root.localStorage.getItem('x'); if (!root.indexedDB) return false; } catch (e) { return false; } // without the guard, no stored handle
    return ls('sp:handle-off') !== chromeVersion();
  }
  function handleDb() {
    return new Promise(function (resolve, reject) {
      var r = root.indexedDB.open(HANDLE_DB, 1); // throws in a sandboxed frame: the promise rejects
      r.onupgradeneeded = function () { r.result.createObjectStore('h'); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.onblocked = function () { reject(new Error('blocked')); };
    });
  }
  function dropHandle() {
    return new Promise(function (resolve) {
      try {
        var r = root.indexedDB.deleteDatabase(HANDLE_DB);
        r.onsuccess = r.onerror = r.onblocked = function () { resolve(); };
      } catch (e) { resolve(); } // no IndexedDB here (a sandboxed frame): nothing was kept
    });
  }
  function storeHandle(h) {
    if (!h || !handleStoreUsable()) return dropHandle();
    return handleDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('h', 'readwrite');
        tx.objectStore('h').put(h, 'file');
        tx.oncomplete = tx.onerror = tx.onabort = function () { db.close(); resolve(); };
      });
    }).catch(function () { /* the file is picked again next time */ });
  }
  function loadHandle() {
    try { if (!root.indexedDB) return Promise.resolve(null); } catch (e) { return Promise.resolve(null); }
    if (ls('sp:handle-reading')) {
      // the last start went down while reading the handle: never again on this browser version
      ls('sp:handle-reading', null);
      ls('sp:handle-off', chromeVersion());
      return dropHandle().then(function () { return null; });
    }
    if (!handleStoreUsable()) return Promise.resolve(null);
    ls('sp:handle-reading', String(Date.now()));
    return handleDb().then(function (db) {
      return new Promise(function (resolve) {
        var q = db.transaction('h', 'readonly').objectStore('h').get('file');
        q.onsuccess = function () { db.close(); resolve(q.result || null); };
        q.onerror = function () { db.close(); resolve(null); };
      });
    }).catch(function () { return null; }).then(function (h) { ls('sp:handle-reading', null); return h; });
  }
  function putCopy(bytes) { return DB.putRaw(DB.FILES, [{ key: 'copy', value: bytes }]); }

  /** Earlier versions of the file: the one from when it was linked, then at most one per half hour of saving. */
  function keepVersion(bytes, why) {
    var now = Date.now();
    return DB.keys(DB.FILES).then(function (keys) {
      var vs = keys.filter(function (k) { return /^v:/.test(k); }).sort();
      var last = vs.length ? Number(vs[vs.length - 1].split(':')[1]) : 0;
      if (why !== 'linked' && now - last < VERSION_EVERY) return null;
      var saves = vs.filter(function (k) { return /:save$/.test(k); });
      var drop = saves.slice(0, Math.max(0, saves.length - (VERSIONS - 1)));
      return DB.putRaw(DB.FILES, [{ key: 'v:' + now + ':' + why, at: now, why: why, name: FileLink.link.name, size: bytes.byteLength, value: bytes }])
        .then(function () { return drop.length ? DB.del(DB.FILES, drop) : null; });
    });
  }
  FileLink.versions = function () {
    return DB.getAll(DB.FILES).then(function (all) {
      return all.filter(function (x) { return /^v:/.test(x.key); }).map(function (x) { return { key: x.key, at: x.at, why: x.why, name: x.name, size: x.size }; })
        .sort(function (a, b) { return b.at - a.at; });
    });
  };
  FileLink.versionBytes = function (key) { return DB.get(DB.FILES, key).then(function (r) { return r ? r.value : null; }); };

  // ------------------------------------------------------------------ start
  FileLink.init = function () {
    return DB.get(DB.FILES, 'link').then(function (r) {
      FileLink.link = r ? r.value : null;
      if (!FileLink.link) { setStatus('off'); return null; }
      if (FileLink.link.kind !== 'file') { setStatus('saved'); return null; }
      return loadHandle().then(function (h) {
        handle = h;
        // no handle kept: the user points at the file once, and saving goes on
        if (!handle) { setStatus('repick'); return null; }
        setStatus('saved');
        // the browser may still have the permission (Chrome: "allow on every visit"): then catch up right away
        return FileLink.sync();
      });
    }).catch(function (e) { console.warn(e); setStatus('off'); });
  };

  Store.on(function (kind) {
    if (kind === 'settings' || kind === 'load') return;
    FileLink.schedule();
  });

  FileLink.schedule = function (delay) {
    if (!FileLink.link) return;
    FileLink.dirty = true;
    if (FileLink.link.kind !== 'file' || held) { emit(); return; } // a copy is brought up to date when it is downloaded
    if (['permission', 'repick', 'external', 'missing', 'confirm', 'review'].indexOf(FileLink.status) >= 0) { emit(); return; }
    clearTimeout(timer);
    if (FileLink.status !== 'saving' && FileLink.status !== 'locked') setStatus('pending');
    timer = setTimeout(function () { FileLink.sync(); }, delay == null ? DELAY : delay);
  };

  /** While an import runs, nothing is written; afterwards the link is set up (or not) and saving goes on. */
  FileLink.hold = function () { held++; clearTimeout(timer); };
  FileLink.release = function () { held = Math.max(0, held - 1); if (!held && FileLink.dirty) FileLink.schedule(); };
  /** The user has just said yes to removing these rows (a month, a customer): no second question. */
  FileLink.expectDeletes = function (n) { allowDeletes = Math.max(allowDeletes, n || 0); };

  // ------------------------------------------------------------------ saving
  FileLink.sync = function (opts) {
    opts = opts || {};
    if (!FileLink.link) return Promise.resolve(false);
    if (running) { again = true; return running; }
    clearTimeout(timer);
    clearTimeout(retryTimer);
    running = run(opts).catch(function (e) { FileLink.dirty = true; setStatus('error', e); return false; }).then(function (r) {
      running = null;
      if (again) { again = false; FileLink.schedule(150); }
      return r;
    });
    return running;
  };

  function run(opts) {
    var link = FileLink.link;
    if (link.kind !== 'file') {
      return getCopy().then(function (bytes) {
        if (!bytes) { setStatus('missing'); return false; }
        return write(link, bytes, opts, function (out) { return putCopy(out).then(function () { return true; }); });
      });
    }
    if (!handle) { FileLink.dirty = true; setStatus('repick'); return Promise.resolve(false); }
    return permission(opts.gesture).then(function (ok) {
      if (!ok) { FileLink.dirty = true; setStatus('permission'); return false; }
      return handle.getFile().then(function (file) {
        if (!opts.overwrite && (file.lastModified !== link.lastModified || file.size !== link.size)) {
          FileLink.dirty = true;
          setStatus('external');
          return false;
        }
        return file.arrayBuffer().then(function (bytes) { return write(link, bytes, opts, writeFile); });
      }, function (e) { setStatus('missing', e); return false; });
    });
  }

  function permission(ask) {
    if (!handle) return Promise.resolve(false);
    var o = { mode: 'readwrite' };
    return Promise.resolve(handle.queryPermission ? handle.queryPermission(o) : 'granted').then(function (p) {
      if (p === 'granted') return true;
      if (!ask || !handle.requestPermission) return false;
      return handle.requestPermission(o).then(function (q) { return q === 'granted'; });
    }).catch(function () { return false; });
  }

  function currentPlan(link) {
    return root.ExcelSync.buildPlan({
      link: link, policies: Array.from(Store.policies.values()), customers: Store.customers,
      cancels: Array.from(Store.cancellations.values()), monthsMeta: Store.months
    });
  }
  FileLink.pendingChanges = function () { return FileLink.link ? currentPlan(FileLink.link).changes : 0; };

  /** Plans the changes, writes them into the workbook and hands the new bytes to sink. bytes null: a new workbook. */
  function write(link, bytes, opts, sink) {
    var plan = currentPlan(link);
    var wb = new root.ExcelJS.Workbook();
    if (!bytes && opts.first) opts.first(wb, plan);
    FileLink.skipped = plan.sheets.reduce(function (n, s) { return n + (s.skipped || 0); }, 0);
    if (!plan.changes) { FileLink.dirty = false; setStatus('saved'); return Promise.resolve(true); }
    var deletes = plan.sheets.reduce(function (n, s) { return n + s.deleted.length + s.xdeleted.length; }, 0);
    if (deletes > BIG_DELETE && deletes > allowDeletes && !opts.confirmed) {
      FileLink.deletes = deletes;
      FileLink.dirty = true;
      setStatus('confirm');
      return Promise.resolve(false);
    }
    allowDeletes = 0;
    setStatus('saving');
    var loaded = bytes ? wb.xlsx.load(bytes) : Promise.resolve();
    var next;
    return loaded.then(function () {
      next = root.ExcelSync.apply(wb, plan);
      return wb.xlsx.writeBuffer();
    }).then(function (out) {
      return (bytes ? keepVersion(bytes, 'save') : Promise.resolve()).then(function () { return sink(out); });
    }).then(function (ok) {
      if (!ok || FileLink.link !== link) return false;
      link.sheets = next.sheets;
      link.months = next.months;
      link.lastSyncAt = Date.now();
      link.writes = (link.writes || 0) + 1;
      FileLink.dirty = false;
      FileLink.deletes = 0;
      return saveLink().then(function () { setStatus('saved'); return true; });
    });
  }

  function writeFile(out) {
    var w = null;
    return handle.createWritable().then(function (x) { w = x; return w.write(out); }).then(function () { return w.close(); }).then(function () {
      return handle.getFile();
    }).then(function (f) {
      FileLink.link.lastModified = f.lastModified;
      FileLink.link.size = f.size;
      return true;
    }, function (e) {
      if (w && w.abort) { try { w.abort(); } catch (x) { /* already closed */ } }
      FileLink.dirty = true;
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { setStatus('permission', e); return false; }
      if (e && e.name === 'NotFoundError') { setStatus('missing', e); return false; }
      // most often the file is open in Excel (Windows keeps it locked): try again a little later
      setStatus('locked', e);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(function () { FileLink.sync(); }, RETRY);
      return false;
    });
  }

  /** From a click: asks for permission if needed, then saves. */
  FileLink.saveNow = function () { return FileLink.sync({ gesture: true }); };
  FileLink.confirmDeletes = function () { return FileLink.sync({ gesture: true, confirmed: true }); };

  // ------------------------------------------------------------------ linking
  function sameFile(a, name) { return !!a && String(a.name).toLowerCase() === String(name).toLowerCase(); }

  /**
   * Links the workbook that has just been imported.
   * o: { name, bytes, handle (null: keep a copy), lastModified, size, analysis, placed, cancelsPlaced }
   */
  FileLink.linkImport = function (o) {
    // the file that was imported is never written to: a copy of it goes into the file the user chose
    if (o.copyTo) {
      var target = o.copyTo;
      return fill(target, o.bytes).then(function (f) {
        return FileLink.linkImport(Object.assign({}, o, { copyTo: null, original: o.name, name: target.name, handle: target, lastModified: f.lastModified, size: f.size }));
      });
    }
    var prev = FileLink.link;
    var link = root.ExcelSync.createLink({
      sheets: o.analysis.sheets.filter(function (s) { return s.include && s.month.key; }).map(function (s) { return { name: s.name, month: s.month.key, layout: root.Importer.layoutOf(s) }; }),
      placed: o.placed, cancelsPlaced: o.cancelsPlaced, policies: Store.policies, customers: Store.customers, cancels: Store.cancellations
    });
    if (o.hints) applyHints(link, o.hints, false);
    // the same file imported again: what it had before but has no longer was deleted in Excel
    var missing = { policies: [], cancels: [] };
    if (prev && sameFile(prev, o.name)) {
      var now = {};
      Object.keys(link.sheets).forEach(function (n) {
        Object.keys(link.sheets[n].rows).forEach(function (id) { now[id] = true; });
        Object.keys(link.sheets[n].cancels).forEach(function (id) { now[id] = true; });
      });
      Object.keys(prev.sheets || {}).forEach(function (n) {
        Object.keys(prev.sheets[n].rows || {}).forEach(function (id) { if (!now[id] && Store.policies.has(id)) missing.policies.push(id); });
        Object.keys(prev.sheets[n].cancels || {}).forEach(function (id) { if (!now[id] && Store.cancellations.has(id)) missing.cancels.push(id); });
      });
    }
    return setLink(link, o, missing.policies.length || missing.cancels.length ? missing : null);
  };

  function byRow(a, b) { return a.row - b.row; }

  /**
   * The linked file read again after it was changed in Excel. Rows are lined up with the rows the app knows from
   * its last save (rows may have been added, removed or edited since), so every known row keeps its policy or
   * İptal record. Returns { anchors, keep, skip, fileVals, cancel… } for Store.importRecords and linkImport:
   * anchors: row -> record; keep: records changed in the app since the last save (the app's version stays and
   * is written back); skip: rows of records deleted in the app (they leave the file). null for any other file.
   */
  FileLink.hintsFor = function (name, analysis, built) {
    var link = FileLink.link;
    if (!link || !sameFile(link, name)) return null;
    var Sync = root.ExcelSync, Importer = root.Importer;
    var plan = currentPlan(link);
    var pending = new Set(), xpending = new Set();
    plan.sheets.forEach(function (s) {
      s.rows.forEach(function (r) { if (r.from != null && r.keys.length) pending.add(r.id); });
      s.cancels.forEach(function (r) { if (r.from != null && r.keys.length) xpending.add(r.id); });
    });
    var h = { anchors: new Map(), keep: new Set(), skip: new Set(), fileVals: new Map(), cancelAnchors: new Map(), cancelKeep: new Set(), cancelSkip: new Set(), cancelFileVals: new Map() };
    analysis.sheets.forEach(function (s) {
      var l = link.sheets[s.name];
      if (!l || !s.include || !s.month.key || s.month.key !== l.month) return;
      var layout = Importer.layoutOf(s);
      var owned = Object.keys(l.rows || {}).map(function (id) { return { id: id, row: l.rows[id][0], vals: Sync.keyed(l.rows[id][1], l.layout) }; }).sort(byRow);
      var recs = built.records.filter(function (r) { return r.sheet === s.name; }).sort(byRow).map(function (rec) {
        var v = Sync.recordValues(rec, layout);
        return { rec: rec, raw: v, vals: Sync.keyed(v, layout) };
      });
      Sync.align(owned, recs, 0.6).forEach(function (m) {
        var o = owned[m[0]], x = recs[m[1]], key = s.name + '\u0001' + x.rec.row;
        var p = Store.policies.get(o.id);
        if (!p || p.month !== s.month.key) { h.skip.add(key); return; } // deleted or moved in the app: the row goes
        h.anchors.set(key, o.id);
        h.fileVals.set(o.id, x.raw);
        if (pending.has(o.id)) h.keep.add(o.id);
      });
      if (!l.layout.block || !s.cancelBlock) return;
      var block = layout.block;
      var xowned = Object.keys(l.cancels || {}).map(function (id) { return { id: id, row: l.cancels[id][0], vals: Sync.keyedCancel(l.cancels[id][1], l.layout.block) }; }).sort(byRow);
      var xrecs = built.cancels.filter(function (c) { return c.sheet === s.name; }).sort(byRow).map(function (c) {
        var v = Sync.cancelValues(c, block);
        return { rec: c, raw: v, vals: Sync.keyedCancel(v, block) };
      });
      Sync.align(xowned, xrecs, 0.5).forEach(function (m) {
        var o = xowned[m[0]], x = xrecs[m[1]], key = s.name + '\u0001' + x.rec.row;
        var c = Store.cancellations.get(o.id);
        if (!c || c.month !== s.month.key) { h.cancelSkip.add(key); return; }
        h.cancelAnchors.set(key, o.id);
        h.cancelFileVals.set(o.id, x.raw);
        if (xpending.has(o.id)) h.cancelKeep.add(o.id);
      });
    });
    return h;
  };

  /** What the hints mean for the new link: kept records are written back, rows of deleted ones are removed. */
  function applyHints(link, h, all) {
    Object.keys(link.sheets).forEach(function (n) {
      var s = link.sheets[n];
      Object.keys(s.rows).forEach(function (id) { if ((all || h.keep.has(id)) && h.fileVals.has(id)) s.rows[id][1] = h.fileVals.get(id); });
      Object.keys(s.cancels).forEach(function (id) { if ((all || h.cancelKeep.has(id)) && h.cancelFileVals.has(id)) s.cancels[id][1] = h.cancelFileVals.get(id); });
    });
    h.skip.forEach(function (key) { var k = key.split('\u0001'), s = link.sheets[k[0]]; if (s) s.rows['gone:' + k[1]] = [Number(k[1]), {}]; });
    h.cancelSkip.forEach(function (key) { var k = key.split('\u0001'), s = link.sheets[k[0]]; if (s) s.cancels['gone:' + k[1]] = [Number(k[1]), []]; });
  }

  function setLink(link, o, missing) {
    link.kind = o.handle ? 'file' : 'copy';
    // a copy kept in the browser downloads under its own name, so it never replaces the original
    link.name = link.kind === 'copy' && !o.keepName ? FileLink.copyName(o.name) : o.name;
    var prev = FileLink.link;
    link.original = o.original || (prev && prev.original && sameFile(prev, link.name) ? prev.original : null) || (link.kind === 'copy' ? o.name : null);
    link.linkedAt = Date.now();
    link.lastSyncAt = null;
    link.lastModified = o.lastModified != null ? o.lastModified : null;
    link.size = o.size != null ? o.size : null;
    link.writes = 0;
    link.importId = o.importId || null;
    clearTimeout(timer);
    clearTimeout(retryTimer);
    FileLink.link = link;
    handle = o.handle || null;
    FileLink.missing = missing || null;
    FileLink.dirty = true;
    return DB.clear(DB.FILES).then(function () {
      return Promise.all([saveLink(), storeHandle(handle), link.kind === 'copy' ? putCopy(o.bytes) : null]);
    }).then(function () {
      return o.bytes ? keepVersion(o.bytes, 'linked') : null;
    }).then(function () {
      if (FileLink.missing) { setStatus('review'); return false; }
      setStatus('saved');
      // records the app has and the file does not yet
      return link.kind === 'file' ? FileLink.sync({ gesture: true }) : true;
    });
  }

  /** After the file was imported again: what it no longer has is deleted here too, or written back. */
  FileLink.resolveMissing = function (remove) {
    var m = FileLink.missing || { policies: [], cancels: [] };
    FileLink.missing = null;
    if (remove) {
      FileLink.hold();
      m.cancels.forEach(function (id) { if (Store.cancellations.has(id)) Store.deleteCancellation(id); });
      m.policies.forEach(function (id) { if (Store.policies.has(id)) Store.deletePolicy(id); });
      FileLink.release();
    }
    setStatus('saved');
    return FileLink.sync({ gesture: true });
  };
  FileLink.missingCount = function () { var m = FileLink.missing; return m ? m.policies.length + m.cancels.length : 0; };

  function cloneMap(m) { return new Map(Array.from(m.entries()).map(function (e) { return [e[0], JSON.parse(JSON.stringify(e[1]))]; })); }

  /**
   * Links a workbook without importing it: its rows are matched to the app's policies (a dry run of the import),
   * and the next save writes the app's values into them. Rows the app does not know stay as they are.
   */
  function relinkFrom(bytes, o) {
    var XLSX = root.XLSX, Importer = root.Importer, Portfolio = root.Portfolio;
    var a = Importer.analyzeWorkbook(Importer.readWorkbook(new Uint8Array(bytes), XLSX, o.name), XLSX, { fileName: o.name, saved: Store.mappings });
    var built = Importer.buildRecords(a, { tidyNames: Store.settings.tidyNames !== false });
    // the file this link already knows: its rows are lined up with the last save first
    var hints = FileLink.hintsFor(o.name, a, built);
    function free(r) { return !hints || (!hints.anchors.has(r.sheet + '\u0001' + r.row) && !hints.skip.has(r.sheet + '\u0001' + r.row)); }
    function freeCancel(c) { return !hints || (!hints.cancelAnchors.has(c.sheet + '\u0001' + c.row) && !hints.cancelSkip.has(c.sheet + '\u0001' + c.row)); }
    // the other rows: a dry run of the import on a copy of the data tells which policy each one is
    var state = { customers: cloneMap(Store.customers), policies: cloneMap(Store.policies) };
    var res = Portfolio.importRecords(state, built.records.filter(free), { fileName: o.name });
    var placed = res.placed.filter(function (x) { return Store.policies.has(x.id); });
    var byKey = new Map();
    Store.cancellations.forEach(function (x) { var k = Portfolio.cancelKey(x); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(x.id); });
    var cancelsPlaced = [];
    built.cancels.filter(freeCancel).forEach(function (c) { var l = byKey.get(Portfolio.cancelKey(c)); if (l && l.length) cancelsPlaced.push({ sheet: c.sheet, row: c.row, id: l.shift() }); });
    if (hints) {
      hints.anchors.forEach(function (id, key) { var k = key.split('\u0001'); placed.push({ sheet: k[0], row: Number(k[1]), id: id }); });
      hints.cancelAnchors.forEach(function (id, key) { var k = key.split('\u0001'); cancelsPlaced.push({ sheet: k[0], row: Number(k[1]), id: id }); });
    }
    // what the rows say now (the file's values): the first save writes the app's values wherever they differ
    var link = root.ExcelSync.createLink({
      sheets: a.sheets.filter(function (s) { return s.include && s.month.key; }).map(function (s) { return { name: s.name, month: s.month.key, layout: Importer.layoutOf(s) }; }),
      placed: placed, cancelsPlaced: cancelsPlaced, policies: state.policies, customers: state.customers, cancels: Store.cancellations
    });
    if (hints) applyHints(link, hints, true);
    return setLink(link, o, null);
  }

  /** The file changed outside the app: keep the app's data and write it into the file as it now is. */
  FileLink.overwrite = function () {
    if (!handle) return Promise.resolve(false);
    return permission(true).then(function (ok) {
      if (!ok) { setStatus('permission'); return false; }
      return handle.getFile().then(function (f) {
        return f.arrayBuffer().then(function (bytes) {
          return relinkFrom(bytes, { name: FileLink.link.name, original: FileLink.link.original, handle: handle, bytes: bytes, lastModified: f.lastModified, size: f.size });
        });
      });
    });
  };

  /** The file as it is now, to import its changes: { name, data, handle, lastModified, size }. */
  FileLink.readFile = function () {
    if (!handle) return Promise.reject(new Error('no file'));
    return permission(true).then(function (ok) {
      if (!ok) throw new Error('permission');
      return handle.getFile();
    }).then(function (f) {
      return f.arrayBuffer().then(function (b) { return { name: f.name, data: new Uint8Array(b), handle: handle, lastModified: f.lastModified, size: f.size, fromLink: true }; });
    });
  };

  /** The name offered for the working copy: "Üretim 2026.xlsx" -> "Üretim 2026 - guncel.xlsx" (plain letters: every browser keeps it). */
  FileLink.copyName = function (name) {
    var base = String(name || 'sigorta-portfoy').replace(/\.[a-z0-9]+$/i, '');
    return /- guncel$/i.test(base) ? base + '.xlsx' : base + ' - guncel.xlsx';
  };

  /** Writes bytes into a file (a fresh working copy); resolves to the File as it now is. */
  function fill(h, bytes) {
    return h.createWritable().then(function (w) { return w.write(bytes).then(function () { return w.close(); }); }).then(function () { return h.getFile(); });
  }

  /**
   * Asks where to keep the working copy of a file (from a click). The file itself is never written to: choosing it
   * again as the copy is refused (code 'same').
   */
  FileLink.chooseCopy = function (name, original) {
    return root.showSaveFilePicker({ id: 'sigorta-portfoy-excel', suggestedName: FileLink.copyName(name), types: XLSX_TYPES }).then(function (h) {
      if (!original || !original.isSameEntry) return h;
      return original.isSameEntry(h).then(function (same) {
        if (same) throw Object.assign(new Error('same'), { code: 'same' });
        return h;
      });
    });
  };

  /** Goes on from another workbook without touching it: a copy of it, linked to the app's data. */
  function linkCopyOf(p) {
    if (!FileLink.writableName(p.file.name)) return Promise.reject(Object.assign(new Error('type'), { code: 'type' }));
    var copy;
    return FileLink.chooseCopy(p.file.name, p.handle).then(function (h) {
      copy = h;
      return p.file.arrayBuffer();
    }).then(function (bytes) {
      return fill(copy, bytes).then(function (f) {
        return relinkFrom(bytes, { name: copy.name, original: p.file.name, handle: copy, bytes: bytes, lastModified: f.lastModified, size: f.size });
      });
    });
  }

  var XLSX_TYPES = [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];

  /** Asks for an Excel file: { file, handle }. Uses the browser's file picker that can also give write access. */
  FileLink.pick = function () {
    return root.showOpenFilePicker({ id: 'sigorta-portfoy-excel', types: [{ description: 'Excel', accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'],
      'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'], 'application/vnd.oasis.opendocument.spreadsheet': ['.ods'], 'text/csv': ['.csv']
    } }], excludeAcceptAllOption: false, multiple: false }).then(function (list) {
      var h = list[0];
      return h.getFile().then(function (file) { return { file: file, handle: h }; });
    });
  };

  /**
   * This session has no handle for the linked file (see loadHandle): the user picks it once. The same file goes on
   * as before; a file of another name is linked in its place only after a yes (onOther).
   */
  FileLink.repick = function (onOther) {
    var link = FileLink.link;
    if (!link) return Promise.resolve(false);
    var picked;
    return FileLink.pick().then(function (p) {
      picked = p;
      if (!sameFile(link, p.file.name)) {
        return Promise.resolve(onOther ? onOther(p.file.name) : false).then(function (ok) {
          return ok ? linkCopyOf(p) : false;
        });
      }
      handle = p.handle;
      return storeHandle(handle).then(function () {
        setStatus('saved');
        return FileLink.sync({ gesture: true });
      });
    });
  };

  /** Links another workbook to the app's data (no import). */
  FileLink.linkExisting = function () {
    return FileLink.pick().then(linkCopyOf);
  };

  /** A new .xlsx with every month of the app on its own page (the agency's yellow headers and İptal block). */
  FileLink.createNew = function (suggested) {
    var h;
    return root.showSaveFilePicker({ id: 'sigorta-portfoy-excel', suggestedName: suggested || 'sigorta-portfoy.xlsx', types: XLSX_TYPES }).then(function (x) {
      h = x;
      var link = { sheets: {}, months: {}, name: h.name, kind: 'file', linkedAt: Date.now(), writes: 0 };
      clearTimeout(timer);
      FileLink.link = link;
      handle = h;
      FileLink.missing = null;
      return DB.clear(DB.FILES).then(function () { return storeHandle(h); }).then(function () {
        return write(link, null, {
          confirmed: true,
          // nothing to write yet: the file still needs one page, this month's
          first: function (wb, plan) {
            if (plan.changes) return;
            var s = root.ExcelSync.startSheet(wb, root.U.todayISO().slice(0, 7), null);
            plan.link.sheets[s.name] = s.entry;
            plan.link.months[s.entry.month] = s.name;
            plan.changes = 1;
          }
        }, writeFile);
      });
    });
  };

  FileLink.unlink = function () {
    clearTimeout(timer);
    clearTimeout(retryTimer);
    FileLink.link = null;
    handle = null;
    FileLink.missing = null;
    FileLink.dirty = false;
    FileLink.deletes = 0;
    return Promise.all([DB.clear(DB.FILES), dropHandle()]).then(function () { setStatus('off'); });
  };

  /** The workbook with every change in it: { name, bytes } (a copy is brought up to date first). */
  FileLink.current = function () {
    if (!FileLink.link) return Promise.reject(new Error('no link'));
    var link = FileLink.link;
    return FileLink.sync({ gesture: true, confirmed: link.kind !== 'file' }).then(function () {
      if (link.kind === 'file') return handle.getFile().then(function (f) { return f.arrayBuffer(); });
      return getCopy();
    }).then(function (bytes) { return { name: link.name, bytes: bytes }; });
  };

  root.FileLink = FileLink;
})(typeof self !== 'undefined' ? self : this);
