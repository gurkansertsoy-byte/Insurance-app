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

  /** "Kart ₺1.200,00 · Nakit ₺300,00" (a cancelling row of the table: "İade ₺1.500,00"), and the commission given back */
  App.refundText = function (x) {
    var parts = [];
    [['card', 'field.card'], ['account', 'field.account'], ['cash', 'field.cash']].forEach(function (k) { if (x[k[0]]) parts.push(t(k[1]) + ' ' + F.money(x[k[0]])); });
    if (x.kind === 'row' && x.refund && !parts.length) parts.push(t('cancel.refundShort') + ' ' + F.money(x.refund));
    var refund = Store.refundOf(x);
    if (refund) parts.push(t('cancel.reclaimLine', { v: F.money(Store.reclaimOf(x)) }));
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

  // [text key, tone] of a cancellation's match
  function statusOf(x) {
    var p = x.policyId && Store.policies.get(x.policyId);
    if (x.kind === 'row') return p ? [x.match === 'manual' ? 'cancel.m.rowManual' : 'cancel.m.rowAuto', 'good'] : ['cancel.m.rowNone', 'plain'];
    if (p) return [x.match === 'auto' ? 'cancel.m.auto' : 'cancel.m.manual', 'good'];
    if (x.match === 'ambiguous') return ['cancel.m.ambiguous', 'warn'];
    if (x.locked) return ['cancel.m.notInFile', 'plain'];
    return ['cancel.m.none', 'bad'];
  }
  App.cancelStatusText = function (x) { return t(statusOf(x)[0], { n: (x.candidates || []).length }); };
  App.cancelStatus = function (x) { return UI.pill(App.cancelStatusText(x), statusOf(x)[1]); };

  // ------------------------------------------------------------------ the İptal block of a month page
  App.cancelSection = function (monthKey) {
    var list = Store.cancellationsOf(monthKey);
    var questions = Store.derived().questions.filter(function (q) { return q.month === monthKey; });
    var total = U.round2(U.sum(list, Store.refundOf));
    var reclaim = U.round2(U.sum(list, Store.reclaimOf));
    var head = h('div', { class: 'card-head' }, h('h2', null, t('cancel.sectionTitle')),
      h('span', { class: 'sub' }, list.length ? t('cancel.summaryFull', { n: list.length, v: F.money(total), k: F.money(reclaim) }) : t('cancel.sectionSub')),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-sm', id: 'cancel-add', onClick: function () { App.cancelRowDialog(monthKey); } }, icon('plus'), t('cancel.add'))));
    var ask = questions.length ? h('div', { class: 'card-body', id: 'month-questions' }, App.repeatQuestions(questions)) : null;
    if (!list.length) return h('section', { class: 'card', id: 'month-cancels' }, head, ask, h('div', { class: 'card-body' }, h('p', { class: 'muted small' }, t('cancel.emptyText'))));
    return h('section', { class: 'card', id: 'month-cancels', style: { overflow: 'hidden' } }, head, ask,
      h('div', { class: 'card-body flush', style: { marginTop: '10px' } }, App.cancelTable(list, false)));
  };

  /** Table of cancellations (İptal block rows and cancelling rows of the table); withMonth adds the month and, to keep
      the table on the screen, shows Kart / Cari / Nakit under the refund instead of in columns of their own. */
  App.cancelTable = function (list, withMonth) {
    var split = !withMonth;
    var L = { month: t('common.month'), company: t('cancel.h.company'), policy: t('cancel.h.policy'), insured: t('cancel.h.insured'), card: t('field.card'), account: t('field.account'), cash: t('field.cash'),
      refund: t('cancel.colRefund'), match: t('cancel.colMatch'), status: t('cancel.colStatus') };
    var total = U.round2(U.sum(list, Store.refundOf));
    var reclaim = U.round2(U.sum(list, Store.reclaimOf));
    var rows = list.map(function (x) {
      var p = x.policyId && Store.policies.get(x.policyId);
      var c = p && Store.customers.get(p.customerId);
      var monthKey = x.month;
      var est = x.kind === 'row' ? x.reclaimEstimated : true;
      return h('tr', { id: 'cx-' + x.id, class: x.kind === 'row' ? 'cancel-row-kind' : null },
        withMonth ? h('td', { 'data-label': L.month, style: { whiteSpace: 'nowrap' } }, h('a', { href: '#ay-' + x.month }, F.month(x.month, true))) : null,
        h('td', { 'data-label': L.company }, x.company || '—'),
        h('td', { 'data-label': L.policy }, x.policyText || '—', x.kind === 'row' && x.policyNo ? h('div', { class: 'small muted mono' }, x.policyNo) : null),
        h('td', { class: 'name-cell' }, x.insuredName || '—'),
        split ? h('td', { class: 'r num', 'data-label': L.card }, x.card ? F.money(x.card) : '') : null,
        split ? h('td', { class: 'r num', 'data-label': L.account }, x.account ? F.money(x.account) : '') : null,
        split ? h('td', { class: 'r num', 'data-label': L.cash }, x.cash ? F.money(x.cash) : '') : null,
        h('td', { class: 'r num', 'data-label': L.refund }, h('div', null, F.money(Store.refundOf(x))),
          split ? null : h('div', { class: 'small muted' }, [['card', L.card], ['account', L.account], ['cash', L.cash]].filter(function (k) { return x[k[0]]; })
            .map(function (k) { return k[1] + ' ' + F.money(x[k[0]]); }).join(' · ')),
          h('div', { class: 'small muted', title: est ? t('cancel.reclaimEstTitle') : null }, t('cancel.reclaimShort', { v: F.money(Store.reclaimOf(x)) }) + (est ? ' *' : ''))),
        h('td', { 'data-label': L.match, class: 'full' }, p ? h('div', null, h('a', { href: '#musteri-' + p.customerId }, c ? c.name : '—'),
          h('div', { class: 'row tight small muted', style: { columnGap: '8px' } }, UI.items(p.policyType, F.month(p.month, true), Store.companyLabel(p.company), p.policyNo ? h('span', { class: 'mono', style: { whiteSpace: 'nowrap' } }, p.policyNo) : null))) : h('span', { class: 'muted' }, '—')),
        h('td', { 'data-label': L.status }, App.cancelStatus(x), x.kind === 'row' && x.source && x.source.row ? h('div', { class: 'small muted' }, t('cancel.rowOfPage', { row: x.source.row })) : null),
        x.kind === 'row' ? h('td', { class: 'actions-cell' }, h('div', { class: 'row tight', style: { flexWrap: 'nowrap' } },
          x.match === 'manual' ? h('button', { type: 'button', class: 'btn btn-sm', id: 'cx-undo-' + x.rowId, onClick: function () { Store.decideRepeat(x.rowId, null); UI.toast(t('cancel.decisionUndone')); } }, icon('undo-2'), t('cancel.undoDecision')) : null,
          h('button', { type: 'button', class: 'btn btn-sm', id: 'cx-not-' + x.rowId, onClick: function () {
            UI.confirm({ title: t('cancel.notTitle'), message: t('cancel.notMsg'), confirm: t('cancel.notGo') }).then(function (ok) {
              if (!ok) return;
              Store.decideRepeat(x.rowId, 'not');
              UI.toast(t('cancel.notDone'), { action: { label: t('common.undo'), fn: function () { Store.decideRepeat(x.rowId, null); } } });
            });
          } }, icon('circle-x'), t('cancel.notCancel')))) :
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
    var foot = h('tr', null, h('td', { colspan: withMonth ? 4 : 3, class: 'full' }, t('cancel.refundTotal')),
      split ? h('td', { class: 'r num', 'data-label': L.card }, F.money(U.sum(list, function (x) { return x.card; }))) : null,
      split ? h('td', { class: 'r num', 'data-label': L.account }, F.money(U.sum(list, function (x) { return x.account; }))) : null,
      split ? h('td', { class: 'r num', 'data-label': L.cash }, F.money(U.sum(list, function (x) { return x.cash; }))) : null,
      h('td', { class: 'r num', 'data-label': L.refund, id: withMonth ? 'all-cancels-total' : null }, h('div', null, F.money(total)), h('div', { class: 'small muted' }, t('cancel.reclaimShort', { v: F.money(reclaim) }))),
      h('td', { colspan: 3 }));
    var heads = (withMonth ? [L.month] : []).concat([L.company, L.policy, L.insured], split ? [L.card, L.account, L.cash] : [], [L.refund, L.match, L.status, '']);
    var first = withMonth ? 4 : 3, last = first + (split ? 3 : 0);
    return h('div', null, h('div', { class: 'table-wrap' }, h('table', { class: 'data responsive cancel-table' },
        h('thead', null, h('tr', null, heads.map(function (x, i) { return h('th', { class: i >= first && i <= last ? 'r' : null }, x); }))),
        h('tbody', null, rows), h('tfoot', null, foot))),
      h('p', { class: 'small muted', style: { padding: '8px 16px 12px' } }, t('cancel.reclaimNote')));
  };

  // ------------------------------------------------------------------ the same policy number written again with plus amounts
  /** "Is this an İptal?" for rows that write an earlier policy's number again with plus amounts. */
  App.repeatQuestions = function (rows) {
    return h('div', { class: 'stack', style: { gap: '10px' } }, rows.map(function (q) {
      var r = Store.repeatOf(q.id);
      var base = r && r.info.of && Store.policies.get(r.info.of);
      var c = Store.customers.get(q.customerId);
      var amt = Portfolio.rowCancelAmounts(q, base);
      var reasons = r ? r.info.reasons : [];
      return h('div', { class: 'callout warn repeat-question', id: 'rq-' + q.id }, icon('circle-help'),
        h('div', { style: { flex: '1 1 320px', minWidth: 0 } },
          h('strong', null, t(base ? 'repeat.qTitle' : 'repeat.qTitleOrphan', { no: q.policyNo || '—', month: F.month(q.month) })),
          h('div', { class: 'small' }, t('repeat.qText', {
            name: (c && c.name) || q.insuredName || '—', type: q.policyType || (base && base.policyType) || '—',
            first: base ? F.month(base.month) : t('repeat.notInFile'), premium: F.money(q.premium || 0), commission: q.commission != null ? F.money(q.commission) : t('repeat.noCommission'),
            word: q.businessText ? '“' + q.businessText + '”' : t('repeat.emptyWord')
          })),
          h('div', { class: 'small' }, t('repeat.qIfYes', { refund: F.money(amt.refund), reclaim: F.money(amt.reclaim) }) + (amt.reclaimEstimated ? ' ' + t('repeat.estimated') : '')),
          reasons.length ? h('div', { class: 'small', style: { color: 'var(--bad-ink)', marginTop: '3px' } }, icon('triangle-alert'), ' ', t('repeat.differs', { what: reasons.map(function (k) { return t('repeat.diff.' + k); }).join(', ') })) : null),
        h('div', { class: 'excel-notice-actions' },
          h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'rq-yes-' + q.id, onClick: function () { Store.decideRepeat(q.id, 'cancel'); UI.toast(t('repeat.yesDone')); } }, icon('ban'), t('repeat.yes')),
          h('button', { type: 'button', class: 'btn btn-sm', id: 'rq-no-' + q.id, onClick: function () { Store.decideRepeat(q.id, 'not'); UI.toast(t('repeat.noDone')); } }, t('repeat.no'))));
    }));
  };
})();
