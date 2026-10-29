import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { setup, go, text, store, confirmDialog, download, readBook, sheetRows, ROOT, XLSX } from './helpers.mjs';

const require = createRequire(import.meta.url);
const ExcelJS = require('../../vendor/exceljs.min.js');
// the file given to the app (never written to) and the new file the app keeps saving into
const ORIG = 'portfoy-2026.xlsx';
const FILE = 'portfoy-2026-guncel.xlsx';
const SAMPLE = fs.readFileSync(path.join(ROOT, 'sample-data', 'ornek-portfoy.xlsx'));

let env;
test.before(async () => {
  env = await setup();
  await env.context.addInitScript(() => {
    // this Chromium build goes down when a file handle is read back from IndexedDB (see FileLink.loadHandle):
    // the app is told it already happened, so it keeps no handle and the file is picked again after a reload
    if (!localStorage.getItem('test:guard')) localStorage.setItem('sp:handle-off', (/Chrom(?:e|ium)\/(\d+)/.exec(navigator.userAgent) || [])[1] || 'other');
    // switches for the tests: the browser asking for permission again, the file open in Excel
    const H = window.FileSystemHandle && window.FileSystemHandle.prototype;
    const F = window.FileSystemFileHandle && window.FileSystemFileHandle.prototype;
    if (!H || !F) return;
    const query = H.queryPermission, request = H.requestPermission, writable = F.createWritable;
    F.queryPermission = function (o) { return localStorage.getItem('test:perm') ? Promise.resolve('prompt') : query ? query.call(this, o) : Promise.resolve('granted'); };
    F.requestPermission = function (o) {
      const st = localStorage.getItem('test:perm');
      // the first question goes unanswered (no click left after the file dialog), the second is a yes
      if (st === 'prompt') { localStorage.setItem('test:perm', 'asked'); return Promise.resolve('denied'); }
      if (st === 'asked') { localStorage.removeItem('test:perm'); window.__asked = (window.__asked || 0) + 1; return Promise.resolve('granted'); }
      return request ? request.call(this, o) : Promise.resolve('granted');
    };
    F.createWritable = function (o) {
      if (localStorage.getItem('test:locked')) return Promise.reject(new DOMException('The file is open in another program', 'NoModificationAllowedError'));
      return writable.call(this, o);
    };
  });
});
test.after(async () => { await env.close(); });

