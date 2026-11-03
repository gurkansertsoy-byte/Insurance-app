// Tests of the Windows program (Electron). Run: npm test (in desktop/).
// By default the program runs from this folder with the Electron of node_modules; SIGORTA_EXE=<path to
// SigortaPortfoy.exe> tests a built program instead (the Windows build does that with out/win-unpacked).
// Linux without a screen: xvfb-run -a npm test. The test with the real Excel file drives the system's file dialogs
// with xdotool, so it runs where xdotool is (Linux); elsewhere it is skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright-core');
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(HERE, '..');
const XLSX = require(path.join(ROOT, 'vendor', 'xlsx.full.min.js'));
const EXE = process.env.SIGORTA_EXE ? path.resolve(process.env.SIGORTA_EXE) : null;
const ELECTRON = require('electron'); // path of the Electron binary in node_modules
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-program-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launchArgs(dataDir, extra = []) {
  const args = [];
  if (process.platform === 'linux' && process.getuid && process.getuid() === 0) args.push('--no-sandbox'); // Chromium as root
  if (!EXE) args.push(HERE);
  args.push('--data-dir=' + dataDir, ...extra);
  return args;
}

async function launch(dataDir) {
  if (!EXE && !fs.existsSync(path.join(HERE, 'app', 'sigorta-portfoy.html'))) execFileSync(process.execPath, [path.join(HERE, 'scripts', 'prepare.mjs')]);
  const app = await electron.launch({ executablePath: EXE || ELECTRON, args: launchArgs(dataDir), cwd: HERE, timeout: 60000 });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.waitForFunction(() => window.App && window.App.renderedHash != null, null, { timeout: 60000 });
  return { app, page, errors };
}

const win = (app, fn, arg) => app.evaluate(({ BrowserWindow }, [src, a]) => {
  const w = BrowserWindow.getAllWindows()[0];
  return new Function('w', 'a', 'return (' + src + ')(w, a)')(w, a); // eslint-disable-line no-new-func
}, [fn.toString(), arg]);

async function loadSample(page) {
  await page.evaluate(() => { location.hash = ''; });
  await page.click('#try-demo');
  await page.waitForSelector('#sheet-table');
  await page.click('#import-run');
  await page.waitForSelector('#import-done', { timeout: 60000 });
}

