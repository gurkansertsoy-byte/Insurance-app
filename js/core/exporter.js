/* Sigorta Portföy - writes workbooks: one sheet per month in the agency's own column layout. */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var mod = factory(root.U || (req && req('./util.js')), root.Schema || (req && req('./schema.js')), root.Portfolio || (req && req('./portfolio.js')));
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.Exporter = mod;
})(typeof self !== 'undefined' ? self : this, function (U, Schema, Portfolio) {
  'use strict';

  // escaped dots: Excel shows 29.10.2026, and SheetJS can format it too (it cannot format a bare dd.mm.yyyy)
  var DATE_FMT = 'dd\\.mm\\.yyyy';
  var MONEY_FMT = '#,##0.00';

  function typeOf(field) {
    var f = Schema.BY_KEY[field];
    if (!f) return 'text';
    if (f.type === 'name' || f.type === 'phone' || f.type === 'email' || f.type === 'plate') return 'text';
    return f.type;
  }

  function toCell(v, type) {
    if (v == null || v === '') return null;
    switch (type) {
      case 'date': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return { t: 's', v: String(v) };
        return { t: 'n', v: U.isoToSerial(v), z: DATE_FMT };
      }
      case 'money': return typeof v === 'number' ? { t: 'n', v: v, z: MONEY_FMT } : { t: 's', v: String(v) };
      case 'int': case 'number': return typeof v === 'number' ? { t: 'n', v: v } : { t: 's', v: String(v) };
      case 'pct': return typeof v === 'number' ? { t: 'n', v: v, z: '0.0%' } : { t: 's', v: String(v) };
      default: return { t: 's', v: String(v) };
    }
  }

  function makeSheet(XLSX, header, rows, types, filterCols) {
    var ws = {};
    var widths = header.map(function (h) { return Math.max(8, String(h).length + 2); });
    header.forEach(function (h, c) { if (h !== '') ws[XLSX.utils.encode_cell({ r: 0, c: c })] = { t: 's', v: String(h) }; });
    rows.forEach(function (row, r) {
      row.forEach(function (v, c) {
        var cell = toCell(v, types[c]);
        if (!cell) return;
        ws[XLSX.utils.encode_cell({ r: r + 1, c: c })] = cell;
        var len = types[c] === 'date' ? 10 : types[c] === 'money' ? String(Math.round(v)).length + 5 : String(v).length;
        if (len + 2 > widths[c]) widths[c] = Math.min(48, len + 2);
      });
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length), c: Math.max(0, header.length - 1) } });
    ws['!cols'] = widths.map(function (w) { return { wch: w }; });
    var fc = filterCols || header.length;
    if (fc) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: fc - 1 } }) };
    return ws;
  }

  function valueFor(field, p, c) {
    switch (field) {
      case 'name': return c ? c.name : (p.row && p.row.name) || '';
      case 'tc': return c ? c.tc : (p.row && p.row.tc) || '';
      case 'phone': return c && c.phone ? U.formatPhone(c.phone) : (p.row && p.row.phone ? U.formatPhone(p.row.phone) : '');
      case 'profession': return c ? c.profession : (p.row && p.row.profession) || '';
      case 'email': case 'address': case 'birthDate': return c ? c[field] : '';
      case 'newBusiness': return p.newBusiness === true ? 'Evet' : p.newBusiness === false ? 'Hayır' : '';
      default: return p[field];
    }
  }

  function hasData(policies, customers, field) {
    return policies.some(function (p) {
      var v = valueFor(field, p, customers.get(p.customerId));
      return v != null && v !== '';
    });
  }

  /** Columns for one month: the original sheet layout first, then anything new. */
  function monthColumns(policies, customers, meta) {
    var cols = [];
    var usedFields = new Set(), usedExtras = new Set();
    if (meta && meta.columns && meta.columns.length) {
      meta.columns.forEach(function (col) {
        var f = col.field === '_first' ? 'name' : col.field;
        if (f === '_last') return;
        if (f && Schema.BY_KEY[f]) {
          cols.push({ header: f === col.field ? col.header : Schema.BY_KEY.name.excel, field: f });
          usedFields.add(f);
        } else if (!f) {
          cols.push({ header: col.header, extra: col.header });
          usedExtras.add(col.header);
        }
      });
      Schema.EXPORT_ORDER.forEach(function (f) {
        if (!usedFields.has(f) && hasData(policies, customers, f)) { cols.push({ header: Schema.BY_KEY[f].excel, field: f }); usedFields.add(f); }
      });
    } else {
      Schema.EXPORT_ORDER.forEach(function (f) { cols.push({ header: Schema.BY_KEY[f].excel, field: f }); usedFields.add(f); });
    }
    var original = !!(meta && meta.columns && meta.columns.length);
    Schema.OPTIONAL_ORDER.forEach(function (f) {
      if (usedFields.has(f)) return;
      // an imported month keeps its own layout: customer details learned elsewhere go to the customer sheet
      if (original && Schema.BY_KEY[f].scope === 'customer') return;
      if (hasData(policies, customers, f)) { cols.push({ header: Schema.BY_KEY[f].excel, field: f }); usedFields.add(f); }
    });
    var extras = [];
    policies.forEach(function (p) {
      if (p.extras) Object.keys(p.extras).forEach(function (k) { if (!usedExtras.has(k) && extras.indexOf(k) < 0) extras.push(k); });
    });
    extras.forEach(function (k) { cols.push({ header: k, extra: k }); });
    return cols;
  }

  function sortForSheet(policies) {
    return policies.slice().sort(function (a, b) {
      var sa = a.source && a.source.row, sb = b.source && b.source.row;
      if (sa && sb && a.source.sheet === b.source.sheet) return sa - sb;
      if (sa && !sb) return -1;
      if (!sa && sb) return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  // the İptal block that closes every month sheet, in the agency's own order and wording
  var BLOCK_KINDS = ['company', 'policy', 'insured', 'card', 'account', 'cash'];
  var BLOCK_HEADERS = ['ŞİRKET', 'POLİÇE', 'SİGORTALI AD SOYAD', 'KART', 'CARİ', 'NAKİT'];
  function blockLayout(meta) {
    var b = meta && meta.layout && meta.layout.block;
    return b && b.kinds && b.kinds.length === 6 ? { kinds: b.kinds, headers: b.headers } : { kinds: BLOCK_KINDS, headers: BLOCK_HEADERS };
  }
  function cancelValue(kind, x) {
    switch (kind) {
      case 'company': return x.company || '';
      case 'policy': return x.policyText || '';
      case 'insured': return x.insuredName || '';
      default: return x[kind] || null;
    }
  }
  function sortCancels(list) {
    return list.slice().sort(function (a, b) { return (a.source && a.source.row || 1e9) - (b.source && b.source.row || 1e9) || (a.createdAt || 0) - (b.createdAt || 0); });
  }

  function monthSheet(XLSX, policies, customers, meta, cancels) {
    var cols = monthColumns(policies, customers, meta);
    var rows = sortForSheet(policies).map(function (p) {
      var c = customers.get(p.customerId);
      return cols.map(function (col) {
        if (col.extra) return p.extras ? p.extras[col.extra] : '';
        return valueFor(col.field, p, c);
      });
    });
    var header = cols.map(function (c) { return c.header; });
    var types = cols.map(function (c) { return c.extra ? 'text' : typeOf(c.field); });
    // one empty column, then the İptal block
    var bl = blockLayout(meta);
    var xs = sortCancels(cancels || []);
    var n = header.length;
    header = header.concat([''], bl.headers);
    types = types.concat(['text'], bl.kinds.map(function (k) { return k === 'card' || k === 'account' || k === 'cash' ? 'money' : 'text'; }));
    for (var i = 0; i < Math.max(rows.length, xs.length); i++) {
      var row = rows[i] || cols.map(function () { return null; });
      row.push(null);
      bl.kinds.forEach(function (k) { row.push(xs[i] ? cancelValue(k, xs[i]) : null); });
      rows[i] = row;
    }
    var ws = makeSheet(XLSX, header, rows, types, n);
    ws['!cols'][n] = { wch: 3 };
    return ws;
  }

  function safeSheetName(name, used) {
    var base = String(name).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sayfa';
    var n = base, i = 2;
    while (used.has(n.toLowerCase())) { n = base.slice(0, 28) + ' ' + i; i++; }
    used.add(n.toLowerCase());
    return n;
  }

  function customersSheet(XLSX, customers, policies, lang, outstandingFn) {
    var owed = outstandingFn || function (p) { return Portfolio.outstanding(p); };
    var byC = U.groupBy(policies, function (p) { return p.customerId; });
    var header = lang === 'en'
      ? ['Full name', 'National ID', 'Phone', 'Other phones', 'Email', 'Occupation', 'Address', 'Date of birth', 'Policies', 'Months', 'Total premium', 'Total commission', 'Open balance', 'Notes']
      : ['Adı soyadı', 'Tc kimlik no', 'İletişim', 'Diğer telefonlar', 'E-posta', 'Meslek', 'Adres', 'Doğum tarihi', 'Poliçe sayısı', 'Aylar', 'Toplam prim', 'Toplam komisyon', 'Cari bakiye', 'Notlar'];
    var types = ['text', 'id', 'text', 'text', 'text', 'text', 'text', 'date', 'int', 'text', 'money', 'money', 'money', 'text'];
    var list = Array.from(customers.values()).sort(function (a, b) { return U.cmp(a.name, b.name); });
    var rows = list.map(function (c) {
      var ps = byC.get(c.id) || [];
      var months = Array.from(new Set(ps.map(function (p) { return p.month; }))).sort();
      var others = Portfolio.phonesOf(c).filter(function (x) { return x !== c.phone; }).map(U.formatPhone).join(', ');
      return [c.name, c.tc, c.phone ? U.formatPhone(c.phone) : '', others, c.email, c.profession, c.address, c.birthDate,
        ps.length, months.map(function (m) { return U.monthLabel(m, lang, true); }).join(', '),
        U.round2(U.sum(ps, function (p) { return p.premium; })), U.round2(U.sum(ps, function (p) { return p.commission; })),
        U.round2(U.sum(ps, owed)) || '', c.notes];
    });
    return makeSheet(XLSX, header, rows, types);
  }

  function summarySheet(XLSX, policies, lang, cancels) {
    var header = lang === 'en'
      ? ['Month', 'Policies', 'New business', 'Premium', 'Commission', 'Commission %', 'Card', 'On account', 'Cash', 'Cancelled', 'Refunded']
      : ['Ay', 'Poliçe sayısı', 'Yeni iş', 'Prim', 'Komisyon', 'Komisyon %', 'Kart', 'Cari', 'Nakit', 'İptal', 'İade'];
    var byMonth = U.groupBy(cancels || [], function (x) { return x.month; });
    var agg = Portfolio.aggregate(policies, function (p) { return p.month; }, true);
    var keys = new Set(agg.map(function (r) { return r.key; }));
    byMonth.forEach(function (v, k) { if (!keys.has(k)) agg.push(Object.assign(Portfolio.totals([]), { key: k })); });
    agg.sort(function (a, b) { return U.cmp(a.key, b.key); });
    var rows = agg.map(function (r) {
      var xs = byMonth.get(r.key) || [];
      return [U.monthLabel(r.key, lang), r.count, r.newCount, r.premium, r.commission, r.premium ? r.commission / r.premium : '', r.card, r.account, r.cash, xs.length, U.round2(U.sum(xs, Portfolio.refundOf))];
    });
    var t = Portfolio.totals(policies);
    var all = cancels || [];
    rows.push([lang === 'en' ? 'Total' : 'Toplam', t.count, t.newCount, t.premium, t.commission, t.premium ? t.commission / t.premium : '', t.card, t.account, t.cash, all.length, U.round2(U.sum(all, Portfolio.refundOf))]);
    return makeSheet(XLSX, header, rows, ['text', 'int', 'int', 'money', 'money', 'pct', 'money', 'money', 'money', 'int', 'money']);
  }

  /**
   * opts: { XLSX, policies (array), customers (Map), monthsMeta, lang, months (keys to include, optional),
   *         cancels (İptal rows, array), outstanding (policy -> open balance), withCustomers, withSummary }
   */
  function portfolioWorkbook(opts) {
    var XLSX = opts.XLSX;
    var wb = XLSX.utils.book_new();
    var used = new Set();
    var byMonth = U.groupBy(opts.policies, function (p) { return p.month; });
    var cancels = (opts.cancels || []).filter(function (x) { return !opts.months || opts.months.indexOf(x.month) >= 0; });
    var cancelsByMonth = U.groupBy(cancels, function (x) { return x.month; });
    var all = new Set(Array.from(byMonth.keys()).concat(Array.from(cancelsByMonth.keys())));
    var keys = (opts.months || Array.from(all)).filter(function (k) { return all.has(k); }).sort();
    if (opts.withSummary) XLSX.utils.book_append_sheet(wb, summarySheet(XLSX, opts.policies, opts.lang, cancels), safeSheetName(opts.lang === 'en' ? 'Summary' : 'Özet', used));
    keys.forEach(function (k) {
      var ws = monthSheet(XLSX, byMonth.get(k) || [], opts.customers, opts.monthsMeta && opts.monthsMeta[k], cancelsByMonth.get(k));
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName(U.monthLabel(k, 'tr'), used));
    });
    if (opts.withCustomers) XLSX.utils.book_append_sheet(wb, customersSheet(XLSX, opts.customers, opts.policies, opts.lang, opts.outstanding), safeSheetName(opts.lang === 'en' ? 'Customers' : 'Müşteriler', used));
    if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, makeSheet(XLSX, ['—'], [], ['text']), 'Sayfa1');
    return wb;
  }

  /** A generic table: columns [{ label, type, value(row) }]. */
  function tableWorkbook(XLSX, sheets) {
    var wb = XLSX.utils.book_new();
    var used = new Set();
    sheets.forEach(function (s) {
      var ws = makeSheet(XLSX, s.columns.map(function (c) { return c.label; }), s.rows.map(function (r) { return s.columns.map(function (c) { return c.value(r); }); }), s.columns.map(function (c) { return c.type || 'text'; }));
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.name, used));
    });
    return wb;
  }

  function writeFile(XLSX, wb, fileName) {
    XLSX.writeFile(wb, fileName, { compression: true, bookType: /\.xls$/i.test(fileName) ? 'xls' : 'xlsx' });
  }

  return {
    portfolioWorkbook: portfolioWorkbook, monthSheet: monthSheet, monthColumns: monthColumns, customersSheet: customersSheet,
    summarySheet: summarySheet, tableWorkbook: tableWorkbook, makeSheet: makeSheet, writeFile: writeFile, valueFor: valueFor,
    BLOCK_KINDS: BLOCK_KINDS, BLOCK_HEADERS: BLOCK_HEADERS, blockLayout: blockLayout, cancelValue: cancelValue
  };
});