// the file on "disk": a file in the browser's private storage, handed over by the file picker
async function putFile(page, name, bytes) {
  await page.evaluate(async ([n, b64]) => {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(n, { create: true });
    const w = await fh.createWritable();
    await w.write(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    await w.close();
  }, [name, Buffer.from(bytes).toString('base64')]);
}
async function getFile(page, name) {
  const b64 = await page.evaluate(async (n) => {
    const root = await navigator.storage.getDirectory();
    const f = await (await root.getFileHandle(n)).getFile();
    const buf = new Uint8Array(await f.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    return btoa(s);
  }, name);
  return Buffer.from(b64, 'base64');
}
async function offer(page, name) {
  await page.evaluate(async (n) => {
    const fh = await (await navigator.storage.getDirectory()).getFileHandle(n);
    window.showOpenFilePicker = async () => [fh];
  }, name);
}
const writes = (page) => store(page, () => (window.FileLink.link ? window.FileLink.link.writes : 0));
async function savedAfter(page, n) {
  await page.waitForFunction((k) => window.FileLink.status === 'saved' && window.FileLink.link && window.FileLink.link.writes > k, n, { timeout: 20000 });
}
const colsOf = (page, sheet) => store(page, (n) => {
  const out = {};
  window.FileLink.link.sheets[n].layout.columns.forEach(c => { if (c.field && !(c.field in out)) out[c.field] = c.col; });
  return out;
}, sheet);
// an empty text cell and an empty cell look the same in Excel
const rowsIn = (buf, sheet) => {
  const rows = XLSX.utils.sheet_to_json(readBook(buf).Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: true }).map(r => {
    const out = r.map(v => (v === '' ? null : v));
    while (out.length && out[out.length - 1] == null) out.pop();
    return out;
  });
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return rows;
};
const policyNo = (page, no) => store(page, (n) => { const p = Array.from(Store.policies.values()).find(x => x.policyNo === n); return p ? Object.assign({}, p) : null; }, no);

test('importing saves a copy to a new file the user chooses; the file given to the app is never written to', async () => {
  const { page, base } = env;
  await page.goto(base);
  await putFile(page, ORIG, SAMPLE);
  await offer(page, ORIG);
  await go(page, 'ice-aktar');
  await page.click('#import-drop');
  await page.waitForSelector('#sheet-table');
  assert.equal(await page.$eval('#opt-autosave', e => e.checked), true, 'on by default for an .xlsx');
  assert.match(await text(page, '#autosave-box'), /Değişiklikleri yeni bir Excel dosyasına otomatik kaydet/);
  assert.match(await text(page, '#autosave-box'), /portfoy-2026 - guncel\.xlsx/, 'the new name is suggested');
  // the save dialog: first the user picks the original itself (refused), then a new file
  await page.evaluate(async (n) => { const fh = await (await navigator.storage.getDirectory()).getFileHandle(n); window.showSaveFilePicker = async (o) => { window.__suggested = o.suggestedName; return fh; }; }, ORIG);
  await page.click('#import-run');
  await page.waitForSelector('.toast:has-text("Verdiğiniz dosyanın üzerine kaydedilmez")');
  assert.ok(await page.$('#sheet-table'), 'still on the preview, nothing imported');
  assert.equal(await page.evaluate(() => window.__suggested), 'portfoy-2026 - guncel.xlsx');
  await page.evaluate(async (n) => { window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle(n, { create: true }); }, FILE);
  await page.click('#import-run');
  await page.waitForSelector('#autosave-done');
  assert.match(await text(page, '#autosave-done'), new RegExp('Otomatik kayıt açık: ' + FILE));
  assert.match(await text(page, '#autosave-original'), new RegExp('Verdiğiniz dosya \\(' + ORIG.replace('.', '\\.') + '\\) olduğu gibi kaldı'));
  await page.waitForFunction(() => window.FileLink.status === 'saved');
  assert.deepEqual(await store(page, () => ({ kind: FileLink.link.kind, name: FileLink.link.name, original: FileLink.link.original, writes: FileLink.link.writes, sheets: Object.keys(FileLink.link.sheets).length })),
    { kind: 'file', name: FILE, original: ORIG, writes: 0, sheets: 13 });
  assert.ok((await getFile(page, FILE)).equals(SAMPLE), 'the new file starts as an exact copy');
  assert.ok((await getFile(page, ORIG)).equals(SAMPLE), 'the original is not touched');
  assert.match(await text(page, '#excel-status'), /Excel dosyasına kaydediliyor/);
  assert.deepEqual(env.errors, []);
});

test('Yeni kayıt → Kaydet: a moment later the record is in the file, under the last row of its month', async () => {
  const { page } = env;
  const before = await getFile(page, FILE);
  const last = await store(page, () => FileLink.link.sheets['Ekim 2026'].layout.lastDataRow);
  const w = await writes(page);
  await go(page, 'yeni');
  await page.fill('#f-name', 'Deniz Yıldırım');
  await page.fill('#f-tc', '10000000146');
  await page.fill('#f-phone', '5321234567');
  await page.fill('#f-policyType', 'Kasko');
  await page.fill('#f-company', 'Allianz Sigorta');
  await page.fill('#f-policyNo', 'TEST-AUTO-1');
  await page.fill('#f-startDate', '05.10.2026');
  await page.fill('#f-premium', '25000');
  await page.click('#save-policy');
  await page.waitForSelector('.toast:has-text("Kaydedildi: Deniz Yıldırım")');
  await savedAfter(page, w);
  assert.match(await text(page, '#excel-status'), /Excel’e kaydedildi · 10:00/);
  const after = await getFile(page, FILE);
  const rows = rowsIn(after, 'Ekim 2026'), orig = rowsIn(before, 'Ekim 2026');
  const c = await colsOf(page, 'Ekim 2026');
  const r = rows[last + 1];
  assert.equal(r[c.policyNo], 'TEST-AUTO-1');
  assert.equal(r[c.name], 'Deniz Yıldırım');
  assert.equal(r[c.tc], 10000000146, 'a number, like the TC numbers above it');
  assert.equal(r[c.premium], 25000);
  // a real date cell (SheetJS hands date-formatted numbers back as dates), a year after the start
  assert.ok(r[c.endDate] instanceof Date, 'a date, not text');
  assert.equal(r[c.endDate].toISOString().slice(0, 10), '2027-10-05');
  for (let i = 0; i <= last; i++) assert.deepEqual(rows[i], orig[i], 'row ' + (i + 1) + ' untouched');
  for (const name of readBook(before).SheetNames.filter(n => n !== 'Ekim 2026')) assert.deepEqual(rowsIn(after, name), rowsIn(before, name), name + ' untouched');
});

test('an edit rewrites only that cell; cancelling a policy adds its row to the İptal block of the month', async () => {
  const { page } = env;
  const p = await store(page, () => { const l = FileLink.link.sheets.MART; const id = Object.keys(l.rows)[10]; return { id, row: l.rows[id][0] }; });
  const before = rowsIn(await getFile(page, FILE), 'MART');
  let w = await writes(page);
  await go(page, 'duzenle-' + p.id);
  await page.fill('#f-premium', '4321,50');
  await page.click('#save-policy');
  await page.waitForSelector('.toast:has-text("Poliçe güncellendi")');
  await savedAfter(page, w);
  const after = rowsIn(await getFile(page, FILE), 'MART');
  const pc = (await colsOf(page, 'MART')).premium;
  assert.equal(after[p.row - 1][pc], 4321.5);
  assert.deepEqual(after[p.row - 1].filter((v, k) => k !== pc), before[p.row - 1].filter((v, k) => k !== pc), 'the rest of the row as it was');
  after.forEach((r, i) => { if (i !== p.row - 1) assert.deepEqual(r, before[i], 'row ' + (i + 1)); });

  // cancel a running policy of this month from the customer card
  const x = await store(page, () => {
    const q = Store.derived().policies.find(o => o.month === '2026-10' && !Store.isCancelled(o.id) && o.premium > 1000 && o.policyNo !== 'TEST-AUTO-1');
    return { id: q.id, customerId: q.customerId, company: q.company, premium: q.premium };
  });
  w = await writes(page);
  await go(page, 'musteri-' + x.customerId);
  await page.click('#cancel-' + x.id);
  await page.waitForSelector('dialog[open] #cx-month');
  await page.click('#cx-full');
  await page.click('#cx-save');
  await page.waitForSelector('.toast:has-text("Poliçe iptal edildi")');
  await savedAfter(page, w);
  const cx = await store(page, (id) => { const c = Store.cancelOf(id); return { insuredName: c.insuredName, row: FileLink.link.sheets['Ekim 2026'].cancels[c.id][0] }; }, x.id);
  const b = await store(page, () => FileLink.link.sheets['Ekim 2026'].layout.block);
  const row = rowsIn(await getFile(page, FILE), 'Ekim 2026')[cx.row - 1].slice(b.startCol, b.startCol + 6);
  assert.equal(row[0], x.company);
  assert.equal(row[2], cx.insuredName);
  assert.equal(Math.round(((row[3] || 0) + (row[4] || 0) + (row[5] || 0)) * 100) / 100, x.premium, 'the whole premium refunded, the way it was paid');
  assert.equal(cx.row, b.headerRow + 3, 'the next empty row of the block (Ekim had one İptal row)');
});

test('a record for a month the file does not have yet gets its own page, laid out like its neighbour', async () => {
  const { page } = env;
  const w = await writes(page);
  await go(page, 'yeni');
  await page.fill('#f-name', 'Nur Ay');
  await page.selectOption('#f-month', '11');
  await page.fill('#f-policyType', 'DASK');
  await page.fill('#f-company', 'Axa Sigorta');
  await page.fill('#f-policyNo', 'TEST-NOV-1');
  await page.fill('#f-premium', '900');
  await page.click('#save-policy');
  await page.waitForSelector('.toast:has-text("Kaydedildi: Nur Ay")');
  await savedAfter(page, w);
  const wb = readBook(await getFile(page, FILE));
  assert.deepEqual(wb.SheetNames.slice(-2), ['Ekim 2026', 'Kasım 2026'], 'after October, named like it');
  const nov = sheetRows(wb, 'Kasım 2026');
  assert.equal(nov[0][0], 'KASIM 2026 ÜRETİM', 'the title names the new month');
  assert.deepEqual(nov[3], sheetRows(wb, 'Ekim 2026')[3], 'the same header row, İptal block included');
  assert.ok(nov[4].includes('TEST-NOV-1'));
});

test('after a reload the file is still linked: it is picked once, then a customer\'s new phone goes into all of their rows', async () => {
  const { page } = env;
  await page.reload();
  await page.waitForSelector('#excel-notice[data-status="repick"]');
  assert.match(await text(page, '#excel-notice'), new RegExp('Kaydetmeye devam etmek için Excel dosyasını seçin'));
  assert.match(await text(page, '#excel-status'), /Excel: dosyayı seçin/);
  await offer(page, FILE);
  await page.click('#xl-repick-file');
  await page.waitForFunction(() => window.FileLink.status === 'saved');
  assert.equal(await page.$('#excel-notice'), null);
  const cust = await store(page, () => {
    let best = null;
    Store.derived().byCustomer.forEach((list, id) => { if (!best && list.length >= 3 && new Set(list.map(p => p.month)).size >= 3) best = id; });
    return best;
  });
  const w = await writes(page);
  await go(page, 'musteri-' + cust);
  await page.click('#cust-edit');
  await page.waitForSelector('dialog[open] #ce-phone');
  await page.fill('#ce-phone', '0555 111 22 33');
  await page.click('#ce-save');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await savedAfter(page, w);
  const placed = await store(page, (id) => {
    const out = [];
    Store.policiesOf(id).forEach(p => {
      const n = Object.keys(FileLink.link.sheets).find(s => FileLink.link.sheets[s].rows[p.id]);
      const col = FileLink.link.sheets[n].layout.columns.find(c => c.field === 'phone');
      if (col) out.push({ sheet: n, row: FileLink.link.sheets[n].rows[p.id][0], col: col.col });
    });
    return out;
  }, cust);
  const buf = await getFile(page, FILE);
  assert.ok(placed.length >= 3);
  for (const x of placed) assert.equal(rowsIn(buf, x.sheet)[x.row - 1][x.col], '0555 111 22 33', x.sheet);
});

test('when the browser wants one more click for permission, the notice waits for it and then saves', async () => {
  const { page } = env;
  await page.evaluate(() => localStorage.setItem('test:perm', 'prompt'));
  await page.reload();
  await page.waitForSelector('#excel-notice[data-status="repick"]');
  await offer(page, FILE);
  await page.click('#xl-repick-file');
  await page.waitForSelector('#excel-notice[data-status="permission"]');
  assert.match(await text(page, '#excel-notice'), /Excel dosyasına kaydetmek için izin verin/);
  assert.match(await text(page, '#excel-status'), /izin gerekli/);
  const p = await policyNo(page, 'TEST-AUTO-1');
  const w = await writes(page);
  await go(page, 'duzenle-' + p.id);
  await page.fill('#f-note', 'İzin beklerken yazıldı');
  await page.click('#save-policy');
  await page.waitForSelector('.toast:has-text("Poliçe güncellendi")');
  await page.waitForSelector('#excel-notice:has-text("Kaydedilmemiş değişiklikler var")');
  assert.equal(await writes(page), w, 'nothing written without permission');
  await page.click('#xl-allow');
  await savedAfter(page, w);
  assert.equal(await page.evaluate(() => window.__asked), 1, 'asked once');
  assert.equal(await page.$('#excel-notice'), null, 'the notice is gone');
  const c = await colsOf(page, 'Ekim 2026');
  const row = await store(page, (id) => FileLink.link.sheets['Ekim 2026'].rows[id][0], p.id);
  assert.equal(rowsIn(await getFile(page, FILE), 'Ekim 2026')[row - 1][c.note], 'İzin beklerken yazıldı');
});

test('a browser that went down reading the stored file handle does not read it again', async () => {
  const { page } = env;
  // as if the last start had crashed while reading the handle
  await page.evaluate(() => { localStorage.setItem('test:guard', '1'); localStorage.removeItem('sp:handle-off'); localStorage.setItem('sp:handle-reading', '1'); });
  await page.reload();
  await page.waitForSelector('#excel-notice[data-status="repick"]');
  const flags = await page.evaluate(() => ({ off: localStorage.getItem('sp:handle-off'), reading: localStorage.getItem('sp:handle-reading'), v: (/Chrom(?:e|ium)\/(\d+)/.exec(navigator.userAgent) || [])[1] }));
  assert.deepEqual([flags.off, flags.reading], [flags.v, null], 'this browser version keeps no handle from now on');
  await page.evaluate(() => localStorage.removeItem('test:guard'));
  await offer(page, FILE);
  await page.click('#xl-repick-file');
  await page.waitForFunction(() => window.FileLink.status === 'saved');
});

test('the file open in Excel: saving waits and goes through once the file is free', async () => {
  const { page } = env;
  await page.evaluate(() => localStorage.setItem('test:locked', '1'));
  const p = await policyNo(page, 'TEST-AUTO-1');
  const w = await writes(page);
  await go(page, 'duzenle-' + p.id);
  await page.fill('#f-note', 'Excel açıkken yazıldı');
  await page.click('#save-policy');
  await page.waitForSelector('#excel-notice[data-status="locked"]');
  assert.match(await text(page, '#excel-notice'), /Excel dosyası şu an açık görünüyor/);
  assert.match(await text(page, '#excel-status'), /açık – bekliyor/);
  await page.evaluate(() => localStorage.removeItem('test:locked'));
  await page.click('#xl-retry');
  await savedAfter(page, w);
  assert.equal(await page.$('#excel-notice'), null);
});

test('changed in Excel and in the app at once: the file\'s changes come in, the app\'s stay and are written back', async () => {
  const { page } = env;
  const S = 'Nisan 2026';
  const pick = (i) => store(page, ([n, k]) => { const l = FileLink.link.sheets[n]; const id = Object.keys(l.rows).sort((a, b) => l.rows[a][0] - l.rows[b][0])[k]; return { id, row: l.rows[id][0], no: Store.policies.get(id).policyNo, premium: Store.policies.get(id).premium }; }, [S, i]);
  const appEdit = await pick(3), excelEdit = await pick(8), gone = await pick(12);
  const count = await store(page, () => Store.policies.size);
  // the app saves while the file is open in Excel: the change waits
  await page.evaluate(() => localStorage.setItem('test:locked', '1'));
  await go(page, 'duzenle-' + appEdit.id);
  await page.fill('#f-note', 'Uygulamada değişti');
  await page.click('#save-policy');
  await page.waitForSelector('#excel-notice[data-status="locked"]');
  await page.evaluate(() => localStorage.removeItem('test:locked'));
  // meanwhile in Excel: a premium changed, a row deleted, a row typed under the table, then saved
  const lay = await store(page, (n) => FileLink.link.sheets[n].layout, S);
  const col = (f) => lay.columns.find(c => c.field === f).col + 1;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await getFile(page, FILE));
  const ws = wb.getWorksheet(S);
  ws.getRow(excelEdit.row).getCell(col('premium')).value = 7777.77;
  ws.spliceRows(gone.row, 1);
  const nr = ws.getRow(lay.lastDataRow + 1);
  nr.getCell(col('name')).value = 'Excel Eklenen';
  nr.getCell(col('policyType')).value = 'Konut';
  nr.getCell(col('company')).value = 'Axa Sigorta';
  nr.getCell(col('policyNo')).value = 'XL-NEW-1';
  nr.getCell(col('premium')).value = 1500;
  await putFile(page, FILE, Buffer.from(await wb.xlsx.writeBuffer()));
  // the next try notices the file changed
  await page.click('#xl-retry');
  await page.waitForSelector('#excel-notice[data-status="external"]');
  assert.match(await text(page, '#excel-notice'), /uygulama dışında değiştirilmiş/);
  await page.click('#xl-import');
  await page.waitForSelector('#sheet-table');
  assert.equal(await page.$eval('#opt-autosave', e => e.checked), true);
  await page.click('#import-run');
  await page.waitForSelector('#import-done');
  // the deleted row: asked about
  await page.waitForSelector('#excel-notice[data-status="review"]');
  assert.match(await text(page, '#excel-notice'), /1 poliçe artık Excel dosyasında yok/);
  const w = await writes(page);
  await page.click('#xl-review-remove');
  await savedAfter(page, w);
  // the app: Excel's premium, its new row, without the deleted one, and the app's own change still there
  assert.equal((await store(page, (id) => Store.policies.get(id), excelEdit.id)).premium, 7777.77);
  assert.equal(await store(page, (n) => Array.from(Store.policies.values()).filter(p => p.policyNo === n).length, excelEdit.no), 1, 'no duplicate');
  assert.ok(await policyNo(page, 'XL-NEW-1'), 'the row typed in Excel came in');
  assert.equal(await store(page, (id) => Store.policies.has(id), gone.id), false, 'the row deleted in Excel is gone from the app');
  assert.equal((await store(page, (id) => Store.policies.get(id), appEdit.id)).note, 'Uygulamada değişti', 'the app\'s change survived');
  assert.equal(await store(page, () => Store.policies.size), count);
  // the file: the app's change written into its row
  const row = await store(page, ([n, id]) => FileLink.link.sheets[n].rows[id][0], [S, appEdit.id]);
  const r = rowsIn(await getFile(page, FILE), S)[row - 1];
  assert.equal(r[col('note') - 1], 'Uygulamada değişti');
  assert.equal(r[col('policyNo') - 1], appEdit.no);
});