test('opens the app in a window of its own', async () => {
  const dir = path.join(TMP, 'open');
  const { app, page, errors } = await launch(dir);
  try {
    assert.match(await page.title(), /Sigorta Portföy/);
    assert.ok(page.url().startsWith('file:') && page.url().includes('sigorta-portfoy.html'), page.url());
    const shown = await (async () => { for (let i = 0; i < 40; i++) { if (await win(app, (w) => w.isVisible())) return true; await sleep(150); } return false; })();
    assert.ok(shown, 'the window is shown');
    assert.equal(await win(app, (w) => w.isMenuBarVisible()), false, 'the menu bar is hidden until Alt');
    const info = await page.evaluate(() => ({
      program: window.SigortaPortfoyProgram && window.SigortaPortfoyProgram.version,
      canWrite: window.FileLink.canWrite(), node: typeof window.require + typeof window.process,
      foot: document.body.textContent.includes('Veriler bu bilgisayarda kayıtlı'), ua: navigator.userAgent
    }));
    assert.match(info.program, /^\d+\.\d+\.\d+/);
    assert.equal(info.canWrite, true, 'saving into the Excel file is available');
    assert.equal(info.node, 'undefinedundefined', 'the page has no Node.js');
    assert.ok(info.foot, 'the menu says the data is on this computer');
    assert.match(info.ua, /^[\x20-\x7e]+$/, 'plain ASCII user agent');
    assert.equal(await app.evaluate(({ app: a }) => a.getPath('userData')), path.resolve(dir));
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});

test('the sample workbook imports, and the data is still there after a restart', async () => {
  const dir = path.join(TMP, 'restart');
  let { app, page, errors } = await launch(dir);
  let counts;
  try {
    await loadSample(page);
    counts = await page.evaluate(() => ({ p: window.Store.policies.size, c: window.Store.customers.size }));
    assert.ok(counts.p > 700 && counts.c > 300, JSON.stringify(counts));
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
  ({ app, page, errors } = await launch(dir));
  try {
    await page.waitForFunction((n) => window.Store.policies.size === n, counts.p);
    assert.equal(await page.evaluate(() => window.Store.customers.size), counts.c);
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});

test('links open in the user\'s browser, the window stays the app, and the page cannot reach the internet', async () => {
  const { app, page } = await launch(path.join(TMP, 'links'));
  try {
    await app.evaluate(({ shell }) => { global.opened = []; shell.openExternal = async (u) => { global.opened.push(u); }; });
    const appUrl = page.url();
    // a WhatsApp link (target=_blank), a plain link to a web page, and a page trying to go elsewhere
    await page.evaluate(() => {
      const a = document.createElement('a'); a.href = 'https://wa.me/905321112233?text=Merhaba'; a.target = '_blank'; a.id = 'wa-test'; a.textContent = 'wa';
      const b = document.createElement('a'); b.href = 'https://example.com/'; b.id = 'web-test'; b.textContent = 'web';
      const c = document.createElement('a'); c.href = 'tel:+905321112233'; c.id = 'tel-test'; c.textContent = 'tel';
      document.body.append(a, b, c);
    });
    // (the clicks are made in the page: Playwright would wait for a navigation that never comes)
    for (const id of ['wa-test', 'web-test', 'tel-test']) {
      await page.evaluate((x) => document.getElementById(x).click(), id);
      await sleep(300);
    }
    await sleep(800);
    await page.evaluate(() => { location.href = 'https://example.org/'; });
    await sleep(800);
    assert.deepEqual((await app.evaluate(() => global.opened)).sort(), ['https://example.com/', 'https://example.org/', 'https://wa.me/905321112233?text=Merhaba', 'tel:+905321112233']);
    assert.equal(page.url(), appUrl);
    assert.equal(app.windows().length, 1, 'no second window');
    const net = await page.evaluate(() => fetch('https://example.com/').then(() => 'reached', (e) => 'blocked: ' + e.message));
    assert.match(net, /^blocked/);
  } finally { await app.close(); }
});

test('an exported Excel file is saved where the user chooses; the folder is remembered', async () => {
  const dir = path.join(TMP, 'export');
  const { app, page, errors } = await launch(dir);
  try {
    await loadSample(page);
    const target = path.join(TMP, 'aktarilan', 'portfoy.xlsx');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // the save dialog's answer: this file
    await app.evaluate(({ session }, t) => {
      session.defaultSession.on('will-download', (e, item) => {
        global.dialogOptions = item.getSaveDialogOptions();
        item.setSavePath(t);
      });
    }, target);
    await page.evaluate(() => { location.hash = 'ayarlar'; });
    await page.waitForSelector('#export-all');
    await page.click('#export-all');
    for (let i = 0; i < 60 && !(fs.existsSync(target) && fs.statSync(target).size > 1000); i++) await sleep(250);
    await sleep(500);
    const wb = XLSX.read(fs.readFileSync(target));
    assert.ok(wb.SheetNames.length >= 13, wb.SheetNames.join(', '));
    const opts = await app.evaluate(() => global.dialogOptions);
    assert.match(opts.defaultPath, /\.xlsx$/);
    assert.ok(opts.filters.some((f) => f.extensions.includes('xlsx')));
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'window-state.json'), 'utf8'));
    assert.equal(state.saveDir, path.dirname(target));
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});

test('menus follow the app\'s language; zoom keys work and are remembered', async () => {
  const dir = path.join(TMP, 'menus');
  let { app, page } = await launch(dir);
  try {
    const top = () => app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => i.label));
    assert.deepEqual(await top(), ['Dosya', 'Düzen', 'Görünüm', 'Yardım']);
    await page.click('#lang-btn');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    await sleep(300);
    assert.deepEqual(await top(), ['File', 'Edit', 'View', 'Help']);
    // the right-click menu of a text field
    await app.evaluate(({ Menu }) => { global.popped = []; Menu.prototype.popup = function () { global.popped.push(this.items.map((i) => i.label)); }; });
    await page.evaluate(() => { location.hash = 'musteriler'; });
    await page.waitForSelector('input[type=search], input[type=text]');
    await page.click('input[type=search], input[type=text]', { button: 'right' });
    await sleep(500);
    const popped = await app.evaluate(() => global.popped);
    assert.ok(popped.length && popped[0].includes('Paste') && popped[0].includes('Copy'), JSON.stringify(popped));
    // zoom: Ctrl + (also Ctrl = and the number pad's +), Ctrl -, Ctrl 0. The keys are sent the way the keyboard
    // sends them (Playwright's own key presses skip the program's key handling)
    const zoom = () => win(app, (w) => w.webContents.getZoomFactor());
    const press = async (keyCode, shift) => {
      await win(app, (w, a) => {
        const modifiers = a.shift ? ['control', 'shift'] : ['control'];
        w.webContents.sendInputEvent({ type: 'keyDown', keyCode: a.keyCode, modifiers });
        w.webContents.sendInputEvent({ type: 'keyUp', keyCode: a.keyCode, modifiers });
      }, { keyCode, shift });
      await sleep(250);
    };
    await press('=');
    assert.equal(await zoom(), 1.1);
    await press('numadd');
    assert.equal(await zoom(), 1.25);
    await press('Plus', true);
    assert.equal(await zoom(), 1.5);
    await press('0');
    assert.equal(await zoom(), 1);
    await press('-');
    assert.equal(await zoom(), 0.9);
  } finally { await app.close(); }
  ({ app, page } = await launch(dir));
  try {
    await sleep(500);
    assert.equal(await win(app, (w) => w.webContents.getZoomFactor()), 0.9, 'the zoom is kept');
  } finally { await app.close(); }
});

