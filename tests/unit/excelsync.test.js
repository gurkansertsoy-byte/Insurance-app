'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../../vendor/xlsx.full.min.js');
const ExcelJS = require('../../vendor/exceljs.min.js');
const U = require('../../js/core/util.js');
const Importer = require('../../js/core/importer.js');
const P = require('../../js/core/portfolio.js');
const Sync = require('../../js/core/excelsync.js');

U.setToday('2026-10-29');
const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = fs.readFileSync(path.join(ROOT, 'sample-data', 'ornek-portfoy.xlsx'));
const T0 = Date.UTC(2026, 9, 29, 7);

/** Imports a workbook the way the app does and links it: { a, state, cancels, link, buf }. */
function linkedTo(buf, fileName) {
  const a = Importer.analyzeWorkbook(Importer.readWorkbook(new Uint8Array(buf), XLSX, fileName), XLSX, { fileName });
  const built = Importer.buildRecords(a, {});
  const state = { customers: new Map(), policies: new Map() };
  const res = P.importRecords(state, built.records, { fileName, now: T0 });
  const cancels = built.cancels.map((c, i) => Object.assign({ id: 'x' + i, createdAt: T0, updatedAt: T0, source: { sheet: c.sheet, row: c.row } }, c));
  const found = P.matchCancellations(cancels, Array.from(state.policies.values()), state.customers);
  cancels.forEach(x => { x.policyId = found.get(x.id).policyId; });
  const link = Sync.createLink({
    sheets: a.sheets.filter(s => s.include && s.month.key).map(s => ({ name: s.name, month: s.month.key, layout: Importer.layoutOf(s) })),
    placed: res.placed, cancelsPlaced: cancels.map(x => ({ sheet: x.sheet, row: x.row, id: x.id })),
    policies: state.policies, customers: state.customers, cancels: new Map(cancels.map(x => [x.id, x]))
  });
  return { a, state, cancels, link, buf };
}
const linked = () => linkedTo(SAMPLE, 'ornek-portfoy.xlsx');
const rowOf = (st, p) => st.link.sheets[Object.keys(st.link.sheets).find(n => st.link.sheets[n].rows[p.id])].rows[p.id][0];

/** One save: plan, write into the workbook, read the result back. st.link becomes the new link. */
async function save(st, mutate) {
  if (mutate) mutate(st);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(st.buf);
  const plan = Sync.buildPlan({ link: st.link, policies: Array.from(st.state.policies.values()), customers: st.state.customers, cancels: st.cancels });
  const link = Sync.apply(wb, plan);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf);
  const before = st.link;
  st.link = link;
  st.buf = buf;
  return { before, link, buf, plan, xlsx: XLSX.read(buf, { type: 'buffer', cellNF: true }), exceljs: back };
}
// an empty text cell and an empty cell look the same in Excel
const rowsOf = (book, name) => {
  const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }).map(r => {
    const out = r.map(v => v === '' ? null : v);
    while (out.length && out[out.length - 1] == null) out.pop();
    return out;
  });
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return rows;
};
const ORIGINAL = XLSX.read(SAMPLE, { type: 'buffer', cellNF: true });
const colOf = (st, sheet, header) => st.link.sheets[sheet].layout.columns.find(c => c.header === header).col;
const policies = (st, month) => Array.from(st.state.policies.values()).filter(p => p.month === month).sort((a, b) => rowOf(st, a) - rowOf(st, b));

test('the link knows the row of every policy and İptal row; nothing changed means nothing to write', async () => {
  const st = linked();
  assert.equal(Object.values(st.link.sheets).reduce((n, s) => n + Object.keys(s.rows).length, 0), st.state.policies.size);
  assert.equal(Object.values(st.link.sheets).reduce((n, s) => n + Object.keys(s.cancels).length, 0), st.cancels.length);
  const p = policies(st, '2026-07')[12];
  assert.equal(rowOf(st, p), p.source.row);
  const out = await save(st);
  assert.equal(out.plan.changes, 0);
  for (const name of ORIGINAL.SheetNames) assert.deepEqual(rowsOf(out.xlsx, name), rowsOf(ORIGINAL, name), name);
  const ws = out.exceljs.getWorksheet('EYLÜL 2026');
  assert.equal(ws.getCell('W1').fill.fgColor.argb.slice(-6), 'FFFF00', 'yellow İptal header kept');
  assert.equal(ws.getCell('W2').border.left.style, 'thin');
  assert.deepEqual(out.exceljs.worksheets.map(w => w.name), ORIGINAL.SheetNames);
});

