/* Çapraz satış fırsatları: customers who could buy one more policy (kasko for a traffic policy, DASK for a home …) */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Portfolio = window.Portfolio, Exporter = window.Exporter, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;
  var TYPES = ['kasko', 'trafik', 'dask', 'konut'];
  var cache = { v: -1, list: [] };

  /** Every opportunity of the portfolio: [{ c (customer), o: { type, plate } }], worked out once per change. */
  App.allOpportunities = function () {
    if (cache.v === Store.version) return cache.list;
    var d = Store.derived(), out = [];
    Store.customers.forEach(function (c) {
      Portfolio.opportunities(c, Store.policiesOf(c.id), d.today).forEach(function (o) { out.push({ c: c, o: o }); });
    });
    out.sort(function (a, b) { return TYPES.indexOf(a.o.type) - TYPES.indexOf(b.o.type) || U.cmp(a.c.name, b.c.name); });
    cache = { v: Store.version, list: out };
    return out;
  };

  function taskFor(x) {
    App.editTask({ customerId: x.c.id, title: t('opp.' + x.o.type + '.task', { plate: x.o.plate || '', name: x.c.name }), due: U.addDays(U.todayISO(), 2) });
  }

  App.views.opportunities = {
    title: function () { return t('nav.opps'); },
    sub: function () { return t('opps.sub'); },
    render: function () {
      var vs = App.viewState.opps = Object.assign({ type: '', q: '' }, App.viewState.opps || {});
      var all = App.allOpportunities();
      if (!Store.derived().policies.length) {
        return h('section', { class: 'card' }, UI.empty({ icon: 'lightbulb', title: t('opps.emptyTitle'), text: t('opps.emptyText') }));
      }
      var byType = {};
      TYPES.forEach(function (k) { byType[k] = all.filter(function (x) { return x.o.type === k; }); });
      var count = h('span', { class: 'result-count', id: 'opps-count' });
      var current = [];
      var table = new UI.TableView({
        pageSize: Number(Store.settings.pageSize) || 50, sortKey: 'type', sortDir: 1,
        empty: UI.empty({ icon: 'search', title: t('opps.noMatch') }),
        columns: [
          { key: 'type', label: t('reports.oppType'), sort: function (x) { return TYPES.indexOf(x.o.type); }, render: function (x) {
            return h('div', null, h('div', { class: 'row tight' }, icon('lightbulb'), h('strong', null, t('opp.' + x.o.type + '.title'))),
              h('div', { class: 'small muted' }, t('opp.' + x.o.type + '.text', { plate: x.o.plate || '' })));
          } },
          { key: 'c', label: t('common.customer'), cls: 'name-cell', sort: function (x) { return x.c.name; }, render: function (x) {
            return h('div', null, h('a', { href: '#musteri-' + x.c.id, style: { color: 'inherit' } }, x.c.name), x.c.profession ? h('span', { class: 'sub' }, x.c.profession) : null);
          } },
          { key: 'plate', label: t('field.plate'), render: function (x) { return x.o.plate ? UI.plate(x.o.plate) : h('span', { class: 'muted' }, '—'); } },
          { key: 'phone', label: t('field.phone'), render: function (x) { return App.phoneLinks(x.c.phone); } },
          { key: 'act', label: '', cls: 'actions-cell', render: function (x) {
            return h('button', { type: 'button', class: 'btn btn-sm', onClick: function () { taskFor(x); } }, icon('list-checks'), t('customer.makeTask'));
          } }
        ]
      });
      function apply() {
        var q = U.fold(vs.q), qp = U.plateKey(vs.q || '');
        current = (vs.type ? byType[vs.type] : all).filter(function (x) {
          if (q.length < 2) return true;
          return U.fold(x.c.name).indexOf(q) >= 0 || (qp.length >= 3 && x.o.plate && U.plateKey(x.o.plate).indexOf(qp) >= 0) ||
            (U.digits(vs.q).length >= 4 && (x.c.phone || '').indexOf(U.digits(vs.q)) >= 0);
        });
        table.setRows(current);
        count.textContent = t('opps.count', { n: F.num(current.length) });
      }
      // one chip per kind of opportunity, with what it means under it
      var chips = h('div', { class: 'opp-types' }, [''].concat(TYPES).map(function (k) {
        var n = k ? byType[k].length : all.length;
        return h('button', { type: 'button', class: 'opp-type', id: 'opps-t-' + (k || 'all'), 'aria-pressed': String(vs.type === k), onClick: function () { vs.type = k; App.refresh(); } },
          h('span', { class: 'opp-type-n num' }, F.num(n)),
          h('span', { class: 'opp-type-t' }, k ? t('opp.' + k + '.title') : t('opps.all')),
          h('span', { class: 'opp-type-s' }, k ? t('opp.' + k + '.why') : t('opps.allWhy')));
      }));
      var toolbar = h('div', { class: 'toolbar' },
        h('div', { class: 'search-local' }, icon('search'), h('input', { type: 'search', id: 'opps-q', value: vs.q, placeholder: t('opps.searchPh'), 'aria-label': t('opps.searchPh'), autocomplete: 'off',
          onInput: U.debounce(function (e) { vs.q = e.target.value; apply(); }, 120) })),
        h('span', { class: 'spacer' }), count,
        h('button', { type: 'button', class: 'btn btn-sm', id: 'opps-export', onClick: function () {
          App.saveWorkbook(Exporter.tableWorkbook(window.XLSX, [{ name: t('nav.opps'), rows: current, columns: [
            { label: t('reports.oppType'), value: function (x) { return t('opp.' + x.o.type + '.title'); } },
            { label: t('common.customer'), value: function (x) { return x.c.name; } },
            { label: t('field.plate'), value: function (x) { return x.o.plate || ''; } },
            { label: t('field.phone'), value: function (x) { return x.c.phone ? U.formatPhone(x.c.phone) : ''; } },
            { label: t('field.profession'), value: function (x) { return x.c.profession || ''; } }
          ] }]), 'firsatlar.xlsx');
        } }, icon('file-down'), t('common.exportExcel')));
      apply();
      return h('div', { class: 'stack' }, chips, toolbar, h('section', { class: 'card', id: 'opps-list', style: { overflow: 'hidden' } }, table.el));
    }
  };
})();
