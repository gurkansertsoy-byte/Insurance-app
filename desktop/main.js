/* Sigorta Portföy - the Windows program (Electron).
   The window shows the same single-file app as dist/sigorta-portfoy.html (copied to app/ by scripts/prepare.mjs).
   The program adds only what a browser tab would otherwise give: links open in the user's browser, a right-click
   menu, a save dialog for exported files, zoom, the window's size and place, and one window at a time. The data stays
   on this computer, in the program's own storage (%APPDATA%\SigortaPortfoy) and in the user's Excel file. */
'use strict';

const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeTheme, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const APP_ID = 'com.sigortaportfoy.app';
const PAGE = path.join(__dirname, 'app', 'sigorta-portfoy.html');
const IS_WIN = process.platform === 'win32';

// Where the data lives: %APPDATA%\SigortaPortfoy (an ASCII name, whatever the language of Windows).
// --data-dir=<folder> keeps it somewhere else: a second portfolio, or the tests.
const dataArg = process.argv.find((a) => a.startsWith('--data-dir='));
app.setPath('userData', dataArg ? path.resolve(dataArg.slice('--data-dir='.length)) : path.join(app.getPath('appData'), 'SigortaPortfoy'));
if (IS_WIN) app.setAppUserModelId(APP_ID);
// Electron puts the product name into the user agent; keep it plain ASCII
app.userAgentFallback = app.userAgentFallback.replace(/ SigortaPortf\S*\/\S+/, ' SigortaPortfoy/' + app.getVersion());

// ------------------------------------------------------------------ words (the app's own language: TR or EN)
const WORDS = {
  tr: {
    file: 'Dosya', print: 'Yazdır…', quit: 'Çıkış',
    edit: 'Düzen', undo: 'Geri al', redo: 'Yinele', cut: 'Kes', copy: 'Kopyala', paste: 'Yapıştır', selectAll: 'Tümünü seç',
    copyLink: 'Bağlantıyı kopyala',
    view: 'Görünüm', reload: 'Yeniden yükle', zoomIn: 'Yakınlaştır', zoomOut: 'Uzaklaştır', zoomReset: 'Gerçek boyut',
    fullScreen: 'Tam ekran', devTools: 'Geliştirici araçları',
    help: 'Yardım', dataFolder: 'Veri klasörünü aç', about: 'Sigorta Portföy hakkında',
    aboutDetail: (v) => `Sürüm ${v.app} · Electron ${v.electron} · Chromium ${v.chrome}\n\nVeriler bu bilgisayarda kalır, hiçbir sunucuya gönderilmez:\n${v.data}\nve sizin Excel dosyanızda.\n\nYedek almak için: Ayarlar → Yedek al.`,
    ok: 'Tamam', save: 'Dosyayı kaydet', excel: 'Excel dosyası', json: 'Yedek dosyası', all: 'Tüm dosyalar',
    leaveTitle: 'Kapatılsın mı?', leaveMsg: 'Kaydedilmemiş değişiklikler olabilir. Yine de kapatılsın mı?', leaveGo: 'Kapat', stay: 'Vazgeç',
    crashTitle: 'Sayfa yeniden açılamadı', crashMsg: 'Uygulama sayfası beklenmedik şekilde kapandı. Verileriniz bu bilgisayarda duruyor. Programı kapatıp yeniden açın.'
  },
  en: {
    file: 'File', print: 'Print…', quit: 'Exit',
    edit: 'Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select all',
    copyLink: 'Copy link',
    view: 'View', reload: 'Reload', zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Actual size',
    fullScreen: 'Full screen', devTools: 'Developer tools',
    help: 'Help', dataFolder: 'Open the data folder', about: 'About Sigorta Portföy',
    aboutDetail: (v) => `Version ${v.app} · Electron ${v.electron} · Chromium ${v.chrome}\n\nThe data stays on this computer and is never sent anywhere:\n${v.data}\nand in your own Excel file.\n\nTo take a backup: Settings → Back up.`,
    ok: 'OK', save: 'Save file', excel: 'Excel file', json: 'Backup file', all: 'All files',
    leaveTitle: 'Close?', leaveMsg: 'There may be changes that are not saved yet. Close anyway?', leaveGo: 'Close', stay: 'Cancel',
    crashTitle: 'The page could not be opened again', crashMsg: 'The app page closed unexpectedly. Your data is still on this computer. Close the program and open it again.'
  }
};
let lang = 'tr';
const w = () => WORDS[lang] || WORDS.tr;

