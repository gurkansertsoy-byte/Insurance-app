// Shared helpers for the browser tests (Playwright + node:test).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { start } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
export const XLSX = require('../../vendor/xlsx.full.min.js');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'sample-data', 'expected.json'), 'utf8'));
export const OUT = path.join(ROOT, 'tests', '.output');
fs.mkdirSync(OUT, { recursive: true });

export const TODAY = '2026-10-29T10:00:00+03:00';

/** Starts the static server and a browser page with a fixed clock (29.10.2026). */
export async function setup(opts = {}) {
  const server = opts.fileMode ? null : await start(0);
  const base = opts.fileMode ? 'file://' + path.join(ROOT, 'index.html') : `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1440, height: 900 },
    locale: opts.locale || 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    acceptDownloads: true,
    deviceScaleFactor: opts.deviceScaleFactor || 1,
    colorScheme: opts.colorScheme || 'light',
    isMobile: !!opts.isMobile,
    hasTouch: !!opts.isMobile
  });
  if (!opts.fileMode) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.replace(/\/$/, '') });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(TODAY));
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /missing text/.test(m.text()))) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.dismiss());
  async function close() {
    await browser.close();
    if (server) server.close();
  }
  return { server, browser, context, page, base, errors, close };
}

/** Opens the app and imports the bundled sample workbook through the real import screen. */
export async function loadDemo(page, base) {
  await page.goto(base);
  await page.click('#try-demo');
  await page.waitForSelector('#sheet-table');
  await page.click('#import-run');
  await page.waitForSelector('#import-done');
}

/** Navigates by hash and waits until the view has rendered. */
export async function go(page, hash) {
  await page.evaluate((h) => new Promise((resolve) => {
    if (location.hash === '#' + h) { window.App.render(); resolve(); return; }
    window.addEventListener('hashchange', () => setTimeout(resolve, 0), { once: true });
    location.hash = h;
  }), hash);
}

/** Waits until the view for this hash (string or RegExp) has rendered. */
export async function waitHash(page, want) {
  const isRe = want instanceof RegExp;
  await page.waitForFunction(([s, re]) => {
    const h = window.App && window.App.renderedHash;
    return h != null && (re ? new RegExp(s).test(h) : h === s);
  }, [isRe ? want.source : want, isRe]);
}

export async function text(page, selector) {
  return (await page.textContent(selector)).replace(/\s+/g, ' ').trim();
}

/** Runs an action that downloads a file; returns { name, bytes }. */
export async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
  const p = await dl.path();
  return { name: dl.suggestedFilename(), bytes: fs.readFileSync(p) };
}

export function readBook(bytes) { return XLSX.read(bytes, { type: 'buffer', cellNF: true }); }
export function sheetRows(wb, name) { return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }); }

export function money(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
export function num(n) { return new Intl.NumberFormat('tr-TR').format(n); }

/** Clicks the submit button of the open dialog (confirm / save). */
export async function confirmDialog(page, typed) {
  if (typed != null) await page.fill('dialog[open] #confirm-text', typed);
  await page.click('dialog[open] button[type=submit]');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
}

export async function store(page, fn, arg) { return page.evaluate(fn, arg); }

export async function shot(page, name, opts = {}) {
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!opts.fullPage });
}

/** Writes an .xlsx file for the import tests and returns its path. */
export function writeBook(fileName, sheets) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  const p = path.join(OUT, fileName);
  fs.writeFileSync(p, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return p;
}
