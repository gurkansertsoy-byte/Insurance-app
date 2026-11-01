/* The same month in every year of the file: Ekim 2024, Ekim 2025, Ekim 2026 side by side (premium, commission,
   customers, policies), one small chart per measure since they have different scales. */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Portfolio = window.Portfolio, Charts = window.Charts, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  var MEASURES = [
    { key: 'premium', label: 'dash.metric.premium', money: true },
    { key: 'commission', label: 'dash.metric.commission', money: true },
    { key: 'customers', label: 'compare.customers' },
    { key: 'count', label: 'compare.policies' }
  ];

  /** Every year's figures for month number mm ('01'…'12'), oldest first. */
  App.sameMonthRows = function (mm) {
    var d = Store.derived();
    return d.months.filter(function (k) { return k.slice(5) === mm; }).map(function (k) {
      var list = d.policies.filter(function (p) { return p.month === k; });
      var tot = Portfolio.totals(list);
      return { key: k, year: k.slice(0, 4), premium: tot.premium, commission: tot.commission, customers: tot.customerCount, count: tot.count, newCount: tot.newCount };
    });
  };

  function change(rows, key) {
    if (rows.length < 2) return null;
    var a = rows[rows.length - 2][key], b = rows[rows.length - 1][key];
    return a ? (b - a) / a : null;
  }
  function deltaTag(x) {
    if (x == null) return null;
    return h('span', { class: x >= 0 ? 'delta-up' : 'delta-down' }, (x >= 0 ? '▲ ' : '▼ ') + F.pct(Math.abs(x), 0));
  }

  /**
   * Card: o = { id, month ('01'…'12'), selectable (a month list in the card), current ('YYYY-MM', drawn darker), state }
   */
  App.sameMonthCard = function (o) {
    var d = Store.derived();
    var vs = o.state || {};
    var have = Array.from(new Set(d.months.map(function (k) { return k.slice(5); }))).sort();
    var mm = (o.selectable && vs.month) || o.month || (d.months.length ? d.months[d.months.length - 1].slice(5) : U.currentMonthKey().slice(5));
    if (have.indexOf(mm) < 0 && have.length) mm = have[have.length - 1];
    var rows = App.sameMonthRows(mm);
    var monthName = F.month('2000-' + mm).replace(/\s*2000$/, '');
    var sel = o.selectable ? UI.select((o.id || 'same') + '-month', have.map(function (m) {
      var n = d.months.filter(function (k) { return k.slice(5) === m; }).length;
      return { value: m, label: F.month('2000-' + m).replace(/\s*2000$/, '') + ' (' + t('compare.years', { n: n }) + ')' };
    }), mm, { onChange: function (e) { vs.month = e.target.value; App.refresh(); }, 'aria-label': t('compare.pickMonth') }) : null;
    return Charts.card({
      id: o.id, title: t('compare.title', { m: monthName }), sub: rows.length > 1 ? t('compare.sub', { years: rows.map(function (r) { return r.year; }).join(', ') }) : t('compare.oneYear'),
      actions: sel,
      chart: function () {
        var panels = h('div', { class: 'same-month', id: (o.id || 'same') + '-panels' }, MEASURES.map(function (m) {
          var last = rows[rows.length - 1];
          var fmt = m.money ? function (v) { return F.moneyC(v); } : function (v) { return F.num(v); };
          return h('div', { class: 'same-panel', 'data-measure': m.key },
            h('div', { class: 'same-head' }, h('span', { class: 'muted' }, t(m.label)),
              h('strong', { class: 'num' }, last ? fmt(last[m.key]) : '—'), deltaTag(change(rows, m.key))),
            Charts.columns({
              ariaLabel: t(m.label) + ' · ' + monthName, height: 170, padL: m.money ? 52 : 34, tickCount: 3, integer: !m.money, labelAll: true,
              data: rows.map(function (r) {
                return { key: r.key, label: F.month(r.key), short: r.year, value: r[m.key],
                  // this page's year darker, the other years lighter
                  color: o.current && r.key !== o.current ? 'var(--chart-1-soft)' : 'var(--chart-1)',
                  tip: [{ series: t(m.label), value: m.money ? F.money(r[m.key]) : F.num(r[m.key]), color: 'var(--chart-1)' }] };
              }),
              format: fmt, tickFormat: m.money ? function (v) { return U.fmtCompact(v, window.I18N.lang); } : function (v) { return F.num(v); },
              onClick: function (x) { App.go('ay-' + x.key); }
            }));
        }));
        return h('div', null, panels, rows.length < 2 ? h('p', { class: 'chart-note' }, t('compare.oneYearNote', { m: monthName })) : null);
      },
      table: function () {
        return Charts.miniTable([
          { label: t('common.month'), value: function (r) { return h('a', { href: '#ay-' + r.key }, F.month(r.key)); } },
          { label: t('dash.metric.premium'), align: 'r', value: function (r) { return F.money(r.premium); } },
          { label: t('dash.metric.commission'), align: 'r', value: function (r) { return F.money(r.commission); } },
          { label: t('compare.customers'), align: 'r', value: function (r) { return F.num(r.customers); } },
          { label: t('compare.policies'), align: 'r', value: function (r) { return F.num(r.count); } },
          { label: t('field.newBusiness'), align: 'r', value: function (r) { return F.num(r.newCount); } },
          { label: t('compare.change'), align: 'r', value: function (r) {
            var i = rows.indexOf(r);
            return i > 0 && rows[i - 1].premium ? deltaTag((r.premium - rows[i - 1].premium) / rows[i - 1].premium) : '—';
          } }
        ], rows);
      }
    });
  };
})();
