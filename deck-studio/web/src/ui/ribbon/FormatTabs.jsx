import React from 'react';
import { useStore, getState, setUI, openDialog, selectedElements, updateSelected, updateElement, toast } from '../../lib/store.js';
import * as A from '../../lib/actions.js';
import { EMU_PER_CM, EMU_PER_IN, TABLE_STYLES, applyTableStyle, tableCell, bounds, fitElement } from '../../lib/model.js';
import { SHAPES } from '../../lib/geom.js';
import { refreshLinks, renderCharts } from '../../lib/data.js';
import {
  RibbonGroup, BigButton, SmallButton, Row, Col, ColorButton, NumberField, Check, Gallery,
} from '../controls.jsx';
import {
  IShapesBig, IFill, ILine, ITextColor, IWeight, IDashes, IToFront, IBackward, IArrange, IGroup, IRotR, ILock, IUnlock, IWrap,
  IChart, IRefresh, ILink, ICode, ISettings, IRowAbove, IRowBelow, IColLeft, IColRight, IDelRow, IDelCol, IDelTable,
  IDistRows, IDistCols, IAlignL, IAlignC, IAlignR, IAnchorT, IAnchorM, IAnchorB, IBorderAll, IBorderOut, IBorderIn, IBorderT,
  IBorderB, IBorderL, IBorderR, IBorderNone, ITableSettings, IImage, IArrowRight,
} from '../icons.js';
import { ShapeGallery, ShapeIcon, arrangeItems } from './shared.jsx';
import { useFormatState } from './HomeTab.jsx';

const QUICK_STYLES = [
  { id: 'q1', fill: '#00778B', line: null, text: '#FFFFFF' },
  { id: 'q2', fill: '#3BAEB7', line: null, text: '#FFFFFF' },
  { id: 'q3', fill: '#75E4E3', line: null, text: '#262626' },
  { id: 'q4', fill: '#FFD200', line: null, text: '#262626' },
  { id: 'q5', fill: '#FFFFFF', line: { color: '#00778B', width: 1.5 }, text: '#00778B' },
  { id: 'q6', fill: '#E6F4F5', line: null, text: '#00778B' },
  { id: 'q7', fill: null, line: { color: '#00778B', width: 1, dash: 'dash' }, text: '#262626' },
  { id: 'q8', fill: '#1E3A40', line: null, text: '#FFFFFF' },
];

function unitVal(emuV, units) {
  return emuV / (units === 'in' ? EMU_PER_IN : EMU_PER_CM);
}
function toEmu(v, units) {
  return Math.round(v * (units === 'in' ? EMU_PER_IN : EMU_PER_CM));
}

export function SizeGroup() {
  const sel = useStore((s) => s.ui.selection);
  useStore((s) => s.rev);
  const units = useStore((s) => s.ui.units);
  const els = selectedElements();
  const one = els.length === 1 ? els[0] : null;
  const b = one ? bounds(one) : null;
  const setDim = (key, v) => {
    if (!one) return;
    const nb = { ...bounds(one) };
    const val = toEmu(v, units);
    if (one.lockAspect && b.w && b.h) {
      if (key === 'w') { nb.h = Math.round(val * b.h / b.w); nb.w = val; } else { nb.w = Math.round(val * b.w / b.h); nb.h = val; }
    } else nb[key] = val;
    updateElement(one.id, (e) => { fitElement(e, bounds(e), nb); if (e.text && e.text.autofit === 'shape' && key === 'h') e.text.autofit = 'none'; });
    if (one.type === 'chart') renderCharts([{ id: one.id }]);
  };
  void sel;
  return (
    <RibbonGroup label="Size" onLauncher={() => openDialog('formatPane')}>
      <Col>
        <NumberField label="Height" value={b ? unitVal(b.h, units) : ''} suffix={units === 'in' ? '"' : 'cm'} step={units === 'in' ? 0.1 : 0.25} min={0.05} onChange={(v) => setDim('h', v)} />
        <NumberField label="Width" value={b ? unitVal(b.w, units) : ''} suffix={units === 'in' ? '"' : 'cm'} step={units === 'in' ? 0.1 : 0.25} min={0.05} onChange={(v) => setDim('w', v)} />
        <Row>
          <NumberField label="Rotate" value={one && one.rot != null ? one.rot : (one ? 0 : '')} suffix="°" step={1} decimals={0} width={58} onChange={(v) => updateSelected((e) => { if (e.type === 'shape' || e.type === 'image') e.rot = ((v % 360) + 360) % 360; })} />
          <SmallButton icon={one && one.lockAspect ? ILock : IUnlock} iconOnly title="Lock aspect ratio" active={!!(one && one.lockAspect)} disabled={!one}
            onClick={() => updateSelected((e) => { e.lockAspect = !e.lockAspect; })} />
        </Row>
      </Col>
    </RibbonGroup>
  );
}

