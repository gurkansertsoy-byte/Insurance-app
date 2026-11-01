/* The same month in every year of the file: Ekim 2024, Ekim 2025, Ekim 2026 side by side (premium, commission,
   customers, policies), one small chart per measure since they have different scales. */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Portfolio = window.Portfolio, Charts = window.Charts, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  // ------------------------------------------------------------------ payment method: sales and refunds
  var PAY = [
    { key: 'card', label: 'field.card', color: 'var(--chart-1)' },
    { key: 'cash', label: 'field.cash', color: 'var(--chart-2)' },
    { key: 'account', label: 'field.account', color: 'var(--chart-3)' },
    { key: 'unknown', label: 'pay.unknown', color: 'var(--chart-muted)' }
  ];

  /**
   * Sales (premium) and refunds (cancellations) by Kart / Nakit / Cari, and what no column says: "Belli değil".
   * Rows: { key, label, color, n (policies), v (premium), xn (cancellations), xv (refunded), net }.
   */
  App.paymentSplit = function (policies, cancels) {
    var by = {};
    var rows = PAY.map(function (p) { var r = { key: p.key, label: t(p.label), color: p.color, n: 0, v: 0, xn: 0, xv: 0 }; by[p.key] = r; return r; });
    policies.forEach(function (p) {
      var paid = 0;
      ['card', 'cash', 'account'].forEach(function (k) { var v = p[k] || 0; if (v > 0) { by[k].n++; by[k].v += v; paid += v; } });
      var rest = U.round2((p.premium || 0) - paid);
      if (rest >= 1) { by.unknown.n++; by.unknown.v += rest; }
    });
    (cancels || []).forEach(function (x) {
      // an İptal row writes the refund under KART / CARİ / NAKİT; a cancelling row of the table often only has its
      // minus premium, and an İptal row with nothing under the three columns says nothing either: "Belli değil"
      var refund = Store.refundOf(x) || 0, given = 0;
      ['card', 'cash', 'account'].forEach(function (k) { var v = Math.abs(x[k] || 0); if (v > 0) { by[k].xn++; by[k].xv += v; given += v; } });
      var rest = U.round2(refund - given);
      if (rest >= 1 || !given) { by.unknown.xn++; by.unknown.xv += Math.max(0, rest); }
    });
    rows.forEach(function (r) { r.v = U.round2(r.v); r.xv = U.round2(r.xv); r.net = U.round2(r.v - r.xv); });
    // a policy paid two ways sits in two rows: the totals count each once
    rows.policies = policies.length;
    rows.cancels = (cancels || []).length;
    return rows;
  };

  /** Card body: a bar for sales, a bar for refunds, and the table (full) or nothing more (compact, dashboard). */
  App.paymentBlock = function (rows, o) {
    o = o || {};
    var fmt = o.compact ? function (v) { return F.moneyC(v); } : function (v) { return F.money0(v); };
    var sales = U.sum(rows, function (r) { return r.v; }), refunds = U.sum(rows, function (r) { return r.xv; });
    var known = U.sum(rows.filter(function (r) { return r.key !== 'unknown'; }), function (r) { return r.v; });
    var salesBar = h('div', { id: (o.id || 'pay') + '-sales' }, h('div', { class: 'eyebrow' }, t('pay.sales')),
      Charts.stackBar({ parts: rows.map(function (r) { return { label: r.label, value: r.v, color: r.color }; }), format: fmt }));
    var refundBar = h('div', { id: (o.id || 'pay') + '-refunds' }, h('div', { class: 'eyebrow' }, t('pay.refunds')),
      refunds > 0 || rows.some(function (r) { return r.xn; }) ? Charts.stackBar({ parts: rows.map(function (r) { return { label: r.label, value: r.xv, color: r.color }; }), format: fmt })
        : h('p', { class: 'small muted' }, t('pay.noRefunds')));
    // side by side on a wide card, one under the other on the dashboard
    var out = o.compact ? [salesBar, refundBar] : [h('div', { class: 'grid-2', style: { gap: '18px 28px' } }, salesBar, refundBar)];
    if (!o.compact) {
      out.push(Charts.miniTable([
        { label: t('collections.method'), value: function (r) { return h('span', { class: 'row tight' }, h('i', { class: 'legend-dot', style: { background: r.color } }), r.label); } },
        { label: t('reports.policiesUsing'), align: 'r', value: function (r) { return F.num(r.n); } },
        { label: t('pay.sales'), align: 'r', value: function (r) { return F.money(r.v); } },
        { label: t('report.share'), align: 'r', value: function (r) { return F.pct(sales ? r.v / sales : null); } },
        { label: t('pay.colCancels'), align: 'r', value: function (r) { return F.num(r.xn); } },
        { label: t('pay.colRefund'), align: 'r', value: function (r) { return F.money(r.xv); } },
        { label: t('pay.colNet'), align: 'r', value: function (r) { return h('strong', null, F.money(r.net)); } }
      ], rows, [t('common.total'), F.num(rows.policies || 0), F.money(sales), '', F.num(rows.cancels || 0), F.money(refunds), F.money(U.round2(sales - refunds))]));
    }
    // the monthly pages carry no Kart / Cari / Nakit: say why everything is "Belli değil"
    if (sales > 0 && !known) out.push(h('p', { class: 'small muted', id: (o.id || 'pay') + '-nocols' }, t('pay.noColumns')));
    if (!o.compact) out.push(h('p', { class: 'small muted' }, t('pay.note')));
    return out;
  };

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
