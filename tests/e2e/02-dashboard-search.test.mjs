import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, waitHash, loadDemo, go, text, expected, store, num } from './helpers.mjs';

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); await go(env.page, 'panel'); });
test.after(async () => { await env.close(); });

test('dashboard figures match the sample data', async () => {
  const { page } = env;
  assert.equal(await text(page, '#kpi-policies .kpi-value'), num(expected.totalPolicies));
  assert.equal(await text(page, '#kpi-customers .kpi-value'), num(expected.totalCustomers));
  assert.equal(await text(page, '#kpi-due .kpi-value'), String(expected.dueIn30Days));
  assert.equal(await page.getAttribute('#kpi-premium .kpi-value', 'title'), new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 }).format(expected.totalPremium));
  assert.match(await text(page, '#kpi-policies .kpi-sub'), new RegExp('Yeni iş ' + expected.newBusiness));
  assert.match(await text(page, '#kpi-customers .kpi-sub'), new RegExp(expected.multiMonthCustomers + ' müşteri birden fazla ayda'));
  const outstanding = await page.getAttribute('#kpi-outstanding .kpi-value', 'title');
  assert.equal(outstanding, new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 }).format(expected.totalAccount));
  assert.equal(await page.$$eval('#card-due .list-item', els => els.length), 6, 'six nearest renewals listed');
});

test('period filter narrows every figure to that year', async () => {
  const { page } = env;
  await page.selectOption('#dash-period', 'y2025');
  const n2025 = ['2025-10', '2025-11', '2025-12'].reduce((s, k) => s + expected.months[k].count, 0);
  assert.equal(await text(page, '#kpi-policies .kpi-value'), num(n2025));
  await page.selectOption('#dash-period', 'all');
  assert.equal(await text(page, '#kpi-policies .kpi-value'), num(expected.totalPolicies));
});

test('monthly chart: hover tooltip, measure switch, table view and click-through', async () => {
  const { page } = env;
  const bars = await page.$$('#chart-monthly .hit');
  assert.equal(bars.length, 13);
  await bars[12].hover();
  const tip = await text(page, '#chart-monthly .chart-tip');
  assert.match(tip, /Ekim 2026/);
  assert.match(tip, new RegExp(expected.months['2026-10'].count + ' poliçe'));
  await page.click('#chart-monthly .seg button:nth-child(3)');
  assert.equal(await page.$eval('#chart-monthly .seg button:nth-child(3)', b => b.getAttribute('aria-pressed')), 'true');
  await page.click('#chart-monthly .table-toggle');
  const rows = await page.$$eval('#chart-monthly tbody tr', trs => trs.map(tr => tr.children[1].textContent));
  assert.equal(rows.length, 13);
  assert.equal(rows[0], String(expected.months['2025-10'].count));
  await page.click('#chart-monthly .table-toggle');
  await page.click('#chart-monthly .hit >> nth=5');
  await waitHash(page, '#ay-2026-03');
  assert.match(await text(page, '#page-title'), /Mart 2026/);
  await go(page, 'panel');
});

test('company and branch cards; branch bar opens the filtered policy list', async () => {
  const { page } = env;
  assert.ok((await page.$$('#chart-company .hbar')).length >= 7);
  const labels = await page.$$eval('#chart-category .hbar .l', els => els.map(e => e.textContent));
  assert.equal(labels[0], 'Trafik', 'traffic is the largest line by count');
  await page.click('#chart-category .hbar:nth-child(1)');
  await waitHash(page, '#policeler');
  assert.match(await text(page, '#policies-count'), new RegExp(num(expected.byKind.trafik) + ' poliçe'));
  await store(page, () => { App.viewState.policies = null; });
  await go(page, 'panel');
});

test('global search by name, TC, plate, phone and policy number', async () => {
  const { page } = env;
  const show = expected.showcase;
  const info = await store(page, (name) => {
    const c = Array.from(Store.customers.values()).find(x => x.name === name);
    const p = Store.policiesOf(c.id)[0];
    return { id: c.id, phone: c.phone, policyNo: p.policyNo };
  }, show.name);
  const probe = async (q) => {
    await page.fill('#global-search', q);
    await page.waitForFunction((v) => { const p = document.getElementById('search-pop'); return !p.hidden && p.dataset.q === v; }, q.replace(/\s+/g, ' ').trim());
    return text(page, '#search-pop');
  };
  assert.match(await probe('kemal aydo'), /Kemal Aydoğdu/, 'case and Turkish letters ignored');
  assert.match(await probe(show.tc), /Kemal Aydoğdu/);
  assert.match(await probe('34kma482'), /Kemal Aydoğdu/, 'plate without spaces');
  assert.match(await probe(info.phone.slice(0, 3) + ' ' + info.phone.slice(3, 6) + ' ' + info.phone.slice(6)), /Kemal Aydoğdu/);
  const byNo = await probe(info.policyNo);
  assert.match(byNo, /Poliçeler/);
  assert.match(byNo, new RegExp(info.policyNo));
  assert.match(await probe('zzzzqqq'), /sonuç yok/);
  // keyboard: Enter opens the first result
  await page.fill('#global-search', 'kemal aydoğdu');
  await page.waitForSelector('#search-pop:not([hidden]) .search-item');
  await page.keyboard.press('Enter');
  await waitHash(page, '#musteri-' + info.id);
  assert.equal(await text(page, '#page-title'), 'Kemal Aydoğdu');
});

test('keyboard shortcuts: Ctrl+K and / focus the search, Escape closes it', async () => {
  const { page } = env;
  await page.click('#page-title');
  await page.keyboard.press('Control+k');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'global-search');
  await page.keyboard.type('mehmet yılmaz');
  await page.waitForSelector('#search-pop:not([hidden])');
  const homonyms = await page.$$eval('#search-pop .search-item', els => els.filter(e => /Mehmet Yılmaz/.test(e.textContent)).length);
  assert.equal(homonyms, 2, 'two different customers with the same name');
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('#search-pop', p => p.hidden), true);
  await page.click('#page-title');
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'global-search');
  assert.deepEqual(env.errors, []);
});
