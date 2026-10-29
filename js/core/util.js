/* Sigorta Portföy - shared helpers (browser global `U`, or require() in Node). */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.U = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TR_FOLD = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };

  function str(v) { return v == null ? '' : String(v); }
  function trLower(s) { return str(s).toLocaleLowerCase('tr-TR'); }
  function trUpper(s) { return str(s).toLocaleUpperCase('tr-TR'); }

  /** Lower-case, strip Turkish letters and punctuation: "POLİÇE Bitiş-Tarihi" -> "police bitis tarihi". */
  function fold(s) {
    var t = trLower(s).replace(/[çğıöşüâîû]/g, function (c) { return TR_FOLD[c]; });
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    t = t.replace(/[^a-z0-9]+/g, ' ');
    return t.trim();
  }

  function collapse(s) { return str(s).replace(/\s+/g, ' ').trim(); }

  function isAllUpper(s) { return s === trUpper(s) && s !== trLower(s); }
  function isAllLower(s) { return s === trLower(s) && s !== trUpper(s); }

  /** "AHMET YILMAZ" / "ahmet yılmaz" -> "Ahmet Yılmaz"; keeps "A.Ş." and "Ltd. Şti." readable. */
  function titleCase(s) {
    return collapse(s).split(' ').map(function (w) {
      return w.split(/([-'’.()\/])/).map(function (p) {
        if (!p || /^[-'’.()\/]$/.test(p)) return p;
        return trUpper(p.charAt(0)) + trLower(p.slice(1));
      }).join('');
    }).join(' ');
  }

  /** Only rewrites names typed entirely in upper or lower case. */
  function tidyName(s) {
    var c = collapse(s);
    if (!c) return '';
    return (isAllUpper(c) || isAllLower(c)) ? titleCase(c) : c;
  }

  function digits(s) { return str(s).replace(/\D+/g, ''); }

  // ------------------------------------------------------------------ IDs
  function isValidTCKN(s) {
    var v = digits(s);
    if (!/^[1-9]\d{10}$/.test(v)) return false;
    var d = v.split('').map(Number);
    var d10 = (((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
    if (d10 !== d[9]) return false;
    var sum = 0;
    for (var i = 0; i < 10; i++) sum += d[i];
    return sum % 10 === d[10];
  }

  function isValidVKN(s) {
    var v = digits(s);
    if (!/^\d{10}$/.test(v)) return false;
    var sum = 0;
    for (var i = 0; i < 9; i++) {
      var tmp = (Number(v[i]) + 9 - i) % 10;
      var w = (tmp * Math.pow(2, 9 - i)) % 9;
      if (tmp !== 0 && w === 0) w = 9;
      sum += w;
    }
    return (10 - (sum % 10)) % 10 === Number(v[9]);
  }

  /** Accepts numbers (12345678901), text with spaces ("123 456 789 01") or scientific notation. */
  function normalizeId(v) {
    if (v == null) return '';
    if (typeof v === 'number') return isFinite(v) ? String(Math.round(v)) : '';
    var s = str(v).trim();
    if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) return String(Math.round(Number(s)));
    return digits(s);
  }

  /** '' | 'tckn' | 'vkn' | 'invalid' */
  function idKind(v) {
    var d = normalizeId(v);
    if (!d) return '';
    if (d.length === 11 && isValidTCKN(d)) return 'tckn';
    if (d.length === 10 && isValidVKN(d)) return 'vkn';
    return 'invalid';
  }

  function maskId(v) {
    var d = normalizeId(v);
    if (d.length < 6) return d;
    return d.slice(0, 3) + '•'.repeat(d.length - 5) + d.slice(-2);
  }

  // ------------------------------------------------------------------ phones & contact
  function normalizePhone(s) {
    var d = digits(s);
    if (d.length === 14 && d.indexOf('0090') === 0) d = d.slice(4);
    else if (d.length === 12 && d.indexOf('90') === 0) d = d.slice(2);
    else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d;
  }

  function formatPhone(s) {
    var d = normalizePhone(s);
    if (d.length === 10) return '0' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 8) + ' ' + d.slice(8);
    return collapse(s);
  }

  function isMobile(s) { return /^5\d{9}$/.test(normalizePhone(s)); }

  var EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

  /** Splits an "İletişim" cell such as "0532 123 45 67 / ali@x.com - 0212 444 55 66". */
  function extractContact(v) {
    var s = str(v);
    var emails = s.match(EMAIL_RE) || [];
    var rest = s;
    emails.forEach(function (e) { rest = rest.replace(e, ' '); });
    var phones = [];
    rest.split(/[\/,;|\n]|\s[-–]\s|\bveya\b|\bve\b|\bor\b/i).forEach(function (chunk) {
      var n = normalizePhone(chunk);
      if (n.length >= 7 && n.length <= 15 && phones.indexOf(n) < 0) phones.push(n);
    });
    phones.sort(function (a, b) { return (b.length === 10) - (a.length === 10); });
    return { phone: phones[0] || '', phones: phones, email: (emails[0] || '').toLowerCase() };
  }

  function whatsappUrl(phone, text) {
    var d = normalizePhone(phone);
    if (d.length !== 10) return '';
    return 'https://wa.me/90' + d + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  // ------------------------------------------------------------------ plates
  function plateKey(s) {
    return str(s).replace(/İ/g, 'I').replace(/ı/g, 'I').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function normalizePlate(s) {
    var k = plateKey(s);
    var m = k.match(/^(\d{2})([A-Z]{1,3})(\d{2,5})$/);
    if (m) return m[1] + ' ' + m[2] + ' ' + m[3];
    return collapse(str(s).replace(/i/g, 'I').toUpperCase());
  }

  function isValidPlate(s) {
    var m = plateKey(s).match(/^(\d{2})([A-Z]{1,3})(\d{2,5})$/);
    if (!m) return false;
    var city = Number(m[1]);
    return city >= 1 && city <= 81;
  }

  // ------------------------------------------------------------------ numbers
  /** Parses 12345.5, "12.345,50", "₺1.234", "1,234.56", "12.345 TL", "(1.200)". */
  function parseNumber(v) {
    if (v == null || v === '' || typeof v === 'boolean') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = str(v).trim();
    if (!s) return null;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    s = s.replace(/₺|\$|€|£/g, '').replace(/\b(TL|TRY|YTL|USD|EUR)\b/gi, '');
    s = s.replace(/[\s '’()+\-]/g, '');
    if (!s || /[^0-9.,]/.test(s) || !/\d/.test(s)) return null;
    var lastDot = s.lastIndexOf('.');
    var lastComma = s.lastIndexOf(',');
    var out;
    if (lastDot >= 0 && lastComma >= 0) {
      if (lastComma > lastDot) out = s.replace(/\./g, '').replace(',', '.');
      else out = s.replace(/,/g, '');
    } else if (lastComma >= 0) {
      out = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(/,/g, '.');
      if ((out.match(/\./g) || []).length > 1) return null;
    } else if (lastDot >= 0) {
      out = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
      if ((out.match(/\./g) || []).length > 1) return null;
    } else {
      out = s;
    }
    var n = Number(out);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  }

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function parseIntSafe(v) {
    var n = parseNumber(v);
    return n == null ? null : Math.round(n);
  }

  var YES_RE = /^(evet|e|x|var|yes|y|true|1|yeni|yeni is|yeni musteri|yeni police|ok|tamam|v)$/;
  var NO_RE = /^(hayir|h|yok|no|n|false|0|yenileme|yenilendi|yenileme isi|eski|eski musteri|devam)$/;

  /** "Yeni iş" cell -> true / false / null. A positive amount also counts as yes. */
  function parseYesNo(v) {
    if (v == null) return null;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v > 0 ? true : (v === 0 ? false : null);
    var s = str(v).trim();
    if (!s) return null;
    if (/^[✓✔☑+]+$/.test(s)) return true;
    if (/^[✗✘×]+$/.test(s)) return false;
    var f = fold(s);
    if (YES_RE.test(f)) return true;
    if (NO_RE.test(f)) return false;
    var n = parseNumber(s);
    if (n != null) return n > 0;
    return null;
  }

  // ------------------------------------------------------------------ dates (ISO yyyy-mm-dd strings)
  var MONTHS_TR = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
  var MONTHS_TR_SHORT = ['oca', 'sub', 'mar', 'nis', 'may', 'haz', 'tem', 'agu', 'eyl', 'eki', 'kas', 'ara'];
  var MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  var MONTHS_EN_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONTH_NAMES = {
    tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };
  var MONTH_SHORT = {
    tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  };

  function monthFromToken(t) {
    var lists = [MONTHS_TR, MONTHS_EN, MONTHS_TR_SHORT, MONTHS_EN_SHORT];
    for (var i = 0; i < lists.length; i++) {
      var k = lists[i].indexOf(t);
      if (k >= 0) return k + 1;
    }
    if (t === 'sept') return 9;
    if (t === 'agus' || t === 'agust') return 8;
    return 0;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isoFromYMD(y, m, d) {
    if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  function excelSerialToISO(n, date1904) {
    if (!(n > 0 && n < 2958466)) return null;
    var days = Math.floor(n + 1e-6);
    var base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, days >= 61 ? 30 : 31);
    var t = new Date(base + days * 864e5);
    return isoFromYMD(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  function isoToSerial(iso) {
    var ms = isoToUTC(iso);
    return Math.round((ms - Date.UTC(1899, 11, 30)) / 864e5);
  }

  /** Returns 'yyyy-mm-dd' or null. Day-first is assumed for 03.04.2026 (Turkish usage). */
  function parseDate(v, opts) {
    opts = opts || {};
    if (v == null || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      return isoFromYMD(v.getFullYear(), v.getMonth() + 1, v.getDate());
    }
    if (typeof v === 'number') {
      if (v > 9000 && v < 110000) return excelSerialToISO(v, opts.date1904);
      return null;
    }
    var s = str(v).trim();
    if (!s) return null;
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T\s].*)?$/);
    if (m) return isoFromYMD(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})\s*[.\/\-]\s*(\d{1,2})\s*[.\/\-]\s*(\d{4}|\d{2})(?:\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)?$/);
    if (m) {
      var a = +m[1], b = +m[2], y = +m[3];
      if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
      if (b > 12 && a <= 12) return isoFromYMD(y, a, b);
      return isoFromYMD(y, b, a);
    }
    var f = fold(s).split(' ');
    if (f.length >= 3) {
      var mi = monthFromToken(f[1]);
      if (mi && /^\d{1,2}$/.test(f[0]) && /^(\d{2}|\d{4})$/.test(f[2])) {
        var yy = +f[2];
        if (f[2].length === 2) yy += 2000;
        return isoFromYMD(yy, mi, +f[0]);
      }
      mi = monthFromToken(f[0]);
      if (mi && /^\d{1,2}$/.test(f[1]) && /^\d{4}$/.test(f[2])) return isoFromYMD(+f[2], mi, +f[1]);
    }
    if (/^\d{5}(\.\d+)?$/.test(s)) return parseDate(parseFloat(s), opts);
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return isoFromYMD(+m[1], +m[2], +m[3]);
    return null;
  }

  function isoToUTC(iso) {
    var p = iso.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  function utcToISO(ms) {
    var t = new Date(ms);
    return isoFromYMD(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  function addDays(iso, n) { return utcToISO(isoToUTC(iso) + n * 864e5); }

  function addMonths(iso, n) {
    var p = iso.split('-');
    var y = +p[0], m = +p[1] - 1 + n, d = +p[2];
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return isoFromYMD(y, m + 1, Math.min(d, last));
  }

  function addYears(iso, n) { return addMonths(iso, 12 * n); }

  /** Whole days from a to b (b - a). */
  function diffDays(a, b) { return Math.round((isoToUTC(b) - isoToUTC(a)) / 864e5); }

  var todayOverride = null;
  function setToday(iso) { todayOverride = iso || null; }
  function todayISO() {
    if (todayOverride) return todayOverride;
    var t = new Date();
    return isoFromYMD(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }

  function monthKeyOf(iso) { return iso ? iso.slice(0, 7) : ''; }
  function currentMonthKey() { return monthKeyOf(todayISO()); }
  function isMonthKey(k) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(str(k)); }
  function addMonthsToKey(key, n) { return addMonths(key + '-01', n).slice(0, 7); }

  function monthLabel(key, lang, short) {
    if (!isMonthKey(key)) return str(key);
    var y = key.slice(0, 4), m = +key.slice(5, 7) - 1;
    var names = (short ? MONTH_SHORT : MONTH_NAMES)[lang === 'en' ? 'en' : 'tr'];
    return short ? names[m] + ' ' + y.slice(2) : names[m] + ' ' + y;
  }

  /** Reads a month (and year if present) from text such as "OCAK 2026", "Eylül 26", "08.2026", "2026-08". */
  function parseMonthText(text) {
    var raw = str(text);
    var f = fold(raw).replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2');
    if (!f) return null;
    var toks = f.split(' ');
    var month = 0, year = 0, i;
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      var mi = monthFromToken(t);
      if (mi && !month) { month = mi; continue; }
      if (/^(19|20)\d{2}$/.test(t) && !year) year = +t;
    }
    if (month && !year) {
      for (i = 0; i < toks.length; i++) {
        if (/^\d{2}$/.test(toks[i])) { year = 2000 + Number(toks[i]); break; }
      }
    }
    if (!month) {
      var m = raw.match(/(?:^|\D)(\d{1,2})\s*[.\/\-_ ]\s*((?:19|20)\d{2})(?!\d)/);
      if (m) { month = +m[1]; year = +m[2]; } else {
        m = raw.match(/(?:^|\D)((?:19|20)\d{2})\s*[.\/\-_ ]\s*(\d{1,2})(?!\d)/);
        if (m) { year = +m[1]; month = +m[2]; }
      }
      if (!(month >= 1 && month <= 12)) return null;
    }
    return { month: month, year: year || null };
  }

  // ------------------------------------------------------------------ formatting
  var nfCache = {};
  function nf(locale, opts) {
    var k = locale + JSON.stringify(opts);
    if (!nfCache[k]) nfCache[k] = new Intl.NumberFormat(locale, opts);
    return nfCache[k];
  }
  function loc(lang) { return lang === 'en' ? 'en-GB' : 'tr-TR'; }

  function fmtMoney(n, lang, decimals) {
    if (n == null || isNaN(n)) return '';
    var d = decimals == null ? 2 : decimals;
    return nf(loc(lang), { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  }

  function fmtMoneyCompact(n, lang) {
    if (n == null || isNaN(n)) return '';
    if (Math.abs(n) < 10000) return fmtMoney(n, lang, 0);
    return nf(loc(lang), { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }

  function fmtNumber(n, lang, decimals) {
    if (n == null || isNaN(n)) return '';
    var d = decimals == null ? 0 : decimals;
    return nf(loc(lang), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  }

  function fmtCompact(n, lang) {
    if (n == null || isNaN(n)) return '';
    return nf(loc(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }

  function fmtPct(x, lang, decimals) {
    if (x == null || isNaN(x) || !isFinite(x)) return '–';
    var d = decimals == null ? 1 : decimals;
    return nf(loc(lang), { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
  }

  function fmtDate(iso, lang) {
    if (!iso) return '';
    var p = str(iso).split('-');
    if (p.length !== 3) return str(iso);
    return lang === 'en' ? p[2] + '/' + p[1] + '/' + p[0] : p[2] + '.' + p[1] + '.' + p[0];
  }

  function fmtDateTime(ts, lang) {
    if (!ts) return '';
    var t = new Date(ts);
    var iso = isoFromYMD(t.getFullYear(), t.getMonth() + 1, t.getDate());
    return fmtDate(iso, lang) + ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
  }

  // ------------------------------------------------------------------ misc
  function uid(prefix) {
    var s = '';
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var a = new Uint32Array(3);
      crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) s += a[i].toString(36);
    } else {
      s = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    return (prefix || '') + s.slice(0, 14);
  }

  function hash(s) {
    var h = 0x811c9dc5;
    s = str(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function sum(arr, fn) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) {
      var v = fn ? fn(arr[i]) : arr[i];
      if (typeof v === 'number' && isFinite(v)) s += v;
    }
    return s;
  }

  function groupBy(arr, fn) {
    var m = new Map();
    arr.forEach(function (x) {
      var k = fn(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    });
    return m;
  }

  function cmp(a, b) {
    if (a == null && b == null) return 0;
    if (a == null || a === '') return 1;
    if (b == null || b === '') return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'tr', { sensitivity: 'base', numeric: true });
  }

  var COMPANY_STOP = { sigorta: 1, sigortasi: 1, sigortacilik: 1, as: 1, a: 1, s: 1, anonim: 1, sirketi: 1, sirket: 1 };
  /** Groups "ALLİANZ", "Allianz Sigorta" and "Allianz Sigorta A.Ş." together. */
  function companyKey(name) {
    var toks = fold(name).split(' ').filter(function (t) { return t && !COMPANY_STOP[t]; });
    return toks.join(' ') || fold(name);
  }

  function escapeHtml(s) {
    return str(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  return {
    str: str, trLower: trLower, trUpper: trUpper, fold: fold, collapse: collapse, titleCase: titleCase,
    tidyName: tidyName, isAllUpper: isAllUpper, digits: digits,
    isValidTCKN: isValidTCKN, isValidVKN: isValidVKN, normalizeId: normalizeId, idKind: idKind, maskId: maskId,
    normalizePhone: normalizePhone, formatPhone: formatPhone, isMobile: isMobile, extractContact: extractContact,
    whatsappUrl: whatsappUrl,
    plateKey: plateKey, normalizePlate: normalizePlate, isValidPlate: isValidPlate,
    parseNumber: parseNumber, parseIntSafe: parseIntSafe, round2: round2, parseYesNo: parseYesNo,
    parseDate: parseDate, excelSerialToISO: excelSerialToISO, isoToSerial: isoToSerial, isoFromYMD: isoFromYMD,
    addDays: addDays, addMonths: addMonths, addYears: addYears, diffDays: diffDays,
    todayISO: todayISO, setToday: setToday, monthKeyOf: monthKeyOf, currentMonthKey: currentMonthKey,
    isMonthKey: isMonthKey, addMonthsToKey: addMonthsToKey, monthLabel: monthLabel, parseMonthText: parseMonthText,
    MONTH_NAMES: MONTH_NAMES, MONTH_SHORT: MONTH_SHORT,
    fmtMoney: fmtMoney, fmtMoneyCompact: fmtMoneyCompact, fmtNumber: fmtNumber, fmtCompact: fmtCompact,
    fmtPct: fmtPct, fmtDate: fmtDate, fmtDateTime: fmtDateTime,
    uid: uid, hash: hash, debounce: debounce, sum: sum, groupBy: groupBy, cmp: cmp, companyKey: companyKey,
    escapeHtml: escapeHtml, pad2: pad2
  };
});
