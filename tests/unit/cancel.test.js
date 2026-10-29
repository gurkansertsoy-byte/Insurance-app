'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('../../vendor/xlsx.full.min.js');
const U = require('../../js/core/util.js');
const Importer = require('../../js/core/importer.js');

U.setToday('2026-10-29');

function makeBook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
function analyse(sheets, fileName) {
  const name = fileName || 'portfoy.xlsx';
  const wb = Importer.readWorkbook(makeBook(sheets), XLSX, name);
  return Importer.analyzeWorkbook(wb, XLSX, { fileName: name });
}
const blank = (n) => Array(n).fill(null);
const BLOCK = ['ŞİRKET', 'POLİÇE', 'SİGORTALI AD SOYAD', 'KART', 'CARİ', 'NAKİT'];
// the main table of the sample page: 19 columns, A..S
const MAIN = ['Poliçe adı', 'Poliçe bitiş tarihi', 'İletişim', 'Meslek', 'Adı soyadı', 'Tc kimlik no', 'Plaka', 'Seri no', 'Basamak',
  'Poliçe numarası', 'Şirket poliçe tutarı', 'Yeni iş', 'Komisyon', 'Açıklama', 'Şirket', 'Sigortalı adı soyadı', 'Kart', 'Cari', 'Nakit'];
function mainRow(i) {
  return ['Trafik', '05.03.2027', '0532 111 22 ' + (10 + i), 'Öğretmen', 'Müşteri ' + i, '', '34 AB ' + (100 + i), '', 4,
    'AZ-' + (1000 + i), 10000 + i, 'EVET', 800, '', 'Allianz Sigorta', 'Müşteri ' + i, 10000 + i, null, null];
}

test('the İptal block at the end of the page (column U, after an empty column) is read on its own', () => {
  const rows = [MAIN.concat([null], BLOCK)];
  rows.push(mainRow(1).concat([null], ['ALLİANZ', 'TRAFİK', 'AHMET YILMAZ', 5200, null, null]));
  rows.push(mainRow(2).concat([null], ['Axa Sigorta', 'Kasko', 'Ayşe Kaya', null, '1.250,50', '300']));
  rows.push(mainRow(3).concat([null], blank(6))); // an empty, bordered template row of the block
  rows.push(blank(20).concat(['Sompo', 'DASK', 'Ali Veli', null, null, 450])); // a block row below the main table
  const s = analyse([{ name: 'EYLÜL 2026', rows }]).sheets[0];
  assert.equal(s.month.key, '2026-09');
  assert.deepEqual(s.cancelBlock && [s.cancelBlock.headerRow, s.cancelBlock.startCol, Importer.colLetter(s.cancelBlock.startCol)], [0, 20, 'U']);
  assert.equal(s.rows.length, 3, 'three policies; the block-only row is not a policy');
  assert.equal(s.columns.length, 19, 'block columns are not main columns');
  assert.ok(s.columns.every(c => c.col < 19));
  assert.equal(s.columns.filter(c => c.role === 'duplicate').length, 0, 'the block does not duplicate Şirket, Kart, Cari, Nakit');
  assert.equal(s.skipped.empty, 0, 'rows that only carry the block are not counted as empty');
  const built = Importer.buildRecords({ sheets: [s], date1904: false });
  assert.equal(built.records.length, 3);
  assert.equal(built.records[0].fields.company, 'Allianz Sigorta', 'the main table keeps its own Şirket column');
  assert.deepEqual(built.cancels.map(c => [c.row, c.month, c.company, c.policyText, c.insuredName, c.card, c.account, c.cash]), [
    [2, '2026-09', 'ALLİANZ', 'TRAFİK', 'Ahmet Yılmaz', 5200, null, null],
    [3, '2026-09', 'Axa Sigorta', 'Kasko', 'Ayşe Kaya', null, 1250.5, 300],
    [5, '2026-09', 'Sompo', 'DASK', 'Ali Veli', null, null, 450]
  ]);
});