test('a second start brings the open window to the front instead of opening another', async () => {
  const dir = path.join(TMP, 'single');
  const { app } = await launch(dir);
  try {
    await app.evaluate(({ app: a }) => { global.seconds = 0; a.on('second-instance', () => { global.seconds++; }); });
    const started = Date.now();
    const code = await new Promise((resolve) => {
      const p = spawn(EXE || ELECTRON, launchArgs(dir), { cwd: HERE, stdio: 'ignore' });
      const t = setTimeout(() => { p.kill(); resolve('still running'); }, 30000);
      p.on('exit', (c) => { clearTimeout(t); resolve(c); });
    });
    assert.equal(code, 0);
    assert.ok(Date.now() - started < 30000);
    await sleep(300);
    assert.equal(await app.evaluate(() => global.seconds), 1);
    assert.equal(app.windows().length, 1);
  } finally { await app.close(); }
});

test('the page is opened again after it goes down', async () => {
  const { app, page } = await launch(path.join(TMP, 'crash'));
  try {
    const loaded = app.evaluate(({ BrowserWindow }) => new Promise((resolve) => BrowserWindow.getAllWindows()[0].webContents.once('did-finish-load', () => resolve(true))));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
    assert.equal(await loaded, true);
    // (Playwright keeps the crashed page as crashed; the program's own view of the page is asked instead)
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      up = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('!!(window.App && window.App.renderedHash != null && document.querySelector("nav.nav"))').catch(() => false));
      if (!up) await sleep(250);
    }
    assert.ok(up, 'the app is back');
  } finally { await app.close(); }
});

// ------------------------------------------------------------------ the real Excel file (system file dialogs)
const hasXdotool = process.platform === 'linux' && (() => { try { execFileSync('xdotool', ['version'], { stdio: 'ignore' }); return !!process.env.DISPLAY; } catch (e) { return false; } })();

const xdo = (...args) => execFileSync('xdotool', args, { encoding: 'utf8' }).trim();
/** Answers the system's file dialog (GTK): types the path, then presses the button at the bottom right (Open / Save). */
async function answerDialog(title, filePath) {
  let id = '';
  for (let i = 0; i < 75 && !id; i++) { try { id = xdo('search', '--onlyvisible', '--name', '^' + title + '$').split('\n')[0]; } catch (e) { await sleep(200); } }
  assert.ok(id, 'the dialog "' + title + '" opened');
  await sleep(600);
  xdo('windowfocus', '--sync', id);
  xdo('key', title === 'Open File' ? 'ctrl+l' : 'ctrl+a');
  await sleep(300);
  xdo('type', '--delay', '15', filePath);
  await sleep(500);
  const g = Object.fromEntries(xdo('getwindowgeometry', '--shell', id).split('\n').map((l) => l.split('=')).map(([k, v]) => [k, Number(v)]));
  xdo('mousemove', String(g.X + g.WIDTH - 45), String(g.Y + g.HEIGHT - 24));
  await sleep(150);
  xdo('click', '1');
  await sleep(400);
}
function rowsWith(file, text) {
  const wb = XLSX.read(fs.readFileSync(file));
  const out = [];
  for (const n of wb.SheetNames) {
    XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null }).forEach((r, i) => { if (r.some((v) => String(v).includes(text))) out.push(n + '!' + (i + 1)); });
  }
  return out;
}
const policy = (name, no) => ({ customer: { name, phone: '5321112233' }, policy: { month: '2026-10', policyType: 'Trafik', company: 'Anadolu Sigorta', policyNo: no, premium: 4321, startDate: '2026-10-20', endDate: '2027-10-20' } });