test('or the app\'s data is written over what was changed in Excel', async () => {
  const { page } = env;
  const S = 'Haziran 2026';
  const p = await store(page, (n) => { const l = FileLink.link.sheets[n]; const id = Object.keys(l.rows)[5]; return { id, row: l.rows[id][0], premium: Store.policies.get(id).premium }; }, S);
  const lay = await store(page, (n) => FileLink.link.sheets[n].layout, S);
  const pc = lay.columns.find(c => c.field === 'premium').col;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await getFile(page, FILE));
  wb.getWorksheet(S).getRow(p.row).getCell(pc + 1).value = 1;
  await putFile(page, FILE, Buffer.from(await wb.xlsx.writeBuffer()));
  await page.evaluate(() => window.FileLink.saveNow());
  await page.waitForSelector('#excel-notice[data-status="external"]');
  await page.click('#xl-overwrite');
  await confirmDialog(page);
  await savedAfter(page, 0); // a new link from the file as it is, then the first save
  assert.equal(rowsIn(await getFile(page, FILE), S)[p.row - 1][pc], p.premium, 'the app\'s premium is back in the file');
  assert.equal((await store(page, (id) => Store.policies.get(id), p.id)).premium, p.premium, 'and the app kept its own');
});

test('deleting a month asks once; a big deletion nobody said yes to waits for a yes', async () => {
  const { page } = env;
  // through the month page: its confirmation is enough
  let w = await writes(page);
  await go(page, 'ay-2026-05');
  await page.click('#month-delete');
  await confirmDialog(page, 'MAYIS 2026');
  await savedAfter(page, w);
  let rows = rowsIn(await getFile(page, FILE), 'MAYIS 2026');
  const lay = await store(page, () => FileLink.link.sheets['MAYIS 2026'].layout);
  assert.equal(lay.lastDataRow, lay.dataStart - 1, 'no rows left on the page');
  assert.ok(rows.length >= 1 && rows[0].includes('Poliçe adı'), 'the page and its headers stay');
  // anything else removing many rows at once is held back
  w = await writes(page);
  const n = await store(page, () => { const x = Store.cancellationsOf('2026-06').length; return Store.deleteMonth('2026-06', true).policies + x; });
  await page.waitForSelector('#excel-notice[data-status="confirm"]');
  assert.match(await text(page, '#excel-notice'), new RegExp('Excel dosyasından ' + n + ' satır silinecek'));
  assert.equal(await writes(page), w);
  await page.click('#xl-confirm');
  await savedAfter(page, w);
  assert.equal(await store(page, () => FileLink.link.sheets['Haziran 2026'].layout.lastDataRow), 0);
  rows = rowsIn(await getFile(page, FILE), 'Haziran 2026');
  assert.equal(rows.slice(1).filter(r => r.slice(0, 20).some(v => v != null)).length, 0, 'the June rows are gone from the file');
});