// ------------------------------------------------------------------ window size and place, zoom, last folder
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) || {}; } catch (e) { return {}; }
}
let state = {};
function writeState() {
  try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch (e) { /* not important enough to stop for */ }
}
/** The saved place, if most of it is still on a screen (a second monitor may have gone). */
function placeOf(b) {
  if (!b || !(b.width > 200) || !(b.height > 200) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return null;
  const area = screen.getDisplayMatching(b).workArea;
  const ix = Math.max(0, Math.min(b.x + b.width, area.x + area.width) - Math.max(b.x, area.x));
  const iy = Math.max(0, Math.min(b.y + b.height, area.y + area.height) - Math.max(b.y, area.y));
  return ix >= Math.min(b.width, 300) && iy >= Math.min(b.height, 200) ? b : null;
}

const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
function zoom(win, dir) {
  const wc = win.webContents;
  const now = wc.getZoomFactor();
  let next = 1;
  if (dir > 0) next = ZOOMS.find((z) => z > now + 0.001) || ZOOMS[ZOOMS.length - 1];
  else if (dir < 0) next = [...ZOOMS].reverse().find((z) => z < now - 0.001) || ZOOMS[0];
  wc.setZoomFactor(next);
  state.zoom = next;
  writeState();
}

// ------------------------------------------------------------------ helpers
function samePage(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'file:') return false;
    u.hash = '';
    u.search = '';
    const a = path.normalize(fileURLToPath(u)), b = path.normalize(PAGE);
    return IS_WIN ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch (e) { return false; }
}
/** Web, e-mail and phone links go to the user's own programs (browser, WhatsApp, mail); nothing else leaves. */
function openOutside(url) {
  if (/^(https?:|mailto:|tel:)/i.test(String(url || ''))) shell.openExternal(url).catch(() => { /* no program for it */ });
}

function saveFilters(name) {
  const ext = path.extname(name || '').slice(1).toLowerCase();
  const f = [];
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') f.push({ name: w().excel, extensions: [ext] });
  else if (ext === 'json') f.push({ name: w().json, extensions: ['json'] });
  else if (ext) f.push({ name: ext.toUpperCase(), extensions: [ext] });
  f.push({ name: w().all, extensions: ['*'] });
  return f;
}

// ------------------------------------------------------------------ menus
let win = null;

function about() {
  const v = { app: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, data: app.getPath('userData') };
  dialog.showMessageBox(win, { type: 'info', title: 'Sigorta Portföy', message: 'Sigorta Portföy', detail: w().aboutDetail(v), buttons: [w().ok], noLink: true });
}

function buildMenu() {
  const t = w();
  return Menu.buildFromTemplate([
    { label: t.file, submenu: [
      { label: t.print, accelerator: 'CommandOrControl+P', click: () => win && win.webContents.print({}, () => {}) },
      { type: 'separator' },
      { role: 'quit', label: t.quit }
    ] },
    { label: t.edit, submenu: [
      { role: 'undo', label: t.undo }, { role: 'redo', label: t.redo }, { type: 'separator' },
      { role: 'cut', label: t.cut }, { role: 'copy', label: t.copy }, { role: 'paste', label: t.paste },
      { type: 'separator' }, { role: 'selectAll', label: t.selectAll }
    ] },
    { label: t.view, submenu: [
      // the keys themselves are handled in before-input-event (Ctrl + - 0, also on the number pad)
      { label: t.zoomIn, accelerator: 'CommandOrControl+=', registerAccelerator: false, click: () => win && zoom(win, 1) },
      { label: t.zoomOut, accelerator: 'CommandOrControl+-', registerAccelerator: false, click: () => win && zoom(win, -1) },
      { label: t.zoomReset, accelerator: 'CommandOrControl+0', registerAccelerator: false, click: () => win && zoom(win, 0) },
      { type: 'separator' },
      { role: 'togglefullscreen', label: t.fullScreen },
      { type: 'separator' },
      { label: t.reload, accelerator: 'F5', registerAccelerator: false, click: () => win && win.webContents.reload() },
      { role: 'toggleDevTools', label: t.devTools }
    ] },
    { label: t.help, submenu: [
      { label: t.dataFolder, click: () => shell.openPath(app.getPath('userData')) },
      { type: 'separator' },
      { label: t.about, click: about }
    ] }
  ]);
}

