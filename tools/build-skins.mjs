// Writes css/skins.css: the themes ("skins") of the app. Each has a light and a dark set of colours (the Açık /
// Koyu / Cihaz choice stays separate) and its own shapes. Places of things never change between themes.
// Usage: node tools/build-skins.mjs   (also checks text contrast and stops on a failure)
import fs from 'node:fs';

const K = { bg: 'bg', s: 'surface', s2: 'surface-2', s3: 'surface-3', b: 'border', bs: 'border-strong', a: 'accent', ah: 'accent-hover', ai: 'accent-ink',
  as: 'accent-soft', oa: 'on-accent', f: 'focus', nb: 'nav-bg', nt: 'nav-text', nm: 'nav-muted', nh: 'nav-hover', na: 'nav-active', nat: 'nav-active-text',
  nbd: 'nav-border', ns: 'nav-strong', nas: 'nav-active-shadow', t: 'text', t2: 'text-2', t3: 'text-3', sh1: 'shadow-1', brand: 'brand-grad' };
const SHAPE = { card: 'radius', btn: 'r-btn', btnSm: 'r-btn-sm', input: 'r-input', nav: 'r-nav', chip: 'r-chip', cardBw: 'card-bw', inputBw: 'input-bw', navW: 'nav-w', head: 'font-head', radiusSm: 'radius-sm' };

