// Draws the program's icon (the app's shield on petrol green, as in the page's favicon) and writes
// build/icon.ico (every size Windows asks for) and build/icon.png (512 px).
// Usage: node scripts/make-icon.mjs   (needs Playwright's Chromium, as the browser tests do; the results are committed)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(here, 'build');

// small sizes get thicker lines so the shield still reads at 16 px
function svg(size) {
  const sw = size <= 20 ? 2.9 : size <= 32 ? 2.6 : 2.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#11837c"/><stop offset="1" stop-color="#0a5f5a"/></linearGradient></defs>
  <rect x="1" y="1" width="30" height="30" rx="7" fill="url(#g)"/>
  <path d="M16 6.2l7.6 2.9v5.8c0 4.9-3.3 9-7.6 10.8-4.3-1.8-7.6-5.9-7.6-10.8V9.1z" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linejoin="round"/>
  <path d="M12.6 15.9l2.4 2.4 4.4-4.9" fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(size) {
  return page.evaluate(async ([src, s]) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, s, s);
    const rgba = Array.from(ctx.getImageData(0, 0, s, s).data);
    return { rgba, png: c.toDataURL('image/png').split(',')[1] };
  }, [svg(size), size]);
}

// .ico: 32-bit bitmaps for the small sizes (every Windows tool reads them), PNG for 256
const images = [];
for (const s of SIZES) {
  const { rgba, png } = await render(s);
  if (s >= 256) { images.push({ s, data: Buffer.from(png, 'base64') }); continue; }
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(s, 4); header.writeInt32LE(s * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
  const xor = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const from = ((s - 1 - y) * s + x) * 4, to = (y * s + x) * 4; // bottom-up rows, BGRA
      xor[to] = rgba[from + 2]; xor[to + 1] = rgba[from + 1]; xor[to + 2] = rgba[from]; xor[to + 3] = rgba[from + 3];
    }
  }
  const andRow = Math.ceil(s / 32) * 4;
  const and = Buffer.alloc(andRow * s); // all zero: the alpha channel decides
  images.push({ s, data: Buffer.concat([header, xor, and]) });
}
const dir = Buffer.alloc(6 + 16 * images.length);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(images.length, 4);
let offset = dir.length;
images.forEach((im, i) => {
  const e = 6 + i * 16;
  dir.writeUInt8(im.s >= 256 ? 0 : im.s, e); dir.writeUInt8(im.s >= 256 ? 0 : im.s, e + 1);
  dir.writeUInt8(0, e + 2); dir.writeUInt8(0, e + 3);
  dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(im.data.length, e + 8); dir.writeUInt32LE(offset, e + 12);
  offset += im.data.length;
});
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([dir, ...images.map((im) => im.data)]));
fs.writeFileSync(path.join(out, 'icon.png'), Buffer.from((await render(512)).png, 'base64'));
fs.writeFileSync(path.join(out, 'icon.svg'), svg(256) + '\n');
await browser.close();
console.log('wrote build/icon.ico (' + SIZES.join(', ') + ' px), build/icon.png (512 px), build/icon.svg');
