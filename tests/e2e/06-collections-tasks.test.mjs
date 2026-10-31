import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, waitHash, loadDemo, go, text, expected, store, money, confirmDialog } from './helpers.mjs'; // eslint-disable-line no-unused-vars

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); });
test.after(async () => { await env.close(); });

test('no Tahsilat (cari) page any more; a payment can still be noted on the customer card', async () => {
  const { page } = env;
  assert.equal(await page.$('nav a[href="#tahsilat"]'), null, 'not in the menu');
  await go(page, 'tahsilat');
  assert.equal(await text(page, '#page-title'), 'Gösterge paneli', 'the old address opens the dashboard');
  const top = await store(page, () => {
    const p = Array.from(Store.policies.values()).filter(x => x.account > 0).sort((a, b) => b.account - a.account)[0];
    return { id: p.id, account: p.account, customerId: p.customerId };
  });
  await go(page, 'musteri-' + top.customerId);
  await page.click('#tab-payments');
  await page.click('.tabs ~ * button:has-text("Tahsilat gir")');
  await page.waitForSelector('dialog[open] #pay-amount');
  await page.fill('#pay-amount', '0');
  await page.click('#pay-save');
  assert.match(await text(page, 'dialog[open] .hint.bad'), /sıfırdan büyük/);
  await page.fill('#pay-amount', '10.000,00');
  await page.fill('#pay-note', 'İlk taksit');
  await page.click('#pay-save');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  assert.equal(await store(page, (id) => Portfolio.paidOnAccount(Store.policies.get(id)), top.id), 10000);
  assert.match(await text(page, '.tabs ~ *'), /İlk taksit/);
});

test('tasks: quick add, complete, edit to overdue, delete with undo', async () => {
  const { page } = env;
  await go(page, 'gorevler');
  await page.fill('#quick-task', 'Ofis sigortası teklifini hazırla');
  await page.click('#quick-add');
  await page.waitForSelector('.task-item');
  assert.match(await text(page, '#ttab-today'), /Bugün\s*1/);
  assert.match(await text(page, '.nav-item[href="#gorevler"]'), /1/, 'badge in the menu');
  const id = await store(page, () => Array.from(Store.tasks.values())[0].id);
  // ticking a task moves it to another tab (the row is re-rendered), so click rather than check()
  await page.click('#task-' + id + ' input[type=checkbox]');
  assert.match(await text(page, '#ttab-done'), /Tamamlanan\s*1/);
  assert.equal(await store(page, (tid) => Store.tasks.get(tid).done, id), true);
  await page.click('#ttab-done');
  await page.click('#task-' + id + ' input[type=checkbox]');
  assert.equal(await store(page, (tid) => Store.tasks.get(tid).done, id), false);
  await page.click('#ttab-today');
  await page.click('#task-' + id + ' button[title="Düzenle"]');
  await page.fill('dialog[open] #task-due', '2026-10-20');
  await page.click('#task-save');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await page.click('#ttab-overdue');
  assert.match(await text(page, '#task-' + id), /9 gün gecikti/);
  await page.click('#task-' + id + ' button[title="Sil"]');
  assert.equal(await store(page, () => Store.tasks.size), 0);
  await page.click('.toast button:has-text("Geri al")');
  assert.equal(await store(page, () => Store.tasks.size), 1);
});

test('a detailed task linked to a customer', async () => {
  const { page } = env;
  await page.click('button:has-text("Ayrıntılı ekle")');
  await page.fill('dialog[open] #task-title', 'DASK poliçesini sor');
  await page.fill('dialog[open] #task-customer', 'kemal ay');
  await page.waitForSelector('dialog[open] .suggest:not([hidden]) button');
  await page.click('dialog[open] .suggest button >> nth=0');
  await page.fill('dialog[open] #task-due', '2026-10-31');
  await page.click('#task-save');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await page.click('#ttab-upcoming');
  const item = page.locator('.task-item', { hasText: 'DASK poliçesini sor' });
  assert.match(await item.textContent(), /Kemal Aydoğdu/);
  await item.locator('a').click();
  await waitHash(page, /^#musteri-/);
  assert.equal(await text(page, '#page-title'), expected.showcase.name);
  // the dashboard lists today's and overdue tasks
  await go(page, 'panel');
  assert.match(await text(page, '#card-tasks'), /Ofis sigortası teklifini hazırla/);
  assert.deepEqual(env.errors, []);
});
