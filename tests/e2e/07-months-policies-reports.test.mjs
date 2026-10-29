import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, waitHash, loadDemo, go, text, expected, store, money, num, download, readBook, sheetRows, confirmDialog, XLSX, ROOT } from './helpers.mjs';

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); });
test.after(async () => { await env.close(); });

const original = XLSX.read(fs.readFileSync(path.join(ROOT, 'sample-data', 'ornek-portfoy.xlsx')), { type: 'buffer' });

test('months: one card per sheet with its own totals', async () => {
  const { page } = env;
  await go(page, 'aylar');
  const cards = await page.$$eval('.month-card', cs => cs.map(c => c.id.slice(6)));
  assert.equal(cards.length, 13);
  for (const key of Object.keys(expected.months)) {
    const v = await text(page, `#month-${key} .kv > div:first-child .v`);
    assert.equal(v, String(expected.months[key].count), key);
  }
  assert.match(await text(page, '#month-2026-03 .src'), /ornek-portfoy\.xlsx › MART/);
});

test('a month opens exactly like its Excel page', async () => {
  const { page } = env;
  await page.click('#month-2026-03');
  await waitHash(page, '#ay-2026-03');
  assert.equal(await text(page, '#month-count'), String(expected.months['2026-03'].count));
  const head = await page.$$eval('table.sheet thead th', ths => ths.map(t => t.textContent.replace(/[▲▼]/g, '').trim()).filter(Boolean));
  const fullHead = Array.from(XLSX.utils.sheet_to_json(original.Sheets.MART, { header: 1 })[0]);
  const excelHead = fullHead.slice(0, fullHead.indexOf(undefined));
  assert.deepEqual(head, excelHead, 'same headers, same order, duplicates included; the İptal block is shown on its own');
  assert.equal(await page.$$eval('table.sheet tbody tr', r => r.length), expected.months['2026-03'].count);
  await page.fill('#month-q', 'kemal');
  await page.waitForFunction(() => document.querySelectorAll('table.sheet tbody tr').length === 2);
  await page.fill('#month-q', '');
  await page.click('#month-next');
  await waitHash(page, '#ay-2026-04');
  await page.click('#month-prev');
  await waitHash(page, '#ay-2026-03');
});

test('month export keeps the column layout and every row', async () => {
  const { page } = env;
  const file = await download(page, () => page.click('#month-export'));
  assert.equal(file.name, 'mart-2026.xlsx');
  const rows = sheetRows(readBook(file.bytes), 'Mart 2026');
  const excelRows = XLSX.utils.sheet_to_json(original.Sheets.MART, { header: 1 });
  const plainRow = (r) => Array.from(r).map(v => v === undefined ? null : v);
  assert.deepEqual(plainRow(rows[0]), plainRow(excelRows[0]), 'main columns, an empty column, then the İptal block');
  assert.equal(rows.length, excelRows.length);
  const iptal = rows.slice(1).map(r => r.slice(-6)).filter(r => r.some(v => v != null));
  assert.equal(iptal.length, expected.cancellations.byMonth['2026-03'], 'the month\'s İptal rows');
});

test('"add to this month" opens the form on that month', async () => {
  const { page } = env;
  await page.click('#month-add');
  await waitHash(page, '#yeni-ay-2026-03');
  assert.equal(await page.$eval('#f-month', s => s.value), '3');
  assert.equal(await page.$eval('#f-month-y', s => s.value), '2026');
});

