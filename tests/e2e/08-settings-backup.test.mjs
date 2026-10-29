import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, waitHash, loadDemo, go, text, expected, store, download, readBook, sheetRows, confirmDialog, OUT } from './helpers.mjs';

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); });
test.after(async () => { await env.close(); });

test('agency details are saved and shown in the menu', async () => {
  const { page } = env;
  await go(page, 'ayarlar');
  await page.fill('#set-agency', 'Yıldız Sigorta Aracılık');
  await page.fill('#set-phone', '0212 555 44 33');
  await page.click('#save-agency');
  await page.waitForSelector('.toast:has-text("Ayarlar kaydedildi")');
  assert.equal(await text(page, '.brand-name'), 'Yıldız Sigorta Aracılık');
  assert.equal(await text(page, '.brand-mark'), 'YA');
  assert.match(await page.title(), /Yıldız Sigorta Aracılık/);
});

test('language switch to English and back', async () => {
  const { page } = env;
  await page.selectOption('#set-lang', 'en');
  assert.equal(await text(page, '#page-title'), 'Settings & backup');
  assert.equal(await text(page, '.nav-item[href="#musteriler"] span'), 'Customers');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  await page.click('#lang-btn');
  assert.equal(await text(page, '#page-title'), 'Ayarlar ve yedek');
  assert.equal(await page.evaluate(() => window.I18N.missing.size), 0, 'no missing texts');
});

test('dark, light and device themes', async () => {
  const { page } = env;
  await page.click('#theme-dark');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(11, 19, 18)');
  await page.click('#theme-light');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.click('#theme-system');
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-theme')), false);
  await page.click('#theme-btn');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'top bar button cycles the theme');
  await page.click('#theme-btn');
  await page.click('#theme-btn');
});

test('ID masking and rows per page', async () => {
  const { page } = env;
  await page.check('#set-mask');
  await page.selectOption('#set-page', '25');
  await go(page, 'musteriler');
  assert.equal(await page.$$eval('.tableview tbody tr', r => r.length), 25);
  const tc = await text(page, '.tableview tbody tr:first-child td:nth-child(2)');
  assert.match(tc, /^\d{3}•+\d{2}$/);
  await go(page, 'ayarlar');
  await page.uncheck('#set-mask');
  await page.selectOption('#set-page', '50');
});

test('WhatsApp template with placeholders and live preview', async () => {
  const { page } = env;
  await page.fill('#set-template', 'Sayın {adsoyad}, {police} poliçeniz {bitis} günü bitiyor. {acente}');
  assert.match(await text(page, '#tpl-preview'), /Sayın Ayşe Yılmaz, Trafik poliçeniz .* günü bitiyor\. Yıldız Sigorta Aracılık/);
  await page.click('#save-template');
  await go(page, 'yenilemeler');
  const href = await page.locator('.tableview tbody tr', { hasText: 'Kemal Aydoğdu' }).locator('a:has-text("WhatsApp")').getAttribute('href');
  assert.match(decodeURIComponent(href), /Sayın Kemal Aydoğdu, Trafik Sigortası poliçeniz 21\.11\.2026 günü bitiyor\. Yıldız Sigorta Aracılık/);
});

let backupPath;
test('backup file contains everything', async () => {
  const { page } = env;
  await go(page, 'ayarlar');
  const file = await download(page, () => page.click('#backup-btn'));
  assert.equal(file.name, 'sigorta-portfoy-yedek-2026-10-29.json');
  const data = JSON.parse(file.bytes.toString('utf8'));
  assert.equal(data.app, 'sigorta-portfoy');
  assert.equal(data.customers.length, expected.totalCustomers);
  assert.equal(data.policies.length, expected.totalPolicies);
  assert.equal(Object.keys(data.months).length, 13);
  backupPath = path.join(OUT, file.name);
  fs.writeFileSync(backupPath, file.bytes);
  assert.match(await text(page, '#backup'), /Son yedek: 29\.10\.2026/);
});

test('whole portfolio to Excel: summary, 13 months and customers', async () => {
  const { page } = env;
  const file = await download(page, () => page.click('#export-all'));
  const wb = readBook(file.bytes);
  assert.equal(wb.SheetNames.length, 15);
  assert.equal(wb.SheetNames[0], 'Özet');
  assert.equal(wb.SheetNames[14], 'Müşteriler');
  const summary = sheetRows(wb, 'Özet');
  assert.equal(summary[summary.length - 1][1], expected.totalPolicies);
  assert.equal(sheetRows(wb, 'Ekim 2026').length - 1, expected.months['2026-10'].count);
});

test('delete everything (typed confirmation), then restore the backup', async () => {
  const { page } = env;
  await page.click('#clear-btn');
  await confirmDialog(page, 'SİL');
  await page.waitForSelector('#try-demo');
  assert.deepEqual(await store(page, () => [Store.customers.size, Store.policies.size]), [0, 0]);
  await go(page, 'ayarlar');
  await page.setInputFiles('#restore-file', backupPath);
  await page.waitForSelector('dialog[open]');
  assert.match(await text(page, 'dialog[open]'), new RegExp(expected.totalCustomers + ' müşteri'));
  await confirmDialog(page);
  await waitHash(page, '#panel');
  assert.deepEqual(await store(page, () => [Store.customers.size, Store.policies.size, Object.keys(Store.months).length]), [expected.totalCustomers, expected.totalPolicies, 13]);
  // a file that is not a backup is refused
  const bad = path.join(OUT, 'not-a-backup.json');
  fs.writeFileSync(bad, '{"hello": 1}');
  await go(page, 'ayarlar');
  await page.setInputFiles('#restore-file', bad);
  await page.waitForSelector('.toast.bad');
});

test('everything survives a page reload', async () => {
  const { page } = env;
  await page.reload();
  await page.waitForFunction(() => window.Store && Store.loaded);
  assert.deepEqual(await store(page, () => [Store.customers.size, Store.policies.size, Store.settings.agencyName]), [expected.totalCustomers, expected.totalPolicies, 'Yıldız Sigorta Aracılık']);
  await go(page, 'ayarlar');
  assert.match(await text(page, '#storage-counts'), new RegExp(expected.totalCustomers + ' müşteri'));
  assert.match(await text(page, '#settings-storage'), /Tarayıcı veritabanı/);
  assert.deepEqual(env.errors, []);
});
