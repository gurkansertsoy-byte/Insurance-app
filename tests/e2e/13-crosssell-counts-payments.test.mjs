// The cross-sell page in the menu, one customer count on every screen, and Kart / Cari / Nakit read from a file whose
// table ends with the İptal block's own titles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, waitHash, loadDemo, go, text, store, num, writeBook, download, readBook, sheetRows } from './helpers.mjs';

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); });
test.after(async () => { await env.close(); });

const n = (s) => Number(String(s).replace(/\D/g, ''));

test('Çapraz satış has its own page: kinds with their counts, search, a task, Excel', async () => {
  const { page } = env;
  const all = await store(page, () => App.allOpportunities().length);
  assert.ok(all > 0);
  assert.equal(n(await text(page, 'nav a[href="#firsatlar"]')), all, 'count in the menu');
  await page.click('nav a[href="#firsatlar"]');
  await waitHash(page, '#firsatlar');
  assert.equal(await text(page, '#page-title'), 'Çapraz satış');
  assert.equal(n(await text(page, '#opps-count')), all);
  const kasko = n(await text(page, '#opps-t-kasko .opp-type-n'));
  await page.click('#opps-t-kasko');
  assert.equal(n(await text(page, '#opps-count')), kasko);
  assert.equal(await page.getAttribute('#opps-t-kasko', 'aria-pressed'), 'true');
  const first = await store(page, () => App.allOpportunities().find(x => x.o.type === 'kasko' && x.o.plate));
  await page.fill('#opps-q', first.o.plate);
  await page.waitForFunction(() => document.querySelectorAll('#opps-list tbody tr').length >= 1 && document.querySelectorAll('#opps-list tbody tr').length < 5);
  assert.match(await text(page, '#opps-list tbody'), new RegExp(first.c.name));
  const file = await download(page, () => page.click('#opps-export'));
  const rows = sheetRows(readBook(file.bytes), 'Çapraz satış');
  assert.equal(rows.length - 1, n(await text(page, '#opps-count')), 'exports what is shown');
  await page.click('#opps-list tbody tr:first-child button:has-text("Görev oluştur")');
  await page.waitForSelector('dialog[open] #task-title');
  assert.match(await page.inputValue('dialog[open] #task-title'), /kasko teklifi hazırla/);
  await page.keyboard.press('Escape');
  // the dashboard's "see all" goes there, Reports no longer has the list
  await go(page, 'panel');
  await page.click('#dash-opps-all');
  await waitHash(page, '#firsatlar');
  await go(page, 'raporlar');
  assert.equal(await page.$('#rep-opps'), null);
  assert.deepEqual(env.errors, []);
});

test('the dashboard, the customer list and Reports count the same customers', async () => {
  const { page } = env;
  // someone with no policy at all, and someone whose only row cancels a policy from before the file
  await store(page, () => {
    Store.saveCustomer({ name: 'Deniz Yalın', phone: '0532 000 00 01' });
    const c = Store.saveCustomer({ name: 'Ozan Telli', phone: '0532 000 00 02' });
    Store.savePolicy({ customerId: c.id, policy: { month: '2026-10', policyType: 'Kasko', policyNo: 'XX-2024000001', premium: -4000, commission: -600 } });
  });
  const all = await store(page, () => Store.customers.size);
  await go(page, 'panel');
  await waitHash(page, '#panel');
  assert.equal(await text(page, '#kpi-customers .kpi-value'), num(all));
  await go(page, 'musteriler');
  assert.equal(n(await text(page, '#customers-count')), all);
  await go(page, 'raporlar');
  assert.equal(await text(page, '#rep-customers'), num(all));
  // a period counts whoever has a row in it, the cancelling one included
  const oct = await store(page, () => new Set(Store.derived().rows.filter(p => p.month === '2026-10').map(p => p.customerId)).size);
  await page.selectOption('#rep-from', '2026-10');
  await page.selectOption('#rep-to', '2026-10');
  assert.equal(await text(page, '#rep-customers'), num(oct));
  await page.selectOption('#rep-from', '');
  await page.selectOption('#rep-to', '');
});

