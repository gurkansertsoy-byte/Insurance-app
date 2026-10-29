'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../../vendor/xlsx.full.min.js');
const U = require('../../js/core/util.js');
const Schema = require('../../js/core/schema.js');
const Importer = require('../../js/core/importer.js');
const P = require('../../js/core/portfolio.js');
const Exporter = require('../../js/core/exporter.js');

U.setToday('2026-10-29');
const ROOT = path.join(__dirname, '..', '..');
const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'sample-data', 'expected.json'), 'utf8'));
const sampleBytes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'sample-data', 'ornek-portfoy.xlsx')));

function analyse(bytes, fileName, opts) {
  const wb = Importer.readWorkbook(bytes, XLSX, fileName);
  return Importer.analyzeWorkbook(wb, XLSX, Object.assign({ fileName }, opts || {}));
}

function importInto(state, analysis, fileName) {
  const built = Importer.buildRecords(analysis, {});
  return P.importRecords(state, built.records, { fileName });
}

/** Builds an .xlsx (or other bookType) in memory from arrays of rows; Date objects become real date cells. */
function makeBook(sheets, bookType) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    // dates become serial numbers formatted dd.mm.yyyy, exactly as Turkish Excel saves them
    const dates = [];
    const rows = s.rows.map((row, r) => row.map((v, c) => {
      if (!(v instanceof Date)) return v;
      dates.push([r, c]);
      return Math.floor((v.getTime() - Date.UTC(1899, 11, 30)) / 864e5);
    }));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    for (const [r, c] of dates) ws[XLSX.utils.encode_cell({ r, c })].z = 'dd.mm.yyyy';
    if (s.merges) ws['!merges'] = s.merges;
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  if (sheets.some(s => s.hidden)) wb.Workbook = { Sheets: sheets.map(s => ({ name: s.name, Hidden: s.hidden ? 1 : 0 })) };
  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: bookType || 'xlsx' }));
}

const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day, 12));

// ---------------------------------------------------------------- header recognition
test('every column title the agency listed is recognised', () => {
  const titles = {
    'Poliçe adı': 'policyType', 'Poliçe bitiş tarihi': 'endDate', 'Iletişim': 'phone', 'İletişim': 'phone', 'Meslek': 'profession',
    'Adi soyadi': 'name', 'Adı soyadı': 'name', 'Police bitis tarihi': 'endDate', 'Tc kimlik no': 'tc', 'plaka': 'plate', 'seri no': 'serialNo',
    'Basamak': 'step', 'Police numarasi': 'policyNo', 'Sirket police tutari': 'premium', 'Yeni is': 'newBusiness', 'Komisyon': 'commission',
    'Aciklama': 'note', 'Sirket': 'company', 'Sigortali adi soyadi': 'insuredName', 'Kart': 'card', 'Cari': 'account', 'Nakit': 'cash'
  };
  for (const [title, field] of Object.entries(titles)) {
    assert.equal(Schema.matchHeader(title), field, title);
    assert.equal(Schema.matchHeader(U.trUpper(title)), field, 'upper: ' + title);
  }
});

test('other common header spellings are recognised', () => {
  const titles = {
    'Branş': 'policyType', 'Sigorta Şirketi': 'company', 'Poliçe No': 'policyNo', 'Vade Sonu': 'endDate', 'Müşteri Adı Soyadı': 'name',
    'TCKN': 'tc', 'T.C. Kimlik No': 'tc', 'Vergi No': 'tc', 'Telefon': 'phone', 'Cep Tel': 'phone', 'Ruhsat Seri No': 'serialNo', 'Brüt Prim': 'premium',
    'Net Prim': 'netPremium', 'Komisyon Tutarı': 'commission', 'Kredi Kartı': 'card', 'Sigortalı': 'insuredName', 'E-posta': 'email',
    'Başlangıç Tarihi': 'startDate', 'Tanzim Tarihi': 'issueDate', 'Doğum Tarihi': 'birthDate', 'Sigorta Ettiren': 'name', 'Notlar': 'note',
    'Plaka No': 'plate', 'Hasarsızlık Basamağı': 'step', 'Temsilci': 'agent', 'Poliçe Başlangıç Tarihi': 'startDate', 'Ünvanı': 'name'
  };
  for (const [title, field] of Object.entries(titles)) assert.equal(Schema.matchHeader(title), field, title);
  assert.equal(Schema.matchHeader('Marka'), null, 'unknown columns are kept as custom');
  assert.equal(Schema.matchHeader('Model Yılı'), null);
  assert.equal(Schema.matchHeader('Adı'), '_first');
  assert.equal(Schema.matchHeader('Soyadı'), '_last');
});