test('an edit rewrites only the cells that changed; blank rows between the rows stay where they are', async () => {
  const st = linked();
  const temmuz = policies(st, '2026-07');
  const p = temmuz[25];
  const out = await save(st, () => { p.premium = 4321.5; p.note = 'Ek teminat: Deprem'; p.updatedAt = T0 + 9; });
  assert.equal(out.plan.changes, 1);
  const rows = rowsOf(out.xlsx, 'Temmuz-2026'), orig = rowsOf(ORIGINAL, 'Temmuz-2026');
  assert.equal(rows.length, orig.length);
  const pc = colOf(st, 'Temmuz-2026', 'Şirket poliçe tutarı'), nc = colOf(st, 'Temmuz-2026', 'Açıklama');
  rows.forEach((row, i) => {
    if (i !== p.source.row - 1) { assert.deepEqual(row, orig[i], 'row ' + (i + 1)); return; }
    assert.equal(row[pc], 4321.5);
    assert.equal(row[nc], 'Ek teminat: Deprem');
    assert.deepEqual(row.filter((v, k) => k !== pc && k !== nc), orig[i].filter((v, k) => k !== pc && k !== nc), 'the rest of the row as it was');
  });
  assert.equal(rows.filter(r => !r.length).length, orig.filter(r => !r.length).length, 'the blank rows are still there');
  assert.equal(rowOf(st, p), p.source.row);
  // a second save with nothing new writes nothing
  assert.equal((await save(st)).plan.changes, 0);
});

