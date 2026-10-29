import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, waitHash, loadDemo, go, text, expected, store, num, money, download, readBook, sheetRows, confirmDialog } from './helpers.mjs';

let env, showId;
test.before(async () => {
  env = await setup();
  await loadDemo(env.page, env.base);
  showId = await store(env.page, (n) => Array.from(Store.customers.values()).find(c => c.name === n).id, expected.showcase.name);
});
test.after(async () => { await env.close(); });

const rowCount = (page) => page.$$eval('.tableview tbody tr', trs => trs.length);

test('customer list: 320 customers, 50 per page, sorted by name', async () => {
  const { page } = env;
  await go(page, 'musteriler');
  assert.match(await text(page, '#customers-count'), new RegExp(num(expected.totalCustomers)));
  assert.equal(await rowCount(page), 50);
  const names = await page.$$eval('.tableview tbody td.name-cell a', as => as.map(a => a.textContent));
  const sorted = names.slice().sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
  assert.deepEqual(names, sorted);
  await page.click('.pager button:last-child');
  assert.match(await text(page, '.pager'), /51–100/);
  assert.match(await text(page, 'tfoot'), new RegExp(num(expected.totalCustomers) + ' müşteri'));
  assert.match(await text(page, 'tfoot'), new RegExp(money(expected.totalPremium).replace(/[.]/g, '\\.')));
});

test('search inside the list, filters and chips', async () => {
  const { page } = env;
  await page.fill('#customers-q', 'aydoğdu');
  await page.waitForFunction(() => document.querySelectorAll('.tableview tbody tr').length === 1);
  assert.match(await text(page, '.tableview tbody tr'), /Kemal Aydoğdu/);
  await page.fill('#customers-q', '');
  await page.waitForFunction(() => document.querySelectorAll('.tableview tbody tr').length === 50);
  await page.click('#chip-multi');
  assert.match(await text(page, '#customers-count'), new RegExp(num(expected.multiMonthCustomers) + ' müşteri'));
  await page.click('#chip-multi');
  const marchCustomers = await store(page, () => new Set(Array.from(Store.policies.values()).filter(p => p.month === '2026-03').map(p => p.customerId)).size);
  await page.selectOption('#customers-month', '2026-03');
  assert.match(await text(page, '#customers-count'), new RegExp(num(marchCustomers) + ' müşteri'));
  await page.selectOption('#customers-month', '');
  const allianz = await store(page, () => new Set(Array.from(Store.policies.values()).filter(p => U.companyKey(p.company || '') === 'allianz').map(p => p.customerId)).size);
  await page.selectOption('#customers-company', 'allianz');
  assert.match(await text(page, '#customers-count'), new RegExp(num(allianz) + ' müşteri'));
  await page.selectOption('#customers-company', '');
  await page.click('#chip-due');
  const due = await page.$$eval('.tableview tbody tr', trs => trs.length);
  assert.ok(due > 0 && due <= 50);
  await page.click('#chip-due');
});

test('sorting by total premium puts the biggest customer first', async () => {
  const { page } = env;
  const top = await store(page, () => {
    let best = null, max = -1;
    Store.customers.forEach(c => { const s = Store.summary(c.id); if (s.premium > max) { max = s.premium; best = c.name; } });
    return best;
  });
  await page.click('th:has-text("Toplam prim")');
  await page.click('th:has-text("Toplam prim")');
  assert.match(await text(page, '.tableview tbody tr:first-child td.name-cell'), new RegExp(top));
  await page.click('th:has-text("Müşteri")');
});

test('customer list export contains every customer', async () => {
  const { page } = env;
  const file = await download(page, () => page.click('#customers-export'));
  assert.match(file.name, /^musteriler-2026-10-29\.xlsx$/);
  const wb = readBook(file.bytes);
  const rows = sheetRows(wb, 'Müşteriler');
  assert.equal(rows.length, expected.totalCustomers + 1);
  assert.deepEqual(rows[0].slice(0, 3), ['Adı soyadı', 'Tc kimlik no', 'İletişim']);
});

test('customer 360: all months of the customer with every policy', async () => {
  const { page } = env;
  await go(page, 'musteri-' + showId);
  assert.equal(await text(page, '#page-title'), expected.showcase.name);
  assert.equal(await text(page, '#stat-policies'), String(expected.showcase.policyCount));
  assert.equal(await text(page, '#stat-premium'), money(expected.showcase.premium));
  const months = await page.$$eval('#customer-months .month-block', bs => bs.map(b => b.id.slice(3)));
  assert.deepEqual(months, expected.showcase.months.slice().reverse(), 'newest month first');
  assert.equal(await page.$$eval('#customer-months .policy-row', r => r.length), expected.showcase.policyCount);
  // expand a policy: every field and its source row
  await page.click('#cm-2025-11 .policy-row button[aria-expanded]');
  const detail = await text(page, '#cm-2025-11 .policy-detail');
  assert.match(detail, /ornek-portfoy\.xlsx · KASIM 2025 sayfası/);
  assert.match(detail, /34 KMA 482/);
  assert.match(detail, /Basamak/);
});

test('customer tabs: vehicles, opportunities, notes and payments', async () => {
  const { page } = env;
  await page.click('#tab-vehicles');
  assert.match(await text(page, '.tabs ~ *'), /34 KMA 482/);
  assert.match(await text(page, '.tabs ~ *'), /KM482611/);
  await page.click('#tab-opps');
  assert.match(await text(page, '.tabs ~ *'), /fırsat görünmüyor/, 'has traffic + kasko and DASK + home');
  await page.click('#tab-notes');
  await page.fill('#note-text', 'Kasko yenilemesi için 15 Kasım\'da aranacak.');
  await page.selectOption('#note-kind', 'call');
  await page.click('#note-save');
  await page.waitForSelector('.tl-item');
  assert.match(await text(page, '.timeline'), /Telefon görüşmesi/);
  assert.match(await text(page, '.timeline'), /15 Kasım/);
  await page.click('#tab-payments');
  assert.match(await text(page, '.tabs ~ *'), /Cari kaydı yok/);
  await page.click('#tab-policies');
});

