// Draws a chart spec with the same geometry PowerPoint uses for native charts
// (gap width, overlap, manual inner plot area, fixed axis range), so the
// canvas and the exported chart line up.
import React from 'react';
import { formatNumber } from '../lib/numfmt.js';
import { fontStack } from '../lib/textHtml.js';

const PT = 4 / 3;

function autoMax(values) {
  const m = Math.max(1, ...values.filter((v) => v != null));
  const exp = Math.floor(Math.log10(m));
  const base = 10 ** exp;
  for (const s of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * base >= m * 1.05) return s * base;
  return 10 * base;
}

function niceStep(range) {
  const raw = range / 5;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  for (const s of [1, 2, 2.5, 5, 10]) if (s * base >= raw) return s * base;
  return 10 * base;
}

function Txt({ x, y, size, color, bold, anchor = 'middle', font, children, baseline = 'central' }) {
  return (
    <text x={x} y={y} fontSize={size * PT} fill={color || '#262626'} fontWeight={bold ? 700 : 400}
      textAnchor={anchor} dominantBaseline={baseline} fontFamily={fontStack(font)}>
      {children}
    </text>
  );
}

function BarPanel({ p, box, font }) {
  const cats = p.categories || [];
  const n = Math.max(1, cats.length);
  const series = p.series || [];
  const va = p.valueAxis || {};
  const ca = p.categoryAxis || {};
  const dl = p.dataLabels || {};
  const tot = p.totals || {};
  const horiz = p.direction === 'bar';
  const plot = p.plot || { x: 0, y: 0, w: 1, h: 1 };
  const px0 = box.x + box.w * plot.x;
  const py0 = box.y + box.h * plot.y;
  const pw = box.w * plot.w;
  const ph = box.h * plot.h;
  const grouping = p.grouping || 'clustered';
  const stacked = grouping === 'stacked' || grouping === 'percentStacked';
  const isLine = p.kind === 'line';

  // values (percent stacked normalises to 1)
  const vals = series.map((s) => s.values.map((v) => (v == null ? null : Number(v))));
  if (grouping === 'percentStacked') {
    for (let i = 0; i < n; i++) {
      const sum = vals.reduce((a, s) => a + Math.abs(s[i] || 0), 0) || 1;
      vals.forEach((s) => { if (s[i] != null) s[i] /= sum; });
    }
  }
  let vmin = va.min != null ? va.min : 0;
  let vmax = va.max;
  if (vmax == null) {
    const tops = stacked ? cats.map((_, i) => vals.reduce((a, s) => a + Math.max(0, s[i] || 0), 0)) : vals.flat();
    vmax = grouping === 'percentStacked' ? 1 : autoMax(tops);
  }
  if (vmax <= vmin) vmax = vmin + 1;
  const scale = (v) => (v - vmin) / (vmax - vmin);
  const slot = (horiz ? ph : pw) / n;
  const out = [];
  const labels = [];

  // gridlines
  if (va.gridlines) {
    const step = va.majorUnit || niceStep(vmax - vmin);
    for (let v = vmin; v <= vmax + 1e-9; v += step) {
      const t = scale(v);
      if (horiz) out.push(<line key={`g${v}`} x1={px0 + pw * t} x2={px0 + pw * t} y1={py0} y2={py0 + ph} stroke={va.gridColor || '#D9D9D9'} strokeWidth={0.5 * PT} />);
      else out.push(<line key={`g${v}`} x1={px0} x2={px0 + pw} y1={py0 + ph * (1 - t)} y2={py0 + ph * (1 - t)} stroke={va.gridColor || '#D9D9D9'} strokeWidth={0.5 * PT} />);
    }
  }
  if (va.visible) {
    const step = va.majorUnit || niceStep(vmax - vmin);
    for (let v = vmin; v <= vmax + 1e-9; v += step) {
      const t = scale(v);
      const size = va.labelSize || ca.labelSize || 9;
      if (horiz) labels.push(<Txt key={`v${v}`} x={px0 + pw * t} y={py0 + ph + size * PT} size={size} color={ca.labelColor} font={font}>{formatNumber(v, va.numFmt)}</Txt>);
      else labels.push(<Txt key={`v${v}`} x={px0 - 4} y={py0 + ph * (1 - t)} size={size} color={ca.labelColor} anchor="end" font={font}>{formatNumber(v, va.numFmt)}</Txt>);
    }
  }

  const catIndex = (i) => (horiz && ca.reverse ? i : (horiz ? n - 1 - i : i));
  const slotStart = (i) => (horiz ? py0 + catIndex(i) * slot : px0 + i * slot);
  const labelColorFor = (s, i) => (s.pointLabelColors && s.pointLabelColors[i]) || s.labelColor || dl.color || '#262626';
  const hidden = (s, i) => (s.hideLabels || []).includes(i);
  const dlSize = dl.size || 9;

  if (isLine) {
    series.forEach((s, si) => {
      const points = [];
      vals[si].forEach((v, i) => {
        if (v == null) return;
        const cx = px0 + (i + 0.5) * slot;
        const cy = py0 + ph * (1 - scale(v));
        points.push([cx, cy, v, i]);
      });
      const width = (s.lineWidth || 2.25) * PT;
      out.push(<polyline key={`l${si}`} points={points.map((q) => `${q[0]},${q[1]}`).join(' ')} fill="none" stroke={s.color} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />);
      if (s.marker !== 'none') points.forEach((q) => out.push(<circle key={`m${si}-${q[3]}`} cx={q[0]} cy={q[1]} r={((s.markerSize || 6) * PT) / 2} fill={s.color} />));
      if (dl.show) {
        points.forEach((q) => {
          if (hidden(s, q[3])) return;
          labels.push(<Txt key={`dl${si}-${q[3]}`} x={q[0]} y={q[1] - ((s.markerSize || 6) * PT) / 2 - dlSize * PT * 0.75} size={dlSize} color={labelColorFor(s, q[3]) === '#FFFFFF' ? (dl.color || '#262626') : labelColorFor(s, q[3])} font={font}>{formatNumber(q[2], dl.numFmt)}</Txt>);
        });
      }
    });
  } else if (stacked) {
    const bw = slot / (1 + (p.gapWidth ?? 150) / 100);
    for (let i = 0; i < n; i++) {
      let pos = 0; let neg = 0;
      const start = slotStart(i) + (slot - bw) / 2;
      series.forEach((s, si) => {
        const v = vals[si][i];
        if (v == null || v === 0) return;
        const from = v >= 0 ? pos : neg;
        const to = from + v;
        if (v >= 0) pos = to; else neg = to;
        const a = scale(Math.min(from, to)); const b = scale(Math.max(from, to));
        const color = (s.pointColors && s.pointColors[i]) || s.color;
        let rect;
        if (horiz) rect = { x: px0 + pw * a, y: start, w: pw * (b - a), h: bw };
        else rect = { x: start, y: py0 + ph * (1 - b), w: bw, h: ph * (b - a) };
        out.push(<rect key={`b${si}-${i}`} x={rect.x} y={rect.y} width={Math.max(0, rect.w)} height={Math.max(0, rect.h)} fill={color} />);
        if (dl.show && !hidden(s, i)) {
          const raw = series[si].values[i];
          labels.push(<Txt key={`dl${si}-${i}`} x={rect.x + rect.w / 2} y={rect.y + rect.h / 2} size={dlSize} color={labelColorFor(s, i)} font={font}>{formatNumber(grouping === 'percentStacked' ? v : raw, dl.numFmt)}</Txt>);
        }
      });
      if (tot.show && !horiz && grouping === 'stacked') {
        const tv = tot.values ? tot.values[i] : pos;
        if (tv != null) {
          const y = py0 + ph * (1 - scale(Math.max(0, tv)));
          labels.push(<Txt key={`t${i}`} x={start + bw / 2} y={y - (tot.size || 10) * PT * 0.72} size={tot.size || 10} bold={tot.bold !== false} color={tot.color} font={font}>{formatNumber(tv, tot.numFmt)}</Txt>);
        }
      }
    }
  } else {
    const S = Math.max(1, series.length);
    const o = (p.overlap ?? 0) / 100;
    const g = (p.gapWidth ?? 150) / 100;
    const bw = slot / (S - (S - 1) * o + g);
    const groupW = bw * (S - (S - 1) * o);
    for (let i = 0; i < n; i++) {
      const start = slotStart(i) + (slot - groupW) / 2;
      series.forEach((s, si) => {
        const v = vals[si][i];
        if (v == null) return;
        const off = start + si * bw * (1 - o);
        const a = scale(Math.min(0, v)); const b = scale(Math.max(0, v));
        const color = (s.pointColors && s.pointColors[i]) || s.color;
        let rect;
        if (horiz) rect = { x: px0 + pw * a, y: off, w: pw * (b - a), h: bw };
        else rect = { x: off, y: py0 + ph * (1 - b), w: bw, h: ph * (b - a) };
        out.push(<rect key={`b${si}-${i}`} x={rect.x} y={rect.y} width={Math.max(0, rect.w)} height={Math.max(0, rect.h)} fill={color} />);
        if (dl.show && !hidden(s, i)) {
          const inside = dl.position === 'ctr' || dl.position === 'inEnd';
          const c = inside ? labelColorFor(s, i) : (dl.color || '#262626');
          const text = formatNumber(v, dl.numFmt);
          if (horiz) {
            const x = inside ? rect.x + rect.w / 2 : rect.x + rect.w + 3;
            labels.push(<Txt key={`dl${si}-${i}`} x={x} y={rect.y + rect.h / 2} size={dlSize} color={c} anchor={inside ? 'middle' : 'start'} font={font}>{text}</Txt>);
          } else {
            const y = inside ? rect.y + rect.h / 2 : rect.y - dlSize * PT * 0.7;
            labels.push(<Txt key={`dl${si}-${i}`} x={rect.x + rect.w / 2} y={y} size={dlSize} color={c} font={font}>{text}</Txt>);
          }
        }
      });
    }
  }

  // category axis
  if (ca.visible !== false) {
    const size = ca.labelSize || 9;
    if (ca.line) {
      if (horiz) out.push(<line key="ax" x1={px0} x2={px0} y1={py0} y2={py0 + ph} stroke={ca.lineColor || '#7F7F7F'} strokeWidth={0.75 * PT} />);
      else out.push(<line key="ax" x1={px0} x2={px0 + pw} y1={py0 + ph} y2={py0 + ph} stroke={ca.lineColor || '#7F7F7F'} strokeWidth={0.75 * PT} />);
    }
    if (horiz) {
      cats.forEach((c, i) => labels.push(<Txt key={`c${i}`} x={px0 - 5} y={slotStart(i) + slot / 2} size={size} color={ca.labelColor} anchor="end" font={font}>{c}</Txt>));
    } else {
      const rowY = py0 + ph + size * PT * 0.95;
      cats.forEach((c, i) => {
        if (c) labels.push(<Txt key={`c${i}`} x={px0 + (i + 0.5) * slot} y={rowY} size={size} color={ca.labelColor} font={font}>{c}</Txt>);
      });
      if (p.groups) {
        let idx = 0;
        const gy = rowY + size * PT * 1.25;
        p.groups.forEach((g, gi) => {
          const span = g.span || 1;
          if (g.label) labels.push(<Txt key={`g${gi}`} x={px0 + (idx + span / 2) * slot} y={gy} size={size} color={ca.labelColor} font={font}>{g.label}</Txt>);
          idx += span;
        });
      }
    }
  }
  return <g>{out}{labels}</g>;
}