test('a new record lands under the last row of its month; the TOPLAM row moves down with the new total', async () => {
  const st = linked();
  const eylul = policies(st, '2026-09');
  const lastRow = rowOf(st, eylul[eylul.length - 1]);
  const lay = st.link.sheets['EYLÜL 2026'].layout;
  const out = await save(st, (s) => {
    s.state.customers.set('cNew', { id: 'cNew', name: 'Deniz Yıldırım', tc: '10000000146', phone: '5321234567', profession: 'Mimar' });
    s.state.policies.set('pNew', { id: 'pNew', customerId: 'cNew', month: '2026-09', policyType: 'Kasko', company: 'Allianz Sigorta', policyNo: 'az-new-1',
      endDate: '2027-09-15', premium: 25000, commission: 3750, newBusiness: true, card: 25000, createdAt: T0 + 5, updatedAt: T0 + 5 });
    s.state.policies.set('pJul', { id: 'pJul', customerId: 'cNew', month: '2026-07', policyType: 'Trafik', company: 'Axa', policyNo: 'AX-JUL-1', premium: 5000, createdAt: T0 + 6, updatedAt: T0 + 6 });
  });
  const rows = rowsOf(out.xlsx, 'EYLÜL 2026'), orig = rowsOf(ORIGINAL, 'EYLÜL 2026');
  const newRow = out.link.sheets['EYLÜL 2026'].rows.pNew[0];
  assert.equal(newRow, lastRow + 1, 'right under the last row');
  const r = rows[newRow - 1];
  const col = (h) => colOf(st, 'EYLÜL 2026', h);
  assert.equal(r[col('Müşteri Adı Soyadı')], 'Deniz Yıldırım');
  assert.equal(r[col('Poliçe No')], 'AZ-NEW-1', 'capitals, like the rest of the column');
  assert.equal(r[col('Brüt Prim')], 25000);
  assert.equal(r[col('TCKN')], '10000000146', 'text, like the other TC numbers of this page');
  const jul = rowsOf(out.xlsx, 'Temmuz-2026')[out.link.sheets['Temmuz-2026'].rows.pJul[0] - 1];
  assert.equal(jul[colOf(st, 'Temmuz-2026', 'Tc kimlik no')], 10000000146, 'a number on a page that keeps them as numbers');
  assert.equal(jul[colOf(st, 'Temmuz-2026', 'Adı soyadı')], 'Deniz Yıldırım');
  assert.equal(r[col('Yeni İş')], 'X', 'Yeni iş written the way this page writes it');
  const dc = out.xlsx.Sheets['EYLÜL 2026'][XLSX.utils.encode_cell({ r: newRow - 1, c: col('Vade Sonu') })];
  assert.ok(dc.t === 'n' && XLSX.SSF.is_date(dc.z), 'a real date');
  assert.equal(U.excelSerialToISO(dc.v), '2027-09-15');
  // the rows above are untouched, the empty row before TOPLAM is kept, TOPLAM moved down by one
  const main = lay.block.startCol;
  for (let i = 0; i < newRow - 1; i++) assert.deepEqual(rows[i].slice(0, main), orig[i].slice(0, main), 'row ' + (i + 1));
  const T = out.link.sheets['EYLÜL 2026'].layout.totalRow;
  assert.equal(T, lay.totalRow + 1);
  assert.ok(rows[T - 1].slice(0, main).every(v => v == null), 'empty row before TOPLAM');
  assert.ok(rows[T].join(' ').includes('TOPLAM'));
  const pc = col('Brüt Prim');
  assert.equal(rows[T][pc], Math.round((orig[lay.totalRow][pc] + 25000) * 100) / 100, 'TOPLAM adds the new premium');
  // the İptal block is not moved
  for (let i = 0; i < orig.length; i++) assert.deepEqual(rows[i].slice(main), (orig[i] || []).slice(main), 'İptal block row ' + (i + 1));
  // same borders as the row above
  const ws = out.exceljs.getWorksheet('EYLÜL 2026');
  assert.deepEqual(ws.getRow(newRow).getCell(2).border, ws.getRow(newRow - 1).getCell(2).border);
  // and the importer reads the page back with the new policy and still skips the TOPLAM row
  const a = Importer.analyzeWorkbook(Importer.readWorkbook(new Uint8Array(out.buf), XLSX, 'x.xlsx'), XLSX, { fileName: 'x.xlsx' });
  const s = a.sheets.find(x => x.name === 'EYLÜL 2026');
  assert.equal(s.rows.length, eylul.length + 1);
  assert.equal(s.totalRow, T);
});

test('a deleted record: the rows below move up keeping their look, TOPLAM follows with the new total, the İptal block stays', async () => {
  const st = linked();
  const ocak = policies(st, '2026-01');
  const gone = ocak[5];
  const goneRow = rowOf(st, gone);
  const before = st.link.sheets['OCAK 2026'].layout;
  const out = await save(st, (s) => { s.state.policies.delete(gone.id); });
  const rows = rowsOf(out.xlsx, 'OCAK 2026'), orig = rowsOf(ORIGINAL, 'OCAK 2026');
  const lay = out.link.sheets['OCAK 2026'].layout;
  const main = before.block.startCol;
  assert.equal(lay.lastDataRow, before.lastDataRow - 1);
  assert.equal(lay.totalRow, before.totalRow - 1, 'TOPLAM moved up by one');
  for (let i = before.dataStart; i <= lay.lastDataRow; i++) {
    const src = i < goneRow - 1 ? orig[i] : orig[i + 1];
    assert.deepEqual(rows[i].slice(0, main), src.slice(0, main), 'row ' + (i + 1));
  }
  assert.equal(rowOf(st, ocak[6]), goneRow, 'the next policy now sits where the deleted one was');
  const pcol = colOf(st, 'OCAK 2026', 'Şirket poliçe tutarı');
  const sum = Math.round(ocak.filter(p => p !== gone).reduce((s, p) => s + p.premium, 0) * 100) / 100;
  assert.equal(rows[lay.totalRow][pcol], sum, 'new total');
  assert.ok(String(rows[lay.totalRow].join(' ')).includes('TOPLAM'));
  assert.ok(rows.slice(lay.totalRow + 1).every(r => r.slice(0, main).every(v => v == null)), 'old TOPLAM row cleared');
  const ws = out.exceljs.getWorksheet('OCAK 2026');
  assert.ok(!ws.getRow(lay.totalRow + 2).getCell(1).font || !ws.getRow(lay.totalRow + 2).getCell(1).font.bold, 'and no longer bold');
  for (let i = 0; i <= before.block.lastRow; i++) assert.deepEqual(rows[i].slice(main, main + 6), orig[i].slice(main, main + 6), 'İptal block row ' + (i + 1));
});

