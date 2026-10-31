// A policy number written again (minus amounts cancel, plus amounts are asked about), commission worked out when none is
// written, and the monthly chart of what the YENİ İŞ column says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, waitHash, loadDemo, go, text, expected, store, num, money, download, readBook, sheetRows, confirmDialog } from './helpers.mjs';

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); });
test.after(async () => { await env.close(); });

const R = expected.repeats;
const CX = expected.cancellations;
const round2 = (v) => Math.round(v * 100) / 100;
const rowCancelCount = R.cancel + R.orphan;
const isTrafik = (s) => /trafik/i.test(String(s || '').replace(/İ/g, 'i'));
// İptal block rows: 10 % (Trafik) / 15 % of Kart + Cari + Nakit; a row whose policy is not found goes by its POLİÇE text
const blockReclaim = round2(expected.blockReclaimTotal + CX.list.filter(x => x.expect !== 'auto').reduce((s, x) => s + round2(x.refund * (isTrafik(x.policy) ? 0.10 : 0.15)), 0));
const KIND_ORDER = ['new', 'renewal', 'ek', 'zeyil', 'cancel', 'unknown'];
const KIND_LABELS = ['Yeni iş', 'Yenileme', 'Ek', 'Zeyil', 'İptal', 'Bilinmiyor'];
const kindTotal = (k) => Object.values(expected.months).reduce((s, m) => s + m.kinds[k], 0);

/** The row with this policy number on this month's page; a policy and the row cancelling it can share a page,
    so the sign of the amount tells them apart (minus: the cancelling row). */
const rowOf = (page, no, month, minus) => store(page, ([n, m, neg]) => {
  const p = Array.from(Store.policies.values()).find(x => x.policyNo === n && x.month === m && (neg == null || (x.premium < 0) === neg));
  return p && { id: p.id, customerId: p.customerId, premium: p.premium, commission: p.commission };
}, [no, month, minus == null ? null : minus]);
const counted = (page) => store(page, () => Store.derived().policies.length);
const badge = (page) => page.$eval('nav a[href="#iptaller"]', a => { const b = a.querySelector('.nav-badge'); return b ? b.textContent : ''; });

test('the import tells what the repeated policy numbers did; the dashboard asks for the answers', async () => {
  const { page } = env;
  assert.equal(await text(page, '#res-repeats .v'), String(rowCancelCount));
  assert.match(await text(page, '#res-repeats'), new RegExp(R.ask + ' soru bekliyor · ' + R.endorse + ' ek / zeyil'));
  assert.match(await text(page, '#import-questions'), new RegExp(R.ask + ' satır cevabınızı bekliyor'));
  assert.match(await text(page, '#import-estimated'), new RegExp(expected.estimatedCommission.count + ' poliçede komisyon yazılmamış'));
  assert.equal(await badge(page), String(R.ask));
  await go(page, 'panel');
  await waitHash(page, '#panel');
  assert.match(await text(page, '#dash-questions'), new RegExp(R.ask + ' satır cevabınızı bekliyor'));
  assert.match(await text(page, '#kpi-commission .kpi-sub'), /hesaplanan/);
  await page.click('#dash-questions a');
  await waitHash(page, '#iptaller');
});

test('the İptaller page: İptal block rows and rows that cancel by writing the number again, refunds and commission taken back', async () => {
  const { page } = env;
  await go(page, 'iptaller');
  assert.equal(await text(page, '#cancels-count'), num(CX.total + rowCancelCount));
  assert.equal(await page.getAttribute('#cancels-refund', 'title'), money(round2(CX.refundTotal + R.refundTotal)));
  assert.equal(await page.getAttribute('#cancels-reclaim', 'title'), money(round2(blockReclaim + R.reclaimTotal)));
  assert.equal(await text(page, '#cancels-questions'), String(R.ask));
  assert.equal(await page.$$eval('#cancel-questions .repeat-question', r => r.length), R.ask);
  assert.equal(await text(page, '#cancels-f-block .n'), String(CX.total));
  assert.equal(await text(page, '#cancels-f-row .n'), String(rowCancelCount));
  assert.equal(await page.$$eval('#all-cancels tbody tr', r => r.length), CX.total + rowCancelCount);
  await page.click('#cancels-f-row');
  assert.equal(await page.$$eval('#all-cancels tbody tr.cancel-row-kind', r => r.length), rowCancelCount);
  assert.equal(await page.$$eval('#all-cancels tbody tr', r => r.length), rowCancelCount);
  assert.match(await text(page, '#all-cancels-total'), new RegExp(money(R.refundTotal).replace(/[.]/g, '\\.')));
  for (const e of R.list.filter(x => x.role === 'cancel' || x.role === 'orphan')) {
    const q = await rowOf(page, e.policyNo, e.month, true);
    const row = await text(page, '#cx-row-' + q.id);
    assert.match(row, e.role === 'cancel' ? /Poliçe no tekrar yazılmış/ : /İlk poliçe dosyada yok/, e.policyNo);
    // the minus Poliçe tutarı is the refund, the minus Komisyon the commission taken back
    assert.ok(row.includes(money(Math.abs(e.premium))), e.policyNo + ' refund');
    assert.ok(row.includes('kom. −' + money(Math.abs(e.commission))), e.policyNo + ' commission taken back');
  }
  await page.click('#cancels-f-all');
  assert.equal(await page.$$eval('#all-endorsements tbody tr', r => r.length), R.endorse);
  assert.match(await text(page, '#all-endorsements'), /İMM EK/);
  assert.deepEqual(env.errors, []);
});