function PiePanel({ p, box, font }) {
  const s = (p.series || [])[0];
  if (!s) return null;
  const plot = p.plot || { x: 0, y: 0, w: 1, h: 1 };
  const px0 = box.x + box.w * plot.x; const py0 = box.y + box.h * plot.y;
  const pw = box.w * plot.w; const ph = box.h * plot.h;
  const r = Math.min(pw, ph) / 2;
  const cx = px0 + pw / 2; const cy = py0 + ph / 2;
  const values = s.values.map((v) => Math.max(0, Number(v) || 0));
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  const hole = p.kind === 'doughnut' ? r * (p.holeSize ?? 55) / 100 : 0;
  let ang = ((p.firstSliceAngle || 0) - 90) * Math.PI / 180;
  const out = []; const labels = [];
  const dl = p.dataLabels || {};
  values.forEach((v, i) => {
    const frac = v / sum;
    const a0 = ang; const a1 = ang + frac * Math.PI * 2;
    ang = a1;
    if (frac <= 0) return;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const P = (rad, a) => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
    let d;
    if (frac >= 0.9999) {
      d = `M${cx - r},${cy} A${r},${r} 0 1 1 ${cx + r},${cy} A${r},${r} 0 1 1 ${cx - r},${cy} Z`;
      if (hole) d += ` M${cx - hole},${cy} A${hole},${hole} 0 1 0 ${cx + hole},${cy} A${hole},${hole} 0 1 0 ${cx - hole},${cy} Z`;
    } else if (hole) {
      const [x0, y0] = P(r, a0); const [x1, y1] = P(r, a1); const [x2, y2] = P(hole, a1); const [x3, y3] = P(hole, a0);
      d = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${hole},${hole} 0 ${large} 0 ${x3},${y3} Z`;
    } else {
      const [x0, y0] = P(r, a0); const [x1, y1] = P(r, a1);
      d = `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
    }
    const color = (s.pointColors && s.pointColors[i]) || s.color;
    out.push(<path key={i} d={d} fill={color} stroke="#FFFFFF" strokeWidth={PT} fillRule="evenodd" />);
    if (dl.show && p.pieLabels !== 'none' && !(s.hideLabels || []).includes(i)) {
      const mid = (a0 + a1) / 2;
      const lr = hole ? (r + hole) / 2 : r * 0.62;
      const [lx, ly] = P(lr, mid);
      const text = p.pieLabels === 'percent' ? formatNumber(frac, dl.numFmt && dl.numFmt.includes('%') ? dl.numFmt : '0%') : formatNumber(v, dl.numFmt);
      labels.push(<Txt key={`l${i}`} x={lx} y={ly} size={dl.size || 9} color={(s.pointLabelColors && s.pointLabelColors[i]) || s.labelColor || '#FFFFFF'} font={font}>{text}</Txt>);
    }
  });
  return <g>{out}{labels}</g>;
}