test('İptal rows: a new one goes into the next empty row of the block, a removed one closes up', async () => {
  const st = linked();
  const eylulX = st.cancels.filter(x => x.month === '2026-09').sort((a, b) => a.row - b.row);
  const out = await save(st, (s) => {
    s.cancels.push({ id: 'xNew', month: '2026-09', company: 'Axa Sigorta', policyText: 'Kasko', insuredName: 'Deniz Yıldırım', cash: 1500, createdAt: T0 + 3, updatedAt: T0 + 3 });
    s.cancels.splice(s.cancels.indexOf(eylulX[0]), 1);
  });
  const lay = out.before.sheets['EYLÜL 2026'].layout;
  const b = lay.block.startCol;
  const rows = rowsOf(out.xlsx, 'EYLÜL 2026'), orig = rowsOf(ORIGINAL, 'EYLÜL 2026');
  const block = rows.slice(1).map(r => r.slice(b, b + 6)).filter(r => r.some(v => v != null));
  assert.equal(block.length, eylulX.length);
  assert.deepEqual(block[block.length - 1], ['Axa Sigorta', 'Kasko', 'DENİZ YILDIRIM', null, null, 1500], 'names in capitals, like this block');
  assert.deepEqual(block[0], orig[eylulX[1].row - 1].slice(b, b + 6), 'the next row moved up');
  const nr = out.link.sheets['EYLÜL 2026'].cancels.xNew[0];
  assert.equal(nr, lay.block.headerRow + 1 + eylulX.length);
  const ws = out.exceljs.getWorksheet('EYLÜL 2026');
  assert.equal(ws.getRow(nr).getCell(b + 1).border.left.style, 'thin', 'the bordered row keeps its borders');
  assert.equal(ws.getRow(nr + 1).getCell(b + 1).border.left.style, 'thin', 'the empty bordered rows below are still there');
  // the main table did not move
  for (let i = 0; i < orig.length; i++) assert.deepEqual(rows[i].slice(0, b), (orig[i] || []).slice(0, b), 'row ' + (i + 1));
});