function contextMenu(wc, p) {
  const t = w(), e = p.editFlags || {};
  const items = [];
  if (p.isEditable) {
    items.push(
      { role: 'undo', label: t.undo, enabled: !!e.canUndo }, { role: 'redo', label: t.redo, enabled: !!e.canRedo }, { type: 'separator' },
      { role: 'cut', label: t.cut, enabled: !!e.canCut }, { role: 'copy', label: t.copy, enabled: !!e.canCopy },
      { role: 'paste', label: t.paste, enabled: !!e.canPaste }, { type: 'separator' },
      { role: 'selectAll', label: t.selectAll, enabled: e.canSelectAll !== false });
  } else if (p.selectionText && p.selectionText.trim()) {
    items.push({ role: 'copy', label: t.copy });
  }
  if (p.linkURL && /^(https?:|mailto:|tel:)/i.test(p.linkURL)) {
    if (items.length) items.push({ type: 'separator' });
    // e-mail and phone links: the address or the number itself
    let text = p.linkURL;
    if (!/^https?:/i.test(text)) { text = text.replace(/^(mailto|tel):/i, ''); try { text = decodeURIComponent(text); } catch (x) { /* as it is */ } }
    items.push({ label: t.copyLink, click: () => clipboard.writeText(text) });
  }
  if (items.length) Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(wc) || undefined });
}

