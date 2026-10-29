/* Renewals, collections (cari) and tasks */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Schema = window.Schema, Portfolio = window.Portfolio, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  var STATUSES = ['pending', 'contacted', 'quoted', 'renewed', 'lost'];
  var LOST_REASONS = ['price', 'competitor', 'sold', 'declined', 'other'];
  var BUCKETS = [
    { id: 'expired', test: function (i) { return i.state === 'expired' && i.daysLeft >= -90; } },
    { id: 'd7', test: function (i) { return isOpen(i) && i.daysLeft >= 0 && i.daysLeft <= 7; } },
    { id: 'd15', test: function (i) { return isOpen(i) && i.daysLeft >= 8 && i.daysLeft <= 15; } },
    { id: 'd30', test: function (i) { return isOpen(i) && i.daysLeft >= 16 && i.daysLeft <= 30; } },
    { id: 'd60', test: function (i) { return isOpen(i) && i.daysLeft >= 31 && i.daysLeft <= 60; } },
    { id: 'd90', test: function (i) { return isOpen(i) && i.daysLeft >= 61 && i.daysLeft <= 90; } },
    { id: 'renewed', test: function (i) { return i.state === 'renewed' && i.daysLeft != null && i.daysLeft >= -120 && i.daysLeft <= 90; } },
    { id: 'lost', test: function (i) { return i.state === 'lost'; } }
  ];
  function isOpen(i) { return i.state === 'due' || i.state === 'active' || i.state === 'expired'; }

  function statusSelect(p) {
    var cur = p.renewal && p.renewal.status ? p.renewal.status : 'pending';
    var sel = UI.select('st-' + p.id, STATUSES.map(function (s) { return { value: s, label: t('renewals.st.' + s) }; }), cur, {
      class: 'input', style: { height: '32px', width: 'auto', fontSize: '12.5px' }, 'aria-label': t('renewals.status'),
      onChange: function (e) {
        var v = e.target.value;
        if (v === 'lost') { App.lostDialog(p, function () { e.target.value = cur; }); return; }
        Store.setRenewalStatus(p.id, v);
        UI.toast(t('renewals.statusSaved', { s: t('renewals.st.' + v) }));
      }
    });
    return sel;
  }

  App.lostDialog = function (p, onCancel) {
    var reason = UI.select('lost-reason', LOST_REASONS.map(function (r) { return { value: r, label: t('renewals.lost.' + r) }; }), 'price', { class: 'input' });
    var note = h('textarea', { id: 'lost-note', class: 'input', rows: 2, style: { height: 'auto', padding: '8px 10px' } });
    var saved = false;
    var m = UI.modal({
      title: t('renewals.lostTitle'), size: 'narrow',
      body: [UI.field({ id: 'lost-reason', label: t('renewals.lostReason'), input: reason }), UI.field({ id: 'lost-note', label: t('renewals.note'), input: note })],
      foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.cancel')), h('button', { type: 'submit', class: 'btn btn-primary' }, t('common.save'))],
      onSubmit: function () {
        saved = true;
        Store.setRenewalStatus(p.id, 'lost', t('renewals.lost.' + reason.value) + (note.value.trim() ? ' – ' + note.value.trim() : ''));
        m.close();
        UI.toast(t('renewals.statusSaved', { s: t('renewals.st.lost') }));
      },
      onClose: function () { if (!saved && onCancel) onCancel(); }
    });
  };

  App.views.renewals = {
    title: function () { return t('nav.renewals'); },
    sub: function () { return t('renewals.sub'); },
    render: function () {
      var d = Store.derived();
      var vs = App.viewState.renewals = Object.assign({ bucket: 'd30all', q: '', sortKey: 'end', sortDir: 1 }, App.viewState.renewals || {});
      if (!d.policies.length) return h('section', { class: 'card' }, UI.empty({ icon: 'refresh-cw', title: t('renewals.emptyTitle'), text: t('renewals.emptyText') }));
      var all = d.policies.filter(function (p) { var i = d.renewal.get(p.id); return i && i.state !== 'none' && i.state !== 'short'; });
      var counts = {};
      BUCKETS.forEach(function (b) { counts[b.id] = all.filter(function (p) { return b.test(d.renewal.get(p.id)); }).length; });
      var win = Number(Store.settings.renewalWindow) || 30;
      counts.d30all = all.filter(function (p) { var i = d.renewal.get(p.id); return isOpen(i) && i.daysLeft >= 0 && i.daysLeft <= win; }).length;
      var bucketTest = vs.bucket === 'd30all'
        ? function (i) { return isOpen(i) && i.daysLeft >= 0 && i.daysLeft <= win; }
        : (BUCKETS.filter(function (b) { return b.id === vs.bucket; })[0] || BUCKETS[0]).test;
      function filterRows() {
        var q = U.fold(vs.q);
        return all.filter(function (p) {
          if (!bucketTest(d.renewal.get(p.id))) return false;
          if (q.length >= 2) {
            var c = Store.customers.get(p.customerId);
            var hay = U.fold([c && c.name, p.policyType, p.company, p.plate, p.policyNo].join(' '));
            if (!q.split(' ').every(function (tk) { return hay.indexOf(tk) >= 0; })) return false;
          }
          return true;
        });
      }
      var rows = filterRows();
      var last12from = U.addMonths(d.today, -12);
      var ret = Portfolio.retention(all, d.renewal, last12from, d.today, d.today);
      var chips = h('div', { class: 'toolbar', id: 'renewal-buckets' },
        [{ id: 'd30all', label: t('renewals.b.window', { n: win }) }].concat(BUCKETS.map(function (b) { return { id: b.id, label: t('renewals.b.' + b.id) }; })).map(function (b) {
          return h('button', { type: 'button', class: 'filter-chip', id: 'bucket-' + b.id, 'aria-pressed': String(vs.bucket === b.id), onClick: function () { vs.bucket = b.id; App.refresh(); } },
            b.label, h('span', { class: 'n' }, F.num(counts[b.id] || 0)));
        }));
      var summary = h('section', { class: 'card kpis', style: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' } },
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('calendar-clock'), t('renewals.kpiDue', { n: win })), h('div', { class: 'kpi-value', id: 'renewals-due' }, F.num(counts.d30all)),
          h('div', { class: 'kpi-sub' }, t('renewals.kpiDueSub', { p: F.moneyC(U.sum(all.filter(function (p) { var i = d.renewal.get(p.id); return isOpen(i) && i.daysLeft >= 0 && i.daysLeft <= win; }), function (p) { return p.premium; })) }))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('triangle-alert'), t('renewals.b.expired')), h('div', { class: 'kpi-value' }, F.num(counts.expired)), h('div', { class: 'kpi-sub' }, t('renewals.kpiExpiredSub'))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('refresh-cw'), t('renewals.kpiRetention')), h('div', { class: 'kpi-value', id: 'renewals-retention' }, ret.rate == null ? '–' : F.pct(ret.rate, 0)),
          h('div', { class: 'kpi-sub' }, t('renewals.kpiRetentionSub', { r: F.num(ret.renewed), n: F.num(ret.base) }))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('circle-x'), t('renewals.b.lost')), h('div', { class: 'kpi-value' }, F.num(counts.lost)), h('div', { class: 'kpi-sub' }, t('renewals.kpiLostSub'))));

      var table = new UI.TableView({
        rows: rows, pageSize: Number(Store.settings.pageSize) || 50, sortKey: vs.sortKey, sortDir: vs.sortDir,
        onSort: function (k, dir) { vs.sortKey = k; vs.sortDir = dir; },
        empty: UI.empty({ icon: 'circle-check', title: t('renewals.none'), text: t('renewals.noneText') }),
        columns: [
          { key: 'end', label: t('renewals.colDays'), sort: function (p) { return p.endDate; }, render: function (p) {
            var i = d.renewal.get(p.id);
            return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' } }, i.state === 'renewed' || i.state === 'lost' ? App.statePill(i, p) : App.daysPill(i.daysLeft), h('span', { class: 'small muted num' }, F.date(p.endDate)));
          } },
          { key: 'customer', label: t('common.customer'), cls: 'name-cell', sort: function (p) { var c = Store.customers.get(p.customerId); return c ? c.name : ''; }, render: function (p) {
            var c = Store.customers.get(p.customerId);
            return h('div', null, h('a', { href: '#musteri-' + p.customerId, style: { color: 'inherit' } }, c ? c.name : '—'), h('span', { class: 'sub' }, App.phoneLinks(c && c.phone, c ? App.waMessage(p, c) : '')));
          } },
          { key: 'policy', label: t('field.policyType'), sort: function (p) { return p.policyType; }, render: function (p) {
            return h('div', null, h('div', null, p.policyType || '—'), h('div', { class: 'small muted' }, Store.companyLabel(p.company)));
          } },
          { key: 'plate', label: t('field.plate'), render: function (p) { return p.plate ? UI.plate(p.plate) : h('span', { class: 'muted' }, '—'); } },
          { key: 'premium', label: t('renewals.colPremium'), align: 'r', sort: function (p) { return p.premium; }, render: function (p) { return p.premium != null ? F.money(p.premium) : '—'; } },
          { key: 'status', label: t('renewals.status'), render: function (p) {
            var i = d.renewal.get(p.id);
            if (i.state === 'renewed' && i.successorId) {
              var s = Store.policies.get(i.successorId);
              return h('div', { class: 'small' }, UI.pill(t('state.renewedAuto'), 'good'), s ? h('div', { class: 'muted', style: { marginTop: '3px' } }, t('renewals.newPolicy', { m: F.month(s.month, true), v: s.premium != null ? F.money(s.premium) : '' })) : null);
            }
            return h('div', null, statusSelect(p), p.renewal && p.renewal.note ? h('div', { class: 'small muted ellipsis', style: { marginTop: '3px', maxWidth: '220px' } }, p.renewal.note) : null);
          } },
          { key: 'act', label: '', cls: 'actions-cell', render: function (p) {
            var c = Store.customers.get(p.customerId);
            var i = d.renewal.get(p.id);
            var wa = c && c.phone ? U.whatsappUrl(c.phone, App.waMessage(p, c)) : '';
            return h('div', { class: 'row tight', style: { flexWrap: 'nowrap', justifyContent: 'flex-end' } },
              wa ? h('a', { class: 'btn btn-sm', href: wa, target: '_blank', rel: 'noopener', title: t('renewals.waTitle'), onClick: function () {
                if (!p.renewal || p.renewal.status === 'pending' || !p.renewal.status) Store.setRenewalStatus(p.id, 'contacted');
              } }, icon('message-circle'), 'WhatsApp') : null,
              h('button', { type: 'button', class: 'icon-btn sm', title: t('renewals.copyMsg'), 'aria-label': t('renewals.copyMsg'), onClick: function () { UI.copyText(App.waMessage(p, c)).then(function () { UI.toast(t('renewals.msgCopied')); }); } }, icon('copy')),
              h('button', { type: 'button', class: 'icon-btn sm', title: t('renewals.makeTask'), 'aria-label': t('renewals.makeTask'), onClick: function () {
                App.editTask({ customerId: p.customerId, policyId: p.id, title: t('renewals.taskTitle', { type: p.policyType || '', plate: p.plate || '' }).trim(), due: U.addDays(p.endDate, -7) < d.today ? d.today : U.addDays(p.endDate, -7) });
              } }, icon('list-checks')),
              i.state !== 'renewed' ? h('a', { class: 'btn btn-sm btn-primary', href: '#yenile-' + p.id, id: 'renew-' + p.id }, icon('refresh-cw'), t('renewals.renew')) : null);
          } }
        ]
      });
      var countEl = h('span', { class: 'result-count', id: 'renewals-count' }, t('renewals.count', { n: F.num(rows.length) }));
      var toolbar = h('div', { class: 'toolbar' },
        h('div', { class: 'search-local' }, icon('search'), h('input', { type: 'search', id: 'renewals-q', value: vs.q, placeholder: t('renewals.searchPh'), 'aria-label': t('renewals.searchPh'), autocomplete: 'off', onInput: U.debounce(function (e) {
          vs.q = e.target.value;
          rows = filterRows();
          table.setRows(rows);
          countEl.textContent = t('renewals.count', { n: F.num(rows.length) });
        }, 120) })),
        countEl,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'renewals-export', onClick: function () { App.exportRenewals(rows); } }, icon('file-down'), t('common.exportExcel')));
      return h('div', { class: 'stack' }, summary, chips, toolbar, h('section', { class: 'card', style: { overflow: 'hidden' } }, table.el),
        h('p', { class: 'small muted' }, t('renewals.how')));
    }
  };

  // ------------------------------------------------------------------ collections
  App.paymentDialog = function (p) {
    var rem = Portfolio.outstanding(p);
    var c = Store.customers.get(p.customerId);
    var amount = h('input', { id: 'pay-amount', class: 'num', inputmode: 'decimal', value: U.fmtNumber(rem > 0 ? rem : 0, window.I18N.lang, 2), autocomplete: 'off', style: { textAlign: 'right' } });
    var date = h('input', { id: 'pay-date', type: 'date', value: U.todayISO() });
    var method = UI.select('pay-method', ['cash', 'card', 'transfer'].map(function (x) { return { value: x, label: t('pay.' + x) }; }), 'cash');
    var note = h('input', { id: 'pay-note', autocomplete: 'off' });
    var err = h('div', { class: 'hint' });
    var m = UI.modal({
      title: t('collections.payTitle'), icon: 'hand-coins', size: 'narrow',
      body: [
        h('div', { class: 'callout' }, icon('info'), h('div', null, h('strong', null, c ? c.name : ''), h('div', { class: 'small' }, (p.policyType || '') + ' · ' + F.month(p.month) + ' · ' + t('collections.dueLine', { due: F.money(p.account), paid: F.money(Portfolio.paidOnAccount(p)) })))),
        h('div', { class: 'form-grid' },
          h('div', { class: 'span-6' }, UI.field({ id: 'pay-amount', label: t('common.amount'), input: h('div', { class: 'input-affix left' }, amount, h('span', { class: 'affix' }, '₺')), hint: err })),
          h('div', { class: 'span-6' }, UI.field({ id: 'pay-date', label: t('common.date'), input: date })),
          h('div', { class: 'span-6' }, UI.field({ id: 'pay-method', label: t('collections.method'), input: method })),
          h('div', { class: 'span-6' }, UI.field({ id: 'pay-note', label: t('common.notes'), input: note })))
      ],
      foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.cancel')), h('button', { type: 'submit', class: 'btn btn-primary', id: 'pay-save' }, icon('save'), t('collections.save'))],
      onSubmit: function () {
        var v = U.parseNumber(amount.value);
        if (!(v > 0)) { err.className = 'hint bad'; err.textContent = t('collections.errAmount'); amount.focus(); return; }
        Store.addPayment(p.id, { amount: v, date: date.value || U.todayISO(), method: method.value, note: note.value });
        m.close();
        UI.toast(t('collections.saved', { v: F.money(v) }));
      }
    });
  };

  App.views.collections = {
    title: function () { return t('nav.collections'); },
    sub: function () { return t('collections.sub'); },
    render: function () {
      var d = Store.derived();
      var vs = App.viewState.collections = Object.assign({ filter: 'open', q: '' }, App.viewState.collections || {});
      var withAcc = d.policies.filter(function (p) { return p.account > 0; });
      if (!withAcc.length) return h('section', { class: 'card' }, UI.empty({ icon: 'wallet', title: t('collections.emptyTitle'), text: t('collections.emptyText') }));
      var open = withAcc.filter(function (p) { return Portfolio.outstanding(p) > 0; });
      var total = U.sum(open, Portfolio.outstanding);
      var month = U.currentMonthKey();
      var payments = [];
      withAcc.forEach(function (p) { (p.payments || []).forEach(function (y) { payments.push({ p: p, y: y }); }); });
      payments.sort(function (a, b) { return U.cmp(b.y.date, a.y.date); });
      var thisMonth = U.sum(payments.filter(function (x) { return x.y.date && x.y.date.slice(0, 7) === month; }), function (x) { return x.y.amount; });
      var oldest = open.slice().sort(function (a, b) { return U.cmp(a.month, b.month); })[0];
      var rows = (vs.filter === 'open' ? open : vs.filter === 'paid' ? withAcc.filter(function (p) { return Portfolio.outstanding(p) <= 0; }) : withAcc);
      var q = U.fold(vs.q);
      if (q.length >= 2) rows = rows.filter(function (p) { var c = Store.customers.get(p.customerId); return U.fold([c && c.name, p.policyType, p.policyNo].join(' ')).indexOf(q) >= 0; });
      var kpis = h('section', { class: 'card kpis', style: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' } },
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('wallet'), t('collections.kpiOpen')), h('div', { class: 'kpi-value', id: 'collections-total' }, F.money(total)), h('div', { class: 'kpi-sub' }, t('collections.kpiOpenSub', { n: F.num(open.length) }))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('hand-coins'), t('collections.kpiMonth')), h('div', { class: 'kpi-value' }, F.money(thisMonth)), h('div', { class: 'kpi-sub' }, F.month(month))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('receipt'), t('collections.kpiAll')), h('div', { class: 'kpi-value' }, F.money(U.sum(withAcc, function (p) { return p.account; }))), h('div', { class: 'kpi-sub' }, t('collections.kpiAllSub', { n: F.num(withAcc.length) }))),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, icon('clock'), t('collections.kpiOldest')), h('div', { class: 'kpi-value' }, oldest ? F.month(oldest.month) : '–'), h('div', { class: 'kpi-sub' }, oldest ? (Store.customers.get(oldest.customerId) || {}).name : ' ')));
      var table = new UI.TableView({
        rows: rows, pageSize: Number(Store.settings.pageSize) || 50, sortKey: 'remaining', sortDir: -1,
        empty: UI.empty({ icon: 'circle-check', title: t('collections.none') }),
        columns: [
          { key: 'customer', label: t('common.customer'), cls: 'name-cell', sort: function (p) { var c = Store.customers.get(p.customerId); return c ? c.name : ''; }, render: function (p) {
            var c = Store.customers.get(p.customerId);
            return h('div', null, h('a', { href: '#musteri-' + p.customerId, style: { color: 'inherit' } }, c ? c.name : '—'), h('span', { class: 'sub' }, App.phoneLinks(c && c.phone)));
          } },
          { key: 'policy', label: t('field.policyType'), render: function (p) { return h('div', null, h('div', null, p.policyType || '—'), h('div', { class: 'small muted mono' }, p.policyNo || '')); } },
          { key: 'month', label: t('common.month'), sort: true, render: function (p) { return F.month(p.month, true); } },
          { key: 'due', label: t('field.account'), align: 'r', sort: function (p) { return p.account; }, render: function (p) { return F.money(p.account); } },
          { key: 'paid', label: t('collections.paidCol'), align: 'r', sort: function (p) { return Portfolio.paidOnAccount(p); }, render: function (p) { return F.money(Portfolio.paidOnAccount(p)); } },
          { key: 'remaining', label: t('collections.remaining'), align: 'r', sort: function (p) { return Portfolio.outstanding(p); }, render: function (p) {
            var r = Portfolio.outstanding(p);
            return r > 0 ? h('strong', { style: { color: 'var(--warn-ink)' } }, F.money(r)) : UI.pill(t('collections.paid'), 'good');
          } },
          { key: 'last', label: t('collections.lastPayment'), sort: function (p) { var ys = p.payments || []; return ys.length ? ys[ys.length - 1].date : ''; }, render: function (p) {
            var ys = p.payments || [];
            return ys.length ? F.date(ys[ys.length - 1].date) : h('span', { class: 'muted' }, '—');
          } },
          { key: 'act', label: '', cls: 'actions-cell', render: function (p) {
            return Portfolio.outstanding(p) > 0 ? h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'pay-' + p.id, onClick: function () { App.paymentDialog(p); } }, icon('hand-coins'), t('collections.take')) : null;
          } }
        ],
        footer: function (rs) {
          return [h('td', { colspan: 3, class: 'full' }, t('collections.footer', { n: F.num(rs.length) })),
            h('td', { class: 'r', 'data-label': t('field.account') }, F.money(U.sum(rs, function (p) { return p.account; }))),
            h('td', { class: 'r', 'data-label': t('collections.paidCol') }, F.money(U.sum(rs, Portfolio.paidOnAccount))),
            h('td', { class: 'r', 'data-label': t('collections.remaining') }, F.money(U.sum(rs, Portfolio.outstanding))), h('td', { colspan: 2 })];
        }
      });
      var toolbar = h('div', { class: 'toolbar' },
        ['open', 'paid', 'all'].map(function (f) {
          return h('button', { type: 'button', class: 'filter-chip', id: 'coll-' + f, 'aria-pressed': String(vs.filter === f), onClick: function () { vs.filter = f; App.refresh(); } }, t('collections.f.' + f));
        }),
        h('div', { class: 'search-local' }, icon('search'), h('input', { type: 'search', id: 'collections-q', value: vs.q, placeholder: t('collections.searchPh'), 'aria-label': t('collections.searchPh'), autocomplete: 'off', onChange: function (e) { vs.q = e.target.value; App.refresh(); } })));
      var history = h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, t('collections.history')), h('span', { class: 'sub' }, t('collections.historySub', { n: F.num(payments.length) }))),
        h('div', { class: 'card-body flush', style: { marginTop: '8px' } }, payments.length ? h('div', { class: 'list' }, payments.slice(0, 30).map(function (x) {
          var c = Store.customers.get(x.p.customerId);
          return h('div', { class: 'list-item' }, h('span', { class: 'avatar sm' }, icon('hand-coins')),
            h('div', { class: 'main' }, h('div', { class: 't' }, c ? c.name : '—'), h('div', { class: 's' }, UI.items(F.date(x.y.date), t('pay.' + x.y.method), x.p.policyType, x.y.note || null))),
            h('strong', { class: 'num' }, F.money(x.y.amount)),
            h('button', { type: 'button', class: 'icon-btn sm', title: t('collections.removePayment'), 'aria-label': t('collections.removePayment'), onClick: function () {
              UI.confirm({ title: t('collections.removePayment'), message: t('collections.removeMsg', { v: F.money(x.y.amount) }), danger: true, confirm: t('common.delete') }).then(function (ok) { if (ok) Store.removePayment(x.p.id, x.y.id); });
            } }, icon('x')));
        })) : h('p', { class: 'muted', style: { padding: '0 18px 18px' } }, t('collections.noPayments'))));
      return h('div', { class: 'stack' }, kpis, toolbar, h('section', { class: 'card', style: { overflow: 'hidden' } }, table.el), history,
        h('p', { class: 'small muted' }, t('collections.how')));
    }
  };

  // ------------------------------------------------------------------ tasks
  App.editTask = function (init) {
    init = init || {};
    var existing = init.id ? Store.tasks.get(init.id) : null;
    var v = Object.assign({ title: '', due: U.addDays(U.todayISO(), 1), customerId: '', note: '' }, existing || {}, init);
    var title = h('input', { id: 'task-title', value: v.title, autocomplete: 'off', placeholder: t('tasks.titlePh') });
    var due = h('input', { id: 'task-due', type: 'date', value: v.due || '' });
    var note = h('textarea', { id: 'task-note', rows: 2 }, v.note || '');
    var custId = v.customerId || '';
    var custInput = h('input', { id: 'task-customer', autocomplete: 'off', placeholder: t('form.searchCustomer'), value: custId && Store.customers.get(custId) ? Store.customers.get(custId).name : '' });
    var sug = h('div', { class: 'suggest', hidden: true });
    custInput.addEventListener('input', function () {
      custId = '';
      UI.clear(sug);
      var r = Store.search(custInput.value, 6).customers;
      if (!r.length) { sug.hidden = true; return; }
      r.forEach(function (x) {
        sug.appendChild(h('button', { type: 'button', onMousedown: function (e) { e.preventDefault(); custId = x.c.id; custInput.value = x.c.name; sug.hidden = true; } }, h('span', { class: 'avatar sm' }, UI.initials(x.c.name)), x.c.name));
      });
      sug.hidden = false;
    });
    custInput.addEventListener('blur', function () { setTimeout(function () { sug.hidden = true; }, 150); });
    var err = h('div', { class: 'hint' });
    var m = UI.modal({
      title: existing ? t('tasks.editTitle') : t('tasks.newTitle'), icon: 'list-checks', size: 'narrow',
      body: [UI.field({ id: 'task-title', label: t('tasks.what'), req: true, input: title, hint: err }),
        h('div', { class: 'form-grid' }, h('div', { class: 'span-6' }, UI.field({ id: 'task-due', label: t('tasks.due'), input: due })),
          h('div', { class: 'span-6' }, UI.field({ id: 'task-customer', label: t('common.customer'), input: h('div', { style: { position: 'relative' } }, custInput, sug) }))),
        UI.field({ id: 'task-note', label: t('common.notes'), input: note })],
      foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.cancel')), h('button', { type: 'submit', class: 'btn btn-primary', id: 'task-save' }, icon('save'), t('common.save'))],
      onSubmit: function () {
        if (!U.collapse(title.value)) { err.className = 'hint bad'; err.textContent = t('tasks.errTitle'); title.focus(); return; }
        Store.saveTask({ id: existing ? existing.id : null, title: U.collapse(title.value), due: due.value, customerId: custId || (custInput.value ? v.customerId : ''), policyId: v.policyId || '', note: note.value.trim() });
        m.close();
        UI.toast(t('tasks.saved'));
      }
    });
  };

  App.views.tasks = {
    title: function () { return t('nav.tasks'); },
    sub: function () { return t('tasks.sub'); },
    render: function () {
      var vs = App.viewState.tasks = Object.assign({ tab: 'today' }, App.viewState.tasks || {});
      var today = U.todayISO();
      var all = Array.from(Store.tasks.values());
      var groups = {
        overdue: all.filter(function (x) { return !x.done && x.due && x.due < today; }),
        today: all.filter(function (x) { return !x.done && x.due === today; }),
        upcoming: all.filter(function (x) { return !x.done && x.due && x.due > today; }),
        nodate: all.filter(function (x) { return !x.done && !x.due; }),
        done: all.filter(function (x) { return x.done; })
      };
      Object.keys(groups).forEach(function (k) { groups[k].sort(function (a, b) { return k === 'done' ? (b.doneAt || 0) - (a.doneAt || 0) : U.cmp(a.due, b.due) || (a.createdAt - b.createdAt); }); });
      if (vs.tab === 'today' && !groups.today.length && groups.overdue.length) vs.tab = 'overdue';
      var quickTitle = h('input', { id: 'quick-task', class: 'input', placeholder: t('tasks.quickPh'), 'aria-label': t('tasks.what'), autocomplete: 'off', style: { flex: '1 1 260px', width: 'auto' } });
      var quickDue = h('input', { id: 'quick-due', class: 'input', type: 'date', value: today, 'aria-label': t('tasks.due'), style: { width: 'auto' } });
      var quick = h('form', { class: 'card', onSubmit: function (e) {
        e.preventDefault();
        if (!U.collapse(quickTitle.value)) { quickTitle.focus(); return; }
        Store.saveTask({ title: U.collapse(quickTitle.value), due: quickDue.value });
        UI.toast(t('tasks.saved'));
      } }, h('div', { class: 'card-body row' }, icon('plus'), quickTitle, quickDue,
        h('button', { type: 'submit', class: 'btn btn-primary', id: 'quick-add' }, t('common.add')),
        h('button', { type: 'button', class: 'btn', onClick: function () { App.editTask({}); } }, t('tasks.detailed'))));
      var tabs = h('div', { class: 'tabs', role: 'tablist' }, ['overdue', 'today', 'upcoming', 'nodate', 'done'].map(function (k) {
        return h('button', { type: 'button', role: 'tab', id: 'ttab-' + k, 'aria-selected': String(vs.tab === k), onClick: function () { vs.tab = k; App.refresh(); } }, t('tasks.tab.' + k), h('span', { class: 'count' }, F.num(groups[k].length)));
      }));
      var list = groups[vs.tab] || [];
      var body = list.length ? h('div', { class: 'list' }, list.map(function (x) {
        var c = x.customerId ? Store.customers.get(x.customerId) : null;
        return h('div', { class: 'task-item' + (x.done ? ' done' : ''), id: 'task-' + x.id },
          h('input', { type: 'checkbox', checked: x.done, 'aria-label': t('tasks.markDone'), onChange: function (e) { Store.toggleTask(x.id, e.target.checked); if (e.target.checked) UI.toast(t('tasks.doneToast')); } }),
          h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 't', style: { fontWeight: 600 } }, x.title),
            h('div', { class: 'small muted row tight' }, c ? h('a', { href: '#musteri-' + c.id }, icon('user'), ' ', c.name) : null, x.note ? h('span', null, x.note) : null)),
          x.done ? h('span', { class: 'small muted' }, F.dateTime(x.doneAt)) : App.duePill(x.due),
          h('button', { type: 'button', class: 'icon-btn sm', title: t('common.edit'), 'aria-label': t('common.edit'), onClick: function () { App.editTask({ id: x.id }); } }, icon('pencil')),
          h('button', { type: 'button', class: 'icon-btn sm', title: t('common.delete'), 'aria-label': t('common.delete'), onClick: function () { var undo = Store.deleteTask(x.id); UI.toast(t('tasks.deleted'), { action: { label: t('common.undo'), fn: undo } }); } }, icon('trash-2')));
      })) : UI.empty({ icon: 'circle-check', title: t('tasks.empty.' + vs.tab) });
      return h('div', { class: 'stack' }, quick, h('section', { class: 'card', style: { overflow: 'hidden' } }, tabs, body));
    }
  };
})();
