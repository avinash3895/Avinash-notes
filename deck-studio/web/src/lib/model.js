// The deck model. Everything is stored in PowerPoint's own units so the
// exporter copies values straight across:
//   positions/sizes: EMU (914400 per inch, 12700 per point)
//   font sizes, spacing, line widths: points
// See docs/deck-format.md for the full description.

export const EMU_PER_IN = 914400;
export const EMU_PER_PT = 12700;
export const EMU_PER_CM = 360000;
export const EMU_PER_PX = 9525; // at 96 dpi, PowerPoint's 100% zoom
export const SLIDE_W = 12192000;
export const SLIDE_H = 6858000;

export const px = (emu) => emu / EMU_PER_PX;
export const emu = (pxv) => Math.round(pxv * EMU_PER_PX);
export const ptToPx = (pt) => (pt * 4) / 3;

export function uid(prefix = '') {
  const s = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return prefix + s;
}

export const HOUSE_THEME = {
  name: 'House',
  colors: {
    dk1: '#000000', lt1: '#FFFFFF', dk2: '#1E3A40', lt2: '#EEF3F4',
    accent1: '#00778B', accent2: '#3BAEB7', accent3: '#75E4E3', accent4: '#FFD200',
    accent5: '#5B6770', accent6: '#A7B1B7', hlink: '#00778B', folHlink: '#5B6770',
  },
  fonts: { major: 'Interstate', minor: 'Interstate' },
};

export const THEMES = [
  HOUSE_THEME,
  {
    name: 'House Deep',
    colors: {
      dk1: '#000000', lt1: '#FFFFFF', dk2: '#004F5D', lt2: '#E6F4F5',
      accent1: '#004F5D', accent2: '#00778B', accent3: '#3BAEB7', accent4: '#FFD200',
      accent5: '#75E4E3', accent6: '#5B6770', hlink: '#00778B', folHlink: '#5B6770',
    },
    fonts: { major: 'Interstate', minor: 'Interstate' },
  },
  {
    name: 'House Amber',
    colors: {
      dk1: '#000000', lt1: '#FFFFFF', dk2: '#3D3D3D', lt2: '#FFF8D6',
      accent1: '#FFD200', accent2: '#00778B', accent3: '#3BAEB7', accent4: '#75E4E3',
      accent5: '#5B6770', accent6: '#A7B1B7', hlink: '#00778B', folHlink: '#5B6770',
    },
    fonts: { major: 'Interstate', minor: 'Interstate' },
  },
  {
    name: 'Neutral',
    colors: {
      dk1: '#000000', lt1: '#FFFFFF', dk2: '#44546A', lt2: '#E7E6E6',
      accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5', accent4: '#FFC000',
      accent5: '#5B9BD5', accent6: '#70AD47', hlink: '#0563C1', folHlink: '#954F72',
    },
    fonts: { major: 'Calibri Light', minor: 'Calibri' },
  },
];

export const TEXT_DARK = '#262626';
export const TEXT_MID = '#595959';

export function defaultRun(overrides = {}) {
  return {
    text: '', font: 'Interstate', size: 18, bold: false, italic: false, underline: false,
    strike: false, color: TEXT_DARK, baseline: 0, spacing: 0, ...overrides,
  };
}

export function para(text = '', run = {}, props = {}) {
  return {
    align: 'l', level: 0, bullet: null, lineSpacing: 1.0, spaceBefore: 0, spaceAfter: 0,
    marL: 0, indent: 0, ...props, runs: [defaultRun({ ...run, text })],
  };
}

export function body(paras, props = {}) {
  return {
    anchor: 't', autofit: 'shape', wrap: true,
    insets: { l: 91440, t: 45720, r: 91440, b: 45720 },
    ...props,
    paras: paras && paras.length ? paras : [para('')],
  };
}

export function textbox(x, y, w, h, b, extra = {}) {
  return {
    id: uid('e'), type: 'shape', geom: 'rect', textbox: true, x, y, w, h, rot: 0,
    fill: null, line: null, text: b || body([para('')]), ...extra,
  };
}

export function shape(geom, x, y, w, h, theme = HOUSE_THEME, extra = {}) {
  return {
    id: uid('e'), type: 'shape', geom, x, y, w, h, rot: 0,
    fill: { color: theme.colors.accent1 }, line: null,
    text: body([para('', { color: '#FFFFFF', size: 14 }, { align: 'ctr' })], { anchor: 'ctr', autofit: 'none' }),
    ...extra,
  };
}