// ------------------------------------------------------------------ before the window closes
// Records are written to the program's storage at once, and the linked Excel file a moment later. Closing the window
// waits (at most 8 seconds) until both are done, so the Excel file has the last change when it is opened next.
const FLUSH = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = Date.now() + 8000;
  const S = window.Store, F = window.FileLink;
  while (S && S.saving > 0 && Date.now() < until) await wait(50);
  if (F && F.link && F.link.kind === 'file' && F.dirty && (F.status === 'pending' || F.status === 'saving')) {
    await Promise.race([Promise.resolve(F.sync()).catch(() => null), wait(Math.max(0, until - Date.now()))]);
  }
  return true;
})()`;

// ------------------------------------------------------------------ the linked Excel file after a start
// A browser asks once per visit before the app may write to the user's Excel file again (the notice "İzin ver");
// this program is the user's own, so it gives that yes itself whenever the app waits for it. The app's FileLink
// (js/core/filelink.js) asks with status 'permission'; saveNow() asks for the permission from a click, which
// executeJavaScript(…, true) stands in for.
const WAIT_PERMISSION = `new Promise((resolve) => {
  const F = window.FileLink;
  if (!F) { resolve('none'); return; }
  if (F.status === 'permission') { resolve('permission'); return; }
  const off = F.on(() => { if (F.status === 'permission') { off(); clearTimeout(t); resolve('permission'); } });
  const t = setTimeout(() => { off(); resolve('waiting'); }, 60000);
})`;
async function keepExcelAllowed(wc, isCurrent) {
  let asked = 0;
  while (isCurrent() && !wc.isDestroyed() && asked < 5) {
    const st = await wc.executeJavaScript(WAIT_PERMISSION).catch(() => 'gone');
    if (!isCurrent() || st === 'gone' || st === 'none') return;
    if (st !== 'permission') continue;
    asked++;
    await wc.executeJavaScript('window.FileLink.saveNow()', true).catch(() => null);
  }
}

// ------------------------------------------------------------------ the window
function createWindow() {
  const work = screen.getPrimaryDisplay().workAreaSize;
  const place = placeOf(state.bounds);
  const width = place ? place.width : Math.min(1440, Math.round(work.width * 0.9));
  const height = place ? place.height : Math.min(920, Math.round(work.height * 0.92));
  win = new BrowserWindow({
    width, height,
    x: place ? place.x : undefined, y: place ? place.y : undefined,
    minWidth: 380, minHeight: 480,
    show: false,
    title: 'Sigorta Portföy',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b1312' : '#edf1f0',
    autoHideMenuBar: true,
    icon: IS_WIN ? undefined : path.join(__dirname, 'build', 'icon.png'), // Windows: the icon of the .exe
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: ['--sp-version=' + app.getVersion()],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false
    }
  });
  const wc = win.webContents;
  // a small screen: start maximized the first time
  if (state.maximized || (!place && work.width <= 1440)) win.maximize();

  let shown = false;
  const show = () => { if (!shown && win && !win.isDestroyed()) { shown = true; win.show(); } };
  win.once('ready-to-show', show);
  setTimeout(show, 4000);

  // ---- the page stays the app; links open outside
  wc.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => {
    const to = (e && e.url) || url;
    if (samePage(to)) return;
    e.preventDefault();
    openOutside(to);
  });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.on('context-menu', (e, p) => contextMenu(wc, p));

  // ---- keys: zoom with Ctrl + - 0 (also on the number pad), reload with F5
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (ctrl && !input.alt) {
      if (input.key === '+' || input.key === '=' || input.code === 'NumpadAdd') { e.preventDefault(); zoom(win, 1); return; }
      if (input.key === '-' || input.code === 'NumpadSubtract') { e.preventDefault(); zoom(win, -1); return; }
      if ((input.key === '0' && !input.shift) || input.code === 'Numpad0') { e.preventDefault(); zoom(win, 0); return; }
    }
    if (input.key === 'F5' && !input.alt) { e.preventDefault(); if (ctrl) wc.reloadIgnoringCache(); else wc.reload(); }
  });
  wc.on('zoom-changed', (e, dir) => zoom(win, dir === 'in' ? 1 : -1)); // Ctrl + mouse wheel
  let loads = 0;
  wc.on('did-finish-load', () => {
    if (state.zoom && state.zoom !== 1) wc.setZoomFactor(state.zoom);
    const load = ++loads;
    keepExcelAllowed(wc, () => load === loads);
  });

  // ---- a page that asks before it is left (beforeunload): ask with a real dialog instead of staying silently open
  wc.on('will-prevent-unload', (e) => {
    const t = w();
    const r = dialog.showMessageBoxSync(win, { type: 'question', title: t.leaveTitle, message: t.leaveMsg, buttons: [t.leaveGo, t.stay], defaultId: 1, cancelId: 1, noLink: true });
    if (r === 0) e.preventDefault();
  });

  // ---- the page went down (a crash, too little memory): open it again, twice at most within a minute
  const crashes = [];
  wc.on('render-process-gone', (e, d) => {
    if (d.reason === 'clean-exit' || win.isDestroyed()) return;
    const now = Date.now();
    while (crashes.length && now - crashes[0] > 60000) crashes.shift();
    crashes.push(now);
    if (crashes.length <= 2) { win.loadFile(PAGE); return; }
    dialog.showMessageBox(win, { type: 'error', title: w().crashTitle, message: w().crashTitle, detail: w().crashMsg, buttons: [w().ok], noLink: true });
  });

  // ---- size and place
  const remember = () => {
    if (win.isDestroyed()) return;
    state.maximized = win.isMaximized();
    if (!state.maximized && !win.isMinimized() && !win.isFullScreen()) state.bounds = win.getBounds();
  };
  win.on('resize', remember);
  win.on('move', remember);

  // ---- closing: let the last change reach the storage and the Excel file first
  let closing = false;
  win.on('close', (e) => {
    remember();
    writeState();
    if (closing || wc.isCrashed() || wc.isLoading()) return;
    e.preventDefault();
    closing = true;
    const done = () => { if (!win.isDestroyed()) win.close(); };
    const guard = setTimeout(done, 9000);
    wc.executeJavaScript(FLUSH).catch(() => null).then(() => { clearTimeout(guard); done(); });
  });
  win.on('closed', () => { win = null; });

  win.loadFile(PAGE);
  return win;
}

// ------------------------------------------------------------------ start
if (!app.requestSingleInstanceLock()) {
  // the program is already open: the other copy comes to the front (second-instance below)
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(() => {
    state = readState();
    const ses = session.defaultSession;

    // The app never needs the internet (fonts, libraries and sample data are inside the page), so the page may not
    // reach it at all: nothing in it can send data anywhere. Links open in the user's browser (openOutside).
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => callback({ cancel: true }));
    ses.setSpellCheckerEnabled(false); // no spelling dictionaries to download either

    // Permissions the app uses: the Excel file (File System Access), the clipboard, keeping its data for good,
    // full screen; e-mail and phone links. Everything else (camera, microphone, location, …) is refused.
    const ALLOWED = new Set(['fileSystem', 'clipboard-read', 'clipboard-sanitized-write', 'persistent-storage', 'fullscreen']);
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (permission === 'openExternal') { callback(/^(mailto:|tel:)/i.test((details && details.externalURL) || '')); return; }
      callback(ALLOWED.has(permission));
    });

    // Exported files (Excel, backup): a save dialog that starts in the last folder used
    ses.on('will-download', (e, item) => {
      const name = item.getFilename();
      const dir = state.saveDir && fs.existsSync(state.saveDir) ? state.saveDir : app.getPath('downloads');
      item.setSaveDialogOptions({ title: w().save, defaultPath: path.join(dir, name), filters: saveFilters(name) });
      item.once('done', (ev, st) => {
        const p = item.getSavePath();
        if (st === 'completed' && p) { state.saveDir = path.dirname(p); writeState(); }
      });
    });

    ipcMain.on('sp:lang', (e, l) => {
      const next = l === 'en' ? 'en' : 'tr';
      if (next === lang) return;
      lang = next;
      Menu.setApplicationMenu(buildMenu());
    });

    Menu.setApplicationMenu(buildMenu());
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