test('a month the file does not have gets its own sheet, laid out like the latest month and placed in order', async () => {
  const st = linked();
  const any = Array.from(st.state.policies.values())[0];
  const out = await save(st, (s) => {
    s.state.policies.set('pNov', { id: 'pNov', customerId: any.customerId, month: '2026-11', policyType: 'DASK', company: 'Axa', policyNo: 'AX-NOV-1', endDate: '2027-11-02', premium: 900, createdAt: T0 + 7, updatedAt: T0 + 7 });
    s.cancels.push({ id: 'xNov', month: '2026-11', company: 'Axa', policyText: 'DASK', insuredName: 'Ali Veli', card: 300, createdAt: T0 + 8, updatedAt: T0 + 8 });
  });
  const names = out.exceljs.worksheets.slice().sort((a, b) => a.orderNo - b.orderNo).map(w => w.name);
  assert.deepEqual(names.slice(-2), ['Ekim 2026', 'Kasım 2026'], 'named like its neighbour and placed after it');
  const ws = out.exceljs.getWorksheet('Kasım 2026');
  assert.equal(ws.getCell('A1').value, 'KASIM 2026 ÜRETİM', 'the title names the new month');
  const tpl = out.exceljs.getWorksheet('Ekim 2026');
  assert.deepEqual(ws.getRow(4).values, tpl.getRow(4).values, 'the same header row');
  assert.deepEqual(ws.getCell('A4').fill, tpl.getCell('A4').fill);
  assert.ok(!(ws.views[0] || {}).tabSelected, 'not selected together with another sheet');
  assert.ok(out.link.sheets['Kasım 2026'] && !out.link.sheets['Kasım 2026'].pending);
  assert.equal(out.link.months['2026-11'], 'Kasım 2026');
  // and the importer reads it back as November with that policy and that İptal row
  const a = Importer.analyzeWorkbook(Importer.readWorkbook(new Uint8Array(out.buf), XLSX, 'x.xlsx'), XLSX, { fileName: 'x.xlsx' });
  const nov = a.sheets.find(s => s.name === 'Kasım 2026');
  assert.deepEqual([nov.month.key, nov.rows.length, nov.cancels.length], ['2026-11', 1, 1]);
  const built = Importer.buildRecords({ sheets: [nov] });
  assert.equal(built.records[0].fields.policyNo, 'AX-NOV-1');
  assert.equal(built.cancels[0].card, 300);
  // a second record for November goes under the first one
  const out2 = await save(st, (s) => {
    s.state.policies.set('pNov2', { id: 'pNov2', customerId: any.customerId, month: '2026-11', policyType: 'Konut', company: 'Axa', policyNo: 'AX-NOV-2', premium: 1200, createdAt: T0 + 9, updatedAt: T0 + 9 });
  });
  assert.deepEqual([out2.link.sheets['Kasım 2026'].rows.pNov[0], out2.link.sheets['Kasım 2026'].rows.pNov2[0]], [5, 6]);
  assert.equal(out2.exceljs.worksheets.length, ORIGINAL.SheetNames.length + 1);
});

test('a policy moved to another month leaves its old page and goes under the last row of the new one', async () => {
  const st = linked();
  const p = policies(st, '2026-03')[3];
  const from = rowOf(st, p);
  const marchCount = policies(st, '2026-03').length;
  const out = await save(st, () => { p.month = '2026-08'; p.updatedAt = T0 + 4; });
  assert.equal(Object.keys(out.link.sheets.MART.rows).length, marchCount - 1);
  assert.equal(out.link.sheets.MART.rows[p.id], undefined);
  assert.ok(out.link.sheets['08.2026'].rows[p.id], 'now on the August page');
  const rows = rowsOf(out.xlsx, 'MART'), orig = rowsOf(ORIGINAL, 'MART');
  const b = out.before.sheets.MART.layout.block.startCol;
  assert.deepEqual(rows[from - 1].slice(0, b), orig[from].slice(0, b), 'the next row moved up');
  const aug = rowsOf(out.xlsx, '08.2026');
  const at = out.link.sheets['08.2026'].rows[p.id][0];
  assert.equal(aug[at - 1][out.link.sheets['08.2026'].layout.columns.find(c => c.field === 'policyNo').col], p.policyNo);
});

test('a customer\'s new phone number goes into every row of that customer, nothing else is touched', async () => {
  const st = linked();
  const counts = new Map();
  st.state.policies.forEach(p => counts.set(p.customerId, (counts.get(p.customerId) || 0) + 1));
  const cid = Array.from(counts.keys()).find(id => counts.get(id) >= 3);
  const c = st.state.customers.get(cid);
  const mine = Array.from(st.state.policies.values()).filter(p => p.customerId === cid);
  const out = await save(st, () => { c.phone = '05551112233'; });
  assert.equal(out.plan.changes, mine.length);
  mine.forEach(p => {
    const sheet = Object.keys(out.link.sheets).find(n => out.link.sheets[n].rows[p.id]);
    const col = out.link.sheets[sheet].layout.columns.find(x => x.field === 'phone').col;
    const row = rowsOf(out.xlsx, sheet)[out.link.sheets[sheet].rows[p.id][0] - 1];
    assert.equal(row[col], U.formatPhone('05551112233'), sheet);
  });
});

