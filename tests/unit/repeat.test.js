'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../../js/core/util.js');
const P = require('../../js/core/portfolio.js');

U.setToday('2026-10-29');

test('YENİ İŞ words: case does not matter, "ek" anywhere wins, empty is not known', () => {
  const k = (v) => U.businessKind(v);
  assert.deepEqual(['YENİ İŞ', 'yeni iş', 'Yeni', 'YENI IS', 'EVET', 'X', '✓'].map(k), Array(7).fill('new'));
  assert.deepEqual(['YENİLEME', 'yenileme', 'Yenilendi', 'HAYIR'].map(k), Array(4).fill('renewal'));
  assert.deepEqual(['İPTAL', 'iptal', 'İptal edildi', 'iptal - yenileme'].map(k), Array(4).fill('cancel'));
  assert.deepEqual(['ZEYİL', 'zeyil', 'Zeyilname'].map(k), Array(3).fill('zeyil'));
  assert.deepEqual(['EK', 'ek', 'İMM EK', 'imm ek', 'Yenileme - Ek', 'YENİ İŞ EK', 'ek zeyil', 'iptal ek'].map(k), Array(8).fill('ek'));
  assert.deepEqual(['', '   ', null, undefined, 'teklif', 'Çek', 'devir'].map(k), Array(7).fill('unknown'), '"ek" only as a word of its own');
  assert.equal(P.kindOf({ businessText: 'İMM EK', newBusiness: true }), 'ek');
  assert.equal(P.kindOf({ newBusiness: true }), 'new');
  assert.equal(P.kindOf({ newBusiness: false }), 'renewal');
  assert.equal(P.kindOf({}), 'unknown');
});

test('commission not written: 10 % of the premium for Trafik, 15 % for anything else', () => {
  assert.deepEqual(P.commissionOf({ policyType: 'Trafik', premium: 8000 }), { value: 800, estimated: true });
  assert.deepEqual(P.commissionOf({ policyType: 'ZORUNLU TRAFİK SİGORTASI', premium: 1234.5 }), { value: 123.45, estimated: true });
  assert.deepEqual(P.commissionOf({ policyType: 'Kasko', premium: 20000 }), { value: 3000, estimated: true });
  assert.deepEqual(P.commissionOf({ policyType: 'DASK', premium: 1000 }), { value: 150, estimated: true });
  assert.deepEqual(P.commissionOf({ premium: 1000 }), { value: 150, estimated: true }, 'no line of business: 15 %');
  assert.deepEqual(P.commissionOf({ policyType: 'Kasko', premium: 20000, commission: 2400 }), { value: 2400, estimated: false }, 'written: kept');
  assert.deepEqual(P.commissionOf({ policyType: 'Kasko', premium: 20000, commission: 0 }), { value: 0, estimated: false }, 'a written 0 is a 0');
  assert.deepEqual(P.commissionOf({ policyType: 'Trafik', premium: -5000 }), { value: -500, estimated: true });
  // an İptal row: 10 % / 15 % of Kart + Cari + Nakit
  assert.equal(P.blockReclaim({ policyText: 'TRAFİK', card: 1000, cash: 500 }), 150);
  assert.equal(P.blockReclaim({ policyText: 'KASKO', account: 2000 }), 300);
  assert.equal(P.blockReclaim({ policyText: '?', account: 2000 }, { policyType: 'Trafik' }), 200, 'the cancelled policy says what it was');
});

// a small file: customer c1 (Ali Er) and c2 (Can Ak)
const customers = new Map([['c1', { id: 'c1', name: 'Ali Er' }], ['c2', { id: 'c2', name: 'Can Ak' }]]);
let row = 0;
const pol = (o) => Object.assign({ id: 'p' + (++row), customerId: 'c1', company: 'Axa Sigorta', policyType: 'Kasko', source: { row: row + 1 } }, o);

