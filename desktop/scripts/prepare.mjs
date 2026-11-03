// Puts the app into the program: builds dist/sigorta-portfoy.html (the single-file app) and copies it to app/.
// Usage: node scripts/prepare.mjs   (npm start / npm run dist do this first)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(here, '..');
execFileSync(process.execPath, [path.join(root, 'tools', 'build-single.mjs')], { stdio: 'inherit' });

const from = path.join(root, 'dist', 'sigorta-portfoy.html');
const to = path.join(here, 'app', 'sigorta-portfoy.html');
// the program holds this one page and nothing else: it must not point at any other file
const html = fs.readFileSync(from, 'utf8');
const outside = [...html.matchAll(/<link\b[^>]*\bhref="(?!data:|#)[^"]*"[^>]*>|<script\b[^>]*\bsrc="[^"]*"[^>]*>/gi)].map((m) => m[0]);
if (outside.length) {
  console.error('dist/sigorta-portfoy.html still points at other files, which the program does not have:\n  ' + outside.join('\n  '));
  process.exit(1);
}
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);

// the program's version follows the app's (package.json at the root)
const rootVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const pkgFile = path.join(here, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
if (pkg.version !== rootVersion) {
  pkg.version = rootVersion;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  console.log('desktop/package.json version set to', rootVersion);
}
console.log('copied', path.relative(root, from), '->', path.relative(root, to));
