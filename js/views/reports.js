/* Reports and Excel export helpers */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Schema = window.Schema, Portfolio = window.Portfolio, Charts = window.Charts, Exporter = window.Exporter, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  function lang() { return window.I18N.lang; }
  function stamp() { return U.todayISO(); }

  // ------------------------------------------------------------------ exports
  function save(wb, name) {
    if (App.embedded) { UI.toast(t('export.blocked'), { type: 'info', timeout: 6000 }); return; }
    try {
      Exporter.writeFile(window.XLSX, wb, name);
      UI.toast(t('export.done', { file: name }));
    } catch (e) {
      console.error(e);
      UI.toast(t('export.failed'), { type: 'bad' });
    }
  }
  App.saveWorkbook = save;

  App.exportAll = function () {
    var wb = Exporter.portfolioWorkbook({ XLSX: window.XLSX, policies: Store.derived().policies, customers: Store.customers, monthsMeta: Store.months, lang: lang(), withSummary: true, withCustomers: true });
    save(wb, 'portfoy-' + stamp() + '.xlsx');
  };

  App.exportMonths = function (keys) {
    var list = Store.derived().policies.filter(function (p) { return keys.indexOf(p.month) >= 0; });
    var wb = Exporter.portfolioWorkbook({ XLSX: window.XLSX, policies: list, customers: Store.customers, monthsMeta: Store.months, lang: lang(), months: keys });
    save(wb, (keys.length === 1 ? U.fold(U.monthLabel(keys[0], 'tr')).replace(/ /g, '-') : 'aylar') + '.xlsx');
  };

  function policyListColumns() {
    var cols = [
      { label: t('common.month'), value: function (p) { return U.monthLabel(p.month, lang()); } },
      { label: Schema.label('name', lang()), value: function (p) { var c = Store.customers.get(p.customerId); return c ? c.name : ''; } },
      { label: Schema.label('tc', lang()), type: 'id', value: function (p) { var c = Store.customers.get(p.customerId); return c ? c.tc : ''; } },
      { label: Schema.label('phone', lang()), value: function (p) { var c = Store.customers.get(p.customerId); return c && c.phone ? U.formatPhone(c.phone) : ''; } }
    ];
    ['policyType', 'company', 'policyNo', 'startDate', 'endDate', 'plate', 'serialNo', 'step', 'premium', 'commission', 'newBusiness', 'card', 'cash', 'account', 'insuredName', 'note'].forEach(function (k) {
      var type = (Schema.BY_KEY[k] || {}).type;
      cols.push({ label: Schema.label(k, lang()), type: type === 'money' ? 'money' : type === 'date' ? 'date' : type === 'int' ? 'int' : 'text', value: function (p) {
        if (k === 'company') return Store.companyLabel(p.company);
        if (k === 'newBusiness') return p.newBusiness === true ? t('common.yes') : p.newBusiness === false ? t('common.no') : '';
        return p[k];
      } });
    });
    return cols;
  }

  App.exportPolicyList = function (list, name) {
    var wb = Exporter.tableWorkbook(window.XLSX, [{ name: t('nav.policies'), columns: policyListColumns(), rows: list.slice().sort(function (a, b) { return U.cmp(a.month, b.month); }) }]);
    save(wb, (name || 'policeler') + '-' + stamp() + '.xlsx');
  };

  App.exportCustomers = function (list) {
    var map = new Map(list.map(function (c) { return [c.id, c]; }));
    var ws = Exporter.customersSheet(window.XLSX, map, Store.derived().policies.filter(function (p) { return map.has(p.customerId); }), lang());
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, lang() === 'en' ? 'Customers' : 'Müşteriler');
    save(wb, 'musteriler-' + stamp() + '.xlsx');
  };

  App.exportCustomerStatement = function (c) {
    var list = Store.policiesOf(c.id);
    var wb = Exporter.tableWorkbook(window.XLSX, [{ name: c.name.slice(0, 31), columns: policyListColumns().filter(function (col, i) { return i === 0 || i > 3; }), rows: list.slice().sort(function (a, b) { return U.cmp(a.month, b.month); }) }]);
    save(wb, U.fold(c.name).replace(/ /g, '-') + '-' + stamp() + '.xlsx');
  };

  App.exportRenewals = function (list) {
    var d = Store.derived();
    var cols = [
      { label: t('renewals.colDays'), type: 'int', value: function (p) { var i = d.renewal.get(p.id); return i ? i.daysLeft : ''; } },
      { label: Schema.label('endDate', lang()), type: 'date', value: function (p) { return p.endDate; } },
      { label: Schema.label('name', lang()), value: function (p) { var c = Store.customers.get(p.customerId); return c ? c.name : ''; } },
      { label: Schema.label('phone', lang()), value: function (p) { var c = Store.customers.get(p.customerId); return c && c.phone ? U.formatPhone(c.phone) : ''; } },
      { label: Schema.label('policyType', lang()), value: function (p) { return p.policyType; } },
      { label: Schema.label('company', lang()), value: function (p) { return Store.companyLabel(p.company); } },
      { label: Schema.label('plate', lang()), value: function (p) { return p.plate; } },
      { label: Schema.label('policyNo', lang()), value: function (p) { return p.policyNo; } },
      { label: Schema.label('premium', lang()), type: 'money', value: function (p) { return p.premium; } },
      { label: t('renewals.status'), value: function (p) { var i = d.renewal.get(p.id); return i.state === 'renewed' ? t('state.renewed') : t('renewals.st.' + ((p.renewal && p.renewal.status) || 'pending')); } },
      { label: t('renewals.note'), value: function (p) { return p.renewal && p.renewal.note; } }
    ];
    save(Exporter.tableWorkbook(window.XLSX, [{ name: t('nav.renewals'), columns: cols, rows: list.slice().sort(function (a, b) { return U.cmp(a.endDate, b.endDate); }) }]), 'yenilemeler-' + stamp() + '.xlsx');
  };

  App.exportBackup = function () {
    var json = JSON.stringify(Store.backup(), null, 1);
    if (App.embedded) { UI.toast(t('export.blocked'), { type: 'info', timeout: 6000 }); return; }
    UI.download(new Blob([json], { type: 'application/json' }), 'sigorta-portfoy-yedek-' + stamp() + '.json');
    Store.markBackup();
    UI.toast(t('settings.backupDone'));
  };

  // ------------------------------------------------------------------ reports view
  function filtered(vs) {
    return Store.derived().policies.filter(function (p) {
      if (vs.from && p.month < vs.from) return false;
      if (vs.to && p.month > vs.to) return false;
      if (vs.company && (!p.company || U.companyKey(p.company) !== vs.company)) return false;
      if (vs.cat && Schema.categoryOf(p.policyType) !== vs.cat) return false;
      return true;
    });
  }

  function aggTable(rows, labelFn, labelHead, tot) {
    return Charts.miniTable([
      { label: labelHead, value: labelFn },
      { label: t('dash.metric.count'), align: 'r', value: function (r) { return F.num(r.count); } },
      { label: t('report.share'), align: 'r', value: function (r) { return F.pct(tot.premium ? r.premium / tot.premium : 0); } },
      { label: t('dash.metric.premium'), align: 'r', value: function (r) { return F.money(r.premium); } },
      { label: t('dash.metric.commission'), align: 'r', value: function (r) { return F.money(r.commission); } },
      { label: t('report.commRate'), align: 'r', value: function (r) { return F.pct(r.premium ? r.commission / r.premium : null); } },
      { label: t('field.newBusiness'), align: 'r', value: function (r) { return F.num(r.newCount); } }
    ], rows, [t('common.total'), F.num(tot.count), '100%', F.money(tot.premium), F.money(tot.commission), F.pct(tot.premium ? tot.commission / tot.premium : null), F.num(tot.newCount)]);
  }

  App.views.reports = {
    title: function () { return t('nav.reports'); },
    sub: function () { return t('reports.sub'); },
    render: function () {
      var d = Store.derived();
      if (!d.policies.length) return h('section', { class: 'card' }, UI.empty({ icon: 'chart-column', title: t('reports.emptyTitle'), text: t('reports.emptyText') }));
      var vs = App.viewState.reports = Object.assign({ from: '', to: '', company: '', cat: '' }, App.viewState.reports || {});
      var list = filtered(vs);
      var tot = Portfolio.totals(list);
      var months = App.monthOptions(t('policies.anyMonth'));
      var filters = h('div', { class: 'toolbar' },
        h('label', { class: 'small muted', for: 'rep-from' }, t('common.from')), UI.select('rep-from', months, vs.from, { onChange: function (e) { vs.from = e.target.value; App.refresh(); } }),
        h('label', { class: 'small muted', for: 'rep-to' }, t('common.to')), UI.select('rep-to', months, vs.to, { onChange: function (e) { vs.to = e.target.value; App.refresh(); } }),
        UI.select('rep-company', App.companyOptions(), vs.company, { onChange: function (e) { vs.company = e.target.value; App.refresh(); }, 'aria-label': t('field.company') }),
        UI.select('rep-cat', App.categoryOptions(), vs.cat, { onChange: function (e) { vs.cat = e.target.value; App.refresh(); }, 'aria-label': t('report.category') }),
        h('span', { class: 'spacer' }),
        !App.embedded ? h('button', { type: 'button', class: 'btn btn-sm', onClick: function () { window.print(); } }, icon('printer'), t('common.print')) : null,
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'report-export', onClick: function () { exportReport(vs, list); } }, icon('file-down'), t('reports.export')));

      var byMonth = Portfolio.aggregate(list, function (p) { return p.month; }, true);
      var monthly = Charts.card({
        id: 'rep-monthly', title: t('reports.monthly'), sub: t('reports.monthlySub', { n: byMonth.length }),
        chart: function () {
          return Charts.columns({ data: byMonth.map(function (r) {
            return { key: r.key, label: F.month(r.key), short: F.month(r.key, true), value: r.premium, tip: [
              { series: t('dash.metric.premium'), value: F.money0(r.premium), color: 'var(--chart-1)' },
              { value: t('dash.tipCommission', { v: F.money0(r.commission) }), sub: true },
              { value: t('dash.tipCount', { n: F.num(r.count), m: F.num(r.newCount) }), sub: true }] };
          }), format: function (v) { return F.moneyC(v); }, tickFormat: function (v) { return U.fmtCompact(v, lang()); }, onClick: function (x) { App.go('ay-' + x.key); } });
        },
        table: function () {
          return Charts.miniTable([
            { label: t('common.month'), value: function (r) { return h('a', { href: '#ay-' + r.key }, F.month(r.key)); } },
            { label: t('dash.metric.count'), align: 'r', value: function (r) { return F.num(r.count); } },
            { label: t('field.newBusiness'), align: 'r', value: function (r) { return F.num(r.newCount); } },
            { label: t('dash.metric.premium'), align: 'r', value: function (r) { return F.money(r.premium); } },
            { label: t('dash.metric.commission'), align: 'r', value: function (r) { return F.money(r.commission); } },
            { label: t('report.commRate'), align: 'r', value: function (r) { return F.pct(r.premium ? r.commission / r.premium : null); } },
            { label: t('field.card'), align: 'r', value: function (r) { return F.money(r.card); } },
            { label: t('field.cash'), align: 'r', value: function (r) { return F.money(r.cash); } },
            { label: t('field.account'), align: 'r', value: function (r) { return F.money(r.account); } }
          ], byMonth, [t('common.total'), F.num(tot.count), F.num(tot.newCount), F.money(tot.premium), F.money(tot.commission), F.pct(tot.premium ? tot.commission / tot.premium : null), F.money(tot.card), F.money(tot.cash), F.money(tot.account)]);
        }
      });
      var nbSeries = [{ label: t('common.newBusiness'), color: 'var(--chart-1)' }, { label: t('common.renewal'), color: 'var(--chart-2)' }, { label: t('form.unspecified'), color: 'var(--chart-3)' }];
      var newRen = Charts.card({
        id: 'rep-newren', title: t('reports.newRen'), sub: t('reports.newRenSub'),
        legend: h('div', { class: 'legend', style: { marginBottom: '8px' } }, nbSeries.map(function (s) { return h('span', null, h('i', { style: { background: s.color } }), s.label); })),
        chart: function () {
          return Charts.stackedColumns({ data: byMonth.map(function (r) { return { label: F.month(r.key), short: F.month(r.key, true), values: [r.newCount, r.renewalCount, r.count - r.newCount - r.renewalCount] }; }), series: nbSeries, format: function (v) { return F.num(v); }, tickFormat: function (v) { return F.num(v); } });
        },
        table: function () {
          return Charts.miniTable([
            { label: t('common.month'), value: function (r) { return F.month(r.key); } },
            { label: t('common.newBusiness'), align: 'r', value: function (r) { return F.num(r.newCount); } },
            { label: t('common.renewal'), align: 'r', value: function (r) { return F.num(r.renewalCount); } },
            { label: t('form.unspecified'), align: 'r', value: function (r) { return F.num(r.count - r.newCount - r.renewalCount); } },
            { label: t('report.newShare'), align: 'r', value: function (r) { return F.pct(r.count ? r.newCount / r.count : null, 0); } }
          ], byMonth);
        }
      });
      var comps = Portfolio.aggregate(list, function (p) { return p.company ? U.companyKey(p.company) : ''; });
      var compLabel = function (r) { return r.key === '—' ? t('common.unknown') : (d.companyNames.get(r.key) || r.key); };
      var companyCard = Charts.card({ id: 'rep-card-company', title: t('dash.byCompany'),
        chart: function () { return Charts.hbars({ data: comps.slice(0, 12).map(function (r) { return { label: compLabel(r), value: r.premium, sub: F.pct(tot.premium ? r.premium / tot.premium : 0, 0) }; }), format: function (v) { return F.moneyC(v); } }); },
        table: function () { return aggTable(comps, compLabel, t('field.company'), tot); } });
      var cats = Portfolio.aggregate(list, function (p) { return Schema.categoryOf(p.policyType); });
      var catLabel = function (r) { return Schema.categoryLabel(r.key, lang()); };
      var catCard = Charts.card({ id: 'rep-card-category', title: t('dash.byCategory'),
        chart: function () { return Charts.hbars({ data: cats.map(function (r) { return { label: catLabel(r), value: r.premium, sub: F.num(r.count) + ' ' + t('report.pcs') }; }), format: function (v) { return F.moneyC(v); } }); },
        table: function () { return aggTable(cats, catLabel, t('report.category'), tot); } });
      var payParts = [{ label: t('field.card'), value: tot.card, color: 'var(--chart-1)' }, { label: t('field.cash'), value: tot.cash, color: 'var(--chart-2)' }, { label: t('field.account'), value: tot.account, color: 'var(--chart-3)' }];
      var unpaid = U.round2(tot.premium - tot.card - tot.cash - tot.account);
      var payRows = [['card', 'field.card'], ['cash', 'field.cash'], ['account', 'field.account']].map(function (x) {
        var ps = list.filter(function (p) { return p[x[0]] > 0; });
        return { key: x[0], label: t(x[1]), n: ps.length, v: tot[x[0]] };
      });
      var accPaid = U.sum(list, Portfolio.paidOnAccount);
      var payCard = h('section', { class: 'card', id: 'rep-payments' }, h('div', { class: 'card-head' }, h('h2', null, t('dash.payments'))),
        h('div', { class: 'card-body stack' }, Charts.stackBar({ parts: payParts, format: function (v) { return F.money0(v); } }),
          Charts.miniTable([
            { label: t('collections.method'), value: function (r) { return r.label; } },
            { label: t('reports.policiesUsing'), align: 'r', value: function (r) { return F.num(r.n); } },
            { label: t('common.amount'), align: 'r', value: function (r) { return F.money(r.v); } },
            { label: t('report.share'), align: 'r', value: function (r) { return F.pct(tot.premium ? r.v / tot.premium : null); } }
          ], payRows),
          tot.account ? h('p', { class: 'small dim' }, t('reports.accountLine', { paid: F.money(accPaid), open: F.money(U.round2(U.sum(list, Portfolio.outstanding))) }), ' ', h('a', { href: '#tahsilat' }, t('nav.collections'))) : null,
          Math.abs(unpaid) >= 1 ? h('p', { class: 'small muted' }, t('reports.unassigned', { v: F.money(unpaid) })) : null));
      var profs = Portfolio.aggregate(list.map(function (p) { var c = Store.customers.get(p.customerId); return Object.assign({}, p, { _prof: c && c.profession }); }), function (p) { return p._prof || ''; });
      var profCard = h('section', { class: 'card', id: 'rep-profession' }, h('div', { class: 'card-head' }, h('h2', null, t('reports.byProfession')), h('span', { class: 'sub' }, t('reports.top', { n: 10 }))),
        h('div', { class: 'card-body' }, Charts.hbars({ data: profs.slice(0, 10).map(function (r) { return { label: r.key === '—' ? t('common.unknown') : r.key, value: r.premium, sub: F.num(r.customerCount) + ' ' + t('report.people') }; }), format: function (v) { return F.moneyC(v); } })));
      var byCust = Portfolio.aggregate(list, function (p) { return p.customerId; }).slice(0, 15);
      var topCard = h('section', { class: 'card', id: 'rep-top' }, h('div', { class: 'card-head' }, h('h2', null, t('reports.topCustomers')), h('span', { class: 'sub' }, t('reports.top', { n: 15 }))),
        h('div', { class: 'card-body flush', style: { marginTop: '10px' } }, Charts.miniTable([
          { label: '#', value: function (r) { return String(byCust.indexOf(r) + 1); } },
          { label: t('common.customer'), value: function (r) { var c = Store.customers.get(r.key); return c ? h('a', { href: '#musteri-' + c.id }, c.name) : '—'; } },
          { label: t('dash.metric.count'), align: 'r', value: function (r) { return F.num(r.count); } },
          { label: t('dash.metric.premium'), align: 'r', value: function (r) { return F.money(r.premium); } },
          { label: t('dash.metric.commission'), align: 'r', value: function (r) { return F.money(r.commission); } }
        ], byCust)));
      // retention by expiry month
      var expRows = [];
      var byExp = U.groupBy(d.policies.filter(function (p) { var i = d.renewal.get(p.id); return p.endDate && p.endDate < d.today && i && i.state !== 'short' && i.state !== 'none'; }), function (p) { return U.monthKeyOf(p.endDate); });
      Array.from(byExp.keys()).sort().slice(-12).forEach(function (k) {
        var ps = byExp.get(k);
        var ren = ps.filter(function (p) { return d.renewal.get(p.id).state === 'renewed'; }).length;
        var lost = ps.filter(function (p) { return d.renewal.get(p.id).state === 'lost'; }).length;
        expRows.push({ key: k, n: ps.length, renewed: ren, lost: lost, open: ps.length - ren - lost });
      });
      var retCard = h('section', { class: 'card', id: 'rep-retention' }, h('div', { class: 'card-head' }, h('h2', null, t('reports.retention')), h('span', { class: 'sub' }, t('reports.retentionSub'))),
        h('div', { class: 'card-body flush', style: { marginTop: '10px' } }, expRows.length ? Charts.miniTable([
          { label: t('reports.expiryMonth'), value: function (r) { return F.month(r.key); } },
          { label: t('reports.expired'), align: 'r', value: function (r) { return F.num(r.n); } },
          { label: t('state.renewed'), align: 'r', value: function (r) { return F.num(r.renewed); } },
          { label: t('state.lost'), align: 'r', value: function (r) { return F.num(r.lost); } },
          { label: t('reports.notRenewed'), align: 'r', value: function (r) { return F.num(r.open); } },
          { label: t('reports.rate'), align: 'r', value: function (r) { return F.pct(r.n ? r.renewed / r.n : null, 0); } }
        ], expRows) : h('p', { class: 'muted', style: { padding: '0 18px 18px' } }, t('reports.noRetention'))));
      // cross-sell list
      var opps = [];
      Store.customers.forEach(function (c) { Portfolio.opportunities(c, Store.policiesOf(c.id), d.today).forEach(function (o) { opps.push({ c: c, o: o }); }); });
      opps.sort(function (a, b) { return U.cmp(a.o.type, b.o.type) || U.cmp(a.c.name, b.c.name); });
      var oppTable = new UI.TableView({
        rows: opps, pageSize: 15,
        columns: [
          { key: 'type', label: t('reports.oppType'), sort: function (x) { return x.o.type; }, render: function (x) { return h('span', { class: 'row tight' }, icon('lightbulb'), t('opp.' + x.o.type + '.title')); } },
          { key: 'c', label: t('common.customer'), cls: 'name-cell', sort: function (x) { return x.c.name; }, render: function (x) { return h('a', { href: '#musteri-' + x.c.id, style: { color: 'inherit' } }, x.c.name); } },
          { key: 'plate', label: t('field.plate'), render: function (x) { return x.o.plate ? UI.plate(x.o.plate) : '—'; } },
          { key: 'phone', label: t('field.phone'), render: function (x) { return App.phoneLinks(x.c.phone); } },
          { key: 'act', label: '', cls: 'actions-cell', render: function (x) { return h('button', { type: 'button', class: 'btn btn-sm', onClick: function () { App.editTask({ customerId: x.c.id, title: t('opp.' + x.o.type + '.task', { plate: x.o.plate || '', name: x.c.name }), due: U.addDays(d.today, 2) }); } }, icon('list-checks'), t('customer.makeTask')); } }
        ]
      });
      var oppCard = h('section', { class: 'card', id: 'rep-opps', style: { overflow: 'hidden' } }, h('div', { class: 'card-head' }, h('h2', null, t('dash.opportunities')), h('span', { class: 'sub' }, t('reports.oppSub', { n: F.num(opps.length) }))),
        h('div', { class: 'card-body flush', style: { marginTop: '10px' } }, opps.length ? oppTable.el : h('p', { class: 'muted', style: { padding: '0 18px 18px' } }, t('customer.noOpps'))));

      var summary = h('section', { class: 'card kpis k5' },
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, t('dash.kpiPolicies')), h('div', { class: 'kpi-value', id: 'rep-count' }, F.num(tot.count))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, t('dash.kpiPremium')), h('div', { class: 'kpi-value', id: 'rep-premium', title: F.money(tot.premium) }, F.money0(tot.premium))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, t('dash.kpiCommission')), h('div', { class: 'kpi-value', id: 'rep-commission', title: F.money(tot.commission) }, F.money0(tot.commission))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, t('report.commRate')), h('div', { class: 'kpi-value' }, F.pct(tot.premium ? tot.commission / tot.premium : null))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, t('dash.kpiCustomers')), h('div', { class: 'kpi-value' }, F.num(tot.customerCount))));
      var node = h('div', { class: 'stack' }, filters, summary, monthly, h('div', { class: 'grid-2' }, newRen, payCard), h('div', { class: 'grid-2' }, companyCard, catCard),
        h('div', { class: 'grid-2' }, profCard, topCard), retCard, oppCard);
      if (App.viewState.reportsFocus) {
        var focus = App.viewState.reportsFocus;
        App.viewState.reportsFocus = null;
        setTimeout(function () { var el = document.getElementById('rep-' + focus); if (el) el.scrollIntoView({ block: 'start' }); }, 50);
      }
      return node;
    }
  };

  function exportReport(vs, list) {
    var d = Store.derived();
    var tot = Portfolio.totals(list);
    function aggCols(labelHead, labelFn) {
      return [
        { label: labelHead, value: labelFn },
        { label: t('dash.metric.count'), type: 'int', value: function (r) { return r.count; } },
        { label: t('field.newBusiness'), type: 'int', value: function (r) { return r.newCount; } },
        { label: t('dash.metric.premium'), type: 'money', value: function (r) { return r.premium; } },
        { label: t('dash.metric.commission'), type: 'money', value: function (r) { return r.commission; } },
        { label: t('report.commRate'), type: 'pct', value: function (r) { return r.premium ? r.commission / r.premium : ''; } },
        { label: t('report.share'), type: 'pct', value: function (r) { return tot.premium ? r.premium / tot.premium : ''; } },
        { label: t('field.card'), type: 'money', value: function (r) { return r.card; } },
        { label: t('field.cash'), type: 'money', value: function (r) { return r.cash; } },
        { label: t('field.account'), type: 'money', value: function (r) { return r.account; } }
      ];
    }
    var byMonth = Portfolio.aggregate(list, function (p) { return p.month; }, true);
    byMonth.push(Object.assign({}, tot, { key: 'total' }));
    var wb = Exporter.tableWorkbook(window.XLSX, [
      { name: t('reports.monthly'), columns: aggCols(t('common.month'), function (r) { return r.key === 'total' ? t('common.total') : U.monthLabel(r.key, lang()); }), rows: byMonth },
      { name: t('dash.byCompany'), columns: aggCols(t('field.company'), function (r) { return r.key === '—' ? t('common.unknown') : (d.companyNames.get(r.key) || r.key); }), rows: Portfolio.aggregate(list, function (p) { return p.company ? U.companyKey(p.company) : ''; }) },
      { name: t('dash.byCategory'), columns: aggCols(t('report.category'), function (r) { return Schema.categoryLabel(r.key, lang()); }), rows: Portfolio.aggregate(list, function (p) { return Schema.categoryOf(p.policyType); }) },
      { name: t('reports.topCustomers'), columns: aggCols(t('common.customer'), function (r) { var c = Store.customers.get(r.key); return c ? c.name : ''; }), rows: Portfolio.aggregate(list, function (p) { return p.customerId; }).slice(0, 100) }
    ]);
    save(wb, 'rapor-' + stamp() + '.xlsx');
  }
})();
