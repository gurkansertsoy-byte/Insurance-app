import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup, waitHash, loadDemo, go, text, expected, store, download, readBook, sheetRows, confirmDialog, ROOT, OUT } from './helpers.mjs';

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); });
test.after(async () => { await env.close(); });

const CX = expected.cancellations;
const policyByNo = (page, no) => store(page, (n) => { const p = Array.from(Store.policies.values()).find(x => x.policyNo === n); return p && { id: p.id, customerId: p.customerId, month: p.month }; }, no);
const cancelOf = (page, pid) => store(page, (id) => { const x = Store.cancelOf(id); return x && { id: x.id, month: x.month, match: x.match, locked: !!x.locked }; }, pid);

test('every İptal row of the file is read; matched policies are cancelled in the month of their row', async () => {
  const { page } = env;
  assert.equal(await store(page, () => Store.cancellations.size), CX.total);
  const states = await store(page, () => { const o = {}; Store.cancellations.forEach(x => { o[x.match] = (o[x.match] || 0) + 1; }); return o; });
  assert.deepEqual(states, { auto: CX.auto, ambiguous: CX.ambiguous, none: CX.none });
  const auto = CX.list.filter(x => x.expect === 'auto');
  for (const e of auto) {
    const p = await policyByNo(page, e.policyNo);
    const x = await cancelOf(page, p.id);
    assert.deepEqual([x && x.month, x && x.match], [e.month, 'auto'], e.insured);
  }
  // the month page shows its İptal block like the end of the Excel page
  await go(page, 'ay-2026-09');
  assert.equal(await page.$$eval('#month-cancels tbody tr', r => r.length), CX.byMonth['2026-09']);
  assert.match(await text(page, '#month-cancels .card-head'), new RegExp(CX.byMonth['2026-09'] + ' iptal'));
  assert.match(await text(page, '#month-cancels'), /Otomatik bulundu/);
  assert.match(await text(page, '#month-cancels'), /2 olası poliçe/);
  // and the months list counts them
  await go(page, 'aylar');
  assert.match(await text(page, '#month-2026-09'), new RegExp(CX.byMonth['2026-09'] + ' iptal'));
});

test('the customer card shows the cancelled policy and the cancellation in its own month', async () => {
  const { page } = env;
  const e = CX.list.find(x => x.expect === 'auto' && x.month === '2026-09');
  const p = await policyByNo(page, e.policyNo);
  await go(page, 'musteri-' + p.customerId);
  assert.equal(await page.$eval('#pol-' + p.id, el => el.classList.contains('is-cancelled')), true);
  assert.match(await text(page, '#pol-' + p.id), /İptal · Eyl 26/);
  assert.equal(await page.$('#cancel-' + p.id), null, 'no cancel button on a cancelled policy');
  assert.match(await text(page, '#cm-2026-09'), /İptal:/);
  assert.match(await text(page, '#stat-cancelled'), /1 iptal/);
  await page.click('#pol-' + p.id + ' button[aria-expanded]');
  assert.match(await text(page, '#pol-' + p.id + ' .policy-detail'), /Eylül 2026 sayfasında iptal edildi/);
  assert.match(await text(page, '#pol-' + p.id + ' .policy-detail'), /EYLÜL 2026 sayfası, \d+\. satır/);
});

test('an ambiguous row: the user picks the policy; a row with no policy: marked as not in the file', async () => {
  const { page } = env;
  await go(page, 'ay-2026-09');
  const amb = await store(page, () => { const x = Array.from(Store.cancellations.values()).find(c => c.match === 'ambiguous'); return { id: x.id, cands: x.candidates }; });
  assert.equal(amb.cands.length, 2);
  await page.click('#cx-pick-' + amb.id);
  await page.waitForSelector('dialog[open] #cp-list .list-item');
  assert.equal(await page.$$eval('dialog[open] #cp-list .list-item', r => r.length), 2, 'the two traffic policies');
  await page.click('dialog[open] #cp-' + amb.cands[1]);
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  assert.deepEqual(await cancelOf(page, amb.cands[1]), { id: amb.id, month: '2026-09', match: 'manual', locked: true });
  assert.equal(await cancelOf(page, amb.cands[0]), null, 'the other car stays insured');
  assert.match(await text(page, '#cx-' + amb.id), /Elle seçildi/);
  // the unmatched one
  await go(page, 'ay-2026-05');
  const none = await store(page, () => Array.from(Store.cancellations.values()).find(c => c.match === 'none').id);
  assert.match(await text(page, '#cx-' + none), /Poliçe bulunamadı/);
  await page.click('#cx-pick-' + none);
  await page.waitForSelector('dialog[open] #cp-none');
  assert.match(await text(page, 'dialog[open] #cp-list'), /uyan poliçe yok/);
  await page.click('dialog[open] #cp-none');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  assert.match(await text(page, '#cx-' + none), /Dosyada yok/);
});