test('a minus row cancels the policy it writes again; the row itself is no policy', async () => {
  const { page } = env;
  const e = R.list.find(x => x.role === 'cancel' && x.month === '2026-09');
  const base = await rowOf(page, e.of, e.ofMonth, false);
  const q = await rowOf(page, e.policyNo, e.month, true);
  const x = await store(page, (id) => { const c = Store.cancelOf(id); return c && { kind: c.kind, month: c.month, refund: Store.refundOf(c), reclaim: Store.reclaimOf(c) }; }, base.id);
  assert.deepEqual(x, { kind: 'row', month: '2026-09', refund: Math.abs(e.premium), reclaim: Math.abs(e.commission) });
  assert.equal(await store(page, (id) => Store.derived().policies.some(p => p.id === id), q.id), false);
  await go(page, 'musteri-' + base.customerId);
  assert.equal(await page.$eval('#pol-' + base.id, el => el.classList.contains('is-cancelled')), true);
  assert.match(await text(page, '#pol-' + base.id), /İptal · Eyl 26/);
  // the month page keeps the row, marked, and lists it with the month's cancellations
  await go(page, 'ay-2026-09');
  assert.equal(await page.$$eval('table.sheet tbody tr', r => r.length), expected.months['2026-09'].rows);
  assert.equal(await page.$$eval('table.sheet tbody tr.row-cancel-entry', r => r.length), 1);
  assert.equal(await text(page, '#month-count'), String(expected.months['2026-09'].count));
  assert.match(await text(page, '#month-cancels'), /sayfanın \d+\. satırı/);
});

test('plus amounts: the app asks; yes makes a cancellation, no keeps a policy, and both can be undone', async () => {
  const { page } = env;
  const [qa, qb] = R.list.filter(x => x.role === 'ask');
  const a = await rowOf(page, qa.policyNo, qa.month), aBase = await rowOf(page, qa.of, qa.ofMonth);
  const b = await rowOf(page, qb.policyNo, qb.month), bBase = await rowOf(page, qb.of, qb.ofMonth);
  const before = await counted(page);
  await go(page, 'iptaller');
  const card = await text(page, '#rq-' + a.id);
  assert.match(card, new RegExp(qa.policyNo + ' numaralı poliçe Nisan 2026 sayfasında tekrar yazılmış'));
  assert.ok(card.includes('müşteriye iade ' + money(qa.premium)) && card.includes('geri alınan komisyon ' + money(qa.commission)), card);
  // no commission written: 15 % of the premium (TSS), said so
  const cardB = await text(page, '#rq-' + b.id);
  assert.ok(cardB.includes('geri alınan komisyon ' + money(round2(qb.premium * 0.15))), cardB);
  assert.match(cardB, /komisyon yazılmadığı için %10 \/ %15 ile hesaplandı/);
  assert.match(cardB, /YENİ İŞ “YENİLEME”/);

  // yes: an İptal with the plus amounts as refund and commission taken back
  await page.click('#rq-yes-' + a.id);
  await page.waitForSelector('#rq-' + a.id, { state: 'detached' });
  assert.equal(await badge(page), String(R.ask - 1));
  assert.equal(await store(page, (id) => Store.isCancelled(id), aBase.id), true);
  assert.equal(await counted(page), before - 1, 'the row is no policy any more');
  assert.match(await text(page, '#cx-row-' + a.id), /Siz onayladınız/);
  assert.equal(await text(page, '#cancels-count'), num(CX.total + rowCancelCount + 1));

  // no: stays a policy, the first policy stays in force
  await page.click('#rq-no-' + b.id);
  await page.waitForSelector('#rq-' + b.id, { state: 'detached' });
  assert.equal(await badge(page), '');
  assert.match(await text(page, '#cancel-questions'), /Cevap bekleyen satır yok/);
  assert.equal(await store(page, (id) => Store.isCancelled(id), bBase.id), false);
  assert.equal(await counted(page), before - 1);

  // answers survive a reload
  await page.reload();
  await waitHash(page, '#iptaller');
  assert.deepEqual(await store(page, ([x, y]) => [Store.policies.get(x).repeatDecision, Store.policies.get(y).repeatDecision], [a.id, b.id]), ['cancel', 'not']);
  // undo the yes: the question comes back
  await page.click('#cx-undo-' + a.id);
  await page.waitForSelector('#rq-' + a.id);
  assert.equal(await badge(page), '1');
  assert.equal(await counted(page), before);
  // the customer's history says what was answered
  await go(page, 'musteri-' + b.customerId);
  await page.click('#tab-notes');
  assert.match(await text(page, '.timeline'), /Satır poliçe sayıldı/);
  assert.deepEqual(env.errors, []);
});

