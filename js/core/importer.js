/* Sigorta Portföy - reads monthly production workbooks (xlsx / xls / ods / csv). */
(function (root, factory) {
  var req = typeof require === 'function' ? require : null;
  var mod = factory(root.U || (req && req('./util.js')), root.Schema || (req && req('./schema.js')));
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.Importer = mod;
})(typeof self !== 'undefined' ? self : this, function (U, Schema) {
  'use strict';

  var MAX_HEADER_SCAN = 30;
  var TOTAL_WORDS = ['toplam', 'genel toplam', 'ara toplam', 'total', 'grand total', 'toplamlar', 'aylik toplam'];

  /** Cell values are plain JS values; date-formatted cells become { d: 'yyyy-mm-dd' }. */
  function plain(v) { return v && typeof v === 'object' && v.d ? v.d : v; }
  function isEmpty(v) { return v == null || (typeof v === 'string' && v.trim() === ''); }

  function cellText(v, lang) {
    if (v == null) return '';
    if (typeof v === 'object' && v.d) return U.fmtDate(v.d, lang);
    if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
    return String(v).trim();
  }

  // ------------------------------------------------------------------ workbook -> rows
  function readWorkbook(data, XLSX, fileName) {
    if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    if (!(data instanceof Uint8Array)) throw new Error('file content is not binary data');
    var isText = /\.(csv|txt|tsv)$/i.test(fileName || '');
    if (isText && typeof TextDecoder !== 'undefined') {
      // UTF-8 first; older Turkish Excel versions save CSV as Windows-1254
      var text = null;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch (e) {
        try { text = new TextDecoder('windows-1254').decode(data); } catch (e2) { text = null; }
      }
      if (text != null) {
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        return XLSX.read(text, { type: 'string', raw: true, cellNF: true, cellDates: false, dense: false });
      }
    }
    var opts = { type: 'array', cellNF: true, cellDates: false, cellText: false, dense: false };
    if (isText) { opts.raw = true; opts.codepage = 65001; }
    return XLSX.read(data, opts);
  }

  function sheetRows(ws, XLSX, date1904) {
    if (!ws || !ws['!ref']) return [];
    var range = XLSX.utils.decode_range(ws['!ref']);
    var dense = ws['!data'];
    var rows = [];
    var maxR = Math.min(range.e.r, range.s.r + 100000);
    for (var r = range.s.r; r <= maxR; r++) {
      var row = [];
      var any = false;
      for (var c = range.s.c; c <= range.e.c && c < range.s.c + 300; c++) {
        var cell = dense ? (dense[r] && dense[r][c]) : ws[XLSX.utils.encode_cell({ r: r, c: c })];
        var v = convertCell(cell, XLSX, date1904);
        if (!isEmpty(v)) any = true;
        row.push(v);
      }
      rows.push(any ? row : []);
    }
    // header cells merged across rows/columns: copy the value into the whole merged area (top rows only)
    (ws['!merges'] || []).forEach(function (m) {
      if (m.s.r - range.s.r > MAX_HEADER_SCAN) return;
      var top = rows[m.s.r - range.s.r];
      var v = top && top[m.s.c - range.s.c];
      if (isEmpty(v) || typeof v !== 'string') return;
      for (var rr = m.s.r; rr <= m.e.r; rr++) {
        var row = rows[rr - range.s.r];
        if (!row) continue;
        for (var cc = m.s.c; cc <= m.e.c; cc++) {
          if (rr === m.s.r && cc === m.s.c) continue;
          while (row.length <= cc - range.s.c) row.push(null);
          if (isEmpty(row[cc - range.s.c])) row[cc - range.s.c] = { merged: v };
        }
      }
    });
    while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
    return rows;
  }

  function convertCell(cell, XLSX, date1904) {
    if (!cell) return null;
    switch (cell.t) {
      case 's': case 'str': return cell.v == null ? null : String(cell.v);
      case 'n':
        if (cell.z && XLSX.SSF && XLSX.SSF.is_date(cell.z)) {
          var iso = U.excelSerialToISO(cell.v, date1904);
          return iso ? { d: iso } : cell.v;
        }
        return cell.v;
      case 'd':
        if (cell.v instanceof Date && !isNaN(cell.v.getTime())) {
          return { d: U.isoFromYMD(cell.v.getFullYear(), cell.v.getMonth() + 1, cell.v.getDate()) };
        }
        return null;
      case 'b': return cell.v;
      case 'e': case 'z': return null;
      default: return cell.v == null ? null : cell.v;
    }
  }

  function headerString(v) {
    if (v && typeof v === 'object' && v.merged) return String(v.merged).trim();
    if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim();
    return '';
  }

  // ------------------------------------------------------------------ analysis
  function mapHeaders(texts, saved) {
    return texts.map(function (t) {
      if (!t) return null;
      var k = U.fold(t);
      if (saved && Object.prototype.hasOwnProperty.call(saved, k)) return saved[k];
      return Schema.matchHeader(t);
    });
  }

  function scoreRow(row, saved) {
    var texts = row.map(function (v) { var s = headerString(v); return s.length <= 60 ? s : ''; });
    var fields = mapHeaders(texts, saved);
    var seen = {};
    var n = 0;
    fields.forEach(function (f) { if (f && f !== '_ignore' && f !== '_custom' && !seen[f]) { seen[f] = 1; n++; } });
    return n;
  }

  function findHeaderRow(rows, saved) {
    var best = -1, bestScore = 0;
    for (var r = 0; r < Math.min(rows.length, MAX_HEADER_SCAN); r++) {
      var s = scoreRow(rows[r] || [], saved);
      if (s > bestScore) { best = r; bestScore = s; }
    }
    return bestScore >= 2 ? best : -1;
  }

  function isTotalRow(row) {
    return row.some(function (v) {
      if (typeof v !== 'string') return false;
      var f = U.fold(v);
      return TOTAL_WORDS.indexOf(f) >= 0 || /^(genel |ara )?toplam\b/.test(f);
    });
  }

  // ------------------------------------------------------------------ İptal block
  // Every month sheet ends with a small table of cancellations, at whatever column the sheet ends:
  //   ŞİRKET | POLİÇE | SİGORTALI AD SOYAD | KART | CARİ | NAKİT
  // Its rows are policies of earlier months that were cancelled in this month, with the refund per payment type.
  var CANCEL_PAY = ['card', 'account', 'cash'];

  function cancelHeaderKind(text) {
    var f = U.fold(text);
    if (!f) return '';
    if (f === 'sirket' || f === 'sirketi' || f === 'sirket adi' || f === 'sigorta sirketi') return 'company';
    if (f === 'brans' || /^police( adi| no| nosu| numarasi| turu| tipi| cinsi)?$/.test(f)) return 'policy';
    if (/^sigortali( ad soyad| adi soyadi| adi soyad| ad soyadi| adi| unvan| unvani)?$/.test(f)) return 'insured';
    if (f === 'kart' || f === 'kredi karti' || f === 'k karti' || f === 'kk' || f === 'pos') return 'card';
    if (f === 'cari' || f === 'cari hesap' || f === 'veresiye') return 'account';
    if (f === 'nakit' || f === 'pesin' || f === 'elden') return 'cash';
    return '';
  }

  /** { headerRow, startCol, colList, kinds, headers } or null. The block is the last thing on its header row. */
  function findCancelBlock(rows) {
    var limit = Math.min(rows.length, MAX_HEADER_SCAN + 10);
    for (var r = 0; r < limit; r++) {
      var row = rows[r] || [];
      var texts = row.map(headerString);
      var kinds = texts.map(cancelHeaderKind);
      for (var c = kinds.length - 6; c >= 0; c--) {
        if (kinds[c] !== 'company' || kinds[c + 1] !== 'policy' || kinds[c + 2] !== 'insured') continue;
        if (kinds.slice(c + 3, c + 6).sort().join() !== 'account,card,cash') continue;
        if (texts.slice(c + 6).some(Boolean)) continue;
        var colList = [c, c + 1, c + 2, c + 3, c + 4, c + 5];
        return { headerRow: r, startCol: c, colList: colList, kinds: kinds.slice(c, c + 6), headers: texts.slice(c, c + 6) };
      }
    }
    return null;
  }

  function cancelRows(rows, block, res) {
    var out = [];
    for (var r = block.headerRow + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var cells = block.colList.map(function (c) { var v = row[c]; return v && v.merged ? null : v; });
      if (cells.every(function (v) { return isEmpty(plain(v)); })) continue;
      var again = cells.filter(function (v, i) { return typeof v === 'string' && cancelHeaderKind(v) === block.kinds[i]; }).length;
      if (again >= 3) continue;
      if (isTotalRow(cells)) { res.skipped.cancelTotals = (res.skipped.cancelTotals || 0) + 1; res.cancelTotalRow = r; continue; }
      out.push({ r: r, cells: cells });
    }
    return out;
  }

  /** "EVET" / "HAYIR", "X" / "" …: how this sheet writes Yeni iş, so new rows look the same. */
  function yesNoWords(res) {
    var col = res.columns.filter(function (c) { return c.field === 'newBusiness'; })[0];
    if (!col) return null;
    var yes = new Map(), no = new Map(), blank = 0;
    res.rows.forEach(function (x) {
      var v = plain(x.cells[col.col]);
      if (isEmpty(v)) { blank++; return; }
      var b = U.parseYesNo(v);
      var m = b === true ? yes : b === false ? no : null;
      if (m) m.set(String(v).trim(), (m.get(String(v).trim()) || 0) + 1);
    });
    function top(m) { var best = null, n = 0; m.forEach(function (k, v) { if (k > n) { best = v; n = k; } }); return best; }
    return { yes: top(yes) || 'Evet', no: no.size ? top(no) : (blank ? '' : 'Hayır') };
  }

  function mode(values) {
    var counts = new Map(), best = null, bestN = 0;
    values.forEach(function (v) {
      if (v == null) return;
      var n = (counts.get(v) || 0) + 1;
      counts.set(v, n);
      if (n > bestN) { best = v; bestN = n; }
    });
    return { value: best, count: bestN, total: values.filter(function (v) { return v != null; }).length };
  }

  /**
   * Analyses one sheet: header row, column mapping, data rows and production month.
   * opts: { saved: {foldedHeader: fieldKey}, fileName, date1904, sheetIndex }
   */
  function analyzeRows(allRows, sheetName, opts) {
    opts = opts || {};
    var saved = opts.saved || {};
    var res = {
      name: sheetName, index: opts.sheetIndex || 0, headerRow: -1, dataStart: -1, columns: [], rows: [],
      skipped: { empty: 0, totals: 0, repeatedHeader: 0 }, month: { key: '', source: 'none' }, include: false,
      titleText: '', warnings: [], cancelBlock: null, cancels: [], cancelTotalRow: -1, totalRow: -1, lastDataRow: -1
    };
    // the İptal block is read on its own; the main table never sees its columns
    var block = findCancelBlock(allRows);
    var rows = allRows;
    var blockRows = new Set();
    if (block) {
      res.cancelBlock = { headerRow: block.headerRow, startCol: block.startCol, kinds: block.kinds, headers: block.headers };
      res.cancels = cancelRows(allRows, block, res);
      res.cancels.forEach(function (x) { blockRows.add(x.r); });
      var inBlock = {};
      block.colList.forEach(function (c) { inBlock[c] = true; });
      rows = allRows.map(function (row) {
        if (!row || !row.length || row.length <= block.startCol) return row;
        var out = row.map(function (v, c) { return inBlock[c] ? null : v; });
        return out.some(function (v) { return !isEmpty(plain(v)); }) ? out : [];
      });
    }
    var hr = opts.headerRow != null ? opts.headerRow : findHeaderRow(rows, saved);
    if (hr < 0) {
      res.warnings.push(block ? 'noMainHeader' : 'noHeader');
      res.month = detectMonth(sheetName, '', [], opts);
      if (block && res.month.key) res.include = res.cancels.length > 0;
      return res;
    }
    res.headerRow = hr;
    var header = (rows[hr] || []).slice();
    var texts = header.map(headerString);
    var width = 0;
    rows.forEach(function (row) { if (row.length > width) width = row.length; });
    for (var c = 0; c < width; c++) {
      if (!texts[c] && hr > 0) texts[c] = headerString((rows[hr - 1] || [])[c]);
      if (texts[c] === undefined) texts[c] = '';
    }
    var dataStart = hr + 1;
    // two-row headers such as "ÖDEME" over "Kart | Cari | Nakit"
    var next = rows[hr + 1] || [];
    var nextTexts = next.map(headerString);
    var nextFields = mapHeaders(nextTexts, saved);
    var topFields = mapHeaders(texts, saved);
    var newInNext = 0, nonEmptyNext = 0;
    nextTexts.forEach(function (t, i) {
      if (!isEmpty(next[i])) nonEmptyNext++;
      if (nextFields[i] && topFields.indexOf(nextFields[i]) < 0) newInNext++;
    });
    if (newInNext >= 2 && nonEmptyNext <= newInNext + 2) {
      nextTexts.forEach(function (t, i) { if (t && nextFields[i]) texts[i] = t; });
      dataStart = hr + 2;
    }
    res.dataStart = dataStart;

    // the title area above the header often carries the month ("KASIM 2025 ÜRETİM LİSTESİ")
    var titles = [];
    for (var tr = 0; tr < hr; tr++) {
      (rows[tr] || []).forEach(function (v) { if (typeof v === 'string' && v.trim()) titles.push(v.trim()); });
    }
    res.titleText = titles.join(' · ').slice(0, 200);

    // data rows
    for (var r = dataStart; r < rows.length; r++) {
      var row = rows[r] || [];
      var nonEmpty = row.filter(function (v) { return !isEmpty(plain(v)) && !(v && v.merged); });
      if (!nonEmpty.length) { if (!blockRows.has(r)) res.skipped.empty++; continue; }
      var same = 0, compared = 0;
      row.forEach(function (v, i) {
        if (texts[i] && typeof v === 'string') { compared++; if (U.fold(v) === U.fold(texts[i])) same++; }
      });
      if (compared >= 3 && same / Math.max(1, texts.filter(Boolean).length) >= 0.5) { res.skipped.repeatedHeader++; continue; }
      res.rows.push({ r: r, cells: row });
    }

    // columns
    var fields = mapHeaders(texts, saved);
    var used = {};
    for (c = 0; c < width; c++) {
      var hasData = res.rows.some(function (x) { return !isEmpty(plain(x.cells[c])); });
      var text = texts[c] || '';
      if (!text && !hasData) continue;
      var f = fields[c];
      var col = { col: c, header: text || ('Sütun ' + colLetter(c)), field: null, role: 'custom', auto: f, samples: [] };
      if (f === '_ignore') col.role = 'ignored';
      else if (f && f !== '_custom') {
        col.field = f;
        col.role = used[f] ? 'duplicate' : 'primary';
        used[f] = true;
      }
      res.rows.some(function (x) {
        var v = x.cells[c];
        if (!isEmpty(plain(v))) col.samples.push(cellText(v));
        return col.samples.length >= 3;
      });
      res.columns.push(col);
    }
    // a lone "Adı" column is the full name
    if (used._first && !used._last) res.columns.forEach(function (col) { if (col.field === '_first') col.field = 'name'; });

    // totals at the bottom
    res.rows = res.rows.filter(function (x) {
      if (!isTotalRow(x.cells)) return true;
      var probe = buildRecord(x, res, opts);
      if (probe.fields.policyNo || probe.fields.tc || probe.fields.plate) return true;
      res.skipped.totals++;
      res.totalRow = x.r;
      return false;
    });
    res.rows.forEach(function (x) { if (x.r > res.lastDataRow) res.lastDataRow = x.r; });
    res.yesNo = yesNoWords(res);

    res.month = detectMonth(sheetName, res.titleText, sampleDates(res, opts), opts);
    res.include = res.rows.length > 0 || res.cancels.length > 0;
    // summary or customer-list sheets have no policy columns: leave them out unless the user opts in
    var mapped = {};
    res.columns.forEach(function (col) { if (col.field) mapped[col.field] = true; });
    var policyCols = ['policyType', 'policyNo', 'endDate', 'company', 'plate'].some(function (f) { return mapped[f]; });
    var whoCols = ['name', 'insuredName', 'tc', 'policyNo', '_first'].some(function (f) { return mapped[f]; });
    if ((!policyCols || !whoCols) && !block) { res.include = false; res.warnings.push('notPolicySheet'); }
    else if (!res.month.key) res.warnings.push('noMonth');
    return res;
  }

  function colLetter(c) {
    var s = '';
    c += 1;
    while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
    return s;
  }

  function sampleDates(sheet, opts) {
    var byField = { startDate: [], issueDate: [], endDate: [] };
    sheet.columns.forEach(function (col) {
      if (!byField[col.field]) return;
      sheet.rows.forEach(function (x) {
        var iso = U.parseDate(plain(x.cells[col.col]), { date1904: opts && opts.date1904 });
        if (iso) byField[col.field].push(iso);
      });
    });
    return byField;
  }

  /** Month from the sheet name, then the title rows, then the dates inside the sheet. */
  function detectMonth(sheetName, titleText, dates, opts) {
    dates = dates || {};
    var fromName = U.parseMonthText(sheetName);
    var fromTitle = titleText ? U.parseMonthText(titleText) : null;
    var fromFile = opts && opts.fileMonth ? opts.fileMonth : null;
    var month = 0, year = 0, source = 'none';
    if (fromName) { month = fromName.month; year = fromName.year || 0; source = 'sheet'; }
    else if (fromTitle) { month = fromTitle.month; year = fromTitle.year || 0; source = 'title'; }
    else if (fromFile) { month = fromFile.month; year = fromFile.year || 0; source = 'file'; }
    if (month && !year && fromTitle && fromTitle.month === month && fromTitle.year) year = fromTitle.year;

    var start = (dates.startDate && dates.startDate.length ? dates.startDate : dates.issueDate) || [];
    var ends = dates.endDate || [];
    if (!month) {
      var mk = mode(start.map(U.monthKeyOf));
      if (!mk.value && ends.length) mk = mode(ends.map(function (e) { return U.monthKeyOf(U.addYears(e, -1)); }));
      if (mk.value && mk.count >= Math.max(1, mk.total * 0.4)) {
        return { key: mk.value, source: 'data' };
      }
      return { key: '', source: 'none' };
    }
    if (!year) {
      var ys = start.filter(function (d) { return +d.slice(5, 7) === month; }).map(function (d) { return +d.slice(0, 4); });
      if (!ys.length) ys = ends.filter(function (d) { return +d.slice(5, 7) === month; }).map(function (d) { return +d.slice(0, 4) - 1; });
      if (!ys.length) ys = ends.map(function (d) { return U.addYears(d, -1); }).filter(function (d) { return +d.slice(5, 7) === month; }).map(function (d) { return +d.slice(0, 4); });
      var my = mode(ys);
      if (my.value) { year = my.value; source = source + '+data'; }
      else {
        var fy = opts && opts.fileName ? String(opts.fileName).match(/(?:^|\D)(20\d{2})(?!\d)/) : null;
        if (fy) { year = +fy[1]; source = source + '+file'; }
        else {
          var now = U.todayISO();
          year = +now.slice(0, 4);
          if (month > +now.slice(5, 7)) year -= 1;
          source = source + '+guess';
        }
      }
    }
    return { key: year + '-' + U.pad2(month), source: source };
  }

  function fileMonthOf(wb, fileName) {
    // a single-sheet file ("Mart 2026.csv", "Ocak 2026.xlsx" with Sayfa1) carries the month in its name
    if (!fileName || wb.SheetNames.length !== 1) return null;
    return U.parseMonthText(String(fileName).replace(/\.[a-z0-9]+$/i, ''));
  }

  function analyzeWorkbook(wb, XLSX, opts) {
    opts = opts || {};
    var date1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    var fileMonth = fileMonthOf(wb, opts.fileName);
    var single = /\.(csv|txt|tsv)$/i.test(opts.fileName || '') && wb.SheetNames.length === 1;
    var sheets = wb.SheetNames.map(function (name, i) {
      var ws = wb.Sheets[name];
      var hidden = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i] && wb.Workbook.Sheets[i].Hidden;
      var rows = sheetRows(ws, XLSX, date1904);
      var display = single ? String(opts.fileName).replace(/\.[a-z0-9]+$/i, '') : name;
      var a = analyzeRows(rows, display, { saved: opts.saved, fileName: opts.fileName, date1904: date1904, sheetIndex: i, fileMonth: fileMonth });
      if (single && a.month.source.indexOf('sheet') === 0) a.month.source = a.month.source.replace('sheet', 'file');
      a.rawRows = rows;
      a.fileMonth = fileMonth;
      a.hidden = !!hidden;
      if (hidden) a.include = false;
      return a;
    });
    // two sheets claiming the same month is legitimate (e.g. "Ocak" and "Ocak-2"), but flag it
    var seen = {};
    sheets.forEach(function (s) {
      if (!s.include || !s.month.key) return;
      if (seen[s.month.key]) { s.warnings.push('sameMonth'); seen[s.month.key].warnings.push('sameMonth'); }
      else seen[s.month.key] = s;
    });
    return { fileName: opts.fileName || '', date1904: date1904, sheets: sheets };
  }

  /** Re-runs the analysis of one sheet after the user changed the header row or a column mapping. */
  function reanalyze(sheet, opts) {
    opts = Object.assign({ fileMonth: sheet.fileMonth }, opts);
    var a = analyzeRows(sheet.rawRows, sheet.name, opts);
    a.fileMonth = sheet.fileMonth;
    a.rawRows = sheet.rawRows;
    a.hidden = sheet.hidden;
    return a;
  }

  // ------------------------------------------------------------------ rows -> records
  function parseField(type, v, opts) {
    var p = plain(v);
    switch (type) {
      case 'date': return U.parseDate(p, { date1904: opts.date1904 });
      case 'money': return U.parseNumber(p);
      case 'int': return U.parseIntSafe(p);
      case 'bool': return U.parseYesNo(p);
      case 'id': return U.normalizeId(p);
      case 'plate': return U.normalizePlate(cellText(v));
      case 'name': return opts.tidyNames === false ? U.collapse(cellText(v)) : U.tidyName(cellText(v));
      case 'email': return cellText(v).toLowerCase();
      case 'phone': return cellText(v);
      default: return U.collapse(cellText(v, opts.lang));
    }
  }

  function buildRecord(x, sheet, opts) {
    opts = opts || {};
    var fields = {};
    var extras = {};
    var issues = [];
    var first = '', last = '';
    sheet.columns.forEach(function (col) {
      var v = x.cells[col.col];
      if (isEmpty(plain(v)) || (v && v.merged)) return;
      if (col.role === 'ignored') return;
      if (col.role === 'custom' || !col.field) { extras[col.header] = cellText(v, opts.lang); return; }
      if (col.field === '_first') { first = U.collapse(cellText(v)); return; }
      if (col.field === '_last') { last = U.collapse(cellText(v)); return; }
      var def = Schema.BY_KEY[col.field];
      if (!def) { extras[col.header] = cellText(v, opts.lang); return; }
      var parsed = parseField(def.type, v, opts);
      if (def.type === 'phone') {
        var ct = U.extractContact(parsed);
        if (ct.email && !fields.email) fields.email = ct.email;
        if (!ct.phone) { if (!fields._contactText) fields._contactText = parsed; return; }
        if (!fields.phone) { fields.phone = ct.phone; fields._phones = ct.phones.slice(); }
        else ct.phones.forEach(function (p) { if (fields._phones.indexOf(p) < 0) fields._phones.push(p); });
        return;
      }
      var bad = parsed == null || parsed === '';
      if (bad) {
        // keep what could not be read instead of dropping it
        extras[col.header] = cellText(v, opts.lang);
        issues.push({ type: def.type === 'date' ? 'badDate' : def.type === 'money' ? 'badNumber' : 'badValue', field: col.field, value: cellText(v, opts.lang) });
        return;
      }
      if (fields[col.field] == null || fields[col.field] === '') fields[col.field] = parsed;
      else if (String(fields[col.field]) !== String(parsed)) extras[col.header] = cellText(v, opts.lang);
    });
    if (!fields.name && (first || last)) fields.name = U.tidyName((first + ' ' + last).trim());
    if (!fields.name && fields.insuredName) fields.name = fields.insuredName;
    if (fields._contactText) {
      if (!fields.phone) extras[Schema.BY_KEY.phone.excel] = fields._contactText;
      delete fields._contactText;
    }
    if (fields.tc) {
      var kind = U.idKind(fields.tc);
      if (kind === 'invalid') issues.push({ type: 'badId', field: 'tc', value: fields.tc });
    }
    return { sheet: sheet.name, row: x.r + 1, month: sheet.month.key, fields: fields, extras: extras, issues: issues, cells: rawCells(x.cells) };
  }

  /** The row as it was in the file (JSON-safe), so an untouched row can be written back unchanged. */
  function rawCells(cells) {
    var out = [];
    (cells || []).forEach(function (v, i) { out[i] = v == null || (v && v.merged) ? null : v; });
    while (out.length && out[out.length - 1] == null) out.pop();
    return out;
  }

  /** One İptal row: { sheet, row, month, company, policyText, insuredName, card, account, cash, cells, issues } */
  function buildCancel(x, sheet, opts) {
    opts = opts || {};
    var rec = { sheet: sheet.name, row: x.r + 1, month: sheet.month.key, company: '', policyText: '', insuredName: '', card: null, account: null, cash: null, cells: rawCells(x.cells), issues: [] };
    sheet.cancelBlock.kinds.forEach(function (k, i) {
      var v = x.cells[i];
      if (isEmpty(plain(v))) return;
      if (k === 'company') rec.company = U.collapse(cellText(v));
      else if (k === 'policy') rec.policyText = U.collapse(cellText(v));
      else if (k === 'insured') rec.insuredName = opts.tidyNames === false ? U.collapse(cellText(v)) : U.tidyName(cellText(v));
      else {
        var n = U.parseNumber(plain(v));
        if (n == null) rec.issues.push({ type: 'badNumber', field: k, value: cellText(v, opts.lang) });
        else rec[k] = n;
      }
    });
    return rec;
  }

  function hasSubstance(rec) {
    var f = rec.fields;
    return !!(f.name || f.policyNo || f.tc || f.plate || f.policyType || f.premium);
  }

  /** Builds import records (and İptal records) for the included sheets. */
  function buildRecords(analysis, opts) {
    opts = opts || {};
    var o = { date1904: analysis.date1904, tidyNames: opts.tidyNames !== false, lang: opts.lang };
    var records = [];
    var cancels = [];
    var skipped = 0;
    analysis.sheets.forEach(function (sheet) {
      if (!sheet.include || !sheet.month.key) return;
      sheet.rows.forEach(function (x) {
        var rec = buildRecord(x, sheet, o);
        if (!hasSubstance(rec)) { skipped++; return; }
        records.push(rec);
      });
      (sheet.cancels || []).forEach(function (x) {
        var c = buildCancel(x, sheet, o);
        if (!c.insuredName && !c.policyText && !c.company) { skipped++; return; }
        cancels.push(c);
      });
    });
    return { records: records, cancels: cancels, skipped: skipped };
  }

  /** Text written in capitals in most rows ("SONGÜL YILDIRIM"): new rows are written the same way. */
  function mostlyUpper(values) {
    var n = 0, up = 0;
    values.forEach(function (v) {
      v = plain(v);
      if (typeof v !== 'string' || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(v)) return;
      n++;
      if (v === U.trUpper(v)) up++;
    });
    return n >= 2 && up / n >= 0.8;
  }
  /** Numbers kept as numbers (TC kimlik no 12345678901, not text): new rows keep doing so. */
  function mostlyNumbers(values) {
    var n = 0, num = 0;
    values.forEach(function (v) {
      v = plain(v);
      if (isEmpty(v)) return;
      n++;
      if (typeof v === 'number') num++;
    });
    return n >= 2 && num / n >= 0.8;
  }

  /** What the workbook writer needs to put rows back where they belong. */
  function layoutOf(sheet) {
    var rows = sheet.rows || [], cancels = sheet.cancels || [];
    return {
      headerRow: sheet.headerRow, dataStart: sheet.dataStart, lastDataRow: sheet.lastDataRow, totalRow: sheet.totalRow,
      columns: sheet.columns.map(function (c) {
        var col = { col: c.col, header: c.header, field: c.role === 'custom' || c.role === 'ignored' ? null : c.field, role: c.role };
        var values = rows.map(function (x) { return x.cells[c.col]; });
        if (mostlyUpper(values)) col.upper = true;
        if (mostlyNumbers(values)) col.numeric = true;
        return col;
      }),
      block: sheet.cancelBlock ? {
        headerRow: sheet.cancelBlock.headerRow, startCol: sheet.cancelBlock.startCol, kinds: sheet.cancelBlock.kinds.slice(), headers: sheet.cancelBlock.headers.slice(),
        lastRow: cancels.reduce(function (m, x) { return Math.max(m, x.r); }, sheet.cancelBlock.headerRow),
        totalRow: sheet.cancelTotalRow != null ? sheet.cancelTotalRow : -1,
        upper: [0, 1, 2, 3, 4, 5].map(function (i) { return mostlyUpper(cancels.map(function (x) { return x.cells[i]; })); })
      } : null,
      yesNo: sheet.yesNo || null
    };
  }

  return {
    readWorkbook: readWorkbook, sheetRows: sheetRows, analyzeRows: analyzeRows, analyzeWorkbook: analyzeWorkbook,
    reanalyze: reanalyze, buildRecords: buildRecords, buildRecord: buildRecord, buildCancel: buildCancel, detectMonth: detectMonth,
    findHeaderRow: findHeaderRow, findCancelBlock: findCancelBlock, cancelHeaderKind: cancelHeaderKind, layoutOf: layoutOf,
    cellText: cellText, plain: plain, colLetter: colLetter, CANCEL_PAY: CANCEL_PAY
  };
});