function ArrangeGroup() {
  useStore((s) => s.ui.selection);
  return (
    <RibbonGroup label="Arrange">
      <Col>
        <SmallButton icon={IToFront} label="Bring Forward" split onClick={() => A.order('forward')} menu={[
          { label: 'Bring Forward', run: () => A.order('forward') }, { label: 'Bring to Front', run: () => A.order('front') }]} />
        <SmallButton icon={IBackward} label="Send Backward" split onClick={() => A.order('backward')} menu={[
          { label: 'Send Backward', run: () => A.order('backward') }, { label: 'Send to Back', run: () => A.order('back') }]} />
        <SmallButton icon={IArrange} label="Selection" menu={arrangeItems()} />
      </Col>
      <Col>
        <SmallButton icon={IGroup} label="Group" menu={arrangeItems().filter((x) => x.label === 'Group' || x.label === 'Ungroup')} />
        <SmallButton icon={IAlignL} label="Align" menu={arrangeItems().find((x) => x.label === 'Align').submenu} />
        <SmallButton icon={IRotR} label="Rotate" menu={arrangeItems().find((x) => x.label === 'Rotate').submenu} />
      </Col>
    </RibbonGroup>
  );
}

const WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];
const DASHES = [['solid', 'Solid'], ['sysDash', 'Square Dot'], ['dot', 'Round Dot'], ['dash', 'Dash'], ['dashDot', 'Dash Dot'], ['lgDash', 'Long Dash']];
const ENDS = [['none', 'None'], ['triangle', 'Triangle'], ['arrow', 'Open Arrow'], ['oval', 'Oval'], ['diamond', 'Diamond']];

function setLine(props) {
  updateSelected((e) => {
    if (e.type === 'line') Object.assign(e.line, props);
    else if (e.type === 'shape' || e.type === 'image') e.line = { color: '#00778B', width: 1, dash: 'solid', ...(e.line || {}), ...props };
  });
}

