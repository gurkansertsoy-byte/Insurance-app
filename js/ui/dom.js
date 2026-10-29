/* Sigorta Portföy - small DOM toolkit: elements, icons, dialogs, toasts, tables and shared bits. */
(function (root) {
  'use strict';
  var U = root.U;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_TAGS = { svg: 1, g: 1, path: 1, rect: 1, circle: 1, line: 1, polyline: 1, polygon: 1, text: 1, tspan: 1, defs: 1, title: 1, clipPath: 1 };
  var BOOL_PROPS = { checked: 1, disabled: 1, selected: 1, hidden: 1, readOnly: 1, multiple: 1, required: 1, open: 1 };

  function t(k, p) { return root.I18N ? root.I18N.t(k, p) : k; }
  function lang() { return root.I18N ? root.I18N.lang : 'tr'; }

  /** h('div', { class: 'x', onClick: fn }, child, [children], 'text') - strings always become text nodes. */
  function h(tag, props) {
    var isSvg = !!SVG_TAGS[tag];
    var el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class' || k === 'className') { if (isSvg) el.setAttribute('class', v); else el.className = v; }
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'text') el.textContent = v;
        else if (k === 'value' && !isSvg) el.value = v;
        else if (BOOL_PROPS[k] && !isSvg) el[k] = !!v;
        else if (k === 'ref' && typeof v === 'function') v(el);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, c) {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) append(el, c[i]); return; }
    if (c instanceof Node) { el.appendChild(c); return; }
    el.appendChild(document.createTextNode(String(c)));
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /** Wraps loose strings in spans so flex gaps separate them; drops empty items. */
  function items() {
    var out = [];
    (function walk(list) {
      for (var i = 0; i < list.length; i++) {
        var x = list[i];
        if (Array.isArray(x)) walk(x);
        else if (x == null || x === '' || x === false) continue;
        else if (typeof x === 'string' || typeof x === 'number') out.push(h('span', null, String(x)));
        else out.push(x);
      }
    })(arguments);
    return out;
  }

  function icon(name, cls) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'svg-icon' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = (root.ICONS && root.ICONS[name]) || ''; // static Lucide markup, never user data
    return s;
  }

  // ------------------------------------------------------------------ formatting bound to the UI language
  var F = {
    money: function (n, d) { return U.fmtMoney(n, lang(), d); },
    money0: function (n) { return U.fmtMoney(n, lang(), 0); },
    moneyC: function (n) { return U.fmtMoneyCompact(n, lang()); },
    num: function (n, d) { return U.fmtNumber(n, lang(), d); },
    pct: function (x, d) { return U.fmtPct(x, lang(), d); },
    date: function (iso) { return U.fmtDate(iso, lang()); },
    dateTime: function (ts) { return U.fmtDateTime(ts, lang()); },
    month: function (k, short) { return U.monthLabel(k, lang(), short); },
    phone: function (p) { return U.formatPhone(p); }
  };

  // ------------------------------------------------------------------ dialogs
  function modal(o) {
    var dlg = h('dialog', { class: 'modal ' + (o.size || ''), 'aria-labelledby': 'dlg-title' });
    var closed = false;
    function close() { if (!closed && dlg.open) dlg.close(); }
    dlg.addEventListener('close', function () {
      closed = true;
      dlg.remove();
      if (o.onClose) o.onClose();
    });
    dlg.addEventListener('mousedown', function (e) { if (e.target === dlg && !o.sticky) close(); });
    var body = h('div', { class: 'modal-body' }, o.body);
    var inner = h('div', { class: 'modal-inner' },
      h('div', { class: 'modal-head' }, o.icon ? icon(o.icon) : null, h('h2', { id: 'dlg-title' }, o.title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('common.close'), onClick: close }, icon('x'))),
      body,
      o.foot ? h('div', { class: 'modal-foot' }, o.foot) : null);
    if (o.onSubmit) {
      var form = h('form', { class: 'modal-inner', novalidate: true, onSubmit: function (e) { e.preventDefault(); o.onSubmit(e); } });
      while (inner.firstChild) form.appendChild(inner.firstChild);
      inner = form;
    }
    dlg.appendChild(inner);
    document.body.appendChild(dlg);
    dlg.showModal();
    var first = dlg.querySelector('[autofocus]') || dlg.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea');
    if (first) setTimeout(function () { try { first.focus(); } catch (e) { /* ignore */ } }, 20);
    return { el: dlg, body: body, close: close };
  }

  /** Resolves true when confirmed. o: { title, message, confirm, danger, requireText, extra } */
  function confirmDialog(o) {
    return new Promise(function (resolve) {
      var answered = false;
      var input = o.requireText ? h('input', { class: 'input', id: 'confirm-text', autocomplete: 'off' }) : null;
      var ok = h('button', { type: 'submit', class: 'btn ' + (o.danger ? 'btn-danger-solid' : 'btn-primary') }, o.confirm || t('common.confirm'));
      var m = modal({
        title: o.title, size: 'narrow', icon: o.danger ? 'triangle-alert' : null,
        body: [
          typeof o.message === 'string' ? h('p', null, o.message) : o.message,
          o.extra || null,
          input ? h('div', { class: 'field' }, h('label', { for: 'confirm-text' }, t('common.typeToConfirm', { text: o.requireText })), input) : null
        ],
        foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.cancel')), ok],
        onSubmit: function () {
          if (input && U.fold(input.value) !== U.fold(o.requireText)) { input.focus(); input.select(); return; }
          answered = true;
          m.close();
          resolve(true);
        },
        onClose: function () { if (!answered) resolve(false); }
      });
      setTimeout(function () { (input || ok).focus(); }, 30);
    });
  }

  function toast(msg, o) {
    o = o || {};
    var box = document.querySelector('.toasts');
    if (!box) box = document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
    var type = o.type || 'good';
    var el = h('div', { class: 'toast ' + type },
      icon(type === 'bad' ? 'circle-alert' : type === 'info' ? 'info' : 'circle-check'),
      h('span', null, msg),
      o.action ? h('button', { type: 'button', onClick: function () { remove(); o.action.fn(); } }, o.action.label) : null);
    box.appendChild(el);
    var timer = setTimeout(remove, o.timeout || (o.action ? 8000 : 3800));
    function remove() { clearTimeout(timer); if (el.parentNode) el.parentNode.removeChild(el); }
    return remove;
  }

  // ------------------------------------------------------------------ table
  /**
   * new TableView({ columns: [{ key, label, render(row), sort: true|fn, align: 'r', cls, title }],
   *   rows, pageSize, onRowClick, sortKey, sortDir, footer(rows) -> [td], empty, className, rowClass(row) })
   */
  function TableView(o) {
    this.o = o;
    this.sortKey = o.sortKey || null;
    this.sortDir = o.sortDir || 1;
    this.page = 0;
    this.el = h('div', { class: 'tableview' });
    this.rows = o.rows || [];
    this.render();
  }

  TableView.prototype.setRows = function (rows, keepPage) {
    this.rows = rows;
    if (!keepPage) this.page = 0;
    this.render();
  };

  TableView.prototype.sortValue = function (col, row) {
    if (typeof col.sort === 'function') return col.sort(row);
    return row[col.key];
  };

  TableView.prototype.sorted = function () {
    var self = this;
    var col = this.o.columns.filter(function (c) { return c.key === self.sortKey; })[0];
    if (!col || !col.sort) return this.rows;
    var dir = this.sortDir;
    return this.rows.slice().sort(function (a, b) {
      var x = self.sortValue(col, a), y = self.sortValue(col, b);
      var empty = function (v) { return v == null || v === ''; };
      if (empty(x) && empty(y)) return 0;
      if (empty(x)) return 1;
      if (empty(y)) return -1;
      return U.cmp(x, y) * dir;
    });
  };

  TableView.prototype.toggleSort = function (key) {
    if (this.sortKey === key) this.sortDir = -this.sortDir;
    else { this.sortKey = key; this.sortDir = 1; }
    if (this.o.onSort) this.o.onSort(this.sortKey, this.sortDir);
    this.render();
  };

  TableView.prototype.render = function () {
    var o = this.o, self = this;
    var rows = this.sorted();
    var ps = o.pageSize || 0;
    var pages = ps ? Math.max(1, Math.ceil(rows.length / ps)) : 1;
    if (this.page >= pages) this.page = pages - 1;
    var slice = ps ? rows.slice(this.page * ps, this.page * ps + ps) : rows;
    clear(this.el);
    if (!rows.length && o.empty) { this.el.appendChild(o.empty); return; }
    var head = h('tr', null, o.columns.map(function (col) {
      var active = self.sortKey === col.key;
      var attrs = {
        class: [col.align === 'r' ? 'r' : '', col.sort ? 'sortable' : '', col.thClass || ''].join(' ').trim() || null,
        scope: 'col', title: col.title || null,
        'aria-sort': col.sort ? (active ? (self.sortDir > 0 ? 'ascending' : 'descending') : 'none') : null
      };
      if (col.sort) {
        attrs.tabindex = 0;
        attrs.onClick = function () { self.toggleSort(col.key); };
        attrs.onKeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.toggleSort(col.key); } };
      }
      return h('th', attrs, col.label, col.sort ? h('span', { class: 'sort-ind', 'aria-hidden': 'true' }, active ? (self.sortDir > 0 ? ' ▲' : ' ▼') : '') : null);
    }));
    var body = h('tbody', null, slice.map(function (r) {
      return h('tr', {
        class: [o.onRowClick ? 'clickable' : '', o.rowClass ? o.rowClass(r) : ''].join(' ').trim() || null,
        onClick: o.onRowClick ? function (e) {
          if (e.target.closest('a, button, input, select, label, textarea')) return;
          o.onRowClick(r, e);
        } : null
      }, o.columns.map(function (col) {
        var v = col.render ? col.render(r) : r[col.key];
        return h('td', {
          class: [col.align === 'r' ? 'r' : '', col.cls || ''].join(' ').trim() || null,
          'data-label': typeof col.label === 'string' && col.label ? col.label : null
        }, v);
      }));
    }));
    var foot = o.footer ? h('tfoot', null, h('tr', null, o.footer(rows))) : null;
    var table = h('table', { class: 'data ' + (o.responsive === false ? '' : 'responsive ') + (o.className || '') }, h('thead', null, head), body, foot);
    this.el.appendChild(h('div', { class: 'table-wrap' }, table));
    if (ps && rows.length > ps) {
      var from = this.page * ps + 1, to = Math.min(rows.length, from + ps - 1);
      this.el.appendChild(h('div', { class: 'pager' },
        h('span', null, t('table.range', { from: F.num(from), to: F.num(to), total: F.num(rows.length) })),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-sm', disabled: this.page === 0, onClick: function () { self.page--; self.render(); self.scrollTop(); } }, icon('chevron-left'), t('table.prev')),
        h('span', null, t('table.page', { page: this.page + 1, pages: pages })),
        h('button', { type: 'button', class: 'btn btn-sm', disabled: this.page >= pages - 1, onClick: function () { self.page++; self.render(); self.scrollTop(); } }, t('table.next'), icon('chevron-right'))));
    }
  };

  TableView.prototype.scrollTop = function () {
    var r = this.el.getBoundingClientRect();
    if (r.top < 70) window.scrollBy(0, r.top - 80);
  };

  // ------------------------------------------------------------------ shared pieces
  function pill(text, tone, title) { return h('span', { class: 'pill ' + (tone || ''), title: title || null }, text); }

  function plate(p, large) {
    if (!p) return null;
    return h('span', { class: 'plate' + (large ? ' lg' : ''), title: t('field.plate') + ': ' + p }, h('span', { class: 'tr', 'aria-hidden': 'true' }, 'TR'), h('span', { class: 'no' }, p));
  }

  function idBadge(tc, masked) {
    if (!tc) return h('span', { class: 'muted' }, '—');
    var kind = U.idKind(tc);
    var shown = masked ? U.maskId(tc) : tc;
    if (kind === 'invalid') {
      return h('span', { class: 'idbadge badid', title: t('id.invalid') }, icon('triangle-alert'), shown);
    }
    return h('span', { class: 'idbadge ok', title: kind === 'vkn' ? t('id.vkn') : t('id.tckn') }, shown);
  }

  function initials(name) {
    var parts = U.collapse(name).split(' ').filter(Boolean);
    if (!parts.length) return '?';
    var a = parts[0].charAt(0), b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return U.trUpper(a + b);
  }

  function empty(o) {
    return h('div', { class: 'empty' }, icon(o.icon || 'info'), h('h3', null, o.title), o.text ? h('p', null, o.text) : null,
      o.actions ? h('div', { class: 'row', style: { justifyContent: 'center' } }, o.actions) : null);
  }

  function field(o) {
    // o: { id, label, input (Node), hint (Node|string), req, cls }
    return h('div', { class: 'field ' + (o.cls || '') },
      h('label', { for: o.id }, o.label, o.req ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null, o.labelExtra || null),
      o.input,
      o.hint === undefined ? null : (o.hint instanceof Node ? o.hint : h('div', { class: 'hint', id: o.id ? o.id + '-hint' : null }, o.hint || '')));
  }

  function select(id, options, value, attrs) {
    var el = h('select', Object.assign({ id: id }, attrs || {}), options.map(function (op) {
      if (op.group) return h('optgroup', { label: op.group }, op.options.map(function (x) { return h('option', { value: x.value, selected: String(x.value) === String(value) }, x.label); }));
      return h('option', { value: op.value, selected: String(op.value) === String(value) }, op.label);
    }));
    return el;
  }

  /** Month + year selects (type=month is missing in Firefox and Safari). onChange gets 'yyyy-mm' or ''. */
  function monthInput(id, value, onChange, opts) {
    opts = opts || {};
    var cur = Number(U.todayISO().slice(0, 4));
    var y = U.isMonthKey(value) ? Number(value.slice(0, 4)) : null;
    var m = U.isMonthKey(value) ? Number(value.slice(5, 7)) : null;
    var years = [];
    for (var yy = cur + 2; yy >= cur - 15; yy--) years.push(yy);
    if (y && years.indexOf(y) < 0) { years.push(y); years.sort(function (a, b) { return b - a; }); }
    var names = U.MONTH_NAMES[lang() === 'en' ? 'en' : 'tr'];
    var mSel = h('select', { id: id, class: 'input', 'aria-label': t('common.month') },
      h('option', { value: '', selected: !m }, '—'),
      names.map(function (n, i) { return h('option', { value: String(i + 1), selected: m === i + 1 }, n); }));
    var ySel = h('select', { id: id + '-y', class: 'input', 'aria-label': t('common.year') },
      h('option', { value: '', selected: !y }, '—'),
      years.map(function (v) { return h('option', { value: String(v), selected: y === v }, String(v)); }));
    function emit() {
      var mm = Number(mSel.value), vy = Number(ySel.value);
      if (mm && !vy) { vy = cur; ySel.value = String(cur); }
      if (vy && !mm) return;
      onChange(mm && vy ? vy + '-' + U.pad2(mm) : '');
    }
    mSel.addEventListener('change', emit);
    ySel.addEventListener('change', emit);
    return h('div', { class: 'month-input', style: opts.style || null }, mSel, ySel);
  }

  /**
   * Date field that always reads and writes gg.aa.yyyy (the native picker follows the browser language,
   * so an English Chrome would read 05.03.2027 as 3 May). Dots are added while typing; ISO and 5/3/2027 work too.
   * Returns a wrapper with .input, .getValue() -> 'yyyy-mm-dd' | '' and .setValue(iso, silent).
   */
  function dateInput(id, iso, onChange, attrs) {
    var input = h('input', Object.assign({ id: id, type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: 10, placeholder: t('date.placeholder'), class: 'date-text' }, attrs || {}));
    var picker = h('input', { type: 'date', tabindex: '-1', 'aria-hidden': 'true', class: 'date-native' });
    var btn = h('button', { type: 'button', class: 'date-btn', tabindex: '-1', title: t('date.pick'), 'aria-label': t('date.pick') }, icon('calendar'));
    var wrap = h('div', { class: 'date-input' }, input, btn, picker);
    var current = '';
    function emit(v) { if (v !== current) { current = v; if (onChange) onChange(v); } }
    function show(v) { input.value = v ? U.fmtDate(v, 'tr') : ''; picker.value = v || ''; input.dataset.iso = v || ''; }
    function setValue(v, silent) { show(v); wrap.classList.remove('bad'); if (silent) current = v || ''; else emit(v || ''); }
    function complete(s) { return /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s); }
    input.addEventListener('input', function (e) {
      var raw = input.value;
      var deleting = e && e.inputType && e.inputType.indexOf('delete') === 0;
      if (!deleting) {
        if (/^\d{2}$/.test(raw) || /^\d{1,2}\.\d{2}$/.test(raw)) raw += '.';
        else if (/^\d{5,8}$/.test(raw)) raw = raw.slice(0, 2) + '.' + raw.slice(2, 4) + '.' + raw.slice(4);
        if (raw !== input.value) input.value = raw;
      }
      wrap.classList.remove('bad');
      if (!raw.trim()) { input.dataset.iso = ''; emit(''); return; }
      if (complete(raw)) {
        var v = U.parseDate(raw);
        if (v) { input.dataset.iso = v; picker.value = v; emit(v); }
      }
    });
    function commit() {
      var raw = U.collapse(input.value);
      if (!raw) { setValue('', false); return; }
      var v = U.parseDate(raw);
      if (v) setValue(v, false); else wrap.classList.add('bad');
    }
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    picker.addEventListener('change', function () { setValue(picker.value, false); input.focus(); });
    btn.addEventListener('click', function () {
      try { picker.showPicker(); } catch (err) { picker.focus(); picker.click(); }
    });
    setValue(iso || '', true);
    wrap.input = input;
    wrap.getValue = function () { return input.dataset.iso || ''; };
    wrap.setValue = setValue;
    return wrap;
  }

  function datalist(id, values) {
    return h('datalist', { id: id }, values.map(function (v) { return h('option', { value: v }); }));
  }

  function copyText(text) {
    function fallback() {
      var ta = h('textarea', { style: { position: 'fixed', left: '-9999px' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  function highlight(text, query) {
    var s = U.str(text);
    var q = U.collapse(query);
    if (!q || q.length < 2) return s;
    // highlight on folded text but keep the original characters
    var fs = U.fold(s), fq = U.fold(q);
    if (!fq) return s;
    var map = [], folded = '';
    for (var i = 0; i < s.length; i++) {
      var f = U.fold(s.charAt(i));
      if (!f && /\s/.test(s.charAt(i))) f = ' ';
      for (var j = 0; j < f.length; j++) { folded += f.charAt(j); map.push(i); }
    }
    var at = folded.indexOf(fq);
    if (at < 0 || fs.indexOf(fq) < 0) return s;
    var start = map[at], end = map[Math.min(map.length - 1, at + fq.length - 1)] + 1;
    return [s.slice(0, start), h('mark', null, s.slice(start, end)), s.slice(end)];
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsArrayBuffer(file);
    });
  }

  root.UI = {
    h: h, append: append, clear: clear, items: items, icon: icon, F: F, modal: modal, confirm: confirmDialog, toast: toast,
    TableView: TableView, pill: pill, plate: plate, idBadge: idBadge, initials: initials, empty: empty,
    field: field, select: select, monthInput: monthInput, dateInput: dateInput, datalist: datalist, copyText: copyText, highlight: highlight, download: download,
    readFile: readFile, t: t
  };
})(typeof self !== 'undefined' ? self : this);
