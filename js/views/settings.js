/* Settings, backup and data management */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  var PLACEHOLDERS = ['ad', 'adsoyad', 'police', 'sirket', 'plaka', 'plakaMetni', 'bitis', 'gun', 'acente', 'acenteTel'];

  function setting(title, sub, control, id) {
    return h('div', { class: 'setting', id: id || null }, h('div', { class: 'txt' }, h('div', { class: 't' }, title), sub ? h('div', { class: 's' }, sub) : null), control);
  }

  function restoreFromFile(file) {
    UI.readFile(file).then(function (bytes) {
      var obj;
      try { obj = JSON.parse(new TextDecoder('utf-8').decode(bytes)); } catch (e) { obj = null; }
      if (!Store.validateBackup(obj)) { UI.toast(t('settings.restoreInvalid'), { type: 'bad' }); return; }
      UI.confirm({ title: t('settings.restoreTitle'), message: t('settings.restoreMsg', { date: obj.exportedAt ? F.dateTime(Date.parse(obj.exportedAt)) : '?', c: F.num(obj.customers.length), p: F.num(obj.policies.length) }), danger: true, confirm: t('settings.restoreGo') })
        .then(function (ok) {
          if (!ok) return;
          // the backup's records are not the rows of the linked file: the link goes, the file stays as it is
          window.FileLink.unlink().then(function () { return Store.restore(obj); }).then(function () { UI.toast(t('settings.restored')); App.go('panel'); }, function () { UI.toast(t('settings.restoreFailed'), { type: 'bad' }); });
        });
    });
  }

  App.views.settings = {
    title: function () { return t('nav.settings'); },
    sub: function () { return t('settings.sub'); },
    render: function () {
      var s = Store.settings;
      // agency
      var a = {
        name: h('input', { id: 'set-agency', class: 'input', value: s.agencyName || '', autocomplete: 'organization' }),
        phone: h('input', { id: 'set-phone', class: 'input', value: s.agencyPhone || '', autocomplete: 'tel' }),
        email: h('input', { id: 'set-email', class: 'input', value: s.agencyEmail || '', autocomplete: 'email' }),
        address: h('input', { id: 'set-address', class: 'input', value: s.agencyAddress || '', autocomplete: 'street-address' })
      };
      var agency = h('form', { class: 'card', id: 'settings-agency', onSubmit: function (e) {
        e.preventDefault();
        Store.updateSettings({ agencyName: U.collapse(a.name.value) || 'Sigorta Portföy', agencyPhone: U.collapse(a.phone.value), agencyEmail: U.collapse(a.email.value), agencyAddress: U.collapse(a.address.value) });
        UI.toast(t('settings.saved'));
      } },
        h('div', { class: 'card-head' }, h('h2', null, t('settings.agency')), h('span', { class: 'sub' }, t('settings.agencySub'))),
        h('div', { class: 'card-body form-grid' },
          h('div', { class: 'span-6' }, UI.field({ id: 'set-agency', label: t('settings.agencyName'), input: a.name })),
          h('div', { class: 'span-6' }, UI.field({ id: 'set-phone', label: t('settings.agencyPhone'), input: a.phone })),
          h('div', { class: 'span-6' }, UI.field({ id: 'set-email', label: t('settings.agencyEmail'), input: a.email })),
          h('div', { class: 'span-6' }, UI.field({ id: 'set-address', label: t('settings.agencyAddress'), input: a.address })),
          h('div', { class: 'span-12 row' }, h('button', { type: 'submit', class: 'btn btn-primary', id: 'save-agency' }, icon('save'), t('common.save')))));

      // appearance
      var themeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': t('app.theme') }, ['system', 'light', 'dark'].map(function (th) {
        return h('button', { type: 'button', id: 'theme-' + th, 'aria-pressed': String((s.theme || 'system') === th), onClick: function () { Store.setSetting('theme', th); } }, t('settings.theme.' + th));
      }));
      var langSel = UI.select('set-lang', [{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }], window.I18N.lang, { class: 'input', style: { width: 'auto' }, 'aria-label': t('settings.language'), onChange: function (e) { window.I18N.setLang(e.target.value); Store.setSetting('lang', e.target.value); } });
      var pageSel = UI.select('set-page', [25, 50, 100, 200].map(function (n) { return { value: n, label: String(n) }; }), s.pageSize, { class: 'input', style: { width: 'auto' }, 'aria-label': t('settings.pageSize'), onChange: function (e) { Store.setSetting('pageSize', Number(e.target.value)); } });
      var mask = h('input', { type: 'checkbox', id: 'set-mask', checked: !!s.maskIds, onChange: function (e) { Store.setSetting('maskIds', e.target.checked); } });
      var win = UI.select('set-window', [15, 30, 45, 60, 90].map(function (n) { return { value: n, label: t('settings.days', { n: n }) }; }), s.renewalWindow, { class: 'input', style: { width: 'auto' }, 'aria-label': t('settings.window'), onChange: function (e) { Store.setSetting('renewalWindow', Number(e.target.value)); } });
      var appearance = h('section', { class: 'card', id: 'settings-appearance' },
        h('div', { class: 'card-head' }, h('h2', null, t('settings.appearance'))),
        h('div', { class: 'card-body' },
          setting(t('settings.language'), t('settings.languageSub'), langSel),
          setting(t('app.theme'), t('settings.themeSub'), themeSeg),
          setting(t('settings.pageSize'), t('settings.pageSizeSub'), pageSel),
          setting(t('settings.mask'), t('settings.maskSub'), h('label', { class: 'check', for: 'set-mask' }, mask, t('settings.maskOn'))),
          setting(t('settings.window'), t('settings.windowSub'), win)));

      // WhatsApp template
      var tpl = h('textarea', { id: 'set-template', class: 'input', rows: 4, 'aria-label': t('settings.template'), style: { height: 'auto', padding: '9px 11px' } }, s.waTemplate || t('settings.waDefault'));
      var previewEl = h('div', { class: 'callout', id: 'tpl-preview' });
      function drawPreview() {
        UI.clear(previewEl);
        var sample = { policyType: 'Trafik', company: 'Anadolu Sigorta', plate: '34 ABC 123', endDate: U.addDays(U.todayISO(), 12), id: '_' };
        var keep = s.waTemplate;
        s.waTemplate = tpl.value;
        var txt = App.waMessage(sample, { name: 'Ayşe Yılmaz' });
        s.waTemplate = keep;
        previewEl.appendChild(icon('message-circle'));
        previewEl.appendChild(h('div', null, h('div', { class: 'small muted' }, t('settings.preview')), h('div', { style: { whiteSpace: 'pre-line' } }, txt)));
      }
      tpl.addEventListener('input', drawPreview);
      drawPreview();
      var template = h('section', { class: 'card', id: 'settings-template' },
        h('div', { class: 'card-head' }, h('h2', null, t('settings.template')), h('span', { class: 'sub' }, t('settings.templateSub'))),
        h('div', { class: 'card-body stack' }, tpl,
          h('div', { class: 'placeholder-list' }, PLACEHOLDERS.map(function (p) {
            return h('code', { title: t('settings.ph.' + p), tabindex: 0, role: 'button', onClick: function () {
              var pos = tpl.selectionStart || tpl.value.length;
              tpl.value = tpl.value.slice(0, pos) + '{' + p + '}' + tpl.value.slice(pos);
              drawPreview();
              tpl.focus();
            } }, '{' + p + '}');
          })),
          previewEl,
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'save-template', onClick: function () { Store.setSetting('waTemplate', tpl.value.trim() === t('settings.waDefault') ? '' : tpl.value.trim()); UI.toast(t('settings.saved')); } }, icon('save'), t('common.save')),
            h('button', { type: 'button', class: 'btn btn-sm', onClick: function () { tpl.value = t('settings.waDefault'); drawPreview(); Store.setSetting('waTemplate', ''); } }, icon('rotate-ccw'), t('settings.resetDefault')))));

      // data
      var restoreInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'restore-file', onChange: function () { if (restoreInput.files[0]) restoreFromFile(restoreInput.files[0]); } });
      var last = s.lastBackupAt;
      var data = h('section', { class: 'card', id: 'settings-data' },
        h('div', { class: 'card-head' }, h('h2', null, t('settings.data')), h('span', { class: 'sub' }, t('settings.dataSub'))),
        h('div', { class: 'card-body' },
          setting(t('settings.backup'), t('settings.backupSub', { when: last ? F.dateTime(last) : t('common.never') }), h('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'backup-btn', onClick: App.exportBackup }, icon('download'), t('settings.backupBtn')), 'backup'),
          setting(t('settings.restore'), t('settings.restoreSub'), h('span', null, h('label', { class: 'btn btn-sm', for: 'restore-file', id: 'restore-btn' }, icon('upload'), t('settings.restoreBtn')), restoreInput)),
          setting(t('settings.excelAll'), t('settings.excelAllSub'), h('button', { type: 'button', class: 'btn btn-sm', id: 'export-all', disabled: !Store.policies.size, onClick: App.exportAll }, icon('file-spreadsheet'), t('settings.excelAllBtn'))),
          setting(t('settings.demo'), t('settings.demoSub'), h('button', { type: 'button', class: 'btn btn-sm', id: 'demo-btn', onClick: function () { App.loadDemo(); } }, icon('sparkles'), t('settings.demoBtn'))),
          setting(t('dup.title'), t('settings.dupSub'), h('button', { type: 'button', class: 'btn btn-sm', id: 'dup-btn', onClick: App.showDuplicates }, icon('git-merge'), t('dup.button'))),
          setting(t('settings.mappings'), t('settings.mappingsSub', { n: Object.keys(Store.mappings).length }), h('button', { type: 'button', class: 'btn btn-sm', disabled: !Object.keys(Store.mappings).length, onClick: function () {
            Store.mappings = {};
            window.DB.put('meta', [{ key: 'mappings', value: {} }]);
            Store.emit('settings');
            UI.toast(t('settings.mappingsCleared'));
          } }, icon('rotate-ccw'), t('settings.mappingsBtn'))),
          setting(t('settings.clear'), t('settings.clearSub'), h('button', { type: 'button', class: 'btn btn-sm btn-danger', id: 'clear-btn', onClick: function () {
            UI.confirm({ title: t('settings.clearTitle'), message: t('settings.clearMsg', { c: F.num(Store.customers.size), p: F.num(Store.policies.size) }), danger: true, confirm: t('settings.clearGo'), requireText: t('settings.clearWord'),
              extra: window.FileLink.link ? h('p', { class: 'small muted' }, t('settings.clearLinked', { name: window.FileLink.link.name })) : null })
              .then(function (ok) { if (!ok) return; window.FileLink.unlink().then(function () { return Store.clearData(); }).then(function () { UI.toast(t('settings.cleared')); App.go('panel'); }); });
          } }, icon('trash-2'), t('settings.clearBtn')))));

      // storage
      var usage = h('span', { id: 'storage-usage' }, '…');
      var persist = h('span', { id: 'storage-persist' }, '…');
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function (e) { usage.textContent = t('settings.usage', { used: F.num((e.usage || 0) / 1048576, 1), quota: F.num((e.quota || 0) / 1048576, 0) }); }, function () { usage.textContent = '–'; });
      } else usage.textContent = '–';
      function drawPersist() {
        if (!(navigator.storage && navigator.storage.persisted)) { persist.textContent = t('settings.persistUnknown'); return; }
        navigator.storage.persisted().then(function (on) {
          UI.clear(persist);
          persist.appendChild(UI.pill(on ? t('settings.persistOn') : t('settings.persistOff'), on ? 'good' : 'warn'));
          if (!on) persist.appendChild(h('button', { type: 'button', class: 'btn btn-sm', style: { marginLeft: '8px' }, onClick: function () { navigator.storage.persist().then(drawPersist); } }, t('settings.persistAsk')));
        });
      }
      drawPersist();
      var storage = h('section', { class: 'card', id: 'settings-storage' },
        h('div', { class: 'card-head' }, h('h2', null, t('settings.storage'))),
        h('div', { class: 'card-body' },
          setting(t('settings.where'), t('settings.whereSub.' + (Store.backend || 'memory')), UI.pill(t('settings.backend.' + (Store.backend || 'memory')), Store.backend === 'memory' ? 'bad' : 'good')),
          setting(t('settings.counts'), null, h('span', { class: 'small', id: 'storage-counts' }, t('settings.countsLine', { c: F.num(Store.customers.size), p: F.num(Store.policies.size), t: F.num(Store.tasks.size), a: F.num(Store.activities.size) }))),
          setting(t('settings.space'), null, usage),
          setting(t('settings.persist'), t('settings.persistSub'), persist)));

      var about = h('section', { class: 'card', id: 'settings-about' },
        h('div', { class: 'card-head' }, h('h2', null, t('settings.about'))),
        h('div', { class: 'card-body stack' },
          h('p', { class: 'dim' }, t('settings.aboutText')),
          h('div', { class: 'callout good' }, icon('shield-check'), h('span', { class: 'small' }, t('settings.privacy'))),
          h('p', { class: 'small muted' }, t('settings.libs')),
          h('p', { class: 'small muted' }, t('settings.shortcuts'))));

      var node = h('div', { class: 'settings-grid' },
        h('div', { class: 'stack' }, agency, appearance, template),
        h('div', { class: 'stack' }, App.excelCard(), data, storage, about));
      if (App.viewState.settingsFocus) {
        var f = App.viewState.settingsFocus;
        App.viewState.settingsFocus = null;
        setTimeout(function () { var el = document.getElementById(f); if (el) { el.scrollIntoView({ block: 'center' }); el.style.background = 'var(--warn-soft)'; setTimeout(function () { el.style.background = ''; }, 1600); } }, 60);
      }
      return node;
    }
  };
})();