test('cancelling from the app: the refund dialog, out of renewals, back again with undo', async () => {
  const { page } = env;
  const kemal = await store(page, (n) => Array.from(Store.customers.values()).find(c => c.name === n).id, expected.showcase.name);
  const trafik = await store(page, (id) => Store.policiesOf(id).find(p => /Trafik/.test(p.policyType)).id, kemal);
  await go(page, 'yenilemeler');
  const due = Number(await text(page, '#renewals-due'));
  await go(page, 'musteri-' + kemal);
  await page.click('#cancel-' + trafik);
  await page.waitForSelector('dialog[open] #cx-month');
  assert.equal(await page.$eval('#cx-month', s => s.value), '10', 'this month');
  await page.click('#cx-full');
  assert.notEqual(await page.inputValue('#cx-card') + await page.inputValue('#cx-cash') + await page.inputValue('#cx-account'), '', 'the whole premium, the way it was paid');
  await page.fill('#cx-note', 'Araç satıldı');
  await page.click('#cx-save');
  await page.waitForSelector('.toast:has-text("Poliçe iptal edildi")');
  const x = await cancelOf(page, trafik);
  assert.deepEqual([x.month, x.match], ['2026-10', 'manual']);
  assert.match(await text(page, '#pol-' + trafik), /İptal · Eki 26/);
  await page.click('#tab-notes');
  assert.match(await text(page, '.timeline'), /Poliçe iptal edildi/);
  await page.click('#tab-policies');
  await go(page, 'yenilemeler');
  assert.equal(Number(await text(page, '#renewals-due')), due - 1, 'a cancelled policy is not renewed');
  await go(page, 'ay-2026-10');
  assert.match(await text(page, '#month-cancels'), /Kemal Aydoğdu/);
  // undo from the customer card
  await go(page, 'musteri-' + kemal);
  await page.click('#pol-' + trafik + ' button[aria-expanded]');
  await page.click('#uncancel-' + trafik);
  await page.waitForSelector('.toast:has-text("İptal kaldırıldı")');
  assert.equal(await cancelOf(page, trafik), null);
  await go(page, 'yenilemeler');
  assert.equal(Number(await text(page, '#renewals-due')), due);
});

test('İptal rows typed on the month page find their policy; deleting a row brings the policy back', async () => {
  const { page } = env;
  // a running policy of a customer with a single policy of that kind
  const target = await store(page, () => {
    const d = Store.derived();
    const p = d.policies.find(q => q.month === '2026-04' && q.policyNo && d.renewal.get(q.id).state === 'active' && /Kasko/i.test(q.policyType) && !Store.isCancelled(q.id) &&
      Store.policiesOf(q.customerId).filter(o => /Kasko/i.test(o.policyType)).length === 1);
    const c = Store.customers.get(p.customerId);
    return { id: p.id, name: p.insuredName || c.name, company: p.company, type: p.policyType };
  });
  await go(page, 'ay-2026-09');
  const before = await page.$$eval('#month-cancels tbody tr', r => r.length);
  await page.click('#cancel-add');
  await page.waitForSelector('dialog[open] #cr-insured');
  await page.fill('#cr-company', target.company);
  await page.fill('#cr-policy', 'KASKO');
  await page.fill('#cr-insured', target.name.toLocaleUpperCase('tr'));
  await page.fill('#cr-cash', '2.500,00');
  await page.click('#cr-save');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  assert.equal(await page.$$eval('#month-cancels tbody tr', r => r.length), before + 1);
  const x = await cancelOf(page, target.id);
  assert.deepEqual([x && x.month, x && x.match], ['2026-09', 'auto'], 'found by name, company and line of business');
  await page.click('#cx-del-' + x.id);
  await confirmDialog(page);
  assert.equal(await cancelOf(page, target.id), null);
  await page.click('.toast:has-text("İptal satırı silindi") button:has-text("Geri al")');
  assert.equal((await cancelOf(page, target.id)).id, x.id);
});

test('importing the same file again keeps the İptal rows and the user\'s choices', async () => {
  const { page, base } = env;
  const before = await store(page, () => ({ n: Store.cancellations.size, manual: Array.from(Store.cancellations.values()).filter(x => x.locked).map(x => x.id + ':' + (x.policyId || '')).sort() }));
  await go(page, 'ice-aktar');
  await page.evaluate(() => { App.viewState.import = null; App.render(); });
  await page.setInputFiles('#import-file', { name: 'ornek-portfoy.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(path.join(ROOT, 'sample-data', 'ornek-portfoy.xlsx')) });
  await page.waitForSelector('#sheet-table');
  await page.click('#import-run');
  await page.waitForSelector('#import-done');
  const after = await store(page, () => ({ n: Store.cancellations.size, manual: Array.from(Store.cancellations.values()).filter(x => x.locked).map(x => x.id + ':' + (x.policyId || '')).sort() }));
  assert.deepEqual(after, before);
  assert.equal(await store(page, () => Store.policies.size), expected.totalPolicies + 0);
});

test('month export and backup carry the İptal rows', async () => {
  const { page } = env;
  await go(page, 'ay-2026-09');
  const n = await page.$$eval('#month-cancels tbody tr', r => r.length);
  const file = await download(page, () => page.click('#month-export'));
  const rows = sheetRows(readBook(file.bytes), 'Eylül 2026');
  const head = rows[0];
  const start = head.indexOf('ŞİRKET');
  assert.ok(start > 0 && head[start - 1] == null, 'after an empty column');
  assert.deepEqual(head.slice(start), ['ŞİRKET', 'POLİÇE', 'SİGORTALI AD SOYAD', 'KART', 'CARİ', 'NAKİT']);
  assert.equal(rows.slice(1).filter(r => r.slice(start).some(v => v != null)).length, n);
  await go(page, 'ayarlar');
  const bk = await download(page, () => page.click('#backup-btn'));
  const data = JSON.parse(bk.bytes.toString('utf8'));
  assert.equal(data.cancellations.length, await store(page, () => Store.cancellations.size));
  fs.writeFileSync(path.join(OUT, 'backup-with-cancellations.json'), bk.bytes);
  assert.deepEqual(env.errors, []);
});