test('a page without an İptal block gets one after its table when a policy of that month is cancelled', async () => {
  // a page laid out by hand, no block
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mart 2026');
  ws.getRow(1).values = ['Adı soyadı', 'Poliçe adı', 'Şirket', 'Poliçe numarası', 'Şirket poliçe tutarı'];
  ws.getRow(2).values = ['Ali Er', 'Kasko', 'Axa', 'P-1', 1000];
  ws.getRow(3).values = ['Can Ak', 'Trafik', 'Allianz', 'P-2', 2000];
  const st = linkedTo(Buffer.from(await wb.xlsx.writeBuffer()), 'el.xlsx');
  assert.equal(st.link.sheets['Mart 2026'].layout.block, null);
  const out = await save(st, (s) => { s.cancels.push({ id: 'xa', month: '2026-03', company: 'Axa', policyText: 'Kasko', insuredName: 'Ali Er', cash: 400, createdAt: T0 + 1, updatedAt: T0 + 1 }); });
  const rows = rowsOf(out.xlsx, 'Mart 2026');
  assert.deepEqual(rows[0], ['Adı soyadı', 'Poliçe adı', 'Şirket', 'Poliçe numarası', 'Şirket poliçe tutarı', null, 'ŞİRKET', 'POLİÇE', 'SİGORTALI AD SOYAD', 'KART', 'CARİ', 'NAKİT']);
  assert.deepEqual(rows[1].slice(6), ['Axa', 'Kasko', 'Ali Er', null, null, 400]);
  const a = Importer.analyzeWorkbook(Importer.readWorkbook(new Uint8Array(out.buf), XLSX, 'el.xlsx'), XLSX, { fileName: 'el.xlsx' });
  assert.equal(a.sheets[0].cancels.length, 1, 'read back as an İptal row');
  assert.equal(a.sheets[0].rows.length, 2);
});

