import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, waitHash, loadDemo, go, text, expected, store, download, readBook, sheetRows, confirmDialog } from './helpers.mjs';

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); });
test.after(async () => { await env.close(); });

const bucket = async (page, id) => Number((await text(page, '#bucket-' + id + ' .n')).replace(/\D/g, ''));

test('renewal overview: due, expired, renewed and retention', async () => {
  const { page } = env;
  await go(page, 'yenilemeler');
  assert.equal(await text(page, '#renewals-due'), String(expected.dueIn30Days));
  assert.equal(await bucket(page, 'd30all'), expected.dueIn30Days);
  assert.equal(await bucket(page, 'renewed'), expected.renewalsInFile);
  const expired = await bucket(page, 'expired');
  assert.equal(await text(page, '#renewals-retention'), '%' + Math.round(expected.renewalsInFile / (expected.renewalsInFile + expired) * 100));
  const buckets = await Promise.all(['d7', 'd15', 'd30'].map(b => bucket(page, b)));
  assert.equal(buckets[0] + buckets[1] + buckets[2], expected.dueIn30Days, '0–7 + 8–15 + 16–30 = 30-day window');
  assert.equal(await page.$$eval('.tableview tbody tr', r => r.length), expected.dueIn30Days);
  const days = await page.$$eval('.tableview tbody tr td:first-child .pill', ps => ps.map(p => p.textContent));
  assert.equal(days[0], 'Bugün bitiyor', 'sorted by expiry');
});

test('bucket chips and search filter the list', async () => {
  const { page } = env;
  await page.click('#bucket-d7');
  const n7 = await bucket(page, 'd7');
  assert.equal(await page.$$eval('.tableview tbody tr', r => r.length), n7);
  await page.click('#bucket-renewed');
  assert.equal(await page.$$eval('.tableview tbody tr', r => r.length), expected.renewalsInFile);
  assert.match(await text(page, '.tableview tbody tr:first-child'), /Yenilendi/);
  await page.click('#bucket-d30all');
  await page.fill('#renewals-q', 'kemal');
  await page.waitForFunction(() => document.querySelectorAll('.tableview tbody tr').length === 1);
  assert.match(await text(page, '.tableview tbody tr'), /Kemal Aydoğdu/);
  await page.fill('#renewals-q', '');
  await page.waitForFunction((n) => document.querySelectorAll('.tableview tbody tr').length === n, expected.dueIn30Days);
});

test('WhatsApp link carries a ready Turkish message; copy works', async () => {
  const { page } = env;
  const row = page.locator('.tableview tbody tr', { hasText: 'Kemal Aydoğdu' });
  const href = await row.locator('a:has-text("WhatsApp")').getAttribute('href');
  assert.match(href, /^https:\/\/wa\.me\/90\d{10}\?text=/);
  const msg = decodeURIComponent(href.split('text=')[1]);
  assert.match(msg, /^Merhaba Kemal, Trafik Sigortası poliçeniz \(34 KMA 482\) 21\.11\.2026 tarihinde sona eriyor\./);
  await row.locator('button[title="Mesajı kopyala"]').click();
  await page.waitForSelector('.toast:has-text("Mesaj kopyalandı")');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), msg);
});

test('status changes are saved; a lost policy asks for the reason', async () => {
  const { page } = env;
  const id = await store(page, () => {
    const d = Store.derived();
    return d.policies.filter(p => d.renewal.get(p.id).state === 'due').sort((a, b) => a.endDate < b.endDate ? -1 : 1)[0].id;
  });
  await page.selectOption('#st-' + id, 'contacted');
  assert.equal(await store(page, (pid) => Store.policies.get(pid).renewal.status, id), 'contacted');
  await page.selectOption('#st-' + id, 'lost');
  await page.waitForSelector('dialog[open] #lost-reason');
  await page.selectOption('#lost-reason', 'competitor');
  await page.fill('#lost-note', 'Banka sigortası yaptırdı');
  await page.click('dialog[open] button[type=submit]');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  const r = await store(page, (pid) => Store.policies.get(pid).renewal, id);
  assert.equal(r.status, 'lost');
  assert.match(r.note, /Başka acenteye gitti – Banka sigortası yaptırdı/);
  assert.equal(await bucket(page, 'lost'), 1);
  assert.equal(await bucket(page, 'd30all'), expected.dueIn30Days - 1);
});