test('the Excel file: every change is saved into the new copy, also right before closing and after a restart', { skip: !hasXdotool && 'needs xdotool and a screen (Linux)' }, async () => {
  const dir = path.join(TMP, 'excel');
  const files = path.join(os.homedir(), 'sp-program-test-' + process.pid); // a folder the file dialogs may open
  fs.rmSync(files, { recursive: true, force: true });
  fs.mkdirSync(files, { recursive: true });
  const orig = path.join(files, 'portfoy.xlsx'), copy = path.join(files, 'portfoy - guncel.xlsx');
  fs.copyFileSync(path.join(ROOT, 'sample-data', 'ornek-portfoy.xlsx'), orig);
  const origBytes = fs.readFileSync(orig);
  try {
    let { app, page, errors } = await launch(dir);
    try {
      await page.evaluate(() => { location.hash = 'ice-aktar'; });
      await page.click('#import-drop');
      await answerDialog('Open File', orig);
      await page.waitForSelector('#sheet-table', { timeout: 30000 });
      await page.click('#import-run');
      await answerDialog('Save File', copy);
      await page.waitForSelector('#import-done', { timeout: 60000 });
      await page.waitForFunction(() => window.FileLink.status === 'saved' && window.FileLink.link.kind === 'file');
      assert.equal(await page.evaluate(() => window.FileLink.link.name), 'portfoy - guncel.xlsx');
      // a new record goes into the file a moment later
      const n = await page.evaluate(() => window.FileLink.link.writes || 0);
      await page.evaluate((p) => window.Store.savePolicy(p), policy('MASAÜSTÜ DENEME BİR', 'MD-0001'));
      await page.waitForFunction((k) => window.FileLink.status === 'saved' && window.FileLink.link.writes > k, n, { timeout: 30000 });
      assert.equal(rowsWith(copy, 'MASAÜSTÜ DENEME BİR').length, 1);
      // a record saved right before the window is closed reaches the file too
      await page.evaluate((p) => window.Store.savePolicy(p), policy('MASAÜSTÜ DENEME İKİ', 'MD-0002'));
      assert.deepEqual(errors, []);
    } finally { await app.close(); }
    assert.equal(rowsWith(copy, 'MASAÜSTÜ DENEME İKİ').length, 1, 'saved before closing');

    // started again: saving goes on by itself (no "İzin ver" to press)
    ({ app, page, errors } = await launch(dir));
    try {
      await page.waitForFunction(() => window.FileLink.status === 'saved' && window.FileLink.link, null, { timeout: 30000 });
      await sleep(1500);
      assert.equal(await page.evaluate(() => window.FileLink.status), 'saved');
      assert.equal(await page.evaluate(() => !!document.querySelector('#xl-allow')), false, 'no permission notice');
      const n = await page.evaluate(() => window.FileLink.link.writes || 0);
      await page.evaluate((p) => window.Store.savePolicy(p), policy('MASAÜSTÜ DENEME ÜÇ', 'MD-0003'));
      await page.waitForFunction((k) => window.FileLink.status === 'saved' && window.FileLink.link.writes > k, n, { timeout: 30000 });
      assert.equal(rowsWith(copy, 'MASAÜSTÜ DENEME ÜÇ').length, 1);
      assert.deepEqual(errors, []);
    } finally { await app.close(); }
    assert.equal(Buffer.compare(origBytes, fs.readFileSync(orig)), 0, 'the file given to the app is never changed');
  } finally {
    fs.rmSync(files, { recursive: true, force: true });
  }
});

test.after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });
