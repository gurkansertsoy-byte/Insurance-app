/* Sigorta Portföy - application state, persistence and derived data. */
(function (root) {
  'use strict';
  var U = root.U, Schema = root.Schema, Portfolio = root.Portfolio, DB = root.DB;

  var DEFAULT_SETTINGS = {
    agencyName: 'Sigorta Portföy',
    agencyPhone: '',
    agencyEmail: '',
    agencyAddress: '',
    lang: 'tr',
    theme: 'system',
    maskIds: false,
    renewalWindow: 30,
    pageSize: 50,
    tidyNames: true,
    waTemplate: '',
    lastBackupAt: null
  };

  var listeners = new Set();
  var cache = { v: -1 };
  var summaryCache = new Map();
  var searchIndex = null;

  var Store = {
    customers: new Map(),
    policies: new Map(),
    tasks: new Map(),
    activities: new Map(),
    cancellations: new Map(),
    settings: Object.assign({}, DEFAULT_SETTINGS),
    months: {},
    imports: [],
    mappings: {},
    version: 0,
    saving: 0,
    saveError: null,
    loaded: false,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS
  };

  // ------------------------------------------------------------------ events & persistence
  Store.on = function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; };
  function emit(kind) {
    Store.version++;
    listeners.forEach(function (fn) { try { fn(kind || 'data'); } catch (e) { console.error(e); } });
  }
  Store.emit = emit;

  function track(p) {
    Store.saving++;
    emitStatus();
    return p.then(function () {
      Store.saveError = null;
    }, function (err) {
      Store.saveError = err;
      console.error('save failed', err);
    }).then(function () {
      Store.saving--;
      emitStatus();
    });
  }
  var statusListeners = new Set();
  Store.onStatus = function (fn) { statusListeners.add(fn); };
  function emitStatus() { statusListeners.forEach(function (fn) { fn(); }); }

  function put(store, items) { return track(DB.put(store, items)); }
  function del(store, ids) { return track(DB.del(store, ids)); }
  function putMeta(key) { return put('meta', [{ key: key, value: Store[key] }]); }
  function saveSettings() { return put('meta', [{ key: 'settings', value: Store.settings }]); }

  Store.load = function (opts) {
    return DB.init(opts).then(function () {
      return Promise.all(DB.STORES.map(function (s) { return DB.getAll(s); }));
    }).then(function (all) {
      var map = {};
      DB.STORES.forEach(function (s, i) { map[s] = all[i]; });
      Store.customers = new Map(map.customers.map(function (x) { return [x.id, x]; }));
      Store.policies = new Map(map.policies.map(function (x) { return [x.id, x]; }));
      Store.tasks = new Map(map.tasks.map(function (x) { return [x.id, x]; }));
      Store.activities = new Map(map.activities.map(function (x) { return [x.id, x]; }));
      Store.cancellations = new Map((map.cancellations || []).map(function (x) { return [x.id, x]; }));
      map.meta.forEach(function (m) {
        if (m.key === 'settings') Store.settings = Object.assign({}, DEFAULT_SETTINGS, m.value || {});
        else if (m.key === 'months') Store.months = m.value || {};
        else if (m.key === 'imports') Store.imports = m.value || [];
        else if (m.key === 'mappings') Store.mappings = m.value || {};
      });
      Store.loaded = true;
      Store.backend = DB.kind;
      emit('load');
      return Store;
    });
  };

  Store.setSetting = function (key, value) {
    Store.settings[key] = value;
    saveSettings();
    try { root.localStorage.setItem('sp:pref:' + key, JSON.stringify(value)); } catch (e) { /* optional */ }
    emit('settings');
  };

  Store.updateSettings = function (patch) {
    Object.assign(Store.settings, patch);
    saveSettings();
    emit('settings');
  };

  // ------------------------------------------------------------------ derived data
  Store.today = function () { return U.todayISO(); };

  Store.derived = function () {
    if (cache.v === Store.version) return cache;
    var policies = Array.from(Store.policies.values());
    var byCustomer = new Map();
    policies.forEach(function (p) {
      if (!byCustomer.has(p.customerId)) byCustomer.set(p.customerId, []);
      byCustomer.get(p.customerId).push(p);
    });
    byCustomer.forEach(function (list) { list.sort(function (a, b) { return a.month < b.month ? 1 : a.month > b.month ? -1 : U.cmp(a.endDate, b.endDate); }); });
    var monthSet = new Set();
    policies.forEach(function (p) { if (p.month) monthSet.add(p.month); });
    var today = U.todayISO();
    var cancelByPolicy = new Map(), cancelsByMonth = new Map();
    Store.cancellations.forEach(function (x) {
      if (x.policyId && Store.policies.has(x.policyId)) cancelByPolicy.set(x.policyId, x);
      if (x.month) { monthSet.add(x.month); if (!cancelsByMonth.has(x.month)) cancelsByMonth.set(x.month, []); cancelsByMonth.get(x.month).push(x); }
    });
    cancelsByMonth.forEach(function (list) { list.sort(function (a, b) { return (a.source && a.source.row || 1e9) - (b.source && b.source.row || 1e9) || (a.createdAt || 0) - (b.createdAt || 0); }); });
    cache = {
      v: Store.version,
      today: today,
      policies: policies,
      byCustomer: byCustomer,
      months: Array.from(monthSet).sort(),
      cancelByPolicy: cancelByPolicy,
      cancelsByMonth: cancelsByMonth,
      renewal: Portfolio.renewalInfo(policies, { today: today, windowDays: Number(Store.settings.renewalWindow) || 30, cancelled: cancelByPolicy }),
      companyNames: Portfolio.companyNames(policies)
    };
    summaryCache = new Map();
    searchIndex = null;
    return cache;
  };

  Store.policiesOf = function (customerId) { return Store.derived().byCustomer.get(customerId) || []; };

  /** The İptal row that cancelled this policy, or null. */
  Store.cancelOf = function (policyId) { return Store.derived().cancelByPolicy.get(policyId) || null; };
  Store.cancellationsOf = function (month) { return Store.derived().cancelsByMonth.get(month) || []; };
  Store.isCancelled = function (policyId) { return Store.derived().cancelByPolicy.has(policyId); };

  /** Open Cari balance of a policy; a refund written to Cari in its İptal row counts as paid back. */
  Store.outstanding = function (p) {
    var x = Store.cancelOf(p.id);
    return Portfolio.outstanding(p, x ? x.account || 0 : 0);
  };

  Store.companyLabel = function (name) {
    if (!name) return '';
    var d = Store.derived();
    return d.companyNames.get(U.companyKey(name)) || name;
  };

  Store.summary = function (customerId) {
    var d = Store.derived();
    if (summaryCache.has(customerId)) return summaryCache.get(customerId);
    var list = d.byCustomer.get(customerId) || [];
    var months = new Set(), cats = new Set();
    var s = { count: list.length, premium: 0, commission: 0, active: 0, cancelled: 0, nextEnd: null, nextDays: null, outstanding: 0, months: [], cats: [], first: null, last: null };
    list.forEach(function (p) {
      s.premium += p.premium || 0;
      s.commission += p.commission || 0;
      if (p.month) months.add(p.month);
      cats.add(Schema.categoryOf(p.policyType));
      if (d.cancelByPolicy.has(p.id)) { s.cancelled++; s.outstanding += Store.outstanding(p); return; }
      if (p.endDate && p.endDate >= d.today) {
        s.active++;
        var info = d.renewal.get(p.id);
        if (info && info.state !== 'renewed' && info.state !== 'short' && (!s.nextEnd || p.endDate < s.nextEnd)) s.nextEnd = p.endDate;
      }
      s.outstanding += Store.outstanding(p);
    });
    s.premium = U.round2(s.premium);
    s.commission = U.round2(s.commission);
    s.outstanding = U.round2(s.outstanding);
    s.months = Array.from(months).sort();
    s.cats = Array.from(cats);
    s.first = s.months[0] || null;
    s.last = s.months[s.months.length - 1] || null;
    s.nextDays = s.nextEnd ? U.diffDays(d.today, s.nextEnd) : null;
    summaryCache.set(customerId, s);
    return s;
  };

  function buildSearchIndex() {
    var d = Store.derived();
    var items = [];
    Store.customers.forEach(function (c) {
      var list = d.byCustomer.get(c.id) || [];
      var plates = [], nos = [], serials = [];
      list.forEach(function (p) {
        if (p.plate) plates.push(U.plateKey(p.plate));
        if (p.policyNo) nos.push(U.fold(p.policyNo).replace(/ /g, ''));
        if (p.serialNo) serials.push(U.fold(p.serialNo).replace(/ /g, ''));
      });
      items.push({
        c: c,
        text: U.fold([c.name, c.profession, c.email].concat(list.map(function (p) { return p.insuredName || ''; })).join(' ')),
        name: U.fold(c.name),
        digits: [c.tc].concat(Portfolio.phonesOf(c)).filter(Boolean).join(' '),
        plates: plates.filter(Boolean),
        nos: nos,
        serials: serials
      });
    });
    return items;
  }

  /** Returns { customers: [{ c, why }], policies: [{ p, c, why }] } */
  Store.search = function (query, limit) {
    limit = limit || 8;
    var q = U.collapse(query);
    var out = { customers: [], policies: [] };
    if (q.length < 2) return out;
    if (!searchIndex) searchIndex = buildSearchIndex();
    var fq = U.fold(q), toks = fq.split(' ').filter(Boolean);
    var qd = U.digits(q), qp = U.plateKey(q), qn = fq.replace(/ /g, '');
    var hits = [];
    searchIndex.forEach(function (it) {
      var score = -1, why = '';
      if (toks.length && toks.every(function (tk) { return it.text.indexOf(tk) >= 0; })) {
        score = it.name.indexOf(fq) === 0 ? 0 : it.name.indexOf(fq) >= 0 ? 1 : 2;
        why = 'name';
      }
      if (score < 0 && qd.length >= 3 && qd.length === q.replace(/[\s()+\-.]/g, '').length && it.digits.indexOf(qd) >= 0) { score = 1; why = 'digits'; }
      if (score < 0 && qp.length >= 3 && it.plates.some(function (p) { return p.indexOf(qp) >= 0; })) { score = 1; why = 'plate'; }
      if (score < 0 && qn.length >= 3 && it.nos.some(function (n) { return n.indexOf(qn) >= 0; })) { score = 2; why = 'policyNo'; }
      if (score < 0 && qn.length >= 3 && it.serials.some(function (n) { return n.indexOf(qn) >= 0; })) { score = 2; why = 'serial'; }
      if (score >= 0) hits.push({ c: it.c, why: why, score: score });
    });
    hits.sort(function (a, b) { return a.score - b.score || U.cmp(a.c.name, b.c.name); });
    out.customers = hits.slice(0, limit);
    out.total = hits.length;
    // matching policies (plate, policy no, serial)
    if (qn.length >= 3) {
      var d = Store.derived();
      for (var i = 0; i < d.policies.length && out.policies.length < limit; i++) {
        var p = d.policies[i];
        var why2 = '';
        if (p.policyNo && U.fold(p.policyNo).replace(/ /g, '').indexOf(qn) >= 0) why2 = 'policyNo';
        else if (qp.length >= 3 && p.plate && U.plateKey(p.plate).indexOf(qp) >= 0) why2 = 'plate';
        else if (p.serialNo && U.fold(p.serialNo).replace(/ /g, '').indexOf(qn) >= 0) why2 = 'serial';
        if (why2) out.policies.push({ p: p, c: Store.customers.get(p.customerId), why: why2 });
      }
    }
    return out;
  };

  /** Values seen in the data, for the entry form suggestions. */
  Store.suggestions = function () {
    var d = Store.derived();
    var types = new Map(), companies = new Map(), professions = new Map(), agents = new Map();
    function bump(m, v) { if (v) m.set(v, (m.get(v) || 0) + 1); }
    d.policies.forEach(function (p) { bump(types, p.policyType); bump(companies, Store.companyLabel(p.company)); bump(agents, p.agent); });
    Store.customers.forEach(function (c) { bump(professions, c.profession); });
    function merge(m, defaults) {
      var seen = new Set();
      var out = [];
      Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1]; }).forEach(function (e) {
        var k = U.fold(e[0]);
        if (!seen.has(k)) { seen.add(k); out.push(e[0]); }
      });
      (defaults || []).forEach(function (v) { var k = U.fold(v); if (!seen.has(k)) { seen.add(k); out.push(v); } });
      return out;
    }
    var extras = new Set();
    d.policies.forEach(function (p) { if (p.extras) Object.keys(p.extras).forEach(function (k) { extras.add(k); }); });
    return {
      policyTypes: merge(types, Schema.DEFAULT_POLICY_TYPES),
      companies: merge(companies, Schema.DEFAULT_COMPANIES),
      professions: merge(professions, Schema.DEFAULT_PROFESSIONS),
      agents: merge(agents),
      extraFields: Array.from(extras).sort(U.cmp)
    };
  };

  // ------------------------------------------------------------------ activities
  Store.log = function (a) {
    var act = Object.assign({ id: U.uid('a'), at: Date.now() }, a);
    Store.activities.set(act.id, act);
    put('activities', [act]);
    return act;
  };

  Store.activitiesOf = function (customerId) {
    var out = [];
    Store.activities.forEach(function (a) { if (a.customerId === customerId) out.push(a); });
    return out.sort(function (a, b) { return b.at - a.at; });
  };

  Store.addNote = function (customerId, text, kind) {
    var a = Store.log({ customerId: customerId, type: kind || 'note', text: text });
    emit();
    return a;
  };

  Store.deleteActivity = function (id) {
    Store.activities.delete(id);
    del('activities', [id]);
    emit();
  };

  // ------------------------------------------------------------------ customers
  function cleanCustomerInput(f) {
    var out = {};
    if (f.name != null) out.name = U.collapse(f.name);
    if (f.tc != null) out.tc = U.normalizeId(f.tc);
    if (f.phone != null) out.phone = U.normalizePhone(f.phone);
    if (f.email != null) out.email = U.collapse(f.email).toLowerCase();
    ['profession', 'address', 'birthDate', 'notes'].forEach(function (k) { if (f[k] != null) out[k] = U.collapse(f[k]); });
    if (f.notes != null) out.notes = String(f.notes).trim();
    if (f.tags != null) out.tags = f.tags;
    if (f.phones != null) out.phones = f.phones;
    return out;
  }

  Store.saveCustomer = function (input) {
    var now = Date.now();
    var c = input.id ? Store.customers.get(input.id) : null;
    var data = cleanCustomerInput(input);
    if (!c) {
      c = Portfolio.customerFromFields({}, now, U.currentMonthKey());
      Store.customers.set(c.id, c);
      Store.log({ customerId: c.id, type: 'customerAdded', text: data.name });
    }
    Object.assign(c, data);
    if (c.phone) {
      c.phones = c.phones || [];
      if (c.phones.indexOf(c.phone) < 0) c.phones.unshift(c.phone);
    }
    c.updatedAt = now;
    put('customers', [c]);
    emit();
    return c;
  };

  Store.findCustomerByTc = function (tc) {
    var v = U.normalizeId(tc);
    if (!v) return null;
    var found = null;
    Store.customers.forEach(function (c) { if (!found && c.tc === v) found = c; });
    return found;
  };

  Store.deleteCustomer = function (id) {
    var c = Store.customers.get(id);
    if (!c) return function () {};
    var policies = Store.policiesOf(id).slice();
    var tasks = [], acts = [];
    Store.tasks.forEach(function (t) { if (t.customerId === id) tasks.push(t); });
    Store.activities.forEach(function (a) { if (a.customerId === id) acts.push(a); });
    Store.customers.delete(id);
    policies.forEach(function (p) { Store.policies.delete(p.id); });
    tasks.forEach(function (t) { Store.tasks.delete(t.id); });
    acts.forEach(function (a) { Store.activities.delete(a.id); });
    del('customers', [id]);
    del('policies', policies.map(function (p) { return p.id; }));
    del('tasks', tasks.map(function (t) { return t.id; }));
    del('activities', acts.map(function (a) { return a.id; }));
    relinkAndSave();
    emit();
    return function undo() {
      Store.customers.set(c.id, c);
      policies.forEach(function (p) { Store.policies.set(p.id, p); });
      tasks.forEach(function (t) { Store.tasks.set(t.id, t); });
      acts.forEach(function (a) { Store.activities.set(a.id, a); });
      put('customers', [c]);
      put('policies', policies);
      put('tasks', tasks);
      put('activities', acts);
      relinkAndSave();
      emit();
    };
  };

  /** Moves everything of `otherIds` onto `primaryId` and removes the others. */
  Store.mergeCustomers = function (primaryId, otherIds) {
    var primary = Store.customers.get(primaryId);
    if (!primary) return;
    var now = Date.now();
    var movedPolicies = [], movedTasks = [], movedActs = [];
    otherIds.forEach(function (oid) {
      if (oid === primaryId) return;
      var o = Store.customers.get(oid);
      if (!o) return;
      Store.policies.forEach(function (p) { if (p.customerId === oid) { p.customerId = primaryId; p.updatedAt = now; movedPolicies.push(p); } });
      Store.tasks.forEach(function (t) { if (t.customerId === oid) { t.customerId = primaryId; movedTasks.push(t); } });
      Store.activities.forEach(function (a) { if (a.customerId === oid) { a.customerId = primaryId; movedActs.push(a); } });
      ['tc', 'phone', 'email', 'profession', 'address', 'birthDate'].forEach(function (k) {
        if (!primary[k] && o[k]) primary[k] = o[k];
      });
      if (o.tc && Portfolio.strongId(o.tc) && !Portfolio.strongId(primary.tc)) primary.tc = o.tc;
      primary.phones = primary.phones || [];
      Portfolio.phonesOf(o).forEach(function (p) { if (primary.phones.indexOf(p) < 0) primary.phones.push(p); });
      if (o.notes) primary.notes = (primary.notes ? primary.notes + '\n' : '') + o.notes;
      primary.tags = Array.from(new Set((primary.tags || []).concat(o.tags || [])));
      Store.customers.delete(oid);
      del('customers', [oid]);
    });
    primary.updatedAt = now;
    put('customers', [primary]);
    put('policies', movedPolicies);
    put('tasks', movedTasks);
    put('activities', movedActs);
    Store.log({ customerId: primaryId, type: 'merged', text: String(otherIds.length) });
    emit();
  };

  // ------------------------------------------------------------------ policies
  var POLICY_INPUT = Portfolio.POLICY_FIELDS.concat(['month', 'extras']);

  /**
   * data: { id?, customerId?, customer: {...}, policy: {...} }
   * Creates the customer when customerId is missing.
   */
  Store.savePolicy = function (data) {
    var now = Date.now();
    var cust = data.customerId ? Store.customers.get(data.customerId) : null;
    var cin = cleanCustomerInput(data.customer || {});
    var newCustomer = false;
    if (!cust) {
      cust = Portfolio.customerFromFields({}, now, data.policy.month);
      Store.customers.set(cust.id, cust);
      newCustomer = true;
    }
    Object.keys(cin).forEach(function (k) { if (cin[k] !== undefined) cust[k] = cin[k]; });
    if (cust.phone) {
      cust.phones = cust.phones || [];
      if (cust.phones.indexOf(cust.phone) < 0) cust.phones.unshift(cust.phone);
    }
    cust.updatedAt = now;
    var p = data.id ? Store.policies.get(data.id) : null;
    var isNew = !p;
    if (!p) p = { id: U.uid('p'), createdAt: now, source: { type: 'manual' } };
    var before = isNew ? null : JSON.stringify(p);
    POLICY_INPUT.forEach(function (k) {
      var v = data.policy[k];
      if (v === undefined) return;
      if (v === null || v === '' || (k === 'extras' && !Object.keys(v).length)) delete p[k];
      else p[k] = v;
    });
    if (data.policy.renewalOf) p.renewalOf = data.policy.renewalOf;
    p.customerId = cust.id;
    p.updatedAt = now;
    Store.policies.set(p.id, p);
    put('customers', [cust]);
    put('policies', [p]);
    if (newCustomer) Store.log({ customerId: cust.id, type: 'customerAdded', text: cust.name });
    if (isNew || before !== JSON.stringify(p)) {
      Store.log({ customerId: cust.id, policyId: p.id, type: isNew ? 'policyAdded' : 'policyUpdated', text: [p.policyType, Store.companyLabel(p.company), p.policyNo].filter(Boolean).join(' · ') });
    }
    // a renewal entered from the renewals list closes the old policy
    if (isNew && data.policy.renewalOf) {
      var old = Store.policies.get(data.policy.renewalOf);
      if (old) {
        old.renewal = { status: 'renewed', at: now, by: p.id, note: (old.renewal && old.renewal.note) || '' };
        put('policies', [old]);
      }
    }
    relinkAndSave();
    emit();
    return { policy: p, customer: cust, isNew: isNew };
  };

  Store.deletePolicy = function (id) {
    var p = Store.policies.get(id);
    if (!p) return function () {};
    Store.policies.delete(id);
    del('policies', [id]);
    relinkAndSave();
    var a = Store.log({ customerId: p.customerId, type: 'policyDeleted', text: [p.policyType, p.policyNo].filter(Boolean).join(' · ') });
    emit();
    return function undo() {
      Store.policies.set(p.id, p);
      put('policies', [p]);
      Store.activities.delete(a.id);
      del('activities', [a.id]);
      relinkAndSave();
      emit();
    };
  };

  Store.movePolicy = function (policyId, customerId) {
    var p = Store.policies.get(policyId);
    if (!p || !Store.customers.has(customerId)) return;
    p.customerId = customerId;
    p.updatedAt = Date.now();
    put('policies', [p]);
    emit();
  };

  Store.setRenewalStatus = function (policyId, status, note) {
    var p = Store.policies.get(policyId);
    if (!p) return;
    var prev = p.renewal || null;
    if (!status || status === 'pending') {
      if (note) p.renewal = { status: 'pending', note: note, at: Date.now() };
      else delete p.renewal;
    } else {
      p.renewal = { status: status, note: note != null ? note : (prev && prev.note) || '', at: Date.now() };
    }
    p.updatedAt = Date.now();
    put('policies', [p]);
    Store.log({ customerId: p.customerId, policyId: p.id, type: 'renewalStatus', text: status, note: note || '' });
    emit();
  };

  Store.addPayment = function (policyId, pay) {
    var p = Store.policies.get(policyId);
    if (!p) return null;
    var entry = { id: U.uid('y'), amount: U.round2(Number(pay.amount) || 0), date: pay.date || U.todayISO(), method: pay.method || 'cash', note: pay.note || '' };
    p.payments = (p.payments || []).concat([entry]);
    p.updatedAt = Date.now();
    put('policies', [p]);
    Store.log({ customerId: p.customerId, policyId: p.id, type: 'payment', text: String(entry.amount), method: entry.method });
    emit();
    return entry;
  };

  Store.removePayment = function (policyId, paymentId) {
    var p = Store.policies.get(policyId);
    if (!p || !p.payments) return;
    p.payments = p.payments.filter(function (x) { return x.id !== paymentId; });
    put('policies', [p]);
    emit();
  };

  // ------------------------------------------------------------------ tasks
  Store.saveTask = function (input) {
    var t = input.id ? Store.tasks.get(input.id) : null;
    if (!t) t = { id: U.uid('t'), createdAt: Date.now(), done: false };
    ['title', 'due', 'customerId', 'policyId', 'note'].forEach(function (k) { if (input[k] !== undefined) t[k] = input[k] || ''; });
    Store.tasks.set(t.id, t);
    put('tasks', [t]);
    emit();
    return t;
  };

  Store.toggleTask = function (id, done) {
    var t = Store.tasks.get(id);
    if (!t) return;
    t.done = done == null ? !t.done : !!done;
    t.doneAt = t.done ? Date.now() : null;
    put('tasks', [t]);
    if (t.done && t.customerId) Store.log({ customerId: t.customerId, type: 'taskDone', text: t.title });
    emit();
  };

  Store.deleteTask = function (id) {
    var t = Store.tasks.get(id);
    if (!t) return function () {};
    Store.tasks.delete(id);
    del('tasks', [id]);
    emit();
    return function undo() { Store.tasks.set(t.id, t); put('tasks', [t]); emit(); };
  };

  Store.openTaskCount = function () {
    var today = U.todayISO(), n = 0;
    Store.tasks.forEach(function (t) { if (!t.done && t.due && t.due <= today) n++; });
    return n;
  };

  // ------------------------------------------------------------------ cancellations (İptal rows)
  var CANCEL_FIELDS = ['month', 'company', 'policyText', 'insuredName', 'card', 'account', 'cash', 'note'];

  function amount(v) { var n = U.parseNumber(v); return n ? U.round2(n) : null; }

  function newCancel(data, source) {
    var now = Date.now();
    var x = { id: U.uid('x'), createdAt: now, updatedAt: now, source: source || { type: 'manual' }, policyId: null, match: 'none', candidates: [] };
    CANCEL_FIELDS.forEach(function (k) { if (data[k] != null && data[k] !== '') x[k] = data[k]; });
    return x;
  }

  /**
   * Finds the cancelled policy for every İptal row that has none yet. The user's own decisions (locked) and
   * automatic matches whose policy still exists stay as they are. Returns the rows that changed.
   */
  function relink() {
    var taken = [], todo = [];
    Store.cancellations.forEach(function (x) {
      var valid = !!(x.policyId && Store.policies.has(x.policyId));
      if (x.locked && x.policyId && !valid) { x.locked = false; x.policyId = null; } // the chosen policy was deleted
      if ((x.locked || x.match === 'auto') && valid) { taken.push(x.policyId); return; }
      if (x.locked) return; // the user said: no policy in this file
      todo.push(x);
    });
    if (!todo.length) return [];
    var found = Portfolio.matchCancellations(todo.map(function (x) {
      return { id: x.id, month: x.month, company: x.company, policyText: x.policyText, insuredName: x.insuredName, card: x.card, account: x.account, cash: x.cash, row: x.source && x.source.row };
    }), Array.from(Store.policies.values()), Store.customers, { taken: taken });
    var changed = [];
    todo.forEach(function (x) {
      var r = found.get(x.id);
      var before = [x.policyId || '', x.match, (x.candidates || []).join()].join('|');
      x.policyId = r.policyId;
      x.match = r.match;
      x.candidates = r.candidates;
      if ([x.policyId || '', x.match, x.candidates.join()].join('|') !== before) { x.updatedAt = Date.now(); changed.push(x); }
    });
    return changed;
  }
  function relinkAndSave() { var ch = relink(); put('cancellations', ch); return ch; }

  function logCancel(x) {
    var p = x.policyId && Store.policies.get(x.policyId);
    if (p) Store.log({ customerId: p.customerId, policyId: p.id, type: 'policyCancelled', text: [p.policyType, U.monthLabel(x.month, 'tr')].filter(Boolean).join(' · '), cancelId: x.id });
  }

  /** Cancels a policy from the app. data: { month, card, account, cash, note } (refunds per payment type). */
  Store.cancelPolicy = function (policyId, data) {
    var p = Store.policies.get(policyId);
    if (!p || Store.isCancelled(policyId)) return null;
    var c = Store.customers.get(p.customerId);
    data = data || {};
    var x = newCancel({
      month: data.month || U.currentMonthKey(), company: p.company || '', policyText: p.policyType || '', insuredName: p.insuredName || (c ? c.name : ''),
      card: amount(data.card), account: amount(data.account), cash: amount(data.cash), note: U.collapse(data.note || '')
    });
    x.policyId = p.id;
    x.match = 'manual';
    x.locked = true;
    Store.cancellations.set(x.id, x);
    put('cancellations', [x]);
    logCancel(x);
    emit();
    return x;
  };

  /** Adds or edits an İptal row as written on the month page; the app then looks for its policy. */
  Store.saveCancellation = function (input) {
    var x = input.id ? Store.cancellations.get(input.id) : null;
    if (!x) { x = newCancel({}, { type: 'manual' }); Store.cancellations.set(x.id, x); }
    CANCEL_FIELDS.forEach(function (k) {
      if (input[k] === undefined) return;
      var v = ['card', 'account', 'cash'].indexOf(k) >= 0 ? amount(input[k]) : (k === 'month' ? input[k] : U.collapse(input[k]));
      if (v == null || v === '') delete x[k]; else x[k] = v;
    });
    x.updatedAt = Date.now();
    if (!x.locked) { x.policyId = null; x.match = 'none'; x.candidates = []; }
    put('cancellations', [x]);
    relinkAndSave();
    emit();
    return x;
  };

  /** The user's choice: a policy id, null for "not in this file", or 'auto' to let the app decide again. */
  Store.linkCancellation = function (id, policyId) {
    var x = Store.cancellations.get(id);
    if (!x) return;
    if (policyId === 'auto') { x.locked = false; x.policyId = null; x.match = 'none'; }
    else {
      var other = policyId && Store.cancelOf(policyId);
      if (other && other.id !== x.id) { other.policyId = null; other.match = 'none'; other.locked = false; put('cancellations', [other]); }
      x.locked = true;
      x.policyId = policyId || null;
      x.match = policyId ? 'manual' : 'none';
    }
    x.candidates = [];
    x.updatedAt = Date.now();
    put('cancellations', [x]);
    relinkAndSave();
    if (x.policyId) logCancel(x);
    emit();
  };

  Store.deleteCancellation = function (id) {
    var x = Store.cancellations.get(id);
    if (!x) return function () {};
    Store.cancellations.delete(id);
    del('cancellations', [id]);
    relinkAndSave();
    emit();
    return function undo() { Store.cancellations.set(x.id, x); put('cancellations', [x]); relinkAndSave(); emit(); };
  };

  /** İptal rows of an import: the same row read again is recognised, new rows are added. */
  // what a row of the İptal block says (the rest of a cancellation is the app's own)
  var BLOCK_FIELDS = ['company', 'policyText', 'insuredName', 'card', 'account', 'cash'];

  function importCancels(recs, ctx) {
    var pool = new Map();
    Store.cancellations.forEach(function (x) { var k = Portfolio.cancelKey(x); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(x); });
    var claimed = new Set(), out = { added: [], updated: [], unchanged: 0, rows: [] };
    recs.forEach(function (r) {
      // the linked file read again: this row of the İptal block is known to be this cancellation
      var aid = ctx.anchors && ctx.anchors.get(r.sheet + '\u0001' + r.row);
      var anchored = aid && !claimed.has(aid) && Store.cancellations.get(aid);
      if (anchored) {
        claimed.add(aid);
        var changed = false;
        if (!(ctx.keep && ctx.keep.has(aid))) {
          BLOCK_FIELDS.forEach(function (f) {
            var v = r[f] == null || r[f] === '' ? (f === 'card' || f === 'account' || f === 'cash' ? null : '') : r[f];
            if (String(anchored[f] == null ? '' : anchored[f]) !== String(v == null ? '' : v)) { anchored[f] = v; changed = true; }
          });
        }
        anchored.cells = r.cells;
        var src = anchored.source || {};
        if (changed || src.sheet !== r.sheet || src.row !== r.row || src.file !== ctx.fileName) {
          anchored.source = { type: 'import', importId: src.importId || ctx.importId, file: ctx.fileName, sheet: r.sheet, row: r.row };
          anchored.updatedAt = ctx.now;
          out.updated.push(anchored);
        } else out.unchanged++;
        out.rows.push({ rec: r, x: anchored });
        return;
      }
      var k = Portfolio.cancelKey(r);
      var hit = (pool.get(k) || []).filter(function (x) { return !claimed.has(x.id); })[0];
      if (hit) {
        claimed.add(hit.id);
        hit.cells = r.cells;
        var s = hit.source || {};
        if (s.sheet !== r.sheet || s.row !== r.row || s.file !== ctx.fileName) {
          hit.source = { type: 'import', importId: s.importId || ctx.importId, file: ctx.fileName, sheet: r.sheet, row: r.row };
          hit.updatedAt = ctx.now;
          out.updated.push(hit);
        } else out.unchanged++;
        out.rows.push({ rec: r, x: hit });
        return;
      }
      var x = newCancel(r, { type: 'import', importId: ctx.importId, file: ctx.fileName, sheet: r.sheet, row: r.row });
      x.cells = r.cells;
      x.createdAt = x.updatedAt = ctx.now;
      Store.cancellations.set(x.id, x);
      claimed.add(x.id);
      out.added.push(x);
      out.rows.push({ rec: r, x: x });
    });
    return out;
  }

  // ------------------------------------------------------------------ import
  /**
   * records (and cancels) from Importer.buildRecords; analysis for month metadata.
   * opts: { mode: 'merge' | 'replace', fileName, saveMappings: {}, cancels: [] }
   */
  Store.importRecords = function (records, analysis, opts) {
    opts = opts || {};
    var cleared = opts.mode === 'replace' ? Store.clearData({ silent: true }) : Promise.resolve();
    var importId = U.uid('i');
    var now = Date.now();
    var state = { customers: Store.customers, policies: Store.policies };
    // the linked file read again (FileLink.hintsFor): known rows, records changed or deleted in the app meanwhile
    var hints = opts.mode === 'replace' ? null : opts.hints || null;
    function kept(r) { return !hints || !hints.skip.has(r.sheet + '\u0001' + r.row); }
    function keptCancel(r) { return !hints || !hints.cancelSkip.has(r.sheet + '\u0001' + r.row); }
    var res = Portfolio.importRecords(state, records.filter(kept), { importId: importId, fileName: opts.fileName, now: now, anchors: hints && hints.anchors, keep: hints && hints.keep });
    res.customersAdded.forEach(function (c) { c.createdBy = importId; });
    // İptal rows, then find the policy each one cancels
    var cres = importCancels((opts.cancels || []).filter(keptCancel), { importId: importId, fileName: opts.fileName || '', now: now, anchors: hints && hints.cancelAnchors, keep: hints && hints.cancelKeep });
    var relinked = relink();
    // which row of the file became which İptal record (to write them back to the same rows)
    res.cancelsPlaced = cres.rows.map(function (o) { return { sheet: o.rec.sheet, row: o.rec.row, id: o.x.id }; });
    res.cancels = { rows: cres.rows.length, added: cres.added.length, updated: cres.updated.length, unchanged: cres.unchanged, auto: 0, manual: 0, ambiguous: 0, none: 0 };
    cres.rows.forEach(function (o) {
      var x = o.x;
      res.cancels[x.match === 'auto' || x.match === 'manual' ? (x.locked ? 'manual' : 'auto') : x.match]++;
      if (x.match === 'none' || x.match === 'ambiguous') {
        res.issues.push({ sheet: o.rec.sheet, row: o.rec.row, type: x.match === 'none' ? 'cancelNone' : 'cancelAmbiguous', value: [x.insuredName, x.policyText, x.company].filter(Boolean).join(' · '), cancelId: x.id });
      }
    });
    // remember each month's sheet layout: Excel export and writing back to the file use it
    var monthsTouched = [];
    (analysis ? analysis.sheets : []).forEach(function (s) {
      if (!s.include || !s.month.key) return;
      monthsTouched.push(s.month.key);
      Store.months[s.month.key] = {
        sheet: s.name, file: opts.fileName || '', at: now,
        columns: s.columns.filter(function (c) { return c.role !== 'ignored'; }).map(function (c) { return { header: c.header, field: c.role === 'custom' ? null : c.field }; }),
        layout: root.Importer && root.Importer.layoutOf ? root.Importer.layoutOf(s) : null
      };
    });
    var entry = {
      id: importId, file: opts.fileName || '', at: Date.now(), mode: opts.mode || 'merge',
      sheets: (analysis ? analysis.sheets.filter(function (s) { return s.include && s.month.key; }).length : 0),
      months: Array.from(new Set(monthsTouched)).sort(),
      rows: records.length, added: res.added.length, updated: res.updated.length, unchanged: res.unchanged,
      duplicateRows: res.duplicateRows, customersAdded: res.customersAdded.length, customersUpdated: res.customersUpdated.length,
      issues: res.issues.length, cancels: res.cancels.rows, cancelsAdded: res.cancels.added
    };
    Store.imports = [entry].concat(Store.imports).slice(0, 50);
    if (opts.saveMappings && Object.keys(opts.saveMappings).length) {
      Object.assign(Store.mappings, opts.saveMappings);
      putMeta('mappings');
    }
    return cleared.then(function () {
      var ps = [
        put('customers', res.customersAdded.concat(res.customersUpdated)),
        put('policies', res.added.concat(res.updated)),
        put('cancellations', Array.from(new Set(cres.added.concat(cres.updated, relinked)))),
        putMeta('months'),
        putMeta('imports')
      ];
      Store.log({ type: 'import', text: entry.file, importId: importId, count: entry.added });
      emit();
      return Promise.all(ps).then(function () { return { result: res, entry: entry }; });
    });
  };

  /** Removes the policies an import added (and the customers it created that have nothing left). */
  Store.undoImport = function (importId) {
    var removed = [], removedCustomers = [];
    Store.policies.forEach(function (p) { if (p.source && p.source.importId === importId) removed.push(p); });
    removed.forEach(function (p) { Store.policies.delete(p.id); });
    var left = new Set();
    Store.policies.forEach(function (p) { left.add(p.customerId); });
    Store.customers.forEach(function (c) { if (c.createdBy === importId && !left.has(c.id)) removedCustomers.push(c); });
    removedCustomers.forEach(function (c) { Store.customers.delete(c.id); });
    var removedCancels = [];
    Store.cancellations.forEach(function (x) { if (x.source && x.source.importId === importId) removedCancels.push(x.id); });
    removedCancels.forEach(function (id) { Store.cancellations.delete(id); });
    del('policies', removed.map(function (p) { return p.id; }));
    del('customers', removedCustomers.map(function (c) { return c.id; }));
    del('cancellations', removedCancels);
    relinkAndSave();
    Store.imports = Store.imports.map(function (e) { return e.id === importId ? Object.assign({}, e, { undone: Date.now() }) : e; });
    putMeta('imports');
    emit();
    return { policies: removed.length, customers: removedCustomers.length, cancels: removedCancels.length };
  };

  Store.deleteMonth = function (key, removeOrphans) {
    var removed = [];
    Store.policies.forEach(function (p) { if (p.month === key) removed.push(p); });
    removed.forEach(function (p) { Store.policies.delete(p.id); });
    var orphans = [];
    if (removeOrphans) {
      var left = new Set();
      Store.policies.forEach(function (p) { left.add(p.customerId); });
      Store.customers.forEach(function (c) { if (!left.has(c.id)) orphans.push(c); });
      orphans.forEach(function (c) { Store.customers.delete(c.id); });
    }
    var cancels = Store.cancellationsOf(key).map(function (x) { return x.id; });
    cancels.forEach(function (id) { Store.cancellations.delete(id); });
    delete Store.months[key];
    del('policies', removed.map(function (p) { return p.id; }));
    del('customers', orphans.map(function (c) { return c.id; }));
    del('cancellations', cancels);
    relinkAndSave();
    putMeta('months');
    emit();
    return { policies: removed.length, customers: orphans.length };
  };

  /** Deletes customers, policies, tasks, notes and import history; settings stay. */
  Store.clearData = function (opts) {
    Store.customers = new Map();
    Store.policies = new Map();
    Store.tasks = new Map();
    Store.activities = new Map();
    Store.cancellations = new Map();
    Store.months = {};
    Store.imports = [];
    var p = Promise.all(['customers', 'policies', 'tasks', 'activities', 'cancellations'].map(function (s) { return track(DB.clear(s)); }))
      .then(function () { return Promise.all([putMeta('months'), putMeta('imports')]); });
    if (!opts || !opts.silent) emit();
    return p;
  };

  // ------------------------------------------------------------------ backup
  Store.backup = function () {
    return {
      app: 'sigorta-portfoy', format: 1, exportedAt: new Date().toISOString(),
      settings: Store.settings, months: Store.months, imports: Store.imports, mappings: Store.mappings,
      customers: Array.from(Store.customers.values()), policies: Array.from(Store.policies.values()),
      tasks: Array.from(Store.tasks.values()), activities: Array.from(Store.activities.values()),
      cancellations: Array.from(Store.cancellations.values())
    };
  };

  Store.markBackup = function () { Store.settings.lastBackupAt = Date.now(); saveSettings(); emit('settings'); };

  Store.validateBackup = function (obj) {
    return !!(obj && obj.app === 'sigorta-portfoy' && Array.isArray(obj.customers) && Array.isArray(obj.policies));
  };

  Store.restore = function (obj) {
    if (!Store.validateBackup(obj)) return Promise.reject(new Error('invalid backup'));
    return Store.clearData({ silent: true }).then(function () {
      Store.customers = new Map(obj.customers.map(function (x) { return [x.id, x]; }));
      Store.policies = new Map(obj.policies.map(function (x) { return [x.id, x]; }));
      Store.tasks = new Map((obj.tasks || []).map(function (x) { return [x.id, x]; }));
      Store.activities = new Map((obj.activities || []).map(function (x) { return [x.id, x]; }));
      Store.cancellations = new Map((obj.cancellations || []).map(function (x) { return [x.id, x]; }));
      Store.months = obj.months || {};
      Store.imports = obj.imports || [];
      Store.mappings = obj.mappings || {};
      if (obj.settings) Store.settings = Object.assign({}, DEFAULT_SETTINGS, obj.settings, { lastBackupAt: Store.settings.lastBackupAt });
      return Promise.all([
        put('customers', Array.from(Store.customers.values())),
        put('policies', Array.from(Store.policies.values())),
        put('tasks', Array.from(Store.tasks.values())),
        put('activities', Array.from(Store.activities.values())),
        put('cancellations', Array.from(Store.cancellations.values())),
        putMeta('months'), putMeta('imports'), putMeta('mappings'), saveSettings()
      ]);
    }).then(function () { emit('load'); });
  };

  root.Store = Store;
})(typeof self !== 'undefined' ? self : this);