export function ShapeFormatTab() {
  const sel = useStore((s) => s.ui.selection);
  useStore((s) => s.rev);
  const { run } = useFormatState();
  const els = selectedElements();
  const first = els[0] || {};
  const hasLine = els.some((e) => e.type === 'line');
  const shapes = els.filter((e) => e.type === 'shape');
  const textShapes = shapes.filter((e) => e.text);
  const isImage = els.length === 1 && first.type === 'image';
  void sel;
  return (
    <>
      <RibbonGroup label="Insert Shapes">
        <BigButton icon={IShapesBig} label="Shapes" menu={(close) => <ShapeGallery onClose={close} />} />
        <Col>
          <SmallButton label="Change Shape" disabled={!shapes.length} menu={(close) => (
            <div className="shape-gallery"><div className="sg-grid">
              {SHAPES.map((s) => <button key={s.id} title={s.name} onClick={() => { updateSelected((e) => { if (e.type === 'shape' && !e.textbox) { e.geom = s.id; e.adj = null; } }); close(); }}><ShapeIcon geom={s.id} /></button>)}
            </div></div>
          )}><ShapeIcon geom={first.geom || 'rect'} size={16} /></SmallButton>
          {isImage && <SmallButton icon={IImage} label="Crop..." onClick={() => openDialog('crop', { id: first.id })} />}
          {isImage && <SmallButton icon={IImage} label="Reset Size" onClick={() => {
            const img = new Image();
            img.onload = () => updateElement(first.id, (e) => { e.h = Math.round(e.w * img.naturalHeight / img.naturalWidth); e.crop = null; });
            img.src = first.src;
          }} />}
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Shape Styles" onLauncher={() => openDialog('formatPane')}>
        <Gallery columns={4} items={QUICK_STYLES} onPick={(q) => updateSelected((e) => {
          if (e.type === 'shape') {
            e.fill = q.fill ? { color: q.fill } : null; e.line = q.line ? { dash: 'solid', ...q.line } : null;
            if (e.text) e.text.paras.forEach((p) => p.runs.forEach((r) => { r.color = q.text; }));
          }
          if (e.type === 'line' && q.line) Object.assign(e.line, q.line);
        })} render={(q) => (
          <span className="qs" style={{ background: q.fill || 'transparent', border: q.line ? `1.5px ${q.line.dash === 'dash' ? 'dashed' : 'solid'} ${q.line.color}` : '1px solid transparent', color: q.text }}>Abc</span>
        )} />
        <Col>
          <ColorButton icon={IFill} label="Shape Fill" color={first.fill?.color} allowNone disabled={!shapes.length && !isImage}
            onPick={(c) => updateSelected((e) => { if (e.type === 'shape' || e.type === 'image') e.fill = c ? { color: c, alpha: e.fill?.alpha } : null; })}
            extra={(close) => (
              <div className="menu-custom pad">
                <NumberField label="Transparency" suffix="%" decimals={0} step={5} min={0} max={100} width={70}
                  value={first.fill && first.fill.alpha != null ? Math.round((1 - first.fill.alpha) * 100) : 0}
                  onChange={(v) => { updateSelected((e) => { if (e.fill) e.fill.alpha = Math.round((1 - v / 100) * 100) / 100; }); close(); }} />
              </div>
            )} />
          <ColorButton icon={ILine} label="Shape Outline" color={first.line?.color} allowNone={!hasLine} noneLabel="No Outline"
            onPick={(c) => (c ? setLine({ color: c }) : updateSelected((e) => { if (e.type !== 'line') e.line = null; }))}
            extra={(close) => (
              <div className="menu-custom">
                <SmallButton icon={IWeight} label="Weight" menu={WEIGHTS.map((w) => ({ label: `${w} pt`, checked: first.line && first.line.width === w, run: () => { setLine({ width: w }); close(); } }))} />
                <SmallButton icon={IDashes} label="Dashes" menu={DASHES.map(([id, n]) => ({ label: n, checked: first.line && (first.line.dash || 'solid') === id, run: () => { setLine({ dash: id }); close(); } }))} />
                {hasLine && <SmallButton icon={IArrowRight} label="Arrows" menu={[
                  { header: 'End arrow' }, ...ENDS.map(([id, n]) => ({ label: n, checked: (first.line?.tail || 'none') === id, run: () => { setLine({ tail: id }); close(); } })),
                  { header: 'Start arrow' }, ...ENDS.map(([id, n]) => ({ label: n, checked: (first.line?.head || 'none') === id, run: () => { setLine({ head: id }); close(); } })),
                ]} />}
              </div>
            )} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Text" onLauncher={() => openDialog('formatPane', { tab: 'text' })}>
        <Col>
          <ColorButton icon={ITextColor} label="Text Fill" color={run.color || '#262626'} onPick={(c) => c && A.formatRun({ color: c })} />
          <SmallButton label="Autofit" disabled={!textShapes.length} menu={[
            { label: 'Do not Autofit', checked: first.text && first.text.autofit === 'none', run: () => A.setBodyProps({ autofit: 'none' }) },
            { label: 'Resize shape to fit text', checked: first.text && first.text.autofit === 'shape', run: () => A.setBodyProps({ autofit: 'shape' }) },
          ]} />
          <SmallButton icon={IWrap} label="Wrap Text" active={first.text && first.text.wrap !== false} disabled={!textShapes.length}
            onClick={() => A.setBodyProps({ wrap: !(first.text && first.text.wrap !== false) })} />
        </Col>
      </RibbonGroup>
      <ArrangeGroup />
      <SizeGroup />
    </>
  );
}

