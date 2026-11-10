import React, { memo, useLayoutEffect, useRef } from 'react';
import { px, isEmptyBody } from '../lib/model.js';
import { bodyHTML, bodyBoxStyle } from '../lib/textHtml.js';
import { shapePath, dashArray } from '../lib/geom.js';
import ChartView from './ChartView.jsx';
import TableView from './TableView.jsx';
import TextEditor from '../editor/TextEditor.jsx';

const PT = 4 / 3;

export function TextBlock({ b, el, ctx, editable }) {
  const style = bodyBoxStyle(b, el);
  if (editable) {
    return <TextEditor el={el} body={b} boxStyle={style} ctx={ctx} />;
  }
  const html = bodyHTML(b, { slideNumber: ctx.slideNumber, prompt: ctx.mode === 'edit' && el.placeholder ? el.prompt : null });
  return <div className="tb" style={style}><div className="tb-in" dangerouslySetInnerHTML={{ __html: html }} /></div>;
}

function ShapeView({ e, ctx }) {
  const w = px(e.w); const h = px(e.h);
  const fill = e.fill && e.fill.color ? e.fill.color : 'none';
  const lw = e.line && e.line.color ? (e.line.width || 1) * PT : 0;
  const editing = ctx.editingId === e.id && !ctx.editingCell;
  const emptyPh = e.placeholder && isEmptyBody(e.text);
  const autoRef = useRef(null);

  // "Resize shape to fit text": grow/shrink height to the text, like PowerPoint
  useLayoutEffect(() => {
    if (ctx.mode !== 'edit' || !ctx.onAutoFit || !e.text || e.text.autofit !== 'shape') return;
    const node = autoRef.current;
    if (!node) return;
    const inner = node.querySelector('.tb-in');
    if (!inner) return;
    const ins = e.text.insets || { t: 45720, b: 45720 };
    const need = inner.offsetHeight + px(ins.t) + px(ins.b);
    if (Math.abs(need - h) > 0.75) ctx.onAutoFit(e.id, need);
  });

  return (
    <>
      {(fill !== 'none' || lw > 0) && (
        <svg className="geom" width={w} height={h} style={{ transform: `scale(${e.flipH ? -1 : 1},${e.flipV ? -1 : 1})` }}>
          <path d={shapePath(e.geom, w, h, e.adjView)} fill={fill} fillOpacity={e.fill && e.fill.alpha != null ? e.fill.alpha : 1}
            stroke={lw ? e.line.color : 'none'} strokeWidth={lw} strokeDasharray={lw ? dashArray(e.line.dash, lw) : undefined} fillRule="evenodd" />
        </svg>
      )}
      {e.text && !(emptyPh && ctx.mode !== 'edit') && (
        <div className="tb-wrap" ref={autoRef}>
          <TextBlock b={e.text} el={e} ctx={ctx} editable={editing} />
        </div>
      )}
      {ctx.mode === 'edit' && emptyPh && !editing && <div className="ph-frame" />}
    </>
  );
}

function arrowHead(x1, y1, x2, y2, width, kind) {
  // head drawn at (x2, y2) pointing away from (x1, y1); PowerPoint "medium" size
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const L = Math.max(width * 3, 6);
  const W = Math.max(width * 3, 6) / 2;
  const bx = x2 - Math.cos(ang) * L; const by = y2 - Math.sin(ang) * L;
  const nx = -Math.sin(ang) * W; const ny = Math.cos(ang) * W;
  if (kind === 'oval') return <ellipse cx={x2} cy={y2} rx={W} ry={W} />;
  if (kind === 'diamond') return <polygon points={`${x2 + Math.cos(ang) * W},${y2 + Math.sin(ang) * W} ${x2 + nx},${y2 + ny} ${x2 - Math.cos(ang) * W},${y2 - Math.sin(ang) * W} ${x2 - nx},${y2 - ny}`} />;
  if (kind === 'arrow') return <polyline points={`${bx + nx},${by + ny} ${x2},${y2} ${bx - nx},${by - ny}`} fill="none" strokeWidth={width} />;
  return <polygon points={`${x2},${y2} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`} />;
}