test('the block can start at any column, with or without a gap, and its header may sit on another row', () => {
  const narrow = ['Poliçe adı', 'Adı soyadı', 'Poliçe numarası', 'Şirket poliçe tutarı'];
  // right after the main table (no gap)
  let s = analyse([{ name: 'Ekim 2026', rows: [narrow.concat(BLOCK), ['Kasko', 'Cem Kılıç', 'K-1', 25000, 'Neova', 'Kasko', 'Selin Ak', 900, null, null]] }]).sheets[0];
  assert.equal(Importer.colLetter(s.cancelBlock.startCol), 'E');
  assert.equal(s.rows.length, 1);
  assert.equal(Importer.buildRecords({ sheets: [s] }).cancels[0].insuredName, 'Selin Ak');
  // far to the right (column Z), header one row below the main header
  const rows = [narrow, blank(25).concat(BLOCK), ['Trafik', 'Ece Su', 'T-9', 7000]];
  rows.push(blank(25).concat(['HDI', 'Trafik', 'Kerem Ak', null, null, 1200]));
  s = analyse([{ name: 'Kasım 2026', rows }]).sheets[0];
  assert.deepEqual([s.headerRow, s.cancelBlock.headerRow, Importer.colLetter(s.cancelBlock.startCol)], [0, 1, 'Z']);
  assert.equal(s.rows.length, 1, 'the block header row is not a policy');
  assert.deepEqual(Importer.buildRecords({ sheets: [s] }).cancels.map(c => c.insuredName), ['Kerem Ak']);
});

test('what is not an İptal block: a main table ending in Şirket/Sigortalı/Kart/Cari/Nakit, or headers that continue to the right', () => {
  // the main table's own payment columns, no POLİÇE column among them
  let s = analyse([{ name: 'Ekim 2026', rows: [MAIN, mainRow(1)] }]).sheets[0];
  assert.equal(s.cancelBlock, null);
  assert.equal(s.columns.filter(c => ['company', 'insuredName', 'card', 'account', 'cash'].includes(c.field)).length, 5);
  // the six titles followed by more columns are part of the main table
  const head = ['Adı soyadı', 'Poliçe numarası'].concat(BLOCK, ['Açıklama']);
  s = analyse([{ name: 'Ekim 2026', rows: [head, ['Can Er', 'P-1', 'Axa', 'Trafik', 'Can Er', 100, null, null, 'not']] }]).sheets[0];
  assert.equal(s.cancelBlock, null);
});

test('inside the block: totals and repeated headers are skipped, Turkish amounts read, empty rows ignored', () => {
  const rows = [MAIN.concat([null], BLOCK)];
  rows.push(mainRow(1).concat([null], ['Mapfre', 'Konut', 'deniz yıldırım', '2.400,00 TL', null, null]));
  rows.push(mainRow(2).concat([null], blank(6)));
  rows.push(blank(20).concat(BLOCK));
  rows.push(blank(20).concat([null, null, 'TOPLAM', 2400, null, null]));
  const s = analyse([{ name: 'Haziran 2026', rows }]).sheets[0];
  const c = Importer.buildRecords({ sheets: [s] }).cancels;
  assert.deepEqual(c.map(x => [x.insuredName, x.card]), [['Deniz Yıldırım', 2400]]);
  assert.equal(s.skipped.cancelTotals, 1);
});

test('a page with only cancellations is still a month page; layout keeps the block position and the Yeni iş words', () => {
  const rows = [MAIN.concat([null], BLOCK), blank(20).concat(['Ray', 'Trafik', 'Oya Tan', null, null, 650])];
  let a = analyse([{ name: 'Mart 2026', rows }]);
  assert.equal(a.sheets[0].include, true);
  assert.equal(Importer.buildRecords(a).cancels.length, 1);
  const rows2 = [MAIN.concat([null], BLOCK), mainRow(1), mainRow(2)];
  rows2[2][11] = 'HAYIR';
  a = analyse([{ name: 'Nisan 2026', rows: rows2 }]);
  const layout = Importer.layoutOf(a.sheets[0]);
  assert.deepEqual(layout.block && [layout.block.startCol, layout.block.headerRow], [20, 0]);
  assert.deepEqual(layout.block.headers, BLOCK);
  assert.deepEqual(layout.yesNo, { yes: 'EVET', no: 'HAYIR' });
  assert.equal(layout.columns.length, 19);
  assert.deepEqual([layout.headerRow, layout.dataStart, layout.lastDataRow], [0, 1, 2]);
  const rec = Importer.buildRecords(a).records[0];
  assert.equal(rec.cells.length, 17, 'raw cells of the main table only, trailing empty cells dropped');
  assert.equal(rec.cells[16], 10001);
  assert.equal(rec.cells[0], 'Trafik');
});

// ---------------------------------------------------------------- matching cancellations to earlier policies
const P = require('../../js/core/portfolio.js');

function world(list) {
  const customers = new Map();
  const policies = list.map((x, i) => {
    if (!customers.has(x.c)) customers.set(x.c, { id: x.c, name: x.name || x.c });
    return Object.assign({ id: 'p' + (i + 1), customerId: x.c }, x.p);
  });
  return { customers, policies };
}
function match(w, cancels, opts) {
  const res = P.matchCancellations(cancels.map((c, i) => Object.assign({ id: 'x' + (i + 1), row: i + 2 }, c)), w.policies, w.customers, opts);
  return cancels.map((c, i) => res.get('x' + (i + 1)));
}