test('the same policy number again before the year is over: minus amounts cancel the policy', () => {
  const may = pol({ month: '2025-05', policyNo: 'AX-100200', plate: '34 AB 123', premium: 20000, commission: 3000, endDate: '2026-05-10', businessText: 'YENİ İŞ' });
  const july = pol({ month: '2025-07', policyNo: 'AX-100200', plate: '34AB123', premium: -14000, commission: -2100, businessText: 'İPTAL', company: 'AXA SİGORTA' });
  const sameMonth = pol({ month: '2025-05', policyNo: 'DG-55501', policyType: 'Trafik', premium: 9000, commission: 800, endDate: '2026-05-20' });
  const lower = pol({ month: '2025-05', policyNo: 'DG-55501', policyType: 'Trafik', premium: -9000 });
  const plus = pol({ month: '2025-06', policyNo: 'AN-777', premium: 5000, commission: 750, endDate: '2026-06-01' });
  const plusAgain = pol({ month: '2025-09', policyNo: 'AN-777', premium: 3000, commission: 450 });
  const zeyil = pol({ month: '2025-08', policyNo: 'AX-100200', premium: 350, commission: 50, businessText: 'ZEYİL' });
  const otherCompany = pol({ month: '2025-06', policyNo: 'AX-100200', premium: -10, company: 'Allianz' });
  const renewed = pol({ month: '2026-05', policyNo: 'AX-100200', premium: 26000, endDate: '2027-05-10', businessText: 'YENİLEME' });
  const someoneElse = pol({ month: '2025-06', policyNo: 'MP-4242', customerId: 'c2', plate: '06 ZZ 99', premium: -100 });
  const owner = pol({ month: '2025-05', policyNo: 'MP-4242', plate: '35 CC 1', premium: 4000, endDate: '2026-05-01' });
  const orphan = pol({ month: '2025-07', policyNo: 'HD-1', premium: -2500, commission: -300 });
  const iptalPlus = pol({ month: '2025-10', policyNo: 'AN-999', premium: 1200, businessText: 'İptal' });
  const imm = pol({ month: '2025-11', policyNo: 'DG-55501', policyType: 'İMM', premium: 900, businessText: 'İMM EK' });
  const tssMay = pol({ month: '2025-05', policyNo: 'TS-31', policyType: 'TSS', premium: 9000, commission: 1300, endDate: '2026-05-02' });
  const tssIptal = pol({ month: '2025-08', policyNo: 'TS-31', policyType: 'TSS', premium: 6000, commission: 900, businessText: 'İPTAL' });
  const minusFirst = pol({ month: '2025-06', policyNo: 'NV-8', premium: -700 });
  const afterMinus = pol({ month: '2025-09', policyNo: 'NV-8', premium: 1500, businessText: 'YENİ İŞ' });
  const all = [may, july, sameMonth, lower, plus, plusAgain, zeyil, otherCompany, renewed, someoneElse, owner, orphan, iptalPlus, imm, tssMay, tssIptal, minusFirst, afterMinus];
  const r = P.findRepeats(all, customers);

  assert.deepEqual(r.get(july.id), { of: may.id, kind: 'cancel', state: 'auto', reasons: [], minus: true }, 'July cancels May');
  assert.deepEqual(r.get(lower.id), { of: sameMonth.id, kind: 'cancel', state: 'auto', reasons: [], minus: true }, 'a lower row of the same page');
  assert.equal(r.get(plusAgain.id).state, 'ask', 'plus amounts: the user is asked');
  assert.equal(r.get(plusAgain.id).kind, 'cancel');
  assert.deepEqual([r.get(zeyil.id).kind, r.get(zeyil.id).of], ['endorse', may.id], 'ZEYİL adds to the policy');
  assert.equal(r.get(imm.id).kind, 'endorse', 'İMM EK too');
  assert.equal(r.get(otherCompany.id).of, null, 'another company: not the same policy (a cancellation of its own)');
  assert.equal(r.has(renewed.id), false, 'after the year: renewed under the same number');
  assert.deepEqual([r.get(someoneElse.id).state, r.get(someoneElse.id).reasons], ['ask', ['name', 'plate']], 'other person, other car: asked');
  assert.deepEqual(r.get(orphan.id), { of: null, kind: 'cancel', state: 'auto', reasons: [], minus: true }, 'a policy from before the file');
  assert.deepEqual([r.get(iptalPlus.id).kind, r.get(iptalPlus.id).state, r.get(iptalPlus.id).of], ['cancel', 'ask', null], 'İPTAL with plus amounts: refund or not, the user says');
  [may, sameMonth, plus, owner].forEach(p => assert.equal(r.has(p.id), false, 'first rows are policies'));
  assert.deepEqual([r.get(tssIptal.id).of, r.get(tssIptal.id).state], [tssMay.id, 'ask'], 'İPTAL written again with plus amounts: asked');
  assert.deepEqual([r.get(minusFirst.id).of, r.get(minusFirst.id).state], [null, 'auto'], 'a minus row first: a policy from before the file');
  assert.equal(r.has(afterMinus.id), false, 'a cancelling row is no policy for a later row to write again');

  // what the cancelling row gives back
  assert.deepEqual(P.rowCancelAmounts(july, may), { refund: 14000, reclaim: 2100, reclaimEstimated: false, card: null, account: null, cash: null });
  assert.deepEqual(P.rowCancelAmounts(lower, sameMonth), { refund: 9000, reclaim: 900, reclaimEstimated: true, card: null, account: null, cash: null }, 'Trafik: 10 %');
  assert.deepEqual(P.rowCancelAmounts(pol({ premium: 3000, account: 3000 }), plus), { refund: 3000, reclaim: 450, reclaimEstimated: true, card: null, account: 3000, cash: null }, 'others: 15 %');

  // the user's answers
  assert.equal(P.repeatEffect(plusAgain, r.get(plusAgain.id)), 'ask');
  assert.equal(P.repeatEffect(Object.assign({}, plusAgain, { repeatDecision: 'cancel' }), r.get(plusAgain.id)), 'cancel');
  assert.equal(P.repeatEffect(Object.assign({}, july, { repeatDecision: 'not' }), r.get(july.id)), null);
  assert.equal(P.repeatEffect(zeyil, r.get(zeyil.id)), 'endorse');
  assert.equal(P.repeatEffect(july, r.get(july.id)), 'cancel');
});