test('policy names map to lines of business', () => {
  const cases = { 'Zorunlu Trafik': 'trafik', 'TRAFİK SİGORTASI': 'trafik', 'Genişletilmiş Kasko': 'kasko', 'DASK': 'dask', 'Zorunlu Deprem': 'dask',
    'Konut Paket': 'konut', 'Tamamlayıcı Sağlık': 'saglik', 'TSS': 'saglik', 'Seyahat Sağlık': 'seyahat', 'Ferdi Kaza': 'ferdi',
    'İşyeri Paket': 'isyeri', 'İMM': 'imm', 'İhtiyari Mali Mesuliyet': 'imm', 'Hayat': 'hayat', 'Nakliyat': 'nakliyat', 'Bilinmeyen Ürün': 'diger' };
  for (const [name, cat] of Object.entries(cases)) assert.equal(Schema.categoryOf(name), cat, name);
});

// ---------------------------------------------------------------- the sample workbook
test('sample workbook: every sheet gets the right month, header row and row count', () => {
  const a = analyse(sampleBytes, 'ornek-portfoy.xlsx');
  assert.equal(a.sheets.length, 13);
  for (const s of a.sheets) {
    assert.equal(s.month.key, expected.sheetMonths[s.name], s.name);
    assert.equal(s.include, true, s.name);
    assert.equal(s.rows.length, expected.months[s.month.key].count, 'rows in ' + s.name);
  }
  const kasim = a.sheets.find(s => s.name === 'KASIM 2025');
  assert.equal(kasim.headerRow, 3, 'header below the title rows');
  const mart = a.sheets.find(s => s.name === 'MART');
  assert.equal(mart.month.source, 'sheet+data', 'year of MART taken from the dates');
  const ocak = a.sheets.find(s => s.name === 'OCAK 2026');
  assert.equal(ocak.skipped.totals, 1, 'TOPLAM row skipped');
  const aralik = a.sheets.find(s => s.name === 'Aralık 2025');
  assert.deepEqual(aralik.columns.filter(c => c.role === 'duplicate').map(c => c.header), ['Police bitis tarihi', 'Meslek']);
  const subat = a.sheets.find(s => s.name === 'ŞUBAT 2026');
  assert.deepEqual(subat.columns.filter(c => c.role === 'custom').map(c => c.header), ['MARKA', 'MODEL YILI']);
});

