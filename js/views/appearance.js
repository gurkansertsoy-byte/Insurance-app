/* Appearance: the themes (colours and shapes, never the places of things), a background behind the work area
   (a picture of one's own or a suggested one) and the editor for the agency's picture (drag, mouse wheel, two
   fingers, a slider). */
(function () {
  'use strict';
  var U = window.U, UI = window.UI, Store = window.Store, App = window.App;
  var h = UI.h, t = UI.t, icon = UI.icon;

  // ------------------------------------------------------------------ themes
  // the order of the theme list in Settings; css/skins.css (tools/build-skins.mjs) holds their colours and shapes
  var SKINS = ['deniz', 'gece', 'okyanus', 'orman', 'nane', 'bordo', 'gul', 'lavanta', 'gunbatimi', 'altin', 'kagit', 'grafit', 'kontrast'];
  App.SKINS = SKINS;

  // ------------------------------------------------------------------ backgrounds
  function tok(name) { return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim() || '#888888'; }
  function svgUrl(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }
  function mix(v, pct, other) { return 'color-mix(in srgb, var(--' + v + ') ' + pct + '%, ' + (other || 'transparent') + ')'; }
  function hexA(hex, a) {
    var n = hex.replace('#', '');
    if (n.length === 3) n = n.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  // each one is drawn in the theme's own colours, light or dark
  var BGS = [
    { key: 'aurora', css: function () {
      return 'radial-gradient(60% 50% at 12% 8%, ' + mix('accent', 30) + ', transparent 70%), radial-gradient(50% 45% at 88% 18%, ' + mix('chart-1', 26) + ', transparent 70%), ' +
        'radial-gradient(65% 55% at 62% 100%, ' + mix('chart-5', 24) + ', transparent 72%), var(--bg)';
    } },
    { key: 'mesh', css: function () {
      return 'radial-gradient(40% 40% at 20% 30%, ' + mix('chart-4', 22) + ', transparent 70%), radial-gradient(45% 45% at 80% 70%, ' + mix('chart-3', 22) + ', transparent 70%), ' +
        'radial-gradient(35% 35% at 70% 15%, ' + mix('chart-2', 18) + ', transparent 70%), radial-gradient(40% 40% at 25% 85%, ' + mix('chart-1', 20) + ', transparent 70%), var(--bg)';
    } },
    { key: 'sunrise', css: function () {
      return 'radial-gradient(70% 60% at 85% 0%, color-mix(in srgb, #ffb25a 30%, transparent), transparent 70%), linear-gradient(165deg, color-mix(in srgb, #ff8f6b 16%, var(--bg)), var(--bg) 60%)';
    } },
    { key: 'sea', css: function () {
      return 'radial-gradient(60% 40% at 50% 0%, color-mix(in srgb, #4cc3e8 24%, transparent), transparent 75%), linear-gradient(180deg, color-mix(in srgb, #2b8fc4 14%, var(--bg)), var(--bg) 70%)';
    } },
    { key: 'waves', css: function () {
      var a = tok('accent'), c = tok('chart-1');
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400" viewBox="0 0 1600 400" preserveAspectRatio="none">' +
        '<path d="M0 230 C 260 170 520 300 800 240 S 1340 170 1600 230 V400 H0Z" fill="' + hexA(c, 0.10) + '"/>' +
        '<path d="M0 290 C 300 240 560 340 860 290 S 1380 240 1600 300 V400 H0Z" fill="' + hexA(a, 0.14) + '"/>' +
        '<path d="M0 340 C 320 310 600 380 900 345 S 1400 315 1600 350 V400 H0Z" fill="' + hexA(a, 0.20) + '"/></svg>';
      return svgUrl(svg) + ' bottom center / 100% 45% no-repeat, var(--bg)';
    } },
    { key: 'mountains', css: function () {
      var a = tok('accent'), n = tok('nav-bg');
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="500" viewBox="0 0 1600 500" preserveAspectRatio="none">' +
        '<path d="M0 330 L180 210 L330 300 L520 140 L720 290 L900 180 L1100 300 L1290 160 L1460 260 L1600 200 V500 H0Z" fill="' + hexA(a, 0.10) + '"/>' +
        '<path d="M0 400 L220 290 L400 370 L610 250 L820 380 L1010 280 L1230 390 L1420 300 L1600 360 V500 H0Z" fill="' + hexA(n, 0.12) + '"/></svg>';
      return svgUrl(svg) + ' bottom center / 100% 55% no-repeat, var(--bg)';
    } },
    { key: 'dots', css: function () {
      return 'radial-gradient(' + mix('accent', 24) + ' 1.3px, transparent 1.8px) 0 0 / 22px 22px, var(--bg)';
    } },
    { key: 'grid', css: function () {
      return 'linear-gradient(' + mix('border-strong', 40) + ' 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, ' + mix('border-strong', 40) + ' 1px, transparent 1px) 0 0 / 28px 28px, var(--bg)';
    } },
    { key: 'lines', css: function () {
      return 'repeating-linear-gradient(135deg, ' + mix('accent', 8) + ' 0 2px, transparent 2px 16px), var(--bg)';
    } },
    { key: 'hex', css: function () {
      var c = tok('accent');
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="97" viewBox="0 0 56 97"><g fill="none" stroke="' + hexA(c, 0.16) + '" stroke-width="1.2">' +
        '<path d="M28 1 L55 17 V49 L28 65 L1 49 V17 Z"/><path d="M28 65 V97 M1 49 L-26 65 M55 49 L82 65"/></g></svg>';
      return svgUrl(svg) + ' 0 0 / 56px 97px, var(--bg)';
    } },
    { key: 'topo', css: function () {
      var c = tok('accent');
      var rings = '';
      for (var i = 1; i <= 7; i++) rings += '<ellipse cx="300" cy="300" rx="' + (i * 40 + 10) + '" ry="' + (i * 28 + 8) + '" transform="rotate(' + (i * 6) + ' 300 300)"/>';
      for (var j = 1; j <= 5; j++) rings += '<ellipse cx="40" cy="560" rx="' + (j * 45) + '" ry="' + (j * 34) + '"/>';
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><g fill="none" stroke="' + hexA(c, 0.13) + '" stroke-width="1.3">' + rings + '</g></svg>';
      return svgUrl(svg) + ' 0 0 / 600px 600px, var(--bg)';
    } },
    { key: 'paper', css: function () {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>' +
        '<feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0.09 0"/></filter><rect width="240" height="240" filter="url(#n)"/></svg>';
      return svgUrl(svg) + ' 0 0 / 240px 240px, linear-gradient(' + mix('chart-4', 6) + ', ' + mix('chart-4', 6) + '), var(--bg)';
    } }
  ];
  App.BACKGROUNDS = BGS;
  function bgByKey(k) { return BGS.filter(function (b) { return b.key === k; })[0] || null; }

  /** Puts the theme on the page and the chosen background behind the work area. */
  App.applyAppearance = function () {
    var s = Store.settings, root = document.documentElement;
    root.setAttribute('data-skin', SKINS.indexOf(s.skin) >= 0 ? s.skin : 'deniz');
    var layer = document.getElementById('app-bg');
    if (!layer) return;
    var img = layer.firstChild, dim = layer.lastChild;
    var preset = s.bgKind === 'preset' ? bgByKey(s.bgPreset) : null;
    var on = !!(preset || (s.bgKind === 'image' && s.bgImage));
    root.toggleAttribute('data-bg', on);
    img.style.background = !on ? '' : preset ? preset.css() : 'url("' + s.bgImage + '") center / cover no-repeat, var(--bg)';
    var d = s.bgDim != null ? Number(s.bgDim) : (s.bgKind === 'image' ? 0.45 : 0);
    dim.style.opacity = on ? String(Math.max(0, Math.min(0.9, d))) : '0';
  };
  // a drawn background follows the light / dark mode of the device
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { App.applyAppearance(); }); } catch (e) { /* old browsers */ }

  /** Shrinks a picture file (at most `max` px on its long side); resolves { data, w, h }. */
  function loadPicture(file, max, keepAlpha) {
    return new Promise(function (resolve, reject) {
      if (!file || (!/^image\//.test(file.type || '') && !/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name || ''))) { reject(new Error('notImage')); return; }
      if (file.size > 25 * 1048576) { reject(new Error('tooBig')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || 512, hh = img.naturalHeight || 512;
        var k = Math.min(1, max / Math.max(w, hh));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hh * k));
        var ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        if (!keepAlpha) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var alpha = keepAlpha && /png|gif|webp|svg/i.test(file.type || file.name || '');
        resolve({ data: alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('notImage')); };
      img.src = url;
    });
  }
  function chooseFile(accept, then) {
    var input = h('input', { type: 'file', accept: accept, hidden: true });
    input.addEventListener('change', function () { var f = input.files && input.files[0]; input.remove(); if (f) then(f); });
    document.body.appendChild(input);
    input.click();
  }
  function pictureError(e) { UI.toast(t(e && e.message === 'tooBig' ? 'logo.tooBig' : 'logo.notImage'), { type: 'bad' }); }

  // ------------------------------------------------------------------ the agency's picture
  var PICS = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp';

  /** The square in the top-left corner: arranges the picture there is, or chooses one. */
  App.pickLogo = function () {
    var s = Store.settings;
    if (s.logo) { App.logoEditor(s.logoSource || s.logo, s.logoCrop || null); return; }
    App.chooseLogoFile();
  };
  App.chooseLogoFile = function (into) {
    chooseFile(PICS, function (f) {
      loadPicture(f, 1600, true).then(function (p) { if (into) into(p.data); else App.logoEditor(p.data, null); }, pictureError);
    });
  };
  /** Kept for code and tests that hand over a file directly. */
  App.setLogoFile = function (file) {
    return loadPicture(file, 1600, true).then(function (p) { App.logoEditor(p.data, null); return true; }, function (e) { pictureError(e); return false; });
  };
  App.removeLogo = function () {
    var before = { logo: Store.settings.logo || '', logoSource: Store.settings.logoSource || '', logoCrop: Store.settings.logoCrop || null };
    if (!before.logo) return;
    Store.updateSettings({ logo: '', logoSource: '', logoCrop: null });
    UI.toast(t('logo.removed'), { action: { label: t('common.undo'), fn: function () { Store.updateSettings(before); } } });
  };

  /**
   * Shows the picture large over the page to arrange it: drag (mouse or one finger), zoom with the mouse wheel,
   * two fingers or the slider; Tamam keeps the square in the frame. crop: { z, x, y, bg } from an earlier arranging.
   * z = 1: the whole picture fits the frame; x, y: the picture's centre from the frame's centre, in frame widths.
   */
  App.logoEditor = function (src, crop) {
    var st = Object.assign({ z: 1, x: 0, y: 0, bg: 'white' }, crop || {});
    var img = new Image();
    var ready = false;
    var canvas = h('canvas', { class: 'crop-canvas', id: 'logo-canvas', tabindex: '0', role: 'img', 'aria-label': t('logo.editArea') });
    var stage = h('div', { class: 'crop-stage' }, canvas);
    var zoom = h('input', { type: 'range', id: 'logo-zoom', min: '0', max: '1000', step: '1', 'aria-label': t('logo.zoom') });
    var previewMark = h('span', { class: 'brand-mark crop-preview-mark', 'aria-hidden': 'true' });
    var previewBig = h('span', { class: 'logo-preview crop-preview-big', 'aria-hidden': 'true' });
    var bgSeg = h('div', { class: 'seg', role: 'group', 'aria-label': t('logo.bg') }, ['white', 'none'].map(function (b) {
      return h('button', { type: 'button', id: 'logo-bg-' + b, 'aria-pressed': String(st.bg === b), onClick: function () {
        st.bg = b;
        Array.prototype.forEach.call(bgSeg.children, function (x) { x.setAttribute('aria-pressed', String(x.id === 'logo-bg-' + b)); });
        draw();
      } }, t('logo.bg.' + b));
    }));
    bgSeg.style.height = '32px';
    // zoom: 0.25 … 12 times "fits", on a logarithmic slider
    var ZMIN = 0.25, ZMAX = 12;
    function toSlider(z) { return Math.round(Math.log(z / ZMIN) / Math.log(ZMAX / ZMIN) * 1000); }
    function fromSlider(v) { return ZMIN * Math.pow(ZMAX / ZMIN, v / 1000); }
    function cover() { var w = img.naturalWidth || 1, hh = img.naturalHeight || 1; return Math.max(w, hh) / Math.min(w, hh); }
    function geom() {
      var size = canvas.clientWidth || 360;
      var F = Math.round(size * 0.74), M = (size - F) / 2;
      return { size: size, F: F, M: M };
    }
    function clamp() {
      st.z = Math.max(ZMIN, Math.min(ZMAX, st.z));
      var w = img.naturalWidth || 1, hh = img.naturalHeight || 1, L = Math.max(w, hh);
      // some of the picture always stays inside the frame
      var hw = (w / L) * st.z / 2, hh2 = (hh / L) * st.z / 2;
      st.x = Math.max(-(0.5 + hw - 0.05), Math.min(0.5 + hw - 0.05, st.x));
      st.y = Math.max(-(0.5 + hh2 - 0.05), Math.min(0.5 + hh2 - 0.05, st.y));
    }
    /** Draws the picture on ctx for a frame of F px whose top-left corner is at (ox, oy). */
    function paint(ctx, F, ox, oy) {
      var w = img.naturalWidth || 1, hh = img.naturalHeight || 1, L = Math.max(w, hh);
      var k = st.z * F / L;
      var cx = ox + F / 2 + st.x * F, cy = oy + F / 2 + st.y * F;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, cx - w * k / 2, cy - hh * k / 2, w * k, hh * k);
    }
    function roundRect(ctx, x, y, w, hh, r) {
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function draw() {
      if (!ready) return;
      var g = geom(), dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(g.size * dpr)) { canvas.width = Math.round(g.size * dpr); canvas.height = Math.round(g.size * dpr); }
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, g.size, g.size);
      // the frame's background: white, or a checkerboard for "none"
      ctx.save();
      ctx.beginPath(); roundRect(ctx, g.M, g.M, g.F, g.F, g.F * 0.25); ctx.clip();
      if (st.bg === 'white') { ctx.fillStyle = '#ffffff'; ctx.fillRect(g.M, g.M, g.F, g.F); }
      else {
        for (var yy = 0; yy < g.F; yy += 12) for (var xx = 0; xx < g.F; xx += 12) {
          ctx.fillStyle = ((xx + yy) / 12) % 2 ? '#d9dde0' : '#f3f4f5'; ctx.fillRect(g.M + xx, g.M + yy, 12, 12);
        }
      }
      ctx.restore();
      paint(ctx, g.F, g.M, g.M);
      // outside the frame: dimmed, so the part that is kept is clear
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, g.size, g.size); roundRect(ctx, g.M, g.M, g.F, g.F, g.F * 0.25);
      ctx.fillStyle = 'rgba(8, 14, 13, 0.62)'; ctx.fill('evenodd');
      ctx.beginPath(); roundRect(ctx, g.M, g.M, g.F, g.F, g.F * 0.25);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      zoom.value = String(toSlider(st.z));
      var out = render(96);
      [previewMark, previewBig].forEach(function (el) {
        UI.clear(el);
        el.classList.toggle('has-logo', true);
        el.classList.toggle('clear', st.bg === 'none');
        el.appendChild(h('img', { src: out, alt: '' }));
      });
    }
    function render(size) {
      var c = document.createElement('canvas');
      c.width = size; c.height = size;
      var ctx = c.getContext('2d');
      if (st.bg === 'white') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size); }
      paint(ctx, size, 0, 0);
      var data = c.toDataURL('image/png');
      if (data.length > 220000) data = c.toDataURL('image/jpeg', 0.9);
      return data;
    }
    // zoom by f around the point (px, py) of the canvas
    function zoomAt(f, px, py) {
      var g = geom();
      var rx = (px - g.M - g.F / 2) / g.F, ry = (py - g.M - g.F / 2) / g.F;
      var z0 = st.z;
      st.z = Math.max(ZMIN, Math.min(ZMAX, st.z * f));
      var r = st.z / z0;
      st.x = rx - (rx - st.x) * r;
      st.y = ry - (ry - st.y) * r;
      clamp(); draw();
    }
    function point(e) { var b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
    var pointers = new Map(), last = null;
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ }
      pointers.set(e.pointerId, point(e));
      last = null;
      canvas.classList.add('grabbing');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      e.preventDefault();
      var g = geom();
      var prev = pointers.get(e.pointerId), now = point(e);
      if (pointers.size === 1) {
        st.x += (now.x - prev.x) / g.F; st.y += (now.y - prev.y) / g.F;
        pointers.set(e.pointerId, now);
        clamp(); draw();
        return;
      }
      // two fingers: spread or pinch to zoom, move together to pan
      pointers.set(e.pointerId, now);
      var ps = Array.from(pointers.values()).slice(0, 2);
      var mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
      var dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      if (last && last.dist > 0) {
        zoomAt(dist / last.dist, last.mid.x, last.mid.y);
        st.x += (mid.x - last.mid.x) / g.F; st.y += (mid.y - last.mid.y) / g.F;
        clamp(); draw();
      }
      last = { mid: mid, dist: dist };
    });
    function up(e) {
      pointers.delete(e.pointerId);
      last = null;
      if (!pointers.size) canvas.classList.remove('grabbing');
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = point(e);
      zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 0.1 : 0.02, g = geom();
      if (e.key === 'ArrowLeft') st.x -= step; else if (e.key === 'ArrowRight') st.x += step;
      else if (e.key === 'ArrowUp') st.y -= step; else if (e.key === 'ArrowDown') st.y += step;
      else if (e.key === '+' || e.key === '=') { zoomAt(1.1, g.size / 2, g.size / 2); e.preventDefault(); return; }
      else if (e.key === '-') { zoomAt(1 / 1.1, g.size / 2, g.size / 2); e.preventDefault(); return; }
      else return;
      e.preventDefault(); clamp(); draw();
    });
    zoom.addEventListener('input', function () { var g = geom(); zoomAt(fromSlider(Number(zoom.value)) / st.z, g.size / 2, g.size / 2); });
    function fitTo(z) { st.z = z; st.x = 0; st.y = 0; clamp(); draw(); }
    var m = UI.modal({
      title: t('logo.editTitle'), icon: 'image-plus', size: 'wide', sticky: true,
      body: [h('div', { class: 'crop-layout' },
        stage,
        h('div', { class: 'crop-side stack' },
          h('p', { class: 'small dim' }, t('logo.editHelp')),
          h('div', { class: 'row tight', style: { gap: '8px', flexWrap: 'nowrap' } },
            h('button', { type: 'button', class: 'icon-btn', id: 'logo-zoom-out', title: t('logo.zoomOut'), 'aria-label': t('logo.zoomOut'), onClick: function () { var g = geom(); zoomAt(1 / 1.15, g.size / 2, g.size / 2); } }, h('span', { style: { fontSize: '20px', fontWeight: 700 } }, '−')),
            zoom,
            h('button', { type: 'button', class: 'icon-btn', id: 'logo-zoom-in', title: t('logo.zoomIn'), 'aria-label': t('logo.zoomIn'), onClick: function () { var g = geom(); zoomAt(1.15, g.size / 2, g.size / 2); } }, icon('plus'))),
          h('div', { class: 'row tight', style: { gap: '8px' } },
            h('button', { type: 'button', class: 'btn btn-sm', id: 'logo-fit', onClick: function () { fitTo(1); } }, t('logo.fit')),
            h('button', { type: 'button', class: 'btn btn-sm', id: 'logo-fill', onClick: function () { fitTo(cover()); } }, t('logo.fill')),
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', id: 'logo-other', onClick: function () {
              App.chooseLogoFile(function (data) { src = data; st = { z: 1, x: 0, y: 0, bg: st.bg }; ready = false; img.src = data; });
            } }, icon('image-plus'), t('logo.other'))),
          h('div', null, h('div', { class: 'small muted', style: { marginBottom: '6px' } }, t('logo.bg')), bgSeg),
          h('div', null, h('div', { class: 'small muted', style: { marginBottom: '6px' } }, t('logo.preview')),
            h('div', { class: 'crop-previews' }, h('div', { class: 'crop-preview-nav' }, previewMark, h('span', { class: 'brand-name' }, Store.settings.agencyName || 'Sigorta Portföy')), previewBig))))],
      foot: [h('button', { type: 'button', class: 'btn', onClick: function () { m.close(); } }, t('common.cancel')),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'logo-save', onClick: function () {
          if (!ready) return;
          var before = { logo: Store.settings.logo || '', logoSource: Store.settings.logoSource || '', logoCrop: Store.settings.logoCrop || null };
          Store.updateSettings({ logo: render(192), logoSource: src, logoCrop: { z: st.z, x: st.x, y: st.y, bg: st.bg } });
          m.close();
          UI.toast(t('logo.saved'), { action: { label: t('common.undo'), fn: function () { Store.updateSettings(before); } } });
        } }, icon('check'), t('logo.done'))]
    });
    img.onload = function () { ready = true; clamp(); draw(); };
    img.onerror = function () { m.close(); pictureError(); };
    img.src = src;
    if (window.ResizeObserver) new ResizeObserver(function () { draw(); }).observe(canvas);
    setTimeout(function () { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50);
    return m;
  };

  // ------------------------------------------------------------------ Settings: theme and background
  function skinTile(k) {
    var cur = SKINS.indexOf(Store.settings.skin) >= 0 ? Store.settings.skin : 'deniz';
    return h('button', { type: 'button', class: 'skin-tile', 'data-skin': k, id: 'skin-' + k, 'aria-pressed': String(cur === k), title: t('skin.' + k + '.about'),
      onClick: function () { Store.setSetting('skin', k); } },
      h('span', { class: 'skin-prev', 'aria-hidden': 'true' },
        h('span', { class: 'sp-nav' }, h('i', { class: 'sp-dot' }), h('i'), h('i', { class: 'on' }), h('i')),
        h('span', { class: 'sp-main' }, h('span', { class: 'sp-card' }, h('b'), h('em'), h('span', { class: 'sp-row' }, h('span', { class: 'sp-btn' }), h('span', { class: 'sp-chip' }))))),
      h('span', { class: 'skin-name' }, t('skin.' + k)), h('span', { class: 'skin-about' }, t('skin.' + k + '.about')));
  }
  function bgTile(key, label, style, extra) {
    var s = Store.settings;
    var on = key === 'none' ? !(s.bgKind === 'preset' || (s.bgKind === 'image' && s.bgImage)) : key === 'image' ? s.bgKind === 'image' && !!s.bgImage : s.bgKind === 'preset' && s.bgPreset === key;
    return h('button', { type: 'button', class: 'bg-tile', id: 'bg-' + key, 'aria-pressed': String(on), onClick: extra },
      h('span', { class: 'bg-prev', style: style || null }, key === 'none' ? icon('x') : key === 'image' && !s.bgImage ? icon('image-plus') : null), h('span', { class: 'skin-name' }, label));
  }

  /** Settings card: themes, light / dark, background. */
  App.themeCard = function () {
    var s = Store.settings;
    var modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': t('app.theme') }, ['system', 'light', 'dark'].map(function (th) {
      return h('button', { type: 'button', id: 'theme-' + th, 'aria-pressed': String((s.theme || 'system') === th), onClick: function () { Store.setSetting('theme', th); } }, t('settings.theme.' + th));
    }));
    var bgOn = s.bgKind === 'preset' || (s.bgKind === 'image' && s.bgImage);
    var dimVal = s.bgDim != null ? Number(s.bgDim) : (s.bgKind === 'image' ? 0.45 : 0);
    var dim = h('input', { type: 'range', id: 'bg-dim', min: '0', max: '85', step: '5', value: String(Math.round(dimVal * 100)), 'aria-label': t('bg.dim'),
      onInput: function (e) { Store.settings.bgDim = Number(e.target.value) / 100; App.applyAppearance(); },
      onChange: function (e) { Store.updateSettings({ bgDim: Number(e.target.value) / 100 }); } });
    var tiles = [bgTile('none', t('bg.none'), null, function () { Store.updateSettings({ bgKind: '' }); })]
      .concat(BGS.map(function (b) { return bgTile(b.key, t('bg.' + b.key), { background: b.css() }, function () { Store.updateSettings({ bgKind: 'preset', bgPreset: b.key, bgDim: 0 }); }); }))
      .concat([bgTile('image', s.bgImage ? t('bg.mine') : t('bg.pick'), s.bgImage ? { background: 'url("' + s.bgImage + '") center / cover' } : null, function () {
        if (s.bgImage && s.bgKind !== 'image') { Store.updateSettings({ bgKind: 'image', bgDim: s.bgDim != null && s.bgKind === 'image' ? s.bgDim : 0.45 }); return; }
        App.chooseBackground();
      })]);
    return h('section', { class: 'card', id: 'settings-themes' },
      h('div', { class: 'card-head' }, h('h2', null, t('skin.title')), h('span', { class: 'sub' }, t('skin.sub')),
        h('div', { class: 'actions' }, h('span', { class: 'small muted', style: { marginRight: '6px' } }, t('settings.themeMode')), modeSeg)),
      h('div', { class: 'card-body stack' },
        h('div', { class: 'skin-grid', role: 'group', 'aria-label': t('skin.title') }, SKINS.map(skinTile)),
        h('hr', { class: 'divider' }),
        h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'baseline' } },
          h('div', null, h('h3', null, t('bg.title')), h('div', { class: 'small muted' }, t('bg.sub'))),
          s.bgImage ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', id: 'bg-image-change', onClick: function () { App.chooseBackground(); } }, icon('image-plus'), t('bg.change')) : null),
        h('div', { class: 'bg-grid', role: 'group', 'aria-label': t('bg.title') }, tiles),
        bgOn ? h('div', { class: 'row', style: { gap: '12px', alignItems: 'center' } },
          h('label', { for: 'bg-dim', class: 'small', style: { fontWeight: 600 } }, t('bg.dim')), h('div', { style: { flex: '1 1 220px', maxWidth: '360px' } }, dim),
          h('span', { class: 'small muted' }, t('bg.dimSub'))) : null));
  };

  App.chooseBackground = function () {
    chooseFile(PICS, function (f) {
      // a background is big but needs no detail: 1920 px, JPEG
      loadPicture(f, 1920, false).then(function (p) {
        var before = { bgKind: Store.settings.bgKind || '', bgImage: Store.settings.bgImage || '', bgDim: Store.settings.bgDim };
        Store.updateSettings({ bgKind: 'image', bgImage: p.data, bgDim: 0.45 });
        UI.toast(t('bg.saved'), { action: { label: t('common.undo'), fn: function () { Store.updateSettings(before); } } });
      }, pictureError);
    });
  };
})();