test('a cancellation finds the earlier policy by insured name, company and line of business', () => {
  const w = world([
    { c: 'ahmet', name: 'Ahmet Yılmaz', p: { month: '2026-03', policyType: 'Trafik Sigortası', company: 'Allianz Sigorta', endDate: '2027-03-10', premium: 9000, card: 9000 } },
    { c: 'ahmet', name: 'Ahmet Yılmaz', p: { month: '2026-03', policyType: 'Kasko', company: 'Allianz Sigorta', endDate: '2027-03-10', premium: 30000 } },
    { c: 'ayse', name: 'Ayşe Kaya', p: { month: '2026-01', policyType: 'Trafik', company: 'Axa', endDate: '2027-01-05', premium: 8000 } },
    { c: 'can', name: 'Can Er', p: { month: '2026-10', policyType: 'Trafik', company: 'Axa', endDate: '2027-10-05' } }
  ]);
  const r = match(w, [
    { month: '2026-09', company: 'ALLİANZ', policyText: 'TRAFİK', insuredName: 'Ahmet Yılmaz', card: 4100 },
    { month: '2026-09', company: '', policyText: 'trafik', insuredName: 'KAYA AYŞE' },               // name order, no company
    { month: '2026-09', company: 'Sompo', policyText: 'Kasko', insuredName: 'Ahmet Yılmaz' },         // wrong company
    { month: '2026-09', company: 'Allianz', policyText: 'DASK', insuredName: 'Ahmet Yılmaz' },        // no DASK policy
    { month: '2026-09', company: 'Axa', policyText: 'Trafik', insuredName: 'Can Er' }                 // his policy is from a later month
  ]);
  assert.deepEqual(r.map(x => [x.match, x.policyId]), [['auto', 'p1'], ['auto', 'p3'], ['none', null], ['none', null], ['none', null]]);
});

test('two equally good policies are left for the user; a finished policy or a full refund decides', () => {
  const w = world([
    { c: 'm', name: 'Murat Kurt', p: { month: '2026-02', policyType: 'Trafik', company: 'HDI', plate: '34 A 1', endDate: '2027-02-01', premium: 7000 } },
    { c: 'm', name: 'Murat Kurt', p: { month: '2026-05', policyType: 'Trafik', company: 'HDI', plate: '06 B 2', endDate: '2027-05-01', premium: 6500 } }
  ]);
  let r = match(w, [{ month: '2026-09', company: 'HDI', policyText: 'Trafik', insuredName: 'Murat Kurt' }]);
  assert.equal(r[0].match, 'ambiguous');
  assert.deepEqual(r[0].candidates.sort(), ['p1', 'p2']);
  // the refund equals one premium
  r = match(w, [{ month: '2026-09', company: 'HDI', policyText: 'Trafik', insuredName: 'Murat Kurt', cash: 6500 }]);
  assert.deepEqual([r[0].match, r[0].policyId], ['auto', 'p2']);
  // two cancellations take the two policies one each
  r = match(w, [{ month: '2026-09', company: 'HDI', policyText: 'Trafik', insuredName: 'Murat Kurt', cash: 7000 }, { month: '2026-09', company: 'HDI', policyText: 'Trafik', insuredName: 'Murat Kurt', cash: 1500 }]);
  assert.deepEqual(r.map(x => x.policyId), ['p1', 'p2']);
  // a policy that ended before the cancellation month loses to the running one
  const w2 = world([
    { c: 'm', name: 'Murat Kurt', p: { month: '2025-10', policyType: 'Trafik', company: 'HDI', endDate: '2026-10-05' } },
    { c: 'm', name: 'Murat Kurt', p: { month: '2026-10', policyType: 'Trafik', company: 'HDI', endDate: '2027-10-05' } }
  ]);
  r = match(w2, [{ month: '2026-10', company: 'HDI', policyText: 'Trafik', insuredName: 'Murat Kurt' }]);
  assert.deepEqual([r[0].match, r[0].policyId], ['auto', 'p2'], 'same-month cancellation of the new policy, not the one that just ended');
  // policies already cancelled are not offered again
  r = match(w, [{ month: '2026-09', company: 'HDI', policyText: 'Trafik', insuredName: 'Murat Kurt' }], { taken: ['p1'] });
  assert.deepEqual([r[0].match, r[0].policyId], ['auto', 'p2']);
});