test('sample workbook: totals per month, customers and identities match the ground truth', () => {
  const state = { customers: new Map(), policies: new Map() };
  const res = importInto(state, analyse(sampleBytes, 'ornek-portfoy.xlsx'), 'ornek-portfoy.xlsx');
  assert.equal(state.policies.size, expected.totalPolicies);
  assert.equal(state.customers.size, expected.totalCustomers);
  const rows = P.aggregate(Array.from(state.policies.values()), p => p.month, true);
  for (const r of rows) {
    const e = expected.months[r.key];
    assert.equal(r.count, e.count, r.key + ' count');
    assert.equal(r.premium, e.premium, r.key + ' premium');
    assert.equal(r.commission, e.commission, r.key + ' commission');
    assert.equal(r.newCount, e.newBusiness, r.key + ' new business');
    assert.equal(r.card, e.card, r.key + ' card');
    assert.equal(r.account, e.account, r.key + ' account');
    assert.equal(r.cash, e.cash, r.key + ' cash');
  }
  const customers = Array.from(state.customers.values());
  for (const name of expected.homonyms) {
    const same = customers.filter(c => c.name === name);
    assert.equal(same.length, 2, 'two different people called ' + name);
    assert.notEqual(same[0].tc, same[1].tc);
  }
  const show = customers.find(c => c.name === expected.showcase.name);
  const sp = Array.from(state.policies.values()).filter(p => p.customerId === show.id);
  assert.equal(sp.length, expected.showcase.policyCount);
  assert.deepEqual([...new Set(sp.map(p => p.month))].sort(), expected.showcase.months);
  assert.equal(U.round2(U.sum(sp, p => p.premium)), expected.showcase.premium);
  assert.equal(res.issues.filter(i => i.type === 'badId').length, expected.brokenTcRows);
  const all = Array.from(state.policies.values());
  const multi = customers.filter(c => new Set(all.filter(p => p.customerId === c.id).map(p => p.month)).size > 1);
  assert.equal(multi.length, expected.multiMonthCustomers);
  // every customer keeps the valid TC even when one row had a typo
  assert.ok(customers.every(c => !c.tc || U.idKind(c.tc) !== 'invalid'), 'no invalid TC left on a customer');
});

test('sample workbook: importing the same file again changes nothing', () => {
  const state = { customers: new Map(), policies: new Map() };
  importInto(state, analyse(sampleBytes, 'ornek-portfoy.xlsx'), 'a.xlsx');
  const second = importInto(state, analyse(sampleBytes, 'ornek-portfoy.xlsx'), 'a.xlsx');
  assert.equal(second.added.length, 0);
  assert.equal(second.updated.length, 0);
  assert.equal(second.unchanged, expected.totalPolicies);
  assert.equal(second.customersAdded.length, 0);
  assert.equal(state.policies.size, expected.totalPolicies);
});

test('sample workbook: renewals and retention', () => {
  const state = { customers: new Map(), policies: new Map() };
  importInto(state, analyse(sampleBytes, 'ornek-portfoy.xlsx'), 'a.xlsx');
  const info = P.renewalInfo(Array.from(state.policies.values()), { today: '2026-10-29', windowDays: 30 });
  const counts = {};
  info.forEach(v => { counts[v.state] = (counts[v.state] || 0) + 1; });
  assert.equal(counts.renewed, expected.renewalsInFile);
  assert.equal(counts.due, expected.dueIn30Days);
  assert.equal(counts.short, expected.byKind.seyahat);
});

// ---------------------------------------------------------------- awkward layouts
test('title rows, a merged "ÖDEME" header over Kart/Cari/Nakit and the month in the title', () => {
  const bytes = makeBook([{
    name: 'Sayfa1',
    rows: [
      ['ACENTE ÜRETİM RAPORU - NİSAN 2026'],
      [],
      ['Poliçe adı', 'Adı soyadı', 'TC', 'Bitiş', 'Prim', 'ÖDEME', null, null],
      [null, null, null, null, null, 'Kart', 'Cari', 'Nakit'],
      ['Trafik', 'ALİ VELİ', '10000000146', d(2027, 4, 10), 9500, 9500, null, null],
      ['Kasko', 'Ayşe Demir', '', d(2027, 4, 20), '25.000,00', null, '25.000,00', null]
    ],
    merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, { s: { r: 2, c: 5 }, e: { r: 2, c: 7 } }]
  }]);
  const a = analyse(bytes, 'rapor.xlsx');
  const s = a.sheets[0];
  assert.equal(s.headerRow, 2);
  assert.equal(s.dataStart, 4);
  assert.equal(s.month.key, '2026-04');
  assert.equal(s.month.source, 'title');
  assert.deepEqual(s.columns.map(c => c.field), ['policyType', 'name', 'tc', 'endDate', 'premium', 'card', 'account', 'cash']);
  const recs = Importer.buildRecords(a).records;
  assert.equal(recs.length, 2);
  assert.equal(recs[0].fields.name, 'Ali Veli');
  assert.equal(recs[0].fields.endDate, '2027-04-10');
  assert.equal(recs[1].fields.account, 25000);
});

