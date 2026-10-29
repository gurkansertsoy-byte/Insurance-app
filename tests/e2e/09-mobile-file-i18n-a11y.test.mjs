import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setup, waitHash, loadDemo, go, text, expected, store, readBook, sheetRows, ROOT } from './helpers.mjs';

const PAGES = ['panel', 'musteriler', 'policeler', 'aylar', 'ay-2026-10', 'yenilemeler', 'tahsilat', 'gorevler', 'raporlar', 'ice-aktar', 'ayarlar', 'yeni'];
const KEY_RE = /\b(app|nav|common|field|id|search|period|days|state|chart|table|dash|opp|customers|customer|policy|form|policies|pay|months|renewals|collections|tasks|reports|report|export|import|dup|activity|settings)\.[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)?\b/;

test('phone screen: no sideways scrolling, menu drawer, tables become cards', async () => {
  const env = await setup({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  try {
    const { page, base } = env;
    await loadDemo(page, base);
    const showId = await store(page, (n) => Array.from(Store.customers.values()).find(c => c.name === n).id, expected.showcase.name);
    for (const p of PAGES.concat(['musteri-' + showId])) {
      await go(page, p);
      const [sw, iw] = await page.evaluate(() => [document.scrollingElement.scrollWidth, window.innerWidth]);
      assert.ok(sw <= iw + 1, `${p}: page is ${sw}px wide on a ${iw}px screen`);
    }
    await go(page, 'musteriler');
    assert.equal(await page.$eval('table.data thead', t => getComputedStyle(t).display), 'none');
    assert.equal(await page.$eval('table.data tbody tr', t => getComputedStyle(t).display), 'grid');
    assert.equal(await page.isVisible('#sidebar .nav'), false);
    await page.click('.menu-btn');
    await page.waitForFunction(() => document.querySelector('.app').classList.contains('nav-open'));
    await page.waitForTimeout(300);
    await page.click('.nav-item[href="#yenilemeler"]');
    await page.waitForFunction(() => window.App.renderedHash === '#yenilemeler' && !document.querySelector('.app').classList.contains('nav-open'));
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

// Runs in the page: lists anything that sticks out of the screen or is cut off inside its box
// (text wider than a tile, a button pushed to a second line), outside the intended scroll areas.
function layoutProblems() {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const inScroller = (el) => { for (let a = el.parentElement; a; a = a.parentElement) if (/(auto|scroll)/.test(getComputedStyle(a).overflowX)) return true; return false; };
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  document.querySelectorAll('.topbar *, .content *').forEach((el) => {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height || el.closest('[hidden], dialog, .chart-tip, .sr-only, .date-native') || inScroller(el)) return;
    const cs = getComputedStyle(el);
    if (b.right > vw + 0.5 || b.left < -0.5) out.push(name(el) + ' sticks out of the screen');
    else if (!(el instanceof SVGElement) && cs.display !== 'inline' && cs.textOverflow !== 'ellipsis' && !/(auto|scroll)/.test(cs.overflowX) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) out.push(`${name(el)} is cut off (${el.clientWidth} < ${el.scrollWidth}px): ${el.textContent.trim().slice(0, 40)}`);
  });
  const bar = document.querySelector('.topbar').getBoundingClientRect().top;
  ['#new-btn', '#lang-btn', '#theme-btn'].forEach((s) => { if (document.querySelector(s).getBoundingClientRect().top > bar + 40) out.push(s + ' wrapped to a second line'); });
  if (document.documentElement.scrollWidth > vw + 1) out.push('page scrolls sideways');
  return out.slice(0, 10);
}

test('phone, tablet and laptop widths: nothing on any page sticks out or gets cut off', async () => {
  const env = await setup({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    const { page, base } = env;
    await loadDemo(page, base);
    const showId = await store(page, (n) => Array.from(Store.customers.values()).find(c => c.name === n).id, expected.showcase.name);
    for (const width of [390, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      for (const p of PAGES.concat(['musteri-' + showId])) {
        await go(page, p);
        assert.deepEqual(await page.evaluate(layoutProblems), [], `${width}px wide, #${p}`);
      }
    }
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('on a busy computer, opening a dialog never pulls the focus away from the field being typed in', async () => {
  const env = await setup();
  try {
    const { page, base } = env;
    // short timers run late, as they do when the computer is busy
    await page.addInitScript(() => { const st = window.setTimeout; window.setTimeout = (fn, ms, ...a) => st(fn, ms > 0 && ms <= 50 ? 400 : ms, ...a); });
    await loadDemo(page, base);
    await go(page, 'gorevler');
    await page.click('button:has-text("Ayrıntılı ekle")');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'task-title', 'the first field is ready for typing');
    await page.fill('dialog[open] #task-customer', 'kemal ay');
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'task-customer');
    assert.equal(await page.isVisible('dialog[open] .suggest button'), true, 'customer suggestions stay open');
    await page.keyboard.press('Escape');
    await go(page, 'yeni');
    await page.fill('#f-name', 'Deniz Yıldırım');
    await page.fill('#f-policyType', 'Kasko');
    await page.click('#save-new');
    await page.waitForSelector('.toast:has-text("Kaydedildi")');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'f-name', '"save and new" is ready for the next customer');
    await page.fill('#f-policyType', 'Trafik');
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'f-policyType');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('inside a preview frame: files go through the viewer\'s save dialog, or the app explains why it cannot save', async () => {
  const env = await setup();
  try {
    const { page } = env;
    // host and app on two origins, both served by the test (Chromium will not let a page frame a local address)
    const base = 'http://app.test/';
    await page.route(base + '**', (r) => {
      const p = decodeURIComponent(new URL(r.request().url()).pathname);
      r.fulfill({ path: path.join(ROOT, p === '/' ? 'index.html' : p) });
    });
    // the claude.ai viewer gives framed pages window.claude.use('downloads') -> save({ filename, data }) behind a confirmation
    await page.addInitScript((origin) => {
      if (location.origin !== origin) return;
      window.__saves = []; window.__answer = 'saved'; window.__noViewer = false;
      const downloads = Object.freeze({ save: (req) => {
        window.__saves.push(req);
        return window.__answer === 'saved' ? Promise.resolve({ status: 'saved' }) : Promise.reject({ code: window.__answer, message: '' });
      } });
      window.claude = { use: (name) => Promise.resolve(name === 'downloads' && !window.__noViewer ? downloads : null) };
    }, new URL(base).origin);
    const host = 'http://host.test/';
    await page.route(host, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups" src="${base}" style="border:0;width:100vw;height:100vh"></iframe></body>` }));
    await page.goto(host);
    const frame = await (await page.waitForSelector('iframe')).contentFrame();
    await frame.waitForSelector('#try-demo');
    await frame.click('#try-demo');
    await frame.waitForSelector('#sheet-table');
    await frame.click('#import-run');
    await frame.waitForSelector('#import-done');
    const showId = await frame.evaluate((n) => Array.from(Store.customers.values()).find(c => c.name === n).id, expected.showcase.name);
    await go(frame, 'musteri-' + showId);
    assert.equal(await frame.$('#cust-print'), null, 'no print button where printing cannot work');
    // Excel export: handed to the viewer, a real workbook
    await go(frame, 'musteriler');
    await frame.click('#customers-export');
    await frame.waitForFunction(() => window.__saves.length === 1);
    const xlsx = await frame.evaluate(() => { const s = window.__saves[0]; const b = new Uint8Array(s.data); let bin = ''; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return { filename: s.filename, b64: btoa(bin) }; });
    assert.match(xlsx.filename, /^musteriler-\d{4}-\d{2}-\d{2}\.xlsx$/);
    assert.equal(sheetRows(readBook(Buffer.from(xlsx.b64, 'base64')), 'Müşteriler').length, expected.totalCustomers + 1);
    await frame.waitForSelector('.toast:has-text("Dosya hazırlandı")');
    // backup: declined leaves "last backup" alone; accepted records it
    await go(frame, 'ayarlar');
    await frame.evaluate(() => { window.__answer = 'declined'; });
    await frame.click('#backup-btn');
    await frame.waitForFunction(() => window.__saves.length === 2);
    await frame.waitForTimeout(200);
    assert.equal(await frame.evaluate(() => Store.settings.lastBackupAt || null), null);
    await frame.evaluate(() => { window.__answer = 'saved'; });
    await frame.click('#backup-btn');
    await frame.waitForFunction(() => window.__saves.length === 3 && Store.settings.lastBackupAt);
    const backup = JSON.parse(await frame.evaluate(() => window.__saves[2].data));
    assert.equal(backup.policies.length, expected.totalPolicies);
    assert.match(backup.app, /sigorta-portfoy/);
    // a frame with no save dialog: the app says so instead of failing silently
    await frame.evaluate(() => { window.__noViewer = true; });
    await frame.click('#export-all');
    await frame.waitForSelector('.toast:has-text("dosya indirme kapalı")');
    assert.equal(await frame.evaluate(() => window.__saves.length), 3);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('works when index.html is opened straight from disk (file://)', async () => {
  const env = await setup({ fileMode: true });
  try {
    const { page, base } = env;
    assert.match(base, /^file:\/\//);
    await loadDemo(page, base);
    assert.equal(await store(page, () => Store.policies.size), expected.totalPolicies);
    await page.reload();
    await page.waitForFunction(() => window.Store && Store.loaded);
    assert.deepEqual(await store(page, () => [Store.policies.size, DB.kind]), [expected.totalPolicies, 'indexeddb']);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('the single-file build (dist/sigorta-portfoy.html) works on its own from disk', async () => {
  const env = await setup({ fileMode: true, file: 'dist/sigorta-portfoy.html' });
  try {
    const { page, base } = env;
    const requests = [];
    page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
    await loadDemo(page, base);
    assert.equal(await store(page, () => Store.policies.size), expected.totalPolicies);
    assert.equal(await page.evaluate(() => document.fonts.check('600 14px "IBM Plex Sans"')), true, 'embedded font');
    assert.deepEqual(requests, [], 'nothing loaded from the network');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('English: every page is translated, no text keys leak into the screen', async () => {
  const env = await setup({ locale: 'en-GB' });
  try {
    const { page, base } = env;
    await loadDemo(page, base);
    await page.click('#lang-btn');
    const showId = await store(page, (n) => Array.from(Store.customers.values()).find(c => c.name === n).id, expected.showcase.name);
    for (const p of PAGES.concat(['musteri-' + showId])) {
      await go(page, p);
      const body = await page.evaluate(() => document.body.innerText);
      const m = body.match(KEY_RE);
      assert.equal(m && m[0], null, 'raw key on ' + p);
    }
    await go(page, 'panel');
    assert.equal(await text(page, '#page-title'), 'Dashboard');
    assert.match(await text(page, '#kpi-premium .kpi-value'), /^₺\d+(\.\d)?m$/, 'British compact notation');
    await go(page, 'musteri-' + showId);
    for (const tab of ['vehicles', 'opps', 'notes', 'payments']) {
      await page.click('#tab-' + tab);
      assert.equal((await page.evaluate(() => document.body.innerText)).match(KEY_RE), null, 'tab ' + tab);
    }
    assert.equal(await page.evaluate(() => window.I18N.missing.size), 0);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('Turkish pages show no raw text keys either; buttons and fields have names', async () => {
  const env = await setup();
  try {
    const { page, base } = env;
    await loadDemo(page, base);
    const showId = await store(page, (n) => Array.from(Store.customers.values()).find(c => c.name === n).id, expected.showcase.name);
    const problems = [];
    for (const p of PAGES.concat(['musteri-' + showId])) {
      await go(page, p);
      const body = await page.evaluate(() => document.body.innerText);
      const m = body.match(KEY_RE);
      if (m) problems.push(p + ': ' + m[0]);
      const unnamed = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('button, a.btn, a.icon-btn').forEach(b => {
          const name = (b.textContent || '').trim() || b.getAttribute('aria-label') || b.getAttribute('title');
          if (!name && b.offsetParent) out.push(b.outerHTML.slice(0, 80));
        });
        document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(i => {
          if (!i.offsetParent || i.getAttribute('aria-hidden') === 'true') return;
          const labelled = (i.id && document.querySelector('label[for="' + i.id + '"]')) || i.closest('label') || i.getAttribute('aria-label') || i.getAttribute('title');
          if (!labelled) out.push(i.outerHTML.slice(0, 80));
        });
        return out;
      });
      unnamed.forEach(u => problems.push(p + ': ' + u));
    }
    assert.deepEqual(problems, []);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});