test('EK / ZEYİL rows are no policies of their own to renew', () => {
  const base = pol({ month: '2025-11', policyNo: 'AX-1', endDate: '2026-11-05', customerId: 'c1' });
  const ek = pol({ month: '2026-01', policyNo: 'AX-1', endDate: '2026-11-15', customerId: 'c1', businessText: 'İMM EK' });
  const info = P.renewalInfo([base, ek], { today: '2026-10-29', skip: new Set([ek.id]) });
  assert.equal(info.get(base.id).state, 'due');
  assert.equal(info.get(ek.id).state, 'none');
});

test('the sample workbook: cancelling rows, questions, additions, estimated commission and YENİ İŞ per month', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const XLSX = require('../../vendor/xlsx.full.min.js');
  const Importer = require('../../js/core/importer.js');
  const ROOT = path.join(__dirname, '..', '..');
  const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'sample-data', 'expected.json'), 'utf8'));
  const a = Importer.analyzeWorkbook(Importer.readWorkbook(new Uint8Array(fs.readFileSync(path.join(ROOT, 'sample-data', 'ornek-portfoy.xlsx'))), XLSX, 'x.xlsx'), XLSX, { fileName: 'x.xlsx' });
  const built = Importer.buildRecords(a, {});
  const state = { customers: new Map(), policies: new Map() };
  P.importRecords(state, built.records, { now: 1 });
  const rows = Array.from(state.policies.values());
  assert.equal(rows.length, expected.totalRows, 'every row is kept');
  const reps = P.findRepeats(rows, state.customers);
  const eff = rows.map(p => [p, P.repeatEffect(p, reps.get(p.id))]);
  const policies = eff.filter(x => x[1] !== 'cancel').map(x => x[0]);
  const cancelRows = eff.filter(x => x[1] === 'cancel').map(x => x[0]);
  assert.equal(policies.length, expected.totalPolicies);
  assert.equal(cancelRows.filter(p => reps.get(p.id).of).length, expected.repeats.cancel, 'cancelling rows that find their policy');
  assert.equal(cancelRows.filter(p => !reps.get(p.id).of).length, expected.repeats.orphan, 'and the one from before the file');
  assert.equal(eff.filter(x => x[1] === 'ask').length, expected.repeats.ask);
  assert.equal(eff.filter(x => x[1] === 'endorse').length, expected.repeats.endorse);
  for (const e of expected.repeats.list.filter(x => x.role === 'cancel')) {
    const q = rows.find(p => p.policyNo === e.policyNo && p.month === e.month && p.premium < 0);
    const base = state.policies.get(reps.get(q.id).of);
    assert.deepEqual([base.policyNo, base.month], [e.policyNo, e.ofMonth], e.policyNo);
  }
  const amounts = cancelRows.map(q => P.rowCancelAmounts(q, state.policies.get(reps.get(q.id).of)));
  assert.equal(U.round2(U.sum(amounts, x => x.refund)), expected.repeats.refundTotal);
  assert.equal(U.round2(U.sum(amounts, x => x.reclaim)), expected.repeats.reclaimTotal);
  const tot = P.totals(policies);
  assert.equal(tot.premium, expected.totalPremium);
  assert.equal(tot.commission, expected.totalCommission, 'written commission, and 10 % / 15 % where none is written');
  assert.deepEqual([tot.estimated, tot.commissionEst], [expected.estimatedCommission.count, expected.estimatedCommission.total]);
  for (const [key, m] of Object.entries(expected.months)) {
    const kinds = { new: 0, renewal: 0, cancel: 0, ek: 0, zeyil: 0, unknown: 0 };
    rows.filter(p => p.month === key).forEach(p => { kinds[P.kindOf(p)]++; });
    assert.deepEqual(kinds, m.kinds, 'YENİ İŞ of ' + key);
    assert.equal(policies.filter(p => p.month === key).length, m.count, 'policies of ' + key);
  }
});

