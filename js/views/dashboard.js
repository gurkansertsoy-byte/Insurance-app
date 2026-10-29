/* Dashboard */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Schema = window.Schema, Portfolio = window.Portfolio, Charts = window.Charts, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  function periodMonths(all, period) {
    if (period === 'all') return new Set(all);
    var cur = U.currentMonthKey();
    if (/^y\d{4}$/.test(period)) return new Set(all.filter(function (m) { return m.slice(0, 4) === period.slice(1); }));
    var n = Number(period);
    var from = U.addMonthsToKey(cur, -(n - 1));
    return new Set(all.filter(function (m) { return m >= from && m <= cur; }));
  }
  App.periodMonths = periodMonths;

  function periodOptions(months) {
    var years = Array.from(new Set(months.map(function (m) { return m.slice(0, 4); }))).sort().reverse();
    return [{ value: 'all', label: t('period.all') }, { value: '12', label: t('period.last', { n: 12 }) }, { value: '6', label: t('period.last', { n: 6 }) }, { value: '3', label: t('period.last', { n: 3 }) }]
      .concat(years.map(function (y) { return { value: 'y' + y, label: y }; }));
  }
  App.periodOptions = periodOptions;

  function welcome() {
    var fileInput = h('input', { type: 'file', accept: '.xlsx,.xls,.xlsm,.ods,.csv', hidden: true, id: 'welcome-file', onChange: function () {
      if (fileInput.files[0]) { App.pendingFile = fileInput.files[0]; App.go('ice-aktar'); }
    } });
    var drop = h('label', { class: 'dropzone', for: 'welcome-file', id: 'welcome-drop' },
      icon('file-spreadsheet'), h('strong', null, t('dash.dropTitle')), h('span', { class: 'muted' }, t('import.formats')));
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) { App.pendingFile = f; App.go('ice-aktar'); }
    });
    var features = [
      ['calendar-days', 'dash.f1'], ['refresh-cw', 'dash.f2'], ['wallet', 'dash.f3'], ['chart-column', 'dash.f4'], ['shield-check', 'dash.f5']
    ];
    return h('div', { class: 'stack' },
      h('section', { class: 'card welcome' },
        h('div', { class: 'welcome-main' },
          h('div', { class: 'eyebrow' }, t('dash.welcomeEyebrow')),
          h('h2', null, t('dash.welcomeTitle')),
          h('p', null, t('dash.welcomeText')),
          h('ol', { class: 'welcome-steps' }, h('li', null, t('dash.step1')), h('li', null, t('dash.step2')), h('li', null, t('dash.step3'))),
          drop, fileInput,
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn btn-primary', id: 'try-demo', onClick: function () { App.loadDemo(); } }, icon('sparkles'), t('dash.tryDemo')),
            h('a', { class: 'btn', href: '#yeni' }, icon('plus'), t('dash.addManually')))),
        h('div', { class: 'welcome-side' },
          h('div', { class: 'eyebrow' }, t('dash.whatYouGet')),
          features.map(function (f) {
            return h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap', gap: '12px' } },
              h('span', { class: 'avatar sm', style: { flex: 'none' } }, icon(f[0])),
              h('div', null, h('div', { style: { fontWeight: 600 } }, t(f[1] + '.t')), h('div', { class: 'small dim' }, t(f[1] + '.s'))));
          }))));
  }

  /** Opens the import screen with the bundled sample workbook already analysed. */
  App.loadDemo = function () {
    function go() {
      try {
        var bin = atob(window.SAMPLE_XLSX_BASE64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        App.pendingFile = { name: 'ornek-portfoy.xlsx', data: bytes, size: bytes.length };
        App.go('ice-aktar');
      } catch (e) { UI.toast(t('dash.demoFailed'), { type: 'bad' }); }
    }
    if (window.SAMPLE_XLSX_BASE64) { go(); return; }
    var s = document.createElement('script');
    s.src = 'js/sample-data.js';
    s.onload = go;
    s.onerror = function () { UI.toast(t('dash.demoFailed'), { type: 'bad' }); };
    document.head.appendChild(s);
  };

  function kpi(o) {
    var tag = o.href ? 'a' : 'div';
    return h(tag, { class: 'kpi', href: o.href ? '#' + o.href : null, id: o.id || null },
      h('div', { class: 'kpi-label' }, icon(o.icon), o.label),
      h('div', { class: 'kpi-value', title: o.title || null }, o.value),
      h('div', { class: 'kpi-sub' }, o.sub || ' '),
      o.spark || null);
  }

  App.views.dashboard = {
    title: function () { return t('nav.dashboard'); },
    sub: function () { return Store.policies.size ? t('dash.sub', { date: F.date(U.todayISO()) }) : ''; },
    render: function () {
      var d = Store.derived();
      if (!d.policies.length) return welcome();
      var vs = App.viewState.dashboard || (App.viewState.dashboard = { period: 'all', metric: 'premium' });
      var monthsSet = periodMonths(d.months, vs.period);
      var months = d.months.filter(function (m) { return monthsSet.has(m); });
      var list = d.policies.filter(function (p) { return monthsSet.has(p.month); });
      var tot = Portfolio.totals(list);
      var byMonth = Portfolio.aggregate(list, function (p) { return p.month; }, true);
      var monthMap = new Map(byMonth.map(function (r) { return [r.key, r]; }));
      var series = months.map(function (m) { return monthMap.get(m) || { key: m, premium: 0, commission: 0, count: 0, newCount: 0 }; });
      var multi = 0;
      var custIds = new Set(list.map(function (p) { return p.customerId; }));
      custIds.forEach(function (id) { if (Store.summary(id).months.length > 1) multi++; });
      var due = 0, expired = 0;
      d.renewal.forEach(function (i) { if (i.state === 'due') due++; else if (i.state === 'expired' && i.daysLeft >= -60) expired++; });
      var outstanding = 0, openCount = 0;
      d.policies.forEach(function (p) { var o = Portfolio.outstanding(p); if (o > 0) { outstanding += o; openCount++; } });

      var filters = h('div', { class: 'toolbar' },
        h('label', { class: 'muted small', for: 'dash-period' }, t('period.label')),
        UI.select('dash-period', periodOptions(d.months), vs.period, { onChange: function (e) { vs.period = e.target.value; App.refresh(); } }),
        h('span', { class: 'result-count' }, t('dash.periodInfo', { months: months.length, policies: F.num(tot.count) })));

      var kpis = h('section', { class: 'card kpis', 'aria-label': t('dash.kpis') },
        kpi({ id: 'kpi-premium', icon: 'banknote', label: t('dash.kpiPremium'), value: F.moneyC(tot.premium), title: F.money(tot.premium),
          sub: t('dash.avgMonth', { v: F.moneyC(months.length ? tot.premium / months.length : 0) }), spark: Charts.sparkline(series.map(function (s) { return s.premium; })) }),
        kpi({ id: 'kpi-commission', icon: 'badge-percent', label: t('dash.kpiCommission'), value: F.moneyC(tot.commission), title: F.money(tot.commission),
          sub: t('dash.ofPremium', { p: F.pct(tot.premium ? tot.commission / tot.premium : null) }), spark: Charts.sparkline(series.map(function (s) { return s.commission; })) }),
        kpi({ id: 'kpi-policies', icon: 'file-text', label: t('dash.kpiPolicies'), value: F.num(tot.count),
          sub: t('dash.newBiz', { n: F.num(tot.newCount), p: F.pct(tot.count ? tot.newCount / tot.count : null, 0) }), spark: Charts.sparkline(series.map(function (s) { return s.count; })) }),
        kpi({ id: 'kpi-customers', icon: 'users', label: t('dash.kpiCustomers'), value: F.num(custIds.size), href: 'musteriler',
          sub: t('dash.multiMonth', { n: F.num(multi) }) }),
        kpi({ id: 'kpi-due', icon: 'calendar-clock', label: t('dash.kpiDue', { n: Store.settings.renewalWindow }), value: F.num(due), href: 'yenilemeler',
          sub: expired ? h('span', null, UI.pill(t('dash.expiredN', { n: expired }), 'bad')) : t('dash.noneExpired') }),
        kpi({ id: 'kpi-outstanding', icon: 'wallet', label: t('dash.kpiOutstanding'), value: F.moneyC(outstanding), title: F.money(outstanding), href: 'tahsilat',
          sub: t('dash.openPolicies', { n: F.num(openCount) }) }));

      // monthly production
      var metric = vs.metric;
      var fmt = metric === 'count' ? function (v) { return F.num(v); } : function (v) { return F.moneyC(v); };
      var seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('dash.metric') }, ['premium', 'commission', 'count'].map(function (m) {
        return h('button', { type: 'button', 'aria-pressed': String(metric === m), onClick: function () { vs.metric = m; App.refresh(); } }, t('dash.metric.' + m));
      }));
      seg.style.height = '30px';
      var monthly = Charts.card({
        id: 'chart-monthly',
        title: t('dash.monthly'), sub: t('dash.monthlySub'),
        actions: seg,
        chart: function () {
          return Charts.columns({
            ariaLabel: t('dash.monthly'), height: 380,
            data: series.map(function (s) {
              return {
                key: s.key, label: F.month(s.key), short: F.month(s.key, true), value: s[metric],
                tip: [
                  { series: t('dash.metric.premium'), value: F.money0(s.premium), color: 'var(--chart-1)' },
                  { value: t('dash.tipCommission', { v: F.money0(s.commission) }), sub: true },
                  { value: t('dash.tipCount', { n: F.num(s.count), m: F.num(s.newCount) }), sub: true }
                ]
              };
            }),
            format: fmt, tickFormat: metric === 'count' ? function (v) { return F.num(v); } : function (v) { return U.fmtCompact(v, window.I18N.lang); },
            onClick: function (dd) { App.go('ay-' + dd.key); }
          });
        },
        table: function () {
          return Charts.miniTable([
            { label: t('common.month'), value: function (r) { return h('a', { href: '#ay-' + r.key }, F.month(r.key)); } },
            { label: t('dash.metric.count'), align: 'r', value: function (r) { return F.num(r.count); } },
            { label: t('field.newBusiness'), align: 'r', value: function (r) { return F.num(r.newCount); } },
            { label: t('dash.metric.premium'), align: 'r', value: function (r) { return F.money(r.premium); } },
            { label: t('dash.metric.commission'), align: 'r', value: function (r) { return F.money(r.commission); } }
          ], series, [t('common.total'), F.num(tot.count), F.num(tot.newCount), F.money(tot.premium), F.money(tot.commission)]);
        }
      });

      // renewals due soon
      var dueList = d.policies.filter(function (p) { var i = d.renewal.get(p.id); return i && i.state === 'due'; })
        .sort(function (a, b) { return U.cmp(a.endDate, b.endDate); });
      var renewCard = h('section', { class: 'card', id: 'card-due' },
        h('div', { class: 'card-head' }, h('h2', null, t('dash.upcoming')), h('span', { class: 'sub' }, t('dash.upcomingSub', { n: Store.settings.renewalWindow })),
          h('div', { class: 'actions' }, h('a', { class: 'btn btn-sm btn-ghost', href: '#yenilemeler' }, t('common.viewAll'), icon('arrow-right')))),
        h('div', { class: 'card-body flush', style: { marginTop: '10px' } },
          dueList.length ? h('div', { class: 'list' }, dueList.slice(0, 6).map(function (p) {
            var c = Store.customers.get(p.customerId);
            var info = d.renewal.get(p.id);
            return h('a', { class: 'list-item', href: '#musteri-' + p.customerId },
              h('div', { class: 'main' }, h('div', { class: 't' }, c ? c.name : '—'),
                h('div', { class: 's', title: Store.companyLabel(p.company) }, UI.items(p.policyType || '', p.plate ? UI.plate(p.plate) : Store.companyLabel(p.company)))),
              h('div', { style: { textAlign: 'right' } }, App.daysPill(info.daysLeft), h('div', { class: 'small muted' }, F.date(p.endDate))));
          })) : UI.empty({ icon: 'circle-check', title: t('dash.noDue'), text: t('dash.noDueText') })));

      // company and branch distribution
      var companies = Portfolio.aggregate(list, function (p) { return p.company ? U.companyKey(p.company) : ''; });
      var topCompanies = companies.slice(0, 7);
      var rest = companies.slice(7);
      var companyRows = topCompanies.map(function (r) { return { label: r.key === '—' ? t('common.unknown') : Store.companyLabel(d.companyNames.get(r.key) || r.key), value: r.premium, sub: F.pct(tot.premium ? r.premium / tot.premium : 0, 0), title: t('dash.companyTitle', { n: F.num(r.count) }) }; });
      if (rest.length) companyRows.push({ label: t('dash.otherN', { n: rest.length }), value: U.sum(rest, function (r) { return r.premium; }), sub: F.pct(tot.premium ? U.sum(rest, function (r) { return r.premium; }) / tot.premium : 0, 0), color: 'var(--chart-muted)' });
      var companyCard = Charts.card({
        id: 'chart-company', title: t('dash.byCompany'), sub: t('dash.byPremium'),
        chart: function () { return Charts.hbars({ data: companyRows, format: function (v) { return F.moneyC(v); } }); },
        table: function () {
          return Charts.miniTable([
            { label: t('field.company'), value: function (r) { return r.key === '—' ? t('common.unknown') : (d.companyNames.get(r.key) || r.key); } },
            { label: t('dash.metric.count'), align: 'r', value: function (r) { return F.num(r.count); } },
            { label: t('dash.metric.premium'), align: 'r', value: function (r) { return F.money(r.premium); } },
            { label: t('dash.metric.commission'), align: 'r', value: function (r) { return F.money(r.commission); } }
          ], companies);
        }
      });
      var cats = Portfolio.aggregate(list, function (p) { return Schema.categoryOf(p.policyType); });
      var catCard = Charts.card({
        id: 'chart-category', title: t('dash.byCategory'), sub: t('dash.byCount'),
        chart: function () {
          return Charts.hbars({ data: cats.slice().sort(function (a, b) { return b.count - a.count; }).map(function (r) {
            return { label: Schema.categoryLabel(r.key, window.I18N.lang), value: r.count, sub: F.moneyC(r.premium), onClick: function () { App.viewState.policies = Object.assign(App.viewState.policies || {}, { cat: r.key }); App.go('policeler'); } };
          }), format: function (v) { return F.num(v); } });
        },
        table: function () {
          return Charts.miniTable([
            { label: t('report.category'), value: function (r) { return Schema.categoryLabel(r.key, window.I18N.lang); } },
            { label: t('dash.metric.count'), align: 'r', value: function (r) { return F.num(r.count); } },
            { label: t('dash.metric.premium'), align: 'r', value: function (r) { return F.money(r.premium); } },
            { label: t('dash.metric.commission'), align: 'r', value: function (r) { return F.money(r.commission); } }
          ], cats);
        }
      });
      var payParts = [
        { label: t('field.card'), value: tot.card, color: 'var(--chart-1)' },
        { label: t('field.cash'), value: tot.cash, color: 'var(--chart-2)' },
        { label: t('field.account'), value: tot.account, color: 'var(--chart-3)' }
      ];
      var newRen = [
        { label: t('common.newBusiness'), value: tot.newCount, color: 'var(--chart-1)' },
        { label: t('common.renewal'), value: tot.count - tot.newCount, color: 'var(--chart-2)' }
      ];
      var payCard = h('section', { class: 'card', id: 'card-payments' },
        h('div', { class: 'card-head' }, h('h2', null, t('dash.payments'))),
        h('div', { class: 'card-body stack' },
          Charts.stackBar({ parts: payParts, format: function (v) { return F.moneyC(v); } }),
          h('hr', { class: 'divider' }),
          h('div', { class: 'eyebrow' }, t('dash.newVsRenewal')),
          Charts.stackBar({ parts: newRen, format: function (v) { return F.num(v); } })));

      // opportunities
      var opp = { kasko: 0, trafik: 0, konut: 0, dask: 0 };
      var oppCustomers = 0;
      Store.customers.forEach(function (c) {
        var o = Portfolio.opportunities(c, Store.policiesOf(c.id), d.today);
        if (o.length) oppCustomers++;
        o.forEach(function (x) { opp[x.type]++; });
      });
      var oppCard = h('section', { class: 'card', id: 'card-opps' },
        h('div', { class: 'card-head' }, h('h2', null, t('dash.opportunities')), h('span', { class: 'sub' }, t('dash.oppSub', { n: F.num(oppCustomers) })),
          h('div', { class: 'actions' }, h('a', { class: 'btn btn-sm btn-ghost', href: '#raporlar', onClick: function () { App.viewState.reportsFocus = 'opps'; } }, t('common.viewAll'), icon('arrow-right')))),
        h('div', { class: 'card-body flush', style: { marginTop: '8px' } }, h('div', { class: 'list' }, ['kasko', 'trafik', 'dask', 'konut'].map(function (k) {
          return h('div', { class: 'list-item' }, h('span', { class: 'avatar sm' }, icon(k === 'kasko' || k === 'trafik' ? 'car' : 'house')),
            h('div', { class: 'main' }, h('div', { class: 't' }, t('opp.' + k + '.title')), h('div', { class: 's' }, t('opp.' + k + '.why'))),
            h('strong', { class: 'num', style: { fontSize: '17px' } }, F.num(opp[k])));
        }))));

      // tasks for today
      var today = d.today;
      var tasks = Array.from(Store.tasks.values()).filter(function (x) { return !x.done && x.due && x.due <= today; }).sort(function (a, b) { return U.cmp(a.due, b.due); });
      var taskCard = h('section', { class: 'card', id: 'card-tasks' },
        h('div', { class: 'card-head' }, h('h2', null, t('dash.tasks')), h('span', { class: 'sub' }, t('dash.tasksSub')),
          h('div', { class: 'actions' }, h('a', { class: 'btn btn-sm btn-ghost', href: '#gorevler' }, t('common.viewAll'), icon('arrow-right')))),
        h('div', { class: 'card-body flush', style: { marginTop: '8px' } },
          tasks.length ? h('div', { class: 'list' }, tasks.slice(0, 6).map(function (x) {
            var c = x.customerId ? Store.customers.get(x.customerId) : null;
            return h('div', { class: 'task-item' },
              h('input', { type: 'checkbox', 'aria-label': t('tasks.markDone'), onChange: function () { Store.toggleTask(x.id, true); UI.toast(t('tasks.doneToast')); } }),
              h('div', { class: 'main', style: { flex: 1, minWidth: 0 } }, h('div', { class: 't', style: { fontWeight: 600 } }, x.title),
                c ? h('a', { class: 'small', href: '#musteri-' + c.id }, c.name) : null),
              App.duePill(x.due));
          })) : UI.empty({ icon: 'list-checks', title: t('dash.noTasks'), text: t('dash.noTasksText') })));

      return h('div', { class: 'stack' }, filters, kpis,
        h('div', { class: 'grid-3' }, h('div', { class: 'wide' }, monthly), renewCard),
        h('div', { class: 'grid-3' }, companyCard, catCard, payCard),
        h('div', { class: 'grid-2' }, oppCard, taskCard));
    }
  };

  // shared pills
  App.daysPill = function (days) {
    if (days == null) return null;
    if (days < 0) return UI.pill(t('days.ago', { n: -days }), 'bad');
    if (days === 0) return UI.pill(t('days.today'), 'bad');
    if (days <= 7) return UI.pill(t('days.left', { n: days }), 'serious');
    if (days <= 30) return UI.pill(t('days.left', { n: days }), 'warn');
    return UI.pill(t('days.left', { n: days }), 'plain');
  };

  App.duePill = function (due) {
    if (!due) return UI.pill(t('tasks.noDate'), 'plain');
    var d = U.diffDays(U.todayISO(), due);
    if (d < 0) return UI.pill(t('tasks.overdueBy', { n: -d }), 'bad');
    if (d === 0) return UI.pill(t('days.today'), 'warn');
    if (d === 1) return UI.pill(t('tasks.tomorrow'), 'info');
    return UI.pill(F.date(due), 'plain');
  };

  App.statePill = function (info, p) {
    if (!info) return null;
    switch (info.state) {
      case 'renewed': return UI.pill(info.successorId ? t('state.renewedAuto') : t('state.renewed'), 'good');
      case 'lost': return UI.pill(t('state.lost'), 'plain');
      case 'expired': return UI.pill(t('state.expired'), 'bad');
      case 'due': return App.daysPill(info.daysLeft);
      case 'active': return UI.pill(t('state.active'), 'accent');
      case 'short': return p && p.endDate && p.endDate < U.todayISO() ? UI.pill(t('state.ended'), 'plain') : UI.pill(t('state.active'), 'accent');
      default: return null;
    }
  };
})();