test('separate first and last name columns, unknown columns and unreadable values', () => {
  const bytes = makeBook([{
    name: 'Mayıs 2026',
    rows: [
      ['Adı', 'Soyadı', 'Poliçe Türü', 'Vade Sonu', 'Tutar', 'Marka', 'Not'],
      ['Mehmet', 'Kaya', 'DASK', '15.05.2027', '1.250,00', 'Fiat', 'ok'],
      ['Zeynep', 'Arslan', 'Konut', 'belirsiz', 'yok', 'Ford', '']
    ]
  }]);
  const a = analyse(bytes, 'x.xlsx');
  const recs = Importer.buildRecords(a).records;
  assert.equal(recs[0].fields.name, 'Mehmet Kaya');
  assert.equal(recs[0].fields.premium, 1250);
  assert.equal(recs[0].extras.Marka, 'Fiat');
  assert.deepEqual(recs[1].issues.map(i => i.type).sort(), ['badDate', 'badNumber']);
  assert.equal(recs[1].extras['Vade Sonu'], 'belirsiz', 'unreadable value kept');
});

test('month from start dates when the sheet name has none; summary sheets are skipped', () => {
  const bytes = makeBook([
    { name: 'Sayfa1', rows: [['Poliçe adı', 'Adı soyadı', 'Başlangıç tarihi', 'Poliçe bitiş tarihi'], ['Trafik', 'Can Ak', d(2026, 6, 3), d(2027, 6, 3)], ['Kasko', 'Su Ak', d(2026, 6, 9), d(2027, 6, 9)]] },
    { name: 'Özet', rows: [['Ay', 'Prim', 'Komisyon'], ['Haziran', 1000, 100]] },
    { name: 'Gizli', rows: [['Poliçe adı', 'Adı soyadı'], ['Trafik', 'Gül Su']], hidden: true },
    { name: 'Boş liste', rows: [['Poliçe adı', 'Adı soyadı']] }
  ]);
  const a = analyse(bytes, 'karisik.xlsx');
  const [s1, ozet, gizli, bos] = a.sheets;
  assert.equal(s1.month.key, '2026-06');
  assert.equal(s1.month.source, 'data');
  assert.equal(s1.include, true);
  assert.equal(ozet.include, false);
  assert.ok(ozet.warnings.includes('notPolicySheet'));
  assert.equal(gizli.include, false, 'hidden sheets are off by default');
  assert.equal(bos.include, false, 'empty list');
});

test('a sheet with no month anywhere asks for one', () => {
  const bytes = makeBook([{ name: 'Liste', rows: [['Poliçe adı', 'Adı soyadı', 'Plaka'], ['Trafik', 'Ali Ak', '34abc12']] }]);
  const a = analyse(bytes, 'liste.xlsx');
  assert.equal(a.sheets[0].month.key, '');
  assert.ok(a.sheets[0].warnings.includes('noMonth'));
  assert.equal(Importer.buildRecords(a).records.length, 0, 'nothing is imported without a month');
  a.sheets[0].month = { key: '2026-02', source: 'manual' };
  const recs = Importer.buildRecords(a).records;
  assert.equal(recs.length, 1);
  assert.equal(recs[0].fields.plate, '34 ABC 12');
});