test('policy list: totals, filters and export', async () => {
  const { page } = env;
  await go(page, 'policeler');
  const count = async () => Number((await text(page, '#policies-count')).replace(/\D/g, ''));
  assert.equal(await count(), expected.totalPolicies);
  assert.match(await text(page, 'tfoot'), new RegExp(money(expected.totalPremium).replace(/\./g, '\\.')));
  await page.selectOption('#policies-from', '2026-01');
  await page.selectOption('#policies-to', '2026-03');
  assert.equal(await count(), ['2026-01', '2026-02', '2026-03'].reduce((s, k) => s + expected.months[k].count, 0));
  await page.selectOption('#policies-from', '');
  await page.selectOption('#policies-to', '');
  await page.selectOption('#policies-company', 'allianz');
  assert.equal(await count(), expected.byInsurer.Allianz);
  await page.selectOption('#policies-company', '');
  await page.selectOption('#policies-cat', 'kasko');
  assert.equal(await count(), expected.byKind.kasko);
  await page.selectOption('#policies-cat', 'saglik');
  assert.equal(await count(), expected.byKind.tss + expected.byKind.saglik);
  await page.selectOption('#policies-cat', '');
  await page.selectOption('#policies-nb', 'new');
  assert.equal(await count(), expected.newBusiness);
  await page.selectOption('#policies-nb', '');
  await page.selectOption('#policies-state', 'renewed');
  assert.equal(await count(), expected.renewalsInFile);
  await page.selectOption('#policies-state', '');
  await page.fill('#policies-q', '34 kma 482');
  await page.waitForFunction(() => document.querySelectorAll('.tableview tbody tr').length === 2);
  await page.fill('#policies-q', '');
  await page.selectOption('#policies-pay', 'account');
  const withAccount = await count();
  const file = await download(page, () => page.click('#policies-export'));
  const rows = sheetRows(readBook(file.bytes), 'Poliçeler');
  assert.equal(rows.length, withAccount + 1, 'exports the filtered rows');
  await page.click('button:has-text("Filtreleri temizle")');
  assert.equal(await count(), expected.totalPolicies);
});

test('reports: totals, date range and Excel report', async () => {
  const { page } = env;
  await go(page, 'raporlar');
  assert.equal(await text(page, '#rep-count'), num(expected.totalPolicies));
  assert.equal(await page.getAttribute('#rep-premium', 'title'), money(expected.totalPremium));
  assert.equal(await page.getAttribute('#rep-commission', 'title'), money(expected.totalCommission));
  await page.selectOption('#rep-from', '2026-07');
  await page.selectOption('#rep-to', '2026-09');
  const keys = ['2026-07', '2026-08', '2026-09'];
  assert.equal(await text(page, '#rep-count'), num(keys.reduce((s, k) => s + expected.months[k].count, 0)));
  const prem = Math.round(keys.reduce((s, k) => s + expected.months[k].premium, 0) * 100) / 100;
  assert.equal(await page.getAttribute('#rep-premium', 'title'), money(prem));
  await page.click('#rep-monthly .table-toggle');
  assert.equal(await page.$$eval('#rep-monthly tbody tr', r => r.length), 3);
  const file = await download(page, () => page.click('#report-export'));
  const wb = readBook(file.bytes);
  assert.equal(wb.SheetNames.length, 5);
  assert.equal(wb.SheetNames[4], 'İptaller');
  const monthly = sheetRows(wb, wb.SheetNames[0]);
  assert.equal(monthly.length, 1 + 3 + 1, 'header, 3 months, total');
  assert.equal(monthly[4][1], keys.reduce((s, k) => s + expected.months[k].count, 0));
  await page.selectOption('#rep-from', '');
  await page.selectOption('#rep-to', '');
  assert.match(await text(page, '#rep-retention'), /Ekim 2026/);
  assert.ok((await page.$$('#rep-opps tbody tr')).length > 0, 'cross-sell list');
});

test('deleting a month needs the month name typed', async () => {
  const { page } = env;
  await go(page, 'ay-2026-03');
  await page.click('#month-delete');
  await page.fill('dialog[open] #confirm-text', 'yanlış');
  await page.click('dialog[open] button[type=submit]');
  assert.ok(await page.isVisible('dialog[open]'), 'wrong text keeps the dialog open');
  await confirmDialog(page, 'MART 2026');
  await waitHash(page, '#aylar');
  assert.equal(await store(page, () => Store.policies.size), expected.totalPolicies - expected.months['2026-03'].count);
  assert.equal(await page.$('#month-2026-03'), null);
  assert.deepEqual(env.errors, []);
});