test('reminder task from a renewal row', async () => {
  const { page } = env;
  const row = page.locator('.tableview tbody tr', { hasText: 'Kemal Aydoğdu' });
  await row.locator('button[title="Hatırlatma görevi oluştur"]').click();
  await page.waitForSelector('dialog[open] #task-title');
  assert.match(await page.inputValue('#task-title'), /Trafik Sigortası yenilemesi 34 KMA 482/);
  assert.equal(await page.inputValue('#task-due'), '14.11.2026', 'one week before expiry');
  await page.click('#task-save');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  assert.equal(await store(page, () => Array.from(Store.tasks.values()).filter(t => /34 KMA 482/.test(t.title)).length), 1);
});

test('renewing a policy pre-fills the form and closes the old policy', async () => {
  const { page } = env;
  const old = await store(page, (name) => {
    const c = Array.from(Store.customers.values()).find(x => x.name === name);
    return Store.policiesOf(c.id).find(p => /Trafik/.test(p.policyType));
  }, expected.showcase.name);
  await page.click('#renew-' + old.id);
  await waitHash(page, '#yenile-' + old.id);
  assert.equal(await text(page, '#page-title'), 'Poliçe yenileme');
  assert.match(await text(page, '.callout'), /Yenileme kaydı/);
  assert.match(await text(page, '#chosen-customer'), /Kemal Aydoğdu/);
  assert.equal(await page.inputValue('#f-policyType'), old.policyType);
  assert.equal(await page.inputValue('#f-plate'), '34 KMA 482');
  assert.equal(await page.inputValue('#f-startDate'), old.endDate.split('-').reverse().join('.'));
  assert.equal(await page.inputValue('#f-endDate'), '21.11.2027');
  assert.equal(await page.$eval('#f-newBusiness button[aria-pressed="true"]', b => b.textContent), 'Yenileme');
  assert.equal(await page.inputValue('#f-policyNo'), '', 'a new policy number is needed');
  await page.fill('#f-premium', '22.000');
  assert.match(await text(page, '#f-premium-hint'), /Önceki prim/);
  await page.fill('#f-policyNo', 'HD-2026-YENI');
  await page.click('#save-policy');
  await waitHash(page, /^#musteri-/);
  const after = await store(page, (oid) => {
    const d = Store.derived();
    const p = Store.policies.get(oid);
    const n = Array.from(Store.policies.values()).find(x => x.policyNo === 'HD-2026-YENI');
    return { oldState: d.renewal.get(oid).state, manual: p.renewal && p.renewal.status, month: n.month, prem: n.premium, nb: n.newBusiness };
  }, old.id);
  assert.deepEqual(after, { oldState: 'renewed', manual: 'renewed', month: '2026-10', prem: 22000, nb: false });
  await go(page, 'yenilemeler');
  assert.equal(await bucket(page, 'renewed'), expected.renewalsInFile + 1);
});

test('renewal window setting changes the list', async () => {
  const { page } = env;
  const within60 = await store(page, () => {
    const d = Store.derived();
    return d.policies.filter(p => { const i = d.renewal.get(p.id); return i.daysLeft != null && i.daysLeft >= 0 && i.daysLeft <= 60 && ['due', 'active'].includes(i.state); }).length;
  });
  await go(page, 'ayarlar');
  await page.selectOption('#set-window', '60');
  await go(page, 'yenilemeler');
  assert.equal(await bucket(page, 'd30all'), within60);
  assert.match(await text(page, '#bucket-d30all'), /60 gün içinde/);
  const file = await download(page, () => page.click('#renewals-export'));
  const rows = sheetRows(readBook(file.bytes), 'Yenilemeler');
  assert.equal(rows.length, within60 + 1);
  assert.deepEqual(env.errors, []);
});