const SKINS = {
  deniz: { shape: {}, brand: 'linear-gradient(145deg, #1d8a82, #0b5753)',
    light: { bg: '#edf1f0', s: '#ffffff', s2: '#f5f8f7', s3: '#e8eeec', b: '#d9e1df', bs: '#bfcac7', a: '#0b6e69', ah: '#085955', ai: '#0a5f5a', as: '#dbeeeb', oa: '#ffffff', f: '#1b8a83',
      nb: '#0e2624', nt: '#c8dbd7', nm: '#86a29d', nh: '#163532', na: '#1f4743', nat: '#ffffff', nbd: '#1b3532' },
    dark: { bg: '#0b1312', s: '#121c1b', s2: '#172321', s3: '#1e2c2a', b: '#253533', bs: '#354946', a: '#38ada3', ah: '#4cc0b6', ai: '#5cc6bc', as: '#173431', oa: '#04201d', f: '#5cc6bc',
      nb: '#08100f', nt: '#c2d4d0', nm: '#7d958f', nh: '#12201e', na: '#1a3330', nat: '#ffffff', nbd: '#15221f' } },
  gece: { shape: { card: '12px', btn: '10px', btnSm: '8px', input: '10px', nav: '10px' }, brand: 'linear-gradient(145deg, #3a78d6, #173f86)',
    light: { bg: '#edf1f7', s: '#ffffff', s2: '#f5f7fb', s3: '#e7ecf4', b: '#d8dfea', bs: '#bcc6d6', a: '#1f5bb8', ah: '#194c9b', ai: '#1b52a6', as: '#dfe8f7', oa: '#ffffff', f: '#2f6fd0',
      nb: '#0f1b33', nt: '#c9d4e8', nm: '#8796b3', nh: '#18284a', na: '#233a66', nat: '#ffffff', nbd: '#1b2a48' },
    dark: { bg: '#0a0f1c', s: '#111827', s2: '#162033', s3: '#1d2940', b: '#243149', bs: '#34445f', a: '#5b95ec', ah: '#74a8f2', ai: '#8ab6f5', as: '#182a4a', oa: '#071226', f: '#8ab6f5',
      nb: '#070b15', nt: '#c3cde0', nm: '#7b88a3', nh: '#101a2e', na: '#1a2a4a', nat: '#ffffff', nbd: '#121b2e' } },
  bordo: { shape: { card: '8px', btn: '6px', btnSm: '5px', input: '6px', nav: '6px' }, brand: 'linear-gradient(145deg, #b33a5c, #6d1530)',
    light: { bg: '#f5eff0', s: '#ffffff', s2: '#faf6f6', s3: '#efe5e7', b: '#e3d6d9', bs: '#cdb9bd', a: '#8c1d3c', ah: '#741832', ai: '#7f1a37', as: '#f5e1e6', oa: '#ffffff', f: '#a8304f',
      nb: '#2a0d16', nt: '#ead3d9', nm: '#b18e97', nh: '#3b1520', na: '#55202f', nat: '#ffffff', nbd: '#3a1520' },
    dark: { bg: '#140a0d', s: '#1d1115', s2: '#24161b', s3: '#2d1c22', b: '#3b262d', bs: '#52363f', a: '#e0698a', ah: '#ea849f', ai: '#ef93ac', as: '#3a1923', oa: '#2a0610', f: '#ef93ac',
      nb: '#0e0609', nt: '#e3cbd1', nm: '#9e7d86', nh: '#1e0e13', na: '#3a1621', nat: '#ffffff', nbd: '#1f0e14' } },
  orman: { shape: { card: '14px', btn: '10px', btnSm: '8px', input: '10px', nav: '10px' }, brand: 'linear-gradient(145deg, #4f9a4a, #1f5223)',
    light: { bg: '#edf2ea', s: '#ffffff', s2: '#f5f8f3', s3: '#e5ece1', b: '#d5dfd0', bs: '#b9c7b2', a: '#2e6b30', ah: '#255827', ai: '#285f2a', as: '#dfeedd', oa: '#ffffff', f: '#3c8a3f',
      nb: '#13261a', nt: '#cfe0d1', nm: '#8ea893', nh: '#1b3524', na: '#26482f', nat: '#ffffff', nbd: '#1c3424' },
    dark: { bg: '#0b120d', s: '#121b14', s2: '#17231a', s3: '#1e2c21', b: '#263a2b', bs: '#36503c', a: '#6dbb6a', ah: '#84c981', ai: '#8fd08b', as: '#183020', oa: '#06200a', f: '#8fd08b',
      nb: '#070d09', nt: '#c7d9ca', nm: '#7f9884', nh: '#101b13', na: '#1b3322', nat: '#ffffff', nbd: '#111c14' } },
  gunbatimi: { shape: { card: '16px', btn: '999px', btnSm: '999px', input: '12px', nav: '999px' }, brand: 'linear-gradient(145deg, #f08a3e, #b8430f)',
    light: { bg: '#fbf2ea', s: '#fffdfb', s2: '#fdf6f0', s3: '#f5e8dd', b: '#ecdccd', bs: '#d9c1ab', a: '#b23f0d', ah: '#9a380c', ai: '#a03a0d', as: '#fce3d4', oa: '#ffffff', f: '#d9581e',
      nb: '#3b1c10', nt: '#f2d9cb', nm: '#c0998a', nh: '#4d2617', na: '#6b3520', nat: '#ffffff', nbd: '#4a2516' },
    dark: { bg: '#150d09', s: '#1e140f', s2: '#261a13', s3: '#302119', b: '#3f2c21', bs: '#58402f', a: '#f08a50', ah: '#f5a070', ai: '#f7ad82', as: '#3d2215', oa: '#2a1003', f: '#f7ad82',
      nb: '#0f0805', nt: '#ecd2c3', nm: '#a8877a', nh: '#20120b', na: '#3d2214', nat: '#ffffff', nbd: '#21130c' } },
  lavanta: { shape: { card: '18px', btn: '999px', btnSm: '999px', input: '14px', nav: '12px' }, brand: 'linear-gradient(145deg, #9c7bea, #5a3dab)',
    sh1: '0 4px 14px rgba(60, 30, 110, 0.07), 0 1px 2px rgba(60, 30, 110, 0.05)',
    light: { bg: '#f2effa', s: '#ffffff', s2: '#f8f6fd', s3: '#ebe6f6', b: '#ddd6ee', bs: '#c4bae0', a: '#6243b8', ah: '#52379c', ai: '#5a3dab', as: '#e8e0fa', oa: '#ffffff', f: '#7a5ad0',
      nb: '#221838', nt: '#dcd2f0', nm: '#9a8fb8', nh: '#2f2250', na: '#432f72', nat: '#ffffff', nbd: '#2e224a' },
    dark: { bg: '#0f0c18', s: '#171322', s2: '#1d182b', s3: '#251f36', b: '#322a48', bs: '#463c63', a: '#a58cf0', ah: '#b8a3f5', ai: '#c2b1f7', as: '#2a2148', oa: '#160d33', f: '#c2b1f7',
      nb: '#0a0812', nt: '#d5cbea', nm: '#8f85ad', nh: '#161126', na: '#2c2250', nat: '#ffffff', nbd: '#171226' } },
  grafit: { shape: { card: '4px', radiusSm: '3px', btn: '3px', btnSm: '3px', input: '3px', nav: '3px', chip: '4px', navW: '228px' }, brand: 'linear-gradient(145deg, #5b6672, #2a3139)',
    light: { bg: '#eef0f2', s: '#ffffff', s2: '#f6f7f8', s3: '#e7e9ec', b: '#d7dbdf', bs: '#b9bec5', a: '#2f3a46', ah: '#232c36', ai: '#2f3a46', as: '#e3e7eb', oa: '#ffffff', f: '#4b5a6a',
      nb: '#1b1f23', nt: '#d0d5da', nm: '#8c949c', nh: '#262b31', na: '#343b43', nat: '#ffffff', nbd: '#2a2f35' },
    dark: { bg: '#0e1012', s: '#16191c', s2: '#1b1f23', s3: '#22272c', b: '#2c3238', bs: '#3d454d', a: '#c3ccd5', ah: '#d6dde4', ai: '#d0d8df', as: '#2a3036', oa: '#111417', f: '#d0d8df',
      nb: '#0a0b0d', nt: '#cdd3d8', nm: '#858d95', nh: '#15181b', na: '#262b31', nat: '#ffffff', nbd: '#16191c' } },
  okyanus: { shape: { card: '12px', btn: '10px', btnSm: '8px', input: '10px', nav: '10px' }, brand: 'linear-gradient(145deg, #2bb5d8, #0a5d7c)',
    light: { bg: '#eaf4f7', s: '#ffffff', s2: '#f4f9fb', s3: '#e1eef2', b: '#d1e3e9', bs: '#b1cdd6', a: '#0a6f91', ah: '#085b77', ai: '#096485', as: '#d8eef5', oa: '#ffffff', f: '#1789ae',
      nb: '#05293a', nt: '#c8e2ec', nm: '#85aebd', nh: '#0a3a50', na: '#0f4c66', nat: '#ffffff', nbd: '#0b3a4f', nas: 'inset 3px 0 0 #5fd0f0' },
    dark: { bg: '#061217', s: '#0d1b21', s2: '#11232a', s3: '#172c34', b: '#1f3a44', bs: '#2d525f', a: '#3cbde3', ah: '#5ccbeb', ai: '#6fd2ee', as: '#10313d', oa: '#032029', f: '#6fd2ee',
      nb: '#030c10', nt: '#c2dbe4', nm: '#7ea2af', nh: '#0a1a20', na: '#12303b', nat: '#ffffff', nbd: '#0b181d', nas: 'inset 3px 0 0 #3cbde3' } },
  kagit: { shape: { card: '6px', radiusSm: '4px', btn: '4px', btnSm: '4px', input: '4px', nav: '4px', chip: '4px', head: "Georgia, 'Times New Roman', serif" }, brand: 'linear-gradient(145deg, #b07d45, #6b4520)',
    light: { bg: '#f3eee3', s: '#fffdf7', s2: '#faf6ec', s3: '#efe8d9', b: '#e2d9c5', bs: '#c9bc9f', a: '#7b4f22', ah: '#663f19', ai: '#714920', as: '#f1e5d2', oa: '#ffffff', f: '#9a6a35',
      nb: '#3a3024', nt: '#eadfcc', nm: '#b3a48c', nh: '#4a3e2f', na: '#5e4f3b', nat: '#ffffff', nbd: '#4a3e2f' },
    dark: { bg: '#14110c', s: '#1d1912', s2: '#241f17', s3: '#2d271d', b: '#3b3426', bs: '#554a36', a: '#d6a46a', ah: '#e0b682', ai: '#e5bf90', as: '#3a2d1c', oa: '#251707', f: '#e5bf90',
      nb: '#0e0c08', nt: '#e3d7c2', nm: '#a39479', nh: '#1c1810', na: '#33291b', nat: '#ffffff', nbd: '#1d1912' } },
  gul: { shape: { card: '14px', btn: '999px', btnSm: '999px', input: '12px', nav: '12px' }, brand: 'linear-gradient(145deg, #ef6fa3, #a2275b)',
    sh1: '0 4px 14px rgba(110, 30, 70, 0.07), 0 1px 2px rgba(110, 30, 70, 0.05)',
    light: { bg: '#fbeff3', s: '#ffffff', s2: '#fdf6f8', s3: '#f6e4ea', b: '#efd5de', bs: '#dbb6c3', a: '#ad2961', ah: '#952353', ai: '#a2275b', as: '#fbe0ea', oa: '#ffffff', f: '#cc3d78',
      nb: '#3a1229', nt: '#f3d4e2', nm: '#c08aa3', nh: '#4d1a37', na: '#6a2550', nat: '#ffffff', nbd: '#4a1835' },
    dark: { bg: '#160a10', s: '#201118', s2: '#28161f', s3: '#321c27', b: '#432634', bs: '#5e3649', a: '#f07aa9', ah: '#f597bc', ai: '#f7a6c6', as: '#421a2c', oa: '#2c0617', f: '#f7a6c6',
      nb: '#10050b', nt: '#ebcbda', nm: '#a87e92', nh: '#220d18', na: '#42192d', nat: '#ffffff', nbd: '#230e19' } },
  kontrast: { shape: { card: '2px', radiusSm: '2px', btn: '2px', btnSm: '2px', input: '2px', nav: '2px', chip: '2px', cardBw: '2px', inputBw: '2px' }, brand: 'linear-gradient(145deg, #0035b3, #00207a)',
    sh1: 'none',
    light: { bg: '#ffffff', s: '#ffffff', s2: '#f2f2f2', s3: '#e6e6e6', b: '#1a1a1a', bs: '#000000', a: '#0035b3', ah: '#00287f', ai: '#0035b3', as: '#dce6ff', oa: '#ffffff', f: '#000000',
      nb: '#000000', nt: '#ffffff', nm: '#d0d0d0', nh: '#262626', na: '#ffffff', nat: '#000000', nbd: '#444444', t: '#000000', t2: '#1f1f1f', t3: '#3d3d3d' },
    dark: { bg: '#000000', s: '#0a0a0a', s2: '#141414', s3: '#1f1f1f', b: '#e6e6e6', bs: '#ffffff', a: '#7fb0ff', ah: '#a3c6ff', ai: '#9fc2ff', as: '#0d2350', oa: '#000000', f: '#ffffff',
      nb: '#000000', nt: '#ffffff', nm: '#cfcfcf', nh: '#1f1f1f', na: '#ffffff', nat: '#000000', nbd: '#555555', t: '#ffffff', t2: '#e5e5e5', t3: '#c8c8c8' } },
  altin: { shape: { card: '10px', btn: '8px', input: '8px', nav: '6px' }, brand: 'linear-gradient(145deg, #e6bf5a, #8a6512)',
    light: { bg: '#f4f1ea', s: '#ffffff', s2: '#faf8f3', s3: '#ede8dc', b: '#e0d9c8', bs: '#c7bc9f', a: '#82600f', ah: '#6d500d', ai: '#7a5910', as: '#f5ead0', oa: '#ffffff', f: '#a57a1a',
      nb: '#17140e', nt: '#e8dfc9', nm: '#a89c80', nh: '#241f16', na: '#3a311f', nat: '#f6d77a', nbd: '#2a2418', nas: 'inset 3px 0 0 #d9ab3a' },
    dark: { bg: '#0d0c09', s: '#16140f', s2: '#1c1913', s3: '#24201a', b: '#312b20', bs: '#4a4130', a: '#e3b44e', ah: '#ecc56d', ai: '#f0cf7f', as: '#352a12', oa: '#1f1600', f: '#f0cf7f',
      nb: '#080705', nt: '#e3d9c2', nm: '#9d9176', nh: '#16130d', na: '#2c2516', nat: '#f6d77a', nbd: '#15120c', nas: 'inset 3px 0 0 #e3b44e' } },
  nane: { shape: { card: '12px', btn: '10px', btnSm: '8px', input: '10px', nav: '10px' }, brand: 'linear-gradient(145deg, #2bb08a, #0f6d55)',
    light: { bg: '#eef5f2', s: '#ffffff', s2: '#f6faf8', s3: '#e6efeb', b: '#d6e3dd', bs: '#b9cdc4', a: '#127a5f', ah: '#0e644e', ai: '#0f6d55', as: '#d9f0e8', oa: '#ffffff', f: '#1b9475',
      nb: '#e2f0ea', nt: '#234a3f', nm: '#4f7469', nh: '#d2e7de', na: '#ffffff', nat: '#0f6d55', nbd: '#cfe2da', ns: '#0f2f27', nas: '0 1px 3px rgba(16, 60, 48, 0.14)' },
    dark: { bg: '#0a1210', s: '#111b18', s2: '#15221e', s3: '#1b2b26', b: '#233833', bs: '#335049', a: '#4cc9a4', ah: '#6dd5b6', ai: '#7adbbf', as: '#15352c', oa: '#04211a', f: '#7adbbf',
      nb: '#13211d', nt: '#c5ddd5', nm: '#7f9e95', nh: '#1a2d27', na: '#22403a', nat: '#ffffff', nbd: '#1b2d28', ns: '#ffffff', nas: 'none' } }
};