test('"İptal değil" turns an automatic cancellation back into a policy, with undo', async () => {
  const { page } = env;
  const e = R.list.find(x => x.role === 'cancel' && x.month === '2026-07');
  const q = await rowOf(page, e.policyNo, e.month, true), base = await rowOf(page, e.of, e.ofMonth, false);
  const before = await counted(page);
  await go(page, 'iptaller');
  await page.click('#cx-not-' + q.id);
  await confirmDialog(page);
  assert.equal(await store(page, (id) => Store.isCancelled(id), base.id), false);
  assert.equal(await counted(page), before + 1);
  assert.equal(await page.$('#cx-row-' + q.id), null);
  await page.click('.toast button:has-text("Geri al")');
  await page.waitForSelector('#cx-row-' + q.id);
  assert.equal(await store(page, (id) => Store.isCancelled(id), base.id), true);
  assert.equal(await counted(page), before);
});

test('YENİ İŞ chart: every month by kind, as columns, lines or one chart per kind, and as a table', async () => {
  const { page } = env;
  await go(page, 'panel');
  await waitHash(page, '#panel');
  assert.deepEqual(await page.$$eval('#chart-kinds-legend span', s => s.map(x => x.textContent.trim())), KIND_LABELS);
  assert.equal(await page.$$eval('#chart-kinds-legend i.hollow', s => s.length), 1, 'not known is a dashed outline');
  assert.equal(await page.getAttribute('#chart-kinds-bars', 'aria-pressed'), 'true');
  // hovering a column tells every kind of that month
  const last = (await page.$$('#chart-kinds .chart svg rect.hit')).pop();
  await last.hover();
  const tip = await text(page, '#chart-kinds .chart-tip');
  assert.match(tip, new RegExp('Ekim 2026 · ' + expected.months['2026-10'].rows + ' satır'));
  assert.match(tip, new RegExp(expected.months['2026-10'].kinds.renewal + ' ?Yenileme'));
  // lines on the same axis
  await page.click('#chart-kinds-lines');
  assert.equal(await page.$$eval('#chart-kinds path.series-line', p => p.length), 6);
  assert.equal(await page.$$eval('#chart-kinds-legend i.line', s => s.length), 6);
  // one small chart per kind, each with its total
  await page.click('#chart-kinds-split');
  const heads = await page.$$eval('#chart-kinds-panels .kinds-panel', ps => ps.map(p => [p.dataset.kind, p.querySelector('.kinds-panel-head').textContent]));
  assert.deepEqual(heads.map(h => h[0]), KIND_ORDER);
  heads.forEach(([k, head]) => assert.match(head, new RegExp(kindTotal(k) + ' satır'), k));
  // the table: each month's counts, the İptal block rows on their own
  await page.click('#chart-kinds .table-toggle');
  const rows = await page.$$eval('#chart-kinds tbody tr', trs => trs.map(tr => Array.from(tr.children).map(td => td.textContent.trim())));
  const keys = Object.keys(expected.months).sort();
  assert.equal(rows.length, keys.length);
  keys.forEach((k, i) => {
    assert.deepEqual(rows[i].slice(1, 7), KIND_ORDER.map(o => String(expected.months[k].kinds[o])), k);
    assert.equal(rows[i][7], String(expected.months[k].rows), k + ' rows');
    assert.equal(rows[i][8], String(CX.byMonth[k] || 0), k + ' İptal block rows');
  });
  await page.click('#chart-kinds .table-toggle');
  // the period choice narrows the chart
  await page.selectOption('#dash-period', 'y2025');
  await page.click('#chart-kinds .table-toggle');
  assert.equal(await page.$$eval('#chart-kinds tbody tr', r => r.length), 3);
  await page.selectOption('#dash-period', 'all');
  // the reports page has the same chart for its own period
  await go(page, 'raporlar');
  assert.ok(await page.$('#rep-newren #rep-newren-bars'));
  assert.deepEqual(env.errors, []);
});

