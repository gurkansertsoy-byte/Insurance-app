import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, go, text, expected, confirmDialog, store, shot, writeBook, OUT } from './helpers.mjs';

async function freshImport(page) {
  await page.evaluate(() => { App.viewState.import = null; });
  await go(page, 'ice-aktar');
  await page.waitForSelector('#import-file', { state: 'attached' });
}

let env;
test.before(async () => { env = await setup(); });
test.after(async () => { await env.close(); });

test('welcome screen offers file, sample and manual entry', async () => {
  const { page, base } = env;
  await page.goto(base);
  await page.waitForSelector('#try-demo');
  assert.match(await text(page, '#page-title'), /Gösterge paneli/);
  assert.ok(await page.isVisible('#welcome-drop'));
  assert.ok(await page.isVisible('a[href="#yeni"]'));
});

test('sample file preview: 13 sheets, each with the right month and row count', async () => {
  const { page } = env;
  await page.click('#try-demo');
  await page.waitForSelector('#sheet-table');
  assert.equal(await text(page, '#import-file-name'), 'ornek-portfoy.xlsx');
  const rows = await page.$$eval('#sheet-table tbody tr', trs => trs.map(tr => ({
    name: tr.querySelector('.name-cell').firstChild.textContent,
    month: tr.querySelector('select').value + '-' + tr.querySelectorAll('select')[1].value,
    rows: Number(tr.querySelector('td.r strong').textContent.replace(/\D/g, '')),
    included: tr.querySelector('input[type=checkbox]').checked
  })));
  assert.equal(rows.length, 13);
  for (const r of rows) {
    const key = expected.sheetMonths[r.name];
    assert.ok(key, 'known sheet ' + r.name);
    const [y, m] = key.split('-');
    assert.equal(r.month, Number(m) + '-' + y, 'month of ' + r.name);
    assert.equal(r.rows, expected.months[key].count, 'rows of ' + r.name);
    assert.equal(r.included, true);
  }
  // MART has no year in its name: the year comes from the dates
  const mart = await text(page, '#sheet-row-5 td:nth-child(3) .hint');
  assert.match(mart, /yıl tarihlerden/);
  assert.match(await text(page, '#sheet-row-4'), /\+ MARKA/, 'custom columns shown');
  assert.match(await text(page, '#sheet-row-2'), /Tekrarlanan sütun/, 'duplicate columns shown');
});

test('column mapping editor shows every column and remaps on change', async () => {
  const { page } = env;
  await page.click('#map-btn-6'); // Nisan 2026 uses different header wording
  await page.waitForSelector('dialog[open] .map-row');
  const mapping = await page.$$eval('dialog[open] .map-row', trs => trs.map(tr => [tr.querySelector('strong').textContent, tr.querySelector('select').value]));
  const m = Object.fromEntries(mapping);
  assert.equal(m['Branş'], 'policyType');
  assert.equal(m['Vade Sonu'], 'endDate');
  assert.equal(m['Müşteri Adı Soyadı'], 'name');
  assert.equal(m['Brüt Prim'], 'premium');
  assert.equal(m['Kredi Kartı'], 'card');
  assert.equal(m['Temsilci'], 'agent');
  // map "Açıklama" to "do not import", then back
  const idx = mapping.findIndex(x => x[0] === 'Açıklama');
  const sel = `dialog[open] .map-row:nth-child(${idx + 1}) select`;
  await page.selectOption(sel, '_ignore');
  assert.equal(await page.$eval(sel, s => s.value), '_ignore');
  await page.selectOption(sel, 'note');
  assert.equal(await page.$eval(sel, s => s.value), 'note');
  await page.click('dialog[open] .modal-foot .btn-primary');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
});

test('import adds 703 policies and 320 customers and lists the 3 TC typos', async () => {
  const { page } = env;
  await shot(page, 'e2e-import-preview', { fullPage: true });
  await page.click('#import-run');
  await page.waitForSelector('#import-done');
  const n = async (id) => Number((await text(page, id + ' .v')).replace(/\D/g, ''));
  assert.equal(await n('#res-added'), expected.totalPolicies);
  assert.equal(await n('#res-customers'), expected.totalCustomers);
  assert.equal(await n('#res-updated'), 0);
  assert.equal(await n('#res-issues'), expected.brokenTcRows);
  assert.equal(await page.$$eval('#import-issues tbody tr', trs => trs.length), expected.brokenTcRows);
  const counts = await store(page, () => [Store.customers.size, Store.policies.size, DB.kind]);
  assert.deepEqual(counts, [expected.totalCustomers, expected.totalPolicies, 'indexeddb']);
});

