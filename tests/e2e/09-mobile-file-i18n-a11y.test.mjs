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
