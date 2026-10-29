// Takes the screenshots in docs/screenshots/ by driving the app with the sample workbook.
// Usage: npm run screenshots   (needs Playwright, like the browser tests)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { setup, loadDemo, go, waitHash, expected, ROOT } from '../tests/e2e/helpers.mjs';

const require = createRequire(import.meta.url);
const ExcelJS = require('../vendor/exceljs.min.js');

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

// ------------------------------------------------------------------ the linked Excel file
const FILE = 'Uretim-2026.xlsx';

async function putFile(page, name, bytes) {
  await page.evaluate(async ([n, b64]) => {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(n, { create: true });
    const w = await fh.createWritable();
    await w.write(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    await w.close();
    window.showOpenFilePicker = async () => [fh];
  }, [name, Buffer.from(bytes).toString('base64')]);
}
async function getFile(page, name) {
  const b64 = await page.evaluate(async (n) => {
    const f = await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile();
    const buf = new Uint8Array(await f.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    return btoa(s);
  }, name);
  return Buffer.from(b64, 'base64');
}
const saved = (page, n) => page.waitForFunction((k) => window.FileLink.status === 'saved' && window.FileLink.link.writes > k, n, { timeout: 20000 });

/** Part of a worksheet drawn the way Excel shows it (fills, bold, borders, dates), from the saved file. */
async function sheetPicture(page, bytes, name, o) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const ws = wb.getWorksheet(name);
  const letter = (c) => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const money = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function textOf(cell) {
    let v = cell.value;
    if (v && typeof v === 'object' && !(v instanceof Date)) v = 'result' in v ? v.result : v.richText ? v.richText.map(t => t.text).join('') : v.text;
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10).split('-').reverse().join('.');
    if (typeof v === 'number') return /0\.00/.test(cell.numFmt || '') || !Number.isInteger(v) ? money.format(v) : String(v);
    return String(v);
  }
  function style(cell) {
    const st = [];
    const f = cell.fill;
    if (f && f.type === 'pattern' && f.pattern === 'solid' && f.fgColor && f.fgColor.argb) st.push('background:#' + f.fgColor.argb.slice(-6));
    if (cell.font && cell.font.bold) st.push('font-weight:700');
    const b = cell.border || {};
    ['top', 'right', 'bottom', 'left'].forEach(k => { if (b[k] && b[k].style) st.push('border-' + k + ':1px solid #222'); });
    if (typeof cell.value === 'number' || cell.value instanceof Date) st.push('text-align:right');
    return st.join(';');
  }
  const head = '<tr><th></th>' + o.cols.map(c => c ? '<th>' + letter(c) + '</th>' : '<th class="gap">…</th>').join('') + '</tr>';
  const body = o.rows.map(r => {
    if (!r) return '<tr class="gaprow"><th>…</th>' + o.cols.map(() => '<td class="gap"></td>').join('') + '</tr>';
    const row = ws.getRow(r);
    return '<tr' + ((o.mark || []).includes(r) ? ' class="mark"' : '') + '><th>' + r + '</th>' + o.cols.map(c => {
      if (!c) return '<td class="gap"></td>';
      const cell = row.getCell(c);
      return '<td style="' + style(cell) + '">' + esc(textOf(cell)) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  const widths = '<colgroup><col style="width:38px">' + o.cols.map(c => '<col style="width:' + (c ? Math.round(Math.min(26, ws.getColumn(c).width || 10) * 7 + 10) : 22) + 'px">').join('') + '</colgroup>';
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent('<!doctype html><meta charset="utf-8"><style>' +
    'body{margin:0;padding:18px;background:#fff;font:13px Calibri,"Segoe UI",Arial,sans-serif;color:#111}' +
    '.cap{font:600 13px system-ui,sans-serif;color:#444;margin:0 0 8px}' +
    'table{border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #d9d9d9;padding:3px 6px;height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    'th{background:#f3f3f3;color:#555;font-weight:400;text-align:center}td.gap,th.gap{background:#fafafa;color:#999;text-align:center;border-color:#eee}' +
    'tr.gaprow th,tr.gaprow td{height:10px;padding:0;background:#fafafa}tr.mark td{box-shadow:inset 0 0 0 9999px rgba(26,127,100,.13)}' +
    'tr.mark th{background:#1a7f64;color:#fff;font-weight:700}.tab{display:inline-block;margin-top:10px;padding:4px 14px;border:1px solid #bbb;border-top:0;background:#fff;font:600 12px system-ui;color:#1a7f64}' +
    '</style><div id="pic"><p class="cap">' + esc(o.caption) + '</p><table>' + widths + head + body + '</table><span class="tab">' + esc(name) + '</span></div>');
  await page.locator('#pic').screenshot({ path: path.join(DIR, o.file + '.png') });
  console.log('  ' + o.file + '.png');
}

async function excel() {
  console.log('the linked Excel file');
  const env = await setup({ viewport: { width: 1440, height: 900 } });
  const { page, base } = env;
  try {
    // this Chromium build crashes reading a file handle back from IndexedDB: keep none (see FileLink)
    await env.context.addInitScript(() => localStorage.setItem('sp:handle-off', (/Chrom(?:e|ium)\/(\d+)/.exec(navigator.userAgent) || [])[1] || 'other'));
    await page.goto(base);
    await putFile(page, FILE, fs.readFileSync(path.join(ROOT, 'sample-data', 'ornek-portfoy.xlsx')));
    await go(page, 'ice-aktar');
    await page.click('#import-drop');
    await page.waitForSelector('#sheet-table');
    await page.locator('#autosave-box').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 160));
    await snap(page, '31-import-autosave');
    await page.click('#import-run');
    await page.waitForSelector('#autosave-done');
    await page.waitForFunction(() => window.FileLink.status === 'saved');
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, '32-import-linked');
    await workingDay(page);
    await page.waitForFunction(() => window.FileLink.status === 'saved');

    // Yeni kayıt → Kaydet: the record goes into the Ekim 2026 page of the file
    let w = await page.evaluate(() => FileLink.link.writes);
    await go(page, 'yeni');
    await page.fill('#f-name', 'deniz yıldırım');
    await page.press('#f-name', 'Tab');
    await page.fill('#f-tc', '10000000146');
    await page.fill('#f-phone', '5321234567');
    await page.press('#f-phone', 'Tab');
    await page.fill('#f-profession', 'Mimar');
    await page.fill('#f-policyType', 'Kasko');
    await page.fill('#f-company', 'Allianz Sigorta');
    await page.fill('#f-policyNo', 'AZ-2026-118204');
    await page.fill('#f-startDate', '29.10.2026');
    await page.press('#f-startDate', 'Tab');
    await page.click('#f-newBusiness button:has-text("Yeni iş")');
    await page.fill('#f-plate', '06abc123');
    await page.press('#f-plate', 'Tab');
    await page.fill('#f-premium', '25000');
    await page.press('#f-premium', 'Tab');
    await page.fill('#f-rate', '15');
    await page.press('#f-rate', 'Tab');
    await page.fill('#f-card', '25.000,00');
    await page.press('#f-card', 'Tab');
    await page.click('#save-policy');
    await page.waitForSelector('.toast:has-text("Kaydedildi")');
    await saved(page, w);
    await snap(page, '33-excel-saved');

    // a cancellation from the app goes into the İptal block of its month
    const x = await page.evaluate(() => {
      const q = Store.derived().policies.find(o => o.month === '2026-10' && !Store.isCancelled(o.id) && o.premium > 3000 && o.policyNo !== 'AZ-2026-118204' && o.card > 0);
      return { id: q.id, customerId: q.customerId };
    });
    w = await page.evaluate(() => FileLink.link.writes);
    await go(page, 'musteri-' + x.customerId);
    await page.click('#cancel-' + x.id);
    await page.waitForSelector('dialog[open] #cx-month');
    await page.click('#cx-full');
    await page.fill('#cx-note', 'Araç satıldı');
    await snap(page, '34-cancel-dialog');
    await page.click('#cx-save');
    await page.waitForSelector('.toast:has-text("Poliçe iptal edildi")');
    await saved(page, w);

    // the file itself: the new row under the last one, the İptal row in the block
    const bytes = await getFile(page, FILE);
    const info = await page.evaluate((id) => {
      const s = FileLink.link.sheets['Ekim 2026'];
      const pid = Array.from(Store.policies.values()).find(p => p.policyNo === 'AZ-2026-118204').id;
      const c = Store.cancelOf(id);
      return { row: s.rows[pid][0], xrow: s.cancels[c.id][0], header: s.layout.headerRow + 1, block: s.layout.block.startCol + 1 };
    }, x.id);
    const shotPage = await env.context.newPage();
    await sheetPicture(shotPage, bytes, 'Ekim 2026', {
      file: '35-excel-file-new-row', caption: 'Uretim-2026.xlsx · Ekim 2026 — the new record, written under the last row a moment after Kaydet',
      cols: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 15, 0, info.block, info.block + 1, info.block + 2, info.block + 3, info.block + 4, info.block + 5],
      rows: [1, info.header, info.header + 1, info.header + 2, 0, info.row - 3, info.row - 2, info.row - 1, info.row, info.row + 1], mark: [info.row, info.xrow]
    });
    await shotPage.close();

    // the menu line and the notices
    await page.evaluate(() => localStorage.setItem('sp:test-locked', '1'));
    await page.evaluate(() => {
      const F = window.FileSystemFileHandle.prototype, orig = F.createWritable;
      F.createWritable = function (o) { return localStorage.getItem('sp:test-locked') ? Promise.reject(new DOMException('in use', 'NoModificationAllowedError')) : orig.call(this, o); };
    });
    const p = await page.evaluate(() => Array.from(Store.policies.values()).find(q => q.policyNo === 'AZ-2026-118204').id);
    await go(page, 'duzenle-' + p);
    await page.fill('#f-note', 'Teklif imzalandı');
    await page.click('#save-policy');
    await page.waitForSelector('#excel-notice[data-status="locked"]');
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, '36-excel-notice-open');
    await page.evaluate(() => localStorage.removeItem('sp:test-locked'));
    w = await page.evaluate(() => FileLink.link.writes);
    await page.click('#xl-retry');
    await saved(page, w);

    await go(page, 'ayarlar');
    await page.locator('#settings-excel').scrollIntoViewIfNeeded();
    await snap(page, '37-settings-excel');

    // İptal on the month page and on the customer card
    await go(page, 'ay-2026-09');
    await page.locator('#month-cancels').scrollIntoViewIfNeeded();
    await page.evaluate(() => { const el = document.getElementById('month-cancels'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80); });
    await snap(page, '38-month-cancels');
    const amb = await page.evaluate(() => { const c = Array.from(Store.cancellations.values()).find(q => q.match === 'ambiguous'); return c && c.id; });
    if (amb) {
      await page.click('#cx-pick-' + amb);
      await page.waitForSelector('dialog[open] #cp-list .list-item');
      await snap(page, '39-cancel-picker');
      await page.keyboard.press('Escape');
    }
    await go(page, 'musteri-' + x.customerId);
    await page.click('#pol-' + x.id + ' button[aria-expanded]');
    await snap(page, '40-customer-cancelled');
    if (env.errors.length) throw new Error(env.errors.join('\n'));
  } finally { await env.close(); }
}

const only = process.argv[2];
if (!only || only === 'desktop') await desktop();
if (!only || only === 'dark') await dark();
if (!only || only === 'phone') await phone();
if (!only || only === 'excel') await excel();
console.log('saved in', path.relative(ROOT, DIR));