test('importing the same file again adds nothing', async () => {
  const { page } = env;
  await freshImport(page);
  await page.click('#import-demo');
  await page.waitForSelector('#sheet-table');
  await page.click('#import-run');
  await page.waitForSelector('#import-done');
  const n = async (id) => Number((await text(page, id + ' .v')).replace(/\D/g, ''));
  assert.equal(await n('#res-added'), 0);
  assert.equal(await n('#res-unchanged'), expected.totalPolicies);
  assert.equal(await n('#res-customers'), 0);
  assert.equal(await store(page, () => Store.policies.size), expected.totalPolicies);
});

test('CSV file chosen with the file picker: month from the file name, then undo from history', async () => {
  const { page } = env;
  // (Playwright cannot attach files whose path has non-ASCII letters, so the Turkish name is sent as a buffer)
  const csv = Buffer.from('Poliçe adı;Poliçe bitiş tarihi;Adı soyadı;Tc kimlik no;İletişim;Şirket poliçe tutarı;Komisyon;Nakit\n' +
    'Trafik;10.11.2027;DENİZ ARSLAN;10000000146;0532 999 88 77;9.850,00;788,00;9.850,00\nDASK;12.11.2027;Deniz Arslan;10000000146;;1.450,00;246,50;1.450,00\n');
  await freshImport(page);
  await page.setInputFiles('#import-file', { name: 'Kasım 2026.csv', mimeType: 'text/csv', buffer: csv });
  await page.waitForSelector('#sheet-table');
  assert.equal(await page.$eval('#sheet-month-0', s => s.value), '11');
  assert.equal(await page.$eval('#sheet-month-0-y', s => s.value), '2026');
  assert.match(await text(page, '#sheet-row-0'), /Dosya adından/);
  await page.click('#import-run');
  await page.waitForSelector('#import-done');
  const c = await store(page, () => { const c = Array.from(Store.customers.values()).find(x => x.tc === '10000000146'); return c && { name: c.name, n: Store.policiesOf(c.id).length, phone: c.phone }; });
  assert.deepEqual(c, { name: 'Deniz Arslan', n: 2, phone: '5329998877' });
  // undo the CSV import from the history list
  await page.click('#import-history .list-item:first-child button');
  await confirmDialog(page);
  assert.equal(await store(page, () => Store.policies.size), expected.totalPolicies);
  assert.equal(await store(page, () => Array.from(Store.customers.values()).some(x => x.tc === '10000000146')), false);
});

test('a sheet without a month blocks the import until a month is chosen; dropped files work', async () => {
  const { page } = env;
  const file = writeBook('liste.xlsx', [{ name: 'Liste', rows: [['Poliçe adı', 'Adı soyadı', 'Plaka', 'Şirket poliçe tutarı'], ['Kasko', 'Selin Ova', '35 ka 778', 31000]] }]);
  await freshImport(page);
  // drop the file on the drop zone
  const bytes = fs.readFileSync(file).toString('base64');
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([arr], 'liste.xlsx'));
    document.getElementById('import-drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bytes);
  await page.waitForSelector('#sheet-table');
  assert.ok(await page.isVisible('#missing-month'));
  await page.click('#import-run');
  await page.waitForSelector('.toast.bad');
  assert.equal(await store(page, () => Store.policies.size), expected.totalPolicies, 'nothing imported yet');
  await page.selectOption('#sheet-month-0', '9');
  await page.selectOption('#sheet-month-0-y', '2026');
  await page.waitForSelector('#missing-month', { state: 'detached' });
  await page.click('#import-run');
  await page.waitForSelector('#import-done');
  const p = await store(page, () => { const c = Array.from(Store.customers.values()).find(x => x.name === 'Selin Ova'); const ps = Store.policiesOf(c.id); return ps.map(p => [p.month, p.plate, p.premium]); });
  assert.deepEqual(p, [['2026-09', '35 KA 778', 31000]]);
});

test('replace mode deletes everything else after a confirmation', async () => {
  const { page } = env;
  const file = writeBook('tek-ay.xlsx', [{ name: 'Ocak 2027', rows: [['Poliçe adı', 'Adı soyadı', 'Tc kimlik no'], ['Trafik', 'Ece Nar', '10000000146']] }]);
  await freshImport(page);
  await page.setInputFiles('#import-file', file);
  await page.waitForSelector('#sheet-table');
  await page.check('#mode-replace');
  await page.click('#import-run');
  await page.waitForSelector('dialog[open]');
  await confirmDialog(page);
  await page.waitForSelector('#import-done');
  assert.deepEqual(await store(page, () => [Store.customers.size, Store.policies.size]), [1, 1]);
  // reload: the data is still there (IndexedDB)
  await page.reload();
  await page.waitForFunction(() => window.Store && Store.loaded);
  assert.deepEqual(await store(page, () => [Store.customers.size, Store.policies.size]), [1, 1]);
  assert.deepEqual(env.errors, []);
});