test('a policy number in the POLİÇE column decides; the insured family member of a health policy is found', () => {
  const w = world([
    { c: 'k', name: 'Kemal Aydoğdu', p: { month: '2026-06', policyType: 'Tamamlayıcı Sağlık', company: 'Türkiye Sigorta', insuredName: 'Elif Aydoğdu', policyNo: 'TS-20250133714', endDate: '2027-06-17' } },
    { c: 'k', name: 'Kemal Aydoğdu', p: { month: '2026-06', policyType: 'Trafik', company: 'Türkiye Sigorta', policyNo: 'TS-2025 0133999', endDate: '2027-06-17' } }
  ]);
  const r = match(w, [
    { month: '2026-09', company: 'TÜRKİYE SİGORTA', policyText: 'TSS', insuredName: 'ELİF AYDOĞDU' },
    { month: '2026-09', company: '', policyText: 'TS-20250133999', insuredName: 'K. Aydoğdu' }
  ]);
  assert.deepEqual(r.map(x => [x.match, x.policyId]), [['auto', 'p1'], ['auto', 'p2']]);
});

test('cancelled policies leave renewals and retention, a cancelled renewal reopens the old policy, refunds to Cari lower the balance', () => {
  const ps = [
    { id: 'a', customerId: 'c', month: '2025-10', policyType: 'Trafik', endDate: '2026-10-10', startDate: '2025-10-10' },
    { id: 'b', customerId: 'c', month: '2026-10', policyType: 'Trafik', endDate: '2027-10-08', startDate: '2026-10-08' },
    { id: 'd', customerId: 'c', month: '2026-01', policyType: 'Kasko', endDate: '2026-11-15', account: 20000, payments: [{ amount: 5000 }] }
  ];
  let info = P.renewalInfo(ps, { today: '2026-10-29' });
  assert.deepEqual(['a', 'b', 'd'].map(id => info.get(id).state), ['renewed', 'active', 'due']);
  const cancelled = new Map([['b', { id: 'x1' }], ['d', { id: 'x2' }]]);
  info = P.renewalInfo(ps, { today: '2026-10-29', cancelled });
  assert.deepEqual(['a', 'b', 'd'].map(id => info.get(id).state), ['expired', 'cancelled', 'cancelled']);
  assert.equal(P.retention(ps, info, '2026-01-01', '2026-10-28', '2026-10-29').base, 1, 'cancelled policies are not counted');
  assert.equal(P.outstanding(ps[2]), 15000);
  assert.equal(P.outstanding(ps[2], 12000), 3000, '20 000 on Cari, 12 000 refunded to Cari, 5 000 paid');
  assert.equal(P.outstanding(ps[2], 30000), -5000, 'a refund larger than the Cari part clears it; what was paid is owed back');
  assert.equal(P.cancelKey({ month: '2026-09', company: 'ALLİANZ', policyText: 'TRAFİK', insuredName: 'Ahmet Yılmaz', card: 4100 }),
    P.cancelKey({ month: '2026-09', company: 'Allianz Sigorta', policyText: 'Trafik', insuredName: 'AHMET YILMAZ', card: 4100.0 }), 'same row read twice');
});

test('sample workbook: every page has its İptal block and every cancellation finds the policy it cancels', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.join(__dirname, '..', '..');
  const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'sample-data', 'expected.json'), 'utf8'));
  const bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'sample-data', 'ornek-portfoy.xlsx')));
  const a = Importer.analyzeWorkbook(Importer.readWorkbook(bytes, XLSX, 'ornek-portfoy.xlsx'), XLSX, { fileName: 'ornek-portfoy.xlsx' });
  assert.ok(a.sheets.every(s => s.cancelBlock), 'block found on all pages');
  assert.deepEqual(a.sheets.map(s => Importer.colLetter(s.cancelBlock.startCol)).filter(c => c === 'U').length, 6, 'the pages laid out like the agency sample start it at U');
  const built = Importer.buildRecords(a, {});
  assert.equal(built.records.length, expected.totalPolicies, 'no İptal row became a policy');
  assert.equal(built.cancels.length, expected.cancellations.total);
  const state = { customers: new Map(), policies: new Map() };
  P.importRecords(state, built.records, { fileName: 'ornek-portfoy.xlsx' });
  const cancels = built.cancels.map((c, i) => Object.assign({ id: 'x' + i }, c));
  const res = P.matchCancellations(cancels, Array.from(state.policies.values()), state.customers);
  const got = cancels.map(c => { const r = res.get(c.id); return [c.month, U.fold(c.insuredName), r.match, r.policyId ? state.policies.get(r.policyId).policyNo : null]; });
  const want = expected.cancellations.list.map(e => [e.month, U.fold(e.insured), e.expect, e.policyNo]);
  const key = (x) => x.join('|');
  assert.deepEqual(got.map(key).sort(), want.map(key).sort());
});
