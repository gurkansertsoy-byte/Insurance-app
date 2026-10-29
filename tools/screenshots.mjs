// Takes the screenshots in docs/screenshots/ by driving the app with the sample workbook.
// Usage: npm run screenshots   (needs Playwright, like the browser tests)
import fs from 'node:fs';
import path from 'node:path';
import { setup, loadDemo, go, waitHash, expected, ROOT } from '../tests/e2e/helpers.mjs';

const DIR = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(DIR, { recursive: true });

async function snap(page, name, opts = {}) {
  if (!opts.keepMouse) await page.mouse.move(1, 1);
  // a whole page is taken as one tall window, so the menu and the sticky bars sit where they belong
  const size = page.viewportSize();
  if (opts.fullPage) await page.setViewportSize({ width: size.width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(DIR, name + '.png'), animations: 'disabled' });
  if (opts.fullPage) await page.setViewportSize(size);
  console.log('  ' + name + '.png');
}

const kemalId = (page) => page.evaluate((n) => Array.from(Store.customers.values()).find(c => c.name === n).id, expected.showcase.name);

/** A few notes, tasks, payments and renewal calls, so the screens look like a working day. */
async function workingDay(page) {
  await page.evaluate((name) => {
    Store.setSetting('agencyName', 'Yıldız Sigorta Aracılık');
    const byName = (n) => Array.from(Store.customers.values()).find(c => c.name === n);
    const kemal = byName(name);
    const at = (iso, hm) => new Date(iso + 'T' + hm + ':00+03:00').getTime();
    const a1 = Store.addNote(kemal.id, 'Kasko yenilemesi için 15 Kasım\'da aranacak. Eşi için konut teklifi istedi.', 'call');
    a1.at = at('2026-10-28', '14:20');
    const a2 = Store.addNote(kemal.id, 'Hasarsızlık indirimi belgesi WhatsApp ile gönderildi.', 'whatsapp');
    a2.at = at('2026-10-21', '11:05');

    const d = Store.derived();
    const due = d.policies.filter(p => d.renewal.get(p.id).state === 'due').sort((a, b) => a.endDate < b.endDate ? -1 : 1);
    Store.setRenewalStatus(due[0].id, 'contacted');
    Store.setRenewalStatus(due[1].id, 'quoted', 'Allianz ve Axa teklifleri gönderildi');
    Store.setRenewalStatus(due[3].id, 'contacted');

    const onAccount = Array.from(Store.policies.values()).filter(p => p.account > 0).sort((a, b) => b.account - a.account);
    Store.addPayment(onAccount[1].id, { amount: 5000, date: '2026-10-27', method: 'transfer', note: 'İlk taksit' });
    Store.addPayment(onAccount[2].id, { amount: 2500, date: '2026-10-28', method: 'card', note: '' });
    Store.addPayment(onAccount[4].id, { amount: onAccount[4].account, date: '2026-10-29', method: 'cash', note: 'Kapandı' });

    const cust = (i) => due[i] && due[i].customerId;
    Store.saveTask({ title: 'Kasko teklifini gönder', due: '2026-10-29', customerId: kemal.id });
    Store.saveTask({ title: 'Konut sigortası teklifi hazırla', due: '2026-10-29', customerId: kemal.id, note: 'Eşi Elif Hanım için' });
    Store.saveTask({ title: 'Poliçe evraklarını kargoya ver', due: '2026-10-29', customerId: cust(6) });
    Store.saveTask({ title: 'DASK yenilemesi için ara', due: '2026-10-27', customerId: cust(2) });
    Store.saveTask({ title: 'Hasar dosyası evraklarını topla', due: '2026-10-31', customerId: cust(5), note: 'Ekspertiz raporu ve fatura' });
    Store.saveTask({ title: 'Cari bakiye için ödeme hatırlatması', due: '2026-11-03', customerId: onAccount[0].customerId });
    Store.saveTask({ title: 'Aylık üretim raporunu şirkete gönder', due: '2026-11-05' });
    const done = Store.saveTask({ title: 'Yeni araç için trafik poliçesi kes', due: '2026-10-26', customerId: cust(4) });
    Store.toggleTask(done.id, true);
  }, expected.showcase.name);
}

