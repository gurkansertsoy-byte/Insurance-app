'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I18N = require('../../js/i18n.js');

const ROOT = path.join(__dirname, '..', '..', 'js');
function sources() {
  const out = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js') && !['icons.js', 'sample-data.js', 'i18n.js'].includes(f)) out.push(p);
    }
  })(ROOT);
  return out;
}

// keys built at run time: prefix -> suffixes
const DYNAMIC = {
  'activity.': ['note', 'call', 'meeting', 'whatsapp', 'email', 'policyAdded', 'policyUpdated', 'policyDeleted', 'payment', 'renewalStatus', 'customerAdded', 'taskDone', 'merged', 'import'],
  'collections.f.': ['open', 'paid', 'all'],
  'dash.metric.': ['premium', 'commission', 'count'],
  'dup.reason.': ['name', 'nameUnclear', 'phone'],
  'import.issue.': ['badId', 'badDate', 'badNumber', 'badValue', 'ambiguousName', 'duplicateRow'],
  'import.src.': ['sheet', 'title', 'file', 'data', 'manual', 'none', 'ydata', 'yfile', 'yguess'],
  'import.w.': ['noHeader', 'noMonth', 'sameMonth', 'notPolicySheet', 'hidden'],
  'opp.': ['kasko.title', 'kasko.why', 'kasko.text', 'kasko.task', 'trafik.title', 'trafik.why', 'trafik.text', 'trafik.task',
    'konut.title', 'konut.why', 'konut.text', 'konut.task', 'dask.title', 'dask.why', 'dask.text', 'dask.task'],
  'pay.': ['cash', 'card', 'transfer', 'account', 'short.card', 'short.cash', 'short.account'],
  'renewals.b.': ['window', 'expired', 'd7', 'd15', 'd30', 'd60', 'd90', 'renewed', 'lost'],
  'renewals.lost.': ['price', 'competitor', 'sold', 'declined', 'other'],
  'renewals.st.': ['pending', 'contacted', 'quoted', 'renewed', 'lost'],
  'settings.backend.': ['indexeddb', 'localstorage', 'memory'],
  'settings.whereSub.': ['indexeddb', 'localstorage', 'memory'],
  'settings.ph.': ['ad', 'adsoyad', 'police', 'sirket', 'plaka', 'plakaMetni', 'bitis', 'gun', 'acente', 'acenteTel'],
  'settings.theme.': ['system', 'light', 'dark'],
  'tasks.empty.': ['overdue', 'today', 'upcoming', 'nodate', 'done'],
  'tasks.tab.': ['overdue', 'today', 'upcoming', 'nodate', 'done'],
  '': ['dash.f1.t', 'dash.f1.s', 'dash.f2.t', 'dash.f2.s', 'dash.f3.t', 'dash.f3.s', 'dash.f4.t', 'dash.f4.s', 'dash.f5.t', 'dash.f5.s',
    'import.tip1.t', 'import.tip1.s', 'import.tip2.t', 'import.tip2.s', 'import.tip3.t', 'import.tip3.s', 'form.plus1y', 'form.plus6m', 'form.plus1m',
    'import.modeMerge', 'import.modeMergeSub', 'import.modeReplace', 'import.modeReplaceSub', 'nav.sectionData', 'state.short']
};

test('every text used in the code exists in Turkish and English', () => {
  const keys = new Set();
  for (const file of sources()) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'(?!\s*\+)/g)) keys.add(m[1]);
    for (const m of src.matchAll(/label: '([a-z]+\.[a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/section: '([a-z]+\.[a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
  }
  for (const [prefix, suffixes] of Object.entries(DYNAMIC)) for (const s of suffixes) keys.add(prefix + s);
  keys.delete('state.short'); // never shown: travel policies display active / ended
  const missing = [];
  for (const k of keys) {
    for (const lang of ['tr', 'en']) if (!I18N.has(k, lang)) missing.push(lang + ':' + k);
  }
  assert.deepEqual(missing, []);
  assert.ok(keys.size > 600, 'found ' + keys.size + ' keys');
});

test('both languages have the same keys and the same placeholders', () => {
  const tr = I18N.dict.tr, en = I18N.dict.en;
  assert.deepEqual(Object.keys(tr).filter(k => !(k in en)), [], 'missing in English');
  assert.deepEqual(Object.keys(en).filter(k => !(k in tr)), [], 'missing in Turkish');
  const holes = s => Array.from(new Set((s.match(/\{(\w+)[}|]/g) || []).map(x => x.slice(1, -1)))).sort();
  const bad = Object.keys(tr).filter(k => JSON.stringify(holes(tr[k])) !== JSON.stringify(holes(en[k])));
  assert.deepEqual(bad, []);
});

test('interpolation and English plurals', () => {
  I18N.setLang('en');
  assert.equal(I18N.t('customer.policyCount', { n: 1 }), '1 policy');
  assert.equal(I18N.t('customer.policyCount', { n: 3 }), '3 policies');
  assert.equal(I18N.t('days.left', { n: 1 }), '1 day left');
  I18N.setLang('tr');
  assert.equal(I18N.t('customer.policyCount', { n: 3 }), '3 poliçe');
  assert.equal(I18N.t('no.such.key'), 'no.such.key');
});