// ---------------------------------------------------------------- charts
export function ChartDesignTab() {
  const sel = useStore((s) => s.ui.selection);
  const charts = useStore((s) => s.charts);
  const deck = useStore((s) => s.deck);
  useStore((s) => s.rev);
  const el = selectedElements().find((e) => e.type === 'chart');
  if (!el) return null;
  const src = el.link ? deck.links.sources[el.link.source] : null;
  const file = src ? src.path.split(/[\\/]/).pop() : null;
  void sel;
  return (
    <>
      <RibbonGroup label="Type">
        <BigButton icon={IChart} label="Change Chart Type" menu={charts.map((c) => ({
          label: c.title, checked: c.name === el.chartType,
          run: async () => { updateElement(el.id, (e) => { e.chartType = c.name; e.settings = {}; }); await renderCharts([{ id: el.id }], { silent: true }); },
        }))} />
      </RibbonGroup>
      <RibbonGroup label="Chart">
        <BigButton icon={ISettings} label="Chart Settings" onClick={() => openDialog('chartSettings', { id: el.id })} title="Spacing, colours, bar size and labels" />
        <BigButton icon={ICode} label="Edit Chart Code" onClick={() => openChartEditor(el.chartType)} />
      </RibbonGroup>
      <RibbonGroup label="Data">
        <BigButton icon={ILink} label={el.link ? 'Change Data Link' : 'Link to Excel'} onClick={() => openDialog('chartData', { id: el.id })} />
        <BigButton icon={IRefresh} label="Refresh" disabled={!el.link} onClick={() => refreshLinks([getState().ui.slideId])} />
        <div className="chart-link-info">
          {el.link ? (
            <>
              <div className="cli-file" title={src && src.path}>{file}</div>
              <div className="cli-path">{el.link.sheet} › {el.link.table}</div>
              {el.refreshed && <div className="cli-time">Refreshed {new Date(el.refreshed).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</div>}
            </>
          ) : <div className="cli-path">{el.data ? 'Static values (not linked)' : 'Using sample data'}</div>}
          {el.error && <div className="cli-error" title={el.error}>{el.error}</div>}
          {el.source === 'testing' && <div className="cli-testing">Drawn with TESTING code</div>}
        </div>
      </RibbonGroup>
      <ArrangeGroup />
      <SizeGroup />
    </>
  );
}

export function openChartEditor(name) {
  const w = window.open(`${location.origin}/?view=chart-editor&name=${encodeURIComponent(name)}`, `chart-${name}`, 'popup=yes,width=1380,height=880');
  if (!w) toast('Chrome blocked the new window. Allow pop-ups for Deck Studio and try again.', { kind: 'warn' });
}

// ---------------------------------------------------------------- tables
export function tableRange(t) {
  const u = getState().ui;
  if (u.cellSel && u.cellSel.id === t.id) {
    const s = u.cellSel;
    return { r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2), c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2), explicit: true };
  }
  if (u.editing && u.editing.id === t.id && u.editing.cell) {
    const [r, c] = u.editing.cell;
    return { r1: r, r2: r, c1: c, c2: c, explicit: true };
  }
  return { r1: 0, r2: t.rows.length - 1, c1: 0, c2: t.cols.length - 1, explicit: false };
}

function forCells(fn) {
  const t = selectedElements().find((e) => e.type === 'table');
  if (!t) return;
  const rg = tableRange(t);
  updateElement(t.id, (e) => {
    for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) fn(e.rows[r].cells[c], r, c, e, rg);
  });
}

function applyBorders(kind, pen) {
  const t = selectedElements().find((e) => e.type === 'table');
  if (!t) return;
  const rg = tableRange(t);
  updateElement(t.id, (e) => {
    const set = (r, c, side, v) => {
      const cell = e.rows[r] && e.rows[r].cells[c];
      if (!cell) return;
      cell.borders = { ...(cell.borders || {}), [side]: v };
      // keep the neighbour's shared edge in step so PowerPoint draws one line
      const nb = { l: [r, c - 1, 'r'], r: [r, c + 1, 'l'], t: [r - 1, c, 'b'], b: [r + 1, c, 't'] }[side];
      const n = e.rows[nb[0]] && e.rows[nb[0]].cells[nb[1]];
      if (n) n.borders = { ...(n.borders || {}), [nb[2]]: v };
    };
    for (let r = rg.r1; r <= rg.r2; r++) {
      for (let c = rg.c1; c <= rg.c2; c++) {
        const edge = { t: r === rg.r1, b: r === rg.r2, l: c === rg.c1, r: c === rg.c2 };
        const v = kind === 'none' ? null : pen;
        if (kind === 'all' || kind === 'none') ['l', 'r', 't', 'b'].forEach((s) => set(r, c, s, v));
        if (kind === 'outside') ['l', 'r', 't', 'b'].forEach((s) => { if (edge[s]) set(r, c, s, v); });
        if (kind === 'inside') ['l', 'r', 't', 'b'].forEach((s) => { if (!edge[s]) set(r, c, s, v); });
        if (['t', 'b', 'l', 'r'].includes(kind) && edge[kind]) set(r, c, kind, v);
        if (kind === 'insideH') ['t', 'b'].forEach((s) => { if (!edge[s]) set(r, c, s, v); });
        if (kind === 'insideV') ['l', 'r'].forEach((s) => { if (!edge[s]) set(r, c, s, v); });
      }
    }
  });
}

