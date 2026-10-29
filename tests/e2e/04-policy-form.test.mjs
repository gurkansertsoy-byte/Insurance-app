import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, waitHash, loadDemo, go, text, expected, store, money, download, readBook, sheetRows, confirmDialog } from './helpers.mjs';

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); });
test.after(async () => { await env.close(); });

const hint = (page, id) => text(page, '#f-' + id + '-hint');

test('saving an empty form explains what is missing', async () => {
  const { page } = env;
  await go(page, 'yeni');
  assert.equal(await text(page, '#page-title'), 'Yeni poliçe kaydı');
  assert.equal(await page.$eval('#f-month', s => s.value), '10', 'current month preselected');
  assert.equal(await page.$eval('#f-month-y', s => s.value), '2026');
  await page.click('#save-policy');
  await page.waitForSelector('.toast.bad');
  assert.equal(await hint(page, 'name'), 'Ad soyad gerekli');
  assert.equal(await hint(page, 'policyType'), 'Poliçe adı gerekli');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-name', 'focus jumps to the first problem');
  assert.equal(await store(page, () => Store.policies.size), expected.totalPolicies);
});

test('a new customer with every detail: live checks and helpers', async () => {
  const { page } = env;
  await page.fill('#f-name', 'deniz yıldırım');
  await page.press('#f-name', 'Tab');
  assert.equal(await page.inputValue('#f-name'), 'Deniz Yıldırım', 'lower-case name tidied');
  await page.fill('#f-tc', '12345678901');
  assert.match(await hint(page, 'tc'), /Kontrol haneleri tutmuyor/);
  await page.fill('#f-tc', '10000000146');
  assert.match(await hint(page, 'tc'), /TC kimlik no geçerli/);
  await page.fill('#f-phone', '5321234567');
  await page.press('#f-phone', 'Tab');
  assert.equal(await page.inputValue('#f-phone'), '0532 123 45 67');
  assert.match(await hint(page, 'phone'), /Cep telefonu/);
  await page.fill('#f-email', 'deniz@ornek.com');
  await page.fill('#f-profession', 'Mimar');
  await page.selectOption('#f-month', '11');
  await page.fill('#f-policyType', 'Kasko');
  assert.equal(await text(page, '#f-cat'), 'Kasko');
  await page.fill('#f-company', 'Allianz Sigorta');
  await page.fill('#f-policyNo', 'TEST-0001');
  await page.fill('#f-startDate', '05.11.2026');
  assert.equal(await page.inputValue('#f-endDate'), '05.11.2027', 'expiry set to +1 year');
  assert.match(await hint(page, 'endDate'), /gün sonra bitiyor/);
  await page.click('#f-newBusiness button:has-text("Yeni iş")');
  await page.fill('#f-plate', '06abc123');
  await page.press('#f-plate', 'Tab');
  assert.equal(await page.inputValue('#f-plate'), '06 ABC 123');
  assert.match(await hint(page, 'plate'), /Plaka biçimi doğru/);
  await page.fill('#f-serialNo', 'ab123456');
  await page.fill('#f-step', '5');
  await page.fill('#f-premium', '25000');
  await page.press('#f-premium', 'Tab');
  assert.equal(await page.inputValue('#f-premium'), '25.000,00');
  await page.fill('#f-rate', '15');
  assert.equal(await page.inputValue('#f-commission'), '3.750,00', 'commission from the rate');
  await page.click('#fill-card');
  assert.equal(await page.inputValue('#f-card'), '25.000,00');
  assert.match(await text(page, '#pay-info'), /Tamam/);
  await page.fill('#f-card', '20.000,00');
  await page.fill('#f-cash', '5000');
  assert.match(await text(page, '#pay-info'), /Tamam/);
  await page.fill('#f-cash', '1000');
  assert.match(await text(page, '#pay-info'), /eksik/);
  await page.fill('#f-cash', '5.000,00');
  await page.fill('#f-note', 'Garajda duruyor');
  const marka = page.locator('input[data-extra="MARKA"]');
  await marka.fill('Toyota');
  await page.fill('#f-newx-name', 'Renk');
  await page.fill('#f-newx-value', 'Beyaz');
  await page.click('button:has-text("Ekle") >> nth=-1');
  await page.click('#save-policy');
  await waitHash(page, /^#musteri-/);
  const saved = await store(page, () => {
    const c = Array.from(Store.customers.values()).find(x => x.tc === '10000000146');
    const p = Store.policiesOf(c.id)[0];
    return { c: [c.name, c.phone, c.email, c.profession], p: [p.month, p.policyType, p.company, p.policyNo, p.startDate, p.endDate, p.newBusiness, p.plate, p.serialNo, p.step, p.premium, p.commission, p.card, p.cash, p.note, p.insuredName], x: p.extras };
  });
  assert.deepEqual(saved.c, ['Deniz Yıldırım', '5321234567', 'deniz@ornek.com', 'Mimar']);
  assert.deepEqual(saved.p, ['2026-11', 'Kasko', 'Allianz Sigorta', 'TEST-0001', '2026-11-05', '2027-11-05', true, '06 ABC 123', 'AB123456', 5, 25000, 3750, 20000, 5000, 'Garajda duruyor', 'Deniz Yıldırım']);
  assert.deepEqual(saved.x, { MARKA: 'Toyota', Renk: 'Beyaz' });
  assert.match(await text(page, '#cm-2026-11'), /Kasko/);
  assert.match(await text(page, '#cm-2026-11'), /06 ABC 123/);
  assert.match(await text(page, '#cm-2026-11'), new RegExp(money(25000).replace('.', '\\.')));
});

test('date fields always use gg.aa.yyyy, whatever the browser language', async () => {
  const { page } = env;
  await go(page, 'yeni');
  await page.click('#f-issueDate');
  await page.keyboard.type('05032027');
  assert.equal(await page.inputValue('#f-issueDate'), '05.03.2027', 'dots added while typing');
  assert.equal(await page.getAttribute('#f-issueDate', 'data-iso'), '2027-03-05', 'read as 5 March, not 3 May');
  await page.fill('#f-issueDate', '2027-04-09');
  await page.press('#f-issueDate', 'Tab');
  assert.equal(await page.inputValue('#f-issueDate'), '09.04.2027', 'ISO is accepted and shown the Turkish way');
  await page.fill('#f-issueDate', '31.02.2026');
  await page.press('#f-issueDate', 'Tab');
  assert.equal(await page.$eval('#f-issueDate', i => i.parentElement.classList.contains('bad')), true, 'impossible date flagged');
  assert.ok(await page.isVisible('#f-issueDate ~ .date-btn'), 'calendar button');
  await page.click('#form-cancel');
});

test('the new month appears and its Excel export carries the extra columns', async () => {
  const { page } = env;
  await go(page, 'aylar');
  assert.ok(await page.isVisible('#month-2026-11'));
  await go(page, 'ay-2026-11');
  assert.equal(await text(page, '#month-count'), '1');
  const file = await download(page, () => page.click('#month-export'));
  const rows = sheetRows(readBook(file.bytes), 'Kasım 2026');
  assert.equal(rows.length, 2);
  for (const h of ['Poliçe adı', 'Adı soyadı', 'Tc kimlik no', 'Şirket poliçe tutarı', 'Kart', 'Nakit', 'Başlangıç tarihi', 'MARKA', 'Renk']) assert.ok(rows[0].includes(h), h);
  assert.equal(rows[1][rows[0].indexOf('MARKA')], 'Toyota');
});

test('picking an existing customer, then "save and new" keeping the customer', async () => {
  const { page } = env;
  await go(page, 'yeni');
  await page.fill('#f-name', 'Kemal Ayd');
  await page.waitForSelector('#name-suggest:not([hidden]) button');
  await page.click('#name-suggest button >> nth=0');
  await page.waitForSelector('#chosen-customer');
  assert.match(await text(page, '#chosen-customer'), /Kemal Aydoğdu/);
  assert.match(await text(page, '#chosen-customer'), new RegExp(expected.showcase.policyCount + ' poliçe'));
  await page.fill('#f-policyType', 'Ferdi Kaza');
  await page.fill('#f-premium', '1.250,00');
  await page.check('#f-keep');
  await page.click('#save-new');
  await page.waitForSelector('.toast:has-text("Kaydedildi")');
  await page.waitForSelector('#chosen-customer');
  assert.equal(await page.inputValue('#f-policyType'), '', 'policy fields reset');
  assert.match(await text(page, '#chosen-customer'), new RegExp((expected.showcase.policyCount + 1) + ' poliçe'), 'customer kept');
  await page.fill('#f-policyType', 'Hayat');
  await page.keyboard.press('Control+s');
  await waitHash(page, /^#musteri-/);
  assert.equal(await text(page, '#stat-policies'), String(expected.showcase.policyCount + 2));
});

test('typing a TC that belongs to someone offers that customer; duplicate policy numbers are flagged', async () => {
  const { page } = env;
  await go(page, 'yeni');
  await page.fill('#f-tc', expected.showcase.tc);
  assert.match(await hint(page, 'tc'), /Kemal Aydoğdu adına kayıtlı/);
  await page.click('#f-tc-hint button');
  await page.waitForSelector('#chosen-customer');
  const anyNo = await store(page, () => Array.from(Store.policies.values()).find(p => p.policyNo && p.policyNo.startsWith('AZ-')).policyNo);
  await page.fill('#f-policyNo', anyNo);
  assert.match(await hint(page, 'policyNo'), /zaten kayıtlı/);
  await page.click('#cust-change');
  assert.equal(await page.inputValue('#f-name'), '');
  await page.click('#form-cancel');
});

test('edit a policy and see the change everywhere', async () => {
  const { page } = env;
  const id = await store(page, () => Array.from(Store.policies.values()).find(p => p.policyNo === 'TEST-0001').id);
  await go(page, 'duzenle-' + id);
  assert.equal(await text(page, '#page-title'), 'Poliçeyi düzenle');
  assert.equal(await page.inputValue('#f-policyNo'), 'TEST-0001');
  assert.equal(await page.inputValue('#f-premium'), '25.000,00', 'existing amount loaded');
  await page.fill('#f-premium', '26.500,00');
  await page.click('#save-policy');
  await waitHash(page, /^#musteri-/);
  assert.equal(await store(page, (pid) => Store.policies.get(pid).premium, id), 26500);
  await page.click('#tab-notes');
  assert.match(await text(page, '.timeline'), /Poliçe güncellendi/);
});

test('delete a policy and undo it', async () => {
  const { page } = env;
  await page.click('#tab-policies');
  const before = await store(page, () => Store.policies.size);
  await page.click('.policy-row button[title="Sil"] >> nth=0');
  await confirmDialog(page);
  assert.equal(await store(page, () => Store.policies.size), before - 1);
  await page.click('.toast button:has-text("Geri al")');
  assert.equal(await store(page, () => Store.policies.size), before);
  assert.deepEqual(env.errors, []);
});
