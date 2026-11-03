// The picture editor (drag, mouse wheel, two fingers, slider), the themes and the background behind the pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setup, waitHash, loadDemo, go, store, ROOT } from './helpers.mjs';

let env;
test.before(async () => { env = await setup(); await loadDemo(env.page, env.base); });
test.after(async () => { await env.close(); });

const LOGO = path.join(ROOT, 'tests', 'e2e', 'fixtures', 'ajans-logo.svg');
const crop = (page) => page.evaluate(() => {
  // the editor's state shows in the zoom slider; the position is read back from the saved crop
  return Number(document.getElementById('logo-zoom').value);
});
const cssVar = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test('the picture opens large to be arranged: mouse wheel, drag, two fingers, slider; Tamam keeps it, Vazgeç does not', async () => {
  const { page } = env;
  await go(page, 'panel');
  await waitHash(page, '#panel');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#brand-logo')]);
  await chooser.setFiles(LOGO);
  await page.waitForSelector('dialog[open] #logo-canvas');
  const box = await page.locator('#logo-canvas').boundingBox();
  assert.ok(box.width >= 300, 'shown large: ' + box.width);
  const z0 = await crop(page);
  // the mouse wheel zooms in
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForFunction((z) => Number(document.getElementById('logo-zoom').value) > z, z0);
  const z1 = await crop(page);
  // two fingers coming together zoom out, moving apart zoom in
  const pinch = (from, to) => page.evaluate(([a, b]) => {
    const c = document.getElementById('logo-canvas'), r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (type, id, x) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: cy, pointerType: 'touch', isPrimary: id === 21, bubbles: true, cancelable: true }));
    ev('pointerdown', 21, cx - a); ev('pointerdown', 22, cx + a);
    for (let i = 1; i <= 4; i++) { const d = a + (b - a) * i / 4; ev('pointermove', 21, cx - d); ev('pointermove', 22, cx + d); }
    ev('pointerup', 21, cx - b); ev('pointerup', 22, cx + b);
  }, [from, to]);
  await pinch(120, 60);
  const z2 = await crop(page);
  assert.ok(z2 < z1, `pinch in: ${z1} -> ${z2}`);
  await pinch(50, 110);
  const z3 = await crop(page);
  assert.ok(z3 > z2, `spread: ${z2} -> ${z3}`);
  // the slider and the buttons
  await page.click('#logo-fit');
  const fit = await crop(page);
  await page.click('#logo-zoom-in');
  assert.ok(await crop(page) > fit);
  await page.click('#logo-fill');
  // a mouse drag moves the picture
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  // Vazgeç keeps nothing
  await page.click('dialog[open] .modal-foot button:has-text("Vazgeç")');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  assert.equal(await store(page, () => Store.settings.logo || ''), '');
  // again, and Tamam: the arranged square and the way it was arranged are kept
  const [c2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#brand-logo')]);
  await c2.setFiles(LOGO);
  await page.waitForSelector('dialog[open] #logo-canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.click('#logo-bg-none');
  await page.click('#logo-save');
  await page.waitForSelector('#brand-logo img');
  const saved = await store(page, () => ({ crop: Store.settings.logoCrop, src: (Store.settings.logoSource || '').slice(0, 11) }));
  assert.ok(saved.crop.x > 0.05, 'moved to the right: ' + saved.crop.x);
  assert.equal(saved.crop.bg, 'none');
  assert.equal(saved.src, 'data:image/');
  assert.equal(await page.$eval('#brand-logo', el => el.classList.contains('clear')), true, 'theme colour behind it');
  // a click on the corner opens the editor again where it was left
  await page.click('#brand-logo');
  await page.waitForSelector('dialog[open] #logo-canvas');
  assert.equal(await page.getAttribute('#logo-bg-none', 'aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  assert.deepEqual(env.errors, []);
});

test('13 themes: colours and shapes change, the menu stays where it is; light and dark both work', async () => {
  const { page } = env;
  await go(page, 'ayarlar');
  await waitHash(page, '#ayarlar');
  const tiles = await page.$$eval('#settings-themes .skin-tile', ts => ts.map(t => t.dataset.skin));
  assert.equal(tiles.length, 13);
  assert.equal(await page.getAttribute('#skin-deniz', 'aria-pressed'), 'true');
  const navBox = async () => page.locator('nav.nav a[href="#policeler"]').boundingBox();
  const before = await navBox();
  const seen = new Set();
  for (const k of tiles) {
    await page.click('#skin-' + k);
    await page.waitForFunction((s) => document.documentElement.getAttribute('data-skin') === s, k);
    seen.add(await cssVar(page, '--accent') + '|' + await cssVar(page, '--nav-bg'));
    const b = await navBox();
    assert.ok(Math.abs(b.y - before.y) < 2 && Math.abs(b.x - before.x) < 2, k + ': the menu item stays in place');
  }
  assert.equal(seen.size, 13, 'every theme has its own colours');
  // shapes: pill buttons, square corners
  await page.click('#skin-gunbatimi');
  assert.equal(await cssVar(page, '--r-btn'), '999px');
  await page.click('#skin-grafit');
  assert.equal(await cssVar(page, '--r-btn'), '3px');
  // the theme stays after a reload, and has a dark set of its own
  await page.reload();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-skin') === 'grafit');
  await go(page, 'ayarlar');
  const lightBg = await cssVar(page, '--bg');
  await page.click('#theme-dark');
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
  const darkBg = await cssVar(page, '--bg');
  assert.notEqual(lightBg, darkBg);
  assert.equal(darkBg, '#0e1012');
  await page.click('#theme-system');
  await page.click('#skin-deniz');
  assert.deepEqual(env.errors, []);
});

test('background: a suggested one in the theme colours, my own picture, fading, none', async () => {
  const { page } = env;
  await go(page, 'ayarlar');
  await waitHash(page, '#ayarlar');
  const suggestions = await page.$$eval('#settings-themes .bg-tile', ts => ts.map(t => t.id));
  assert.ok(suggestions.length >= 13, 'none, 12 suggestions, my own picture');
  await page.click('#bg-waves');
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-bg'));
  const bg = await page.$eval('#app-bg .app-bg-img', el => el.style.background);
  assert.match(bg, /svg/);
  await go(page, 'panel');
  assert.ok(await page.isVisible('#app-bg'));
  // my own picture: shrunk, faded behind the text
  await go(page, 'ayarlar');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bg-image')]);
  await chooser.setFiles(LOGO);
  await page.waitForFunction(() => Store.settings.bgKind === 'image');
  assert.match(await store(page, () => Store.settings.bgImage.slice(0, 15)), /^data:image\/jpeg/);
  assert.equal(await page.$eval('#app-bg .app-bg-dim', el => el.style.opacity), '0.45');
  await page.fill('#bg-dim', '70');
  await page.dispatchEvent('#bg-dim', 'change');
  await page.waitForFunction(() => Store.settings.bgDim === 0.7);
  // none
  await page.click('#bg-none');
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-bg'));
  assert.equal(await page.isVisible('#app-bg'), false);
  assert.deepEqual(env.errors, []);
});