export function lineEl(x1, y1, x2, y2, theme = HOUSE_THEME, extra = {}) {
  return {
    id: uid('e'), type: 'line', x1, y1, x2, y2,
    line: { color: theme.colors.accent1, width: 1.5, dash: 'solid', head: 'none', tail: 'none' },
    ...extra,
  };
}

export function lineBounds(e) {
  return {
    x: Math.min(e.x1, e.x2), y: Math.min(e.y1, e.y2),
    w: Math.abs(e.x2 - e.x1), h: Math.abs(e.y2 - e.y1),
  };
}

export function bounds(e) {
  if (e.type === 'line') return lineBounds(e);
  if (e.type === 'group') return groupBounds(e.children || []);
  return { x: e.x, y: e.y, w: e.w, h: e.h };
}

export function groupBounds(children) {
  if (!children.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const c of children) {
    const b = bounds(c);
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// ---------------------------------------------------------------- tables
export function tableCell(text = '', run = {}, extra = {}) {
  return {
    text: body([para(text, { size: 14, ...run })], { autofit: 'none', anchor: 't' }),
    fill: null,
    borders: {},
    margins: { l: 91440, r: 91440, t: 45720, b: 45720 },
    anchor: 't',
    ...extra,
  };
}

export const TABLE_STYLES = [
  { id: 'house', name: 'House Teal', header: '#00778B', headerText: '#FFFFFF', band: '#E6F4F5', line: '#00778B', inner: '#B7DDE1', total: '#FFD200' },
  { id: 'light', name: 'Light Lines', header: null, headerText: '#00778B', band: null, line: '#00778B', inner: '#BFBFBF', total: null },
  { id: 'amber', name: 'Amber Header', header: '#FFD200', headerText: '#262626', band: '#FFF8D6', line: '#B39300', inner: '#E8D88A', total: '#00778B' },
  { id: 'grid', name: 'Grid', header: '#3BAEB7', headerText: '#FFFFFF', band: null, line: '#7F7F7F', inner: '#7F7F7F', total: null, grid: true },
  { id: 'plain', name: 'Plain', header: null, headerText: '#262626', band: null, line: null, inner: null, total: null },
];

export function applyTableStyle(t, styleId, opts) {
  const st = TABLE_STYLES.find((s) => s.id === styleId) || TABLE_STYLES[0];
  const o = { header: true, banded: true, firstCol: false, totalRow: false, ...(t.style || {}), ...(opts || {}) };
  t.style = { id: st.id, header: o.header, banded: o.banded, firstCol: o.firstCol, totalRow: o.totalRow };
  const nr = t.rows.length;
  const nc = t.cols.length;
  t.rows.forEach((row, r) => {
    row.cells.forEach((cell, c) => {
      const isHeader = o.header && r === 0;
      const isTotal = o.totalRow && r === nr - 1 && nr > 1;
      const bodyIndex = r - (o.header ? 1 : 0);
      let fill = null;
      let color = '#262626';
      let bold = false;
      if (isHeader) {
        fill = st.header; color = st.headerText; bold = true;
      } else if (isTotal) {
        fill = st.total; bold = true;
        color = st.total ? (st.total === '#00778B' ? '#FFFFFF' : '#262626') : '#262626';
      } else if (o.banded && st.band && bodyIndex % 2 === 0) {
        fill = st.band;
      }
      if (o.firstCol && c === 0 && !isHeader) bold = true;
      cell.fill = fill ? { color: fill } : null;
      const b = {};
      const thin = (color2) => (color2 ? { color: color2, width: 0.75 } : null);
      if (st.grid) {
        b.l = thin(st.inner); b.r = thin(st.inner); b.t = thin(st.inner); b.b = thin(st.inner);
      } else {
        b.t = r === 0 ? thin(st.line) : (isTotal ? { color: st.line || '#7F7F7F', width: 1.5 } : null);
        b.b = r === nr - 1 ? thin(st.line) : thin(st.inner);
        if (isHeader && st.line) b.b = { color: st.line, width: 1.5 };
      }
      cell.borders = b;
      for (const p of cell.text.paras) for (const run of p.runs) { run.color = color; run.bold = bold; }
    });
  });
  void nc;
  return t;
}

export function table(rows, cols, x, y, w, rowH = 370840) {
  const colW = Math.round(w / cols);
  const t = {
    id: uid('e'), type: 'table', x, y, w: colW * cols, h: rowH * rows, rot: 0,
    cols: Array.from({ length: cols }, () => colW),
    rows: Array.from({ length: rows }, () => ({ h: rowH, cells: Array.from({ length: cols }, () => tableCell('')) })),
  };
  applyTableStyle(t, 'house', { header: true, banded: true });
  return t;
}

// ----------------------------------------------------------------- charts
export function chartEl(chartType, x, y, w, h, extra = {}) {
  return {
    id: uid('e'), type: 'chart', chartType, x, y, w, h, rot: 0,
    link: null, // { source, sheet, table }
    data: null, // { columns, rows } last values read from Excel (or sample)
    settings: {}, // overrides of the chart file's SETTINGS
    spec: null,
    ...extra,
  };
}

// ------------------------------------------------------------ house deck
const IN = EMU_PER_IN;

function placeholder(kind, x, y, w, h, b, prompt) {
  return textbox(x, y, w, h, b, { placeholder: kind, prompt, name: kind[0].toUpperCase() + kind.slice(1) });
}

function titleBody(size = 28) {
  return body([para('', { size, bold: true, color: '#00778B' })], { autofit: 'none', anchor: 'b' });
}

export function defaultLayouts() {
  const W = SLIDE_W;
  return [
    {
      id: 'title', name: 'Title Slide',
      elements: [
        { ...shape('rect', 0, 0, Math.round(0.28 * IN), SLIDE_H), fill: { color: '#00778B' }, text: null, name: 'Accent bar' },
        placeholder('title', Math.round(0.9 * IN), Math.round(2.3 * IN), W - Math.round(2.2 * IN), Math.round(1.5 * IN),
          body([para('', { size: 40, bold: true, color: '#00778B' })], { anchor: 'b', autofit: 'none' }), 'Click to add title'),
        placeholder('subtitle', Math.round(0.9 * IN), Math.round(3.95 * IN), W - Math.round(2.2 * IN), Math.round(0.9 * IN),
          body([para('', { size: 20, color: TEXT_MID })], { anchor: 't', autofit: 'none' }), 'Click to add subtitle'),
        { ...lineEl(Math.round(0.95 * IN), Math.round(3.88 * IN), Math.round(2.4 * IN), Math.round(3.88 * IN)), line: { color: '#FFD200', width: 3, dash: 'solid', head: 'none', tail: 'none' }, name: 'Amber rule' },
      ],
      hideMaster: true,
    },
    {
      id: 'content', name: 'Title and Content',
      elements: [
        placeholder('title', Math.round(0.5 * IN), Math.round(0.3 * IN), W - IN, Math.round(0.9 * IN), titleBody(), 'Click to add title'),
        placeholder('body', Math.round(0.5 * IN), Math.round(1.4 * IN), W - IN, Math.round(5.1 * IN),
          body([para('', { size: 18 }, { bullet: { type: 'char', char: '•' }, marL: 228600, indent: -228600, spaceBefore: 6 })], { autofit: 'none' }),
          'Click to add text'),
      ],
    },
    {
      id: 'titleonly', name: 'Title Only',
      elements: [placeholder('title', Math.round(0.5 * IN), Math.round(0.3 * IN), W - IN, Math.round(0.9 * IN), titleBody(), 'Click to add title')],
    },
    {
      id: 'two', name: 'Two Content',
      elements: [
        placeholder('title', Math.round(0.5 * IN), Math.round(0.3 * IN), W - IN, Math.round(0.9 * IN), titleBody(), 'Click to add title'),
        placeholder('body', Math.round(0.5 * IN), Math.round(1.4 * IN), Math.round(6 * IN), Math.round(5.1 * IN),
          body([para('', { size: 16 }, { bullet: { type: 'char', char: '•' }, marL: 228600, indent: -228600, spaceBefore: 6 })], { autofit: 'none' }), 'Click to add text'),
        placeholder('body', Math.round(6.83 * IN), Math.round(1.4 * IN), Math.round(6 * IN), Math.round(5.1 * IN),
          body([para('', { size: 16 }, { bullet: { type: 'char', char: '•' }, marL: 228600, indent: -228600, spaceBefore: 6 })], { autofit: 'none' }), 'Click to add text'),
      ],
    },
    {
      id: 'section', name: 'Section Header', background: '#00778B', hideMaster: true,
      elements: [
        placeholder('title', Math.round(0.9 * IN), Math.round(2.6 * IN), W - Math.round(2 * IN), Math.round(1.3 * IN),
          body([para('', { size: 36, bold: true, color: '#FFFFFF' })], { anchor: 'b', autofit: 'none' }), 'Click to add section title'),
        placeholder('subtitle', Math.round(0.9 * IN), Math.round(4.05 * IN), W - Math.round(2 * IN), Math.round(0.8 * IN),
          body([para('', { size: 18, color: '#75E4E3' })], { anchor: 't', autofit: 'none' }), 'Click to add text'),
      ],
    },
    { id: 'blank', name: 'Blank', elements: [] },
  ];
}

export function defaultMaster() {
  return {
    background: '#FFFFFF',
    elements: [
      { ...lineEl(Math.round(0.5 * IN), Math.round(7.05 * IN), SLIDE_W - Math.round(0.5 * IN), Math.round(7.05 * IN)), line: { color: '#00778B', width: 0.75, dash: 'solid', head: 'none', tail: 'none' }, name: 'Footer rule' },
      textbox(SLIDE_W - Math.round(1.5 * IN), Math.round(7.08 * IN), IN, Math.round(0.3 * IN),
        body([para('', { size: 9, color: TEXT_MID }, { align: 'r' })], { autofit: 'none' }), { name: 'Slide number' }),
    ].map((e, i) => {
      if (i === 1) e.text.paras[0].runs = [defaultRun({ text: '#', field: 'slidenum', size: 9, color: TEXT_MID })];
      return e;
    }),
  };
}

export function slideFromLayout(layout) {
  const clone = JSON.parse(JSON.stringify(layout.elements || []));
  const reid = (list) => list.forEach((e) => { e.id = uid('e'); if (e.children) reid(e.children); });
  reid(clone);
  return {
    id: uid('s'), layout: layout.id, elements: clone, notes: '', hidden: false,
    background: layout.background || null, hideMaster: !!layout.hideMaster,
  };
}

export function newDeck(name = 'Untitled deck') {
  const layouts = defaultLayouts();
  const first = slideFromLayout(layouts[0]);
  return {
    format: 'deck-studio', version: 1, id: uid('d'), name,
    size: { w: SLIDE_W, h: SLIDE_H },
    theme: JSON.parse(JSON.stringify(HOUSE_THEME)),
    master: defaultMaster(),
    layouts,
    slides: [first],
    links: { sources: {} },
    created: Date.now(),
  };
}

// Find an element anywhere in a list (descends into groups)
export function findIn(list, id) {
  for (const e of list || []) {
    if (e.id === id) return e;
    if (e.children) {
      const f = findIn(e.children, id);
      if (f) return f;
    }
  }
  return null;
}

export function isEmptyBody(b) {
  if (!b) return true;
  return b.paras.every((p) => p.runs.every((r) => !r.text && !r.field));
}

export function walkElements(list, fn) {
  for (const e of list || []) {
    fn(e);
    if (e.children) walkElements(e.children, fn);
  }
}

export function allSurfaces(deck) {
  const out = [];
  deck.slides.forEach((s) => out.push({ kind: 'slide', id: s.id, elements: s.elements }));
  out.push({ kind: 'master', id: 'master', elements: deck.master.elements });
  (deck.layouts || []).forEach((l) => out.push({ kind: 'layout', id: l.id, elements: l.elements }));
  return out;
}

export function cloneElements(list) {
  const copy = JSON.parse(JSON.stringify(list));
  const reid = (l) => l.forEach((e) => { e.id = uid('e'); if (e.children) reid(e.children); });
  reid(copy);
  return copy;
}

export function moveElement(e, dx, dy) {
  if (e.type === 'line') { e.x1 += dx; e.x2 += dx; e.y1 += dy; e.y2 += dy; return; }
  if (e.type === 'group') { e.children.forEach((c) => moveElement(c, dx, dy)); return; }
  e.x += dx; e.y += dy;
}

// Scale an element from an old bounding box into a new one
export function fitElement(e, from, to) {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  const mx = (v) => Math.round(to.x + (v - from.x) * sx);
  const my = (v) => Math.round(to.y + (v - from.y) * sy);
  if (e.type === 'line') { e.x1 = mx(e.x1); e.x2 = mx(e.x2); e.y1 = my(e.y1); e.y2 = my(e.y2); return; }
  if (e.type === 'group') { e.children.forEach((c) => fitElement(c, from, to)); return; }
  const nx = mx(e.x); const ny = my(e.y);
  const nw = Math.max(1, Math.round(e.w * sx)); const nh = Math.max(1, Math.round(e.h * sy));
  if (e.type === 'table') {
    e.cols = e.cols.map((c) => Math.max(1, Math.round(c * sx)));
    e.rows.forEach((r) => { r.h = Math.max(1, Math.round(r.h * sy)); });
  }
  e.x = nx; e.y = ny; e.w = nw; e.h = nh;
}

export function units(emuV, unit = 'cm') {
  if (unit === 'in') return (emuV / EMU_PER_IN).toFixed(2) + '"';
  return (emuV / EMU_PER_CM).toFixed(2) + ' cm';
}