test('edit customer details from the profile', async () => {
  const { page } = env;
  await page.click('#cust-edit');
  await page.waitForSelector('dialog[open] #ce-name');
  await page.fill('#ce-phone', '0533 111 22 33');
  await page.fill('#ce-email', 'kemal@ornek.com');
  await page.fill('#ce-tags', 'VIP, Mühendis kulübü');
  await page.fill('#ce-tc', '12345678901');
  assert.match(await text(page, '#ce-tc-hint'), /Kontrol haneleri tutmuyor/);
  await page.fill('#ce-tc', expected.showcase.tc);
  assert.match(await text(page, '#ce-tc-hint'), /geçerli/);
  await page.click('#ce-save');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const facts = await text(page, '#customer-profile');
  assert.match(facts, /0533 111 22 33/);
  assert.match(facts, /kemal@ornek\.com/);
  assert.match(facts, /VIP/);
  const c = await store(page, (id) => { const c = Store.customers.get(id); return [c.phone, c.phones.length]; }, showId);
  assert.equal(c[0], '5331112233');
  assert.ok(c[1] >= 2, 'the old number is kept as another phone');
});

test('task from the customer page shows up in tasks', async () => {
  const { page } = env;
  await page.click('#cust-task');
  await page.fill('dialog[open] #task-title', 'Kasko teklifini gönder');
  await page.fill('dialog[open] #task-due', '2026-10-29');
  await page.click('#task-save');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await go(page, 'gorevler');
  assert.match(await text(page, '.tabs ~ *'), /Kasko teklifini gönder/);
  assert.match(await text(page, '.tabs ~ *'), /Kemal Aydoğdu/);
});

test('print and Excel statement of one customer', async () => {
  const { page } = env;
  await go(page, 'musteri-' + showId);
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.click('#cust-print');
  assert.equal(await page.evaluate(() => window.__printed), 1);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.isVisible('.print-only'), true, 'statement is laid out for paper');
  assert.match(await text(page, '.print-only'), /Müşteri poliçe dökümü/);
  await page.emulateMedia({ media: 'screen' });
  const file = await download(page, () => page.click('#cust-export'));
  const wb = readBook(file.bytes);
  const rows = sheetRows(wb, wb.SheetNames[0]);
  assert.equal(rows.length, expected.showcase.policyCount + 1);
});

test('a policy can be moved to the right customer', async () => {
  const { page } = env;
  const seyahat = await store(page, (id) => Store.policiesOf(id).find(p => /Seyahat/.test(p.policyType)).id, showId);
  await page.click('#cm-2026-08 .policy-row button[aria-expanded]');
  await page.click('#cm-2026-08 .policy-detail button:has-text("Başka müşteriye taşı")');
  await page.fill('dialog[open] #move-q', 'mehmet yılmaz');
  await page.waitForSelector('dialog[open] .list-item');
  await page.click('dialog[open] .list-item >> nth=0');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const owner = await store(page, (pid) => Store.customers.get(Store.policies.get(pid).customerId).name, seyahat);
  assert.equal(owner, 'Mehmet Yılmaz');
  assert.equal(await text(page, '#stat-policies'), String(expected.showcase.policyCount - 1));
  // move it back for the next tests
  await store(page, ([pid, cid]) => Store.movePolicy(pid, cid), [seyahat, showId]);
});

test('delete a customer and undo', async () => {
  const { page } = env;
  await go(page, 'musteri-' + showId);
  await page.click('#cust-delete');
  await confirmDialog(page);
  await waitHash(page, '#musteriler');
  assert.equal(await store(page, (id) => Store.customers.has(id), showId), false);
  assert.equal(await store(page, () => Store.policies.size), expected.totalPolicies - expected.showcase.policyCount);
  await page.click('.toast button:has-text("Geri al")');
  await waitHash(page, '#musteri-' + showId);
  assert.equal(await store(page, () => Store.policies.size), expected.totalPolicies);
  assert.equal(await text(page, '#stat-policies'), String(expected.showcase.policyCount));
});

test('add a customer by hand, then find and merge the duplicate', async () => {
  const { page } = env;
  await go(page, 'musteriler');
  await page.click('#customers-add');
  await page.fill('dialog[open] #ce-name', 'KEMAL AYDOĞDU');
  await page.fill('dialog[open] #ce-phone', '0544 000 11 22');
  await page.click('#ce-save');
  await waitHash(page, /^#musteri-/);
  const dupId = await page.evaluate(() => location.hash.slice('#musteri-'.length));
  assert.notEqual(dupId, showId);
  await go(page, 'musteriler');
  await page.click('#btn-duplicates');
  await page.waitForSelector('dialog[open] .card');
  const group = page.locator('dialog[open] .card', { hasText: 'Kemal Aydoğdu' });
  await group.locator(`input[value="${showId}"]`).check();
  await group.locator('button:has-text("Birleştir")').click();
  await page.click('dialog[open] >> nth=1 >> button[type=submit]');
  await page.waitForSelector('.toast:has-text("birleştirildi")');
  await page.keyboard.press('Escape');
  const after = await store(page, ([a, b]) => [Store.customers.has(a), Store.customers.has(b), Store.policiesOf(a).length, Store.customers.get(a).phones.includes('5440001122')], [showId, dupId]);
  assert.deepEqual(after, [true, false, expected.showcase.policyCount, true]);
  assert.deepEqual(env.errors, []);
});
