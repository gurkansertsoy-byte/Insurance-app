/* Customers: list, customer 360 page, edit dialog, duplicates */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, Schema = window.Schema, Portfolio = window.Portfolio, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon, F = UI.F;

  function lang() { return window.I18N.lang; }
  function masked() { return !!Store.settings.maskIds; }

  // ------------------------------------------------------------------ shared helpers
  App.phoneLinks = function (phone, waText) {
    if (!phone) return h('span', { class: 'muted' }, '—');
    var wa = U.whatsappUrl(phone, waText || '');
    return h('span', { class: 'row tight', style: { flexWrap: 'nowrap' } },
      h('a', { class: 'nowrap num', href: 'tel:' + (U.normalizePhone(phone).length === 10 ? '+90' + U.normalizePhone(phone) : phone), title: t('customer.call') }, U.formatPhone(phone)),
      wa ? h('a', { class: 'icon-btn sm wa', href: wa, target: '_blank', rel: 'noopener', title: t('customer.whatsapp'), 'aria-label': t('customer.whatsapp') }, icon('message-circle')) : null);
  };

  App.catChips = function (cats) {
    return h('span', { class: 'chips' }, cats.slice(0, 3).map(function (c) { return h('span', { class: 'chip' }, Schema.categoryLabel(c, lang())); }),
      cats.length > 3 ? h('span', { class: 'chip' }, '+' + (cats.length - 3)) : null);
  };

  App.monthChips = function (months, max) {
    max = max || 3;
    var shown = months.slice(-max).reverse();
    return h('span', { class: 'chips' }, shown.map(function (m) { return h('a', { class: 'chip month', href: '#ay-' + m }, F.month(m, true)); }),
      months.length > max ? h('span', { class: 'chip', title: months.map(function (m) { return F.month(m); }).join(', ') }, '+' + (months.length - max)) : null);
  };

  App.newBizTag = function (v) {
    if (v === true) return h('span', { class: 'tag-new' }, t('common.newBusiness'));
    if (v === false) return h('span', { class: 'tag-ren' }, t('common.renewal'));
    return null;
  };

  App.waMessage = function (p, c) {
    var tpl = Store.settings.waTemplate || t('settings.waDefault');
    var first = c && c.name ? U.collapse(c.name).split(' ')[0] : '';
    var info = Store.derived().renewal.get(p.id);
    var map = {
      ad: first, adsoyad: c ? c.name : '', police: p.policyType || '', sirket: Store.companyLabel(p.company),
      plaka: p.plate || '', plakaMetni: p.plate ? ' (' + p.plate + ')' : '', bitis: F.date(p.endDate),
      gun: info && info.daysLeft != null ? String(info.daysLeft) : '', acente: Store.settings.agencyName || '', acenteTel: Store.settings.agencyPhone || ''
    };
    return tpl.replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : m; }).replace(/\s+([,.!?])/g, '$1').replace(/ {2,}/g, ' ').trim();
  };

  // ------------------------------------------------------------------ customer edit dialog
  App.editCustomer = function (c, onSaved) {
    var isNew = !c;
    c = c || {};
    var sug = Store.suggestions();
    var f = {
      name: h('input', { id: 'ce-name', value: c.name || '', required: true, autocomplete: 'off' }),
      tc: h('input', { id: 'ce-tc', value: c.tc || '', inputmode: 'numeric', class: 'mono-input', maxlength: 14, autocomplete: 'off' }),
      phone: h('input', { id: 'ce-phone', value: c.phone ? U.formatPhone(c.phone) : '', inputmode: 'tel', autocomplete: 'off' }),
      phones: h('input', { id: 'ce-phones', value: Portfolio.phonesOf(c).filter(function (p) { return p !== c.phone; }).map(U.formatPhone).join(', '), autocomplete: 'off' }),
      email: h('input', { id: 'ce-email', type: 'email', value: c.email || '', autocomplete: 'off' }),
      profession: h('input', { id: 'ce-prof', value: c.profession || '', list: 'ce-prof-list', autocomplete: 'off' }),
      address: h('input', { id: 'ce-address', value: c.address || '', autocomplete: 'off' }),
      birthDate: UI.dateInput('ce-birth', c.birthDate || ''),
      tags: h('input', { id: 'ce-tags', value: (c.tags || []).join(', '), placeholder: t('customer.tagsPh'), autocomplete: 'off' }),
      notes: h('textarea', { id: 'ce-notes', rows: 3 }, c.notes || '')
    };
    var tcHint = h('div', { class: 'hint', id: 'ce-tc-hint' });
    function checkTc() { App.tcHint(tcHint, f.tc.value, c.id); }
    f.tc.addEventListener('input', checkTc);
    checkTc();
    var nameField = UI.field({ id: 'ce-name', label: t('field.name'), req: true, input: f.name, hint: '' });
    var m = UI.modal({
      title: isNew ? t('customer.newTitle') : t('customer.editTitle'), icon: 'user', size: 'wide',
      body: [
        h('div', { class: 'form-grid' },
          h('div', { class: 'span-6' }, nameField),
          h('div', { class: 'span-6' }, UI.field({ id: 'ce-tc', label: t('field.tc'), input: f.tc, hint: tcHint })),
          h('div', { class: 'span-4' }, UI.field({ id: 'ce-phone', label: t('customer.mainPhone'), input: f.phone })),
          h('div', { class: 'span-4' }, UI.field({ id: 'ce-phones', label: t('customer.otherPhones'), input: f.phones, hint: t('customer.otherPhonesHint') })),
          h('div', { class: 'span-4' }, UI.field({ id: 'ce-email', label: t('field.email'), input: f.email })),
          h('div', { class: 'span-4' }, UI.field({ id: 'ce-prof', label: t('field.profession'), input: f.profession }), UI.datalist('ce-prof-list', sug.professions)),
          h('div', { class: 'span-4' }, UI.field({ id: 'ce-birth', label: t('field.birthDate'), input: f.birthDate })),
          h('div', { class: 'span-4' }, UI.field({ id: 'ce-tags', label: t('customer.tags'), input: f.tags })),
          h('div', { class: 'span-12' }, UI.field({ id: 'ce-address', label: t('field.address'), input: f.address })),
          h('div', { class: 'span-12' }, UI.field({ id: 'ce-notes', label: t('customer.notes'), input: f.notes })))
      ],
      foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.cancel')),
        h('button', { type: 'submit', class: 'btn btn-primary', id: 'ce-save' }, icon('save'), t('common.save'))],
      onSubmit: function () {
        if (!U.collapse(f.name.value)) {
          nameField.classList.add('invalid');
          nameField.querySelector('.hint').textContent = t('form.errName');
          nameField.querySelector('.hint').className = 'hint bad';
          f.name.focus();
          return;
        }
        var main = U.normalizePhone(f.phone.value);
        var others = f.phones.value.split(/[,;\n]/).map(U.normalizePhone).filter(function (x) { return x.length >= 7; });
        // a replaced main number stays as another phone, so later Excel rows with it still match
        if (c.phone && c.phone !== main) others.push(c.phone);
        var phones = [main].concat(others).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        var saved = Store.saveCustomer({
          id: c.id, name: f.name.value, tc: f.tc.value, phone: main, phones: phones, email: f.email.value,
          profession: f.profession.value, address: f.address.value, birthDate: f.birthDate.getValue(),
          tags: f.tags.value.split(',').map(U.collapse).filter(Boolean), notes: f.notes.value
        });
        m.close();
        UI.toast(isNew ? t('customer.created') : t('customer.saved'));
        if (onSaved) onSaved(saved);
      }
    });
  };

  /** Live TC / VKN feedback; mentions an existing customer with the same number. */
  App.tcHint = function (el, value, selfId, onPick) {
    UI.clear(el);
    var v = U.normalizeId(value);
    el.className = 'hint';
    if (!v) { el.textContent = t('form.tcHint'); return null; }
    var kind = U.idKind(v);
    if (kind === 'tckn') { el.className = 'hint good'; el.appendChild(icon('circle-check')); el.appendChild(document.createTextNode(t('id.tcknOk'))); }
    else if (kind === 'vkn') { el.className = 'hint good'; el.appendChild(icon('circle-check')); el.appendChild(document.createTextNode(t('id.vknOk'))); }
    else {
      el.className = 'hint warn';
      el.appendChild(icon('triangle-alert'));
      el.appendChild(document.createTextNode(v.length === 11 || v.length === 10 ? t('id.checksumBad') : t('id.lengthBad', { n: v.length })));
    }
    var other = Store.findCustomerByTc(v);
    if (other && other.id !== selfId) {
      el.className = 'hint warn';
      el.appendChild(document.createTextNode(' · ' + t('form.tcExists', { name: other.name }) + ' '));
      if (onPick) el.appendChild(h('button', { type: 'button', class: 'btn btn-sm', onClick: function () { onPick(other); } }, t('form.useThis')));
      else el.appendChild(h('a', { href: '#musteri-' + other.id }, t('common.open')));
    }
    return other;
  };

  // ------------------------------------------------------------------ list
  function filterCustomers(vs) {
    var d = Store.derived();
    var list;
    if (U.collapse(vs.q).length >= 2) list = Store.search(vs.q, 1e9).customers.map(function (r) { return r.c; });
    else list = Array.from(Store.customers.values());
    var win = Number(Store.settings.renewalWindow) || 30;
    return list.filter(function (c) {
      var s = Store.summary(c.id);
      if (vs.multi && s.months.length < 2) return false;
      if (vs.due && !(s.nextDays != null && s.nextDays <= win)) return false;
      if (vs.open && !(s.outstanding > 0)) return false;
      if (vs.month && s.months.indexOf(vs.month) < 0) return false;
      if (vs.cat && s.cats.indexOf(vs.cat) < 0) return false;
      if (vs.company) {
        var ps = d.byCustomer.get(c.id) || [];
        if (!ps.some(function (p) { return p.company && U.companyKey(p.company) === vs.company; })) return false;
      }
      return true;
    });
  }

  function companyOptions() {
    var d = Store.derived();
    var opts = [{ value: '', label: t('customers.allCompanies') }];
    Array.from(d.companyNames.entries()).sort(function (a, b) { return U.cmp(a[1], b[1]); }).forEach(function (e) { opts.push({ value: e[0], label: e[1] }); });
    return opts;
  }
  App.companyOptions = companyOptions;

  function categoryOptions(allLabel) {
    var d = Store.derived();
    var present = new Set(d.policies.map(function (p) { return Schema.categoryOf(p.policyType); }));
    return [{ value: '', label: allLabel || t('customers.allCategories') }].concat(Schema.CATEGORIES.filter(function (c) { return present.has(c.key); }).map(function (c) { return { value: c.key, label: lang() === 'en' ? c.en : c.tr }; }));
  }
  App.categoryOptions = categoryOptions;

  function monthOptions(allLabel) {
    var d = Store.derived();
    return [{ value: '', label: allLabel || t('customers.allMonths') }].concat(d.months.slice().reverse().map(function (m) { return { value: m, label: F.month(m) }; }));
  }
  App.monthOptions = monthOptions;

  App.views.customers = {
    title: function () { return t('nav.customers'); },
    sub: function () { return t('customers.sub', { n: F.num(Store.customers.size) }); },
    render: function () {
      var vs = App.viewState.customers = Object.assign({ q: '', company: '', cat: '', month: '', multi: false, due: false, open: false, sortKey: 'name', sortDir: 1 }, App.viewState.customers || {});
      if (!Store.customers.size) {
        return h('section', { class: 'card' }, UI.empty({ icon: 'users', title: t('customers.emptyTitle'), text: t('customers.emptyText'),
          actions: [h('a', { class: 'btn btn-primary', href: '#ice-aktar' }, icon('upload'), t('nav.import')), h('a', { class: 'btn', href: '#yeni' }, icon('plus'), t('nav.newRecord'))] }));
      }
      var count = h('span', { class: 'result-count', id: 'customers-count' });
      var table = new UI.TableView({
        sortKey: vs.sortKey, sortDir: vs.sortDir, pageSize: Number(Store.settings.pageSize) || 50,
        onSort: function (k, dir) { vs.sortKey = k; vs.sortDir = dir; },
        onRowClick: function (c) { App.go('musteri-' + c.id); },
        empty: UI.empty({ icon: 'search', title: t('customers.noMatch'), text: t('customers.noMatchText') }),
        columns: [
          { key: 'name', label: t('common.customer'), sort: function (c) { return c.name; }, cls: 'name-cell', render: function (c) {
            return h('div', { class: 'row', style: { flexWrap: 'nowrap', gap: '10px' } }, h('span', { class: 'avatar sm' }, UI.initials(c.name)),
              h('div', { style: { minWidth: 0 } }, h('a', { href: '#musteri-' + c.id, style: { color: 'inherit' } }, UI.highlight(c.name, vs.q)), h('span', { class: 'sub' }, c.profession || ' ')));
          } },
          { key: 'tc', label: t('field.tc'), sort: function (c) { return c.tc; }, render: function (c) { return UI.idBadge(c.tc, masked()); } },
          { key: 'phone', label: t('field.phone'), render: function (c) { return App.phoneLinks(c.phone); } },
          { key: 'count', label: t('customers.colPolicies'), align: 'r', sort: function (c) { return Store.summary(c.id).count; }, render: function (c) {
            var s = Store.summary(c.id);
            return h('div', { class: 'cellstack', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' } }, h('strong', null, F.num(s.count)), App.catChips(s.cats));
          } },
          { key: 'months', label: t('customers.colMonths'), sort: function (c) { return Store.summary(c.id).months.length; }, render: function (c) { return App.monthChips(Store.summary(c.id).months); } },
          { key: 'premium', label: t('customers.colPremium'), align: 'r', sort: function (c) { return Store.summary(c.id).premium; }, render: function (c) { return F.money(Store.summary(c.id).premium); } },
          { key: 'commission', label: t('field.commission'), align: 'r', sort: function (c) { return Store.summary(c.id).commission; }, render: function (c) { return F.money(Store.summary(c.id).commission); } },
          { key: 'next', label: t('customers.colNext'), sort: function (c) { return Store.summary(c.id).nextEnd; }, render: function (c) {
            var s = Store.summary(c.id);
            if (!s.nextEnd) return h('span', { class: 'muted' }, '—');
            return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' } }, h('span', { class: 'num' }, F.date(s.nextEnd)), s.nextDays <= 60 ? App.daysPill(s.nextDays) : null);
          } }
        ],
        footer: function (rows) {
          return [h('td', { class: 'full' }, t('customers.footer', { n: F.num(rows.length) })), h('td'), h('td'),
            h('td', { class: 'r' }, F.num(U.sum(rows, function (c) { return Store.summary(c.id).count; }))), h('td'),
            h('td', { class: 'r', 'data-label': t('customers.colPremium') }, F.money(U.sum(rows, function (c) { return Store.summary(c.id).premium; }))),
            h('td', { class: 'r', 'data-label': t('field.commission') }, F.money(U.sum(rows, function (c) { return Store.summary(c.id).commission; }))), h('td')];
        }
      });
      function apply() {
        var rows = filterCustomers(vs);
        table.setRows(rows);
        count.textContent = t('customers.count', { n: F.num(rows.length) });
      }
      var search = h('input', { type: 'search', id: 'customers-q', value: vs.q, placeholder: t('customers.searchPh'), 'aria-label': t('customers.searchPh'), autocomplete: 'off', onInput: U.debounce(function (e) { vs.q = e.target.value; apply(); }, 120) });
      function chip(key, label) {
        return h('button', { type: 'button', class: 'filter-chip', 'aria-pressed': String(!!vs[key]), id: 'chip-' + key, onClick: function (e) {
          vs[key] = !vs[key]; e.currentTarget.setAttribute('aria-pressed', String(vs[key])); apply();
        } }, label);
      }
      var toolbar = h('div', { class: 'toolbar' },
        h('div', { class: 'search-local' }, icon('search'), search),
        UI.select('customers-company', companyOptions(), vs.company, { onChange: function (e) { vs.company = e.target.value; apply(); }, 'aria-label': t('field.company') }),
        UI.select('customers-cat', categoryOptions(), vs.cat, { onChange: function (e) { vs.cat = e.target.value; apply(); }, 'aria-label': t('report.category') }),
        UI.select('customers-month', monthOptions(), vs.month, { onChange: function (e) { vs.month = e.target.value; apply(); }, 'aria-label': t('common.month') }));
      var chips = h('div', { class: 'toolbar' },
        chip('multi', t('customers.multiOnly')), chip('due', t('customers.dueOnly', { n: Store.settings.renewalWindow })), chip('open', t('customers.openOnly')),
        h('span', { class: 'spacer' }), count,
        h('button', { type: 'button', class: 'btn btn-sm', onClick: App.showDuplicates, id: 'btn-duplicates' }, icon('git-merge'), t('dup.button')),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'customers-export', onClick: function () { App.exportCustomers(filterCustomers(vs)); } }, icon('file-down'), t('common.exportExcel')),
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'customers-add', onClick: function () { App.editCustomer(null, function (c) { App.go('musteri-' + c.id); }); } }, icon('user-plus'), t('customers.add')));
      apply();
      return h('div', { class: 'stack' }, toolbar, chips, h('section', { class: 'card', style: { overflow: 'hidden' } }, table.el));
    }
  };

  // ------------------------------------------------------------------ customer 360
  var ACT_ICON = { note: 'sticky-note', call: 'phone', meeting: 'users', whatsapp: 'message-circle', email: 'mail', policyAdded: 'file-text', policyUpdated: 'pencil', policyDeleted: 'trash-2', payment: 'hand-coins', renewalStatus: 'refresh-cw', customerAdded: 'user-plus', taskDone: 'circle-check', merged: 'git-merge' };
  var NOTE_KINDS = ['note', 'call', 'meeting', 'whatsapp', 'email'];

  function policyDetail(p, c) {
    var info = Store.derived().renewal.get(p.id);
    var items = [];
    function add(k, v) { if (v != null && v !== '') items.push(h('div', null, h('div', { class: 'k' }, k), h('div', null, v))); }
    add(t('field.policyType'), p.policyType);
    add(t('report.category'), Schema.categoryLabel(Schema.categoryOf(p.policyType), lang()));
    add(t('field.company'), Store.companyLabel(p.company));
    add(t('field.policyNo'), p.policyNo ? h('span', { class: 'mono' }, p.policyNo) : null);
    add(t('common.month'), h('a', { href: '#ay-' + p.month }, F.month(p.month)));
    add(t('field.startDate'), F.date(p.startDate));
    add(t('field.endDate'), F.date(p.endDate));
    add(t('field.issueDate'), F.date(p.issueDate));
    add(t('field.newBusiness'), p.newBusiness === true ? t('common.yes') : p.newBusiness === false ? t('common.no') + ' (' + t('common.renewal') + ')' : '');
    add(t('field.insuredName'), p.insuredName);
    add(t('field.plate'), p.plate ? UI.plate(p.plate) : null);
    add(t('field.serialNo'), p.serialNo ? h('span', { class: 'mono' }, p.serialNo) : null);
    add(t('field.step'), p.step);
    add(t('field.premium'), p.premium != null ? F.money(p.premium) : null);
    add(t('field.netPremium'), p.netPremium != null ? F.money(p.netPremium) : null);
    add(t('field.commission'), p.commission != null ? F.money(p.commission) + (p.premium ? ' (' + F.pct(p.commission / p.premium) + ')' : '') : null);
    add(t('field.card'), p.card ? F.money(p.card) : null);
    add(t('field.account'), p.account ? F.money(p.account) + (p.payments && p.payments.length ? ' · ' + t('collections.paidShort', { v: F.money(Portfolio.paidOnAccount(p)) }) : '') : null);
    add(t('field.cash'), p.cash ? F.money(p.cash) : null);
    add(t('field.agent'), p.agent);
    add(t('renewals.status'), info ? App.statePill(info, p) : null);
    if (p.renewal && p.renewal.note) add(t('renewals.note'), p.renewal.note);
    if (p.extras) Object.keys(p.extras).forEach(function (k) { add(k, p.extras[k]); });
    add(t('field.note'), p.note);
    if (p.row && p.row.tc && c && p.row.tc !== c.tc) add(t('customer.rowTc'), UI.idBadge(p.row.tc, masked()));
    add(t('customer.source'), p.source && p.source.type === 'import'
      ? t('customer.sourceImport', { file: p.source.file || '', sheet: p.source.sheet || '', row: p.source.row || '' })
      : t('customer.sourceManual', { date: F.dateTime(p.createdAt) }));
    return h('div', { class: 'policy-detail' }, items,
      h('div', { style: { gridColumn: '1 / -1' }, class: 'row' },
        h('button', { type: 'button', class: 'btn btn-sm', onClick: function () { App.movePolicyDialog(p); } }, icon('arrow-right'), t('customer.moveTo'))));
  }

  App.policyActions = function (p, opts) {
    opts = opts || {};
    return h('div', { class: 'row tight', style: { flexWrap: 'nowrap' } },
      h('a', { class: 'icon-btn sm', href: '#duzenle-' + p.id, title: t('common.edit'), 'aria-label': t('common.edit') }, icon('pencil')),
      p.endDate ? h('a', { class: 'icon-btn sm', href: '#yenile-' + p.id, title: t('renewals.renew'), 'aria-label': t('renewals.renew') }, icon('refresh-cw')) : null,
      h('button', { type: 'button', class: 'icon-btn sm', title: t('common.delete'), 'aria-label': t('common.delete'), onClick: function () { App.deletePolicy(p); } }, icon('trash-2')));
  };

  App.deletePolicy = function (p) {
    var c = Store.customers.get(p.customerId);
    UI.confirm({ title: t('policy.deleteTitle'), message: t('policy.deleteMsg', { type: p.policyType || '', name: c ? c.name : '', month: F.month(p.month) }), danger: true, confirm: t('common.delete') })
      .then(function (ok) {
        if (!ok) return;
        var undo = Store.deletePolicy(p.id);
        UI.toast(t('policy.deleted'), { action: { label: t('common.undo'), fn: undo } });
      });
  };

  App.movePolicyDialog = function (p) {
    var results = h('div', { class: 'list', style: { maxHeight: '320px', overflowY: 'auto' } });
    var input = h('input', { class: 'input', id: 'move-q', placeholder: t('form.searchCustomer'), autocomplete: 'off' });
    var m;
    function run() {
      UI.clear(results);
      var r = Store.search(input.value, 12).customers.filter(function (x) { return x.c.id !== p.customerId; });
      if (!r.length) { results.appendChild(h('div', { class: 'muted small', style: { padding: '8px 4px' } }, U.collapse(input.value).length < 2 ? t('form.typeToSearch') : t('search.noResults', { q: input.value }))); return; }
      r.forEach(function (x) {
        results.appendChild(h('button', { type: 'button', class: 'list-item', style: { background: 'transparent', border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }, onClick: function () {
          Store.movePolicy(p.id, x.c.id);
          m.close();
          UI.toast(t('customer.moved', { name: x.c.name }));
        } }, h('span', { class: 'avatar sm' }, UI.initials(x.c.name)), h('div', { class: 'main' }, h('div', { class: 't' }, x.c.name), h('div', { class: 's' }, UI.items(x.c.tc ? (masked() ? U.maskId(x.c.tc) : x.c.tc) : '', x.c.phone ? U.formatPhone(x.c.phone) : '')))));
      });
    }
    input.addEventListener('input', U.debounce(run, 120));
    m = UI.modal({ title: t('customer.moveTitle'), size: 'narrow', body: [h('p', { class: 'dim' }, t('customer.moveText')), input, results],
      foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.cancel'))] });
    run();
  };

  function policyRow(p, c, vs) {
    var info = Store.derived().renewal.get(p.id);
    var open = vs.expanded[p.id];
    var row = h('div', { class: 'policy-row', id: 'pol-' + p.id },
      h('div', { class: 'policy-main' },
        h('div', { class: 't' }, h('button', { type: 'button', class: 'icon-btn sm', 'aria-expanded': String(!!open), title: t('common.details'), 'aria-label': t('common.details'),
          onClick: function () { vs.expanded[p.id] = !vs.expanded[p.id]; App.refresh(); } }, icon(open ? 'chevron-up' : 'chevron-down')),
          h('span', null, p.policyType || t('common.unknown')), App.newBizTag(p.newBusiness)),
        h('div', { class: 's' }, Store.companyLabel(p.company) || '—', p.policyNo ? h('span', { class: 'mono' }, p.policyNo) : null)),
      h('div', { class: 'policy-company' }, p.plate ? h('div', { class: 'row tight' }, UI.plate(p.plate), p.step != null ? h('span', { class: 'chip', title: t('field.step') }, t('customer.stepShort', { n: p.step })) : null) : null,
        p.insuredName && U.fold(p.insuredName) !== U.fold(c.name) ? h('div', { class: 'small muted' }, t('customer.insured') + ': ' + p.insuredName) : (p.plate ? null : h('span', { class: 'muted small' }, '—'))),
      h('div', { class: 'policy-end' }, h('div', { class: 'small muted' }, t('field.endDate')), h('div', { class: 'num' }, p.endDate ? F.date(p.endDate) : '—'), App.statePill(info, p)),
      h('div', { class: 'policy-money' }, h('div', { class: 'p' }, p.premium != null ? F.money(p.premium) : '—'),
        h('div', { class: 'c' }, p.commission != null ? t('customer.commShort', { v: F.money(p.commission) }) : ' ')),
      h('div', { class: 'no-print' }, App.policyActions(p)),
      open ? policyDetail(p, c) : null);
    return row;
  }

  function statementPrint(c, list) {
    var tot = Portfolio.totals(list);
    return h('div', { class: 'print-only' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '12px' } },
        h('div', null, h('div', { style: { fontSize: '16pt', fontWeight: 700 } }, Store.settings.agencyName), h('div', null, [Store.settings.agencyPhone, Store.settings.agencyEmail].filter(Boolean).join(' · ')), h('div', null, Store.settings.agencyAddress || '')),
        h('div', { style: { textAlign: 'right' } }, h('div', { style: { fontWeight: 700 } }, t('customer.statement')), h('div', null, F.date(U.todayISO())))),
      h('div', { style: { marginBottom: '10px' } }, h('div', { style: { fontSize: '14pt', fontWeight: 700 } }, c.name),
        h('div', null, [c.tc ? t('field.tc') + ': ' + (masked() ? U.maskId(c.tc) : c.tc) : '', c.phone ? U.formatPhone(c.phone) : '', c.profession].filter(Boolean).join(' · '))),
      h('table', { class: 'data' },
        h('thead', null, h('tr', null, [t('common.month'), t('field.policyType'), t('field.company'), t('field.policyNo'), t('field.plate'), t('field.endDate'), t('field.premium'), t('field.commission')].map(function (x, i) { return h('th', { class: i >= 6 ? 'r' : null }, x); }))),
        h('tbody', null, list.slice().sort(function (a, b) { return U.cmp(a.month, b.month); }).map(function (p) {
          return h('tr', null, h('td', null, F.month(p.month)), h('td', null, p.policyType || ''), h('td', null, Store.companyLabel(p.company)), h('td', null, p.policyNo || ''), h('td', null, p.plate || ''), h('td', null, F.date(p.endDate)), h('td', { class: 'r' }, F.money(p.premium)), h('td', { class: 'r' }, F.money(p.commission)));
        })),
        h('tfoot', null, h('tr', null, h('td', { colspan: 6 }, t('common.total') + ' · ' + t('customer.policyCount', { n: tot.count })), h('td', { class: 'r' }, F.money(tot.premium)), h('td', { class: 'r' }, F.money(tot.commission))))));
  }

  App.views.customer = {
    title: function (r) { var c = Store.customers.get(r.id); return c ? c.name : t('customer.notFound'); },
    sub: function (r) {
      var c = Store.customers.get(r.id);
      if (!c) return '';
      var s = Store.summary(c.id);
      return s.first ? t('customer.since', { m: F.month(s.first) }) : '';
    },
    render: function (r) {
      var c = Store.customers.get(r.id);
      if (!c) return h('section', { class: 'card' }, UI.empty({ icon: 'user', title: t('customer.notFound'), text: t('customer.notFoundText'), actions: [h('a', { class: 'btn', href: '#musteriler' }, icon('arrow-left'), t('nav.customers'))] }));
      var vs = App.viewState['c:' + c.id] || (App.viewState['c:' + c.id] = { tab: 'policies', expanded: {}, noteKind: 'note' });
      var list = Store.policiesOf(c.id);
      var s = Store.summary(c.id);
      var d = Store.derived();
      var opps = Portfolio.opportunities(c, list, d.today);
      var acts = Store.activitiesOf(c.id);
      var withAccount = list.filter(function (p) { return p.account > 0; });
      var phones = Portfolio.phonesOf(c);

      var facts = h('div', { class: 'facts' },
        h('div', { class: 'fact' }, h('span', { class: 'k' }, t('field.tc')), h('span', { class: 'v' }, UI.idBadge(c.tc, masked()), c.tc && U.idKind(c.tc) === 'invalid' ? h('span', { class: 'small', style: { color: 'var(--bad-ink)' } }, t('id.invalidShort')) : null)),
        h('div', { class: 'fact' }, h('span', { class: 'k' }, t('field.phone')), h('span', { class: 'v' }, App.phoneLinks(c.phone),
          c.phone ? h('button', { type: 'button', class: 'icon-btn sm', title: t('common.copy'), 'aria-label': t('common.copy'), onClick: function () { UI.copyText(U.formatPhone(c.phone)).then(function () { UI.toast(t('common.copied')); }); } }, icon('copy')) : null)),
        phones.length > 1 ? h('div', { class: 'fact' }, h('span', { class: 'k' }, t('customer.otherPhones')), h('span', { class: 'v small' }, phones.filter(function (p) { return p !== c.phone; }).map(U.formatPhone).join(', '))) : null,
        c.email ? h('div', { class: 'fact' }, h('span', { class: 'k' }, t('field.email')), h('span', { class: 'v' }, h('a', { href: 'mailto:' + c.email }, c.email))) : null,
        h('div', { class: 'fact' }, h('span', { class: 'k' }, t('field.profession')), h('span', { class: 'v' }, c.profession || '—')),
        c.birthDate ? h('div', { class: 'fact' }, h('span', { class: 'k' }, t('field.birthDate')), h('span', { class: 'v' }, F.date(c.birthDate))) : null,
        c.address ? h('div', { class: 'fact' }, h('span', { class: 'k' }, t('field.address')), h('span', { class: 'v' }, c.address)) : null);

      var actions = h('div', { class: 'profile-actions no-print' },
        h('a', { class: 'btn btn-primary btn-sm', href: '#yeni-' + c.id, id: 'cust-add-policy' }, icon('plus'), t('customer.addPolicy')),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'cust-edit', onClick: function () { App.editCustomer(c); } }, icon('pencil'), t('common.edit')),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'cust-note', onClick: function () { vs.tab = 'notes'; App.refresh(); setTimeout(function () { var n = document.getElementById('note-text'); if (n) n.focus(); }, 30); } }, icon('notebook-pen'), t('customer.addNote')),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'cust-task', onClick: function () { App.editTask({ customerId: c.id }); } }, icon('list-checks'), t('customer.addTask')),
        !App.embedded ? h('button', { type: 'button', class: 'btn btn-sm', id: 'cust-print', onClick: function () { window.print(); } }, icon('printer'), t('customer.print')) : null,
        h('button', { type: 'button', class: 'btn btn-sm', id: 'cust-export', onClick: function () { App.exportCustomerStatement(c); } }, icon('file-down'), t('common.exportExcel')),
        h('button', { type: 'button', class: 'btn btn-sm btn-danger', id: 'cust-delete', onClick: function () {
          UI.confirm({ title: t('customer.deleteTitle'), message: t('customer.deleteMsg', { name: c.name, n: list.length }), danger: true, confirm: t('common.delete') }).then(function (ok) {
            if (!ok) return;
            var undo = Store.deleteCustomer(c.id);
            App.go('musteriler');
            UI.toast(t('customer.deleted'), { action: { label: t('common.undo'), fn: function () { undo(); App.go('musteri-' + c.id); } } });
          });
        } }, icon('trash-2'), t('common.delete')));

      var profile = h('section', { class: 'card no-print', id: 'customer-profile' },
        h('div', { class: 'profile' },
          h('div', { class: 'avatar' }, UI.initials(c.name)),
          h('div', { style: { minWidth: 0 } },
            h('div', { class: 'row' }, h('h2', null, c.name), (c.tags || []).map(function (tg) { return h('span', { class: 'chip outline' }, tg); }),
              U.idKind(c.tc) === 'vkn' ? h('span', { class: 'chip' }, icon('building-2'), t('customer.corporate')) : null),
            facts,
            c.notes ? h('p', { class: 'small dim', style: { marginTop: '10px', whiteSpace: 'pre-line' } }, c.notes) : null),
          actions),
        h('div', { class: 'stats-strip' },
          h('div', null, h('div', { class: 'k' }, t('customer.statPolicies')), h('div', { class: 'v', id: 'stat-policies' }, F.num(s.count))),
          h('div', null, h('div', { class: 'k' }, t('customer.statPremium')), h('div', { class: 'v', id: 'stat-premium' }, F.money(s.premium))),
          h('div', null, h('div', { class: 'k' }, t('customer.statCommission')), h('div', { class: 'v' }, F.money(s.commission))),
          h('div', null, h('div', { class: 'k' }, t('customer.statActive')), h('div', { class: 'v' }, F.num(s.active))),
          h('div', null, h('div', { class: 'k' }, t('customer.statMonths')), h('div', { class: 'v', id: 'stat-months', title: s.months.map(function (m) { return F.month(m); }).join(', ') }, F.num(s.months.length), s.first ? h('span', { class: 'small muted', style: { fontWeight: 400, marginLeft: '6px' } }, F.month(s.first, true) + (s.last !== s.first ? ' – ' + F.month(s.last, true) : '')) : null)),
          h('div', null, h('div', { class: 'k' }, t('customer.statOutstanding')), h('div', { class: 'v', style: { color: s.outstanding > 0 ? 'var(--warn-ink)' : null } }, F.money(s.outstanding)))));

      var plates = new Map();
      list.forEach(function (p) {
        if (!p.plate) return;
        var k = U.plateKey(p.plate);
        if (!plates.has(k)) plates.set(k, { plate: p.plate, serials: new Set(), policies: [] });
        var v = plates.get(k);
        if (p.serialNo) v.serials.add(p.serialNo);
        v.policies.push(p);
      });

      var tabs = [
        { id: 'policies', label: t('customer.tabPolicies'), n: list.length },
        { id: 'vehicles', label: t('customer.tabVehicles'), n: plates.size },
        { id: 'opps', label: t('customer.tabOpps'), n: opps.length },
        { id: 'notes', label: t('customer.tabNotes'), n: acts.length },
        { id: 'payments', label: t('customer.tabPayments'), n: withAccount.length }
      ];
      var tabBar = h('div', { class: 'tabs no-print', role: 'tablist' }, tabs.map(function (tb) {
        return h('button', { type: 'button', role: 'tab', id: 'tab-' + tb.id, 'aria-selected': String(vs.tab === tb.id), onClick: function () { vs.tab = tb.id; App.refresh(); } },
          tb.label, h('span', { class: 'count' }, F.num(tb.n)));
      }));

      var panel;
      if (vs.tab === 'vehicles') {
        panel = plates.size ? h('div', { class: 'list' }, Array.from(plates.values()).map(function (v) {
          var cats = new Set(v.policies.map(function (p) { return Schema.categoryOf(p.policyType); }));
          return h('div', { class: 'list-item', style: { alignItems: 'flex-start' } }, UI.plate(v.plate, true),
            h('div', { class: 'main' },
              h('div', { class: 's' }, v.serials.size ? t('customer.serials', { s: Array.from(v.serials).join(', ') }) : t('customer.noSerial')),
              h('div', { class: 'chips', style: { marginTop: '4px' } }, v.policies.map(function (p) {
                return h('span', { class: 'chip outline' }, p.policyType + ' · ' + F.month(p.month, true) + (p.endDate ? ' → ' + F.date(p.endDate) : ''));
              })),
              !cats.has('kasko') ? h('div', { class: 'small', style: { color: 'var(--warn-ink)', marginTop: '4px' } }, icon('lightbulb'), ' ', t('opp.kasko.title')) : null));
        })) : UI.empty({ icon: 'car', title: t('customer.noVehicles') });
      } else if (vs.tab === 'opps') {
        panel = opps.length ? h('div', { class: 'stack', style: { padding: '16px 18px' } }, opps.map(function (o) {
          return h('div', { class: 'opp' }, icon('lightbulb'), h('div', { style: { flex: 1 } }, h('div', { style: { fontWeight: 600 } }, t('opp.' + o.type + '.title')),
            h('div', { class: 'small dim' }, t('opp.' + o.type + '.text', { plate: o.plate || '' }))),
            h('button', { type: 'button', class: 'btn btn-sm', onClick: function () {
              App.editTask({ customerId: c.id, title: t('opp.' + o.type + '.task', { plate: o.plate || '', name: c.name }), due: U.addDays(U.todayISO(), 2) });
            } }, icon('list-checks'), t('customer.makeTask')));
        })) : UI.empty({ icon: 'circle-check', title: t('customer.noOpps'), text: t('customer.noOppsText') });
      } else if (vs.tab === 'notes') {
        var kind = UI.select('note-kind', NOTE_KINDS.map(function (k) { return { value: k, label: t('activity.' + k) }; }), vs.noteKind, { class: 'input', style: { width: 'auto' }, 'aria-label': t('customer.noteKind'), onChange: function (e) { vs.noteKind = e.target.value; } });
        var text = h('textarea', { id: 'note-text', class: 'input', rows: 2, placeholder: t('customer.notePh'), 'aria-label': t('customer.addNote'), style: { height: 'auto', padding: '9px 11px' } });
        panel = h('div', { style: { padding: '16px 18px' }, class: 'stack' },
          h('form', { class: 'stack', style: { gap: '8px' }, onSubmit: function (e) {
            e.preventDefault();
            if (!text.value.trim()) { text.focus(); return; }
            Store.addNote(c.id, text.value.trim(), vs.noteKind);
            UI.toast(t('customer.noteSaved'));
          } }, text, h('div', { class: 'row' }, kind, h('button', { type: 'submit', class: 'btn btn-primary btn-sm', id: 'note-save' }, icon('save'), t('customer.saveNote')))),
          acts.length ? h('div', { class: 'timeline' }, acts.map(function (a) {
            var isNote = NOTE_KINDS.indexOf(a.type) >= 0;
            return h('div', { class: 'tl-item' }, h('span', { class: 'tl-dot' }, icon(ACT_ICON[a.type] || 'history')),
              h('div', null, h('div', { class: 'row' }, h('strong', null, t('activity.' + a.type)), h('span', { class: 'when' }, F.dateTime(a.at)),
                isNote ? h('button', { type: 'button', class: 'icon-btn sm', title: t('common.delete'), 'aria-label': t('common.delete'), onClick: function () { Store.deleteActivity(a.id); } }, icon('x')) : null),
                h('div', { class: isNote ? '' : 'small dim', style: { whiteSpace: 'pre-line' } }, activityText(a))));
          })) : h('p', { class: 'muted' }, t('customer.noNotes')));
      } else if (vs.tab === 'payments') {
        panel = withAccount.length ? h('div', { class: 'list' }, withAccount.map(function (p) {
          var rem = Portfolio.outstanding(p);
          return h('div', { class: 'list-item', style: { alignItems: 'flex-start' } },
            h('div', { class: 'main' }, h('div', { class: 't' }, p.policyType + ' · ' + F.month(p.month)),
              h('div', { class: 's' }, t('collections.dueLine', { due: F.money(p.account), paid: F.money(Portfolio.paidOnAccount(p)) })),
              (p.payments || []).map(function (y) { return h('div', { class: 'small muted' }, F.date(y.date) + ' · ' + F.money(y.amount) + ' · ' + t('pay.' + y.method) + (y.note ? ' · ' + y.note : '')); })),
            h('div', { style: { textAlign: 'right' } }, h('div', { style: { fontWeight: 600, color: rem > 0 ? 'var(--warn-ink)' : 'var(--good-ink)' } }, rem > 0 ? F.money(rem) : t('collections.paid')),
              rem > 0 ? h('button', { type: 'button', class: 'btn btn-sm', style: { marginTop: '6px' }, onClick: function () { App.paymentDialog(p); } }, icon('hand-coins'), t('collections.take')) : null));
        })) : UI.empty({ icon: 'wallet', title: t('customer.noAccount'), text: t('customer.noAccountText') });
      } else {
        var byMonth = U.groupBy(list, function (p) { return p.month; });
        var keys = Array.from(byMonth.keys()).sort().reverse();
        panel = list.length ? h('div', { id: 'customer-months' }, keys.map(function (k) {
          var ps = byMonth.get(k);
          return h('div', { class: 'month-block', id: 'cm-' + k },
            h('div', { class: 'month-head' }, icon('calendar-days'), h('h3', null, h('a', { href: '#ay-' + k, style: { color: 'inherit' } }, F.month(k))),
              h('span', { class: 'chip' }, t('customer.policyCount', { n: ps.length })),
              h('span', { class: 'sum' }, F.money(U.sum(ps, function (p) { return p.premium; })) + ' · ' + t('customer.commShort', { v: F.money(U.sum(ps, function (p) { return p.commission; })) }))),
            ps.map(function (p) { return policyRow(p, c, vs); }));
        })) : UI.empty({ icon: 'file-text', title: t('customer.noPolicies'), actions: [h('a', { class: 'btn btn-primary', href: '#yeni-' + c.id }, icon('plus'), t('customer.addPolicy'))] });
      }

      return h('div', { class: 'stack' },
        h('div', { class: 'row no-print' }, h('a', { class: 'btn btn-ghost btn-sm', href: '#musteriler' }, icon('arrow-left'), t('nav.customers'))),
        profile,
        h('section', { class: 'card no-print', style: { overflow: 'hidden' } }, tabBar, panel),
        statementPrint(c, list));
    }
  };

  function activityText(a) {
    switch (a.type) {
      case 'payment': return t('activity.paymentText', { v: F.money(Number(a.text)), m: t('pay.' + (a.method || 'cash')) });
      case 'renewalStatus': return t('renewals.st.' + (a.text || 'pending')) + (a.note ? ' · ' + a.note : '');
      case 'merged': return t('activity.mergedText', { n: a.text });
      default: return a.text || '';
    }
  }

  // ------------------------------------------------------------------ duplicates
  App.showDuplicates = function () {
    var groups = Portfolio.duplicateGroups(Array.from(Store.customers.values()));
    var body = h('div', { class: 'stack' });
    var m;
    function draw() {
      UI.clear(body);
      groups = Portfolio.duplicateGroups(Array.from(Store.customers.values()));
      if (!groups.length) { body.appendChild(UI.empty({ icon: 'circle-check', title: t('dup.none'), text: t('dup.noneText') })); return; }
      body.appendChild(h('p', { class: 'dim' }, t('dup.intro', { n: groups.length })));
      groups.slice(0, 60).forEach(function (g, gi) {
        var primary = g.customers[0].id;
        var radios = g.customers.map(function (c) {
          var s = Store.summary(c.id);
          return h('label', { class: 'list-item', style: { cursor: 'pointer' } },
            h('input', { type: 'radio', name: 'dup-' + gi, value: c.id, checked: c.id === primary, onChange: function () { primary = c.id; } }),
            h('div', { class: 'main' }, h('div', { class: 't' }, c.name), h('div', { class: 's' }, UI.items(UI.idBadge(c.tc, masked()), c.phone ? U.formatPhone(c.phone) : '—', t('customer.policyCount', { n: s.count }), s.months.map(function (x) { return F.month(x, true); }).join(', ')))),
            h('a', { href: '#musteri-' + c.id, onClick: function () { m.close(); } }, t('common.open')));
        });
        body.appendChild(h('section', { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', null, g.customers[0].name), h('span', { class: 'sub' }, t('dup.reason.' + g.reason)),
            h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-sm btn-primary', onClick: function () {
              UI.confirm({ title: t('dup.mergeTitle'), message: t('dup.mergeMsg', { n: g.customers.length }), confirm: t('dup.merge') }).then(function (ok) {
                if (!ok) return;
                Store.mergeCustomers(primary, g.customers.map(function (c) { return c.id; }));
                UI.toast(t('dup.merged'));
                draw();
              });
            } }, icon('git-merge'), t('dup.merge')))),
          h('div', { class: 'card-body flush', style: { marginTop: '8px' } }, h('div', { class: 'list' }, radios))));
      });
    }
    draw();
    m = UI.modal({ title: t('dup.title'), icon: 'git-merge', size: 'wide', body: body, foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.close'))] });
  };
})();
