import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, waitHash, loadDemo, go, text, expected, store } from './helpers.mjs';

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
    assert.match(await text(page, '#kpi-premium .kpi-value'), /^₺12\.9m$/, 'British compact notation');
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