test('CSV with semicolons, Turkish numbers and the month in the file name', () => {
  const csv = 'Poliçe adı;Poliçe bitiş tarihi;Adı soyadı;Tc kimlik no;Şirket poliçe tutarı;Komisyon\n' +
    'Trafik;15.03.2027;Ayşe Yılmaz;10000000146;12.345,50;987,65\nKasko;01.04.2027;ŞÜKRÜ ÇELİK;;45.000,00;6.750,00\n';
  const a = analyse(new TextEncoder().encode(csv), 'Mart 2026.csv');
  const s = a.sheets[0];
  assert.equal(s.name, 'Mart 2026');
  assert.equal(s.month.key, '2026-03');
  const recs = Importer.buildRecords(a).records;
  assert.equal(recs.length, 2);
  assert.equal(recs[0].fields.premium, 12345.5);
  assert.equal(recs[0].fields.tc, '10000000146');
  assert.equal(recs[1].fields.name, 'Şükrü Çelik');
});

test('CSV saved by older Turkish Excel (Windows-1254)', () => {
  // "Adı soyadı;Poliçe adı\nŞükrü Işık;Trafik" in Windows-1254
  const text = 'Adı soyadı;Poliçe adı;Bitiş\nŞükrü Işık;Trafik;01.02.2027\n';
  const map = { 'ı': 0xFD, 'ç': 0xE7, 'Ş': 0xDE, 'ü': 0xFC, 'I': 0x49, 'ş': 0xFE, 'İ': 0xDD, 'ğ': 0xF0 };
  const bytes = new Uint8Array([...text].map(ch => map[ch] || ch.charCodeAt(0)));
  const a = analyse(bytes, 'Şubat 2026.csv');
  const recs = Importer.buildRecords(a).records;
  assert.equal(a.sheets[0].month.key, '2026-02');
  assert.equal(recs[0].fields.name, 'Şükrü Işık');
  assert.equal(recs[0].fields.policyType, 'Trafik');
});

test('old binary .xls files are read', () => {
  const bytes = makeBook([{ name: 'OCAK 2026', rows: [['Poliçe adı', 'Adı soyadı', 'Poliçe bitiş tarihi', 'Şirket poliçe tutarı'], ['Trafik', 'Ali Ak', d(2027, 1, 5), 8000]] }], 'biff8');
  const a = analyse(bytes, 'eski.xls');
  const recs = Importer.buildRecords(a).records;
  assert.equal(a.sheets[0].month.key, '2026-01');
  assert.equal(recs[0].fields.endDate, '2027-01-05');
  assert.equal(recs[0].fields.premium, 8000);
});

// ---------------------------------------------------------------- merging rules
function rec(month, fields, extras) { return { sheet: 's', row: 1, month, fields: Object.assign({}, fields), extras: extras || {}, issues: [] }; }

test('customers are matched by TC, then by name with phone or plate', () => {
  const state = { customers: new Map(), policies: new Map() };
  P.importRecords(state, [
    rec('2026-01', { name: 'Ali Kaya', tc: '10000000146', phone: '5321112233', policyType: 'Trafik', plate: '34 AB 1234', policyNo: 'A1' }),
    rec('2026-02', { name: 'ALİ KAYA', policyType: 'Kasko', phone: '5321112233', policyNo: 'A2' }),
    rec('2026-03', { name: 'Ali Kaya', policyType: 'İMM', plate: '34 AB 1234', policyNo: 'A3' }),
    rec('2026-04', { name: 'Başka İsim', tc: '10000000146', policyType: 'DASK', policyNo: 'A4' })
  ]);
  assert.equal(state.customers.size, 1, 'all four rows are the same person');
  const c = Array.from(state.customers.values())[0];
  assert.equal(c.name, 'Ali Kaya');
});

test('a different valid TC under the same name is a different person', () => {
  const state = { customers: new Map(), policies: new Map() };
  const r = P.importRecords(state, [
    rec('2026-01', { name: 'Mehmet Yılmaz', tc: '10000000146', policyType: 'Trafik', policyNo: 'B1' }),
    rec('2026-01', { name: 'Mehmet Yılmaz', tc: '15458597958', policyType: 'Trafik', policyNo: 'B2' })
  ]);
  assert.equal(state.customers.size, 2);
  assert.equal(r.customersAdded.length, 2);
});

