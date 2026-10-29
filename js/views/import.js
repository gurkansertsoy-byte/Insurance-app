/* Excel import */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Schema = window.Schema, Importer = window.Importer, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  function lang() { return window.I18N.lang; }
  function state() {
    return App.viewState.import || (App.viewState.import = { step: 'pick', overrides: {}, sheetOpts: {}, mode: 'merge', tidyNames: true, remember: true });
  }

  function analyze(vs) {
    var saved = Object.assign({}, Store.mappings, vs.overrides);
    var a = Importer.analyzeWorkbook(vs.wb, window.XLSX, { fileName: vs.file.name, saved: saved });
    a.sheets = a.sheets.map(function (s) {
      var o = vs.sheetOpts[s.name];
      if (o && o.headerRow != null && o.headerRow !== s.headerRow) {
        s = Importer.reanalyze(s, { saved: saved, fileName: vs.file.name, date1904: a.date1904, sheetIndex: s.index, headerRow: o.headerRow });
      }
      if (o && o.include != null) s.include = o.include;
      if (o && o.month) s.month = { key: o.month, source: 'manual' };
      return s;
    });
    vs.analysis = a;
  }

  function startFile(vs, file, handle) {
    vs.step = 'reading';
    // File objects have a bytes() method in current browsers, so the bundled sample uses `data`
    var preloaded = file.data instanceof Uint8Array ? file.data : null;
    vs.file = { name: file.name, size: file.size || (preloaded ? preloaded.length : 0) };
    // a file picked with write access can be kept up to date by the app (see FileLink)
    vs.handle = handle || file.handle || null;
    // the app's own working copy, opened again from its notice: saving goes on into it
    vs.fromLink = !!file.fromLink;
    // the bundled sample is no file on disk: the app keeps its copy
    vs.sample = !!file.sample;
    vs.lastModified = file.lastModified != null ? file.lastModified : null;
    vs.linked = false;
    vs.error = null;
    vs.overrides = {};
    vs.sheetOpts = {};
    vs.result = null;
    App.refresh();
    var p = preloaded ? Promise.resolve(preloaded) : UI.readFile(file);
    p.then(function (bytes) {
      setTimeout(function () {
        try {
          vs.wb = Importer.readWorkbook(bytes, window.XLSX, file.name);
          analyze(vs);
          vs.bytes = bytes;
          vs.risks = window.FileLink.writableName(file.name) ? App.excelRisks(bytes) : [];
          vs.autosave = window.FileLink.writableName(file.name) && !vs.risks.length;
          vs.step = 'preview';
        } catch (e) {
          console.error(e);
          vs.step = 'pick';
          vs.error = t('import.readError', { msg: e && e.message ? e.message : String(e) });
        }
        App.refresh();
      }, 20);
    }, function (e) {
      vs.step = 'pick';
      vs.error = t('import.readError', { msg: e && e.message ? e.message : String(e) });
      App.refresh();
    });
  }

  function sourceNote(m) {
    if (!m.key) return { text: t('import.src.none'), tone: 'bad' };
    if (m.source === 'manual') return { text: t('import.src.manual'), tone: 'good' };
    var base = m.source.split('+')[0];
    var extra = m.source.split('+')[1];
    var text = t('import.src.' + base);
    if (extra) text += ' · ' + t('import.src.y' + extra);
    return { text: text, tone: extra === 'guess' ? 'warn' : 'good' };
  }

  function fileZone(vs) {
    var FileLink = window.FileLink;
    var input = h('input', { type: 'file', id: 'import-file', accept: '.xlsx,.xls,.xlsm,.ods,.csv', hidden: true, onChange: function () { if (input.files[0]) startFile(vs, input.files[0]); } });
    var zone = h('label', { class: 'dropzone', for: 'import-file', id: 'import-drop' }, icon('cloud-upload'), h('strong', null, t('import.drop')), h('span', { class: 'muted' }, t('import.dropSub')), h('span', { class: 'small muted' }, t('import.formats')));
    // Chrome and Edge: the picker that can also let the app write to the file afterwards
    zone.addEventListener('click', function (e) {
      if (!FileLink.canWrite()) return;
      e.preventDefault();
      FileLink.pick().then(function (p) { startFile(vs, p.file, p.handle); }, function (err) {
        if (err && err.name === 'AbortError') return;
        console.warn(err);
        input.click();
      });
    });
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      var item = e.dataTransfer.items && e.dataTransfer.items[0];
      var getHandle = FileLink.canWrite() && item && item.getAsFileSystemHandle ? item.getAsFileSystemHandle() : null;
      if (!getHandle) { startFile(vs, f); return; }
      getHandle.then(function (hd) { startFile(vs, f, hd && hd.kind === 'file' ? hd : null); }, function () { startFile(vs, f); });
    });
    return h('div', null, zone, input);
  }

  function history() {
    if (!Store.imports.length) return null;
    return h('section', { class: 'card', id: 'import-history' },
      h('div', { class: 'card-head' }, h('h2', null, t('import.history')), h('span', { class: 'sub' }, t('import.historySub'))),
      h('div', { class: 'card-body flush', style: { marginTop: '8px' } }, h('div', { class: 'list' }, Store.imports.slice(0, 12).map(function (e) {
        return h('div', { class: 'list-item' }, h('span', { class: 'avatar sm' }, icon('file-spreadsheet')),
          h('div', { class: 'main' }, h('div', { class: 't' }, e.file || '—'),
            h('div', { class: 's' }, UI.items(F.dateTime(e.at), t('import.histLine', { s: e.sheets, a: e.added, u: e.updated, c: e.customersAdded }),
              e.months && e.months.length ? e.months.length > 3 ? F.month(e.months[0], true) + ' – ' + F.month(e.months[e.months.length - 1], true) : e.months.map(function (m) { return F.month(m, true); }).join(', ') : null,
              e.mode === 'replace' ? UI.pill(t('import.modeReplaceShort'), 'warn') : null))),
          e.undone ? UI.pill(t('import.undone'), 'plain') : (e.added ? h('button', { type: 'button', class: 'btn btn-sm', onClick: function () {
            UI.confirm({ title: t('import.undoTitle'), message: t('import.undoMsg', { n: e.added, file: e.file }), danger: true, confirm: t('import.undo') }).then(function (ok) {
              if (!ok) return;
              var FileLink = window.FileLink;
              if (FileLink.link && FileLink.link.importId === e.id) FileLink.unlink();
              else FileLink.expectDeletes(e.added + (e.cancelsAdded || 0));
              var r = Store.undoImport(e.id);
              UI.toast(t('import.undoDone', { p: r.policies, c: r.customers }));
            });
          } }, icon('undo-2'), t('import.undo')) : null));
      }))));
  }

  function mappingDialog(vs, sheetName) {
    var m;
    var body = h('div', { class: 'stack' });
    function draw() {
      UI.clear(body);
      var s = vs.analysis.sheets.filter(function (x) { return x.name === sheetName; })[0];
      if (!s) return;
      var hrInput = h('input', { type: 'number', min: 1, max: Math.max(1, s.rawRows.length), id: 'map-header-row', class: 'input', value: s.headerRow >= 0 ? s.headerRow + 1 : 1, style: { width: '90px' } });
      body.appendChild(h('div', { class: 'row' }, h('label', { for: 'map-header-row', class: 'field-label' }, t('import.headerRow')), hrInput,
        h('button', { type: 'button', class: 'btn btn-sm', onClick: function () {
          var n = Math.max(1, Math.min(s.rawRows.length, parseInt(hrInput.value, 10) || 1));
          vs.sheetOpts[s.name] = Object.assign(vs.sheetOpts[s.name] || {}, { headerRow: n - 1 });
          analyze(vs); draw(); App.refresh();
        } }, t('common.apply')),
        h('span', { class: 'small muted' }, t('import.headerRowHint'))));
      if (s.headerRow < 0) { body.appendChild(h('div', { class: 'callout warn' }, icon('triangle-alert'), h('span', null, t('import.w.noHeader')))); return; }
      var opts = [{ group: t('import.standardFields'), options: Schema.FIELDS.map(function (f) { return { value: f.key, label: lang() === 'en' ? f.en : f.tr }; }) },
        { group: t('import.otherChoices'), options: [{ value: '_first', label: t('import.firstName') }, { value: '_last', label: t('import.lastName') }, { value: '_custom', label: t('import.keepCustom') }, { value: '_ignore', label: t('import.ignore') }] }];
      body.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, t('import.excelColumn')), h('th', null, t('import.samples')), h('th', null, t('import.appField')))),
        h('tbody', null, s.columns.map(function (col) {
          var cur = col.role === 'ignored' ? '_ignore' : col.role === 'custom' ? '_custom' : col.field;
          var sel = UI.select('map-' + col.col, opts, cur, { class: 'input', onChange: function (e) {
            vs.overrides[U.fold(col.header)] = e.target.value;
            analyze(vs); draw(); App.refresh();
          } });
          return h('tr', { class: 'map-row' },
            h('td', null, h('span', { class: 'chip mono' }, Importer.colLetter(col.col)), ' ', h('strong', null, col.header),
              col.role === 'duplicate' ? h('div', { class: 'small muted' }, t('import.duplicateCol')) : null),
            h('td', null, h('div', { class: 'sample-vals', title: col.samples.join(' | ') }, col.samples.join(' · ') || '—')),
            h('td', null, sel));
        })))));
    }
    draw();
    m = UI.modal({ title: t('import.mappingTitle', { sheet: sheetName }), icon: 'arrow-up-down', size: 'wide', body: body,
      foot: [h('span', { class: 'small muted', style: { marginRight: 'auto' } }, t('import.mappingNote')), h('button', { type: 'button', class: 'btn btn-primary', onClick: function () { m.close(); } }, t('common.done'))] });
  }

  function preview(vs) {
    var a = vs.analysis;
    var included = a.sheets.filter(function (s) { return s.include; });
    var rowsTotal = U.sum(included, function (s) { return s.rows.length; });
    var missingMonth = included.filter(function (s) { return !s.month.key; });
    var table = h('table', { class: 'data sheet-list', id: 'sheet-table' },
      h('thead', null, h('tr', null, [t('import.colInclude'), t('import.colSheet'), t('import.colMonth'), t('import.colRows'), t('import.colColumns'), t('import.colNotes'), ''].map(function (x, i) { return h('th', { class: i === 3 ? 'r' : null }, x); }))),
      h('tbody', null, a.sheets.map(function (s, i) {
        var src = sourceNote(s.month);
        var mapped = s.columns.filter(function (c) { return c.role === 'primary'; });
        var custom = s.columns.filter(function (c) { return c.role === 'custom'; });
        var dups = s.columns.filter(function (c) { return c.role === 'duplicate'; });
        var skipped = s.skipped.empty + s.skipped.totals + s.skipped.repeatedHeader;
        var monthIn = UI.monthInput('sheet-month-' + i, s.month.key || '', function (v) {
          vs.sheetOpts[s.name] = Object.assign(vs.sheetOpts[s.name] || {}, { month: v });
          s.month = { key: v, source: v ? 'manual' : 'none' };
          App.refresh();
        }, { style: { width: '220px' } });
        var include = h('input', { type: 'checkbox', id: 'sheet-inc-' + i, checked: s.include, disabled: !s.rows.length, 'aria-label': t('import.colInclude') + ' ' + s.name, onChange: function (e) {
          vs.sheetOpts[s.name] = Object.assign(vs.sheetOpts[s.name] || {}, { include: e.target.checked });
          s.include = e.target.checked;
          App.refresh();
        } });
        var warnings = s.warnings.filter(function (w, j, arr) { return arr.indexOf(w) === j; }).map(function (w) { return UI.pill(t('import.w.' + w), w === 'noMonth' || w === 'noHeader' ? 'bad' : 'warn'); });
        if (s.hidden) warnings.push(UI.pill(t('import.w.hidden'), 'plain'));
        return h('tr', { id: 'sheet-row-' + i, style: !s.include ? { opacity: 0.62 } : null },
          h('td', { class: 'c' }, include),
          h('td', { class: 'name-cell' }, s.name, h('span', { class: 'sub' }, s.headerRow >= 0 ? t('import.headerAt', { n: s.headerRow + 1 }) + (s.titleText ? ' · ' + s.titleText.slice(0, 60) : '') : t('import.noHeaderShort'))),
          h('td', null, monthIn, h('div', { class: 'hint ' + src.tone, style: { marginTop: '3px' } }, src.text)),
          h('td', { class: 'r' }, h('strong', null, F.num(s.rows.length)), skipped ? h('div', { class: 'small muted' }, t('import.skippedRows', { n: skipped })) : null),
          h('td', null, h('div', { class: 'small' }, t('import.mappedCols', { n: mapped.length })),
            s.cancelBlock ? h('div', { class: 'small', style: { color: 'var(--bad-ink)', marginTop: '3px' } }, icon('ban'), ' ', t('import.cancelBlock', { col: Importer.colLetter(s.cancelBlock.startCol), n: s.cancels.length })) : null,
            custom.length ? h('div', { class: 'chips', style: { marginTop: '4px' }, title: t('import.customHint') }, custom.slice(0, 6).map(function (c) { return h('span', { class: 'chip outline' }, '+ ' + c.header); }), custom.length > 6 ? h('span', { class: 'chip' }, '+' + (custom.length - 6)) : null) : null,
            dups.length ? h('div', { class: 'small muted', style: { marginTop: '3px' } }, t('import.dupCols', { cols: dups.map(function (c) { return c.header; }).join(', ') })) : null),
          h('td', null, h('div', { class: 'chips' }, warnings.length ? warnings : UI.pill(t('import.ok'), 'good'))),
          h('td', { class: 'actions-cell' }, h('button', { type: 'button', class: 'btn btn-sm', id: 'map-btn-' + i, onClick: function () { mappingDialog(vs, s.name); } }, icon('arrow-up-down'), t('import.columns'))));
      })));

    var modeRadios = h('div', { class: 'stack', style: { gap: '8px' } },
      [['merge', 'import.modeMerge', 'import.modeMergeSub'], ['replace', 'import.modeReplace', 'import.modeReplaceSub']].map(function (o) {
        return h('label', { class: 'check', style: { alignItems: 'flex-start' } },
          h('input', { type: 'radio', name: 'import-mode', id: 'mode-' + o[0], value: o[0], checked: vs.mode === o[0], onChange: function () { vs.mode = o[0]; App.refresh(); } }),
          h('span', null, h('strong', null, t(o[1])), h('div', { class: 'small muted' }, t(o[2]))));
      }));
    var opts = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, t('import.options'))),
      h('div', { class: 'card-body grid-2' }, modeRadios,
        h('div', { class: 'stack', style: { gap: '8px' } },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'opt-tidy', checked: vs.tidyNames, onChange: function (e) { vs.tidyNames = e.target.checked; } }), t('import.tidyNames')),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'opt-remember', checked: vs.remember, onChange: function (e) { vs.remember = e.target.checked; } }), t('import.remember')))),
      h('div', { class: 'card-body', style: { borderTop: '1px solid var(--border)', marginTop: '6px', paddingTop: '14px' } }, App.excelImportOption(vs)));

    var go = h('button', { type: 'button', class: 'btn btn-primary', id: 'import-run', disabled: !included.length, onClick: function () { run(vs); } }, icon('upload'), t('import.run', { n: F.num(rowsTotal) }));
    return h('div', { class: 'stack' },
      h('section', { class: 'card' }, h('div', { class: 'card-body row' },
        h('span', { class: 'avatar' }, icon('file-spreadsheet')),
        h('div', { style: { flex: 1, minWidth: 0 } }, h('h2', { id: 'import-file-name' }, vs.file.name), h('div', { class: 'small muted' }, t('import.fileInfo', { size: F.num(Math.round(vs.file.size / 1024)), n: a.sheets.length, rows: F.num(rowsTotal), inc: included.length }))),
        h('button', { type: 'button', class: 'btn', onClick: function () { App.viewState.import = null; App.refresh(); } }, icon('folder-open'), t('import.otherFile')))),
      h('div', { class: 'callout' }, icon('info'), h('div', null, h('strong', null, t('import.checkTitle')), h('div', { class: 'small' }, t('import.checkText')))),
      missingMonth.length ? h('div', { class: 'callout bad', id: 'missing-month' }, icon('circle-alert'), h('span', null, t('import.missingMonth', { sheets: missingMonth.map(function (s) { return s.name; }).join(', ') }))) : null,
      h('section', { class: 'card', style: { overflow: 'hidden' } }, h('div', { class: 'table-wrap' }, table)),
      opts,
      h('div', { class: 'row' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn', onClick: function () { App.viewState.import = null; App.refresh(); } }, t('common.cancel')), go));
  }

  function run(vs) {
    var a = vs.analysis;
    var included = a.sheets.filter(function (s) { return s.include; });
    var missing = included.filter(function (s) { return !s.month.key; });
    if (missing.length) {
      UI.toast(t('import.missingMonth', { sheets: missing.map(function (s) { return s.name; }).join(', ') }), { type: 'bad' });
      var el = document.getElementById('missing-month');
      if (el) el.scrollIntoView({ block: 'center' });
      return;
    }
    var FileLink = window.FileLink;
    var link = vs.autosave && FileLink.writableName(vs.file.name);
    function go() {
      // the file given to the app is never written to: while the click still counts, the user chooses the new
      // file the app keeps saving into (its own working copy, opened again, goes on as it is)
      if (link && FileLink.canWrite() && !vs.fromLink && !vs.sample && !vs.copyTo && !vs.noCopyFile) {
        FileLink.chooseCopy(vs.file.name, vs.handle).then(function (h) { vs.copyTo = h; go(); }, function (e) {
          if (e && e.code === 'same') { UI.toast(t('import.copySame'), { type: 'bad', timeout: 7000 }); return; }
          // no new file chosen: the import goes on, the app keeps the up-to-date copy to download
          if (!(e && e.name === 'AbortError')) console.error(e);
          UI.toast(t('import.copyCancelled'), { type: 'info', timeout: 7000 });
          vs.noCopyFile = true;
          go();
        });
        return;
      }
      vs.noCopyFile = false;
      var allowed = link && vs.fromLink && vs.handle && vs.handle.requestPermission ? Promise.resolve(vs.handle.requestPermission({ mode: 'readwrite' })).catch(function () { return 'denied'; }) : Promise.resolve(null);
      var copyTo = vs.copyTo || null;
      vs.copyTo = null;
      vs.step = 'importing';
      App.refresh();
      FileLink.hold();
      setTimeout(function () {
        var built = Importer.buildRecords(a, { tidyNames: vs.tidyNames, lang: lang() });
        var saveMap = {};
        if (vs.remember) Object.keys(vs.overrides).forEach(function (k) { saveMap[k] = vs.overrides[k]; });
        // the linked file again (changed in Excel): its rows are lined up with the last save
        var hints = vs.mode === 'replace' ? null : FileLink.hintsFor(vs.file.name, a, built);
        Store.importRecords(built.records, a, { mode: vs.mode, fileName: vs.file.name, saveMappings: saveMap, cancels: built.cancels, hints: hints }).then(function (r) {
          vs.step = 'done';
          vs.result = r.result;
          vs.entry = r.entry;
          vs.skippedRows = built.skipped + U.sum(included, function (s) { return s.skipped.empty + s.skipped.totals + s.skipped.repeatedHeader; });
          vs.wb = null;
          if (!link) return null;
          var bytes = vs.bytes;
          return allowed.then(function () {
            return FileLink.linkImport({
              name: vs.file.name, handle: FileLink.canWrite() && vs.fromLink ? vs.handle : null, copyTo: copyTo, keepName: vs.fromLink, lastModified: vs.lastModified, size: bytes.byteLength,
              bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), analysis: a,
              placed: r.result.placed, cancelsPlaced: r.result.cancelsPlaced, importId: r.entry.id, hints: hints
            });
          }).then(function () { vs.linked = true; }, function (e) { console.error(e); UI.toast(t('xl.err.link'), { type: 'bad' }); });
        }).then(function () {
          vs.bytes = null;
          FileLink.release();
          App.refresh();
        }, function (e) {
          console.error(e);
          FileLink.release();
          vs.step = 'preview';
          UI.toast(t('import.failed'), { type: 'bad' });
          App.refresh();
        });
      }, 30);
    }
    if (vs.mode === 'replace' && Store.policies.size) {
      UI.confirm({ title: t('import.replaceTitle'), message: t('import.replaceMsg', { p: F.num(Store.policies.size), c: F.num(Store.customers.size) }), danger: true, confirm: t('import.replaceGo') })
        .then(function (ok) { if (ok) go(); });
    } else go();
  }

  function done(vs) {
    var r = vs.result, e = vs.entry;
    var issueTypes = {};
    r.issues.forEach(function (i) { issueTypes[i.type] = (issueTypes[i.type] || 0) + 1; });
    var matched = r.matchedBy;
    var vsDone = vs.doneFilter || '';
    var issues = r.issues.filter(function (i) { return !vsDone || i.type === vsDone; });
    var stat = function (id, k, v, sub) { return h('div', { id: id }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), sub ? h('div', { class: 'small muted' }, sub) : null); };
    return h('div', { class: 'stack' },
      h('div', { class: 'callout good', id: 'import-done' }, icon('circle-check'), h('div', null, h('strong', null, t('import.doneTitle')), h('div', { class: 'small' }, t('import.doneText', { file: e.file, n: e.sheets, months: e.months.length ? F.month(e.months[0]) + (e.months.length > 1 ? ' – ' + F.month(e.months[e.months.length - 1]) : '') : '' })))),
      App.excelImportDone(vs),
      h('section', { class: 'card' }, h('div', { class: 'card-body stack' },
        h('div', { class: 'result-grid' + (r.cancels && r.cancels.rows ? ' three' : '') },
          stat('res-added', t('import.r.added'), F.num(r.added.length)),
          stat('res-updated', t('import.r.updated'), F.num(r.updated.length), t('import.r.updatedSub')),
          stat('res-unchanged', t('import.r.unchanged'), F.num(r.unchanged + r.duplicateRows), r.duplicateRows ? t('import.r.dupRows', { n: r.duplicateRows }) : t('import.r.unchangedSub')),
          stat('res-skipped', t('import.r.skipped'), F.num(vs.skippedRows || 0), t('import.r.skippedSub')),
          stat('res-customers', t('import.r.newCustomers'), F.num(r.customersAdded.length)),
          stat('res-matched', t('import.r.matched'), F.num(matched.tc + matched['name+phone'] + matched['name+plate'] + matched.name + matched['name-ambiguous']), t('import.r.matchedSub', { tc: matched.tc, np: matched['name+phone'] + matched['name+plate'], n: matched.name + matched['name-ambiguous'] })),
          stat('res-updatedc', t('import.r.updatedCustomers'), F.num(r.customersUpdated.length)),
          r.cancels && r.cancels.rows ? stat('res-cancels', t('import.r.cancels'), F.num(r.cancels.rows), t('import.r.cancelsSub', { a: r.cancels.auto + r.cancels.manual, b: r.cancels.ambiguous, c: r.cancels.none })) : null,
          stat('res-issues', t('import.r.issues'), F.num(r.issues.length))),
        h('div', { class: 'row' },
          h('a', { class: 'btn btn-primary', href: '#panel', id: 'go-dashboard' }, icon('layout-dashboard'), t('import.goDashboard')),
          h('a', { class: 'btn', href: '#musteriler' }, icon('users'), t('import.goCustomers')),
          h('a', { class: 'btn', href: '#aylar' }, icon('calendar-days'), t('import.goMonths')),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: function () { App.viewState.import = null; App.refresh(); } }, icon('upload'), t('import.another'))))),
      r.issues.length ? h('section', { class: 'card', id: 'import-issues', style: { overflow: 'hidden' } },
        h('div', { class: 'card-head' }, h('h2', null, t('import.issuesTitle')), h('span', { class: 'sub' }, t('import.issuesSub')),
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'filter-chip', 'aria-pressed': String(!vsDone), onClick: function () { vs.doneFilter = ''; App.refresh(); } }, t('common.all'), h('span', { class: 'n' }, F.num(r.issues.length))),
            Object.keys(issueTypes).map(function (k) { return h('button', { type: 'button', class: 'filter-chip', 'aria-pressed': String(vsDone === k), onClick: function () { vs.doneFilter = k; App.refresh(); } }, t('import.issue.' + k), h('span', { class: 'n' }, F.num(issueTypes[k]))); }))),
        h('div', { class: 'card-body flush', style: { marginTop: '10px' } }, h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, [t('import.issueType'), t('import.colSheet'), t('import.row'), t('import.value'), t('common.customer')].map(function (x) { return h('th', null, x); }))),
          h('tbody', null, issues.slice(0, 300).map(function (i) {
            var cx = i.cancelId && Store.cancellations.get(i.cancelId);
            return h('tr', null, h('td', null, UI.pill(t('import.issue.' + i.type), i.type === 'badId' || i.type === 'ambiguousName' || cx ? 'warn' : 'plain')),
              h('td', null, i.sheet), h('td', { class: 'num' }, i.row), h('td', { class: 'mono small' }, i.field ? Schema.label(i.field, lang()) + ': ' : '', i.value || ''),
              h('td', null, cx ? h('a', { href: '#ay-' + cx.month }, F.month(cx.month) + ' · ' + t('cancel.sectionTitle')) : i.customer || ''));
          })))))) : null);
  }

  App.views.import = {
    title: function () { return t('nav.import'); },
    sub: function () { return t('import.sub'); },
    render: function () {
      var vs = state();
      if (App.pendingFile) {
        var f = App.pendingFile;
        App.pendingFile = null;
        App.viewState.import = vs = { step: 'pick', overrides: {}, sheetOpts: {}, mode: 'merge', tidyNames: true, remember: true };
        setTimeout(function () { startFile(vs, f); }, 0);
      }
      if (vs.step === 'reading' || vs.step === 'importing') {
        return h('section', { class: 'card' }, h('div', { class: 'empty', id: 'import-busy' }, icon(vs.step === 'reading' ? 'file-spreadsheet' : 'database'),
          h('h3', null, vs.step === 'reading' ? t('import.reading', { file: vs.file ? vs.file.name : '' }) : t('import.importing')),
          h('div', { class: 'progress', style: { width: '240px' } }, h('span', { style: { width: '60%' } }))));
      }
      if (vs.step === 'preview' && vs.analysis) return preview(vs);
      if (vs.step === 'done' && vs.result) return h('div', { class: 'stack' }, done(vs), history());
      return h('div', { class: 'stack' },
        vs.error ? h('div', { class: 'callout bad' }, icon('circle-alert'), h('span', null, vs.error)) : null,
        h('section', { class: 'card' }, h('div', { class: 'card-body stack' }, fileZone(vs),
          h('div', { class: 'grid-3', style: { marginTop: '6px' } },
            [['calendar-days', 'import.tip1'], ['arrow-up-down', 'import.tip2'], ['refresh-cw', 'import.tip3']].map(function (x) {
              return h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap', gap: '10px' } }, h('span', { class: 'avatar sm' }, icon(x[0])),
                h('div', null, h('div', { style: { fontWeight: 600 } }, t(x[1] + '.t')), h('div', { class: 'small dim' }, t(x[1] + '.s'))));
            })),
          h('div', { class: 'row' }, h('span', { class: 'small muted' }, t('import.noFile')), h('button', { type: 'button', class: 'btn btn-sm', id: 'import-demo', onClick: function () { App.loadDemo(); } }, icon('sparkles'), t('dash.tryDemo'))))),
        h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, t('import.columnsTitle')), h('span', { class: 'sub' }, t('import.columnsSub'))),
          h('div', { class: 'card-body' }, h('div', { class: 'chips' }, Schema.FIELDS.map(function (f) { return h('span', { class: 'chip' + (f.core ? '' : ' outline') }, f.excel); })),
            h('p', { class: 'small muted', style: { marginTop: '10px' } }, t('import.columnsNote')))),
        history());
    }
  };
})();