export default function ChartView({ spec, w, h, error }) {
  if (!spec || !spec.panels) {
    return (
      <svg width={w} height={h} className="chart-empty">
        <rect x={0.5} y={0.5} width={Math.max(0, w - 1)} height={Math.max(0, h - 1)} fill="#F5F8F9" stroke="#B7C7CB" strokeDasharray="4 3" />
        <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fontSize={13} fill="#5B6770" fontFamily="Segoe UI, sans-serif">
          {error ? 'Chart error - see Chart Design > Refresh' : 'Chart not drawn yet - Refresh'}
        </text>
      </svg>
    );
  }
  const font = spec.font || 'Interstate';
  const leg = spec.legend;
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', display: 'block' }}>
      {(spec.panels || []).map((p, i) => {
        const box = { x: w * (p.x || 0), y: h * (p.y || 0), w: w * (p.w ?? 1), h: h * (p.h ?? 1) };
        if (p.kind === 'pie' || p.kind === 'doughnut') return <PiePanel key={i} p={p} box={box} font={font} />;
        return <BarPanel key={i} p={p} box={box} font={font} />;
      })}
      {(spec.shapes || []).map((s, i) => (
        <line key={`s${i}`} x1={w * s.x1} y1={h * s.y1} x2={w * s.x2} y2={h * s.y2} stroke={s.color || '#7F7F7F'}
          strokeWidth={(s.width || 0.75) * PT} strokeDasharray={s.dash === 'dash' ? `${4 * PT} ${3 * PT}` : s.dash === 'dot' ? `${PT} ${PT}` : undefined} />
      ))}
      {leg && leg.items && (() => {
        const lx = w * (leg.x || 0); const ly = w >= 0 ? h * (leg.y || 0) : 0; const lw = w * (leg.w ?? 1); const lh = h * (leg.h || 0.08);
        const size = leg.size || 9;
        const sq = size * 0.8 * PT;
        let cursor = lx;
        return leg.items.map((it, i) => {
          const slot = it.w ? w * it.w : lw / leg.items.length;
          const sx = cursor; cursor += slot;
          return (
            <g key={`lg${i}`}>
              <rect x={sx} y={ly + (lh - sq) / 2} width={sq} height={sq} fill={it.color} />
              <Txt x={sx + sq + size * 0.4 * PT} y={ly + lh / 2} size={size} color={leg.color} anchor="start" font={font}>{it.name}</Txt>
            </g>
          );
        });
      })()}
      {(spec.texts || []).map((t, i) => {
        const x = w * t.x; const y = h * t.y; const tw = w * t.w; const th = h * t.h;
        const ax = t.align === 'r' ? x + tw : t.align === 'ctr' ? x + tw / 2 : x;
        return <Txt key={`t${i}`} x={ax} y={y + th / 2} size={t.size || 9} bold={t.bold} color={t.color} anchor={t.align === 'r' ? 'end' : t.align === 'ctr' ? 'middle' : 'start'} font={font}>{t.text}</Txt>;
      })}
    </svg>
  );
}
