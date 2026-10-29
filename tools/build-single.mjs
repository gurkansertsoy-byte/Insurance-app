// Builds dist/sigorta-portfoy.html: the whole app (styles, fonts, scripts, sample data) in one file
// that opens with a double click and works offline. Usage: node tools/build-single.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

// stylesheet with the fonts embedded as data URIs
let css = read('css/app.css').replace(/url\(\.\.\/assets\/fonts\/([^)]+)\)/g, (m, file) => {
  const data = fs.readFileSync(path.join(root, 'assets', 'fonts', file)).toString('base64');
  return `url(data:font/woff2;base64,${data})`;
});
html = html.replace('<link rel="stylesheet" href="css/app.css">', () => `<style>\n${css}\n</style>`);

// inline every script; the sample workbook goes in too so the demo works without a server
const scripts = [];
html = html.replace(/<script src="([^"]+)"><\/script>\n?/g, (m, src) => { scripts.push(src); return ''; });
scripts.splice(scripts.indexOf('js/app.js'), 0, 'js/sample-data.js');
// U+FFFD (SheetJS code-page tables) is written as the escape \ufffd: same string, and no editor or checker mistakes it for a broken character
const safe = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/\uFFFD/g, '\\ufffd');
const bundle = scripts.map((src) => `<script>/* ${src} */\n${safe(read(src))}\n</script>`).join('\n');
html = html.replace('</body>', () => bundle + '\n</body>');
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<!-- Sigorta Portföy - single-file build. Source: index.html, css/, js/ (see README). -->');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'sigorta-portfoy.html');
fs.writeFileSync(out, html);
console.log('wrote', path.relative(root, out), (fs.statSync(out).size / 1048576).toFixed(2), 'MB,', scripts.length, 'scripts inlined');