test('KART / CARİ / NAKİT at the end of the table, next to ŞİRKET | POLİÇE NO | SİGORTALI: the amounts are read', async () => {
  const { page } = env;
  const head = ['POLİÇE ADI', 'POLİÇE BİTİŞ TARİHİ', 'ADI SOYADI', 'TC KİMLİK NO', 'İLETİŞİM', 'ŞİRKET POLİÇE TUTARI', 'YENİ İŞ', 'KOMİSYON', 'AÇIKLAMA',
    'ŞİRKET', 'POLİÇE NO', 'SİGORTALI AD SOYAD', 'KART', 'CARİ', 'NAKİT'];
  const file = writeBook('odeme-sekli.xlsx', [{ name: 'KASIM 2026', rows: [head,
    ['Kasko', '15.11.2027', 'Mert Kaya', '', '0533 111 22 33', 20000, 'YENİ İŞ', 3000, '', 'Axa', 'AX-9000001', 'Mert Kaya', 20000, null, null],
    ['Trafik', '18.11.2027', 'Gül Ak', '', '0533 111 22 34', 8000, 'YENİLEME', 800, '', 'Allianz', 'AZ-9000002', 'Gül Ak', null, 8000, null],
    ['DASK', '20.11.2027', 'Can Su', '', '0533 111 22 35', 1500, 'YENİ İŞ', 225, '', 'Axa', 'AX-9000003', 'Can Su', null, null, 'X']] }]);
  await store(page, () => { App.viewState.import = null; });
  await go(page, 'ice-aktar');
  await page.setInputFiles('#import-file', file);
  await page.waitForSelector('#sheet-table');
  await page.click('#import-run');
  await page.waitForSelector('#import-done');
  const got = await store(page, () => ['AX-9000001', 'AZ-9000002', 'AX-9000003'].map(no => {
    const p = Array.from(Store.policies.values()).find(x => x.policyNo === no);
    return [p.company, p.card || 0, p.account || 0, p.cash || 0];
  }));
  assert.deepEqual(got, [['Axa', 20000, 0, 0], ['Allianz', 0, 8000, 0], ['Axa', 0, 0, 1500]], 'an X in NAKİT is the premium paid in cash');
  assert.equal(await store(page, () => Store.cancellations.size), await store(page, () => Array.from(Store.cancellations.values()).filter(x => x.month !== '2026-11').length), 'no İptal rows read from the table');
  await go(page, 'raporlar');
  await page.selectOption('#rep-from', '2026-11');
  await page.selectOption('#rep-to', '2026-11');
  const pay = await text(page, '#rep-payments');
  for (const v of ['₺20.000', '₺8.000', '₺1.500']) assert.ok(pay.includes(v), v + ' in Ödeme şekli: ' + pay);
  assert.deepEqual(env.errors, []);
});

test('Ödeme şekli: refunds of the İptal rows by KART / CARİ / NAKİT, and "Belli değil" for what no column says', async () => {
  const { page } = env;
  // a month whose policy rows have no payment columns; its İptal block refunds by card and one by nothing
  const head = ['POLİÇE ADI', 'POLİÇE BİTİŞ TARİHİ', 'ADI SOYADI', 'İLETİŞİM', 'POLİÇE NUMARASI', 'ŞİRKET POLİÇE TUTARI', 'YENİ İŞ', 'KOMİSYON', 'ŞİRKET',
    null, 'ŞİRKET', 'POLİÇE', 'SİGORTALI AD SOYAD', 'KART', 'CARİ', 'NAKİT'];
  const file = writeBook('odemesiz.xlsx', [{ name: 'ARALIK 2026', rows: [head,
    ['Kasko', '10.12.2027', 'Nil Er', '0533 222 00 01', 'AX-9100001', 30000, 'YENİ İŞ', 4500, 'Axa', null, 'Axa', 'KASKO', 'Ufuk Tan', 1200, null, null],
    ['Trafik', '12.12.2027', 'Oya Kar', '0533 222 00 02', 'AZ-9100002', 9000, 'YENİLEME', 900, 'Allianz', null, 'Allianz', 'TRAFİK', 'Sena Ay', null, null, null],
    // the first policy written again with a minus premium: cancelled, its refund has no payment column
    ['Kasko', '10.12.2027', 'Nil Er', '0533 222 00 01', 'AX-9100001', -18000, 'İPTAL', -2700, 'Axa']] }]);
  await store(page, () => { App.viewState.import = null; });
  await go(page, 'ice-aktar');
  await page.setInputFiles('#import-file', file);
  await page.waitForSelector('#sheet-table');
  await page.click('#import-run');
  await page.waitForSelector('#import-done');
  await go(page, 'raporlar');
  await page.selectOption('#rep-from', '2026-12');
  await page.selectOption('#rep-to', '2026-12');
  const rows = await page.$$eval('#rep-payments tbody tr', trs => trs.map(tr => Array.from(tr.children).map(td => td.textContent.trim())));
  assert.deepEqual(rows.map(r => r[0]), ['Kart', 'Nakit', 'Cari', 'Belli değil']);
  // sales: nothing says how they were paid
  assert.deepEqual(rows.map(r => r[2]), ['₺0,00', '₺0,00', '₺0,00', '₺39.000,00']);
  // refunds: ₺1.200 by card from the İptal block; the empty İptal row and the minus row are "Belli değil"
  assert.deepEqual(rows.map(r => [r[4], r[5]]), [['1', '₺1.200,00'], ['0', '₺0,00'], ['0', '₺0,00'], ['2', '₺18.000,00']]);
  assert.match(await text(page, '#rep-payments tfoot'), /3\s*₺19\.200,00/);
  assert.ok(await page.isVisible('#rep-pay-nocols'), 'says why the sales are "Belli değil"');
  // the dashboard shows the same split, for the period
  await go(page, 'panel');
  await page.selectOption('#dash-period', 'y2026');
  assert.match(await text(page, '#dash-pay-refunds'), /Belli değil/);
  await page.selectOption('#dash-period', 'all');
  assert.deepEqual(env.errors, []);
});
