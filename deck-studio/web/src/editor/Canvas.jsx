import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, getState, setUI, commit, surfaceOf, surfaceDraft, selectedElements } from '../lib/store.js';
import {
  px, emu, bounds, findIn, moveElement, fitElement, cloneElements, uid, EMU_PER_IN, shape as makeShape, textbox, body, para, lineEl,
} from '../lib/model.js';
import SlideView from '../render/SlideView.jsx';
import {
  select, startEditing, stopEditing, insertElement, paintFormat,
} from '../lib/actions.js';
import { renderCharts } from '../lib/data.js';
import { openContextMenu } from '../ui/ContextMenu.jsx';
import { openDialog } from '../lib/store.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const DIRS = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
const CURSORS = { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' };

function rotPt(x, y, deg) {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
}

function union(list) {
  let x1 = Infinity; let y1 = Infinity; let x2 = -Infinity; let y2 = -Infinity;
  for (const b of list) { x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// smart guides: snap a box to slide edges/centres and other objects
function snapBox(box, cands, thr, edges = { x: [0, 0.5, 1], y: [0, 0.5, 1] }) {
  let best = { dx: 0, dy: 0, lx: null, ly: null };
  let bx = thr + 1; let by = thr + 1;
  for (const f of edges.x) {
    const v = box.x + box.w * f;
    for (const c of cands.x) {
      const d = c.v - v;
      if (Math.abs(d) < bx) { bx = Math.abs(d); best.dx = d; best.lx = c; }
    }
  }
  for (const f of edges.y) {
    const v = box.y + box.h * f;
    for (const c of cands.y) {
      const d = c.v - v;
      if (Math.abs(d) < by) { by = Math.abs(d); best.dy = d; best.ly = c; }
    }
  }
  if (bx > thr) { best.dx = 0; best.lx = null; }
  if (by > thr) { best.dy = 0; best.ly = null; }
  return best;
}

export default function Canvas() {
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.ui.slideId);
  const view = useStore((s) => s.ui.view);
  const masterTarget = useStore((s) => s.ui.masterTarget);
  const selection = useStore((s) => s.ui.selection);
  const editing = useStore((s) => s.ui.editing);
  const cellSel = useStore((s) => s.ui.cellSel);
  const zoom = useStore((s) => s.ui.zoom);
  const fit = useStore((s) => s.ui.fit);
  const insertMode = useStore((s) => s.ui.insertMode);
  const gridlines = useStore((s) => s.ui.gridlines);
  const staticGuides = useStore((s) => s.ui.guides);
  const smartGuides = useStore((s) => s.ui.smartGuides);
  const formatPainter = useStore((s) => s.ui.formatPainter);

  const surface = useMemo(() => surfaceOf(deck, { view, masterTarget, slideId }), [deck, view, masterTarget, slideId]);
  const scrollRef = useRef(null);
  const frameRef = useRef(null);
  const [vp, setVp] = useState({ w: 800, h: 500 });
  const [preview, setPreview] = useState(null);
  const [guides, setGuides] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const [draft, setDraft] = useState(null);
  const op = useRef(null);

  const W = px(deck.size.w); const H = px(deck.size.h);
  const z = zoom;

  // fit-to-window zoom
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVp({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!fit) return;
    const zz = Math.max(0.1, Math.min((vp.w - 48) / W, (vp.h - 40) / H));
    if (Math.abs(zz - zoom) > 0.002) setUI({ zoom: Math.round(zz * 1000) / 1000 });
  }, [fit, vp, W, H, zoom]);

  const padX = Math.max(48, W * z * 0.45);
  const padY = Math.max(24, H * z * 0.35);
  const boardW = Math.max(vp.w, W * z + padX * 2);
  const boardH = Math.max(vp.h, H * z + padY * 2);
  const ox = Math.round((boardW - W * z) / 2);
  const oy = Math.round((boardH - H * z) / 2);

  // keep the slide centred when zoom changes
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = (boardW - el.clientWidth) / 2;
    el.scrollTop = (boardH - el.clientHeight) / 2;
  }, [z, fit, slideId, boardW, boardH]);

  // ctrl + wheel zoom
  useEffect(() => {
    const el = scrollRef.current;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const cur = getState().ui.zoom;
      const next = Math.max(0.1, Math.min(4, cur * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      setUI({ zoom: next, fit: false });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toSlide = useCallback((e) => {
    const r = frameRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  }, [z]);

  const candidates = useCallback((exclude) => {
    const xs = [{ v: 0, slide: true }, { v: deck.size.w / 2, slide: true }, { v: deck.size.w, slide: true }];
    const ys = [{ v: 0, slide: true }, { v: deck.size.h / 2, slide: true }, { v: deck.size.h, slide: true }];
    for (const e of surface.elements) {
      if (exclude.includes(e.id)) continue;
      const b = bounds(e);
      [b.x, b.x + b.w / 2, b.x + b.w].forEach((v) => xs.push({ v, b }));
      [b.y, b.y + b.h / 2, b.y + b.h].forEach((v) => ys.push({ v, b }));
    }
    return { x: xs, y: ys };
  }, [deck.size, surface]);

  const guideLines = (snap, box) => {
    const out = [];
    if (snap.lx) {
      const b = snap.lx.b;
      const y1 = snap.lx.slide ? 0 : Math.min(box.y, b.y); const y2 = snap.lx.slide ? deck.size.h : Math.max(box.y + box.h, b.y + b.h);
      out.push({ x1: snap.lx.v, x2: snap.lx.v, y1, y2 });
    }
    if (snap.ly) {
      const b = snap.ly.b;
      const x1 = snap.ly.slide ? 0 : Math.min(box.x, b.x); const x2 = snap.ly.slide ? deck.size.w : Math.max(box.x + box.w, b.x + b.w);
      out.push({ x1, x2, y1: snap.ly.v, y2: snap.ly.v });
    }
    return out;
  };

  const elementsById = (ids) => ids.map((id) => findIn(surface.elements, id)).filter(Boolean);

  // ---------------------------------------------------------- pointer down
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const st = getState();
    const pt = toSlide(e);
    if (st.ui.menu) setUI({ menu: null });
    if (insertMode) {
      e.preventDefault();
      op.current = { mode: 'draw', start: pt, kind: insertMode };
      setDraft({ x: pt.x, y: pt.y, w: 0, h: 0 });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (st.ui.editing) stopEditing();
    const tgt = e.target.closest('[data-eid]');
    const id = tgt && tgt.closest('.el-layer') ? tgt.dataset.eid : null;
    if (id) {
      if (formatPainter) { paintFormat(id); return; }
      const sel = st.ui.selection;
      const add = e.shiftKey || e.ctrlKey || e.metaKey;
      let next = sel;
      if (!sel.includes(id)) next = add ? [...sel, id] : [id];
      if (next !== sel) setUI({ selection: next, editing: null, cellSel: null, focus: 'canvas' });
      else setUI({ focus: 'canvas', cellSel: null });
      const el = findIn(surface.elements, id);
      const cellNode = e.target.closest('[data-cell]');
      op.current = {
        mode: 'move', start: pt, ids: next, orig: elementsById(next), moved: false, id,
        wasSelected: sel.includes(id) && sel.length === 1, toggle: add && sel.includes(id),
        cell: cellNode ? cellNode.dataset.cell.split(',').map(Number) : null,
        client: { x: e.clientX, y: e.clientY }, el,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    // empty area: start marquee
    if (!(e.shiftKey || e.ctrlKey)) setUI({ selection: [], editing: null, cellSel: null, focus: 'canvas' });
    op.current = { mode: 'marquee', start: pt, add: e.shiftKey || e.ctrlKey, base: e.shiftKey || e.ctrlKey ? st.ui.selection : [] };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const startHandle = (e, kind, handle) => {
    e.stopPropagation();
    e.preventDefault();
    const pt = toSlide(e);
    const els = elementsById(getState().ui.selection);
    op.current = { mode: kind, handle, start: pt, orig: els, box: union(els.map(bounds)) };
    scrollRef.current.querySelector('.board').setPointerCapture(e.pointerId);
  };

  // ---------------------------------------------------------- pointer move
  const onPointerMove = (e) => {
    const o = op.current;
    if (!o) return;
    const pt = toSlide(e);
    const dxp = pt.x - o.start.x; const dyp = pt.y - o.start.y;
    const thr = 6 / z * 9525;
    if (o.mode === 'move') {
      if (o.cell && !o.moved && Math.hypot(dxp, dyp) * z < 5) return;
      if (!o.moved && Math.hypot(dxp, dyp) * z < 3) return;
      o.moved = true;
      let dx = emu(dxp); let dy = emu(dyp);
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const box0 = union(o.orig.map(bounds));
      let lines = [];
      if (smartGuides && !e.altKey) {
        const snap = snapBox({ ...box0, x: box0.x + dx, y: box0.y + dy }, candidates(o.ids), thr);
        dx += Math.round(snap.dx); dy += Math.round(snap.dy);
        lines = guideLines(snap, { ...box0, x: box0.x + dx, y: box0.y + dy });
      }
      const pv = {};
      o.orig.forEach((el) => { const c = JSON.parse(JSON.stringify(el)); moveElement(c, dx, dy); pv[el.id] = c; });
      o.delta = { dx, dy };
      setPreview(pv); setGuides(lines);
      return;
    }
    if (o.mode === 'resize') {
      o.moved = true;
      const pv = {};
      let lines = [];
      if (o.orig.length === 1 && o.orig[0].type !== 'group') {
        const el = o.orig[0];
        const keep = e.shiftKey !== !!(el.lockAspect || el.type === 'image') || false;
        const [sx, sy] = DIRS[o.handle];
        const rot = el.rot || 0;
        const cx = el.x + el.w / 2; const cy = el.y + el.h / 2;
        let [lx, ly] = rotPt(emu(pt.x) - cx, emu(pt.y) - cy, -rot);
        // smart guides on unrotated edges
        if (smartGuides && !e.altKey && !rot) {
          const wx = lx + cx; const wy = ly + cy;
          const c = candidates([el.id]);
          const snap = snapBox({ x: wx, y: wy, w: 0, h: 0 }, { x: sx ? c.x : [], y: sy ? c.y : [] }, thr, { x: [0], y: [0] });
          lx += snap.dx; ly += snap.dy;
          lines = guideLines(snap, { x: wx + snap.dx, y: wy + snap.dy, w: 0, h: 0 });
        }
        const ax = -sx * el.w / 2; const ay = -sy * el.h / 2;
        const min = 9525 * 4;
        let nw = sx ? Math.max(min, (lx - ax) * sx) : el.w;
        let nh = sy ? Math.max(min, (ly - ay) * sy) : el.h;
        if (keep && el.h > 0) {
          const ratio = el.w / el.h;
          if (sx && sy) { if (nw / el.w > nh / el.h) nh = nw / ratio; else nw = nh * ratio; } else if (sx) nh = nw / ratio; else nw = nh * ratio;
        }
        const cxl = sx ? ax + sx * nw / 2 : 0; const cyl = sy ? ay + sy * nh / 2 : 0;
        const [wx, wy] = rotPt(cxl, cyl, rot);
        const ncx = cx + wx; const ncy = cy + wy;
        const c = JSON.parse(JSON.stringify(el));
        fitElement(c, bounds(el), { x: Math.round(ncx - nw / 2), y: Math.round(ncy - nh / 2), w: Math.round(nw), h: Math.round(nh) });
        if (c.type === 'shape' && c.text && c.text.autofit === 'shape' && sy) c.text.autofit = 'none';
        pv[el.id] = c;
      } else {
        const b = o.box;
        const [sx, sy] = DIRS[o.handle];
        let nx = b.x; let ny = b.y; let nw = b.w; let nh = b.h;
        const P = { x: emu(pt.x), y: emu(pt.y) };
        if (sx > 0) nw = Math.max(9525 * 4, P.x - b.x);
        if (sx < 0) { nw = Math.max(9525 * 4, b.x + b.w - P.x); nx = b.x + b.w - nw; }
        if (sy > 0) nh = Math.max(9525 * 4, P.y - b.y);
        if (sy < 0) { nh = Math.max(9525 * 4, b.y + b.h - P.y); ny = b.y + b.h - nh; }
        if (e.shiftKey && sx && sy) {
          const r = b.w / b.h;
          if (nw / b.w > nh / b.h) { nh = nw / r; if (sy < 0) ny = b.y + b.h - nh; } else { nw = nh * r; if (sx < 0) nx = b.x + b.w - nw; }
        }
        const to = { x: nx, y: ny, w: nw, h: nh };
        o.orig.forEach((el) => {
          const c = JSON.parse(JSON.stringify(el));
          const eb = bounds(el);
          const fx = (eb.x - b.x) / (b.w || 1); const fy = (eb.y - b.y) / (b.h || 1);
          const target = { x: to.x + fx * to.w, y: to.y + fy * to.h, w: eb.w * to.w / (b.w || 1), h: eb.h * to.h / (b.h || 1) };
          fitElement(c, eb, target);
          pv[el.id] = c;
        });
      }
      o.preview = pv;
      setPreview(pv); setGuides(lines);
      return;
    }
    if (o.mode === 'rotate') {
      const el = o.orig[0];
      const cx = px(el.x + el.w / 2); const cy = px(el.y + el.h / 2);
      let ang = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI + 90;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      else for (const s of [0, 90, 180, 270, 360]) if (Math.abs(ang - s) < 3) ang = s;
      ang = ((Math.round(ang * 10) / 10) % 360 + 360) % 360;
      const c = { ...el, rot: ang };
      o.preview = { [el.id]: c };
      o.moved = true;
      setPreview(o.preview);
      return;
    }
    if (o.mode === 'endpoint') {
      const el = o.orig[0];
      const c = { ...el };
      let X = emu(pt.x); let Y = emu(pt.y);
      const fx = o.handle === 'a' ? el.x2 : el.x1; const fy = o.handle === 'a' ? el.y2 : el.y1;
      if (e.shiftKey) {
        const ang = Math.atan2(Y - fy, X - fx); const len = Math.hypot(X - fx, Y - fy);
        const sn = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        X = Math.round(fx + Math.cos(sn) * len); Y = Math.round(fy + Math.sin(sn) * len);
      } else if (smartGuides && !e.altKey) {
        const snap = snapBox({ x: X, y: Y, w: 0, h: 0 }, candidates([el.id]), thr, { x: [0], y: [0] });
        X += Math.round(snap.dx); Y += Math.round(snap.dy);
        setGuides(guideLines(snap, { x: X, y: Y, w: 0, h: 0 }));
      }
      if (o.handle === 'a') { c.x1 = X; c.y1 = Y; } else { c.x2 = X; c.y2 = Y; }
      o.preview = { [el.id]: c };
      o.moved = true;
      setPreview(o.preview);
      return;
    }
    if (o.mode === 'marquee') {
      const r = { x: Math.min(o.start.x, pt.x), y: Math.min(o.start.y, pt.y), w: Math.abs(dxp), h: Math.abs(dyp) };
      o.rect = r;
      setMarquee(r);
      return;
    }
    if (o.mode === 'draw') {
      let w = dxp; let h = dyp;
      if (e.shiftKey && o.kind.kind !== 'line') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      if (e.shiftKey && o.kind.kind === 'line') {
        const ang = Math.atan2(h, w); const len = Math.hypot(w, h); const sn = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        w = Math.cos(sn) * len; h = Math.sin(sn) * len;
      }
      o.end = { x: o.start.x + w, y: o.start.y + h };
      setDraft(o.kind.kind === 'line'
        ? { line: true, x1: o.start.x, y1: o.start.y, x2: o.start.x + w, y2: o.start.y + h }
        : { x: Math.min(o.start.x, o.start.x + w), y: Math.min(o.start.y, o.start.y + h), w: Math.abs(w), h: Math.abs(h) });
    }
  };

  // ------------------------------------------------------------ pointer up
  const onPointerUp = (e) => {
    const o = op.current;
    op.current = null;
    setGuides([]);
    if (!o) return;
    if (o.mode === 'move') {
      setPreview(null);
      if (o.moved && o.delta) {
        const { dx, dy } = o.delta;
        if (e.ctrlKey && !e.shiftKey) {
          const copies = cloneElements(o.orig);
          copies.forEach((c) => moveElement(c, dx, dy));
          insertElement(copies);
        } else {
          commit((d) => {
            const els = surfaceDraft(d);
            o.ids.forEach((id) => { const el = findIn(els, id); if (el) moveElement(el, dx, dy); });
          });
        }
        return;
      }
      if (o.toggle) { setUI({ selection: getState().ui.selection.filter((x) => x !== o.id) }); return; }
      const el = o.el;
      if (el && el.type === 'table' && o.cell) {
        startEditing(el.id, { cell: o.cell, caret: o.client });
        return;
      }
      if (el && o.wasSelected && el.type === 'shape' && el.text) {
        startEditing(el.id, { caret: o.client });
      }
      return;
    }
    if (o.mode === 'resize' || o.mode === 'rotate' || o.mode === 'endpoint') {
      setPreview(null);
      if (!o.moved || !o.preview) return;
      const pv = o.preview;
      commit((d) => {
        const els = surfaceDraft(d);
        Object.entries(pv).forEach(([id, c]) => {
          const idx = els.findIndex((x) => x.id === id);
          if (idx >= 0) els[idx] = c;
          else { const el = findIn(els, id); if (el) Object.assign(el, c); }
        });
      });
      const charts = Object.values(pv).filter((c) => c.type === 'chart' || (c.children && c.children.some((k) => k.type === 'chart')));
      if (charts.length && o.mode === 'resize') renderCharts(charts.map((c) => ({ id: c.id })));
      return;
    }
    if (o.mode === 'marquee') {
      setMarquee(null);
      if (!o.rect || (o.rect.w * z < 3 && o.rect.h * z < 3)) return;
      const r = { x: emu(o.rect.x), y: emu(o.rect.y), w: emu(o.rect.w), h: emu(o.rect.h) };
      const hit = surface.elements.filter((el) => {
        const b = bounds(el);
        return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
      }).map((el) => el.id);
      setUI({ selection: [...new Set([...o.base, ...hit])] });
      return;
    }
    if (o.mode === 'draw') {
      setDraft(null);
      createFromDraw(o);
    }
  };

  const createFromDraw = (o) => {
    const k = o.kind;
    const start = o.start; const end = o.end || o.start;
    const theme = deck.theme;
    const dragged = Math.hypot(end.x - start.x, end.y - start.y) * z > 4;
    if (k.kind === 'line') {
      const x2 = dragged ? end.x : start.x + 96; const y2 = dragged ? end.y : start.y;
      const l = lineEl(emu(start.x), emu(start.y), emu(x2), emu(y2), theme);
      if (k.variant === 'arrow') l.line.tail = 'triangle';
      if (k.variant === 'doubleArrow') { l.line.tail = 'triangle'; l.line.head = 'triangle'; }
      insertElement(l);
      return;
    }
    let x = Math.min(start.x, end.x); let y = Math.min(start.y, end.y);
    let w = Math.abs(end.x - start.x); let h = Math.abs(end.y - start.y);
    if (k.kind === 'textbox') {
      if (!dragged) { w = 288; h = 40; }
      const tb = textbox(emu(x), emu(y), emu(w), emu(Math.max(h, 30)), body([para('', { size: 18, font: theme.fonts.minor })], { autofit: 'shape' }));
      insertElement(tb, { edit: true });
      return;
    }
    if (!dragged) { w = 96; h = 96; x -= 48; y -= 48; }
    const s = makeShape(k.geom, emu(x), emu(y), emu(w), emu(h), theme);
    s.text.paras[0].runs[0].font = theme.fonts.minor;
    insertElement(s);
  };

  const onDoubleClick = (e) => {
    const tgt = e.target.closest('[data-eid]');
    if (!tgt || !tgt.closest('.el-layer')) return;
    const el = findIn(surface.elements, tgt.dataset.eid);
    if (!el) return;
    if (el.type === 'shape') {
      if (!el.text) commit((d) => { const x = findIn(surfaceDraft(d), el.id); x.text = body([para('', { color: '#FFFFFF', size: 14 }, { align: 'ctr' })], { anchor: 'ctr', autofit: 'none' }); });
      startEditing(el.id, { caret: { x: e.clientX, y: e.clientY } });
    } else if (el.type === 'chart') {
      openDialog('chartSettings', { id: el.id });
    }
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    const tgt = e.target.closest('[data-eid]');
    const id = tgt && tgt.closest('.el-layer') ? tgt.dataset.eid : null;
    const st = getState();
    if (id && !st.ui.selection.includes(id)) select([id]);
    if (!id && st.ui.selection.length) setUI({ selection: [], editing: null });
    openContextMenu(e.clientX, e.clientY, id ? 'element' : 'slide');
  };

  const onAutoFit = useCallback((id, needPx) => {
    commit((d) => {
      const el = findIn(surfaceDraft(d), id);
      if (el && el.text && el.text.autofit === 'shape') {
        const nh = emu(needPx);
        if (el.text.anchor === 'b') el.y += el.h - nh;
        else if (el.text.anchor === 'ctr') el.y += Math.round((el.h - nh) / 2);
        el.h = nh;
      }
    }, { silent: true });
  }, []);

  const ctx = useMemo(() => ({
    mode: 'edit',
    editingId: editing ? editing.id : null,
    editingCell: editing && editing.cell ? editing.cell.join(',') : null,
    preview,
    cellSel,
    onAutoFit,
  }), [editing, preview, cellSel, onAutoFit]);
  // TableView needs the array form
  const ctxFull = useMemo(() => ({ ...ctx, editingCell: editing && editing.cell ? editing.cell : null }), [ctx, editing]);

  const slideNumber = surface && surface.kind === 'slide' ? deck.slides.findIndex((s) => s.id === surface.id) + 1 : '#';
  const selEls = selection.map((id) => (preview && preview[id]) || findIn(surface.elements, id)).filter(Boolean);

  if (!surface) return <div className="canvas-scroll" ref={scrollRef} />;

  return (
    <div className={`canvas-scroll${insertMode ? ' inserting' : ''}${formatPainter ? ' painting' : ''}`} ref={scrollRef}>
      <div className="board" style={{ width: boardW, height: boardH }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}>
        <div className="slide-frame" ref={frameRef} style={{ left: ox, top: oy, width: W * z, height: H * z }}>
          <div className="slide-shadow" />
          <div className="slide-scale" style={{ transform: `scale(${z})` }}>
            <SlideView deck={deck} surface={surface} mode="edit" slideNumber={slideNumber} ctx={ctxFull} clip={false} />
            {gridlines && <Grid W={W} H={H} />}
            {staticGuides && (
              <svg className="static-guides" width={W} height={H}>
                <line x1={W / 2} x2={W / 2} y1={0} y2={H} /><line x1={0} x2={W} y1={H / 2} y2={H / 2} />
              </svg>
            )}
          </div>
        </div>
        <div className="overlay" style={{ left: ox, top: oy }}>
          {selEls.map((el) => (
            <SelectionBox key={el.id} el={el} z={z} single={selEls.length === 1}
              editing={editing && editing.id === el.id} onHandle={startHandle} />
          ))}
          {selEls.length > 1 && <GroupBox els={selEls} z={z} onHandle={startHandle} />}
          {guides.map((g, i) => (
            <div key={i} className={`smart-guide ${g.x1 === g.x2 ? 'v' : 'h'}`} style={g.x1 === g.x2
              ? { left: px(g.x1) * z, top: px(g.y1) * z, height: px(g.y2 - g.y1) * z }
              : { left: px(g.x1) * z, top: px(g.y1) * z, width: px(g.x2 - g.x1) * z }} />
          ))}
          {marquee && <div className="marquee" style={{ left: marquee.x * z, top: marquee.y * z, width: marquee.w * z, height: marquee.h * z }} />}
          {draft && !draft.line && <div className="draw-draft" style={{ left: draft.x * z, top: draft.y * z, width: draft.w * z, height: draft.h * z }} />}
          {draft && draft.line && (
            <svg className="draw-line" style={{ left: 0, top: 0 }} width={1} height={1}>
              <line x1={draft.x1 * z} y1={draft.y1 * z} x2={draft.x2 * z} y2={draft.y2 * z} />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

function Grid({ W, H }) {
  const step = 96 / 2.54; // 1 cm
  const lines = [];
  for (let x = step; x < W; x += step) lines.push(<line key={`x${x}`} x1={x} x2={x} y1={0} y2={H} />);
  for (let y = step; y < H; y += step) lines.push(<line key={`y${y}`} x1={0} x2={W} y1={y} y2={y} />);
  return <svg className="gridlines" width={W} height={H}>{lines}</svg>;
}

function SelectionBox({ el, z, single, editing, onHandle }) {
  if (el.type === 'line') {
    const a = { x: px(el.x1) * z, y: px(el.y1) * z }; const b = { x: px(el.x2) * z, y: px(el.y2) * z };
    return (
      <>
        {single && <div className="handle round" style={{ left: a.x, top: a.y, cursor: 'crosshair' }} onPointerDown={(e) => onHandle(e, 'endpoint', 'a')} />}
        {single && <div className="handle round" style={{ left: b.x, top: b.y, cursor: 'crosshair' }} onPointerDown={(e) => onHandle(e, 'endpoint', 'b')} />}
        {!single && <svg className="sel-line" width={1} height={1}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} /></svg>}
      </>
    );
  }
  const b = bounds(el);
  const x = px(b.x) * z; const y = px(b.y) * z; const w = px(b.w) * z; const h = px(b.h) * z;
  const rot = el.rot || 0;
  const rotatable = el.type === 'shape' || el.type === 'image';
  const resizable = single && el.type !== 'group' ? true : single;
  return (
    <div className={`sel-box${editing ? ' editing' : ''}${single ? '' : ' multi'}`} style={{ left: x, top: y, width: w, height: h, transform: rot ? `rotate(${rot}deg)` : undefined }}>
      {single && resizable && HANDLES.map((hd) => {
        const [sx, sy] = DIRS[hd];
        if ((w < 22 && sx === 0) || (h < 22 && sy === 0)) return null;
        const cursorAngle = rot;
        void cursorAngle;
        return (
          <div key={hd} className={`handle ${sx && sy ? 'round' : 'bar'} ${sx ? 'x' : 'y'}`}
            style={{ left: (sx + 1) / 2 * w, top: (sy + 1) / 2 * h, cursor: `${CURSORS[hd]}-resize` }}
            onPointerDown={(e) => onHandle(e, 'resize', hd)} />
        );
      })}
      {single && rotatable && (
        <div className="rot-handle" style={{ left: w / 2, top: -26 }} onPointerDown={(e) => onHandle(e, 'rotate')} title="Rotate (Shift snaps to 15°)">
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6" fill="none" stroke="#444" strokeWidth="1.5" /><path d="M12.6 1.8v3.2H9.4" fill="none" stroke="#444" strokeWidth="1.5" /></svg>
        </div>
      )}
    </div>
  );
}

function GroupBox({ els, z, onHandle }) {
  const b = union(els.map(bounds));
  const x = px(b.x) * z; const y = px(b.y) * z; const w = px(b.w) * z; const h = px(b.h) * z;
  return (
    <div className="sel-box group-sel" style={{ left: x, top: y, width: w, height: h }}>
      {HANDLES.map((hd) => {
        const [sx, sy] = DIRS[hd];
        return <div key={hd} className={`handle ${sx && sy ? 'round' : 'bar'} ${sx ? 'x' : 'y'}`} style={{ left: (sx + 1) / 2 * w, top: (sy + 1) / 2 * h, cursor: `${CURSORS[hd]}-resize` }} onPointerDown={(e) => onHandle(e, 'resize', hd)} />;
      })}
    </div>
  );
}

export { selectedElements, uid, EMU_PER_IN };
