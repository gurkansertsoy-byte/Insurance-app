// The agency's picture in the top-left corner, the same month across years, and the renewal-rate table.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setup, waitHash, loadDemo, go, text, store, num, ROOT } from './helpers.mjs';

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); });
test.after(async () => { await env.close(); });

const LOGO = path.join(ROOT, 'tests', 'e2e', 'fixtures', 'logo.png');

test('a click on the top-left square chooses a picture; it stays after a reload and can be removed', async () => {
  const { page } = env;
  await go(page, 'panel');
  assert.match(await page.getAttribute('#brand-logo', 'aria-label'), /Resim seç/);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#brand-logo')]);
  await chooser.setFiles(LOGO);
  // the picture opens large to be arranged; Tamam keeps what is in the frame
  await page.waitForSelector('dialog[open] #logo-canvas');
  await page.click('#logo-save');
  await page.waitForSelector('#brand-logo img');
  const src = await page.getAttribute('#brand-logo img', 'src');
  assert.match(src, /^data:image\/(png|jpeg);base64,/);
  // a 192 px square
  const size = await page.evaluate((s) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = s; }), src);
  assert.deepEqual(size, [192, 192]);
  assert.match(await page.getAttribute('#brand-logo', 'aria-label'), /Resmi değiştir/);
  await page.reload();
  await page.waitForSelector('#brand-logo img');
  // settings show it, and remove it (with undo)
  await go(page, 'ayarlar');
  await page.waitForSelector('#settings-logo img');
  await page.click('#logo-remove');
  await page.waitForSelector('#brand-logo img', { state: 'detached' });
  assert.equal(await store(page, () => Store.settings.logo), '');
  await page.click('.toast button:has-text("Geri al")');
  await page.waitForSelector('#brand-logo img');
  // a file that is no picture is refused
  const [c2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#logo-pick')]);
  await c2.setFiles({ name: 'not-a-picture.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForSelector('.toast.bad');
  assert.equal(await store(page, () => Store.settings.logo.slice(0, 10)), 'data:image');
  assert.deepEqual(env.errors, []);
});

test('the same month in every year: premium, commission, customers and policies side by side', async () => {
  const { page } = env;
  // October of a third year, written by hand
  await store(page, () => {
    const c = Store.saveCustomer({ name: 'Eski Müşteri', phone: '0532 000 00 09' });
    Store.savePolicy({ customerId: c.id, policy: { month: '2024-10', policyType: 'Kasko', policyNo: 'OLD-2024-1', premium: 50000, commission: 7000, endDate: '2025-10-15' } });
  });
  const rows = await store(page, () => App.sameMonthRows('10').map(r => [r.key, r.premium, r.commission, r.customers, r.count]));
  assert.deepEqual(rows.map(r => r[0]), ['2024-10', '2025-10', '2026-10']);
  assert.deepEqual(rows[0].slice(1), [50000, 7000, 1, 1]);
  await go(page, 'aylar');
  await waitHash(page, '#aylar');
  await page.selectOption('#same-month-month', '10');
  assert.match(await text(page, '#same-month .card-head'), /Ekim ayı, yıllara göre/);
  assert.match(await text(page, '#same-month .card-head'), /2024, 2025, 2026/);
  for (const m of ['premium', 'commission', 'customers', 'count']) {
    assert.equal(await page.$$eval(`#same-month-panels [data-measure="${m}"] svg path.mark`, p => p.length), 3, m + ': three Octobers');
  }
  // the latest October against the one before
  const up = rows[2][1] >= rows[1][1];
  assert.match(await text(page, '#same-month-panels [data-measure="premium"] .same-head'), up ? /▲/ : /▼/);
  await page.click('#same-month .table-toggle');
  const table = await page.$$eval('#same-month tbody tr', trs => trs.map(tr => Array.from(tr.children).map(td => td.textContent.trim())));
  assert.deepEqual(table.map(r => r[0]), ['Ekim 2024', 'Ekim 2025', 'Ekim 2026']);
  assert.deepEqual(table.map(r => r[3]), rows.map(r => num(r[3])), 'customers');
  // another month from the list
  await page.click('#same-month .table-toggle');
  await page.selectOption('#same-month-month', '03');
  assert.match(await text(page, '#same-month'), /tek yılı var/);
  // a month page shows the comparison only when the month is in several years
  await go(page, 'ay-2026-10');
  await page.waitForSelector('#month-same');
  assert.equal(await page.$$eval('#month-same [data-measure="premium"] svg path.mark', p => p.length), 3);
  await go(page, 'ay-2026-03');
  assert.equal(await page.$('#month-same'), null);
  assert.deepEqual(env.errors, []);
});

test('renewal rate: by the month a policy ends, cancelled ones left out, each number lists its policies', async () => {
  const { page } = env;
  await go(page, 'raporlar');
  await waitHash(page, '#raporlar');
  assert.match(await text(page, '#rep-retention-note'), /bittikleri aya göre/);
  const want = await store(page, () => {
    const d = Store.derived();
    const ps = d.policies.filter(p => p.endDate && p.endDate.slice(0, 7) === '2026-10' && p.endDate < d.today && !['short', 'none', 'cancelled'].includes(d.renewal.get(p.id).state));
    const n = (s) => ps.filter(p => d.renewal.get(p.id).state === s).length;
    return { all: ps.length, renewed: n('renewed'), open: n('expired') };
  });
  assert.equal(await text(page, '#ret-2026-10-all'), num(want.all));
  assert.equal(await text(page, '#ret-2026-10-renewed'), num(want.renewed));
  assert.equal(await text(page, '#ret-2026-10-open'), num(want.open));
  assert.equal(want.all, want.renewed + want.open, 'every policy is in one column');
  await page.click('#ret-2026-10-renewed');
  await page.waitForSelector('dialog[open] #renewal-list');
  assert.equal(await page.$$eval('dialog[open] #renewal-list tbody tr', r => r.length), want.renewed);
  assert.match(await text(page, 'dialog[open] #renewal-list tbody tr:first-child'), /Eki 25/);
  await page.keyboard.press('Escape');
  await page.click('#ret-2026-10-open');
  await page.waitForSelector('dialog[open] #renewal-list');
  assert.match(await text(page, 'dialog[open] #renewal-list'), /Bulunamadı/);
  await page.keyboard.press('Escape');
  assert.deepEqual(env.errors, []);
});
