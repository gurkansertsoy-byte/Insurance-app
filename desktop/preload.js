/* Sigorta Portföy - Windows program. Runs before the app's page:
   - tells the page it is inside the program (window.SigortaPortfoyProgram), so it says "on this computer" instead of
     "in this browser" (js/i18n.js);
   - tells the program which language the app is in (<html lang>), so the menus speak it too. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const arg = (name) => { const a = process.argv.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : ''; };
contextBridge.exposeInMainWorld('SigortaPortfoyProgram', Object.freeze({ version: arg('sp-version'), platform: process.platform }));

window.addEventListener('DOMContentLoaded', () => {
  const html = document.documentElement;
  const send = () => ipcRenderer.send('sp:lang', html.lang || 'tr');
  send();
  new MutationObserver(send).observe(html, { attributes: true, attributeFilter: ['lang'] });
});