test('formulas: rows keep their own formulas, SUM ranges follow the table, other sheets keep pointing at the TOPLAM', async () => {
  assert.equal(Sync.shiftFormula('A5*0.1', -1), 'A4*0.1');
  assert.equal(Sync.shiftFormula('$A$5+B5', -2), '$A$5+B3');
  assert.equal(Sync.shiftFormula('SUM(B2:B5)&"B5"', 1), 'SUM(B3:B6)&"B5"');
  assert.equal(Sync.shiftFormula('LOG10(A5)+Sayfa1!C5', -1), 'LOG10(A4)+Sayfa1!C4');
  assert.equal(Sync.shiftFormula("'Ocak 2026'!C5+[1]Dış!C5", 1), "'Ocak 2026'!C6+[1]Dış!C5", 'another workbook is left alone');
  // a hand-made page: Prim, Komisyon = Prim * 0.1 filled down (shared), TOPLAM with SUM; a summary sheet points at it
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ocak 2026');
  ws.getRow(1).values = ['Adı soyadı', 'Poliçe numarası', 'Şirket poliçe tutarı', 'Komisyon'];
  ['Ali Er', 'Can Ak', 'Ece Su', 'Oya Tan'].forEach((n, i) => { ws.getRow(i + 2).values = [n, 'P-' + i, (i + 1) * 1000]; });
  ws.getCell('D2').value = { formula: 'C2*0.1', result: 100, shareType: 'shared', ref: 'D2:D5' };
  for (let r = 3; r <= 5; r++) ws.getCell('D' + r).value = { sharedFormula: 'D2', result: (r - 1) * 100 };
  ws.getCell('A7').value = 'TOPLAM';
  ws.getCell('C7').value = { formula: 'SUM(C2:C5)', result: 10000 };
  ws.getCell('D7').value = { formula: 'SUM(D2:D5)', result: 1000 };
  const sum = wb.addWorksheet('ÖZET');
  sum.getCell('A1').value = 'Ocak';
  sum.getCell('B1').value = { formula: "'Ocak 2026'!C7", result: 10000 };
  const st = linkedTo(Buffer.from(await wb.xlsx.writeBuffer()), 'f.xlsx');
  const first = Array.from(st.state.policies.values()).find(p => p.policyNo === 'P-0');
  // one row out, one in: the table keeps its length
  let out = await save(st, (s) => {
    s.state.policies.delete(first.id);
    s.state.customers.set('n', { id: 'n', name: 'Nur Ay' });
    s.state.policies.set('n1', { id: 'n1', customerId: 'n', month: '2026-01', policyNo: 'P-9', premium: 9000, createdAt: T0 + 1, updatedAt: T0 + 1 });
  });
  let o = out.exceljs.getWorksheet('Ocak 2026');
  assert.deepEqual([2, 3, 4, 5].map(r => o.getCell('D' + r).formula), ['C2*0.1', 'C3*0.1', 'C4*0.1', 'C5*0.1'], 'formulas moved up with their rows; the new row gets one too');
  assert.equal(o.getCell('A5').value, 'Nur Ay');
  assert.equal(o.getCell('C7').formula, 'SUM(C2:C5)', 'the total still covers the table');
  assert.equal(o.getCell('C7').result, 18000);
  assert.equal(o.getCell('A7').value, 'TOPLAM');
  assert.equal(out.exceljs.getWorksheet('ÖZET').getCell('B1').formula, "'Ocak 2026'!C7");
  const book = XLSX.CFB.read(out.buf, { type: 'buffer' });
  assert.match(Buffer.from(XLSX.CFB.find(book, '/xl/workbook.xml').content).toString(), /fullCalcOnLoad="1"/, 'Excel recalculates when it opens the file');
  // two more rows: TOPLAM moves down two rows, its SUM grows, the summary follows it
  out = await save(st, (s) => {
    s.state.policies.set('n2', { id: 'n2', customerId: 'n', month: '2026-01', policyNo: 'P-10', premium: 100, createdAt: T0 + 2, updatedAt: T0 + 2 });
    s.state.policies.set('n3', { id: 'n3', customerId: 'n', month: '2026-01', policyNo: 'P-11', premium: 200, createdAt: T0 + 3, updatedAt: T0 + 3 });
  });
  o = out.exceljs.getWorksheet('Ocak 2026');
  assert.equal(o.getCell('A9').value, 'TOPLAM');
  assert.equal(o.getCell('C9').formula, 'SUM(C2:C7)');
  assert.equal(o.getCell('D9').formula, 'SUM(D2:D7)');
  assert.equal(o.getCell('D7').formula, 'C7*0.1');
  assert.equal(o.getCell('A8').value, null, 'the empty row before TOPLAM is kept');
  assert.equal(out.exceljs.getWorksheet('ÖZET').getCell('B1').formula, "'Ocak 2026'!C9", 'the summary sheet still points at the total');
});