function LineView({ e }) {
  const l = e.line || {};
  const lw = (l.width || 1) * PT;
  const pad = Math.max(8, lw * 4);
  const minx = Math.min(e.x1, e.x2); const miny = Math.min(e.y1, e.y2);
  const x1 = px(e.x1 - minx) + pad; const y1 = px(e.y1 - miny) + pad;
  const x2 = px(e.x2 - minx) + pad; const y2 = px(e.y2 - miny) + pad;
  const w = px(Math.abs(e.x2 - e.x1)) + pad * 2; const h = px(Math.abs(e.y2 - e.y1)) + pad * 2;
  const color = l.color || '#000';
  // shorten the line under arrow heads so the tip is crisp
  const shorten = (ax, ay, bx, by, kind) => {
    if (!kind || kind === 'none' || kind === 'arrow' || kind === 'oval') return [bx, by];
    const ang = Math.atan2(by - ay, bx - ax); const L = Math.max(lw * 3, 6) * 0.8;
    return [bx - Math.cos(ang) * L, by - Math.sin(ang) * L];
  };
  const [ex, ey] = shorten(x1, y1, x2, y2, l.tail);
  const [sx, sy] = shorten(x2, y2, x1, y1, l.head);
  return (
    <svg className="geom line-geom" width={w} height={h} style={{ left: -pad, top: -pad }}>
      <line className="hit" x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={Math.max(12, lw + 8)} />
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={lw} strokeDasharray={dashArray(l.dash, lw)} />
      <g fill={color} stroke={color}>
        {l.tail && l.tail !== 'none' && arrowHead(x1, y1, x2, y2, lw, l.tail)}
        {l.head && l.head !== 'none' && arrowHead(x2, y2, x1, y1, lw, l.head)}
      </g>
    </svg>
  );
}

function ImageView({ e }) {
  const c = e.crop || {};
  const l = c.l || 0; const t = c.t || 0; const r = c.r || 0; const b = c.b || 0;
  const w = px(e.w); const h = px(e.h);
  const iw = w / Math.max(0.01, 1 - l - r); const ih = h / Math.max(0.01, 1 - t - b);
  const lw = e.line && e.line.color ? (e.line.width || 1) * PT : 0;
  return (
    <div className="img-box" style={{ transform: `scale(${e.flipH ? -1 : 1},${e.flipV ? -1 : 1})`, outline: lw ? `${lw}px solid ${e.line.color}` : undefined, outlineOffset: lw ? -lw / 2 : undefined }}>
      <img src={e.src} alt="" draggable={false} style={{ width: iw, height: ih, left: -l * iw, top: -t * ih }} />
    </div>
  );
}

function ElementViewInner({ e, ctx, child }) {
  const view = (ctx.preview && ctx.preview[e.id]) || e;
  if (view.type === 'group') {
    return (
      <div className="el group" data-eid={child ? undefined : view.id}>
        {view.children.map((c) => <ElementView key={c.id} e={c} ctx={{ ...ctx, preview: ctx.preview }} child />)}
      </div>
    );
  }
  if (view.type === 'line') {
    const minx = Math.min(view.x1, view.x2); const miny = Math.min(view.y1, view.y2);
    return (
      <div className="el line" data-eid={child ? undefined : view.id} style={{ left: px(minx), top: px(miny), width: px(Math.abs(view.x2 - view.x1)), height: px(Math.abs(view.y2 - view.y1)) }}>
        <LineView e={view} />
      </div>
    );
  }
  const style = {
    left: px(view.x), top: px(view.y), width: px(view.w), height: px(view.h),
    transform: view.rot ? `rotate(${view.rot}deg)` : undefined,
  };
  let content = null;
  if (view.type === 'shape') content = <ShapeView e={view} ctx={ctx} />;
  else if (view.type === 'image') content = <ImageView e={view} />;
  else if (view.type === 'table') content = <TableView e={view} ctx={ctx} />;
  else if (view.type === 'chart') content = <ChartView spec={view.spec} w={px(view.w)} h={px(view.h)} error={view.error} />;
  const cls = `el ${view.type}${view.textbox ? ' textbox' : ''}${ctx.editingId === view.id ? ' editing' : ''}`;
  return <div className={cls} data-eid={child ? undefined : view.id} style={style}>{content}</div>;
}

const ElementView = memo(ElementViewInner, (a, b) => a.e === b.e && a.child === b.child
  && a.ctx.editingId === b.ctx.editingId && a.ctx.editingCell === b.ctx.editingCell
  && a.ctx.slideNumber === b.ctx.slideNumber && a.ctx.mode === b.ctx.mode
  && (a.ctx.preview && a.ctx.preview[a.e.id]) === (b.ctx.preview && b.ctx.preview[b.e.id])
  && a.ctx.cellSel === b.ctx.cellSel && a.ctx.onAutoFit === b.ctx.onAutoFit);

export default ElementView;