export function TableDesignTab() {
  useStore((s) => s.rev);
  useStore((s) => s.ui.cellSel);
  useStore((s) => s.ui.editing);
  const pen = useStore((s) => s.ui.pen) || { color: '#00778B', width: 1 };
  const t = selectedElements().find((e) => e.type === 'table');
  if (!t) return null;
  const st = t.style || {};
  const setOpt = (k, v) => updateElement(t.id, (e) => applyTableStyle(e, (e.style && e.style.id) || 'house', { [k]: v }));
  return (
    <>
      <RibbonGroup label="Table Style Options">
        <Col>
          <Check label="Header Row" checked={st.header} onChange={(v) => setOpt('header', v)} />
          <Check label="Total Row" checked={st.totalRow} onChange={(v) => setOpt('totalRow', v)} />
        </Col>
        <Col>
          <Check label="Banded Rows" checked={st.banded} onChange={(v) => setOpt('banded', v)} />
          <Check label="First Column" checked={st.firstCol} onChange={(v) => setOpt('firstCol', v)} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Table Styles" className="wide">
        <Gallery columns={5} items={TABLE_STYLES.map((s) => ({ ...s, active: s.id === st.id }))} onPick={(s) => updateElement(t.id, (e) => applyTableStyle(e, s.id))}
          render={(s) => (
            <span className="ts-prev" title={s.name}>
              {[0, 1, 2, 3].map((r) => (
                <i key={r} style={{
                  background: r === 0 ? (s.header || 'transparent') : (s.band && r % 2 === 1 ? s.band : 'transparent'),
                  borderBottom: `1px solid ${r === 0 ? (s.line || '#ccc') : (s.inner || 'transparent')}`,
                  borderLeft: s.grid ? `1px solid ${s.inner}` : undefined,
                }} />
              ))}
            </span>
          )} />
        <Col>
          <ColorButton icon={IFill} label="Shading" color={tableRange(t).explicit ? undefined : undefined} allowNone noneLabel="No Fill"
            onPick={(c) => forCells((cell) => { cell.fill = c ? { color: c } : null; })} />
          <SmallButton icon={IBorderAll} label="Borders" menu={[
            { label: 'Bottom Border', icon: IBorderB, run: () => applyBorders('b', pen) },
            { label: 'Top Border', icon: IBorderT, run: () => applyBorders('t', pen) },
            { label: 'Left Border', icon: IBorderL, run: () => applyBorders('l', pen) },
            { label: 'Right Border', icon: IBorderR, run: () => applyBorders('r', pen) },
            { divider: true },
            { label: 'No Border', icon: IBorderNone, run: () => applyBorders('none', pen) },
            { label: 'All Borders', icon: IBorderAll, run: () => applyBorders('all', pen) },
            { label: 'Outside Borders', icon: IBorderOut, run: () => applyBorders('outside', pen) },
            { label: 'Inside Borders', icon: IBorderIn, run: () => applyBorders('inside', pen) },
            { label: 'Inside Horizontal Border', icon: IBorderIn, run: () => applyBorders('insideH', pen) },
            { label: 'Inside Vertical Border', icon: IBorderIn, run: () => applyBorders('insideV', pen) },
          ]} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Draw Borders">
        <Col>
          <ColorButton icon={ILine} label="Pen Colour" color={pen.color} onPick={(c) => c && setUI({ pen: { ...pen, color: c } })} />
          <SmallButton icon={IWeight} label={`Pen Weight: ${pen.width} pt`} menu={WEIGHTS.map((w) => ({ label: `${w} pt`, checked: pen.width === w, run: () => setUI({ pen: { ...pen, width: w } }) }))} />
          <div className="hint-small">Select cells, then choose Borders</div>
        </Col>
      </RibbonGroup>
    </>
  );
}