test('a row without TC joins the name-only customer and fills its TC later', () => {
  const state = { customers: new Map(), policies: new Map() };
  P.importRecords(state, [
    rec('2026-01', { name: 'Gül Ak', phone: '5324445566', policyType: 'DASK', policyNo: 'C1' }),
    rec('2026-02', { name: 'Gül Ak', tc: '10000000146', phone: '5324445566', policyType: 'Konut', policyNo: 'C2' })
  ]);
  assert.equal(state.customers.size, 1);
  assert.equal(Array.from(state.customers.values())[0].tc, '10000000146');
});

test('re-import updates changed rows, keeps endorsements and flags rows written twice', () => {
  const state = { customers: new Map(), policies: new Map() };
  const base = { name: 'Can Su', tc: '10000000146', policyType: 'Kasko', policyNo: 'K-1', premium: 1000 };
  P.importRecords(state, [rec('2026-05', base)]);
  const r2 = P.importRecords(state, [rec('2026-05', Object.assign({}, base, { premium: 1200 }))]);
  assert.equal(r2.updated.length, 1);
  assert.equal(Array.from(state.policies.values())[0].premium, 1200);
  const r3 = P.importRecords(state, [rec('2026-05', Object.assign({}, base, { premium: 1200 })), rec('2026-05', Object.assign({}, base, { premium: 150, note: 'zeyil' }))]);
  assert.equal(r3.unchanged, 1);
  assert.equal(r3.added.length, 1, 'an endorsement with the same policy number is kept');
  const r4 = P.importRecords({ customers: new Map(), policies: new Map() }, [rec('2026-05', base), rec('2026-05', base)]);
  assert.equal(r4.duplicateRows, 1);
});

test('renewal states, retention, opportunities and balances', () => {
  const c = { id: 'c1', name: 'Test' };
  const pol = [
    { id: 'p1', customerId: 'c1', month: '2025-11', policyType: 'Trafik', plate: '34 X 1', endDate: '2026-11-10' },
    { id: 'p2', customerId: 'c1', month: '2026-11', policyType: 'Zorunlu Trafik', plate: '34X1', startDate: '2026-11-10', endDate: '2027-11-10' },
    { id: 'p3', customerId: 'c1', month: '2025-10', policyType: 'Kasko', plate: '06 Y 2', endDate: '2026-10-01' },
    { id: 'p4', customerId: 'c1', month: '2026-05', policyType: 'DASK', endDate: '2027-05-01', account: 1000, payments: [{ amount: 400 }] },
    { id: 'p5', customerId: 'c1', month: '2026-09', policyType: 'Seyahat Sağlık', endDate: '2026-10-20' },
    { id: 'p6', customerId: 'c1', month: '2025-10', policyType: 'Konut', endDate: '2026-10-05', renewal: { status: 'lost' } },
    { id: 'p7', customerId: 'c1', month: '2025-11', policyType: 'Ferdi Kaza', endDate: '2026-11-15' }
  ];
  const info = P.renewalInfo(pol, { today: '2026-10-29', windowDays: 30 });
  assert.equal(info.get('p1').state, 'renewed');
  assert.equal(info.get('p1').successorId, 'p2');
  assert.equal(info.get('p2').state, 'active');
  assert.equal(info.get('p3').state, 'expired');
  assert.equal(info.get('p4').state, 'active');
  assert.equal(info.get('p5').state, 'short');
  assert.equal(info.get('p6').state, 'lost');
  assert.equal(info.get('p7').state, 'due');
  assert.equal(info.get('p7').daysLeft, 17);
  const ret = P.retention(pol, info, '2025-10-29', '2026-10-29', '2026-10-29');
  assert.deepEqual([ret.base, ret.renewed], [2, 0], 'p3 expired and p6 lost in the window');
  const opp = P.opportunities(c, pol, '2026-10-29').map(o => o.type + (o.plate ? ':' + o.plate : '')).sort();
  assert.deepEqual(opp, ['kasko:34 X 1', 'trafik:06 Y 2'], 'konut and DASK both exist');
  assert.equal(P.outstanding(pol[3]), 600);
  assert.equal(P.outstanding(pol[0]), 0);
});