test('settings: the Excel card shows the file, earlier versions and unlinks it', async () => {
  const { page } = env;
  await go(page, 'ayarlar');
  await page.waitForSelector('#settings-excel #xl-name');
  assert.equal(await text(page, '#xl-name'), FILE);
  assert.match(await text(page, '#settings-excel'), /Otomatik kayıt açık/);
  await page.click('#xl-versions-btn');
  await page.waitForSelector('dialog[open] #xl-versions');
  assert.match(await text(page, 'dialog[open] #xl-versions'), /Bağlandığı anki hâli/);
  const v = await download(page, () => page.click('dialog[open] #xl-versions .list-item:last-child button'));
  assert.match(v.name, /\.xlsx$/);
  assert.ok(readBook(v.bytes).SheetNames.includes('Ekim 2026'), 'a workbook the app kept before writing');
  await page.keyboard.press('Escape');
  assert.ok((await getFile(page, ORIG)).equals(SAMPLE), 'after every save so far, the file given to the app is exactly as it was');
  assert.match(await text(page, '#settings-excel'), new RegExp('Asıl dosya ' + ORIG.replace('.', '\\.') + ' değiştirilmez'));
  await page.click('#xl-unlink');
  await confirmDialog(page);
  await page.waitForSelector('#settings-excel #xl-none');
  assert.equal(await page.$('#excel-status'), null);
  assert.equal(await store(page, () => window.FileLink.link), null);
  assert.deepEqual(env.errors, []);
});

