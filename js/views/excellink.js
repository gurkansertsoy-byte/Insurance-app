/* The linked Excel file on screen: its line in the menu, a notice when it needs the user, the settings card,
   the option on the import screen, and downloading the up-to-date workbook. */
(function () {
  'use strict';
  var UI = window.UI, Store = window.Store, App = window.App, FileLink = window.FileLink;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;
  var MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function clock(ts) {
    var d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function when(ts) {
    if (!ts) return t('common.never');
    return new Date(ts).toDateString() === new Date().toDateString() ? t('xl.todayAt', { time: clock(ts) }) : F.dateTime(ts);
  }
  function failed(e) {
    if (e && e.name === 'AbortError') return; // the user closed the file dialog
    console.error(e);
    var code = e && e.code;
    UI.toast(code === 'type' ? t('xl.err.type') : code === 'permission' ? t('xl.err.permission') : t('xl.err.generic', { msg: (e && e.message) || String(e) }), { type: 'bad', timeout: 7000 });
  }
  function act(fn) { return function () { Promise.resolve().then(fn).catch(failed); }; }

  // ------------------------------------------------------------------ download
  App.downloadExcel = function () {
    return FileLink.current().then(function (x) {
      if (!x.bytes) throw new Error('empty');
      var name = x.name;
      if (App.embedded) { App.viewerSave(name, new Uint8Array(x.bytes), function () { UI.toast(t('export.done', { file: name })); }); return; }
      UI.download(new Blob([x.bytes], { type: MIME }), name);
      UI.toast(t('export.done', { file: name }));
    }).catch(failed);
  };

  function downloadVersion(v) {
    FileLink.versionBytes(v.key).then(function (bytes) {
      var name = v.name.replace(/\.xlsx$/i, '') + ' (' + F.dateTime(v.at).replace(/[\/:]/g, '.') + ').xlsx';
      if (App.embedded) { App.viewerSave(name, new Uint8Array(bytes)); return; }
      UI.download(new Blob([bytes], { type: MIME }), name);
    }).catch(failed);
  }

  function versionsDialog() {
    FileLink.versions().then(function (list) {
      var m = UI.modal({
        title: t('xl.versions'), icon: 'history', size: 'narrow',
        body: [h('p', { class: 'small dim' }, t('xl.versionsSub')),
          list.length ? h('div', { class: 'list', id: 'xl-versions' }, list.map(function (v) {
            return h('div', { class: 'list-item' }, h('span', { class: 'avatar sm' }, icon('file-spreadsheet')),
              h('div', { class: 'main' }, h('div', { class: 't' }, F.dateTime(v.at)), h('div', { class: 's' }, t('xl.v.' + v.why) + ' · ' + F.num(Math.round(v.size / 1024)) + ' KB')),
              h('button', { type: 'button', class: 'btn btn-sm', onClick: function () { downloadVersion(v); } }, icon('download'), t('common.download')));
          })) : h('p', { class: 'muted' }, t('xl.noVersions'))],
        foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.close'))]
      });
    }).catch(failed);
  }

  // ------------------------------------------------------------------ menu line
  App.excelFoot = function () {
    var l = FileLink.link;
    if (!l) return null;
    var st = FileLink.status;
    var tone = { pending: 'busy', saving: 'busy', permission: 'warn', external: 'warn', locked: 'warn', confirm: 'warn', review: 'warn', missing: 'err', error: 'err' }[st] || '';
    var text;
    if (l.kind === 'copy') text = t('xl.foot.copy');
    else if (st === 'saved') text = l.lastSyncAt ? t('xl.foot.saved', { time: clock(l.lastSyncAt) }) : t('xl.foot.linked');
    else text = t('xl.foot.' + st);
    return h('div', { id: 'excel-status', class: 'excel-foot', 'data-status': st, title: l.name },
      h('span', { class: 'save-dot ' + tone }),
      h('a', { href: '#ayarlar', onClick: function () { App.viewState.settingsFocus = 'settings-excel'; } }, text),
      l.kind === 'copy' ? h('span', null, ' · ', h('a', { href: '#ayarlar', id: 'excel-download-foot', onClick: function (e) { e.preventDefault(); App.downloadExcel(); } }, t('xl.downloadShort'))) : null);
  };

  // ------------------------------------------------------------------ notices
  function btn(id, label, kind, fn) {
    return h('button', { type: 'button', class: 'btn btn-sm' + (kind ? ' btn-' + kind : ''), id: id, onClick: act(fn) }, label);
  }

  function importFromFile() {
    return FileLink.readFile().then(function (f) {
      App.viewState.import = null;
      App.pendingFile = f;
      App.go('ice-aktar');
    });
  }

  function overwrite() {
    return UI.confirm({ title: t('xl.overwriteTitle'), message: t('xl.overwriteMsg', { name: FileLink.link.name }), confirm: t('xl.b.external.overwrite') }).then(function (ok) {
      if (ok) return FileLink.overwrite();
    });
  }

  function unlink() {
    return UI.confirm({ title: t('xl.unlinkTitle'), message: t('xl.unlinkMsg', { name: FileLink.link.name }), confirm: t('xl.unlink') }).then(function (ok) {
      if (!ok) return;
      return FileLink.unlink().then(function () { UI.toast(t('xl.unlinked')); });
    });
  }

  /** The notice above the page when the file needs the user (permission, changed outside, open in Excel…). */
  App.drawExcelNotice = function (el) {
    if (!el) return;
    UI.clear(el);
    var l = FileLink.link, st = FileLink.status;
    if (!l) return;
    var name = l.name;
    function box(tone, ic, title, text, buttons) {
      el.appendChild(h('div', { class: 'callout ' + tone + ' excel-notice', id: 'excel-notice', 'data-status': st, role: st === 'missing' || st === 'error' ? 'alert' : 'status' }, icon(ic),
        h('div', { class: 'excel-notice-text' }, h('strong', null, title), h('div', { class: 'small' }, text)),
        h('div', { class: 'excel-notice-actions' }, buttons)));
    }
    if (st === 'permission') {
      box('warn', 'lock', t('xl.b.permission.t'), t(FileLink.dirty ? 'xl.b.permission.dirty' : 'xl.b.permission.s', { name: name }),
        [btn('xl-allow', t('xl.b.permission.btn'), 'primary', FileLink.saveNow)]);
    } else if (st === 'external') {
      box('warn', 'file-warning', t('xl.b.external.t'), t('xl.b.external.s', { name: name }),
        [btn('xl-import', t('xl.b.external.import'), 'primary', importFromFile), btn('xl-overwrite', t('xl.b.external.overwrite'), '', overwrite)]);
    } else if (st === 'locked') {
      box('warn', 'file-lock', t('xl.b.locked.t'), t('xl.b.locked.s', { name: name }), [btn('xl-retry', t('xl.b.retry'), '', FileLink.saveNow)]);
    } else if (st === 'missing') {
      box('bad', 'file-x', t('xl.b.missing.t'), t('xl.b.missing.s', { name: name }),
        (FileLink.canWrite() ? [btn('xl-repick', t('xl.b.missing.pick'), 'primary', FileLink.linkExisting)] : []).concat([btn('xl-unlink', t('xl.unlink'), '', unlink)]));
    } else if (st === 'confirm') {
      box('warn', 'trash-2', t('xl.b.confirm.t', { n: FileLink.deletes }), t('xl.b.confirm.s', { name: name }),
        [btn('xl-confirm', t('xl.b.confirm.go'), 'primary', FileLink.confirmDeletes), btn('xl-unlink', t('xl.unlink'), '', unlink)]);
    } else if (st === 'review') {
      var n = (FileLink.missing || []).length;
      box('warn', 'file-question', t('xl.b.review.t', { n: n }), t('xl.b.review.s', { name: name }),
        [btn('xl-review-remove', t('xl.b.review.remove'), 'primary', function () { return FileLink.resolveMissing(true).then(function () { UI.toast(t('xl.b.review.removed', { n: n })); }); }),
          btn('xl-review-keep', t('xl.b.review.keep'), '', function () { return FileLink.resolveMissing(false); })]);
    } else if (st === 'error') {
      box('bad', 'circle-alert', t('xl.b.error.t'), FileLink.error || '', [btn('xl-retry', t('xl.b.retry'), '', FileLink.saveNow)]);
    }
  };

  // ------------------------------------------------------------------ settings card
  function settingRow(title, sub, control, id) {
    return h('div', { class: 'setting', id: id || null }, h('div', { class: 'txt' }, h('div', { class: 't' }, title), sub ? h('div', { class: 's' }, sub) : null), control);
  }

  App.excelCard = function () {
    var card = h('section', { class: 'card', id: 'settings-excel' });
    function draw() {
      UI.clear(card);
      var l = FileLink.link;
      var canWrite = FileLink.canWrite();
      card.appendChild(h('div', { class: 'card-head' }, h('h2', null, t('xl.card.title')), h('span', { class: 'sub' }, t('xl.card.sub'))));
      var body = h('div', { class: 'card-body' });
      card.appendChild(body);
      if (!l) {
        body.appendChild(h('p', { class: 'small dim', id: 'xl-none' }, t('xl.card.none')));
        body.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } },
          canWrite ? h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'xl-link', onClick: act(FileLink.linkExisting) }, icon('link'), t('xl.card.link')) : null,
          canWrite ? h('button', { type: 'button', class: 'btn btn-sm', id: 'xl-new', onClick: act(function () { return FileLink.createNew().then(function () { UI.toast(t('xl.created', { name: FileLink.link.name })); }); }) }, icon('file-plus'), t('xl.card.createNew')) : null,
          h('a', { class: 'btn btn-sm', href: '#ice-aktar' }, icon('upload'), t('nav.import'))));
        if (!canWrite) body.appendChild(h('p', { class: 'small muted', style: { marginTop: '10px' } }, t(App.embedded ? 'xl.card.frameNote' : 'xl.card.browserNote')));
        return;
      }
      var st = FileLink.status;
      var pill = l.kind === 'copy' ? UI.pill(t('xl.pill.copy'), 'plain')
        : st === 'saved' ? UI.pill(t('xl.pill.on'), 'good') : st === 'pending' || st === 'saving' ? UI.pill(t('xl.foot.' + st), 'warn') : UI.pill(t('xl.foot.' + st), 'bad');
      body.appendChild(settingRow(h('span', { class: 'xl-file' }, icon('file-spreadsheet'), ' ', h('strong', { id: 'xl-name' }, l.name)), t(l.kind === 'copy' ? 'xl.card.mode.copy' : 'xl.card.mode.file'), pill, 'xl-file-row'));
      body.appendChild(settingRow(t('xl.card.last'), l.kind === 'copy' ? t('xl.card.lastCopy') : t('xl.card.linkedAt', { when: when(l.linkedAt) }),
        h('span', { class: 'small', id: 'xl-last' }, l.kind === 'copy' ? (FileLink.dirty ? t('xl.card.copyDirty') : t('xl.card.copyClean')) : when(l.lastSyncAt))));
      if (FileLink.skipped) body.appendChild(h('div', { class: 'callout warn small' }, icon('triangle-alert'), h('span', null, t('xl.card.skipped', { n: FileLink.skipped }))));
      body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } },
        l.kind === 'file' ? h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'xl-save-now', onClick: act(function () { return FileLink.saveNow().then(function (ok) { if (ok) UI.toast(t('xl.savedNow')); }); }) }, icon('save'), t('xl.card.saveNow')) : null,
        h('button', { type: 'button', class: 'btn btn-sm' + (l.kind === 'copy' ? ' btn-primary' : ''), id: 'xl-download', onClick: App.downloadExcel }, icon('download'), t('xl.download')),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'xl-versions-btn', onClick: versionsDialog }, icon('history'), t('xl.versions')),
        canWrite ? h('button', { type: 'button', class: 'btn btn-sm', id: 'xl-relink', onClick: act(FileLink.linkExisting) }, icon('link'), t('xl.card.other')) : null,
        h('button', { type: 'button', class: 'btn btn-sm btn-danger', id: 'xl-unlink', onClick: act(unlink) }, icon('unlink'), t('xl.unlink'))));
      if (!canWrite && l.kind === 'copy') body.appendChild(h('p', { class: 'small muted', style: { marginTop: '10px' } }, t(App.embedded ? 'xl.card.frameNote' : 'xl.card.browserNote')));
    }
    draw();
    var off = FileLink.on(function () { if (!card.isConnected) { off(); return; } draw(); });
    return card;
  };

  // ------------------------------------------------------------------ import screen
  /** What a workbook holds that saving cannot keep (charts, pivot tables, macros). */
  App.excelRisks = function (bytes) {
    try {
      var zip = window.XLSX.CFB.read(bytes, { type: 'array' });
      var paths = zip.FullPaths.join('\n');
      var out = [];
      if (/\/xl\/charts\//.test(paths)) out.push('charts');
      if (/\/xl\/pivotTables\//.test(paths)) out.push('pivots');
      if (/vbaProject\.bin/.test(paths)) out.push('macros');
      return out;
    } catch (e) { return []; }
  };

  /** The "save into this file" option of the import preview. */
  App.excelImportOption = function (vs) {
    var writable = FileLink.writableName(vs.file.name);
    var direct = writable && !!vs.handle && FileLink.canWrite();
    var box = h('div', { class: 'stack', style: { gap: '8px' }, id: 'autosave-box' });
    var check = h('input', { type: 'checkbox', id: 'opt-autosave', checked: writable && !!vs.autosave, disabled: !writable, onChange: function (e) { vs.autosave = e.target.checked; App.refresh(); } });
    box.appendChild(h('label', { class: 'check', style: { alignItems: 'flex-start' }, for: 'opt-autosave' }, check,
      h('span', null, h('strong', null, t(direct ? 'import.autosave' : 'import.autosaveCopy')),
        h('div', { class: 'small muted' }, !writable ? t('import.autosaveNo') : direct ? t('import.autosaveSub') : t(App.embedded ? 'import.autosaveSubFrame' : 'import.autosaveSubCopy')))));
    if (writable && vs.risks && vs.risks.length) {
      box.appendChild(h('div', { class: 'callout warn small', id: 'autosave-risk' }, icon('triangle-alert'), h('span', null, t('import.autosaveRisk', { what: vs.risks.map(function (r) { return t('import.risk.' + r); }).join(', ') }))));
    }
    var l = FileLink.link;
    if (vs.autosave && writable && Store.policies.size && vs.mode !== 'replace') {
      box.appendChild(h('div', { class: 'small muted', id: 'autosave-others' }, t('import.autosaveOthers')));
    }
    if (l && String(l.name).toLowerCase() !== String(vs.file.name).toLowerCase()) {
      box.appendChild(h('div', { class: 'small muted', id: 'autosave-current' }, t(vs.autosave && writable ? 'import.autosaveSwitch' : 'import.autosaveStays', { name: l.name })));
    }
    return box;
  };

  /** The line on the "import done" screen about the linked file. */
  App.excelImportDone = function (vs) {
    var l = FileLink.link;
    if (vs.linked && l) {
      if (l.kind === 'file') {
        return h('div', { class: 'callout good', id: 'autosave-done' }, icon('file-check'),
          h('div', null, h('strong', null, t('import.linkedTitle', { name: l.name })), h('div', { class: 'small' }, t('import.linkedFile'))));
      }
      return h('div', { class: 'callout', id: 'autosave-done' }, icon('file-spreadsheet'),
        h('div', { style: { flex: 1 } }, h('strong', null, t('import.linkedCopyTitle', { name: l.name })), h('div', { class: 'small' }, t('import.linkedCopy'))),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'done-download', onClick: App.downloadExcel }, icon('download'), t('xl.download')));
    }
    if (!FileLink.writableName(vs.file.name) && FileLink.canWrite() && !l) {
      return h('div', { class: 'callout', id: 'autosave-new' }, icon('file-plus'),
        h('div', { style: { flex: 1 } }, h('strong', null, t('import.newXlsxTitle')), h('div', { class: 'small' }, t('import.newXlsxText'))),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'done-new-xlsx', onClick: act(function () {
          return FileLink.createNew(vs.file.name.replace(/\.[a-z0-9]+$/i, '') + '.xlsx').then(function () { UI.toast(t('xl.created', { name: FileLink.link.name })); App.refresh(); });
        }) }, icon('file-plus'), t('xl.card.createNew')));
    }
    return null;
  };
})();