test('duplicate customer groups', () => {
  const groups = P.duplicateGroups([
    { id: 'a', name: 'Ali Ak', tc: '10000000146', phone: '5321' },
    { id: 'b', name: 'ALİ AK', tc: '', phone: '5329' },
    { id: 'c', name: 'Veli Su', tc: '10000000146' },
    { id: 'd', name: 'Ayşe Kaya', tc: '67985153992' },
    { id: 'e', name: 'Ayşe Kaya', tc: '15458597958' }
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].customers.map(c => c.id), ['a', 'b']);
});

// ---------------------------------------------------------------- export
test('export writes each month in its original column order and re-imports identically', () => {
  const state = { customers: new Map(), policies: new Map() };
  const a = analyse(sampleBytes, 'ornek-portfoy.xlsx');
  importInto(state, a, 'ornek-portfoy.xlsx');
  const monthsMeta = {};
  a.sheets.forEach(s => { monthsMeta[s.month.key] = { sheet: s.name, columns: s.columns.map(c => ({ header: c.header, field: c.role === 'custom' ? null : c.field })) }; });
  const cancels = Importer.buildRecords(a, {}).cancels;
  const wb = Exporter.portfolioWorkbook({ XLSX, policies: Array.from(state.policies.values()), customers: state.customers, monthsMeta, lang: 'tr', withSummary: true, withCustomers: true, cancels });
  assert.equal(wb.SheetNames.length, 15);
  assert.equal(wb.SheetNames[0], 'Özet');
  assert.equal(wb.SheetNames[14], 'Müşteriler');
  const mart = XLSX.utils.sheet_to_json(wb.Sheets['Mart 2026'], { header: 1 })[0];
  const martCols = a.sheets.find(s => s.name === 'MART').columns.map(c => c.header);
  assert.deepEqual(mart.slice(0, martCols.length), martCols, 'same headers in the same order');
  assert.equal(mart[martCols.length], undefined, 'one empty column');
  assert.deepEqual(mart.slice(martCols.length + 1), Exporter.BLOCK_HEADERS, 'then the İptal block');
  const subat = wb.Sheets['Şubat 2026'];
  const subatHead = XLSX.utils.sheet_to_json(subat, { header: 1 })[0];
  assert.ok(subatHead.includes('MARKA') && subatHead.includes('MODEL YILI'), 'custom columns written back');
  const out = new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  const state2 = { customers: new Map(), policies: new Map() };
  const a2 = analyse(out, 'export.xlsx');
  assert.equal(a2.sheets.filter(s => s.include).length, 13, 'summary and customer sheets are not imported');
  importInto(state2, a2, 'export.xlsx');
  const t1 = P.totals(Array.from(state.policies.values())), t2 = P.totals(Array.from(state2.policies.values()));
  assert.deepEqual([t2.count, t2.premium, t2.commission, t2.newCount, state2.customers.size], [t1.count, t1.premium, t1.commission, t1.newCount, state.customers.size]);
  const again = Importer.buildRecords(a2, {}).cancels;
  assert.deepEqual(again.map(P.cancelKey).sort(), cancels.map(P.cancelKey).sort(), 'every İptal row comes back');
  const dateCell = Object.values(wb.Sheets['Ekim 2026']).find(c => c && c.z && XLSX.SSF.is_date(c.z));
  assert.ok(dateCell && dateCell.t === 'n', 'dates are real Excel dates');
  assert.equal(XLSX.SSF.format(dateCell.z, 46000), '09.12.2025', 'shown as dd.mm.yyyy');
});