test('ready-formatted empty rows are filled first; a TOPLAM further down only moves once the table reaches it', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Şubat 2026');
  const thin = { style: 'thin' };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  ws.getRow(1).values = ['Adı soyadı', 'Poliçe numarası', 'Şirket poliçe tutarı'];
  ws.getRow(2).values = ['Ali Er', 'P-1', 1000];
  for (let r = 2; r <= 6; r++) for (let c = 1; c <= 3; c++) ws.getRow(r).getCell(c).border = box;
  ws.getCell('A8').value = 'TOPLAM';
  ws.getCell('C8').value = { formula: 'SUM(C2:C7)', result: 1000 };
  const st = linkedTo(Buffer.from(await wb.xlsx.writeBuffer()), 'g.xlsx');
  st.state.customers.set('n', { id: 'n', name: 'Nur Ay' });
  const add = (s, i) => s.state.policies.set('n' + i, { id: 'n' + i, customerId: 'n', month: '2026-02', policyNo: 'Q-' + i, premium: 100 * i, createdAt: T0 + i, updatedAt: T0 + i });
  let out = await save(st, (s) => { [1, 2, 3].forEach(i => add(s, i)); });
  let o = out.exceljs.getWorksheet('Şubat 2026');
  assert.deepEqual([3, 4, 5].map(r => o.getCell('B' + r).value), ['Q-1', 'Q-2', 'Q-3']);
  assert.equal(o.getCell('A8').value, 'TOPLAM', 'TOPLAM stays where it is');
  assert.equal(o.getCell('C8').formula, 'SUM(C2:C7)');
  out = await save(st, (s) => { [4, 5, 6].forEach(i => add(s, i)); });
  o = out.exceljs.getWorksheet('Şubat 2026');
  assert.deepEqual([6, 7, 8].map(r => o.getCell('B' + r).value), ['Q-4', 'Q-5', 'Q-6']);
  assert.equal(o.getCell('A10').value, 'TOPLAM', 'pushed down, with one empty row before it');
  assert.equal(o.getCell('C10').formula, 'SUM(C2:C8)');
  assert.equal(o.getCell('B6').border.left.style, 'thin', 'the bordered rows kept their borders');
});

test('sheet names for new months follow the file\'s own style', () => {
  assert.equal(Sync.newSheetName('2026-11', 'EKİM 2026', []), 'KASIM 2026');
  assert.equal(Sync.newSheetName('2026-11', 'Ekim 2026', []), 'Kasım 2026');
  assert.equal(Sync.newSheetName('2026-11', '08.2026', []), '11.2026');
  assert.equal(Sync.newSheetName('2027-01', 'Temmuz-2026', []), 'Ocak-2027');
  assert.equal(Sync.newSheetName('2026-11', 'MART', []), 'KASIM 2026');
  assert.equal(Sync.newSheetName('2026-11', null, ['Kasım 2026']), 'Kasım 2026 (2)');
  assert.equal(Sync.renameMonth('EKİM 2026 ÜRETİM LİSTESİ', '2026-10', '2026-11'), 'KASIM 2026 ÜRETİM LİSTESİ');
});

test('rows changed in Excel still line up with the rows of the last save', () => {
  const layout = { columns: [{ col: 0, header: 'Adı soyadı', field: 'name', role: 'primary' }, { col: 1, header: 'Poliçe numarası', field: 'policyNo', role: 'primary' }, { col: 2, header: 'Şirket poliçe tutarı', field: 'premium', role: 'primary' }] };
  const row = (name, no, premium) => ({ vals: Sync.keyed({ 0: name, 1: no, 2: premium }, layout) });
  const saved = [row('Ali Er', 'P-1', 100), row('Can Ak', 'P-2', 200), row('Ece Su', 'P-3', 300), row('Oya Tan', 'P-4', 400)];
  // in Excel: a row typed above, Can Ak's premium changed, Ece Su deleted, a row typed at the end
  const now = [row('Yeni Kişi', 'P-9', 50), row('Ali Er', 'P-1', 100), row('Can Ak', 'P-2', 250), row('Oya Tan', 'P-4', 400), row('Son Kişi', 'P-10', 60)];
  const pairs = Sync.align(saved, now, 0.6).map(m => [m[0], m[1]]);
  assert.deepEqual(pairs, [[0, 1], [1, 2], [3, 3]], 'Ali, Can (edited) and Oya found; Ece is gone; the new rows are new');
  // a column moved in Excel still compares with itself
  const moved = { columns: [{ col: 0, header: 'Poliçe numarası', field: 'policyNo', role: 'primary' }, { col: 1, header: 'Adı soyadı', field: 'name', role: 'primary' }, { col: 2, header: 'Şirket poliçe tutarı', field: 'premium', role: 'primary' }] };
  assert.equal(Sync.similarity(Sync.keyed({ 0: 'P-1', 1: 'Ali Er', 2: 100 }, moved), saved[0].vals), 1);
});