test('Excel export: cancelling rows stay rows of their month; the summary counts refunds and commission taken back', () => {
  const XLSX = require('../../vendor/xlsx.full.min.js');
  const Exporter = require('../../js/core/exporter.js');
  const may = pol({ month: '2025-05', policyNo: 'TR-77', policyType: 'Trafik', premium: 10000, commission: 1000, customerId: 'c1' });
  const july = pol({ month: '2025-07', policyNo: 'TR-77', policyType: 'Trafik', premium: -6000, commission: -600, customerId: 'c1' });
  const kasko = pol({ month: '2025-07', policyNo: 'KS-9', policyType: 'Kasko', premium: 20000, customerId: 'c2' }); // no commission: 15 %
  const rowCancel = Object.assign({ id: 'row-' + july.id, kind: 'row', rowId: july.id, month: '2025-07', policyId: may.id }, P.rowCancelAmounts(july, may));
  const block = { id: 'x1', month: '2025-07', company: 'ANA', policyText: 'KASKO', insuredName: 'Can Ak', card: 1000, cash: 1000 };
  const wb = Exporter.portfolioWorkbook({ XLSX, policies: [may, kasko], rows: [may, july, kasko], customers, lang: 'tr', withSummary: true, cancels: [rowCancel, block] });
  const sum = XLSX.utils.sheet_to_json(wb.Sheets['Özet'], { header: 1 });
  assert.deepEqual(sum[0].slice(9), ['İptal', 'İade', 'Geri alınan komisyon', 'Net komisyon']);
  const temmuz = sum.find(r => r[0] === 'Temmuz 2025');
  // July: the Kasko (15 % of 20.000 = 3.000), one row cancel (6.000 back, 600 commission) and one İptal block row (2.000 back, 15 % = 300)
  assert.deepEqual([temmuz[1], temmuz[4], temmuz[9], temmuz[10], temmuz[11], temmuz[12]], [1, 3000, 2, 8000, 900, 2100]);
  const total = sum[sum.length - 1];
  assert.deepEqual([total[0], total[1], total[4], total[9], total[10], total[11], total[12]], ['Toplam', 2, 4000, 2, 8000, 900, 3100]);
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets['Temmuz 2025'], { header: 1 });
  const blockAt = sheet[0].indexOf('ŞİRKET');
  assert.ok(blockAt > 0);
  assert.equal(sheet.length, 3, 'header, the minus row and the Kasko');
  assert.ok(sheet.slice(1).some(r => r.includes(-6000)), 'the cancelling row keeps its minus amount');
  assert.deepEqual(sheet.slice(1).map(r => r[blockAt]).filter(Boolean), ['ANA'], 'only the İptal block row goes into the block');
});

test('renewals: found on another customer card by plate or policy number; an early YENİLEME with the same number is no question', () => {
  const old = pol({ customerId: 'c1', month: '2025-10', policyNo: 'RY-555', policyType: 'Trafik', plate: '34 AB 12', premium: 9000, endDate: '2026-10-20' });
  // the renewal written under a second card (the name typed differently), same car
  const byPlate = pol({ customerId: 'c2', month: '2026-10', policyNo: 'RY-777', policyType: 'Zorunlu Trafik', plate: '34AB12', premium: 9900, endDate: '2027-10-20' });
  const home = pol({ customerId: 'c1', month: '2025-10', policyNo: 'DG-88001', policyType: 'Konut', premium: 2000, endDate: '2026-10-25' });
  // renewed a month early under the same policy number, on another card
  const early = pol({ customerId: 'c2', month: '2026-09', policyNo: 'DG-88001', policyType: 'Konut', premium: 2200, endDate: '2027-10-25', businessText: 'YENİLEME' });
  const all = [old, byPlate, home, early];
  const info = P.renewalInfo(all, { today: '2026-11-01' });
  assert.deepEqual([info.get(old.id).state, info.get(old.id).successorId], ['renewed', byPlate.id]);
  assert.deepEqual([info.get(home.id).state, info.get(home.id).successorId], ['renewed', early.id]);
  assert.equal(P.findRepeats(all, customers).has(early.id), false, 'not asked as a cancellation');
  // the same number written again with YENİLEME in the middle of the year is still asked about
  const mid = pol({ customerId: 'c1', month: '2026-03', policyNo: 'DG-88001', policyType: 'Konut', premium: 500, businessText: 'YENİLEME' });
  assert.equal(P.findRepeats([home, mid], customers).get(mid.id).state, 'ask');
});
