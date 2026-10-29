/* Sigorta Portföy - customer matching, import merge, renewals, opportunities and totals (pure logic). */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var mod = factory(root.U || (req && req('./util.js')), root.Schema || (req && req('./schema.js')));
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.Portfolio = mod;
})(typeof self !== 'undefined' ? self : this, function (U, Schema) {
  'use strict';

  var POLICY_FIELDS = ['policyType', 'company', 'policyNo', 'startDate', 'endDate', 'issueDate', 'plate', 'serialNo',
    'step', 'premium', 'netPremium', 'commission', 'newBusiness', 'card', 'account', 'cash', 'note', 'insuredName', 'agent'];
  var CUSTOMER_FIELDS = ['name', 'tc', 'phone', 'email', 'profession', 'address', 'birthDate'];
  var NOT_RENEWABLE = { seyahat: true };

  function nameKey(s) { return U.fold(s); }
  function strongId(tc) { var k = U.idKind(tc); return k === 'tckn' || k === 'vkn'; }

  // ------------------------------------------------------------------ customer index
  function CustomerIndex() {
    this.byTc = new Map();
    this.byName = new Map();
    this.byPhone = new Map();
    this.plates = new Map();
  }

  function pushTo(map, key, val) {
    if (!key) return;
    var arr = map.get(key);
    if (!arr) map.set(key, arr = []);
    if (arr.indexOf(val) < 0) arr.push(val);
  }

  function removeFrom(map, key, val) {
    var arr = map.get(key);
    if (!arr) return;
    var i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1);
    if (!arr.length) map.delete(key);
  }

  CustomerIndex.prototype.add = function (c) {
    if (c.tc && strongId(c.tc)) this.byTc.set(c.tc, c);
    pushTo(this.byName, nameKey(c.name), c);
    var self = this;
    phonesOf(c).forEach(function (p) { pushTo(self.byPhone, p, c); });
  };

  CustomerIndex.prototype.remove = function (c) {
    if (c.tc && this.byTc.get(c.tc) === c) this.byTc.delete(c.tc);
    removeFrom(this.byName, nameKey(c.name), c);
    var self = this;
    phonesOf(c).forEach(function (p) { removeFrom(self.byPhone, p, c); });
  };

  CustomerIndex.prototype.addPlate = function (customerId, plate) {
    var k = U.plateKey(plate);
    if (!k) return;
    if (!this.plates.has(k)) this.plates.set(k, new Set());
    this.plates.get(k).add(customerId);
  };

  /** Finds the existing customer a row belongs to. Returns { customer, by } or null. */
  CustomerIndex.prototype.match = function (f) {
    var hasStrong = f.tc && strongId(f.tc);
    if (hasStrong && this.byTc.has(f.tc)) return { customer: this.byTc.get(f.tc), by: 'tc' };
    var nk = nameKey(f.name);
    var cands = nk ? (this.byName.get(nk) || []).slice() : [];
    // a different valid ID number means a different person with the same name
    if (hasStrong) cands = cands.filter(function (c) { return !c.tc || !strongId(c.tc); });
    if (!cands.length) return null;
    if (f.phone) {
      var byPhone = cands.filter(function (c) { return phonesOf(c).indexOf(f.phone) >= 0; });
      if (byPhone.length) return { customer: byPhone[0], by: 'name+phone' };
    }
    var pk = f.plate ? U.plateKey(f.plate) : '';
    if (pk && this.plates.has(pk)) {
      var owners = this.plates.get(pk);
      var byPlate = cands.filter(function (c) { return owners.has(c.id); });
      if (byPlate.length) return { customer: byPlate[0], by: 'name+plate' };
    }
    if (cands.length === 1) return { customer: cands[0], by: 'name' };
    return { customer: cands[0], by: 'name-ambiguous' };
  };

  function phonesOf(c) {
    var out = (c.phones || []).slice();
    if (c.phone && out.indexOf(c.phone) < 0) out.unshift(c.phone);
    return out;
  }

  function buildIndex(state) {
    var idx = new CustomerIndex();
    state.customers.forEach(function (c) { idx.add(c); });
    state.policies.forEach(function (p) { if (p.plate) idx.addPlate(p.customerId, p.plate); });
    return idx;
  }

  // ------------------------------------------------------------------ records -> customers & policies
  function customerFromFields(f, now, month) {
    return {
      id: U.uid('c'),
      name: f.name || f.insuredName || '',
      tc: f.tc || '',
      phone: f.phone || '',
      phones: f._phones ? f._phones.slice() : (f.phone ? [f.phone] : []),
      email: f.email || '',
      profession: f.profession || '',
      address: f.address || '',
      birthDate: f.birthDate || '',
      notes: '',
      tags: [],
      lastSeenMonth: month || '',
      createdAt: now,
      updatedAt: now
    };
  }

  /** Copies what a newer row knows about the customer. Returns true when something changed. */
  function mergeCustomerInfo(c, f, month) {
    var changed = false;
    if (f.tc && c.tc !== f.tc) {
      if (!c.tc || (!strongId(c.tc) && strongId(f.tc))) { c.tc = f.tc; changed = true; }
    }
    var newer = !c.lastSeenMonth || (month && month >= c.lastSeenMonth);
    var phones = f._phones || (f.phone ? [f.phone] : []);
    c.phones = c.phones || [];
    phones.forEach(function (p) { if (c.phones.indexOf(p) < 0) { c.phones.push(p); changed = true; } });
    if (f.phone && (!c.phone || (newer && c.phone !== f.phone && U.isMobile(f.phone)))) { c.phone = f.phone; changed = true; }
    if (f.profession && (!c.profession || (newer && c.profession !== f.profession))) { c.profession = f.profession; changed = true; }
    ['email', 'address', 'birthDate'].forEach(function (k) {
      if (f[k] && !c[k]) { c[k] = f[k]; changed = true; }
    });
    if (!c.name && f.name) { c.name = f.name; changed = true; }
    if (newer && month) c.lastSeenMonth = month;
    return changed;
  }

  function policyFromRecord(rec, customerId, ctx) {
    var f = rec.fields;
    var p = { id: U.uid('p'), customerId: customerId, month: rec.month };
    POLICY_FIELDS.forEach(function (k) { if (f[k] != null && f[k] !== '') p[k] = f[k]; });
    var row = {};
    ['name', 'tc', 'phone', 'profession'].forEach(function (k) { if (f[k]) row[k] = f[k]; });
    p.row = row;
    if (rec.extras && Object.keys(rec.extras).length) p.extras = rec.extras;
    p.source = { type: 'import', importId: ctx.importId, file: ctx.fileName || '', sheet: rec.sheet, row: rec.row };
    p.createdAt = ctx.now;
    p.updatedAt = ctx.now;
    return p;
  }

  function policyKey(p, customerName) {
    if (p.policyNo) return p.month + '|no|' + U.fold(p.policyNo);
    return [p.month, 'fp', nameKey(customerName), U.fold(p.policyType), U.plateKey(p.plate || ''), p.endDate || '', p.premium == null ? '' : p.premium].join('|');
  }

  function sameContent(a, b) {
    return POLICY_FIELDS.every(function (k) {
      var x = a[k] == null ? '' : a[k], y = b[k] == null ? '' : b[k];
      return String(x) === String(y);
    });
  }

  function updateFromImport(existing, incoming, now) {
    var changed = false;
    POLICY_FIELDS.forEach(function (k) {
      if (incoming[k] != null && incoming[k] !== '' && String(incoming[k]) !== String(existing[k] == null ? '' : existing[k])) {
        existing[k] = incoming[k];
        changed = true;
      }
    });
    if (incoming.extras) {
      existing.extras = existing.extras || {};
      Object.keys(incoming.extras).forEach(function (k) {
        if (existing.extras[k] !== incoming.extras[k]) { existing.extras[k] = incoming.extras[k]; changed = true; }
      });
    }
    if (changed) existing.updatedAt = now;
    return changed;
  }

  /**
   * Merges import records into state ({ customers: Map, policies: Map }).
   * Rows already imported before (same month + policy number, or same content) update the existing policy.
   */
  function importRecords(state, records, opts) {
    opts = opts || {};
    var ctx = { now: opts.now || Date.now(), importId: opts.importId || U.uid('i'), fileName: opts.fileName || '' };
    var idx = buildIndex(state);
    var byKey = new Map();
    state.policies.forEach(function (p) {
      var c = state.customers.get(p.customerId);
      pushTo(byKey, policyKey(p, c ? c.name : ''), p);
    });
    var claimed = new Set();
    var res = {
      importId: ctx.importId, added: [], updated: [], unchanged: 0, duplicateRows: 0,
      customersAdded: [], customersUpdated: [], matchedBy: { tc: 0, 'name+phone': 0, 'name+plate': 0, name: 0, 'name-ambiguous': 0 },
      issues: []
    };
    var updatedCustomers = new Set();

    records.forEach(function (rec) {
      var f = rec.fields;
      var m = idx.match(f);
      var c;
      if (m) {
        c = m.customer;
        res.matchedBy[m.by]++;
        idx.remove(c);
        if (mergeCustomerInfo(c, f, rec.month)) { c.updatedAt = ctx.now; updatedCustomers.add(c); }
        idx.add(c);
        if (m.by === 'name-ambiguous') res.issues.push({ sheet: rec.sheet, row: rec.row, type: 'ambiguousName', value: c.name });
      } else {
        c = customerFromFields(f, ctx.now, rec.month);
        state.customers.set(c.id, c);
        idx.add(c);
        res.customersAdded.push(c);
      }
      var p = policyFromRecord(rec, c.id, ctx);
      var key = policyKey(p, c.name);
      var pool = byKey.get(key) || [];
      var target = null;
      for (var i = 0; i < pool.length; i++) { if (!claimed.has(pool[i].id)) { target = pool[i]; break; } }
      if (target) {
        claimed.add(target.id);
        if (updateFromImport(target, p, ctx.now)) res.updated.push(target); else res.unchanged++;
      } else if (pool.some(function (x) { return claimed.has(x.id) && sameContent(x, p); })) {
        res.duplicateRows++;
        res.issues.push({ sheet: rec.sheet, row: rec.row, type: 'duplicateRow', value: p.policyNo || c.name });
      } else {
        state.policies.set(p.id, p);
        pushTo(byKey, key, p);
        claimed.add(p.id);
        res.added.push(p);
        if (p.plate) idx.addPlate(c.id, p.plate);
      }
      (rec.issues || []).forEach(function (is) {
        res.issues.push({ sheet: rec.sheet, row: rec.row, type: is.type, field: is.field, value: is.value, customer: c.name });
      });
    });
    res.customersUpdated = Array.from(updatedCustomers).filter(function (c) { return res.customersAdded.indexOf(c) < 0; });
    return res;
  }

  // ------------------------------------------------------------------ cancellations (İptal)
  /** Same row of the same month's İptal block: used to recognise it when the file is imported again. */
  function cancelKey(c) {
    function m(v) { return v == null ? '' : String(U.round2(v)); }
    return [c.month, U.companyKey(c.company || ''), U.fold(c.policyText), nameKey(c.insuredName), m(c.card), m(c.account), m(c.cash)].join('|');
  }

  function refundOf(c) { return U.round2((c.card || 0) + (c.account || 0) + (c.cash || 0)); }

  function noKey(s) { return U.fold(s).replace(/ /g, ''); }
  function looksLikePolicyNo(s) { var k = noKey(s); return k.length >= 5 && /\d/.test(k); }

  function sameName(a, b) {
    var x = nameKey(a), y = nameKey(b);
    if (!x || !y) return false;
    return x === y || x.split(' ').sort().join(' ') === y.split(' ').sort().join(' ');
  }

  function monthEnd(key) { return U.addDays(U.addMonthsToKey(key, 1) + '-01', -1); }

  /** How well policy p fits cancellation c; -1 when it cannot be the cancelled policy. */
  function cancelScore(c, p, customer) {
    if (!p.month || p.month > c.month) return -1;
    var score = 0;
    var byNo = false;
    if (c.policyText && looksLikePolicyNo(c.policyText)) {
      if (p.policyNo) {
        if (noKey(p.policyNo) !== noKey(c.policyText)) return -1;
        byNo = true;
        score += 1000;
      }
    } else if (c.policyText) {
      var cc = Schema.categoryOf(c.policyText), pc = Schema.categoryOf(p.policyType);
      if (cc !== 'diger') {
        if (p.policyType && pc !== cc) return -1;
        if (p.policyType) score += 20;
      } else if (p.policyType) {
        var a = U.fold(c.policyText), b = U.fold(p.policyType);
        if (a === b) score += 20;
        else if (a && b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) score += 10;
        else return -1;
      }
    }
    var nameOk = sameName(c.insuredName, p.insuredName) || sameName(c.insuredName, customer && customer.name) || sameName(c.insuredName, p.row && p.row.name);
    if (nameOk) score += 100;
    else if (!byNo) return -1;
    if (c.company && p.company) {
      if (U.companyKey(c.company) === U.companyKey(p.company)) score += 20;
      else if (!byNo) return -1;
    }
    var refund = refundOf(c);
    if (refund > 0 && p.premium) {
      if (Math.abs(refund - p.premium) < 0.01) score += 5;
      else if (refund > p.premium + 0.01) score -= 20;
    }
    ['card', 'account', 'cash'].forEach(function (k) { if (c[k] > 0 && p[k] > 0) score += 2; });
    // a policy that had already ended by then was not cancelled
    if (p.endDate && p.endDate <= monthEnd(c.month)) score -= 30;
    return score;
  }

  /**
   * Finds the policy each cancellation cancels, one policy per cancellation.
   * cancels: [{ id, month, company, policyText, insuredName, card, account, cash, row? }]
   * opts.taken: policy ids already cancelled by other (kept) cancellations.
   * Returns Map(id -> { policyId, match: 'auto' | 'ambiguous' | 'none', candidates, score })
   */
  function matchCancellations(cancels, policies, customers, opts) {
    opts = opts || {};
    var taken = new Set(opts.taken || []);
    var byName = new Map(), byNo = new Map();
    policies.forEach(function (p) {
      var c = customers && customers.get ? customers.get(p.customerId) : null;
      [p.insuredName, c && c.name, p.row && p.row.name].forEach(function (n) {
        var k = nameKey(n);
        if (k) { pushTo(byName, k, p); pushTo(byName, k.split(' ').sort().join(' '), p); }
      });
      if (p.policyNo) pushTo(byNo, noKey(p.policyNo), p);
    });
    var out = new Map();
    cancels.slice().sort(function (a, b) { return U.cmp(a.month, b.month) || (a.row || 0) - (b.row || 0); }).forEach(function (c) {
      var k = nameKey(c.insuredName);
      var pool = new Set((byName.get(k) || []).concat(byName.get(k.split(' ').sort().join(' ')) || []));
      if (c.policyText && looksLikePolicyNo(c.policyText)) (byNo.get(noKey(c.policyText)) || []).forEach(function (p) { pool.add(p); });
      var scored = [];
      pool.forEach(function (p) {
        if (taken.has(p.id)) return;
        var s = cancelScore(c, p, customers && customers.get ? customers.get(p.customerId) : null);
        if (s >= 0) scored.push({ p: p, s: s });
      });
      scored.sort(function (a, b) { return b.s - a.s || U.cmp(b.p.month, a.p.month) || U.cmp(b.p.endDate || '', a.p.endDate || ''); });
      if (!scored.length) { out.set(c.id, { policyId: null, match: 'none', candidates: [], score: 0 }); return; }
      var top = scored.filter(function (x) { return x.s === scored[0].s; });
      if (top.length > 1) {
        out.set(c.id, { policyId: null, match: 'ambiguous', candidates: top.map(function (x) { return x.p.id; }), score: scored[0].s });
        return;
      }
      taken.add(scored[0].p.id);
      out.set(c.id, { policyId: scored[0].p.id, match: 'auto', candidates: [], score: scored[0].s });
    });
    return out;
  }

  // ------------------------------------------------------------------ renewals
  /**
   * For every policy: { state, daysLeft, successorId }
   * state: renewed | lost | expired | due | active | none (no end date) | short (travel policies) | cancelled
   * opts.cancelled: Map(policyId -> cancellation) for policies cancelled in an İptal block
   */
  function renewalInfo(policies, opts) {
    opts = opts || {};
    var today = opts.today || U.todayISO();
    var windowDays = opts.windowDays || 30;
    var cancelled = opts.cancelled || null;
    var out = new Map();
    var byCustomer = U.groupBy(policies, function (p) { return p.customerId; });
    byCustomer.forEach(function (list) {
      var meta = list.map(function (p) {
        return { p: p, cat: Schema.categoryOf(p.policyType), plate: p.plate ? U.plateKey(p.plate) : '', type: U.fold(p.policyType) };
      });
      meta.forEach(function (a) {
        var p = a.p;
        var info = { state: 'none', daysLeft: null, successorId: null };
        if (cancelled && cancelled.has(p.id)) {
          info.state = 'cancelled';
          info.cancel = cancelled.get(p.id);
          if (p.endDate) info.daysLeft = U.diffDays(today, p.endDate);
          out.set(p.id, info);
          return;
        }
        if (!p.endDate) { out.set(p.id, info); return; }
        info.daysLeft = U.diffDays(today, p.endDate);
        if (NOT_RENEWABLE[a.cat]) { info.state = 'short'; out.set(p.id, info); return; }
        var succ = null;
        for (var i = 0; i < meta.length && !succ; i++) {
          var b = meta[i], q = b.p;
          if (q === p || !q.endDate || b.cat !== a.cat) continue;
          if (cancelled && cancelled.has(q.id)) continue; // a cancelled renewal does not count
          if (a.cat === 'diger' && b.type !== a.type) continue;
          if (a.plate && b.plate && a.plate !== b.plate) continue;
          if (U.diffDays(p.endDate, q.endDate) < 60) continue;
          var qStart = q.startDate || U.addYears(q.endDate, -1);
          if (Math.abs(U.diffDays(p.endDate, qStart)) > 100) continue;
          succ = q;
        }
        var manual = p.renewal && p.renewal.status;
        if (succ) { info.state = 'renewed'; info.successorId = succ.id; }
        else if (manual === 'renewed') info.state = 'renewed';
        else if (manual === 'lost') info.state = 'lost';
        else if (info.daysLeft < 0) info.state = 'expired';
        else if (info.daysLeft <= windowDays) info.state = 'due';
        else info.state = 'active';
        out.set(p.id, info);
      });
    });
    return out;
  }

  /** Share of policies that expired in [from, to] and were renewed. */
  function retention(policies, info, from, to, today) {
    today = today || U.todayISO();
    var base = 0, renewed = 0;
    policies.forEach(function (p) {
      var i = info.get(p.id);
      if (!i || !p.endDate || i.state === 'short' || i.state === 'none' || i.state === 'cancelled') return;
      // a policy that ends today can still be renewed today, so only past expiries count
      if (p.endDate >= today || (from && p.endDate < from) || (to && p.endDate > to)) return;
      base++;
      if (i.state === 'renewed') renewed++;
    });
    return { base: base, renewed: renewed, rate: base ? renewed / base : null };
  }

  // ------------------------------------------------------------------ opportunities
  function opportunities(customer, policies, today) {
    today = today || U.todayISO();
    var recent = policies.filter(function (p) { return !p.endDate || p.endDate >= U.addDays(today, -60); });
    var cats = new Set(recent.map(function (p) { return Schema.categoryOf(p.policyType); }));
    var plates = new Map();
    recent.forEach(function (p) {
      if (!p.plate) return;
      var k = U.plateKey(p.plate);
      if (!plates.has(k)) plates.set(k, { plate: p.plate, cats: new Set() });
      plates.get(k).cats.add(Schema.categoryOf(p.policyType));
    });
    var out = [];
    plates.forEach(function (v) {
      if (v.cats.has('trafik') && !v.cats.has('kasko')) out.push({ type: 'kasko', plate: v.plate });
      if (v.cats.has('kasko') && !v.cats.has('trafik')) out.push({ type: 'trafik', plate: v.plate });
    });
    if (cats.has('dask') && !cats.has('konut')) out.push({ type: 'konut' });
    if (cats.has('konut') && !cats.has('dask')) out.push({ type: 'dask' });
    return out;
  }

  // ------------------------------------------------------------------ money
  function paidOnAccount(p) { return U.round2(U.sum(p.payments || [], function (x) { return x.amount; })); }
  /** What is still owed on the Cari part; credit = the refund an İptal row wrote to Cari. */
  function outstanding(p, credit) {
    var due = p.account || 0;
    if (!due) return 0;
    if (credit) due = Math.max(0, due - credit);
    return U.round2(due - paidOnAccount(p));
  }

  function emptyTotals(key) {
    return { key: key, count: 0, premium: 0, commission: 0, newCount: 0, renewalCount: 0, card: 0, account: 0, cash: 0, customers: new Set() };
  }

  function addTo(t, p) {
    t.count++;
    t.premium += p.premium || 0;
    t.commission += p.commission || 0;
    if (p.newBusiness === true) t.newCount++;
    else if (p.newBusiness === false) t.renewalCount++;
    t.card += p.card || 0;
    t.account += p.account || 0;
    t.cash += p.cash || 0;
    t.customers.add(p.customerId);
  }

  function totals(policies) {
    var t = emptyTotals('all');
    policies.forEach(function (p) { addTo(t, p); });
    return finish(t);
  }

  function finish(t) {
    ['premium', 'commission', 'card', 'account', 'cash'].forEach(function (k) { t[k] = U.round2(t[k]); });
    t.customerCount = t.customers.size;
    delete t.customers;
    return t;
  }

  /** Groups policies by keyFn and returns rows sorted by premium (or by key when sortByKey). */
  function aggregate(policies, keyFn, sortByKey) {
    var m = new Map();
    policies.forEach(function (p) {
      var k = keyFn(p);
      if (k == null || k === '') k = '—';
      if (!m.has(k)) m.set(k, emptyTotals(k));
      addTo(m.get(k), p);
    });
    var rows = Array.from(m.values()).map(finish);
    rows.sort(sortByKey ? function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; } : function (a, b) { return b.premium - a.premium; });
    return rows;
  }

  /** Display name for a company group: the most common spelling, preferring mixed case. */
  function companyNames(policies) {
    var spell = new Map();
    policies.forEach(function (p) {
      if (!p.company) return;
      var k = U.companyKey(p.company);
      if (!spell.has(k)) spell.set(k, new Map());
      var s = spell.get(k);
      s.set(p.company, (s.get(p.company) || 0) + 1);
    });
    var out = new Map();
    spell.forEach(function (s, k) {
      var best = null, bestScore = -1;
      s.forEach(function (n, name) {
        var score = n + (U.isAllUpper(name) ? 0 : 1000);
        if (score > bestScore) { best = name; bestScore = score; }
      });
      out.set(k, U.isAllUpper(best) ? U.titleCase(best) : best);
    });
    return out;
  }

  // ------------------------------------------------------------------ duplicates
  /** Customer groups that look like the same person (same name without conflicting IDs, or same ID). */
  function duplicateGroups(customers) {
    var byName = U.groupBy(customers, function (c) { return nameKey(c.name); });
    var groups = [];
    byName.forEach(function (list, k) {
      if (!k || list.length < 2) return;
      var strong = list.filter(function (c) { return strongId(c.tc); });
      var ids = new Set(strong.map(function (c) { return c.tc; }));
      if (ids.size <= 1) groups.push({ reason: 'name', customers: list });
      else {
        var weak = list.filter(function (c) { return !strongId(c.tc); });
        if (weak.length) groups.push({ reason: 'nameUnclear', customers: list });
      }
    });
    var byPhone = new Map();
    customers.forEach(function (c) { if (c.phone) pushTo(byPhone, c.phone, c); });
    byPhone.forEach(function (list) {
      if (list.length < 2) return;
      var names = new Set(list.map(function (c) { return nameKey(c.name); }));
      if (names.size > 1 && list.every(function (c) { return !strongId(c.tc); })) groups.push({ reason: 'phone', customers: list });
    });
    return groups;
  }

  return {
    POLICY_FIELDS: POLICY_FIELDS, CUSTOMER_FIELDS: CUSTOMER_FIELDS, CustomerIndex: CustomerIndex, buildIndex: buildIndex,
    nameKey: nameKey, strongId: strongId, phonesOf: phonesOf, customerFromFields: customerFromFields,
    mergeCustomerInfo: mergeCustomerInfo, policyKey: policyKey, importRecords: importRecords,
    renewalInfo: renewalInfo, retention: retention, opportunities: opportunities, outstanding: outstanding,
    paidOnAccount: paidOnAccount, totals: totals, aggregate: aggregate, companyNames: companyNames,
    duplicateGroups: duplicateGroups, NOT_RENEWABLE: NOT_RENEWABLE,
    cancelKey: cancelKey, cancelScore: cancelScore, matchCancellations: matchCancellations, refundOf: refundOf, sameName: sameName
  };
});