function insertRows(where) {
  const t = selectedElements().find((e) => e.type === 'table');
  if (!t) return;
  const rg = tableRange(t);
  updateElement(t.id, (e) => {
    const at = where === 'above' ? rg.r1 : rg.r2 + 1;
    const proto = e.rows[where === 'above' ? rg.r1 : rg.r2];
    const row = { h: proto.h, cells: proto.cells.map((c) => ({ ...JSON.parse(JSON.stringify(c)), text: { ...c.text, paras: [{ ...JSON.parse(JSON.stringify(c.text.paras[0])), runs: [{ ...c.text.paras[0].runs[0], text: '' }] }] } })) };
    e.rows.splice(at, 0, row);
    e.h += proto.h;
    if (e.style) applyTableStyle(e, e.style.id);
  });
}

function insertCols(where) {
  const t = selectedElements().find((e) => e.type === 'table');
  if (!t) return;
  const rg = tableRange(t);
  updateElement(t.id, (e) => {
    const at = where === 'left' ? rg.c1 : rg.c2 + 1;
    const src = where === 'left' ? rg.c1 : rg.c2;
    const w = e.cols[src];
    e.cols.splice(at, 0, w);
    e.rows.forEach((row) => {
      const c = row.cells[src];
      row.cells.splice(at, 0, { ...JSON.parse(JSON.stringify(c)), text: { ...c.text, paras: [{ ...JSON.parse(JSON.stringify(c.text.paras[0])), runs: [{ ...c.text.paras[0].runs[0], text: '' }] }] } });
    });
    e.w += w;
    if (e.style) applyTableStyle(e, e.style.id);
  });
}

function deleteRows() {
  const t = selectedElements().find((e) => e.type === 'table');
  if (!t) return;
  const rg = tableRange(t);
  if (rg.r2 - rg.r1 + 1 >= t.rows.length) { A.deleteSelected(); return; }
  setUI({ editing: null, cellSel: null });
  updateElement(t.id, (e) => {
    const removed = e.rows.splice(rg.r1, rg.r2 - rg.r1 + 1);
    e.h -= removed.reduce((a, r) => a + r.h, 0);
    if (e.style) applyTableStyle(e, e.style.id);
  });
}

function deleteCols() {
  const t = selectedElements().find((e) => e.type === 'table');
  if (!t) return;
  const rg = tableRange(t);
  if (rg.c2 - rg.c1 + 1 >= t.cols.length) { A.deleteSelected(); return; }
  setUI({ editing: null, cellSel: null });
  updateElement(t.id, (e) => {
    const n = rg.c2 - rg.c1 + 1;
    const removed = e.cols.splice(rg.c1, n);
    e.rows.forEach((row) => row.cells.splice(rg.c1, n));
    e.w -= removed.reduce((a, b) => a + b, 0);
  });
}