async function desktop() {
  console.log('desktop, light');
  const env = await setup({ viewport: { width: 1440, height: 900 } });
  const { page, base } = env;
  try {
    await page.goto(base);
    await page.waitForSelector('#try-demo');
    await snap(page, '01-welcome');

    await page.click('#try-demo');
    await page.waitForSelector('#sheet-table');
    await snap(page, '02-import-preview', { fullPage: true });
    await page.click('#map-btn-6');
    await page.waitForSelector('dialog[open] .map-row');
    await snap(page, '03-import-columns');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog[open]', { state: 'detached' });
    await page.click('#import-run');
    await page.waitForSelector('#import-done');
    await snap(page, '04-import-result', { fullPage: true });

    await workingDay(page);
    const kemal = await kemalId(page);

    await go(page, 'panel');
    await snap(page, '05-dashboard', { fullPage: true });

    await page.fill('#global-search', 'kemal');
    await page.waitForFunction(() => { const p = document.getElementById('search-pop'); return p && !p.hidden && p.dataset.q === 'kemal'; });
    await snap(page, '06-search');
    await page.keyboard.press('Escape');
    await page.fill('#global-search', '');

    await go(page, 'musteriler');
    await snap(page, '07-customers');

    await go(page, 'musteri-' + kemal);
    await snap(page, '08-customer-360', { fullPage: true });
    await page.click('#cm-2025-11 .policy-row button[aria-expanded]');
    await page.waitForSelector('#cm-2025-11 .policy-detail');
    await page.evaluate(() => { const el = document.querySelector('#cm-2025-11'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90); });
    await snap(page, '09-policy-detail');
    await page.click('#tab-notes');
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, '10-customer-notes');

    await go(page, 'yeni');
    await page.fill('#f-name', 'Kemal Ayd');
    await page.waitForSelector('#name-suggest:not([hidden]) button');
    await snap(page, '11-new-policy-pick-customer');
    await page.fill('#f-name', '');
    await go(page, 'panel');
    await go(page, 'yeni');
    await page.fill('#f-name', 'deniz yıldırım');
    await page.press('#f-name', 'Tab');
    await page.fill('#f-tc', '10000000146');
    await page.fill('#f-phone', '5321234567');
    await page.press('#f-phone', 'Tab');
    await page.fill('#f-email', 'deniz@ornek.com');
    await page.fill('#f-profession', 'Mimar');
    await page.fill('#f-policyType', 'Kasko');
    await page.fill('#f-company', 'Allianz Sigorta');
    await page.fill('#f-policyNo', 'AZ-2026-118204');
    await page.fill('#f-startDate', '05.11.2026');
    await page.press('#f-startDate', 'Tab');
    await page.click('#f-newBusiness button:has-text("Yeni iş")');
    await page.fill('#f-plate', '06abc123');
    await page.press('#f-plate', 'Tab');
    await page.fill('#f-serialNo', 'ab123456');
    await page.fill('#f-step', '5');
    await page.fill('#f-premium', '25000');
    await page.press('#f-premium', 'Tab');
    await page.fill('#f-rate', '15');
    await page.press('#f-rate', 'Tab');
    await page.fill('#f-card', '20.000,00');
    await page.fill('#f-cash', '5.000,00');
    await page.press('#f-cash', 'Tab');
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, '12-new-policy-form', { fullPage: true });
    await page.click('#form-cancel');

    await go(page, 'aylar');
    await snap(page, '13-months', { fullPage: true });
    await go(page, 'ay-2026-03');
    await snap(page, '14-month-detail');

    await go(page, 'policeler');
    await snap(page, '15-policies');

    await go(page, 'yenilemeler');
    await snap(page, '16-renewals');

    await go(page, 'tahsilat');
    await snap(page, '17-collections');
    const top = await page.evaluate(() => Array.from(Store.policies.values()).filter(p => Portfolio.outstanding(p) > 0).sort((a, b) => Portfolio.outstanding(b) - Portfolio.outstanding(a))[0].id);
    await page.click('#pay-' + top);
    await page.waitForSelector('dialog[open] #pay-amount');
    await snap(page, '18-payment');
    await page.keyboard.press('Escape');

    await go(page, 'gorevler');
    await snap(page, '19-tasks');

    await go(page, 'raporlar');
    await snap(page, '20-reports', { fullPage: true });

    await go(page, 'ayarlar');
    await snap(page, '21-settings', { fullPage: true });
    // the same person typed in again by hand, without a TC number: the duplicate finder offers to merge
    const dupId = await page.evaluate(() => Store.saveCustomer({ name: 'KEMAL AYDOĞDU', phone: '0544 000 11 22', profession: 'Mühendis' }).id);
    await page.click('#dup-btn');
    await page.waitForSelector('dialog[open] .card');
    await snap(page, '22-duplicates');
    await page.keyboard.press('Escape');
    await page.evaluate((id) => Store.deleteCustomer(id), dupId);

    await go(page, 'musteri-' + kemal);
    await page.emulateMedia({ media: 'print' });
    await snap(page, '23-print-statement', { fullPage: true });
    await page.emulateMedia({ media: 'screen' });

    await go(page, 'musteri-' + kemal);
    await page.click('#lang-btn');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    await snap(page, '24-english');
    await page.click('#lang-btn');
    if (env.errors.length) throw new Error(env.errors.join('\n'));
  } finally { await env.close(); }
}

async function dark() {
  console.log('desktop, dark');
  const env = await setup({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const { page, base } = env;
  try {
    await loadDemo(page, base);
    await workingDay(page);
    await go(page, 'panel');
    await snap(page, '25-dark-dashboard');
    await go(page, 'musteri-' + await kemalId(page));
    await snap(page, '26-dark-customer');
    if (env.errors.length) throw new Error(env.errors.join('\n'));
  } finally { await env.close(); }
}

async function phone() {
  console.log('phone');
  const env = await setup({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  const { page, base } = env;
  try {
    await loadDemo(page, base);
    await workingDay(page);
    await go(page, 'panel');
    await snap(page, '27-phone-dashboard');
    await page.click('.menu-btn');
    await page.waitForTimeout(300);
    await snap(page, '28-phone-menu');
    await page.keyboard.press('Escape');
    await go(page, 'musteri-' + await kemalId(page));
    await snap(page, '29-phone-customer');
    await go(page, 'yenilemeler');
    await snap(page, '30-phone-renewals');
    if (env.errors.length) throw new Error(env.errors.join('\n'));
  } finally { await env.close(); }
}

await desktop();
await dark();
await phone();
console.log('saved in', path.relative(ROOT, DIR));
