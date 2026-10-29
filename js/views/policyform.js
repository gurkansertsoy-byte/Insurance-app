/* Policy entry form: new, edit and renewal */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Schema = window.Schema, Portfolio = window.Portfolio, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  var CUST_KEYS = ['name', 'tc', 'phone', 'email', 'profession', 'address', 'birthDate'];
  var MONEY_KEYS = ['premium', 'commission', 'netPremium', 'card', 'account', 'cash'];

  function blankPolicy(month) {
    return { month: month || U.currentMonthKey(), policyType: '', company: '', policyNo: '', startDate: '', endDate: '', issueDate: '',
      newBusiness: null, insuredName: '', sameInsured: true, agent: '', plate: '', serialNo: '', step: '', premium: '', commission: '',
      netPremium: '', card: '', account: '', cash: '', note: '', extras: {}, endAuto: true };
  }

  function moneyStr(v) { return v == null || v === '' ? '' : U.fmtNumber(Number(v), window.I18N.lang, 2); }

  function draftFrom(route) {
    var d = { key: location.hash, customerId: null, customer: {}, policy: blankPolicy(route.month), editCustomer: false, keepCustomer: false };
    CUST_KEYS.forEach(function (k) { d.customer[k] = ''; });
    var src = route.policyId ? Store.policies.get(route.policyId) : route.renewId ? Store.policies.get(route.renewId) : null;
    var cust = route.customerId ? Store.customers.get(route.customerId) : src ? Store.customers.get(src.customerId) : null;
    if (cust) d.customerId = cust.id;
    if (src) {
      var p = d.policy;
      Portfolio.POLICY_FIELDS.forEach(function (k) { if (src[k] != null) p[k] = MONEY_KEYS.indexOf(k) >= 0 ? moneyStr(src[k]) : src[k]; });
      p.step = src.step != null ? String(src.step) : '';
      p.extras = Object.assign({}, src.extras || {});
      p.month = src.month;
      p.sameInsured = !src.insuredName || (cust && U.fold(src.insuredName) === U.fold(cust.name));
      p.endAuto = false;
      if (route.renewId) {
        // a renewal starts where the old policy ends
        p.month = U.currentMonthKey();
        p.policyNo = '';
        p.startDate = src.endDate || '';
        p.endDate = src.endDate ? U.addYears(src.endDate, 1) : '';
        p.endAuto = true;
        p.issueDate = '';
        p.newBusiness = false;
        ['premium', 'commission', 'netPremium', 'card', 'account', 'cash'].forEach(function (k) { p[k] = ''; });
        p.note = '';
        d.renewOf = src.id;
        d.oldPremium = src.premium;
      }
    }
    return d;
  }

  function errorsOf(d) {
    var e = {};
    var name = d.customerId ? (Store.customers.get(d.customerId) || {}).name : d.customer.name;
    if (!U.collapse(name)) e.name = t('form.errName');
    if (!U.collapse(d.policy.policyType)) e.policyType = t('form.errType');
    if (!U.isMonthKey(d.policy.month)) e.month = t('form.errMonth');
    if (d.policy.startDate && d.policy.endDate && d.policy.endDate <= d.policy.startDate) e.endDate = t('form.errDates');
    MONEY_KEYS.forEach(function (k) {
      if (String(d.policy[k] || '').trim() && U.parseNumber(d.policy[k]) == null) e[k] = t('form.errNumber');
    });
    if (String(d.policy.step || '').trim() && U.parseIntSafe(d.policy.step) == null) e.step = t('form.errNumber');
    return e;
  }

  App.views.form = {
    title: function (r) { return r.policyId ? t('form.titleEdit') : r.renewId ? t('form.titleRenew') : t('form.titleNew'); },
    sub: function (r) {
      var d = App.viewState.form;
      if (r.renewId) { var p = Store.policies.get(r.renewId); return p ? t('form.renewSub', { type: p.policyType || '', date: F.date(p.endDate) }) : ''; }
      return d && d.customerId && Store.customers.get(d.customerId) ? Store.customers.get(d.customerId).name : t('form.sub');
    },
    render: function (route) {
      var d = App.viewState.form;
      if (!d || d.key !== location.hash) d = App.viewState.form = draftFrom(route);
      if ((route.policyId && !Store.policies.get(route.policyId)) || (route.renewId && !Store.policies.get(route.renewId))) {
        return h('section', { class: 'card' }, UI.empty({ icon: 'file-text', title: t('form.notFound'), actions: [h('a', { class: 'btn', href: '#policeler' }, t('nav.policies'))] }));
      }
      return build(d, route);
    }
  };

  function build(d, route) {
    var sug = Store.suggestions();
    var P = d.policy;
    var inputs = {};
    var hints = {};
    var fieldsEl = {};

    function mkField(key, label, input, opts) {
      opts = opts || {};
      inputs[key] = input;
      hints[key] = h('div', { class: 'hint', id: 'f-' + key + '-hint' }, opts.hint || '');
      fieldsEl[key] = UI.field({ id: opts.forId || input.id, label: label, req: opts.req, input: opts.wrap || input, hint: hints[key], labelExtra: opts.labelExtra });
      return fieldsEl[key];
    }

    function bindPolicy(key, el, after) {
      el.addEventListener('input', function () { P[key] = el.value; if (after) after(); });
      el.addEventListener('change', function () { P[key] = el.value; if (after) after(); });
    }

    // ---------------- customer section
    var custBox = h('div', { class: 'stack', style: { gap: '12px' } });
    function drawCustomer() {
      UI.clear(custBox);
      var chosen = d.customerId ? Store.customers.get(d.customerId) : null;
      if (chosen && !d.editCustomer) {
        var s = Store.summary(chosen.id);
        custBox.appendChild(h('div', { class: 'chosen', id: 'chosen-customer' },
          h('span', { class: 'avatar sm' }, UI.initials(chosen.name)),
          h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { style: { fontWeight: 600 } }, chosen.name),
            h('div', { class: 'small dim' }, [chosen.tc ? (Store.settings.maskIds ? U.maskId(chosen.tc) : chosen.tc) : '', chosen.phone ? U.formatPhone(chosen.phone) : '', chosen.profession,
              t('customer.policyCount', { n: s.count }), s.months.length ? t('form.inMonths', { n: s.months.length }) : ''].filter(Boolean).join(' · '))),
          h('button', { type: 'button', class: 'btn btn-sm', id: 'cust-edit-inline', onClick: function () {
            d.editCustomer = true;
            CUST_KEYS.forEach(function (k) { d.customer[k] = chosen[k] || ''; });
            drawCustomer();
          } }, icon('pencil'), t('form.editInfo')),
          route.policyId || route.renewId ? null : h('button', { type: 'button', class: 'btn btn-sm', id: 'cust-change', onClick: function () {
            d.customerId = null; d.editCustomer = false; CUST_KEYS.forEach(function (k) { d.customer[k] = ''; }); drawCustomer(); setTimeout(function () { inputs.name.focus(); }, 10);
          } }, icon('x'), t('form.change'))));
        return;
      }
      var C = d.customer;
      var name = h('input', { id: 'f-name', value: C.name, autocomplete: 'off', placeholder: t('form.namePh') });
      var tc = h('input', { id: 'f-tc', value: C.tc, inputmode: 'numeric', class: 'mono-input', maxlength: 14, autocomplete: 'off' });
      var phone = h('input', { id: 'f-phone', value: C.phone ? U.formatPhone(C.phone) : '', inputmode: 'tel', autocomplete: 'off', placeholder: '05xx xxx xx xx' });
      var email = h('input', { id: 'f-email', type: 'email', value: C.email, autocomplete: 'off' });
      var prof = h('input', { id: 'f-profession', value: C.profession, list: 'f-prof-list', autocomplete: 'off' });
      var addr = h('input', { id: 'f-address', value: C.address, autocomplete: 'off' });
      var birth = UI.dateInput('f-birthDate', C.birthDate, function (v) { C.birthDate = v; });
      var sugBox = h('div', { class: 'suggest', hidden: true, id: 'name-suggest', role: 'listbox' });
      var nameWrap = h('div', { style: { position: 'relative' } }, name, sugBox);
      function pick(c) { d.customerId = c.id; d.editCustomer = false; drawCustomer(); updateInsured(); App.refreshTitle(); }
      function suggest() {
        UI.clear(sugBox);
        if (d.editCustomer) { sugBox.hidden = true; return; }
        var q = name.value;
        var res = U.collapse(q).length >= 2 ? Store.search(q, 6).customers : [];
        if (!res.length) { sugBox.hidden = true; return; }
        sugBox.appendChild(h('div', { class: 'search-group' }, t('form.existing')));
        res.forEach(function (r) {
          var s = Store.summary(r.c.id);
          sugBox.appendChild(h('button', { type: 'button', role: 'option', onMousedown: function (e) { e.preventDefault(); pick(r.c); } },
            h('span', { class: 'avatar sm' }, UI.initials(r.c.name)),
            h('span', { style: { minWidth: 0, flex: 1 } }, h('div', { style: { fontWeight: 600 } }, UI.highlight(r.c.name, q)),
              h('div', { class: 'small muted' }, [r.c.tc ? (Store.settings.maskIds ? U.maskId(r.c.tc) : r.c.tc) : '', r.c.phone ? U.formatPhone(r.c.phone) : ''].filter(Boolean).join(' · '))),
            h('span', { class: 'small muted' }, t('customer.policyCount', { n: s.count }))));
        });
        sugBox.hidden = false;
      }
      name.addEventListener('input', function () { C.name = name.value; suggest(); updateInsured(); });
      name.addEventListener('blur', function () { setTimeout(function () { sugBox.hidden = true; }, 150); if (!d.editCustomer && name.value) { var tidy = U.tidyName(name.value); if (tidy !== name.value) { name.value = tidy; C.name = tidy; updateInsured(); } } });
      name.addEventListener('focus', suggest);
      tc.addEventListener('input', function () { C.tc = tc.value; App.tcHint(hints.tc, tc.value, d.customerId, d.editCustomer ? null : pick); });
      phone.addEventListener('input', function () { C.phone = phone.value; phoneHint(); });
      phone.addEventListener('blur', function () { var n = U.normalizePhone(phone.value); if (n.length === 10) phone.value = U.formatPhone(n); });
      [[email, 'email'], [prof, 'profession'], [addr, 'address']].forEach(function (x) { x[0].addEventListener('input', function () { C[x[1]] = x[0].value; }); });
      function phoneHint() {
        var n = U.normalizePhone(phone.value);
        var el = hints.phone;
        UI.clear(el);
        el.className = 'hint';
        if (!phone.value) return;
        if (n.length === 10) { el.className = 'hint good'; el.appendChild(icon('circle-check')); el.appendChild(document.createTextNode(U.isMobile(n) ? t('form.phoneMobile') : t('form.phoneLand'))); }
        else { el.className = 'hint warn'; el.appendChild(icon('triangle-alert')); el.appendChild(document.createTextNode(t('form.phoneBad'))); }
      }
      custBox.appendChild(h('div', { class: 'form-grid' },
        h('div', { class: 'span-6' }, mkField('name', t('field.name'), name, { req: true, wrap: nameWrap })),
        h('div', { class: 'span-6' }, mkField('tc', t('field.tc'), tc)),
        h('div', { class: 'span-4' }, mkField('phone', t('field.phone'), phone)),
        h('div', { class: 'span-4' }, mkField('email', t('field.email'), email)),
        h('div', { class: 'span-4' }, mkField('profession', t('field.profession'), prof), UI.datalist('f-prof-list', sug.professions)),
        h('div', { class: 'span-8' }, mkField('address', t('field.address'), addr)),
        h('div', { class: 'span-4' }, mkField('birthDate', t('field.birthDate'), birth.input, { wrap: birth })),
        d.editCustomer ? h('div', { class: 'span-12' }, h('button', { type: 'button', class: 'btn btn-sm', onClick: function () { d.editCustomer = false; drawCustomer(); } }, icon('x'), t('form.cancelEditInfo'))) : null));
      App.tcHint(hints.tc, tc.value, d.customerId, d.editCustomer ? null : pick);
      phoneHint();
      if (!d.editCustomer && !route.policyId) hints.name.textContent = t('form.nameHint');
    }

    // ---------------- policy section
    var monthIn = UI.monthInput('f-month', P.month, function (v) { P.month = v; });
    var typeIn = h('input', { id: 'f-policyType', value: P.policyType, list: 'f-type-list', autocomplete: 'off', placeholder: t('form.typePh') });
    var companyIn = h('input', { id: 'f-company', value: P.company, list: 'f-company-list', autocomplete: 'off' });
    var noIn = h('input', { id: 'f-policyNo', value: P.policyNo, class: 'mono-input', autocomplete: 'off' });
    var startIn = UI.dateInput('f-startDate', P.startDate, function (v) { P.startDate = v; autoEnd(); });
    var endIn = UI.dateInput('f-endDate', P.endDate, function (v) { P.endDate = v; P.endAuto = false; checkDates(); });
    var issueIn = UI.dateInput('f-issueDate', P.issueDate, function (v) { P.issueDate = v; });
    var insuredIn = h('input', { id: 'f-insuredName', value: P.insuredName, autocomplete: 'off', disabled: P.sameInsured });
    var sameBox = h('input', { type: 'checkbox', id: 'f-same', checked: P.sameInsured });
    var agentIn = h('input', { id: 'f-agent', value: P.agent, list: 'f-agent-list', autocomplete: 'off' });
    var catChip = h('span', { class: 'chip', id: 'f-cat' });

    function updateCat() {
      var cat = Schema.categoryOf(P.policyType);
      catChip.textContent = P.policyType ? Schema.categoryLabel(cat, window.I18N.lang) : t('form.catUnknown');
      vehicleNote.hidden = !P.policyType || Schema.isVehicleCategory(cat);
    }
    function updateInsured() {
      if (!P.sameInsured) return;
      var c = d.customerId && !d.editCustomer ? Store.customers.get(d.customerId) : null;
      var v = c ? c.name : d.customer.name;
      insuredIn.value = v || '';
      P.insuredName = '';
    }
    function autoEnd() {
      if (P.startDate && (P.endAuto || !P.endDate)) {
        P.endDate = U.addYears(P.startDate, 1);
        endIn.setValue(P.endDate, true);
        P.endAuto = true;
      }
      checkDates();
    }
    function checkDates() {
      var el = hints.endDate;
      UI.clear(el);
      el.className = 'hint';
      if (P.startDate && P.endDate && P.endDate <= P.startDate) { el.className = 'hint bad'; el.textContent = t('form.errDates'); return; }
      if (P.endDate) {
        var days = U.diffDays(U.todayISO(), P.endDate);
        el.textContent = days >= 0 ? t('form.endsIn', { n: days }) : t('form.endedAgo', { n: -days });
      }
    }
    function checkNo() {
      var el = hints.policyNo;
      UI.clear(el);
      el.className = 'hint';
      var v = U.fold(P.policyNo).replace(/ /g, '');
      if (!v) return;
      var dup = null;
      Store.policies.forEach(function (p) { if (!dup && p.id !== route.policyId && p.policyNo && U.fold(p.policyNo).replace(/ /g, '') === v) dup = p; });
      if (dup) {
        var c = Store.customers.get(dup.customerId);
        el.className = 'hint warn';
        el.appendChild(icon('triangle-alert'));
        el.appendChild(document.createTextNode(t('form.dupNo', { name: c ? c.name : '', month: F.month(dup.month) })));
      }
    }
    bindPolicy('policyType', typeIn, updateCat);
    bindPolicy('company', companyIn);
    bindPolicy('policyNo', noIn, checkNo);
    bindPolicy('agent', agentIn);
    insuredIn.addEventListener('input', function () { P.insuredName = insuredIn.value; });
    sameBox.addEventListener('change', function () {
      P.sameInsured = sameBox.checked;
      insuredIn.disabled = P.sameInsured;
      if (P.sameInsured) updateInsured(); else { insuredIn.value = P.insuredName || ''; insuredIn.focus(); }
    });

    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('field.newBusiness'), id: 'f-newBusiness' });
    function drawSeg() {
      UI.clear(seg);
      [[true, t('common.newBusiness')], [false, t('common.renewal')], [null, t('form.unspecified')]].forEach(function (o) {
        seg.appendChild(h('button', { type: 'button', 'aria-pressed': String(P.newBusiness === o[0]), onClick: function () { P.newBusiness = o[0]; drawSeg(); } }, o[1]));
      });
    }
    drawSeg();

    var quick = h('div', { class: 'mini-actions' },
      [[1, 'form.plus1y'], [0.5, 'form.plus6m'], [1 / 12, 'form.plus1m']].map(function (q) {
        return h('button', { type: 'button', onClick: function () {
          var base = P.startDate || U.todayISO();
          P.endDate = q[0] === 1 ? U.addYears(base, 1) : U.addMonths(base, Math.round(q[0] * 12));
          P.endAuto = false;
          endIn.setValue(P.endDate, true);
          checkDates();
        } }, t(q[1]));
      }));

    // ---------------- vehicle
    var plateIn = h('input', { id: 'f-plate', value: P.plate, class: 'mono-input', autocomplete: 'off', placeholder: '34 ABC 123', style: { textTransform: 'uppercase' } });
    var serialIn = h('input', { id: 'f-serialNo', value: P.serialNo, class: 'mono-input', autocomplete: 'off', style: { textTransform: 'uppercase' } });
    var stepIn = h('input', { id: 'f-step', value: P.step, inputmode: 'numeric', list: 'f-step-list', autocomplete: 'off' });
    var vehicleNote = h('div', { class: 'callout', hidden: true }, icon('info'), h('span', { class: 'small' }, t('form.vehicleOptional')));
    function checkPlate() {
      var el = hints.plate;
      UI.clear(el);
      el.className = 'hint';
      if (!P.plate) return;
      if (U.isValidPlate(P.plate)) {
        el.className = 'hint good';
        el.appendChild(icon('circle-check'));
        var owner = null;
        Store.policies.forEach(function (p) { if (!owner && p.plate && U.plateKey(p.plate) === U.plateKey(P.plate) && p.customerId !== d.customerId) owner = p; });
        el.appendChild(document.createTextNode(owner ? ' ' + t('form.plateOther', { name: (Store.customers.get(owner.customerId) || {}).name || '' }) : ' ' + t('form.plateOk')));
      } else { el.className = 'hint warn'; el.appendChild(icon('triangle-alert')); el.appendChild(document.createTextNode(t('form.plateBad'))); }
    }
    plateIn.addEventListener('input', function () { P.plate = plateIn.value; checkPlate(); });
    plateIn.addEventListener('blur', function () { if (plateIn.value) { plateIn.value = U.normalizePlate(plateIn.value); P.plate = plateIn.value; checkPlate(); } });
    serialIn.addEventListener('input', function () { P.serialNo = serialIn.value.toUpperCase(); });
    bindPolicy('step', stepIn);

    // ---------------- money
    function moneyInput(key) {
      var el = h('input', { id: 'f-' + key, value: P[key], inputmode: 'decimal', autocomplete: 'off', class: 'num', style: { textAlign: 'right' } });
      el.addEventListener('input', function () { P[key] = el.value; moneyChanged(key); });
      el.addEventListener('blur', function () {
        var n = U.parseNumber(el.value);
        if (n != null) { el.value = U.fmtNumber(n, window.I18N.lang, 2); P[key] = el.value; }
      });
      return el;
    }
    function affix(el, sym) { return h('div', { class: 'input-affix left' }, el, h('span', { class: 'affix' }, sym || '₺')); }
    var premiumIn = moneyInput('premium'), commIn = moneyInput('commission'), netIn = moneyInput('netPremium');
    var cardIn = moneyInput('card'), accIn = moneyInput('account'), cashIn = moneyInput('cash');
    var rateIn = h('input', { id: 'f-rate', inputmode: 'decimal', autocomplete: 'off', class: 'num', style: { textAlign: 'right' } });
    var payInfo = h('div', { class: 'small', id: 'pay-info' });
    var meter = h('div', { class: 'pay-meter', 'aria-hidden': 'true' });
    function num(k) { return U.parseNumber(P[k]) || 0; }
    function moneyChanged(key) {
      if (key === 'premium' || key === 'commission') {
        var pr = num('premium'), cm = num('commission');
        if (key === 'commission' || document.activeElement !== rateIn) rateIn.value = pr && cm ? U.fmtNumber(cm / pr * 100, window.I18N.lang, 2) : '';
      }
      if (key === 'premium' && d.oldPremium) {
        var el = hints.premium;
        var np = num('premium');
        el.className = 'hint';
        el.textContent = np ? t('form.vsOld', { old: F.money(d.oldPremium), p: F.pct((np - d.oldPremium) / d.oldPremium) }) : t('form.oldPremium', { old: F.money(d.oldPremium) });
      }
      drawPay();
    }
    rateIn.addEventListener('input', function () {
      var r = U.parseNumber(rateIn.value), pr = num('premium');
      if (r != null && pr) { P.commission = U.fmtNumber(U.round2(pr * r / 100), window.I18N.lang, 2); commIn.value = P.commission; drawPay(); }
    });
    function drawPay() {
      var pr = num('premium'), paid = num('card') + num('account') + num('cash');
      UI.clear(meter);
      if (pr > 0) {
        [['card', 'var(--chart-1)'], ['cash', 'var(--chart-2)'], ['account', 'var(--chart-3)']].forEach(function (x) {
          var v = num(x[0]);
          if (v > 0) meter.appendChild(h('span', { style: { width: Math.min(100, v / Math.max(pr, paid) * 100) + '%', background: x[1] } }));
        });
      }
      UI.clear(payInfo);
      if (!pr && !paid) { payInfo.className = 'small muted'; payInfo.textContent = t('form.payHint'); return; }
      var diff = U.round2(pr - paid);
      payInfo.className = 'small ' + (Math.abs(diff) < 0.01 ? '' : 'muted');
      payInfo.appendChild(document.createTextNode(t('form.payTotal', { paid: F.money(paid), premium: F.money(pr) }) + ' '));
      if (Math.abs(diff) < 0.01) payInfo.appendChild(UI.pill(t('form.payBalanced'), 'good'));
      else payInfo.appendChild(UI.pill(diff > 0 ? t('form.payMissing', { v: F.money(diff) }) : t('form.payOver', { v: F.money(-diff) }), 'warn'));
    }
    function fillAll(key) {
      var pr = num('premium');
      if (!pr) { premiumIn.focus(); return; }
      ['card', 'account', 'cash'].forEach(function (k) { P[k] = k === key ? U.fmtNumber(pr, window.I18N.lang, 2) : ''; });
      cardIn.value = P.card; accIn.value = P.account; cashIn.value = P.cash;
      drawPay();
    }

    // ---------------- custom fields
    var extraBox = h('div', { class: 'form-grid' });
    function drawExtras() {
      UI.clear(extraBox);
      var keys = Array.from(new Set(sug.extraFields.concat(Object.keys(P.extras))));
      keys.forEach(function (k, i) {
        var el = h('input', { id: 'f-x-' + i, value: P.extras[k] || '', autocomplete: 'off', 'data-extra': k });
        el.addEventListener('input', function () { if (el.value) P.extras[k] = el.value; else delete P.extras[k]; });
        extraBox.appendChild(h('div', { class: 'span-4' }, UI.field({ id: 'f-x-' + i, label: k, input: el })));
      });
      var nk = h('input', { id: 'f-newx-name', placeholder: t('form.newFieldName'), autocomplete: 'off' });
      var nv = h('input', { id: 'f-newx-value', placeholder: t('form.newFieldValue'), autocomplete: 'off' });
      extraBox.appendChild(h('div', { class: 'span-12 row', style: { alignItems: 'flex-end' } },
        h('div', { class: 'field', style: { flex: '1 1 180px' } }, h('label', { for: 'f-newx-name' }, t('form.addField')), nk),
        h('div', { class: 'field', style: { flex: '1 1 180px' } }, h('label', { for: 'f-newx-value', class: 'sr-only' }, t('form.newFieldValue')), nv),
        h('button', { type: 'button', class: 'btn', onClick: function () {
          var k = U.collapse(nk.value);
          if (!k) { nk.focus(); return; }
          P.extras[k] = nv.value || '';
          if (sug.extraFields.indexOf(k) < 0) sug.extraFields.push(k);
          drawExtras();
        } }, icon('plus'), t('common.add'))));
    }
    drawExtras();

    var noteIn = h('textarea', { id: 'f-note', rows: 3 }, P.note || '');
    noteIn.addEventListener('input', function () { P.note = noteIn.value; });

    // ---------------- layout
    var keepBox = h('input', { type: 'checkbox', id: 'f-keep', checked: d.keepCustomer, onChange: function (e) { d.keepCustomer = e.target.checked; } });
    var form = h('form', { class: 'card', id: 'policy-form', novalidate: true, onSubmit: function (e) { e.preventDefault(); save(false); } },
      h('div', { class: 'card-body stack', style: { gap: '0' } },
        h('div', { class: 'form-section' },
          h('div', { class: 'form-section-title' }, icon('user'), t('form.secCustomer'), h('span', { class: 'sub' }, t('form.secCustomerSub'))),
          custBox),
        h('div', { class: 'form-section' },
          h('div', { class: 'form-section-title' }, icon('file-text'), t('form.secPolicy'), catChip),
          h('div', { class: 'form-grid' },
            h('div', { class: 'span-3' }, mkField('month', t('form.month'), monthIn, { req: true, hint: t('form.monthHint'), forId: 'f-month' })),
            h('div', { class: 'span-5' }, mkField('policyType', t('field.policyType'), typeIn, { req: true }), UI.datalist('f-type-list', sug.policyTypes)),
            h('div', { class: 'span-4' }, mkField('company', t('field.company'), companyIn), UI.datalist('f-company-list', sug.companies)),
            h('div', { class: 'span-4' }, mkField('policyNo', t('field.policyNo'), noIn)),
            h('div', { class: 'span-4' }, mkField('startDate', t('field.startDate'), startIn.input, { wrap: startIn, hint: t('form.startHint') })),
            h('div', { class: 'span-4' }, mkField('endDate', t('field.endDate'), endIn.input, { wrap: endIn, labelExtra: quick })),
            h('div', { class: 'span-4 span-full-sm' }, UI.field({ id: 'f-newBusiness', label: t('field.newBusiness'), input: seg })),
            h('div', { class: 'span-4' }, mkField('insuredName', t('field.insuredName'), insuredIn, { hint: h('label', { class: 'check small', for: 'f-same' }, sameBox, t('form.sameInsured')) })),
            h('div', { class: 'span-2' }, mkField('issueDate', t('field.issueDate'), issueIn.input, { wrap: issueIn })),
            h('div', { class: 'span-2' }, mkField('agent', t('field.agent'), agentIn), UI.datalist('f-agent-list', sug.agents)))),
        h('div', { class: 'form-section' },
          h('div', { class: 'form-section-title' }, icon('car'), t('form.secVehicle'), h('span', { class: 'sub' }, t('form.secVehicleSub'))),
          vehicleNote,
          h('div', { class: 'form-grid' },
            h('div', { class: 'span-4' }, mkField('plate', t('field.plate'), plateIn)),
            h('div', { class: 'span-4' }, mkField('serialNo', t('field.serialNo'), serialIn)),
            h('div', { class: 'span-4' }, mkField('step', t('field.step'), stepIn, { hint: t('form.stepHint') }), UI.datalist('f-step-list', ['1', '2', '3', '4', '5', '6', '7', '8'])))),
        h('div', { class: 'form-section' },
          h('div', { class: 'form-section-title' }, icon('banknote'), t('form.secMoney')),
          h('div', { class: 'form-grid' },
            h('div', { class: 'span-4' }, mkField('premium', t('field.premium'), premiumIn, { wrap: affix(premiumIn) })),
            h('div', { class: 'span-3' }, mkField('commission', t('field.commission'), commIn, { wrap: affix(commIn) })),
            h('div', { class: 'span-2' }, UI.field({ id: 'f-rate', label: t('form.rate'), input: h('div', { class: 'input-affix' }, rateIn, h('span', { class: 'affix' }, '%')) })),
            h('div', { class: 'span-3' }, mkField('netPremium', t('field.netPremium'), netIn, { wrap: affix(netIn) })),
            h('div', { class: 'span-12 field-label', style: { marginTop: '4px' } }, t('form.payment'),
              h('span', { class: 'mini-actions', style: { marginLeft: '8px' } },
                h('button', { type: 'button', id: 'fill-card', onClick: function () { fillAll('card'); } }, t('form.allCard')),
                h('button', { type: 'button', id: 'fill-cash', onClick: function () { fillAll('cash'); } }, t('form.allCash')),
                h('button', { type: 'button', id: 'fill-account', onClick: function () { fillAll('account'); } }, t('form.allAccount')))),
            h('div', { class: 'span-4' }, mkField('card', t('field.card'), cardIn, { wrap: affix(cardIn) })),
            h('div', { class: 'span-4' }, mkField('cash', t('field.cash'), cashIn, { wrap: affix(cashIn) })),
            h('div', { class: 'span-4' }, mkField('account', t('field.account'), accIn, { wrap: affix(accIn), hint: t('form.accountHint') })),
            h('div', { class: 'span-12 stack', style: { gap: '6px' } }, meter, payInfo))),
        h('div', { class: 'form-section' },
          h('div', { class: 'form-section-title' }, icon('notebook-pen'), t('form.secNotes')),
          UI.field({ id: 'f-note', label: t('field.note'), input: noteIn }),
          h('div', { class: 'eyebrow' }, t('form.customFields')),
          extraBox)),
      h('div', { class: 'sticky-actions' },
        h('button', { type: 'button', class: 'btn', id: 'form-cancel', onClick: function () {
          App.viewState.form = null;
          var back = App.prevHash && App.prevHash !== location.hash.slice(1) ? App.prevHash : (d.customerId ? 'musteri-' + d.customerId : 'panel');
          App.go(back);
        } }, t('common.cancel')),
        h('span', { class: 'spacer' }),
        h('span', { class: 'small muted shortcut-hint' }, t('form.shortcut')),
        route.policyId ? null : h('label', { class: 'check small', for: 'f-keep' }, keepBox, t('form.keepCustomer')),
        route.policyId ? null : h('button', { type: 'button', class: 'btn', id: 'save-new', onClick: function () { save(true); } }, icon('plus'), t('form.saveNew')),
        h('button', { type: 'submit', class: 'btn btn-primary', id: 'save-policy', title: t('form.shortcut') }, icon('save'), route.policyId ? t('form.saveChanges') : t('common.save'))));

    form.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'Enter')) { e.preventDefault(); save(false); }
    });

    function showErrors(errs) {
      Object.keys(fieldsEl).forEach(function (k) { fieldsEl[k].classList.toggle('invalid', !!errs[k]); });
      Object.keys(errs).forEach(function (k) {
        if (hints[k]) { hints[k].className = 'hint bad'; hints[k].textContent = errs[k]; }
      });
      var first = Object.keys(errs)[0];
      if (first && inputs[first]) inputs[first].focus();
      else if (first) UI.toast(errs[first], { type: 'bad' });
    }

    function save(again) {
      var errs = errorsOf(d);
      if (Object.keys(errs).length) { showErrors(errs); UI.toast(t('form.fixErrors'), { type: 'bad' }); return; }
      var pol = {};
      Portfolio.POLICY_FIELDS.forEach(function (k) {
        var v = P[k];
        if (MONEY_KEYS.indexOf(k) >= 0) v = U.parseNumber(v);
        else if (k === 'step') v = U.parseIntSafe(v);
        else if (k === 'plate') v = v ? U.normalizePlate(v) : '';
        else if (k === 'serialNo') v = v ? U.collapse(v).toUpperCase() : '';
        else if (k === 'newBusiness') v = P.newBusiness;
        else if (typeof v === 'string') v = U.collapse(v);
        pol[k] = v;
      });
      pol.newBusiness = P.newBusiness;
      if (P.sameInsured) {
        var c0 = d.customerId && !d.editCustomer ? Store.customers.get(d.customerId) : null;
        pol.insuredName = c0 ? c0.name : U.tidyName(d.customer.name);
      }
      pol.month = P.month;
      pol.extras = Object.assign({}, P.extras);
      if (d.renewOf) pol.renewalOf = d.renewOf;
      var custData = null;
      if (!d.customerId || d.editCustomer) {
        custData = {};
        CUST_KEYS.forEach(function (k) { custData[k] = d.customer[k]; });
        custData.name = U.tidyName(custData.name);
      }
      var res = Store.savePolicy({ id: route.policyId || null, customerId: d.customerId, customer: custData || {}, policy: pol });
      UI.toast(route.policyId ? t('form.updated') : t('form.saved', { name: res.customer.name }), {
        action: again ? { label: t('form.openCustomer'), fn: function () { App.go('musteri-' + res.customer.id); } } : null
      });
      if (again) {
        var keep = d.keepCustomer;
        var month = P.month;
        App.viewState.form = null;
        if (location.hash !== '#yeni') { location.hash = 'yeni'; }
        var nd = draftFrom({ month: month });
        nd.key = '#yeni';
        nd.keepCustomer = keep;
        if (keep) nd.customerId = res.customer.id;
        App.viewState.form = nd;
        App.render();
        setTimeout(function () { var f = document.getElementById(keep ? 'f-policyType' : 'f-name'); if (f) f.focus(); }, 30);
      } else {
        App.viewState.form = null;
        App.go('musteri-' + res.customer.id);
      }
    }

    inputs.month = monthIn.querySelector('select');
    drawCustomer();
    updateCat();
    updateInsured();
    if (!P.sameInsured) insuredIn.value = P.insuredName || '';
    checkDates();
    checkNo();
    checkPlate();
    moneyChanged('premium');
    if (P.premium && P.commission) moneyChanged('commission');

    var banner = null;
    if (route.renewId) {
      var old = Store.policies.get(route.renewId);
      banner = h('div', { class: 'callout' }, icon('refresh-cw'), h('div', null, h('strong', null, t('form.renewBannerTitle')), h('div', { class: 'small' }, t('form.renewBanner', { type: old.policyType || '', no: old.policyNo || '—', date: F.date(old.endDate) }))));
    }
    return h('div', { class: 'stack' }, banner, form);
  }

  App.refreshTitle = function () {
    var v = App.views[App.route.view];
    var el = document.getElementById('page-sub');
    if (v && v.sub && el) el.textContent = v.sub(App.route) || '';
  };
})();
