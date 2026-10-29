/* Sigorta Portföy - shell, router, global search and startup. */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, I18N = window.I18N;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  var App = window.App = window.App || {};
  App.views = App.views || {};
  App.viewState = {};
  App.embedded = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  /**
   * Inside a frame the browser will not download files. The claude.ai viewer offers its own save
   * dialog instead (the "downloads" capability); in any other frame the app says exporting needs
   * the app opened on its own. onSaved runs only when the viewer accepted the file.
   */
  App.viewerSave = function (name, data, onSaved) {
    var c = window.claude;
    var saver = c && typeof c.use === 'function' ? c.use('downloads') : Promise.resolve(null);
    saver.then(function (d) {
      if (!d) throw { code: 'unavailable' };
      return d.save({ filename: name, data: data });
    }).then(function (r) { if (r && r.status === 'saved' && onSaved) onSaved(); }, function (e) {
      var code = e && e.code;
      if (code === 'declined') return; // the viewer said no
      if (code === 'rate_limited') { UI.toast(UI.t('export.busy'), { type: 'info' }); return; }
      if (code === 'bad_request' || code === 'transform_error' || code === 'too_large') { console.error(e); UI.toast(UI.t('export.failed'), { type: 'bad' }); return; }
      UI.toast(UI.t('export.blocked'), { type: 'info', timeout: 6000 });
    });
  };

  var NAV = [
    { id: 'panel', icon: 'layout-dashboard', label: 'nav.dashboard' },
    { id: 'musteriler', icon: 'users', label: 'nav.customers', count: function () { return Store.customers.size; } },
    { id: 'policeler', icon: 'file-text', label: 'nav.policies', count: function () { return Store.policies.size; } },
    { id: 'aylar', icon: 'calendar-days', label: 'nav.months', count: function () { return Store.derived().months.length; } },
    { id: 'yenilemeler', icon: 'refresh-cw', label: 'nav.renewals', badge: function () { return App.dueCount(); } },
    { id: 'tahsilat', icon: 'wallet', label: 'nav.collections', count: function () { return App.openBalanceCount(); } },
    { id: 'gorevler', icon: 'list-checks', label: 'nav.tasks', badge: function () { return Store.openTaskCount(); }, bad: true },
    { id: 'raporlar', icon: 'chart-column', label: 'nav.reports' },
    { section: 'nav.sectionData' },
    { id: 'ice-aktar', icon: 'upload', label: 'nav.import' },
    { id: 'ayarlar', icon: 'settings', label: 'nav.settings' }
  ];

  App.dueCount = function () {
    var n = 0;
    Store.derived().renewal.forEach(function (i) { if (i.state === 'due') n++; });
    return n;
  };
  App.openBalanceCount = function () {
    var n = 0;
    Store.derived().policies.forEach(function (p) { if (Store.outstanding(p) > 0) n++; });
    return n;
  };

  // ------------------------------------------------------------------ routing
  var SIMPLE = {
    panel: 'dashboard', musteriler: 'customers', policeler: 'policies', aylar: 'months', yenilemeler: 'renewals',
    tahsilat: 'collections', gorevler: 'tasks', raporlar: 'reports', 'ice-aktar': 'import', ayarlar: 'settings', yeni: 'form'
  };

  App.parseRoute = function () {
    var hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    var m;
    if (!hash) return { view: 'dashboard', nav: 'panel' };
    if ((m = hash.match(/^musteri-([a-z0-9]+)$/))) return { view: 'customer', id: m[1], nav: 'musteriler' };
    if ((m = hash.match(/^ay-(\d{4}-\d{2})$/))) return { view: 'month', key: m[1], nav: 'aylar' };
    if ((m = hash.match(/^duzenle-([a-z0-9]+)$/))) return { view: 'form', policyId: m[1], nav: 'policeler' };
    if ((m = hash.match(/^yenile-([a-z0-9]+)$/))) return { view: 'form', renewId: m[1], nav: 'yenilemeler' };
    if ((m = hash.match(/^yeni-ay-(\d{4}-\d{2})$/))) return { view: 'form', month: m[1], nav: 'aylar' };
    if ((m = hash.match(/^yeni-([a-z0-9]+)$/))) return { view: 'form', customerId: m[1], nav: 'musteriler' };
    if (SIMPLE[hash]) return { view: SIMPLE[hash], nav: hash === 'yeni' ? null : hash };
    return { view: 'dashboard', nav: 'panel' };
  };

  App.go = function (hash) {
    if (location.hash === '#' + hash) App.render();
    else location.hash = hash;
  };

  // ------------------------------------------------------------------ shell
  var els = {};

  function buildShell() {
    var root = document.getElementById('app');
    UI.clear(root);
    els.nav = h('nav', { class: 'nav', 'aria-label': t('nav.menu') });
    els.brandName = h('div', { class: 'brand-name' });
    els.brandMark = h('div', { class: 'brand-mark', 'aria-hidden': 'true' });
    els.navFoot = h('div', { class: 'nav-foot' });
    els.sidebar = h('aside', { class: 'sidebar', id: 'sidebar' },
      h('a', { class: 'brand', href: '#panel', style: { textDecoration: 'none' } }, els.brandMark, h('div', { style: { minWidth: 0 } }, els.brandName, h('div', { class: 'brand-sub', id: 'brand-sub' }))),
      els.nav, els.navFoot);
    els.title = h('h1', { id: 'page-title' });
    els.sub = h('div', { class: 'topbar-sub', id: 'page-sub' });
    els.search = buildSearch();
    els.themeBtn = h('button', { type: 'button', class: 'icon-btn', id: 'theme-btn', onClick: cycleTheme });
    els.langBtn = h('button', { type: 'button', class: 'icon-btn lang-btn', id: 'lang-btn', onClick: toggleLang });
    els.newBtn = h('a', { class: 'btn btn-primary new-btn', href: '#yeni', id: 'new-btn' }, icon('plus'), h('span', null));
    els.menuBtn = h('button', { type: 'button', class: 'icon-btn menu-btn', 'aria-controls': 'sidebar', 'aria-expanded': 'false', 'aria-label': t('nav.menu'), onClick: function () { setNav(!els.app.classList.contains('nav-open')); } }, icon('menu'));
    els.topbar = h('header', { class: 'topbar' }, els.menuBtn, h('div', { class: 'topbar-title' }, els.title, els.sub), els.search, els.newBtn, els.langBtn, els.themeBtn);
    els.content = h('main', { class: 'content', id: 'content', tabindex: '-1' });
    els.scrim = h('div', { class: 'scrim', hidden: true, onClick: function () { setNav(false); } });
    els.app = h('div', { class: 'app' }, els.sidebar, h('div', { class: 'main' }, els.topbar, els.content), els.scrim);
    root.appendChild(els.app);
    updateShellTexts();
  }

  function setNav(open) {
    els.app.classList.toggle('nav-open', open);
    els.scrim.hidden = !open;
    els.menuBtn.setAttribute('aria-expanded', String(open));
  }

  function updateShellTexts() {
    var s = Store.settings;
    els.brandName.textContent = s.agencyName || 'Sigorta Portföy';
    els.brandMark.textContent = UI.initials(s.agencyName || 'Sigorta Portföy');
    document.getElementById('brand-sub').textContent = t('app.tagline');
    els.newBtn.lastChild.textContent = t('nav.newRecord');
    els.newBtn.title = t('nav.newRecord');
    els.langBtn.textContent = I18N.lang === 'tr' ? 'EN' : 'TR';
    els.langBtn.title = t('app.switchLang');
    els.langBtn.setAttribute('aria-label', t('app.switchLang'));
    var th = s.theme || 'system';
    UI.clear(els.themeBtn).appendChild(icon(th === 'dark' ? 'moon' : th === 'light' ? 'sun' : 'monitor'));
    els.themeBtn.title = t('app.theme') + ': ' + t('settings.theme.' + th);
    els.themeBtn.setAttribute('aria-label', els.themeBtn.title);
    els.searchInput.placeholder = t('search.placeholder');
    els.searchInput.setAttribute('aria-label', t('search.placeholder'));
    document.documentElement.lang = I18N.lang;
    renderNav();
  }

  function renderNav() {
    if (!els.nav) return;
    var route = App.route || App.parseRoute();
    UI.clear(els.nav);
    NAV.forEach(function (item) {
      if (item.section) { els.nav.appendChild(h('div', { class: 'nav-section' }, t(item.section))); return; }
      var extra = null;
      if (Store.loaded && item.badge) {
        var b = item.badge();
        if (b) extra = h('span', { class: 'nav-badge' + (item.bad ? ' bad' : ''), title: t(item.label) }, F.num(b));
      } else if (Store.loaded && item.count) {
        var c = item.count();
        if (c) extra = h('span', { class: 'nav-count' }, F.num(c));
      }
      els.nav.appendChild(h('a', {
        class: 'nav-item', href: '#' + item.id, 'aria-current': route.nav === item.id ? 'page' : null,
        onClick: function () { setNav(false); }
      }, icon(item.icon), h('span', null, t(item.label)), extra));
    });
    renderNavFoot();
  }

  function renderNavFoot() {
    UI.clear(els.navFoot);
    var status = Store.saveError ? 'err' : Store.saving ? 'busy' : '';
    var where = Store.backend === 'indexeddb' || Store.backend === 'localstorage' ? t('nav.storageLocal') : t('nav.storageMemory');
    els.navFoot.appendChild(h('div', { id: 'save-status' }, h('span', { class: 'save-dot ' + status }),
      status === 'err' ? t('nav.saveErr') : status === 'busy' ? t('nav.saving') : where));
    var last = Store.settings.lastBackupAt;
    var days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    els.navFoot.appendChild(h('div', null, t('nav.lastBackup') + ': ',
      last ? (days === 0 ? t('common.today') : t('nav.daysAgo', { n: days })) : t('common.never'),
      ' · ', h('a', { href: '#ayarlar', onClick: function () { App.viewState.settingsFocus = 'backup'; } }, t('nav.backupNow'))));
  }

  // ------------------------------------------------------------------ theme & language
  // a page hosting the app (a preview frame) may have set the theme on <html> before we started;
  // "device setting" then follows that choice
  var hostTheme = document.documentElement.getAttribute('data-theme');
  function applyTheme() {
    var th = Store.settings.theme || 'system';
    if (th === 'system' && !hostTheme) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th === 'system' ? hostTheme : th);
  }
  App.applyTheme = applyTheme;

  function cycleTheme() {
    var order = ['system', 'light', 'dark'];
    var next = order[(order.indexOf(Store.settings.theme || 'system') + 1) % order.length];
    Store.setSetting('theme', next);
  }

  function toggleLang() {
    var next = I18N.lang === 'tr' ? 'en' : 'tr';
    I18N.setLang(next);
    Store.setSetting('lang', next);
  }

  // ------------------------------------------------------------------ global search
  function buildSearch() {
    var pop = h('div', { class: 'search-pop', hidden: true, role: 'listbox', id: 'search-pop' });
    var input = h('input', { type: 'search', id: 'global-search', autocomplete: 'off', spellcheck: 'false', 'aria-controls': 'search-pop', 'aria-autocomplete': 'list' });
    els.searchInput = input;
    var sel = -1, items = [];
    function close() { pop.hidden = true; sel = -1; }
    function open(i) {
      var it = items[i];
      if (!it) return;
      close();
      input.value = '';
      input.blur();
      if (it.href) App.go(it.href);
    }
    function mark() { items.forEach(function (it, i) { it.el.setAttribute('aria-selected', String(i === sel)); }); }
    var run = U.debounce(function () {
      var q = input.value;
      UI.clear(pop);
      items = [];
      sel = -1;
      if (U.collapse(q).length < 2) { close(); return; }
      var res = Store.search(q, 7);
      var masked = Store.settings.maskIds;
      if (res.customers.length) {
        pop.appendChild(h('div', { class: 'search-group' }, t('search.customers') + (res.total > res.customers.length ? ' (' + F.num(res.total) + ')' : '')));
        res.customers.forEach(function (r) {
          var s = Store.summary(r.c.id);
          var it = { href: 'musteri-' + r.c.id };
          it.el = h('a', { class: 'search-item', href: '#' + it.href, role: 'option', onClick: function (e) { e.preventDefault(); open(items.indexOf(it)); } },
            h('span', { class: 'avatar sm' }, UI.initials(r.c.name)),
            h('span', { style: { minWidth: 0 } }, h('div', { style: { fontWeight: 600 } }, UI.highlight(r.c.name, q)),
              h('div', { class: 'small muted' }, [r.c.tc ? (masked ? U.maskId(r.c.tc) : r.c.tc) : '', r.c.phone ? U.formatPhone(r.c.phone) : '', r.c.profession].filter(Boolean).join(' · '))),
            h('span', { class: 'meta' }, t('search.policyCount', { n: s.count }), h('br'), s.months.length ? F.month(s.months[s.months.length - 1], true) : ''));
          items.push(it);
          pop.appendChild(it.el);
        });
      }
      if (res.policies.length) {
        pop.appendChild(h('div', { class: 'search-group' }, t('search.policies')));
        res.policies.forEach(function (r) {
          var it = { href: 'musteri-' + r.p.customerId };
          it.el = h('a', { class: 'search-item', href: '#' + it.href, role: 'option', onClick: function (e) { e.preventDefault(); open(items.indexOf(it)); } },
            r.p.plate ? UI.plate(r.p.plate) : icon('file-text'),
            h('span', { style: { minWidth: 0 } }, h('div', { style: { fontWeight: 600 } }, r.p.policyType || '—', ' · ', r.c ? r.c.name : ''),
              h('div', { class: 'small muted mono' }, UI.highlight(r.p.policyNo || r.p.serialNo || '', q))),
            h('span', { class: 'meta' }, F.month(r.p.month, true), h('br'), r.p.endDate ? F.date(r.p.endDate) : ''));
          items.push(it);
          pop.appendChild(it.el);
        });
      }
      pop.dataset.q = U.collapse(q);
      if (!items.length) pop.appendChild(h('div', { class: 'search-empty' }, t('search.noResults', { q: U.collapse(q) })));
      else {
        var all = { href: 'musteriler' };
        all.el = h('a', { class: 'search-item', href: '#musteriler', onClick: function (e) { e.preventDefault(); App.viewState.customers = Object.assign(App.viewState.customers || {}, { q: input.value }); open(items.indexOf(all)); } },
          icon('users'), h('span', null, t('search.showAll')));
        items.push(all);
        pop.appendChild(all.el);
      }
      pop.hidden = false;
    }, 110);
    input.addEventListener('input', run);
    input.addEventListener('focus', function () { if (input.value.length >= 2) run(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { sel = (sel + 1) % items.length; mark(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel - 1 + items.length) % items.length; mark(); } }
      else if (e.key === 'Enter') { e.preventDefault(); open(sel >= 0 ? sel : 0); }
      else if (e.key === 'Escape') { close(); input.blur(); }
    });
    document.addEventListener('mousedown', function (e) { if (!wrap.contains(e.target)) close(); });
    var wrap = h('div', { class: 'search', role: 'search' }, icon('search'), input, h('span', { class: 'kbd', 'aria-hidden': 'true' }, 'Ctrl K'), pop);
    return wrap;
  }

  // ------------------------------------------------------------------ rendering
  App.render = function (opts) {
    opts = opts || {};
    var route = App.parseRoute();
    var changed = !App.route || JSON.stringify(App.route) !== JSON.stringify(route);
    App.route = route;
    var view = App.views[route.view] || App.views.dashboard;
    var y = window.scrollY;
    var node;
    try { node = view.render(route); } catch (e) {
      console.error(e);
      node = UI.empty({ icon: 'triangle-alert', title: t('app.errorTitle'), text: String(e && e.message || e) });
    }
    UI.clear(els.content);
    els.content.appendChild(node);
    var title = view.title ? view.title(route) : '';
    els.title.textContent = title;
    var sub = view.sub ? view.sub(route) : '';
    els.sub.textContent = sub || '';
    els.sub.hidden = !sub;
    document.title = (title ? title + ' · ' : '') + (Store.settings.agencyName || 'Sigorta Portföy');
    renderNav();
    if (opts.keepScroll && !changed) window.scrollTo(0, y);
    else if (changed) { window.scrollTo(0, 0); if (opts.focus !== false) els.content.focus({ preventScroll: true }); }
    if (view.after) view.after(route);
    App.renderedHash = location.hash; // lets tests wait for the render, not just the URL
  };

  App.refresh = function () { App.render({ keepScroll: true }); };

  // ------------------------------------------------------------------ startup
  function prefs() {
    var p = {};
    try {
      ['lang', 'theme'].forEach(function (k) {
        var v = window.localStorage.getItem('sp:pref:' + k);
        if (v) p[k] = JSON.parse(v);
      });
    } catch (e) { /* storage blocked */ }
    return p;
  }

  App.boot = function () {
    var p = prefs();
    if (p.lang) I18N.setLang(p.lang);
    if (p.theme) Store.settings.theme = p.theme;
    applyTheme();
    buildShell();
    els.content.appendChild(h('div', { class: 'empty' }, icon('database'), h('p', null, t('app.loading'))));
    Store.onStatus(renderNavFoot);
    Store.load().then(function () {
      I18N.setLang(Store.settings.lang || 'tr');
      applyTheme();
      updateShellTexts();
      App.render();
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persisted().then(function (on) { if (!on) return navigator.storage.persist(); }).catch(function () { /* optional */ });
      }
    }, function (err) {
      console.error(err);
      UI.clear(els.content).appendChild(UI.empty({ icon: 'triangle-alert', title: t('app.errorTitle'), text: String(err && err.message || err) }));
    });
    Store.on(function (kind) {
      if (kind === 'settings') { applyTheme(); updateShellTexts(); }
      if (kind === 'load') { I18N.setLang(Store.settings.lang || 'tr'); applyTheme(); updateShellTexts(); }
      App.render({ keepScroll: true });
    });
    window.addEventListener('hashchange', function (e) { App.prevHash = decodeURIComponent((e.oldURL || '').split('#')[1] || ''); App.render(); });
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); els.searchInput.focus(); els.searchInput.select(); }
      else if (e.key === '/' && !typing) { e.preventDefault(); els.searchInput.focus(); }
      else if (e.key === 'Escape' && els.app.classList.contains('nav-open')) setNav(false);
    });
  };

  App.updateShell = updateShellTexts;
  document.addEventListener('DOMContentLoaded', function () { App.boot(); });
})();