test('a browser that cannot write to files keeps an up-to-date copy to download', async () => {
  const other = await setup();
  try {
    const { page, base } = other;
    await other.context.addInitScript(() => {
      Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true });
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    });
    await page.goto(base);
    await page.click('#try-demo');
    await page.waitForSelector('#sheet-table');
    assert.match(await text(page, '#autosave-box'), /Bu Excel dosyasını güncel tut/);
    await page.click('#import-run');
    await page.waitForSelector('#autosave-done');
    assert.match(await text(page, '#autosave-done'), /Excel kopyası hazır/);
    assert.match(await text(page, '#excel-status'), /Excel kopyası güncel tutuluyor/);
    await go(page, 'yeni');
    await page.fill('#f-name', 'Kopya Deneme');
    await page.fill('#f-policyType', 'Trafik');
    await page.fill('#f-policyNo', 'COPY-1');
    await page.fill('#f-premium', '1200');
    await page.click('#save-policy');
    await page.waitForSelector('.toast:has-text("Kaydedildi: Kopya Deneme")');
    const file = await download(page, () => page.click('#excel-download-foot'));
    assert.equal(file.name, 'ornek-portfoy - guncel.xlsx', 'a new name: the original download is not replaced');
    const rows = rowsIn(file.bytes, 'Ekim 2026');
    assert.ok(rows.some(r => r.includes('COPY-1')), 'the new record is on its month page');
    assert.deepEqual(rowsIn(file.bytes, 'MART'), rowsIn(SAMPLE, 'MART'), 'the other pages are as they were');
    assert.deepEqual(other.errors, []);
  } finally { await other.close(); }
});
