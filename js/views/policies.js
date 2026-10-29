/* Policies list and monthly production (months list + month sheet) */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Schema = window.Schema, Portfolio = window.Portfolio, Charts = window.Charts, Exporter = window.Exporter, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  function lang() { return window.I18N.lang; }

  App.payChips = function (p) {
    var out = [];
    if (p.card) out.push(h('span', { class: 'chip', title: t('field.card') + ': ' + F.money(p.card) }, t('pay.short.card')));
    if (p.cash) out.push(h('span', { class: 'chip', title: t('field.cash') + ': ' + F.money(p.cash) }, t('pay.short.cash')));
    if (p.account) {
      var rem = Portfolio.outstanding(p);
      out.push(h('span', { class: 'chip', title: t('field.account') + ': ' + F.money(p.account) + (rem > 0 ? ' · ' + t('collections.remaining') + ' ' + F.money(rem) : ''), style: rem > 0 ? { background: 'var(--warn-soft)', color: 'var(--text)' } : null }, t('pay.short.account')));
    }
    return out.length ? h('span', { class: 'chips', style: { flexWrap: 'nowrap' } }, out) : h('span', { class: 'muted' }, '—');
  };

  // ------------------------------------------------------------------ policies list
  function filterPolicies(vs) {
    var d = Store.derived();
    var q = U.collapse(vs.q);
    var fq = U.fold(q), qn = fq.replace(/ /g, ''), qp = U.plateKey(q);
    return d.policies.filter(function (p) {
      if (vs.from && p.month < vs.from) return false;
      if (vs.to && p.month > vs.to) return false;
      if (vs.company && (!p.company || U.companyKey(p.company) !== vs.company)) return false;
      if (vs.cat && Schema.categoryOf(p.policyType) !== vs.cat) return false;
      if (vs.nb === 'new' && p.newBusiness !== true) return false;
      if (vs.nb === 'renewal' && p.newBusiness !== false) return false;
      if (vs.nb === 'unknown' && p.newBusiness != null) return false;
      if (vs.pay && !(p[vs.pay] > 0)) return false;
      if (vs.state) {
        var info = d.renewal.get(p.id);
        var st = info ? info.state : 'none';
        if (vs.state === 'active' && !(st === 'active' || st === 'due' || (st === 'short' && p.endDate >= d.today))) return false;
        if (vs.state !== 'active' && st !== vs.state) return false;
      }
      if (q.length >= 2) {
        var c = Store.customers.get(p.customerId);
        var hay = U.fold([c ? c.name : '', p.policyType, p.company, p.insuredName, p.note].join(' '));
        var ok = fq.split(' ').every(function (tk) { return hay.indexOf(tk) >= 0; });
        if (!ok && qn.length >= 3) ok = (p.policyNo && U.fold(p.policyNo).replace(/ /g, '').indexOf(qn) >= 0) || (p.serialNo && U.fold(p.serialNo).replace(/ /g, '').indexOf(qn) >= 0);
        if (!ok && qp.length >= 3) ok = !!(p.plate && U.plateKey(p.plate).indexOf(qp) >= 0);
        if (!ok && U.digits(q).length >= 4 && c) ok = (c.tc || '').indexOf(U.digits(q)) >= 0;
        if (!ok) return false;
      }
      return true;
    });
  }

  function policyColumns(vs, opts) {
    opts = opts || {};
    var cols = [];
    if (!opts.noMonth) cols.push({ key: 'month', label: t('common.month'), sort: true, render: function (p) { return h('a', { href: '#ay-' + p.month, class: 'nowrap' }, F.month(p.month, true)); } });
    cols.push(
      { key: 'customer', label: t('common.customer'), cls: 'name-cell', sort: function (p) { var c = Store.customers.get(p.customerId); return c ? c.name : ''; }, render: function (p) {
        var c = Store.customers.get(p.customerId);
        return h('div', null, h('a', { href: '#musteri-' + p.customerId, style: { color: 'inherit' } }, c ? UI.highlight(c.name, vs.q || '') : '—'),
          h('span', { class: 'sub' }, p.insuredName && c && U.fold(p.insuredName) !== U.fold(c.name) ? t('customer.insured') + ': ' + p.insuredName : (c && c.profession) || ' '));
      } },
      { key: 'policyType', label: t('policies.colPolicy'), sort: true, render: function (p) {
        return h('div', { style: { minWidth: '140px' } }, h('div', { class: 'row tight', style: { flexWrap: 'nowrap' } }, h('span', null, p.policyType || '—'), App.newBizTag(p.newBusiness)),
          h('div', { class: 'small muted nowrap' }, Store.companyLabel(p.company) || '—'));
      } },
      { key: 'policyNo', label: t('field.policyNo'), sort: true, render: function (p) { return p.policyNo ? h('span', { class: 'mono small nowrap' }, UI.highlight(p.policyNo, vs.q || '')) : h('span', { class: 'muted' }, '—'); } },
      { key: 'plate', label: t('field.plate'), sort: function (p) { return p.plate ? U.plateKey(p.plate) : ''; }, render: function (p) { return p.plate ? UI.plate(p.plate) : h('span', { class: 'muted' }, '—'); } },
      { key: 'endDate', label: t('field.endDate'), sort: true, render: function (p) {
        var info = Store.derived().renewal.get(p.id);
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' } }, h('span', { class: 'num nowrap' }, p.endDate ? F.date(p.endDate) : '—'), App.statePill(info, p));
      } },
      { key: 'premium', label: t('field.premium'), align: 'r', sort: true, render: function (p) { return p.premium != null ? F.money(p.premium) : '—'; } },
      { key: 'commission', label: t('field.commission'), align: 'r', sort: true, render: function (p) { return p.commission != null ? F.money(p.commission) : '—'; } },
      { key: 'pay', label: t('policies.payment'), render: function (p) { return App.payChips(p); } },
      { key: 'actions', label: '', cls: 'actions-cell', render: function (p) { return App.policyActions(p); } });
    return cols;
  }

  function totalsFooter(rows, opts) {
    var tot = Portfolio.totals(rows);
    var cells = [];
    var lead = opts && opts.noMonth ? 0 : 1;
    cells.push(h('td', { class: 'full', colspan: 5 + lead }, t('policies.footer', { n: F.num(tot.count), m: F.num(tot.newCount) }),
      h('span', { class: 'small muted', style: { fontWeight: 400, marginLeft: '10px' } }, t('policies.payLine', { card: F.moneyC(tot.card), cash: F.moneyC(tot.cash), account: F.moneyC(tot.account) }))));
    cells.push(h('td', { class: 'r nowrap', 'data-label': t('field.premium') }, F.money(tot.premium)));
    cells.push(h('td', { class: 'r nowrap', 'data-label': t('field.commission') }, F.money(tot.commission)));
    cells.push(h('td', { colspan: 2 }));
    return cells;
  }

  App.views.policies = {
    title: function () { return t('nav.policies'); },
    sub: function () { return t('policies.sub', { n: F.num(Store.policies.size) }); },
    render: function () {
      var vs = App.viewState.policies = Object.assign({ q: '', from: '', to: '', company: '', cat: '', nb: '', pay: '', state: '', sortKey: 'month', sortDir: -1 }, App.viewState.policies || {});
      if (!Store.policies.size) {
        return h('section', { class: 'card' }, UI.empty({ icon: 'file-text', title: t('policies.emptyTitle'), text: t('policies.emptyText'),
          actions: [h('a', { class: 'btn btn-primary', href: '#ice-aktar' }, icon('upload'), t('nav.import')), h('a', { class: 'btn', href: '#yeni' }, icon('plus'), t('nav.newRecord'))] }));
      }
      var count = h('span', { class: 'result-count', id: 'policies-count' });
      var table = new UI.TableView({
        sortKey: vs.sortKey, sortDir: vs.sortDir, pageSize: Number(Store.settings.pageSize) || 50,
        onSort: function (k, dir) { vs.sortKey = k; vs.sortDir = dir; },
        columns: policyColumns(vs),
        footer: function (rows) { return totalsFooter(rows); },
        empty: UI.empty({ icon: 'search', title: t('policies.noMatch'), text: t('customers.noMatchText') })
      });
      var current = [];
      function apply() {
        current = filterPolicies(vs);
        table.setRows(current);
        count.textContent = t('policies.count', { n: F.num(current.length) });
      }
      var months = App.monthOptions(t('policies.anyMonth'));
      var toolbar = h('div', { class: 'toolbar' },
        h('div', { class: 'search-local' }, icon('search'), h('input', { type: 'search', id: 'policies-q', value: vs.q, placeholder: t('policies.searchPh'), autocomplete: 'off', onInput: U.debounce(function (e) { vs.q = e.target.value; apply(); }, 120) })),
        h('label', { class: 'small muted', for: 'policies-from' }, t('common.from')),
        UI.select('policies-from', months, vs.from, { onChange: function (e) { vs.from = e.target.value; apply(); } }),
        h('label', { class: 'small muted', for: 'policies-to' }, t('common.to')),
        UI.select('policies-to', months, vs.to, { onChange: function (e) { vs.to = e.target.value; apply(); } }));
      var toolbar2 = h('div', { class: 'toolbar' },
        UI.select('policies-company', App.companyOptions(), vs.company, { onChange: function (e) { vs.company = e.target.value; apply(); }, 'aria-label': t('field.company') }),
        UI.select('policies-cat', App.categoryOptions(), vs.cat, { onChange: function (e) { vs.cat = e.target.value; apply(); }, 'aria-label': t('report.category') }),
        UI.select('policies-nb', [{ value: '', label: t('policies.nbAll') }, { value: 'new', label: t('common.newBusiness') }, { value: 'renewal', label: t('common.renewal') }, { value: 'unknown', label: t('form.unspecified') }], vs.nb, { onChange: function (e) { vs.nb = e.target.value; apply(); }, 'aria-label': t('field.newBusiness') }),
        UI.select('policies-pay', [{ value: '', label: t('policies.payAll') }, { value: 'card', label: t('field.card') }, { value: 'cash', label: t('field.cash') }, { value: 'account', label: t('field.account') }], vs.pay, { onChange: function (e) { vs.pay = e.target.value; apply(); }, 'aria-label': t('policies.payment') }),
        UI.select('policies-state', [{ value: '', label: t('policies.stateAll') }, { value: 'active', label: t('state.active') }, { value: 'due', label: t('state.due') }, { value: 'expired', label: t('state.expired') }, { value: 'renewed', label: t('state.renewed') }, { value: 'lost', label: t('state.lost') }], vs.state, { onChange: function (e) { vs.state = e.target.value; apply(); }, 'aria-label': t('renewals.status') }),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: function () { App.viewState.policies = { sortKey: vs.sortKey, sortDir: vs.sortDir }; App.refresh(); } }, icon('filter-x'), t('common.clearFilters')),
        h('span', { class: 'spacer' }), count,
        h('button', { type: 'button', class: 'btn btn-sm', id: 'policies-export', onClick: function () { App.exportPolicyList(current, 'police-listesi'); } }, icon('file-down'), t('common.exportExcel')));
      apply();
      return h('div', { class: 'stack' }, toolbar, toolbar2, h('section', { class: 'card', style: { overflow: 'hidden' } }, table.el));
    }
  };

  // ------------------------------------------------------------------ months
  App.views.months = {
    title: function () { return t('nav.months'); },
    sub: function () { return t('months.sub'); },
    render: function () {
      var d = Store.derived();
      if (!d.months.length) {
        return h('section', { class: 'card' }, UI.empty({ icon: 'calendar-days', title: t('months.emptyTitle'), text: t('months.emptyText'),
          actions: [h('a', { class: 'btn btn-primary', href: '#ice-aktar' }, icon('upload'), t('nav.import'))] }));
      }
      var rows = Portfolio.aggregate(d.policies, function (p) { return p.month; }, true);
      var byKey = new Map(rows.map(function (r) { return [r.key, r]; }));
      var max = Math.max.apply(null, rows.map(function (r) { return r.premium; }));
      var years = U.groupBy(d.months.slice().reverse(), function (m) { return m.slice(0, 4); });
      var blocks = [];
      years.forEach(function (ms, y) {
        var yRows = ms.map(function (m) { return byKey.get(m); });
        var yTot = { count: U.sum(yRows, function (r) { return r.count; }), premium: U.sum(yRows, function (r) { return r.premium; }), commission: U.sum(yRows, function (r) { return r.commission; }) };
        blocks.push(h('div', { class: 'section-title' }, h('h2', null, y), h('span', { class: 'sub' }, t('months.yearLine', { n: F.num(yTot.count), p: F.money0(yTot.premium), c: F.money0(yTot.commission) }))));
        blocks.push(h('div', { class: 'month-grid' }, ms.map(function (m) {
          var r = byKey.get(m);
          var prev = byKey.get(U.addMonthsToKey(m, -1));
          var delta = prev && prev.premium ? (r.premium - prev.premium) / prev.premium : null;
          var meta = Store.months[m];
          return h('a', { class: 'card month-card', href: '#ay-' + m, id: 'month-' + m },
            h('div', { class: 'm' }, icon('calendar-days'), F.month(m),
              delta != null ? h('span', { class: delta >= 0 ? 'delta-up small' : 'delta-down small', style: { marginLeft: 'auto' }, title: t('months.vsPrev') }, (delta >= 0 ? '▲ ' : '▼ ') + F.pct(Math.abs(delta), 0)) : null),
            h('div', { class: 'bar-mini' }, h('span', { style: { width: (max ? r.premium / max * 100 : 0) + '%' } })),
            h('div', { class: 'kv' },
              h('div', null, h('div', { class: 'k' }, t('dash.kpiPolicies')), h('div', { class: 'v' }, F.num(r.count))),
              h('div', null, h('div', { class: 'k' }, t('field.newBusiness')), h('div', { class: 'v' }, F.num(r.newCount))),
              h('div', null, h('div', { class: 'k' }, t('dash.metric.premium')), h('div', { class: 'v', title: F.money(r.premium) }, F.moneyC(r.premium))),
              h('div', null, h('div', { class: 'k' }, t('dash.metric.commission')), h('div', { class: 'v', title: F.money(r.commission) }, F.moneyC(r.commission)))),
            h('div', { class: 'src' }, meta && meta.file ? t('months.fromFile', { sheet: meta.sheet, file: meta.file }) : t('months.manual')));
        })));
      });
      return h('div', { class: 'stack' }, blocks);
    }
  };

  App.views.month = {
    title: function (r) { return F.month(r.key); },
    sub: function (r) { var m = Store.months[r.key]; return m && m.file ? t('months.fromFile', { sheet: m.sheet, file: m.file }) : t('months.detailSub'); },
    render: function (r) {
      var d = Store.derived();
      var list = d.policies.filter(function (p) { return p.month === r.key; });
      var vs = App.viewState['m:' + r.key] || (App.viewState['m:' + r.key] = { q: '', view: 'sheet', sortKey: null, sortDir: 1 });
      var idx = d.months.indexOf(r.key);
      var nav = h('div', { class: 'row no-print' },
        h('a', { class: 'btn btn-ghost btn-sm', href: '#aylar' }, icon('arrow-left'), t('nav.months')),
        h('span', { class: 'spacer' }),
        idx > 0 ? h('a', { class: 'btn btn-sm', href: '#ay-' + d.months[idx - 1], id: 'month-prev' }, icon('chevron-left'), F.month(d.months[idx - 1], true)) : null,
        idx >= 0 && idx < d.months.length - 1 ? h('a', { class: 'btn btn-sm', href: '#ay-' + d.months[idx + 1], id: 'month-next' }, F.month(d.months[idx + 1], true), icon('chevron-right')) : null);
      if (!list.length) {
        return h('div', { class: 'stack' }, nav, h('section', { class: 'card' }, UI.empty({ icon: 'calendar-days', title: t('months.noPolicies'),
          actions: [h('a', { class: 'btn btn-primary', href: '#yeni-ay-' + r.key }, icon('plus'), t('months.addHere'))] })));
      }
      var tot = Portfolio.totals(list);
      var prev = d.policies.filter(function (p) { return p.month === U.addMonthsToKey(r.key, -1); });
      var prevTot = prev.length ? Portfolio.totals(prev) : null;
      function delta(cur, old) {
        if (!old) return null;
        var x = (cur - old) / old;
        return h('span', { class: x >= 0 ? 'delta-up' : 'delta-down' }, (x >= 0 ? '▲ ' : '▼ ') + F.pct(Math.abs(x), 0));
      }
      var kpis = h('section', { class: 'card kpis' },
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('file-text'), t('dash.kpiPolicies')), h('div', { class: 'kpi-value', id: 'month-count' }, F.num(tot.count)), h('div', { class: 'kpi-sub' }, prevTot ? delta(tot.count, prevTot.count) : null, prevTot ? t('months.vsPrev') : ' ')),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('banknote'), t('dash.kpiPremium')), h('div', { class: 'kpi-value', id: 'month-premium', title: F.money(tot.premium) }, F.moneyC(tot.premium)), h('div', { class: 'kpi-sub' }, prevTot ? delta(tot.premium, prevTot.premium) : null, prevTot ? t('months.vsPrev') : ' ')),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('badge-percent'), t('dash.kpiCommission')), h('div', { class: 'kpi-value', title: F.money(tot.commission) }, F.moneyC(tot.commission)), h('div', { class: 'kpi-sub' }, t('dash.ofPremium', { p: F.pct(tot.premium ? tot.commission / tot.premium : null) }))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('sparkles'), t('field.newBusiness')), h('div', { class: 'kpi-value' }, F.num(tot.newCount)), h('div', { class: 'kpi-sub' }, F.pct(tot.count ? tot.newCount / tot.count : null, 0))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('credit-card'), t('field.card')), h('div', { class: 'kpi-value', title: F.money(tot.card) }, F.moneyC(tot.card)), h('div', { class: 'kpi-sub' }, t('field.cash') + ': ' + F.moneyC(tot.cash))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('wallet'), t('field.account')), h('div', { class: 'kpi-value', title: F.money(tot.account) }, F.moneyC(tot.account)), h('div', { class: 'kpi-sub' }, t('dash.kpiCustomers') + ': ' + F.num(tot.customerCount))));

      // the month exactly like its Excel page
      var cols = Exporter.monthColumns(list, Store.customers, Store.months[r.key]);
      var sheetCols = cols.map(function (col, i) {
        var type = col.extra ? 'text' : (Schema.BY_KEY[col.field] || {}).type;
        return {
          key: 'c' + i, label: col.header, align: type === 'money' ? 'r' : null, cls: col.field === 'note' || col.field === 'name' ? 'wrap' : null,
          sort: function (p) { var v = col.extra ? (p.extras || {})[col.extra] : Exporter.valueFor(col.field, p, Store.customers.get(p.customerId)); return v; },
          render: function (p) {
            var c = Store.customers.get(p.customerId);
            if (col.extra) return (p.extras || {})[col.extra] || '';
            var v = Exporter.valueFor(col.field, p, c);
            if (v == null || v === '') return '';
            if (col.field === 'name') return h('a', { href: '#musteri-' + p.customerId }, v);
            if (type === 'money') return F.money(v);
            if (type === 'date') return F.date(v);
            if (col.field === 'tc') return UI.idBadge(v, Store.settings.maskIds);
            if (col.field === 'plate') return UI.plate(v);
            return String(v);
          }
        };
      });
      sheetCols.push({ key: 'actions', label: '', cls: 'actions-cell', render: function (p) { return App.policyActions(p); } });
      var table = new UI.TableView({
        columns: sheetCols, className: 'sheet', responsive: false, sortKey: vs.sortKey, sortDir: vs.sortDir,
        onSort: function (k, dir) { vs.sortKey = k; vs.sortDir = dir; },
        rows: [], empty: UI.empty({ icon: 'search', title: t('policies.noMatch') })
      });
      function apply() {
        var q = U.fold(vs.q);
        var rows = list;
        if (q.length >= 2) {
          rows = list.filter(function (p) {
            var c = Store.customers.get(p.customerId);
            var hay = U.fold([c && c.name, c && c.tc, p.policyType, p.company, p.policyNo, p.plate, p.serialNo, p.insuredName, p.note].join(' '));
            return q.split(' ').every(function (tk) { return hay.indexOf(tk) >= 0; });
          });
        }
        if (!vs.sortKey) rows = rows.slice().sort(function (a, b) { var x = a.source && a.source.row || 1e9, y = b.source && b.source.row || 1e9; return x - y || (a.createdAt || 0) - (b.createdAt || 0); });
        table.setRows(rows);
      }
      apply();
      var cats = Portfolio.aggregate(list, function (p) { return Schema.categoryOf(p.policyType); });
      var comps = Portfolio.aggregate(list, function (p) { return p.company ? U.companyKey(p.company) : ''; });
      var breakdown = h('div', { class: 'grid-2' },
        Charts.card({ title: t('dash.byCategory'), sub: t('dash.byCount'), chart: function () {
          return Charts.hbars({ data: cats.slice().sort(function (a, b) { return b.count - a.count; }).map(function (x) { return { label: Schema.categoryLabel(x.key, lang()), value: x.count, sub: F.moneyC(x.premium) }; }), format: function (v) { return F.num(v); } });
        }, table: function () {
          return Charts.miniTable([{ label: t('report.category'), value: function (x) { return Schema.categoryLabel(x.key, lang()); } }, { label: t('dash.metric.count'), align: 'r', value: function (x) { return F.num(x.count); } }, { label: t('dash.metric.premium'), align: 'r', value: function (x) { return F.money(x.premium); } }], cats);
        } }),
        Charts.card({ title: t('dash.byCompany'), sub: t('dash.byPremium'), chart: function () {
          return Charts.hbars({ data: comps.slice(0, 8).map(function (x) { return { label: x.key === '—' ? t('common.unknown') : (d.companyNames.get(x.key) || x.key), value: x.premium, sub: F.num(x.count) }; }), format: function (v) { return F.moneyC(v); } });
        }, table: function () {
          return Charts.miniTable([{ label: t('field.company'), value: function (x) { return x.key === '—' ? t('common.unknown') : (d.companyNames.get(x.key) || x.key); } }, { label: t('dash.metric.count'), align: 'r', value: function (x) { return F.num(x.count); } }, { label: t('dash.metric.premium'), align: 'r', value: function (x) { return F.money(x.premium); } }], comps);
        } }));
      var actions = h('div', { class: 'toolbar' },
        h('div', { class: 'search-local' }, icon('search'), h('input', { type: 'search', id: 'month-q', value: vs.q, placeholder: t('months.searchPh'), autocomplete: 'off', onInput: U.debounce(function (e) { vs.q = e.target.value; apply(); }, 120) })),
        h('a', { class: 'btn btn-sm btn-primary', href: '#yeni-ay-' + r.key, id: 'month-add' }, icon('plus'), t('months.addHere')),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'month-export', onClick: function () { App.exportMonths([r.key]); } }, icon('file-down'), t('months.export')),
        h('button', { type: 'button', class: 'btn btn-sm btn-danger', id: 'month-delete', onClick: function () {
          var orphan = h('input', { type: 'checkbox', id: 'orphans', checked: true });
          UI.confirm({ title: t('months.deleteTitle', { m: F.month(r.key) }), message: t('months.deleteMsg', { n: list.length }), danger: true, confirm: t('common.delete'),
            extra: h('label', { class: 'check', for: 'orphans' }, orphan, t('months.removeOrphans')), requireText: U.trUpper(F.month(r.key)) })
            .then(function (ok) {
              if (!ok) return;
              var res = Store.deleteMonth(r.key, orphan.checked);
              App.go('aylar');
              UI.toast(t('months.deleted', { n: res.policies, c: res.customers }));
            });
        } }, icon('trash-2'), t('months.delete')));
      return h('div', { class: 'stack' }, nav, kpis, actions,
        h('section', { class: 'card', style: { overflow: 'hidden' } },
          h('div', { class: 'card-head' }, h('h2', null, t('months.sheetTitle')), h('span', { class: 'sub' }, t('months.sheetSub', { n: cols.length }))),
          h('div', { class: 'card-body flush', style: { marginTop: '10px' } }, table.el)),
        breakdown);
    }
  };
})();