test('no commission written: 10 % of the premium for Trafik, 15 % for anything else, marked ≈', async () => {
  const { page } = env;
  const pick = (trafik) => store(page, (tr) => {
    const p = Store.derived().policies.find(x => (x.commission == null || x.commission === '') && x.premium > 0 && (Schema.categoryOf(x.policyType) === 'trafik') === tr);
    return { id: p.id, month: p.month, customerId: p.customerId, premium: p.premium };
  }, trafik);
  const tp = await pick(true), op = await pick(false);
  for (const [p, rate] of [[tp, 0.10], [op, 0.15]]) {
    await go(page, 'musteri-' + p.customerId);
    await page.click('#pol-' + p.id + ' button[aria-expanded]');
    const detail = await text(page, '#pol-' + p.id + ' .policy-detail');
    assert.ok(detail.includes('≈ ' + money(round2(p.premium * rate)) + ' (%' + Math.round(rate * 100) + ' ile hesaplandı)'), detail);
  }
  // the month page marks the worked-out cells, and its commission counts them
  await go(page, 'ay-' + tp.month);
  const est = await store(page, (m) => Store.derived().rows.filter(p => p.month === m && (p.commission == null || p.commission === '') && p.premium).length, tp.month);
  assert.equal(await page.$$eval('table.sheet tbody .est', c => c.length), est);
  assert.equal(await page.getAttribute('#month-commission', 'title'), money(expected.months[tp.month].commission));
  assert.match(await text(page, '#month-commission + .kpi-sub'), /komisyonu hesaplandı/);
});

test('the policy list filters by what the YENİ İŞ cell says', async () => {
  const { page } = env;
  await go(page, 'policeler');
  for (const [k, n] of [['ek', kindTotal('ek')], ['zeyil', kindTotal('zeyil')]]) {
    await page.selectOption('#policies-nb', k);
    assert.equal(await text(page, '#policies-count'), num(n) + ' poliçe', k);
  }
  await page.selectOption('#policies-nb', '');
  assert.equal(await text(page, '#policies-count'), num(expected.totalPolicies) + ' poliçe');
});

test('the full Excel export: cancelling rows stay on their page; the summary has the refunds and commission taken back', async () => {
  const { page } = env;
  await go(page, 'ayarlar');
  const file = await download(page, () => page.click('#export-all'));
  const wb = readBook(file.bytes);
  const sum = sheetRows(wb, 'Özet');
  assert.deepEqual(sum[0].slice(9), ['İptal', 'İade', 'Geri alınan komisyon', 'Net komisyon']);
  const total = sum[sum.length - 1];
  assert.equal(total[1], expected.totalPolicies);
  assert.equal(total[9], CX.total + rowCancelCount);
  assert.equal(round2(total[10]), round2(CX.refundTotal + R.refundTotal));
  assert.equal(round2(total[11]), round2(blockReclaim + R.reclaimTotal));
  assert.equal(round2(total[12]), round2(expected.totalCommission - blockReclaim - R.reclaimTotal));
  const mart = sheetRows(wb, 'Mart 2026');
  assert.equal(mart.length - 1, expected.months['2026-03'].rows);
  const blockAt = mart[0].indexOf('ŞİRKET');
  assert.equal(mart.slice(1).filter(r => r.slice(blockAt).some(v => v != null)).length, CX.byMonth['2026-03'], 'only the İptal block rows in the block');
  assert.deepEqual(env.errors, []);
});