export function TableLayoutTab() {
  useStore((s) => s.rev);
  useStore((s) => s.ui.cellSel);
  useStore((s) => s.ui.editing);
  const units = useStore((s) => s.ui.units);
  const t = selectedElements().find((e) => e.type === 'table');
  if (!t) return null;
  const rg = tableRange(t);
  const rowH = t.rows[rg.r1].h; const colW = t.cols[rg.c1];
  const cell = t.rows[rg.r1].cells[rg.c1];
  const setMargins = (m) => forCells((c) => { c.margins = m; });
  return (
    <>
      <RibbonGroup label="Table">
        <BigButton icon={ITableSettings} label="Select" menu={[
          { label: 'Select Cell', run: () => setUI({ cellSel: { id: t.id, r1: rg.r1, c1: rg.c1, r2: rg.r1, c2: rg.c1 }, editing: null }) },
          { label: 'Select Row', run: () => setUI({ cellSel: { id: t.id, r1: rg.r1, c1: 0, r2: rg.r2, c2: t.cols.length - 1 }, editing: null }) },
          { label: 'Select Column', run: () => setUI({ cellSel: { id: t.id, r1: 0, c1: rg.c1, r2: t.rows.length - 1, c2: rg.c2 }, editing: null }) },
          { label: 'Select Table', run: () => setUI({ cellSel: { id: t.id, r1: 0, c1: 0, r2: t.rows.length - 1, c2: t.cols.length - 1 }, editing: null }) },
        ]} />
      </RibbonGroup>
      <RibbonGroup label="Rows & Columns">
        <BigButton icon={IDelTable} label="Delete" menu={[
          { label: 'Delete Columns', icon: IDelCol, run: deleteCols },
          { label: 'Delete Rows', icon: IDelRow, run: deleteRows },
          { label: 'Delete Table', icon: IDelTable, run: A.deleteSelected },
        ]} />
        <BigButton icon={IRowAbove} label="Insert Above" onClick={() => insertRows('above')} />
        <Col>
          <SmallButton icon={IRowBelow} label="Insert Below" onClick={() => insertRows('below')} />
          <SmallButton icon={IColLeft} label="Insert Left" onClick={() => insertCols('left')} />
          <SmallButton icon={IColRight} label="Insert Right" onClick={() => insertCols('right')} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Cell Size">
        <Col>
          <NumberField label="Height" value={unitVal(rowH, units)} suffix={units === 'in' ? '"' : 'cm'} step={0.1} min={0.1}
            onChange={(v) => updateElement(t.id, (e) => { for (let r = rg.r1; r <= rg.r2; r++) { e.h += toEmu(v, units) - e.rows[r].h; e.rows[r].h = toEmu(v, units); } })} />
          <NumberField label="Width" value={unitVal(colW, units)} suffix={units === 'in' ? '"' : 'cm'} step={0.1} min={0.1}
            onChange={(v) => updateElement(t.id, (e) => { for (let c = rg.c1; c <= rg.c2; c++) { e.w += toEmu(v, units) - e.cols[c]; e.cols[c] = toEmu(v, units); } })} />
        </Col>
        <Col>
          <SmallButton icon={IDistRows} label="Distribute Rows" onClick={() => updateElement(t.id, (e) => { const h = Math.round(e.rows.reduce((a, r) => a + r.h, 0) / e.rows.length); e.rows.forEach((r) => { r.h = h; }); })} />
          <SmallButton icon={IDistCols} label="Distribute Columns" onClick={() => updateElement(t.id, (e) => { const w = Math.round(e.cols.reduce((a, b) => a + b, 0) / e.cols.length); e.cols = e.cols.map(() => w); })} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Alignment">
        <Col>
          <Row>
            <SmallButton icon={IAlignL} iconOnly title="Align Left" onClick={() => A.formatPara({ align: 'l' })} />
            <SmallButton icon={IAlignC} iconOnly title="Center" onClick={() => A.formatPara({ align: 'ctr' })} />
            <SmallButton icon={IAlignR} iconOnly title="Align Right" onClick={() => A.formatPara({ align: 'r' })} />
          </Row>
          <Row>
            <SmallButton icon={IAnchorT} iconOnly title="Align Top" active={cell.anchor === 't'} onClick={() => forCells((c) => { c.anchor = 't'; })} />
            <SmallButton icon={IAnchorM} iconOnly title="Center Vertically" active={cell.anchor === 'ctr'} onClick={() => forCells((c) => { c.anchor = 'ctr'; })} />
            <SmallButton icon={IAnchorB} iconOnly title="Align Bottom" active={cell.anchor === 'b'} onClick={() => forCells((c) => { c.anchor = 'b'; })} />
          </Row>
        </Col>
        <BigButton icon={ITableSettings} label="Cell Margins" menu={[
          { label: 'Normal', run: () => setMargins({ l: 91440, r: 91440, t: 45720, b: 45720 }) },
          { label: 'None', run: () => setMargins({ l: 0, r: 0, t: 0, b: 0 }) },
          { label: 'Narrow', run: () => setMargins({ l: 45720, r: 45720, t: 45720, b: 45720 }) },
          { label: 'Wide', run: () => setMargins({ l: 137160, r: 137160, t: 137160, b: 137160 }) },
        ]} />
      </RibbonGroup>
      <ArrangeGroup />
    </>
  );
}

export { tableCell };
