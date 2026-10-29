/* İptal (cancellations): cancel dialog, İptal rows of a month, choosing the cancelled policy */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Portfolio = window.Portfolio, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  function money(v) { return v == null || v === '' ? '' : U.fmtNumber(Number(v), window.I18N.lang, 2); }
  function moneyField(id, value) {
    var el = h('input', { id: id, class: 'num', inputmode: 'decimal', value: money(value), autocomplete: 'off', style: { textAlign: 'right' } });
    el.addEventListener('blur', function () { var n = U.parseNumber(el.value); if (n != null) el.value = money(n); });
    return el;
  }
  function affix(el) { return h('div', { class: 'input-affix left' }, el, h('span', { class: 'affix' }, '₺')); }

  /** "Kart ₺1.200,00 · Nakit ₺300,00" */
  App.refundText = function (x) {
    var parts = [];
    [['card', 'field.card'], ['account', 'field.account'], ['cash', 'field.cash']].forEach(function (k) { if (x[k[0]]) parts.push(t(k[1]) + ' ' + F.money(x[k[0]])); });
    return parts.length ? parts.join(' · ') : t('cancel.noRefund');
  };
  App.cancelLine = function (x) { return [x.insuredName, x.policyText, x.company].filter(Boolean).join(' · ') || '—'; };

  // ------------------------------------------------------------------ cancel a policy from the app
  App.cancelDialog = function (p) {
    var c = Store.customers.get(p.customerId);
    var month = U.currentMonthKey() > p.month ? U.currentMonthKey() : p.month;
    var monthIn = UI.monthInput('cx-month', month, function (v) { month = v; });
    var card = moneyField('cx-card'), account = moneyField('cx-account'), cash = moneyField('cx-cash');
    var note = h('input', { id: 'cx-note', autocomplete: 'off' });
    var err = h('div', { class: 'hint' });
    // one click: the whole premium back, the way it was paid
    var full = p.premium ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', id: 'cx-full', onClick: function () {
      var paid = (p.card || 0) + (p.account || 0) + (p.cash || 0);
      var f = paid > 0 ? p.premium / paid : 0;
      card.value = paid > 0 && p.card ? money(U.round2(p.card * f)) : '';
      account.value = paid > 0 && p.account ? money(U.round2(p.account * f)) : '';
      cash.value = paid > 0 ? (p.cash ? money(U.round2(p.cash * f)) : '') : money(p.premium);
    } }, t('cancel.fullRefund', { v: F.money(p.premium) })) : null;
    var m = UI.modal({
      title: t('cancel.title'), icon: 'ban', size: 'narrow',
      body: [
        h('p', { class: 'dim' }, t('cancel.intro', { type: p.policyType || '', name: c ? c.name : '', month: F.month(p.month) })),
        h('div', { class: 'form-grid' },
          h('div', { class: 'span-12' }, UI.field({ id: 'cx-month', label: t('cancel.month'), input: monthIn, hint: err })),
          h('div', { class: 'span-12 row', style: { justifyContent: 'space-between' } }, h('strong', null, t('cancel.refund')), full),
          h('div', { class: 'span-4' }, UI.field({ id: 'cx-card', label: t('field.card'), input: affix(card) })),
          h('div', { class: 'span-4' }, UI.field({ id: 'cx-cash', label: t('field.cash'), input: affix(cash) })),
          h('div', { class: 'span-4' }, UI.field({ id: 'cx-account', label: t('field.account'), input: affix(account) })),
          h('div', { class: 'span-12 small muted' }, t('cancel.refundHint')),
          h('div', { class: 'span-12' }, UI.field({ id: 'cx-note', label: t('common.notes'), input: note })))
      ],
      foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.cancel')),
        h('button', { type: 'submit', class: 'btn btn-danger-solid', id: 'cx-save' }, icon('ban'), t('cancel.save'))],
      onSubmit: function () {
        if (!month || month < p.month) { err.className = 'hint bad'; err.textContent = t('cancel.errMonth', { m: F.month(p.month) }); return; }
        var x = Store.cancelPolicy(p.id, { month: month, card: card.value, account: account.value, cash: cash.value, note: note.value });
        m.close();
        if (x) UI.toast(t('cancel.done'), { action: { label: t('common.undo'), fn: function () { Store.deleteCancellation(x.id); } } });
      }
    });
  };

  // ------------------------------------------------------------------ add / edit a row of the İptal block
  App.cancelRowDialog = function (monthKey, x) {
    x = x || {};
    var sug = Store.suggestions();
    var f = {
      company: h('input', { id: 'cr-company', value: x.company || '', list: 'cr-company-list', autocomplete: 'off' }),
      policy: h('input', { id: 'cr-policy', value: x.policyText || '', list: 'cr-policy-list', autocomplete: 'off' }),
      insured: h('input', { id: 'cr-insured', value: x.insuredName || '', autocomplete: 'off' }),
      card: moneyField('cr-card', x.card), account: moneyField('cr-account', x.account), cash: moneyField('cr-cash', x.cash)
    };
    var err = h('div', { class: 'hint' });
    var m = UI.modal({
      title: t('cancel.editTitle') + ' · ' + F.month(monthKey), icon: 'ban', size: 'wide',
      body: [
        h('div', { class: 'form-grid' },
          h('div', { class: 'span-4' }, UI.field({ id: 'cr-company', label: t('cancel.h.company'), input: f.company })),
          h('div', { class: 'span-4' }, UI.field({ id: 'cr-policy', label: t('cancel.h.policy'), input: f.policy })),
          h('div', { class: 'span-4' }, UI.field({ id: 'cr-insured', label: t('cancel.h.insured'), req: true, input: f.insured, hint: err })),
          h('div', { class: 'span-4' }, UI.field({ id: 'cr-card', label: t('field.card'), input: affix(f.card) })),
          h('div', { class: 'span-4' }, UI.field({ id: 'cr-account', label: t('field.account'), input: affix(f.account) })),
          h('div', { class: 'span-4' }, UI.field({ id: 'cr-cash', label: t('field.cash'), input: affix(f.cash) }))),
        UI.datalist('cr-company-list', sug.companies), UI.datalist('cr-policy-list', sug.policyTypes)
      ],
      foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.cancel')),
        h('button', { type: 'submit', class: 'btn btn-primary', id: 'cr-save' }, icon('save'), t('common.save'))],
      onSubmit: function () {
        if (!U.collapse(f.insured.value)) { err.className = 'hint bad'; err.textContent = t('cancel.errInsured'); f.insured.focus(); return; }
        Store.saveCancellation({ id: x.id, month: monthKey, company: f.company.value, policyText: f.policy.value, insuredName: U.tidyName(f.insured.value),
          card: f.card.value, account: f.account.value, cash: f.cash.value });
        m.close();
        UI.toast(t('cancel.saved'));
      }
    });
  };

  // ------------------------------------------------------------------ which policy does this row cancel?
  App.cancelPicker = function (x) {
    var list = h('div', { class: 'list', id: 'cp-list', style: { maxHeight: '340px', overflowY: 'auto' } });
    var label = h('div', { class: 'eyebrow' }, t('cancel.candidates'));
    var input = h('input', { class: 'input', id: 'cp-q', placeholder: t('cancel.searchOther'), 'aria-label': t('cancel.searchOther'), autocomplete: 'off' });
    var m;
    function row(p) {
      var c = Store.customers.get(p.customerId);
      var other = Store.cancelOf(p.id);
      var taken = !!(other && other.id !== x.id);
      return h('button', { type: 'button', class: 'list-item', id: 'cp-' + p.id, style: { background: 'transparent', border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' },
        onClick: function () { Store.linkCancellation(x.id, p.id); m.close(); UI.toast(t('cancel.saved')); } },
        h('span', { class: 'avatar sm' }, UI.initials(c ? c.name : '?')),
        h('div', { class: 'main' },
          h('div', { class: 't' }, (c ? c.name : '—') + (p.insuredName && c && U.fold(p.insuredName) !== U.fold(c.name) ? ' · ' + t('customer.insured') + ': ' + p.insuredName : '')),
          h('div', { class: 's' }, UI.items(p.policyType, Store.companyLabel(p.company), F.month(p.month), p.policyNo ? h('span', { class: 'mono' }, p.policyNo) : null,
            p.plate ? UI.plate(p.plate) : null, p.premium != null ? F.money(p.premium) : null))),
        taken ? UI.pill(t('cancel.taken'), 'plain') : x.policyId === p.id ? icon('check') : null);
    }
    function candidates() {
      var scored = [];
      Store.policies.forEach(function (p) {
        var s = Portfolio.cancelScore(x, p, Store.customers.get(p.customerId));
        if (s >= 0) scored.push({ p: p, s: s });
      });
      scored.sort(function (a, b) { return b.s - a.s || U.cmp(b.p.month, a.p.month); });
      return scored.slice(0, 12).map(function (o) { return o.p; });
    }
    function draw() {
      UI.clear(list);
      var q = U.collapse(input.value);
      var ps = [];
      if (q.length >= 2) {
        var seen = new Set();
        var r = Store.search(q, 20);
        function add(p) { if (p.month <= x.month && !seen.has(p.id)) { seen.add(p.id); ps.push(p); } }
        r.customers.forEach(function (hit) { Store.policiesOf(hit.c.id).forEach(add); });
        r.policies.forEach(function (hit) { add(hit.p); });
        label.textContent = t('search.results');
      } else {
        ps = candidates();
        label.textContent = t('cancel.candidates');
      }
      if (!ps.length) list.appendChild(h('div', { class: 'muted small', style: { padding: '8px 4px' } }, q.length >= 2 ? t('search.noResults', { q: q }) : t('cancel.noCandidates')));
      ps.slice(0, 40).forEach(function (p) { list.appendChild(row(p)); });
    }
    input.addEventListener('input', U.debounce(draw, 120));
    m = UI.modal({
      title: t('cancel.pickTitle'), icon: 'file-search', size: 'wide',
      body: [h('p', { class: 'dim' }, t('cancel.pickIntro', { month: F.month(x.month), line: App.cancelLine(x) + ' · ' + App.refundText(x) })), input, label, list],
      foot: [
        h('button', { type: 'button', class: 'btn', id: 'cp-none', onClick: function () { Store.linkCancellation(x.id, null); m.close(); } }, icon('unlink'), t('cancel.notInFile')),
        x.locked ? h('button', { type: 'button', class: 'btn', id: 'cp-auto', onClick: function () { Store.linkCancellation(x.id, 'auto'); m.close(); } }, icon('sparkles'), t('cancel.autoFind')) : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.close'))]
    });
    draw();
  };

  App.cancelStatus = function (x) {
    var p = x.policyId && Store.policies.get(x.policyId);
    if (p) return UI.pill(t(x.match === 'auto' ? 'cancel.m.auto' : 'cancel.m.manual'), 'good');
    if (x.match === 'ambiguous') return UI.pill(t('cancel.m.ambiguous', { n: (x.candidates || []).length }), 'warn');
    if (x.locked) return UI.pill(t('cancel.m.notInFile'), 'plain');
    return UI.pill(t('cancel.m.none'), 'bad');
  };

  // ------------------------------------------------------------------ the İptal block of a month page
  App.cancelSection = function (monthKey) {
    var list = Store.cancellationsOf(monthKey);
    var total = U.round2(U.sum(list, Portfolio.refundOf));
    var head = h('div', { class: 'card-head' }, h('h2', null, t('cancel.sectionTitle')),
      h('span', { class: 'sub' }, list.length ? t('cancel.summary', { n: list.length, v: F.money(total) }) : t('cancel.sectionSub')),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-sm', id: 'cancel-add', onClick: function () { App.cancelRowDialog(monthKey); } }, icon('plus'), t('cancel.add'))));
    if (!list.length) return h('section', { class: 'card', id: 'month-cancels' }, head, h('div', { class: 'card-body' }, h('p', { class: 'muted small' }, t('cancel.emptyText'))));
    var L = { company: t('cancel.h.company'), policy: t('cancel.h.policy'), insured: t('cancel.h.insured'), card: t('field.card'), account: t('field.account'), cash: t('field.cash'), match: t('cancel.colMatch'), status: t('cancel.colStatus') };
    var rows = list.map(function (x) {
      var p = x.policyId && Store.policies.get(x.policyId);
      var c = p && Store.customers.get(p.customerId);
      return h('tr', { id: 'cx-' + x.id },
        h('td', { 'data-label': L.company }, x.company || '—'),
        h('td', { 'data-label': L.policy }, x.policyText || '—'),
        h('td', { class: 'name-cell' }, x.insuredName || '—'),
        h('td', { class: 'r num', 'data-label': L.card }, x.card ? F.money(x.card) : ''),
        h('td', { class: 'r num', 'data-label': L.account }, x.account ? F.money(x.account) : ''),
        h('td', { class: 'r num', 'data-label': L.cash }, x.cash ? F.money(x.cash) : ''),
        h('td', { 'data-label': L.match, class: 'full' }, p ? h('div', null, h('a', { href: '#musteri-' + p.customerId }, c ? c.name : '—'),
          h('div', { class: 'row tight small muted', style: { columnGap: '8px' } }, UI.items(p.policyType, F.month(p.month, true), Store.companyLabel(p.company), p.policyNo ? h('span', { class: 'mono' }, p.policyNo) : null))) : h('span', { class: 'muted' }, '—')),
        h('td', { 'data-label': L.status }, App.cancelStatus(x)),
        h('td', { class: 'actions-cell' }, h('div', { class: 'row tight', style: { flexWrap: 'nowrap' } },
          h('button', { type: 'button', class: 'btn btn-sm' + (p ? '' : ' btn-primary'), id: 'cx-pick-' + x.id, onClick: function () { App.cancelPicker(x); } }, icon('link-2'), p ? t('cancel.change') : t('cancel.pick')),
          h('button', { type: 'button', class: 'icon-btn sm', id: 'cx-edit-' + x.id, title: t('common.edit'), 'aria-label': t('common.edit'), onClick: function () { App.cancelRowDialog(monthKey, x); } }, icon('pencil')),
          h('button', { type: 'button', class: 'icon-btn sm', id: 'cx-del-' + x.id, title: t('common.delete'), 'aria-label': t('common.delete'), onClick: function () {
            UI.confirm({ title: t('cancel.deleteTitle'), message: t('cancel.deleteMsg'), danger: true, confirm: t('common.delete') }).then(function (ok) {
              if (!ok) return;
              var undo = Store.deleteCancellation(x.id);
              UI.toast(t('cancel.deleted'), { action: { label: t('common.undo'), fn: undo } });
            });
          } }, icon('trash-2')))));
    });
    var foot = h('tr', null, h('td', { colspan: 3, class: 'full' }, t('cancel.refundTotal')),
      h('td', { class: 'r num', 'data-label': L.card }, F.money(U.sum(list, function (x) { return x.card; }))),
      h('td', { class: 'r num', 'data-label': L.account }, F.money(U.sum(list, function (x) { return x.account; }))),
      h('td', { class: 'r num', 'data-label': L.cash }, F.money(U.sum(list, function (x) { return x.cash; }))),
      h('td', { colspan: 3, class: 'r', 'data-label': t('common.total') }, F.money(total)));
    return h('section', { class: 'card', id: 'month-cancels', style: { overflow: 'hidden' } }, head,
      h('div', { class: 'card-body flush', style: { marginTop: '10px' } }, h('div', { class: 'table-wrap' }, h('table', { class: 'data responsive cancel-table' },
        h('thead', null, h('tr', null, [L.company, L.policy, L.insured, L.card, L.account, L.cash, L.match, L.status, ''].map(function (x, i) { return h('th', { class: i >= 3 && i <= 5 ? 'r' : null }, x); }))),
        h('tbody', null, rows), h('tfoot', null, foot)))));
  };
})();
