/* Sigorta Portföy - writes the app's data back into the agency's own workbook (ExcelJS), keeping its look.
   The link remembers which row of which sheet holds each policy and İptal row, and what the app made of it.
   A save writes only the cells whose value changed. New rows go under the last row of their month (into the
   empty, ready-formatted rows first), removed rows close up, and formulas, the TOPLAM row and the İptal
   block move with the rows they belong to. A month the file does not have gets a sheet laid out like its
   neighbour. */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var mod = factory(root.U || (req && req('./util.js')), root.Schema || (req && req('./schema.js')), root.Exporter || (req && req('./exporter.js')));
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.ExcelSync = mod;
})(typeof self !== 'undefined' ? self : this, function (U, Schema, Exporter) {
  'use strict';

  // escaped dots: Excel shows 29.10.2026 and SheetJS can read the format back too
  var DATE_FMT = 'dd\\.mm\\.yyyy';
  var MONEY_FMT = '#,##0.00';
  var BLOCK_KINDS = ['company', 'policy', 'insured', 'card', 'account', 'cash'];
  var BLOCK_HEADERS = ['ŞİRKET', 'POLİÇE', 'SİGORTALI AD SOYAD', 'KART', 'CARİ', 'NAKİT'];
  var TEMPLATE_BLOCK_ROWS = 17;

  // ------------------------------------------------------------------ values
  /** The value of one main-table column for a policy, as it goes into the cell. Dates are { date: iso }. */
  function cellValue(col, p, c, layout) {
    if (!col.field) return p.extras && p.extras[col.header] != null && p.extras[col.header] !== '' ? String(p.extras[col.header]) : null;
    var f = col.field;
    if (f === '_first' || f === '_last') {
      // separate "Adı" / "Soyadı" columns: the surname is the last word
      var full = U.collapse(Exporter.valueFor('name', p, c) || '');
      var cut = full.lastIndexOf(' ');
      return (f === '_first' ? (cut > 0 ? full.slice(0, cut) : full) : (cut > 0 ? full.slice(cut + 1) : '')) || null;
    }
    if (f === 'newBusiness') {
      var yn = layout.yesNo || { yes: 'Evet', no: 'Hayır' };
      return p.newBusiness === true ? yn.yes || null : p.newBusiness === false ? (yn.no || null) : null;
    }
    var v = Exporter.valueFor(f, p, c);
    if (v == null || v === '') return null;
    var def = Schema.BY_KEY[f];
    var type = def ? def.type : 'text';
    if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? { date: String(v) } : String(v);
    if (type === 'money' || type === 'int') return typeof v === 'number' ? v : String(v);
    return String(v);
  }

  /** { col: value } for the writable columns of a policy row (0-based columns, as in the layout). */
  function policyValues(p, c, layout) {
    var out = {};
    layout.columns.forEach(function (col) {
      if (col.role === 'ignored') return;
      out[col.col] = cellValue(col, p, c, layout);
    });
    return out;
  }

  function cancelValues(x, block) {
    return (block.kinds || BLOCK_KINDS).map(function (k) {
      switch (k) {
        case 'company': return x.company || null;
        case 'policy': return x.policyText || null;
        case 'insured': return x.insuredName || null;
        default: return x[k] ? x[k] : null;
      }
    });
  }

  function same(a, b) { return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b); }
  function changedKeys(now, before) {
    var keys = {};
    Object.keys(now).forEach(function (k) { keys[k] = 1; });
    Object.keys(before || {}).forEach(function (k) { keys[k] = 1; });
    return Object.keys(keys).filter(function (k) { return !same(now[k], before ? before[k] : null); });
  }
  function cloneLayout(l) { return JSON.parse(JSON.stringify(l)); }

  // ------------------------------------------------------------------ link
  /**
   * The link for a workbook that has just been imported: which row holds which policy and İptal row.
   * o: { sheets: [{ name, month, layout }], placed: [{ sheet, row, id }], cancelsPlaced: [...], policies: Map, customers: Map, cancels: Map }
   * Rows are 1-based, as import records carry them.
   */
  function createLink(o) {
    var link = { sheets: {}, months: {} };
    o.sheets.forEach(function (s) {
      if (!s.month || !s.layout) return;
      link.sheets[s.name] = { month: s.month, layout: s.layout, rows: {}, cancels: {} };
      if (!link.months[s.month]) link.months[s.month] = s.name;
    });
    (o.placed || []).forEach(function (x) {
      var s = link.sheets[x.sheet], p = o.policies.get(x.id);
      if (!s || !p || p.month !== s.month || s.rows[x.id] || s.layout.headerRow < 0) return;
      s.rows[x.id] = [x.row, policyValues(p, o.customers.get(p.customerId), s.layout)];
    });
    (o.cancelsPlaced || []).forEach(function (x) {
      var s = link.sheets[x.sheet], c = o.cancels && o.cancels.get(x.id);
      if (!s || !c || !s.layout.block || s.cancels[x.id]) return;
      s.cancels[x.id] = [x.row, cancelValues(c, s.layout.block)];
    });
    return link;
  }

  // ------------------------------------------------------------------ plan
  /**
   * Works out what goes where. o: { link, policies, customers (Map), cancels, monthsMeta }
   * Returns { sheets: [...], link: draft (with sheets for new months), changes } and leaves o.link as it is.
   */
  function buildPlan(o) {
    var link = { sheets: Object.assign({}, o.link.sheets), months: Object.assign({}, o.link.months) };
    var sheets = new Map();
    function entry(name) {
      var s = sheets.get(name);
      if (!s) {
        var l = link.sheets[name];
        s = { name: name, month: l.month, layout: l.layout, create: !!l.pending, template: l.template || null, policies: [], xs: [], deleted: [], xdeleted: [] };
        sheets.set(name, s);
      }
      return s;
    }
    Object.keys(link.sheets).forEach(entry);
    function sheetFor(month) {
      var name = link.months[month];
      if (name && link.sheets[name]) return entry(name);
      // a month the file does not have yet: a new sheet laid out like the closest month sheet
      var tpl = templateFor(link, month);
      name = newSheetName(month, tpl ? tpl.name : null, Object.keys(link.sheets));
      link.sheets[name] = { month: month, layout: tpl ? freshLayout(tpl.layout) : defaultLayout(o.monthsMeta && o.monthsMeta[month]), template: tpl ? tpl.name : null, pending: true, rows: {}, cancels: {} };
      link.months[month] = name;
      return entry(name);
    }
    var heldBy = {}, xheldBy = {};
    Object.keys(link.sheets).forEach(function (name) {
      var l = link.sheets[name];
      Object.keys(l.rows || {}).forEach(function (id) { heldBy[id] = name; });
      Object.keys(l.cancels || {}).forEach(function (id) { xheldBy[id] = name; });
    });
    var at = {}, xat = {};
    o.policies.forEach(function (p) {
      if (!p.month) return;
      var held = heldBy[p.id];
      var s = held && link.sheets[held].month === p.month ? entry(held) : sheetFor(p.month);
      at[p.id] = s.name;
      s.policies.push(p);
    });
    (o.cancels || []).forEach(function (x) {
      if (!x.month) return;
      var held = xheldBy[x.id];
      var s = held && link.sheets[held].month === x.month ? entry(held) : sheetFor(x.month);
      xat[x.id] = s.name;
      s.xs.push(x);
    });
    // rows of things that are gone, or now belong to another month
    Object.keys(heldBy).forEach(function (id) { if (at[id] !== heldBy[id]) entry(heldBy[id]).deleted.push(link.sheets[heldBy[id]].rows[id][0]); });
    Object.keys(xheldBy).forEach(function (id) { if (xat[id] !== xheldBy[id]) entry(xheldBy[id]).xdeleted.push(link.sheets[xheldBy[id]].cancels[id][0]); });

    var out = [], changes = 0;
    sheets.forEach(function (s) {
      var l = link.sheets[s.name];
      if (l.pending && !s.policies.length && !s.xs.length) {
        delete link.sheets[s.name];
        if (link.months[s.month] === s.name) delete link.months[s.month];
        return;
      }
      var layout = s.layout;
      var hasMain = layout.headerRow >= 0;
      s.rows = hasMain ? s.policies.map(function (p) {
        var values = policyValues(p, o.customers.get(p.customerId), layout);
        var h = l.rows && l.rows[p.id];
        return { id: p.id, from: h ? h[0] : null, values: values, keys: h ? changedKeys(values, h[1]) : null, at: p.createdAt || 0, src: (p.source && p.source.row) || 0 };
      }).sort(byPlace) : [];
      s.skipped = hasMain ? 0 : s.policies.length; // a page with only an İptal block has nowhere for policies
      var block = layout.block || { kinds: BLOCK_KINDS };
      s.cancels = s.xs.map(function (x) {
        var values = cancelValues(x, block);
        var h = l.cancels && l.cancels[x.id];
        return { id: x.id, from: h ? h[0] : null, values: values, keys: h ? changedKeys(values, h[1]) : null, at: x.createdAt || 0, src: (x.source && x.source.row) || 0 };
      }).sort(byPlace);
      s.changes = s.deleted.length + s.xdeleted.length + pending(s.rows) + pending(s.cancels) + (s.create ? 1 : 0);
      changes += s.changes;
      delete s.policies;
      delete s.xs;
      out.push(s);
    });
    return { sheets: out, link: link, changes: changes };
  }

  function pending(rows) { return rows.filter(function (r) { return r.from == null || r.keys.length; }).length; }
  function byPlace(a, b) {
    if (a.from != null && b.from != null) return a.from - b.from;
    if (a.from != null) return -1;
    if (b.from != null) return 1;
    return a.at - b.at || a.src - b.src || U.cmp(a.id, b.id);
  }

  /** The month sheet closest in time to `month`, to copy its layout. */
  function templateFor(link, month) {
    var best = null;
    Object.keys(link.sheets).forEach(function (name) {
      var s = link.sheets[name];
      if (s.pending || !s.layout || s.layout.headerRow < 0) return;
      var d = Math.abs(monthIndex(s.month) - monthIndex(month)) - (s.month < month ? 0.5 : 0); // prefer the previous month
      if (!best || d < best.d) best = { name: name, layout: s.layout, d: d };
    });
    return best;
  }
  function monthIndex(key) { return Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)); }

  /** A template's layout for an empty sheet: same columns and block, no rows yet. */
  function freshLayout(l) {
    var out = cloneLayout(l);
    out.lastDataRow = out.dataStart - 1;
    out.totalRow = -1;
    if (out.block) { out.block.lastRow = out.block.headerRow; out.block.totalRow = -1; }
    return out;
  }

  /** Standard layout for a workbook the app creates itself: the month's own columns if known, then the İptal block. */
  function defaultLayout(meta) {
    var cols = meta && meta.columns && meta.columns.length
      ? meta.columns.map(function (c) { return { header: c.header, field: c.field || null }; })
      : Schema.EXPORT_ORDER.map(function (f) { return { header: Schema.BY_KEY[f].excel, field: f }; });
    var columns = cols.map(function (c, i) { return { col: i, header: c.header, field: c.field, role: c.field ? 'primary' : 'custom' }; });
    return {
      headerRow: 0, dataStart: 1, lastDataRow: 0, totalRow: -1, columns: columns,
      block: { headerRow: 0, startCol: columns.length + 1, kinds: BLOCK_KINDS.slice(), headers: BLOCK_HEADERS.slice(), lastRow: 0, totalRow: -1 },
      yesNo: { yes: 'Evet', no: 'Hayır' }
    };
  }

  // sheet names: "EKİM 2026" -> "KASIM 2026", "Ekim 2026" -> "Kasım 2026", "08.2026" -> "11.2026", "Temmuz-2026" -> "Kasım-2026"
  function monthWordIn(text) {
    var f = U.trLower(text);
    var names = U.MONTH_NAMES.tr;
    for (var i = 0; i < names.length; i++) {
      var n = U.trLower(names[i]);
      var at = f.indexOf(n);
      if (at >= 0) return { index: at, length: n.length, month: i + 1 };
    }
    return null;
  }
  function sameCase(model, word) {
    if (model === U.trUpper(model)) return U.trUpper(word);
    if (model === U.trLower(model)) return U.trLower(word);
    return word;
  }
  function renameMonth(text, fromKey, toKey) {
    var name = U.MONTH_NAMES.tr[Number(toKey.slice(5, 7)) - 1];
    var w = monthWordIn(text);
    var out = text;
    if (w) out = text.slice(0, w.index) + sameCase(text.slice(w.index, w.index + w.length), name) + text.slice(w.index + w.length);
    if (fromKey) out = out.replace(new RegExp('\\b' + fromKey.slice(0, 4) + '\\b'), toKey.slice(0, 4));
    return w ? out : null;
  }
  function newSheetName(month, templateName, used) {
    var name = null;
    if (templateName && /^\d{1,2}\.\d{4}$/.test(templateName)) name = month.slice(5, 7) + '.' + month.slice(0, 4);
    else if (templateName) {
      var r = renameMonth(templateName, null, month);
      if (r) name = /\d{4}/.test(r) ? r.replace(/\d{4}/, month.slice(0, 4)) : r + ' ' + month.slice(0, 4);
    }
    if (!name) name = U.monthLabel(month, 'tr');
    name = name.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31);
    var base = name, i = 2;
    var lower = used.map(function (n) { return n.toLowerCase(); });
    while (lower.indexOf(name.toLowerCase()) >= 0) { name = base.slice(0, 27) + ' (' + i + ')'; i++; }
    return name;
  }

  // ------------------------------------------------------------------ formulas
  function colIndex(letters) {
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n;
  }
  function colName(c) {
    var s = '';
    while (c > 0) { var k = (c - 1) % 26; s = String.fromCharCode(65 + k) + s; c = Math.floor((c - 1) / 26); }
    return s;
  }
  function unquote(name) { return name[0] === "'" ? name.slice(1, -1).replace(/''/g, "'") : name; }

  // A1 references: an optional sheet ('Ocak 2026'! or Sayfa1!), a cell and an optional :cell for a range
  var REF = /^(?:('(?:[^']|'')+'|[A-Za-z0-9_.À-￿]+)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?::(\$?)([A-Z]{1,3})(\$?)(\d+))?/;
  var WORD = /[A-Za-z0-9_.À-￿$!'\]]/;
  var AFTER = /^[A-Za-z0-9_(À-￿!]/;

  /** Calls fn for every cell or range reference outside string literals; fn returns the new text or null. */
  function eachRef(formula, fn) {
    var out = '', i = 0, n = formula.length;
    while (i < n) {
      var ch = formula[i];
      if (ch === '"') {
        var j = i + 1;
        while (j < n) { if (formula[j] === '"') { if (formula[j + 1] === '"') { j += 2; continue; } break; } j++; }
        out += formula.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (!i || !WORD.test(formula[i - 1])) {
        var m = REF.exec(formula.slice(i));
        if (m && !AFTER.test(formula.slice(i + m[0].length))) {
          var ref = {
            sheet: m[1] ? unquote(m[1]) : null, prefix: m[1] ? m[1] + '!' : '',
            a: { cAbs: m[2], col: m[3], rAbs: m[4], row: Number(m[5]) },
            b: m[7] ? { cAbs: m[6], col: m[7], rAbs: m[8], row: Number(m[9]) } : null
          };
          var rep = fn(ref);
          out += rep == null ? m[0] : rep;
          i += m[0].length;
          continue;
        }
      }
      out += ch;
      i++;
    }
    return out;
  }
  function refText(x, row) { return x.cAbs + x.col + x.rAbs + row; }

  /** Excel formula with relative row numbers moved by `dr` rows (as Excel does when a row is copied). */
  function shiftFormula(formula, dr) {
    if (!dr) return formula;
    return eachRef(formula, function (ref) {
      function one(x) { return refText(x, x.rAbs ? x.row : Math.max(1, x.row + dr)); }
      return ref.prefix + one(ref.a) + (ref.b ? ':' + one(ref.b) : '');
    });
  }

  /**
   * Formula rewriter for rows that moved inside columns [cmin, cmax] of sheet `target` (like Excel when rows are
   * inserted or deleted): mapRow(r) -> new row or null (deleted), mapRange(r1, r2) -> [r1, r2] or null.
   */
  function rowRemapper(target, cmin, cmax, mapRow, mapRange) {
    var tl = target.toLowerCase();
    return function (formula, own) {
      return eachRef(formula, function (ref) {
        var sheet = ref.sheet != null ? ref.sheet : own;
        if (!sheet || sheet.toLowerCase() !== tl) return null;
        var c = colIndex(ref.a.col);
        if (c < cmin || c > cmax) return null;
        if (!ref.b) {
          var r = mapRow(ref.a.row);
          if (r === ref.a.row) return null;
          return r == null ? '#REF!' : ref.prefix + refText(ref.a, r);
        }
        var lo = Math.min(ref.a.row, ref.b.row), hi = Math.max(ref.a.row, ref.b.row);
        var rr = mapRange(lo, hi);
        if (!rr) return '#REF!';
        if (rr[0] === lo && rr[1] === hi) return null;
        return ref.prefix + refText(ref.a, rr[0]) + ':' + refText(ref.b, rr[1]);
      });
    };
  }

  function formulaOf(cell) {
    var v = cell && cell.value;
    return v && typeof v === 'object' && typeof v.formula === 'string' ? v.formula : null;
  }

  /** Shared formulas break when their first cell moves: make every one of them a formula of its own. */
  function unshareFormulas(ws) {
    ws.eachRow({ includeEmpty: false }, function (row) {
      row.eachCell({ includeEmpty: false }, function (cell) {
        var v = cell.value;
        if (v && typeof v === 'object' && (v.sharedFormula || v.shareType === 'shared')) {
          cell.value = { formula: cell.formula, result: v.result };
        }
      });
    });
  }

  /** Rewrites every formula in the workbook (and defined names, filters, print areas) with fx. skip(ws, r, c) leaves cells out. */
  function rewriteWorkbook(wb, fx, skip) {
    wb.worksheets.forEach(function (w) {
      w.eachRow({ includeEmpty: false }, function (row, r) {
        row.eachCell({ includeEmpty: false }, function (cell, c) {
          var f = formulaOf(cell);
          if (!f || (skip && skip(w, r, c))) return;
          var g = fx(f, w.name);
          if (g !== f) cell.value = { formula: g, result: cell.value.result };
        });
      });
      if (typeof w.autoFilter === 'string') w.autoFilter = fx(w.autoFilter, w.name);
      if (w.pageSetup && typeof w.pageSetup.printArea === 'string') w.pageSetup.printArea = fx(w.pageSetup.printArea, w.name);
      (w.conditionalFormattings || []).forEach(function (cf) {
        if (typeof cf.ref === 'string') cf.ref = cf.ref.split(/\s+/).map(function (r) { return fx(r, w.name); }).join(' ');
      });
    });
    try {
      var model = wb.definedNames.model;
      var changed = false;
      model.forEach(function (d) {
        d.ranges = d.ranges.map(function (r) { var g = fx(r, null); if (g !== r) changed = true; return g; });
      });
      if (changed) wb.definedNames.model = model;
    } catch (e) { /* names the writer cannot rebuild stay as they are */ }
  }

  // ------------------------------------------------------------------ cells
  function cloneStyle(s) { return s ? JSON.parse(JSON.stringify(s)) : {}; }
  function isSlave(cell) { return cell.isMerged && cell.master !== cell; }

  function isBlankValue(v) {
    if (v == null) return true;
    if (typeof v === 'string') return !v.trim();
    if (v instanceof Date || typeof v !== 'object') return false;
    if (v.richText) return !v.richText.map(function (t) { return t.text; }).join('').trim();
    // a formula waiting for its row (=IF(A5="";"";…) filled down) does not make the row used
    if (typeof v.formula === 'string' || v.sharedFormula) return v.result == null || v.result === '' || v.result === 0;
    if ('text' in v) return isBlankValue(v.text);
    return false;
  }
  function findCell(ws, r, c) { var row = ws.findRow(r); return row ? row.findCell(c) : undefined; }
  function rowBlank(ws, r, cols) {
    var row = ws.findRow(r);
    if (!row) return true;
    for (var i = 0; i < cols.length; i++) {
      var cell = row.findCell(cols[i]);
      if (cell && !isSlave(cell) && !isBlankValue(cell.value)) return false;
    }
    return true;
  }
  function rowStyled(ws, r, cols) {
    var row = ws.findRow(r);
    if (!row) return false;
    return cols.some(function (c) {
      var cell = row.findCell(c);
      var s = cell && cell.style;
      if (!s) return false;
      var b = s.border;
      var bordered = b && ['top', 'left', 'bottom', 'right'].some(function (k) { return b[k] && b[k].style; });
      var filled = s.fill && s.fill.type === 'pattern' && s.fill.pattern && s.fill.pattern !== 'none';
      return bordered || filled;
    });
  }
  function lastRowIn(ws, cols) {
    for (var r = ws.rowCount; r >= 1; r--) if (!rowBlank(ws, r, cols)) return r;
    return 0;
  }

  function snapRow(ws, r, cols) {
    var row = ws.findRow(r);
    var out = { height: row ? row.height : undefined, cells: {} };
    cols.forEach(function (c) {
      var cell = row && row.findCell(c);
      if (!cell) { out.cells[c] = null; return; }
      var v = isSlave(cell) ? null : cell.value;
      var note = cell.note;
      var dv = cell.dataValidation;
      out.cells[c] = {
        value: v && typeof v === 'object' && !(v instanceof Date) ? JSON.parse(JSON.stringify(v)) : v,
        style: cloneStyle(cell.style),
        note: note && typeof note === 'object' ? JSON.parse(JSON.stringify(note)) : note,
        validation: dv ? JSON.parse(JSON.stringify(dv)) : undefined
      };
    });
    return out;
  }
  function dropNote(cell) { if (cell._comment) delete cell._comment; }
  function putSnap(ws, r, c, snap, fx) {
    var cell = ws.getRow(r).getCell(c);
    if (!snap) { cell.value = null; cell.style = {}; dropNote(cell); return; }
    var v = snap.value;
    if (v && typeof v === 'object' && typeof v.formula === 'string') v = { formula: fx ? fx(v.formula) : v.formula, result: v.result };
    cell.value = v == null ? null : v;
    cell.style = cloneStyle(snap.style);
    if (snap.note) cell.note = snap.note; else dropNote(cell);
    if (snap.validation) cell.dataValidation = snap.validation;
  }

  function sameResult(result, v) {
    if (typeof v === 'number') return typeof result === 'number' && Math.abs(result - v) < 0.005;
    if (v && typeof v === 'object' && v.date) return result instanceof Date && result.toISOString().slice(0, 10) === v.date;
    return result != null && String(result) === String(v);
  }

  /** Writes one value; `model` is the cell whose kind of value to follow (TC numbers kept as numbers, and so on). */
  function setValue(cell, v, info, model) {
    var cur = cell.value;
    if (v == null || v === '') { cell.value = null; return; }
    if (cur && typeof cur === 'object' && typeof cur.formula === 'string' && sameResult(cur.result, v)) return; // the formula already gives it
    if (typeof v === 'object' && v.date) {
      var p = v.date.split('-').map(Number);
      cell.value = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
      if (!/[dmy]/i.test(cell.numFmt || '')) cell.numFmt = DATE_FMT;
      return;
    }
    if (typeof v === 'string') {
      var mv = model && model.value;
      if ((typeof mv === 'number' || (info && info.numeric)) && /^[1-9]\d{0,14}$/.test(v)) { cell.value = Number(v); return; }
      cell.value = info && info.upper ? U.trUpper(v) : v;
      return;
    }
    cell.value = v;
    if (typeof v === 'number' && info && info.money && (!cell.numFmt || cell.numFmt === 'General')) cell.numFmt = MONEY_FMT;
  }

  function cellNumber(cell) {
    var v = cell && cell.value;
    if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) v = v.result;
    return typeof v === 'number' ? v : null;
  }
  function columnSum(ws, r1, r2, c) {
    var s = 0;
    for (var r = r1; r <= r2; r++) { var n = cellNumber(findCell(ws, r, c)); if (n != null) s += n; }
    return U.round2(s);
  }

  // ------------------------------------------------------------------ merges
  function mergesIn(ws, r1, r2, cmin, cmax) {
    var out = [];
    Object.keys(ws._merges || {}).forEach(function (k) {
      var m = ws._merges[k] && ws._merges[k].model;
      if (!m || m.bottom < r1 || m.top > r2 || m.right < cmin || m.left > cmax) return;
      out.push({ top: m.top, left: m.left, bottom: m.bottom, right: m.right });
    });
    return out;
  }
  function rangeText(m) { return colName(m.left) + m.top + ':' + colName(m.right) + m.bottom; }
  function unmerge(ws, list) { list.forEach(function (m) { try { ws.unMergeCells(rangeText(m)); } catch (e) { /* already gone */ } }); }

  // ------------------------------------------------------------------ one table (main table or İptal block)
  /**
   * o: { start, end, cols: [1-based, contiguous], items: [{ id, from, values, keys }], deleted: [rows],
   *      info: { col: { key, writable, money, upper } }, totals: [old total rows], heights: bool }
   * Returns { placed: { id: row }, last, totals: [new rows] }.
   */
  function syncTable(wb, ws, o) {
    var start = o.start, cols = o.cols, cmin = cols[0], cmax = cols[cols.length - 1];
    var end = Math.max(o.end, start - 1);
    var del = {};
    o.deleted.forEach(function (r) { if (r >= start) { del[r] = true; if (r > end) end = r; } });
    var byFrom = {}, fresh = [];
    o.items.forEach(function (it) {
      if (it.from != null && it.from >= start && !byFrom[it.from] && !del[it.from]) { byFrom[it.from] = it; if (it.from > end) end = it.from; }
      else fresh.push(it);
    });
    // the table as it will be: kept rows in their order, removed rows gone, new rows at the end
    var seq = [];
    for (var r = start; r <= end; r++) {
      if (byFrom[r]) seq.push({ from: r, it: byFrom[r] });
      else if (!del[r]) seq.push({ from: r, it: null });
    }
    while (seq.length && !seq[seq.length - 1].it && rowBlank(ws, seq[seq.length - 1].from, cols)) seq.pop();
    var kept = seq.length;
    fresh.forEach(function (it) { it.from = null; seq.push({ from: null, it: it }); });
    var newEnd = start + seq.length - 1;

    // below the table: a TOPLAM row right under it (or after one empty row) follows the table both ways;
    // anything further down stays put until the table reaches it, the empty rows in between are used first
    var last = lastRowIn(ws, cols);
    var tailStart = Infinity, tailEnd = 0;
    for (r = end + 1; r <= last; r++) if (!rowBlank(ws, r, cols)) { if (tailStart === Infinity) tailStart = r; tailEnd = r; }
    var attached = tailStart !== Infinity && tailStart - end - 1 <= 1;
    var blockStart = attached ? end + 1 : tailStart;
    var shift = tailStart === Infinity ? 0 : attached ? newEnd - end : Math.max(0, newEnd + 2 - tailStart);

    var pos = {};
    seq.forEach(function (e, i) { if (e.from != null) pos[e.from] = start + i; });
    function mapRow(x) {
      if (x < start) return x;
      if (x <= end) return pos[x] != null ? pos[x] : del[x] ? null : x;
      if (x >= blockStart && x <= tailEnd) return x + shift;
      return x;
    }
    function mapRange(a, b) {
      var lo = a, hi = b;
      while (lo >= start && lo <= end && lo <= hi && mapRow(lo) == null) lo++;
      while (hi >= start && hi <= end && hi >= lo && mapRow(hi) == null) hi--;
      if (lo > hi) return null;
      var na = mapRow(lo), nb = mapRow(hi);
      // a range over the whole table grows with it (TOPLAM: SUM(M2:M60))
      if (a <= start && b >= end && b < blockStart && nb < newEnd) nb = newEnd;
      return [na, nb];
    }
    var moved = shift !== 0 || seq.some(function (e, i) { return e.from != null && e.from !== start + i; });
    var fx = rowRemapper(ws.name, cmin, cmax, mapRow, mapRange);
    var own = function (f) { return fx(f, ws.name); };
    // formulas filled down below the table (=IF(K61="";"";K61*0,1)) are kept on rows the table gives up
    var preFilled = {};
    cols.forEach(function (c) { preFilled[c] = !attached && !!formulaOf(findCell(ws, end + 1, c)); });

    // static totals that add up the column now will add up the new column
    var totals = (o.totals || []).filter(function (t) { return t > end; }).map(function (t) {
      var fixed = {};
      cols.forEach(function (c) {
        var cell = findCell(ws, t, c);
        if (!cell || formulaOf(cell) || typeof cell.value !== 'number' || !(o.info[c] && o.info[c].money)) return;
        if (Math.abs(columnSum(ws, start, end, c) - cell.value) < 0.01) fixed[c] = true;
      });
      return { row: t, fixed: fixed };
    });

    if (moved || newEnd !== end) {
      var top = Math.max(end, tailEnd);
      var snaps = {}, belowSnap = null, merges = [];
      if (moved) {
        for (r = start; r <= top; r++) snaps[r] = snapRow(ws, r, cols);
        belowSnap = snapRow(ws, top + 1, cols);
        // merged cells that move with their rows are merged again where they land
        merges = mergesIn(ws, start, Math.max(top, newEnd) + Math.max(0, shift), cmin, cmax);
        unmerge(ws, merges);
      } else {
        unmerge(ws, mergesIn(ws, end + 1, newEnd, cmin, cmax));
      }
      // every formula that points at these rows: other sheets, other columns, the TOPLAM row's SUM ranges
      rewriteWorkbook(wb, fx, function (w, rr, c) {
        if (w !== ws || c < cmin || c > cmax) return false;
        return moved ? (rr >= start && rr <= end) || (rr >= blockStart && rr <= tailEnd) : rr > newEnd && rr <= end;
      });
      if (moved) {
        seq.forEach(function (e, i) {
          if (e.from == null) return;
          var t = start + i;
          cols.forEach(function (c) { putSnap(ws, t, c, snaps[e.from].cells[c], own); });
          if (o.heights && snaps[e.from].height) ws.getRow(t).height = snaps[e.from].height;
        });
        if (tailStart !== Infinity) {
          for (r = blockStart; r <= tailEnd; r++) {
            cols.forEach(function (c) { putSnap(ws, r + shift, c, snaps[r].cells[c], own); });
            if (o.heights && shift && snaps[r].height) ws.getRow(r + shift).height = snaps[r].height;
          }
          // moved up: what was under the old TOPLAM row comes back below it
          for (r = Math.max(tailEnd + shift + 1, newEnd + 1, end + 1); r <= tailEnd; r++) {
            cols.forEach(function (c) { putSnap(ws, r, c, belowSnap.cells[c], null); });
          }
        }
        merges.forEach(function (m) {
          var a = mapRow(m.top), b = mapRow(m.bottom);
          if (a == null || b == null || b - a !== m.bottom - m.top) return;
          try { ws.mergeCells(rangeText({ top: a, left: m.left, bottom: b, right: m.right })); } catch (e) { /* overlaps a written row */ }
        });
      }
      // rows the table gave up keep their look (bordered empty rows) but lose their values
      for (r = newEnd + 1; r <= end; r++) {
        if (shift && tailStart !== Infinity && r >= blockStart + shift && r <= tailEnd + shift) continue;
        cols.forEach(function (c) {
          var cell = findCell(ws, r, c);
          if (!cell || (preFilled[c] && formulaOf(cell))) return;
          cell.value = null;
          dropNote(cell);
        });
      }
    }

    // values: new rows in full, kept rows only where they changed
    var placed = {};
    var refRow = 0;
    seq.forEach(function (e, i) {
      var t = start + i;
      if (!e.it) return;
      placed[e.it.id] = t;
      if (e.from != null) {
        refRow = t;
        if (e.it.keys.length) writeChanged(ws, t, e.it, o.info);
        return;
      }
      // an empty row below the table: if it is already formatted (a template's bordered rows) it keeps its look
      var free = t > end && !attached && t < tailStart;
      writeNew(ws, t, e.it, o, refRow || start, free, free && rowStyled(ws, t, cols));
      if (!refRow) refRow = t;
    });

    var newTotals = totals.map(function (x) {
      var t = mapRow(x.row);
      cols.forEach(function (c) {
        var cell = findCell(ws, t, c);
        if (!cell) return;
        if (x.fixed[c]) { cell.value = columnSum(ws, start, newEnd, c); return; }
        var f = formulaOf(cell);
        var m = f && /^SUM\(\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)\)$/i.exec(f);
        if (m && m[1] === m[3] && colIndex(m[1]) === c) cell.value = { formula: f, result: columnSum(ws, Number(m[2]), Number(m[4]), c) };
      });
      return t;
    });
    return { placed: placed, last: newEnd, totals: newTotals };
  }

  function writeChanged(ws, t, it, info) {
    Object.keys(info).forEach(function (c) {
      var x = info[c];
      if (!x.writable || it.keys.indexOf(x.key) < 0) return;
      var cell = ws.getRow(t).getCell(Number(c));
      setValue(cell, it.values[x.key], x, { value: cell.value });
    });
  }

  function writeNew(ws, t, it, o, ref, free, keepLook) {
    var row = ws.getRow(t);
    if (o.heights && ref !== t) { var h = ws.getRow(ref).height; if (h) row.height = h; }
    o.cols.forEach(function (c) {
      var cell = row.getCell(c);
      var refCell = ref !== t ? findCell(ws, ref, c) : null;
      if (refCell && !keepLook) {
        cell.style = cloneStyle(refCell.style);
        var dv = refCell.dataValidation;
        if (dv) cell.dataValidation = JSON.parse(JSON.stringify(dv));
      }
      dropNote(cell);
      var x = o.info[c];
      var v = x && x.writable ? it.values[x.key] : null;
      if (v == null || v === '') {
        if (free && formulaOf(cell)) return; // filled-down formulas stay
        var rf = refCell && formulaOf(refCell);
        cell.value = rf ? { formula: shiftFormula(rf, t - ref) } : null;
        return;
      }
      setValue(cell, v, x, refCell || { value: cell.value });
    });
  }

  // ------------------------------------------------------------------ new month sheets
  var THIN = { style: 'thin', color: { argb: 'FF000000' } };
  var BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  var YELLOW_HEAD = { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }, border: BOX, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } };

  function copyRowLook(from, fr, to, tr, cols) {
    var src = from.findRow(fr);
    if (!src) return;
    if (src.height) to.getRow(tr).height = src.height;
    cols.forEach(function (c) { var cell = src.findCell(c); if (cell) to.getRow(tr).getCell(c).style = cloneStyle(cell.style); });
  }

  function createSheet(wb, s, draft, layout) {
    var tpl = s.template ? wb.getWorksheet(s.template) : null;
    var views = tpl ? JSON.parse(JSON.stringify(tpl.views || [])) : [{ state: 'frozen', ySplit: layout.headerRow + 1 }];
    views.forEach(function (v) { delete v.tabSelected; });
    var opts = { views: views };
    if (tpl) {
      opts.properties = JSON.parse(JSON.stringify(tpl.properties || {}));
      opts.pageSetup = JSON.parse(JSON.stringify(tpl.pageSetup || {}));
      delete opts.pageSetup.printArea;
      opts.headerFooter = JSON.parse(JSON.stringify(tpl.headerFooter || {}));
    }
    var ws = wb.addWorksheet(s.name, opts);
    var start = layout.dataStart + 1;
    if (tpl) {
      var tplMonth = draft.sheets[s.template] && draft.sheets[s.template].month;
      (tpl.columns || []).forEach(function (col, i) {
        if (!col) return;
        if (col.width) ws.getColumn(i + 1).width = col.width;
        if (col.hidden) ws.getColumn(i + 1).hidden = true;
      });
      var lastHead = Math.max(layout.dataStart, layout.block ? layout.block.headerRow + 1 : 0);
      for (var r = 1; r <= lastHead; r++) {
        var src = tpl.findRow(r);
        if (!src) continue;
        if (src.height) ws.getRow(r).height = src.height;
        src.eachCell({ includeEmpty: true }, function (cell, c) {
          var snap = snapRow(tpl, r, [c]).cells[c];
          if (!snap) return;
          if (r <= layout.headerRow && typeof snap.value === 'string' && tplMonth) {
            var renamed = renameMonth(snap.value, tplMonth, s.month);
            if (renamed) snap.value = renamed;
          }
          putSnap(ws, r, c, snap, null);
        });
      }
      mergesIn(tpl, 1, lastHead, 1, 16384).forEach(function (m) {
        if (m.bottom <= lastHead) { try { ws.mergeCells(rangeText(m)); } catch (e) { /* overlapping merge: skip */ } }
      });
      if (typeof tpl.autoFilter === 'string') {
        var af = /^(\$?[A-Z]{1,3})\$?(\d+):(\$?[A-Z]{1,3})\$?(\d+)$/.exec(tpl.autoFilter);
        if (af && Number(af[2]) === layout.headerRow + 1) ws.autoFilter = af[1] + af[2] + ':' + af[3] + af[2];
      }
      // the first data row's look, and the empty bordered rows of the İptal block
      var tl = draft.sheets[s.template].layout;
      copyRowLook(tpl, tl.dataStart + 1, ws, start, mainCols(layout));
      if (layout.block) {
        var bcols = blockCols(layout.block);
        var b0 = layout.block.headerRow + 2;
        for (var k = 0; k < TEMPLATE_BLOCK_ROWS; k++) {
          var from = rowStyled(tpl, b0 + k, bcols) ? b0 + k : b0;
          bcols.forEach(function (c) { var cell = findCell(tpl, from, c); if (cell) ws.getRow(b0 + k).getCell(c).style = cloneStyle(cell.style); });
        }
      }
    } else {
      // a workbook the app starts: the agency's yellow headers and thin borders
      layout.columns.forEach(function (c) {
        var cell = ws.getRow(1).getCell(c.col + 1);
        cell.value = c.header;
        cell.style = cloneStyle(YELLOW_HEAD);
        ws.getRow(2).getCell(c.col + 1).style = { border: BOX };
        ws.getColumn(c.col + 1).width = Math.max(10, Math.min(28, String(c.header).length + 4));
      });
      if (layout.block) addBlockHeaders(ws, layout, null);
    }
    return ws;
  }

  /** The İptal block for a page that has none: after one empty column, yellow headers and 17 bordered rows. */
  function addBlockHeaders(ws, layout, model) {
    var b = layout.block;
    b.headers.forEach(function (hd, i) {
      var col = b.startCol + 1 + i;
      var cell = ws.getRow(b.headerRow + 1).getCell(col);
      cell.value = hd;
      cell.style = cloneStyle(model ? model.head[i] : YELLOW_HEAD);
      if (!ws.getColumn(col).width) ws.getColumn(col).width = i === 2 ? 22 : 13;
      for (var k = 0; k < TEMPLATE_BLOCK_ROWS; k++) ws.getRow(b.headerRow + 2 + k).getCell(col).style = cloneStyle(model ? model.row[i] : { border: BOX });
    });
    if (!ws.getColumn(b.startCol).width) ws.getColumn(b.startCol).width = 3;
  }

  /** Looks of an İptal block somewhere in the workbook, to give a page without one the same block. */
  function blockModel(wb, link) {
    var names = Object.keys(link.sheets);
    for (var i = 0; i < names.length; i++) {
      var l = link.sheets[names[i]].layout;
      var ws = l && l.block && wb.getWorksheet(names[i]);
      if (!ws) continue;
      var cols = blockCols(l.block);
      return {
        head: cols.map(function (c) { var cell = findCell(ws, l.block.headerRow + 1, c); return cell ? cloneStyle(cell.style) : cloneStyle(YELLOW_HEAD); }),
        row: cols.map(function (c) { var cell = findCell(ws, l.block.headerRow + 2, c); return cell ? cloneStyle(cell.style) : { border: BOX }; })
      };
    }
    return null;
  }

  /** A template's TOPLAM row for a new sheet that now has rows. */
  function addTotalRow(ws, tpl, tl, layout, newEnd, info) {
    var cols = mainCols(layout);
    var tplStart = tl.dataStart + 1, tplEnd = tl.lastDataRow + 1, tplT = tl.totalRow + 1;
    var T = newEnd + 1 + Math.min(1, Math.max(0, tplT - tplEnd - 1));
    var start = layout.dataStart + 1;
    var snap = snapRow(tpl, tplT, cols);
    if (snap.height) ws.getRow(T).height = snap.height;
    cols.forEach(function (c) {
      var s = snap.cells[c];
      if (!s) return;
      var v = s.value;
      if (v && typeof v === 'object' && typeof v.formula === 'string') {
        var f = eachRef(v.formula, function (ref) {
          if (ref.sheet) return null;
          if (!ref.b) return refText(ref.a, ref.a.rAbs ? ref.a.row : ref.a.row + (T - tplT));
          var lo = Math.min(ref.a.row, ref.b.row), hi = Math.max(ref.a.row, ref.b.row);
          if (lo === tplStart && hi >= tplEnd && hi < tplT) return refText(ref.a, start) + ':' + refText(ref.b, newEnd);
          return null;
        });
        s = { value: { formula: f, result: undefined }, style: s.style };
      } else if (typeof v === 'number' && info[c] && info[c].money) {
        s = { value: columnSum(ws, start, newEnd, c), style: s.style };
      }
      putSnap(ws, T, c, s, null);
    });
    return T;
  }

  /** New sheets go next to their closest month; files kept newest-first get them at the front. */
  function placeSheets(wb, created, link) {
    var list = wb.worksheets.slice();
    function monthOf(w) { var l = link.sheets[w.name]; return l && l.month; }
    var order = list.filter(function (w) { return created.indexOf(w) < 0; });
    var view = wb.views && wb.views[0];
    var active = view && view.activeTab != null ? order[view.activeTab] : null;
    var olds = order.filter(monthOf);
    var asc = 0, desc = 0;
    for (var i = 1; i < olds.length; i++) { var d = U.cmp(monthOf(olds[i - 1]), monthOf(olds[i])); if (d < 0) asc++; else if (d > 0) desc++; }
    var newestFirst = desc > asc;
    created.slice().sort(function (a, b) { return U.cmp(monthOf(a), monthOf(b)); }).forEach(function (w) {
      var m = monthOf(w), at = -1;
      order.forEach(function (x, k) { var xm = monthOf(x); if (xm && (newestFirst ? xm > m : xm < m)) at = k; });
      if (at < 0) {
        // nothing comes before it: just before the first month sheet
        at = order.length - 1;
        for (var k = 0; k < order.length; k++) if (monthOf(order[k])) { at = k - 1; break; }
      }
      order.splice(at + 1, 0, w);
    });
    order.forEach(function (w, k) { w.orderNo = k + 1; });
    if (active) view.activeTab = order.indexOf(active);
  }

  // ------------------------------------------------------------------ apply
  function mainCols(layout) {
    var min = Infinity, max = -1;
    layout.columns.forEach(function (c) { if (c.col < min) min = c.col; if (c.col > max) max = c.col; });
    if (max < 0) return [];
    if (layout.block && layout.block.startCol <= max) max = layout.block.startCol - 1;
    var out = [];
    for (var c = min; c <= max; c++) out.push(c + 1);
    return out;
  }
  function blockCols(b) { return [0, 1, 2, 3, 4, 5].map(function (i) { return b.startCol + 1 + i; }); }

  function mainInfo(layout) {
    var info = {};
    layout.columns.forEach(function (col) {
      var def = col.field && Schema.BY_KEY[col.field];
      info[col.col + 1] = { key: String(col.col), writable: col.role !== 'ignored', money: !!(def && def.type === 'money'), upper: !!col.upper, numeric: !!col.numeric };
    });
    return info;
  }
  function blockInfo(b) {
    var info = {};
    blockCols(b).forEach(function (c, i) { info[c] = { key: String(i), writable: true, money: i >= 3, upper: !!(b.upper && b.upper[i]) }; });
    return info;
  }

  /**
   * Writes the plan into an ExcelJS workbook and returns the link as it now is (rows, layouts, new sheets).
   * The caller keeps it only once the file has been written.
   */
  function apply(wb, plan) {
    var draft = plan.link;
    var link = { sheets: Object.assign({}, draft.sheets), months: Object.assign({}, draft.months) };
    if (!plan.changes) return link;
    wb.worksheets.forEach(unshareFormulas);
    var created = [];
    var model = null;
    plan.sheets.forEach(function (s) {
      var l = draft.sheets[s.name];
      if (!s.changes) { link.sheets[s.name] = l; return; }
      var layout = cloneLayout(s.layout);
      var ws = wb.getWorksheet(s.name);
      if (!ws) {
        // a new month, or a sheet that is no longer there: everything goes in as new rows
        ws = createSheet(wb, s, draft, layout);
        created.push(ws);
        s.rows.forEach(function (r) { r.from = null; });
        s.cancels.forEach(function (r) { r.from = null; });
        s.deleted = [];
        s.xdeleted = [];
      }
      var rows = {}, cancels = {};
      if (layout.headerRow >= 0) {
        var info = mainInfo(layout);
        var res = syncTable(wb, ws, {
          start: layout.dataStart + 1, end: layout.lastDataRow + 1, cols: mainCols(layout), items: s.rows, deleted: s.deleted,
          info: info, totals: layout.totalRow >= 0 ? [layout.totalRow + 1] : [], heights: true
        });
        layout.lastDataRow = Math.max(res.last, layout.dataStart) - 1;
        if (layout.totalRow >= 0) layout.totalRow = res.totals[0] - 1;
        else if (s.create && s.template && s.rows.length && draft.sheets[s.template].layout.totalRow >= 0) {
          layout.totalRow = addTotalRow(ws, wb.getWorksheet(s.template), draft.sheets[s.template].layout, layout, res.last, info) - 1;
        }
        s.rows.forEach(function (r) { rows[r.id] = [res.placed[r.id], r.values]; });
      }
      if (s.cancels.length && !layout.block) {
        // this page has no İptal block yet: one empty column after the table, then the block
        var maxCol = layout.columns.reduce(function (m, c) { return Math.max(m, c.col); }, -1);
        layout.block = { headerRow: Math.max(0, layout.headerRow), startCol: maxCol + 2, kinds: BLOCK_KINDS.slice(), headers: BLOCK_HEADERS.slice(), lastRow: Math.max(0, layout.headerRow), totalRow: -1 };
        if (model === null) model = blockModel(wb, draft) || false;
        addBlockHeaders(ws, layout, model || null);
      }
      if (layout.block) {
        var b = layout.block;
        var bres = syncTable(wb, ws, {
          start: b.headerRow + 2, end: (b.lastRow != null ? b.lastRow : b.headerRow) + 1, cols: blockCols(b), items: s.cancels, deleted: s.xdeleted,
          info: blockInfo(b), totals: b.totalRow != null && b.totalRow >= 0 ? [b.totalRow + 1] : [], heights: false
        });
        b.lastRow = Math.max(bres.last, b.headerRow + 1) - 1;
        if (b.totalRow != null && b.totalRow >= 0) b.totalRow = bres.totals[0] - 1;
        s.cancels.forEach(function (r) { cancels[r.id] = [bres.placed[r.id], r.values]; });
      }
      link.sheets[s.name] = { month: s.month, layout: layout, rows: rows, cancels: cancels };
    });
    if (created.length) placeSheets(wb, created, link);
    // Excel works the totals out again when the file is opened
    wb.calcProperties = Object.assign({}, wb.calcProperties, { fullCalcOnLoad: true });
    return link;
  }

  /** The first page of a workbook the app starts itself, for a month that has nothing yet. */
  function startSheet(wb, month, meta) {
    var layout = defaultLayout(meta);
    var name = newSheetName(month, null, wb.worksheets.map(function (w) { return w.name; }));
    createSheet(wb, { name: name, month: month, template: null }, { sheets: {} }, layout);
    return { name: name, entry: { month: month, layout: freshLayout(layout), rows: {}, cancels: {} } };
  }

  return {
    createLink: createLink, buildPlan: buildPlan, apply: apply, startSheet: startSheet, policyValues: policyValues, cancelValues: cancelValues,
    shiftFormula: shiftFormula, eachRef: eachRef, renameMonth: renameMonth, newSheetName: newSheetName, defaultLayout: defaultLayout,
    BLOCK_KINDS: BLOCK_KINDS, BLOCK_HEADERS: BLOCK_HEADERS
  };
});
