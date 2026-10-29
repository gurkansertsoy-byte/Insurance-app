/* Sigorta Portföy - small SVG / HTML charts (columns, stacked columns, bars, part-to-whole, sparkline). */
(function (root) {
  'use strict';
  var UI = root.UI, U = root.U;
  var h = UI.h;

  function niceTicks(max, count) {
    if (!(max > 0)) return [0, 1];
    var raw = max / count;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    var ticks = [];
    for (var v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    if (ticks.length < 2) ticks.push(step);
    return ticks;
  }

  /** Draws when the element has a width and again whenever the width changes. */
  function mount(draw, cls) {
    var el = h('div', { class: 'chart ' + (cls || '') });
    var last = 0;
    function redraw() {
      var w = Math.floor(el.clientWidth);
      if (!w || w === last) return;
      last = w;
      UI.clear(el);
      draw(el, w);
    }
    requestAnimationFrame(redraw);
    if (root.ResizeObserver) new ResizeObserver(function () { redraw(); }).observe(el);
    else root.addEventListener('resize', redraw);
    return el;
  }

  function tip(el) {
    var t = el.querySelector('.chart-tip');
    if (!t) { t = h('div', { class: 'chart-tip', role: 'tooltip', hidden: true }); el.appendChild(t); }
    return t;
  }

  function showTip(el, x, y, title, rows) {
    var t = tip(el);
    UI.clear(t);
    t.appendChild(h('div', { class: 'tt' }, title));
    rows.forEach(function (r) {
      if (r.series) t.appendChild(h('div', { class: 'tr' }, h('span', { class: 'ln', style: { background: r.color } }), h('span', { style: { fontWeight: 600 } }, r.value), h('span', { class: 'tl' }, r.series)));
      else t.appendChild(h('div', { class: r.sub ? 'tr' : 'tv' }, r.value));
    });
    t.hidden = false;
    var w = el.clientWidth, tw = t.offsetWidth || 160;
    t.style.left = Math.max(tw / 2, Math.min(w - tw / 2, x)) + 'px';
    t.style.top = Math.max(t.offsetHeight + 12, y) + 'px';
  }

  function hideTip(el) { var t = el.querySelector('.chart-tip'); if (t) t.hidden = true; }

  // touch screens never send pointerleave after a tap: close tooltips on the next tap elsewhere or on scroll
  function hideAll(e) {
    document.querySelectorAll('.chart.hovering').forEach(function (el) {
      if (e && e.target && el.contains(e.target)) return;
      el.classList.remove('hovering');
      el.querySelectorAll('.mark.on').forEach(function (m) { m.classList.remove('on'); });
      hideTip(el);
    });
  }
  document.addEventListener('pointerdown', hideAll, true);
  window.addEventListener('scroll', function () { hideAll(null); }, { passive: true });

  function roundTop(x, y, w, hgt, r) {
    if (!(hgt > 0)) return '';
    r = Math.min(r, w / 2, hgt);
    return 'M' + x + ',' + (y + hgt) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + hgt) + 'Z';
  }

  function bindHover(hit, el, mark, onShow) {
    function on() { el.classList.add('hovering'); if (mark) mark.classList.add('on'); onShow(); }
    function off() { el.classList.remove('hovering'); if (mark) mark.classList.remove('on'); hideTip(el); }
    hit.addEventListener('pointerenter', on);
    hit.addEventListener('pointerleave', off);
    hit.addEventListener('focus', on);
    hit.addEventListener('blur', off);
  }

  /**
   * Single-series columns. o: { data: [{ key, label, short, value, tip: [rows] }], format(v), tickFormat(v),
   *   height, ariaLabel, onClick(d) }
   */
  function columns(o) {
    return mount(function (el, W) {
      var H = o.height || 230, padL = 54, padR = 10, padT = 24, padB = 28;
      var data = o.data, n = Math.max(1, data.length);
      var max = 0, maxIdx = 0;
      data.forEach(function (d, i) { if ((d.value || 0) > max) { max = d.value || 0; maxIdx = i; } });
      var ticks = niceTicks(max, 4), top = ticks[ticks.length - 1] || 1;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var band = plotW / n;
      var bw = Math.max(3, Math.min(24, band * 0.6));
      var y = function (v) { return padT + plotH - (v / top) * plotH; };
      var svg = h('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.ariaLabel || '' });
      var grid = h('g', { class: 'grid' });
      ticks.forEach(function (tk) { grid.appendChild(h('line', { x1: padL, x2: W - padR, y1: y(tk), y2: y(tk) })); });
      svg.appendChild(grid);
      ticks.forEach(function (tk) {
        svg.appendChild(h('text', { x: padL - 8, y: y(tk) + 4, 'text-anchor': 'end' }, (o.tickFormat || U.fmtCompact)(tk)));
      });
      svg.appendChild(h('g', { class: 'axis' }, h('line', { x1: padL, x2: W - padR, y1: y(0), y2: y(0) })));
      var every = Math.max(1, Math.ceil(40 / band));
      var lastIdx = data.length - 1;
      var labelMax = maxIdx !== lastIdx && !(Math.abs(maxIdx - lastIdx) === 1 && band < 64);
      data.forEach(function (d, i) {
        var cx = padL + band * i + band / 2, v = d.value || 0, yy = y(v);
        var bar = h('path', { class: 'mark', d: roundTop(cx - bw / 2, yy, bw, y(0) - yy, 4), fill: d.color || o.color || 'var(--chart-1)' });
        svg.appendChild(bar);
        if ((lastIdx - i) % every === 0) svg.appendChild(h('text', { x: cx, y: H - 9, 'text-anchor': 'middle', class: 'lbl' }, d.short || d.label));
        if (v > 0 && (i === lastIdx || (i === maxIdx && labelMax))) {
          svg.appendChild(h('text', { x: cx, y: yy - 7, 'text-anchor': 'middle', class: 'val' }, (o.labelFormat || o.format)(v)));
        }
        var hit = h('rect', { class: 'hit', x: padL + band * i, y: padT - 8, width: band, height: plotH + padB, tabindex: 0, role: 'img', 'aria-label': d.label + ': ' + o.format(v) });
        bindHover(hit, el, bar, function () { showTip(el, cx, Math.min(yy, y(0) - 8) - 4, d.label, d.tip || [{ value: o.format(v) }]); });
        if (o.onClick) {
          hit.style.cursor = 'pointer';
          hit.addEventListener('click', function () { o.onClick(d); });
          hit.addEventListener('keydown', function (e) { if (e.key === 'Enter') o.onClick(d); });
        }
        svg.appendChild(hit);
      });
      el.appendChild(svg);
    });
  }

  /** Stacked columns. o: { data: [{ label, short, values: [..] }], series: [{ label, color }], format } */
  function stackedColumns(o) {
    return mount(function (el, W) {
      var H = o.height || 230, padL = 46, padR = 10, padT = 14, padB = 28;
      var data = o.data, n = Math.max(1, data.length);
      var max = 0;
      data.forEach(function (d) { var s = U.sum(d.values); if (s > max) max = s; });
      var ticks = niceTicks(max, 4), top = ticks[ticks.length - 1] || 1;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var band = plotW / n, bw = Math.max(3, Math.min(24, band * 0.6));
      var y = function (v) { return padT + plotH - (v / top) * plotH; };
      var svg = h('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.ariaLabel || '' });
      var grid = h('g', { class: 'grid' });
      ticks.forEach(function (tk) { grid.appendChild(h('line', { x1: padL, x2: W - padR, y1: y(tk), y2: y(tk) })); });
      svg.appendChild(grid);
      ticks.forEach(function (tk) { svg.appendChild(h('text', { x: padL - 8, y: y(tk) + 4, 'text-anchor': 'end' }, (o.tickFormat || U.fmtCompact)(tk))); });
      svg.appendChild(h('g', { class: 'axis' }, h('line', { x1: padL, x2: W - padR, y1: y(0), y2: y(0) })));
      var every = Math.max(1, Math.ceil(40 / band));
      data.forEach(function (d, i) {
        var cx = padL + band * i + band / 2;
        var g = h('g', { class: 'mark' });
        var acc = 0;
        var topIdx = -1;
        d.values.forEach(function (v, si) { if (v > 0) topIdx = si; });
        d.values.forEach(function (v, si) {
          if (!(v > 0)) return;
          var y1 = y(acc + v), y0 = y(acc);
          var gap = acc > 0 ? 2 : 0;
          var hgt = Math.max(0, y0 - y1 - gap);
          var path = si === topIdx ? roundTop(cx - bw / 2, y1, bw, hgt, 4) : 'M' + (cx - bw / 2) + ',' + y1 + 'h' + bw + 'v' + hgt + 'h' + (-bw) + 'Z';
          g.appendChild(h('path', { d: path, fill: o.series[si].color }));
          acc += v;
        });
        svg.appendChild(g);
        if ((data.length - 1 - i) % every === 0) svg.appendChild(h('text', { x: cx, y: H - 9, 'text-anchor': 'middle', class: 'lbl' }, d.short || d.label));
        var hit = h('rect', { class: 'hit', x: padL + band * i, y: padT, width: band, height: plotH + padB, tabindex: 0, role: 'img', 'aria-label': d.label });
        bindHover(hit, el, g, function () {
          var rows = o.series.map(function (s, si) { return { series: s.label, value: o.format(d.values[si] || 0), color: s.color }; }).reverse();
          showTip(el, cx, y(U.sum(d.values)) - 4, d.label, rows);
        });
        svg.appendChild(hit);
      });
      el.appendChild(svg);
    });
  }

  /** Ranked horizontal bars in one hue. o: { data: [{ label, value, sub, onClick }], format, max } */
  function hbars(o) {
    var max = o.max || Math.max.apply(null, o.data.map(function (d) { return d.value || 0; }).concat([0])) || 1;
    var el = h('div', { class: 'chart hbars' });
    o.data.forEach(function (d) {
      var pct = Math.max(0, (d.value || 0) / max * 100);
      var fill = h('div', { class: 'fill mark', style: { width: pct + '%', background: d.color || 'var(--chart-1)' } });
      var row = h(d.onClick ? 'button' : 'div', {
        class: 'hbar', type: d.onClick ? 'button' : null,
        style: d.onClick ? { border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' } : null,
        onClick: d.onClick || null, title: d.title || null
      },
      h('span', { class: 'l' }, d.label),
      h('span', { class: 'track' }, fill),
      h('span', { class: 'v' }, o.format(d.value || 0), d.sub ? h('span', { class: 's' }, d.sub) : null));
      el.appendChild(row);
    });
    return el;
  }

  /** Part-to-whole bar with a legend that carries the numbers. o: { parts: [{ label, value, color }], format } */
  function stackBar(o) {
    var total = U.sum(o.parts, function (p) { return p.value; });
    var bar = h('div', { class: 'stackbar', role: 'img', 'aria-label': o.parts.map(function (p) { return p.label + ' ' + o.format(p.value); }).join(', ') });
    o.parts.forEach(function (p) {
      if (!(p.value > 0)) return;
      bar.appendChild(h('span', { style: { width: (p.value / (total || 1) * 100) + '%', background: p.color }, title: p.label + ': ' + o.format(p.value) }));
    });
    var legend = h('div', { class: 'legend', style: { marginTop: '10px' } }, o.parts.map(function (p) {
      return h('span', null, h('i', { style: { background: p.color } }), h('span', null, p.label), h('strong', { class: 'num', style: { color: 'var(--text)' } }, o.format(p.value)),
        h('span', { class: 'muted num' }, total ? U.fmtPct(p.value / total, root.I18N ? root.I18N.lang : 'tr', 0) : ''));
    }));
    return h('div', null, bar, legend);
  }

  /** Trend line for a stat tile. */
  function sparkline(values, color) {
    var W = 120, H = 28, n = values.length;
    var svg = h('svg', { class: 'spark', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    if (n < 2) return svg;
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values.concat([0]));
    var span = (max - min) || 1;
    var pts = values.map(function (v, i) { return [i / (n - 1) * (W - 6) + 3, H - 4 - ((v - min) / span) * (H - 8)]; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('');
    svg.appendChild(h('path', { d: line + 'L' + pts[n - 1][0] + ',' + H + 'L' + pts[0][0] + ',' + H + 'Z', fill: color || 'var(--chart-1)', 'fill-opacity': '0.1', stroke: 'none' }));
    svg.appendChild(h('path', { d: line, fill: 'none', stroke: color || 'var(--chart-1)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
    return svg;
  }

  /**
   * Card with a chart and its table twin. o: { title, sub, actions, chart(), table(), legend, id }
   */
  function card(o) {
    var showTable = false;
    var body = h('div', { class: 'card-body' });
    var toggle = o.table ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm table-toggle', 'aria-pressed': 'false' }, UI.icon('list'), UI.t('chart.table')) : null;
    function draw() {
      UI.clear(body);
      if (o.legend && !showTable) body.appendChild(o.legend);
      body.appendChild(showTable ? o.table() : o.chart());
      if (toggle) {
        toggle.setAttribute('aria-pressed', String(showTable));
        UI.clear(toggle);
        toggle.appendChild(UI.icon(showTable ? 'chart-column' : 'list'));
        toggle.appendChild(document.createTextNode(showTable ? UI.t('chart.chart') : UI.t('chart.table')));
      }
    }
    if (toggle) toggle.addEventListener('click', function () { showTable = !showTable; draw(); });
    draw();
    return h('section', { class: 'card', id: o.id || null },
      h('div', { class: 'card-head' }, h('h2', null, o.title), o.sub ? h('span', { class: 'sub' }, o.sub) : null,
        h('div', { class: 'actions' }, o.actions || null, toggle)),
      body);
  }

  /** Simple table for a chart's table view. cols: [{ label, value(row), align }] */
  function miniTable(cols, rows, foot) {
    return h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { class: c.align === 'r' ? 'r' : null }, c.label); }))),
      h('tbody', null, rows.map(function (r) { return h('tr', null, cols.map(function (c) { return h('td', { class: c.align === 'r' ? 'r' : null }, c.value(r)); })); })),
      foot ? h('tfoot', null, h('tr', null, foot.map(function (v, i) { return h('td', { class: cols[i] && cols[i].align === 'r' ? 'r' : null }, v); }))) : null));
  }

  root.Charts = {
    columns: columns, stackedColumns: stackedColumns, hbars: hbars, stackBar: stackBar, sparkline: sparkline,
    card: card, miniTable: miniTable, niceTicks: niceTicks
  };
})(typeof self !== 'undefined' ? self : this);
