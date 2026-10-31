/* What YENİ İŞ says, month by month (yeni iş, yenileme, ek, zeyil, iptal, not known), and the İptaller page:
   questions about rows written again with plus amounts, every cancellation, EK / ZEYİL rows. */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Portfolio = window.Portfolio, Charts = window.Charts, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  // a fixed order is a fixed colour (palette slots 1-5); "not known" is a hollow dashed mark, told apart by shape
  var KINDS = [
    { key: 'new', color: 'var(--chart-1)' }, { key: 'renewal', color: 'var(--chart-2)' }, { key: 'ek', color: 'var(--chart-3)' },
    { key: 'zeyil', color: 'var(--chart-4)' }, { key: 'cancel', color: 'var(--chart-5)' }, { key: 'unknown', color: 'var(--chart-unknown)', hollow: true }
  ];
  App.KINDS = KINDS;

  /** The rows of each month counted by what their YENİ İŞ cell says. */
  App.kindCounts = function (rows, months) {
    var by = new Map();
    months.forEach(function (m) {
      var r = { key: m, total: 0, counts: {} };
      KINDS.forEach(function (k) { r.counts[k.key] = 0; });
      by.set(m, r);
    });
    rows.forEach(function (p) {
      var r = by.get(p.month);
      if (!r) return;
      r.counts[Portfolio.kindOf(p)]++;
      r.total++;
    });
    return months.map(function (m) { return by.get(m); });
  };

  /** Small multiples: one column chart per kind, each on its own scale, so a few EK or İPTAL rows a month are readable too. */
  function splitPanels(series, chartData, o) {
    return h('div', { class: 'kinds-split', id: (o.id || 'kinds') + '-panels' }, series.map(function (s, si) {
      var total = U.sum(chartData, function (d) { return d.values[si]; });
      return h('div', { class: 'kinds-panel', 'data-kind': s.key },
        h('div', { class: 'kinds-panel-head' }, h('i', { class: 'sw' + (s.hollow ? ' hollow' : ''), style: s.hollow ? null : { background: s.color } }),
          h('strong', null, s.label), h('span', { class: 'muted' }, t('kinds.rows', { n: F.num(total) }))),
        Charts.columns({
          ariaLabel: s.label, height: 150, padL: 34, tickCount: 2, integer: true, color: s.color, hollow: s.hollow,
          data: chartData.map(function (d) { return { key: d.key, label: d.label, short: d.short, value: d.values[si], tip: [{ series: s.label, value: F.num(d.values[si]), color: s.color, dashed: s.hollow }] }; }),
          format: function (v) { return F.num(v); }, tickFormat: function (v) { return F.num(v); },
          onClick: function (d) { App.go('ay-' + d.key); }
        }));
    }));
  }

  /** Card: stacked columns, one line per kind, or one small chart per kind, of YENİ İŞ per month, with its table.
      o: { id, rows, months, state, height } */
  App.kindsCard = function (o) {
    var vs = o.state;
    if (!vs.view) vs.view = 'bars';
    var data = App.kindCounts(o.rows, o.months);
    var block = new Map(o.months.map(function (m) { return [m, Store.cancellationsOf(m).filter(function (x) { return x.kind !== 'row'; }).length]; }));
    var blockTotal = U.sum(Array.from(block.values()));
    var series = KINDS.map(function (k) { return { key: k.key, label: t('kind.' + k.key), color: k.color, hollow: !!k.hollow, dashed: !!k.hollow }; });
    // one panel per kind names its kind in its own title: no legend there
    var legend = vs.view === 'split' ? null : h('div', { class: 'legend', style: { marginBottom: '10px' }, id: (o.id || 'kinds') + '-legend' }, series.map(function (s) {
      return h('span', null, h('i', { class: (vs.view === 'lines' ? 'line' : '') + (s.hollow ? ' hollow' : ''), style: s.hollow ? null : { background: s.color } }), s.label);
    }));
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('kinds.view') }, ['bars', 'lines', 'split'].map(function (v) {
      return h('button', { type: 'button', id: (o.id || 'kinds') + '-' + v, 'aria-pressed': String(vs.view === v), onClick: function () { vs.view = v; App.refresh(); } }, t('kinds.' + v));
    }));
    seg.style.height = '30px';
    var chartData = data.map(function (r) {
      return { key: r.key, label: F.month(r.key), short: F.month(r.key, true), values: KINDS.map(function (k) { return r.counts[k.key]; }), total: r.total };
    });
    return Charts.card({
      id: o.id, title: t('kinds.title'), sub: t('kinds.sub'), actions: seg, legend: legend,
      chart: function () {
        var args = {
          ariaLabel: t('kinds.title'), height: o.height || 300, data: chartData, series: series,
          format: function (v) { return F.num(v); }, tickFormat: function (v) { return F.num(v); },
          tipTitle: function (d) { return d.label + ' · ' + t('kinds.rows', { n: F.num(d.total) }); },
          onClick: function (d) { App.go('ay-' + d.key); }
        };
        var note = h('p', { class: 'chart-note' }, t('kinds.note') + (blockTotal ? ' ' + t('kinds.noteBlock', { n: F.num(blockTotal) }) : ''));
        if (vs.view === 'split') return h('div', null, splitPanels(series, chartData, o), note);
        return h('div', null, vs.view === 'lines' ? Charts.lines(args) : Charts.stackedColumns(args), note);
      },
      table: function () {
        var cols = [{ label: t('common.month'), value: function (r) { return h('a', { href: '#ay-' + r.key }, F.month(r.key)); } }]
          .concat(KINDS.map(function (k) { return { label: t('kind.' + k.key), align: 'r', value: function (r) { return F.num(r.counts[k.key]); } }; }))
          .concat([{ label: t('kinds.total'), align: 'r', value: function (r) { return F.num(r.total); } },
            { label: t('kinds.blockRows'), align: 'r', value: function (r) { return F.num(block.get(r.key) || 0); } }]);
        var foot = [t('common.total')].concat(KINDS.map(function (k) { return F.num(U.sum(data, function (r) { return r.counts[k.key]; })); }))
          .concat([F.num(U.sum(data, function (r) { return r.total; })), F.num(blockTotal)]);
        return Charts.miniTable(cols, data, foot);
      }
    });
  };

  // ------------------------------------------------------------------ the İptaller page
  App.views.cancels = {
    title: function () { return t('nav.cancels'); },
    sub: function () { return t('cancels.sub'); },
    render: function () {
      var d = Store.derived();
      var vs = App.viewState.cancels || (App.viewState.cancels = { filter: 'all' });
      var all = Store.allCancels().sort(function (a, b) {
        return U.cmp(b.month, a.month) || ((a.source && a.source.row) || 1e9) - ((b.source && b.source.row) || 1e9);
      });
      var rowsKind = all.filter(function (x) { return x.kind === 'row'; });
      var open = all.filter(function (x) { return !(x.policyId && Store.policies.get(x.policyId)) && !(x.kind !== 'row' && x.locked); });
      var filters = { all: all, block: all.filter(function (x) { return x.kind !== 'row'; }), row: rowsKind, open: open };
      var list = filters[vs.filter] || all;
      var endorse = [];
      d.repeats.forEach(function (info, id) {
        var q = Store.policies.get(id);
        if (q && Portfolio.repeatEffect(q, info) === 'endorse') endorse.push({ q: q, of: info.of && Store.policies.get(info.of) });
      });
      endorse.sort(function (a, b) { return U.cmp(b.q.month, a.q.month); });
      var refund = U.round2(U.sum(all, Store.refundOf)), reclaim = U.round2(U.sum(all, Store.reclaimOf));
      var asking = d.questions.length > 0;
      var kpis = h('section', { class: 'card kpis ' + (asking ? 'k4' : 'k3') },
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('ban'), t('cancels.kpiCount')), h('div', { class: 'kpi-value', id: 'cancels-count' }, F.num(all.length)),
          h('div', { class: 'kpi-sub' }, t('cancels.kpiCountSub', { b: F.num(filters.block.length), r: F.num(rowsKind.length) }))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('hand-coins'), t('cancels.kpiRefund')), h('div', { class: 'kpi-value', id: 'cancels-refund', title: F.money(refund) }, F.moneyC(refund)),
          h('div', { class: 'kpi-sub' }, t('cancels.kpiRefundSub'))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('badge-percent'), t('cancels.kpiReclaim')), h('div', { class: 'kpi-value', id: 'cancels-reclaim', title: F.money(reclaim) }, F.moneyC(reclaim)),
          h('div', { class: 'kpi-sub' }, t('cancels.kpiReclaimSub'))),
        asking ? h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('circle-help'), t('cancels.kpiQuestions')), h('div', { class: 'kpi-value', id: 'cancels-questions' }, F.num(d.questions.length)),
          h('div', { class: 'kpi-sub' }, t('cancels.kpiQuestionsSub'))) : null);
      // the questions, only while some are waiting: once every row is answered the section goes away
      var ask = asking ? h('section', { class: 'card', id: 'cancel-questions' },
        h('div', { class: 'card-head' }, h('h2', null, t('repeat.title')), h('span', { class: 'sub' }, t('repeat.sub'))),
        h('div', { class: 'card-body' }, App.repeatQuestions(d.questions.slice().sort(function (a, b) { return U.cmp(a.month, b.month); })))) : null;
      var chips = h('div', { class: 'actions' }, ['all', 'block', 'row', 'open'].map(function (k) {
        return h('button', { type: 'button', class: 'filter-chip', id: 'cancels-f-' + k, 'aria-pressed': String(vs.filter === k), onClick: function () { vs.filter = k; App.refresh(); } },
          t('cancels.f.' + k), h('span', { class: 'n' }, F.num(filters[k].length)));
      }));
      var table = h('section', { class: 'card', id: 'all-cancels', style: { overflow: 'hidden' } },
        h('div', { class: 'card-head' }, h('h2', null, t('cancels.allTitle')), h('span', { class: 'sub' }, t('cancels.allSub')), chips),
        h('div', { class: 'card-body flush', style: { marginTop: '10px' } }, list.length ? App.cancelTable(list, true) : UI.empty({ icon: 'ban', title: t('cancels.empty') })));
      var adds = h('section', { class: 'card', id: 'all-endorsements', style: { overflow: 'hidden' } },
        h('div', { class: 'card-head' }, h('h2', null, t('repeat.addTitle')), h('span', { class: 'sub' }, t('repeat.addSub'))),
        h('div', { class: 'card-body flush', style: { marginTop: '10px' } }, endorse.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data responsive' },
          h('thead', null, h('tr', null, [t('common.month'), t('field.policyType'), t('field.policyNo'), t('field.newBusiness'), t('field.premium'), t('field.commission'), t('repeat.addsTo')].map(function (x, i) { return h('th', { class: i === 4 || i === 5 ? 'r' : null }, x); }))),
          h('tbody', null, endorse.map(function (e) {
            var c = Store.customers.get(e.q.customerId);
            return h('tr', { id: 'add-' + e.q.id },
              h('td', null, h('a', { href: '#ay-' + e.q.month }, F.month(e.q.month, true))),
              h('td', null, e.q.policyType || '—', c ? h('div', { class: 'small' }, h('a', { href: '#musteri-' + c.id }, c.name)) : null),
              h('td', { class: 'mono small' }, e.q.policyNo || ''),
              h('td', null, e.q.businessText || t('kind.' + Portfolio.kindOf(e.q))),
              h('td', { class: 'r num' }, F.money(e.q.premium || 0)),
              h('td', { class: 'r num' }, App.commissionText(e.q) || ''),
              h('td', null, e.of ? h('span', null, F.month(e.of.month, true), ' · ', e.of.policyType || '') : '—'));
          })))) : h('div', { class: 'card-body' }, h('p', { class: 'muted small' }, t('repeat.noAdds')))));
      return h('div', { class: 'stack' }, kpis, ask, table, adds);
    }
  };
})();