// ------------------------------------------------------------------ contrast check (WCAG 2)
function lum(hex) {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const BASE_TEXT = { light: { t: '#13201e', t2: '#465552', t3: '#6b7a76' }, dark: { t: '#e7eeec', t2: '#b2c1be', t3: '#83948f' } };
const problems = [];
for (const [name, sk] of Object.entries(SKINS)) {
  for (const mode of ['light', 'dark']) {
    const v = Object.assign({}, BASE_TEXT[mode], sk[mode]);
    const need = [['ai', 's', 4.5, 'links / accent text'], ['oa', 'a', 4.5, 'button text'], ['nt', 'nb', 4.5, 'menu text'], ['nat', 'na', 4.5, 'active menu item'],
      ['nm', 'nb', 3, 'menu notes'], ['t', 'bg', 7, 'text'], ['t2', 's', 4.5, 'secondary text'], ['t3', 's', 4.0, 'muted text']];
    for (const [fg, bg, min, what] of need) {
      const r = ratio(v[fg], v[bg]);
      if (r < min) problems.push(`${name} ${mode}: ${what} ${v[fg]} on ${v[bg]} = ${r.toFixed(2)} < ${min}`);
    }
  }
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

// ------------------------------------------------------------------ CSS
const decl = (mode, sk) => {
  const v = sk[mode];
  const out = Object.entries(v).map(([k, val]) => `  --${K[k]}: ${val};`);
  if (!v.ns) out.push('  --nav-strong: #ffffff;');
  if (!v.nas) out.push('  --nav-active-shadow: none;');
  if (!v.t) out.push(...Object.entries(BASE_TEXT[mode]).map(([k, val]) => `  --${K[k]}: ${val};`));
  return out;
};
let css = `/* Themes of Sigorta Portföy - generated by tools/build-skins.mjs, do not edit by hand.
   [data-skin] sits on <html> (the whole app) and on the theme previews in Settings. */\n`;
for (const [name, sk] of Object.entries(SKINS)) {
  const shape = Object.assign({ card: '10px', radiusSm: '7px', btn: '8px', btnSm: '7px', input: '8px', nav: '8px', chip: '999px', cardBw: '1px', inputBw: '1px', navW: '244px', head: 'var(--font)' }, sk.shape);
  const shapeDecl = Object.entries(shape).map(([k, val]) => `  --${SHAPE[k]}: ${val};`);
  shapeDecl.push(`  --brand-grad: ${sk.brand};`);
  shapeDecl.push(`  --shadow-1: ${sk.sh1 || '0 1px 2px rgba(16, 32, 30, 0.06), 0 1px 1px rgba(16, 32, 30, 0.04)'};`);
  css += `\n/* ${name} */\n[data-skin="${name}"] {\n${shapeDecl.concat(decl('light', sk)).join('\n')}\n}\n`;
  const dark = decl('dark', sk).concat(sk.sh1 === 'none' ? ['  --shadow-1: none;'] : ['  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);']).join('\n');
  css += `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"])[data-skin="${name}"], :root:not([data-theme="light"]) [data-skin="${name}"] {\n${dark.replace(/^/gm, '  ')}\n  }\n}\n`;
  css += `:root[data-theme="dark"][data-skin="${name}"], :root[data-theme="dark"] [data-skin="${name}"] {\n${dark}\n}\n`;
}
fs.writeFileSync(new URL('../css/skins.css', import.meta.url), css);
console.log('wrote css/skins.css:', Object.keys(SKINS).length, 'themes');
export const SKIN_NAMES = Object.keys(SKINS);
