// Editing actions used by the ribbon, keyboard shortcuts and menus.
import {
  getState, setUI, commit, surfaceDraft, currentSurface, selectedElements, updateSelected, toast,
} from './store.js';
import {
  uid, findIn, bounds, moveElement, fitElement, cloneElements, slideFromLayout, groupBounds,
  EMU_PER_IN, textbox, body, para, isEmptyBody,
} from './model.js';
import * as T from './text.js';
import { activeEditor } from '../editor/TextEditor.jsx';

// ------------------------------------------------------------ editing text
export function setParas(target, paras, opts = {}) {
  commit((d) => {
    const e = findIn(surfaceDraft(d), target.id);
    if (!e) return;
    if (target.cell) {
      const cell = e.rows[target.cell[0]]?.cells[target.cell[1]];
      if (cell) cell.text.paras = paras;
    } else if (e.text) {
      e.text.paras = paras;
    }
  }, opts);
}

export function startEditing(id, opts = {}) {
  setUI({ editing: { id, cell: opts.cell || null, caret: opts.caret || null, selectAll: !!opts.selectAll, range: opts.range || null, typed: opts.typed || null }, selection: [id], menu: null });
}

export function stopEditing() {
  const ed = getState().ui.editing;
  if (!ed) return;
  setUI({ editing: null });
  // an edited placeholder that is now empty keeps its prompt
  void ed;
}

export function moveCellFocus(id, [r, c], dir) {
  const surf = currentSurface();
  const t = findIn(surf.elements, id);
  if (!t) return;
  const nc = t.cols.length; const nr = t.rows.length;
  let idx = r * nc + c + dir;
  if (idx >= nr * nc) {
    // Tab in the last cell adds a row, like PowerPoint
    commit((d) => {
      const tt = findIn(surfaceDraft(d), id);
      const last = tt.rows[tt.rows.length - 1];
      tt.rows.push(JSON.parse(JSON.stringify({ ...last, cells: last.cells.map((cl) => ({ ...cl, text: { ...cl.text, paras: [{ ...cl.text.paras[0], runs: [{ ...cl.text.paras[0].runs[0], text: '' }] }] } })) })));
      tt.h += last.h;
    });
  }
  idx = Math.max(0, idx);
  setUI({ editing: { id, cell: [Math.floor(idx / nc), idx % nc], selectAll: true }, cellSel: null });
}

// --------------------------------------------------------------- selection
export function select(ids, add = false) {
  const cur = getState().ui.selection;
  const next = add ? [...new Set([...cur, ...ids])] : ids;
  setUI({ selection: next, editing: null, cellSel: null, focus: 'canvas' });
}

export function toggleSelect(id) {
  const cur = getState().ui.selection;
  setUI({ selection: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id], editing: null, cellSel: null });
}

export function selectAll() {
  const surf = currentSurface();
  if (!surf) return;
  setUI({ selection: surf.elements.map((e) => e.id), editing: null });
}

export function clearSelection() {
  setUI({ selection: [], editing: null, cellSel: null });
}

// ----------------------------------------------------------------- slides
export function goToSlide(id, opts = {}) {
  const u = getState().ui;
  if (u.view === 'master') return;
  setUI({ slideId: id, slideSel: opts.keepSel ? u.slideSel : [id], selection: [], editing: null, cellSel: null });
}

export function addSlide(layoutId, afterId) {
  const st = getState();
  const deck = st.deck;
  const layout = deck.layouts.find((l) => l.id === layoutId)
    || deck.layouts.find((l) => l.id === (layoutId === undefined ? nextLayoutFor(deck, afterId || st.ui.slideId) : layoutId))
    || deck.layouts[0];
  const slide = slideFromLayout(layout);
  commit((d) => {
    const i = d.slides.findIndex((s) => s.id === (afterId || st.ui.slideId));
    d.slides.splice(i + 1, 0, slide);
  });
  setUI({ slideId: slide.id, slideSel: [slide.id], selection: [], editing: null, view: 'normal' });
  return slide;
}

function nextLayoutFor(deck, slideId) {
  const s = deck.slides.find((x) => x.id === slideId);
  if (!s) return 'content';
  return s.layout === 'title' ? 'content' : (s.layout || 'content');
}

export function duplicateSlides(ids) {
  const st = getState();
  const list = ids && ids.length ? ids : [st.ui.slideId];
  let lastNew = null;
  commit((d) => {
    const indexes = list.map((id) => d.slides.findIndex((s) => s.id === id)).filter((i) => i >= 0).sort((a, b) => a - b);
    const at = indexes[indexes.length - 1];
    const copies = indexes.map((i) => {
      const c = JSON.parse(JSON.stringify(d.slides[i]));
      c.id = uid('s');
      c.elements = cloneElements(c.elements);
      return c;
    });
    d.slides.splice(at + 1, 0, ...copies);
    lastNew = copies[copies.length - 1].id;
  });
  if (lastNew) setUI({ slideId: lastNew, slideSel: [lastNew], selection: [] });
}

export function deleteSlides(ids) {
  const st = getState();
  const list = ids && ids.length ? ids : [st.ui.slideId];
  if (list.length >= st.deck.slides.length) {
    toast('A deck needs at least one slide.', { kind: 'warn' });
    return;
  }
  const idx = st.deck.slides.findIndex((s) => s.id === list[0]);
  commit((d) => { d.slides = d.slides.filter((s) => !list.includes(s.id)); });
  const deck = getState().deck;
  const next = deck.slides[Math.min(idx, deck.slides.length - 1)];
  setUI({ slideId: next.id, slideSel: [next.id], selection: [], editing: null });
}

export function moveSlides(ids, toIndex) {
  commit((d) => {
    const moving = d.slides.filter((s) => ids.includes(s.id));
    const before = d.slides.slice(0, toIndex).filter((s) => !ids.includes(s.id)).length;
    const rest = d.slides.filter((s) => !ids.includes(s.id));
    rest.splice(before, 0, ...moving);
    d.slides = rest;
  });
}

export function toggleHideSlides(ids) {
  const st = getState();
  const list = ids && ids.length ? ids : [st.ui.slideId];
  const anyShown = st.deck.slides.some((s) => list.includes(s.id) && !s.hidden);
  commit((d) => { d.slides.forEach((s) => { if (list.includes(s.id)) s.hidden = anyShown; }); });
}

// Apply a layout to slides: placeholders are matched by kind; their position and
// formatting come from the layout, their text stays.
export function applyLayout(slideIds, layoutId, resetOnly = false) {
  const st = getState();
  const list = slideIds && slideIds.length ? slideIds : [st.ui.slideId];
  commit((d) => {
    d.slides.forEach((s) => {
      if (!list.includes(s.id)) return;
      const lid = resetOnly ? (s.layout || 'content') : layoutId;
      const layout = d.layouts.find((l) => l.id === lid);
      if (!layout) return;
      s.layout = layout.id;
      s.background = layout.background || null;
      s.hideMaster = !!layout.hideMaster;
      const used = new Set();
      const fresh = slideFromLayout(layout).elements;
      for (const le of fresh) {
        if (!le.placeholder) {
          // non-placeholder decoration from the layout: add if missing
          if (!s.elements.some((e) => e.name === le.name && e.fromLayout)) s.elements.unshift({ ...le, fromLayout: true });
          continue;
        }
        const match = s.elements.find((e) => e.placeholder === le.placeholder && !used.has(e.id));
        if (match) {
          used.add(match.id);
          match.x = le.x; match.y = le.y; match.w = le.w; match.h = le.h; match.rot = 0;
          const proto = le.text.paras[0];
          const protoRun = proto.runs[0];
          match.text.anchor = le.text.anchor;
          match.text.autofit = le.text.autofit;
          match.text.paras.forEach((p) => {
            Object.assign(p, { align: proto.align, bullet: proto.bullet, marL: proto.marL, indent: proto.indent, lineSpacing: proto.lineSpacing, spaceBefore: proto.spaceBefore, spaceAfter: proto.spaceAfter });
            p.runs.forEach((r) => Object.assign(r, { font: protoRun.font, size: protoRun.size, color: protoRun.color, bold: protoRun.bold }));
          });
        } else if (!resetOnly) {
          s.elements.push(le);
        }
      }
      if (!resetOnly) {
        // drop empty placeholders the new layout doesn't have
        s.elements = s.elements.filter((e) => !(e.placeholder && !used.has(e.id) && isEmptyBody(e.text) && !fresh.some((f) => f.id === e.id)));
      }
    });
  });
}

// --------------------------------------------------------------- elements
export function insertElement(el, opts = {}) {
  const els = Array.isArray(el) ? el : [el];
  commit((d) => { surfaceDraft(d).push(...els); });
  const ids = els.map((e) => e.id);
  if (opts.edit && els.length === 1) startEditing(ids[0], { selectAll: opts.selectAll });
  else setUI({ selection: ids, editing: null, insertMode: null });
  setUI({ insertMode: null });
  return els;
}

export function deleteSelected() {
  const ids = getState().ui.selection;
  if (!ids.length) return;
  commit((d) => {
    const prune = (list) => list.filter((e) => {
      if (ids.includes(e.id)) return false;
      if (e.children) e.children = prune(e.children);
      return true;
    });
    const els = surfaceDraft(d);
    const kept = prune(els);
    els.splice(0, els.length, ...kept);
  });
  setUI({ selection: [], editing: null });
}

export function duplicateSelected() {
  const sel = selectedElements();
  if (!sel.length) return;
  const copies = cloneElements(sel);
  copies.forEach((c) => moveElement(c, Math.round(0.2 * EMU_PER_IN), Math.round(0.2 * EMU_PER_IN)));
  insertElement(copies);
}

export function nudge(dx, dy) {
  updateSelected((e) => moveElement(e, dx, dy), { coalesce: 'nudge' });
}

export function moveSelectedBy(dx, dy) {
  updateSelected((e) => moveElement(e, dx, dy));
}

export function order(kind) {
  const ids = getState().ui.selection;
  if (!ids.length) return;
  commit((d) => {
    const els = surfaceDraft(d);
    const sel = els.filter((e) => ids.includes(e.id));
    const rest = els.filter((e) => !ids.includes(e.id));
    let out;
    if (kind === 'front') out = [...rest, ...sel];
    else if (kind === 'back') out = [...sel, ...rest];
    else {
      out = [...els];
      const step = kind === 'forward' ? 1 : -1;
      const indexes = out.map((e, i) => (ids.includes(e.id) ? i : -1)).filter((i) => i >= 0);
      const seq = step > 0 ? indexes.reverse() : indexes;
      for (const i of seq) {
        const j = i + step;
        if (j < 0 || j >= out.length || ids.includes(out[j].id)) continue;
        [out[i], out[j]] = [out[j], out[i]];
      }
    }
    els.splice(0, els.length, ...out);
  });
}

export function align(kind) {
  const st = getState();
  const sel = selectedElements();
  if (!sel.length) return;
  const deck = st.deck;
  const box = sel.length === 1 ? { x: 0, y: 0, w: deck.size.w, h: deck.size.h } : groupBounds(sel);
  updateSelected((e) => {
    const b = bounds(e);
    let dx = 0; let dy = 0;
    if (kind === 'left') dx = box.x - b.x;
    if (kind === 'center') dx = box.x + box.w / 2 - (b.x + b.w / 2);
    if (kind === 'right') dx = box.x + box.w - (b.x + b.w);
    if (kind === 'top') dy = box.y - b.y;
    if (kind === 'middle') dy = box.y + box.h / 2 - (b.y + b.h / 2);
    if (kind === 'bottom') dy = box.y + box.h - (b.y + b.h);
    moveElement(e, Math.round(dx), Math.round(dy));
  });
}

export function distribute(axis) {
  const sel = selectedElements();
  const deck = getState().deck;
  if (sel.length < 2) return;
  const items = sel.map((e) => ({ id: e.id, b: bounds(e) }));
  const key = axis === 'h' ? 'x' : 'y'; const size = axis === 'h' ? 'w' : 'h';
  items.sort((a, b) => a.b[key] - b.b[key]);
  let start; let end;
  if (sel.length === 2) { start = 0; end = axis === 'h' ? deck.size.w : deck.size.h; } else {
    start = items[0].b[key]; end = items[items.length - 1].b[key] + items[items.length - 1].b[size];
  }
  const total = items.reduce((a, it) => a + it.b[size], 0);
  const gap = (end - start - total) / (sel.length === 2 ? 3 : items.length - 1);
  let pos = start + (sel.length === 2 ? gap : 0);
  const target = {};
  items.forEach((it) => { target[it.id] = pos; pos += it.b[size] + gap; });
  updateSelected((e) => {
    const b = bounds(e);
    const d = Math.round(target[e.id] - b[key]);
    moveElement(e, axis === 'h' ? d : 0, axis === 'h' ? 0 : d);
  });
}

export function groupSelected() {
  const ids = getState().ui.selection;
  if (ids.length < 2) return;
  const gid = uid('g');
  commit((d) => {
    const els = surfaceDraft(d);
    const members = els.filter((e) => ids.includes(e.id));
    const idx = Math.max(...members.map((m) => els.indexOf(m)));
    const g = { id: gid, type: 'group', name: 'Group', children: members };
    const rest = [];
    els.forEach((e, i) => {
      if (!ids.includes(e.id)) rest.push(e);
      if (i === idx) rest.push(g);
    });
    els.splice(0, els.length, ...rest);
  });
  setUI({ selection: [gid] });
}

export function ungroupSelected() {
  const sel = selectedElements().filter((e) => e.type === 'group');
  if (!sel.length) return;
  const newSel = [];
  commit((d) => {
    const els = surfaceDraft(d);
    const out = [];
    els.forEach((e) => {
      if (sel.some((g) => g.id === e.id)) { out.push(...e.children); newSel.push(...e.children.map((c) => c.id)); } else out.push(e);
    });
    els.splice(0, els.length, ...out);
  });
  setUI({ selection: newSel });
}

export function rotateSelected(deg) {
  updateSelected((e) => {
    if (e.type === 'line') {
      const cx = (e.x1 + e.x2) / 2; const cy = (e.y1 + e.y2) / 2;
      const rad = (deg * Math.PI) / 180;
      const rot = (x, y) => [cx + (x - cx) * Math.cos(rad) - (y - cy) * Math.sin(rad), cy + (x - cx) * Math.sin(rad) + (y - cy) * Math.cos(rad)];
      [e.x1, e.y1] = rot(e.x1, e.y1).map(Math.round);
      [e.x2, e.y2] = rot(e.x2, e.y2).map(Math.round);
      return;
    }
    if (e.type === 'group' || e.type === 'table' || e.type === 'chart') return;
    e.rot = (((e.rot || 0) + deg) % 360 + 360) % 360;
  });
}

export function flipSelected(axis) {
  updateSelected((e) => {
    if (e.type === 'line') {
      if (axis === 'h') [e.x1, e.x2] = [e.x2, e.x1]; else [e.y1, e.y2] = [e.y2, e.y1];
      return;
    }
    if (e.type === 'group' || e.type === 'table' || e.type === 'chart') return;
    if (axis === 'h') e.flipH = !e.flipH; else e.flipV = !e.flipV;
  });
}

export function setBounds(id, b) {
  commit((d) => {
    const e = findIn(surfaceDraft(d), id);
    if (e) fitElement(e, bounds(e), b);
  });
}

// --------------------------------------------------------------- formatting
function textTargets(e, cellSel) {
  // returns text bodies (with setter) inside an element
  if (e.type === 'shape' && e.text) return [{ get: () => e.text, set: (b) => { e.text.paras = b.paras; } }];
  if (e.type === 'table') {
    const out = [];
    e.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
      if (cellSel && cellSel.id === e.id) {
        const inR = r >= Math.min(cellSel.r1, cellSel.r2) && r <= Math.max(cellSel.r1, cellSel.r2);
        const inC = c >= Math.min(cellSel.c1, cellSel.c2) && c <= Math.max(cellSel.c1, cellSel.c2);
        if (!inR || !inC) return;
      }
      out.push({ get: () => cell.text, set: (b) => { cell.text.paras = b.paras; } });
    }));
    return out;
  }
  if (e.type === 'group') return e.children.flatMap((c) => textTargets(c));
  return [];
}

export function formatRun(props) {
  if (activeEditor && !getState().ui.cellSel) { activeEditor.applyRun(props); return; }
  const cellSel = getState().ui.cellSel;
  updateSelected((e) => {
    for (const t of textTargets(e, cellSel)) t.set(T.applyRunProps(t.get(), null, props));
  });
}

export function formatPara(props) {
  if (activeEditor && !getState().ui.cellSel) { activeEditor.applyPara(props); return; }
  const cellSel = getState().ui.cellSel;
  updateSelected((e) => {
    for (const t of textTargets(e, cellSel)) t.set(T.applyParaProps(t.get(), null, props));
  });
}

export function setBullet(bullet) {
  const fn = (b) => {
    const nb = JSON.parse(JSON.stringify(b));
    return nb;
  };
  void fn;
  const apply = (body0, range) => {
    const nb = T.applyParaProps(body0, range, {});
    const s = range ? range.start.p : 0; const e = range ? range.end.p : nb.paras.length - 1;
    for (let i = s; i <= e; i++) {
      const p = nb.paras[i];
      p.bullet = bullet;
      Object.assign(p, T.bulletIndent(p.level || 0, bullet));
    }
    return nb;
  };
  if (activeEditor && !getState().ui.cellSel) {
    const nb = apply(activeEditor.getBody(), activeEditor.getRange());
    setParas({ id: activeEditor.id, cell: activeEditor.cell }, nb.paras);
    return;
  }
  const cellSel = getState().ui.cellSel;
  updateSelected((e) => { for (const t of textTargets(e, cellSel)) t.set(apply(t.get(), null)); });
}

export function changeLevel(dir) {
  if (activeEditor) { activeEditor.changeLevel(dir); return; }
  updateSelected((e) => {
    for (const t of textTargets(e)) {
      const nb = JSON.parse(JSON.stringify(t.get()));
      nb.paras.forEach((p) => { p.level = Math.max(0, Math.min(8, (p.level || 0) + dir)); Object.assign(p, T.bulletIndent(p.level, p.bullet)); });
      t.set(nb);
    }
  });
}

export function changeCase(mode) {
  if (activeEditor) { activeEditor.changeCase(mode); return; }
  updateSelected((e) => { for (const t of textTargets(e)) t.set(T.changeCase(t.get(), null, mode)); });
}

export function setBodyProps(props) {
  updateSelected((e) => {
    if (e.type === 'shape' && e.text) Object.assign(e.text, props);
  });
}

export function currentRunProps() {
  if (activeEditor) return activeEditor.getProps();
  const sel = selectedElements();
  const cellSel = getState().ui.cellSel;
  const out = {}; let first = true;
  for (const e of sel) {
    for (const t of textTargets(e, cellSel)) {
      const p = T.commonRunProps(t.get(), null);
      for (const k of Object.keys(p)) {
        if (first) out[k] = p[k]; else if (out[k] !== p[k]) out[k] = '';
      }
      first = false;
    }
  }
  return out;
}

export function currentParaProps() {
  if (activeEditor) return activeEditor.getParaProps();
  const sel = selectedElements();
  const out = {}; let first = true;
  for (const e of sel) {
    for (const t of textTargets(e)) {
      const p = T.commonParaProps(t.get(), null);
      for (const k of Object.keys(p)) {
        const v = k === 'bullet' ? JSON.stringify(p[k]) : p[k];
        if (first) out[k] = v; else if (out[k] !== v) out[k] = '';
      }
      first = false;
    }
  }
  if (out.bullet) { try { out.bullet = JSON.parse(out.bullet); } catch (e) { out.bullet = ''; } }
  return out;
}

export function hasTextSelection() {
  if (activeEditor) return true;
  return selectedElements().some((e) => textTargets(e).length > 0);
}

export function clearFormatting() {
  formatRun({ bold: false, italic: false, underline: false, strike: false, baseline: 0, spacing: 0, highlight: null, caps: null });
}

// Format painter: copy formatting of the selection, apply on the next click
export function pickFormat() {
  const sel = selectedElements()[0];
  if (!sel) return;
  const run = currentRunProps();
  setUI({ formatPainter: { run, fill: sel.fill || null, line: sel.line || null, type: sel.type } });
  toast('Format Painter: click an object to apply the formatting. Press Esc to cancel.');
}

export function paintFormat(id) {
  const fp = getState().ui.formatPainter;
  if (!fp) return;
  commit((d) => {
    const e = findIn(surfaceDraft(d), id);
    if (!e) return;
    if (e.type === 'shape' && fp.type === 'shape') {
      if (!e.textbox) { e.fill = fp.fill; e.line = fp.line; }
    }
    const runProps = Object.fromEntries(Object.entries(fp.run).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    for (const t of textTargets(e)) t.set(T.applyRunProps(t.get(), null, runProps));
  });
  setUI({ formatPainter: null, selection: [id] });
}

// ---------------------------------------------------------------- clipboard
let internalClip = null;

export function copySelection() {
  const st = getState();
  if (st.ui.focus === 'slides') {
    const slides = st.deck.slides.filter((s) => st.ui.slideSel.includes(s.id));
    internalClip = { kind: 'slides', slides: JSON.parse(JSON.stringify(slides)) };
  } else {
    const sel = selectedElements();
    if (!sel.length) return false;
    internalClip = { kind: 'elements', elements: JSON.parse(JSON.stringify(sel)) };
  }
  const text = 'DECKSTUDIO:' + JSON.stringify(internalClip);
  try { navigator.clipboard.writeText(text); } catch (e) { /* clipboard may be blocked */ }
  return true;
}

export function cutSelection() {
  const st = getState();
  if (!copySelection()) return;
  if (st.ui.focus === 'slides') deleteSlides(st.ui.slideSel); else deleteSelected();
}

export function pasteClip(clip) {
  const data = clip || internalClip;
  if (!data) return false;
  const st = getState();
  if (data.kind === 'slides') {
    const at = st.deck.slides.findIndex((s) => s.id === st.ui.slideId);
    const copies = data.slides.map((s) => ({ ...JSON.parse(JSON.stringify(s)), id: uid('s'), elements: cloneElements(s.elements) }));
    commit((d) => { d.slides.splice(at + 1, 0, ...copies); });
    setUI({ slideId: copies[copies.length - 1].id, slideSel: copies.map((c) => c.id), selection: [] });
    return true;
  }
  const surf = currentSurface();
  const copies = cloneElements(data.elements);
  // offset when pasting onto the same spot
  const clash = copies.some((c) => surf.elements.some((e) => { const a = bounds(e); const b = bounds(c); return a.x === b.x && a.y === b.y; }));
  if (clash) {
    const off = Math.round(0.2 * EMU_PER_IN);
    copies.forEach((c) => moveElement(c, off, off));
    internalClip = { kind: 'elements', elements: JSON.parse(JSON.stringify(copies)) };
  }
  insertElement(copies);
  return true;
}

export function pasteFromSystem(e) {
  const cd = e.clipboardData;
  if (!cd) return;
  const text = cd.getData('text/plain');
  if (text && text.startsWith('DECKSTUDIO:')) {
    try { pasteClip(JSON.parse(text.slice(11))); e.preventDefault(); return; } catch (err) { /* fall through */ }
  }
  const file = [...(cd.files || [])].find((f) => f.type.startsWith('image/'));
  if (file) {
    e.preventDefault();
    insertImageFile(file);
    return;
  }
  if (text) {
    e.preventDefault();
    const deck = getState().deck;
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const b = body(lines.map((l) => para(l, { size: 18 })), { autofit: 'shape' });
    const w = Math.round(6 * EMU_PER_IN);
    const tb = textbox(Math.round((deck.size.w - w) / 2), Math.round(deck.size.h / 2 - 0.3 * EMU_PER_IN), w, Math.round(0.6 * EMU_PER_IN), b);
    insertElement(tb);
    return;
  }
  if (internalClip) { e.preventDefault(); pasteClip(); }
}

export function insertImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const src = reader.result;
    const img = new Image();
    img.onload = () => {
      const deck = getState().deck;
      const maxW = deck.size.w * 0.6; const maxH = deck.size.h * 0.6;
      let w = img.naturalWidth * 9525; let h = img.naturalHeight * 9525;
      const s = Math.min(1, maxW / w, maxH / h);
      w = Math.round(w * s); h = Math.round(h * s);
      insertElement({ id: uid('e'), type: 'image', src, x: Math.round((deck.size.w - w) / 2), y: Math.round((deck.size.h - h) / 2), w, h, rot: 0, name: file.name || 'Picture', lockAspect: true });
    };
    img.src = src;
  };
  reader.readAsDataURL(file);
}

export function pickImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/bmp';
  input.onchange = () => { if (input.files[0]) insertImageFile(input.files[0]); };
  input.click();
}

// ------------------------------------------------------------------ zoom
export function setZoom(z) {
  setUI({ zoom: Math.max(0.1, Math.min(4, z)), fit: false });
}

export function zoomStep(dir) {
  const steps = [0.1, 0.25, 0.33, 0.4, 0.5, 0.6, 0.66, 0.75, 0.85, 1, 1.25, 1.5, 2, 3, 4];
  const z = getState().ui.zoom;
  const next = dir > 0 ? steps.find((s) => s > z + 0.001) || 4 : [...steps].reverse().find((s) => s < z - 0.001) || 0.1;
  setZoom(next);
}

// ------------------------------------------------------------- slide show
export function startShow(fromCurrent) {
  const st = getState();
  const slides = st.deck.slides;
  let index = 0;
  if (fromCurrent) index = Math.max(0, slides.findIndex((s) => s.id === st.ui.slideId));
  setUI({ show: { index }, editing: null, menu: null });
  try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } catch (e) { /* ignore */ }
}

export function stopShow() {
  setUI({ show: null });
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

export function setView(view) {
  const st = getState();
  if (view === 'master') {
    setUI({ view: 'master', masterTarget: 'master', selection: [], editing: null, tab: 'master' });
  } else {
    setUI({ view, selection: [], editing: null, tab: st.ui.tab === 'master' ? 'home' : st.ui.tab });
  }
}

export function find(text, matchCase, fromStart) {
  // finds the next slide/element containing text after the current one
  const st = getState();
  const slides = st.deck.slides;
  const needle = matchCase ? text : text.toLowerCase();
  const startSlide = Math.max(0, slides.findIndex((s) => s.id === st.ui.slideId));
  const order = [...slides.slice(startSlide), ...slides.slice(0, startSlide)];
  const curEl = st.ui.editing ? st.ui.editing.id : null;
  let passedCurrent = !curEl || fromStart;
  for (let si = 0; si < order.length; si++) {
    const s = order[si];
    for (const e of s.elements) {
      if (!passedCurrent) { if (e.id === curEl) passedCurrent = true; continue; }
      if (e.type !== 'shape' || !e.text) continue;
      for (let pi = 0; pi < e.text.paras.length; pi++) {
        const t = T.paraText(e.text.paras[pi]);
        const idx = (matchCase ? t : t.toLowerCase()).indexOf(needle);
        if (idx >= 0) {
          setUI({ slideId: s.id, slideSel: [s.id], view: 'normal' });
          startEditing(e.id, { range: { start: { p: pi, o: idx }, end: { p: pi, o: idx + text.length } } });
          return true;
        }
      }
    }
    passedCurrent = true;
  }
  return false;
}

export function replaceAllText(findText, repl, matchCase) {
  let count = 0;
  commit((d) => {
    const walk = (list) => list.forEach((e) => {
      if (e.type === 'shape' && e.text) {
        const r = T.replaceAll(e.text, findText, repl, matchCase);
        if (r.count) { e.text.paras = r.body.paras; count += r.count; }
      }
      if (e.type === 'table') {
        e.rows.forEach((row) => row.cells.forEach((cell) => {
          const r = T.replaceAll(cell.text, findText, repl, matchCase);
          if (r.count) { cell.text.paras = r.body.paras; count += r.count; }
        }));
      }
      if (e.children) walk(e.children);
    });
    d.slides.forEach((s) => walk(s.elements));
  });
  return count;
}

export function applyTheme(theme, recolor = true) {
  const st = getState();
  const old = st.deck.theme;
  const map = {};
  if (recolor) {
    for (const k of Object.keys(old.colors)) {
      if (theme.colors[k] && old.colors[k].toUpperCase() !== theme.colors[k].toUpperCase()) map[old.colors[k].toUpperCase()] = theme.colors[k];
    }
  }
  const fontMap = {};
  if (old.fonts.major !== theme.fonts.major) fontMap[old.fonts.major] = theme.fonts.major;
  if (old.fonts.minor !== theme.fonts.minor) fontMap[old.fonts.minor] = theme.fonts.minor;
  const rc = (c) => (c && map[String(c).toUpperCase()]) || c;
  commit((d) => {
    d.theme = JSON.parse(JSON.stringify(theme));
    const fixRuns = (b) => b && b.paras.forEach((p) => p.runs.forEach((r) => { r.color = rc(r.color); if (fontMap[r.font]) r.font = fontMap[r.font]; }));
    const walk = (list) => list.forEach((e) => {
      if (e.fill) e.fill.color = rc(e.fill.color);
      if (e.line) e.line.color = rc(e.line.color);
      fixRuns(e.text);
      if (e.type === 'table') e.rows.forEach((row) => row.cells.forEach((cell) => { if (cell.fill) cell.fill.color = rc(cell.fill.color); fixRuns(cell.text); Object.values(cell.borders || {}).forEach((b) => { if (b) b.color = rc(b.color); }); }));
      if (e.children) walk(e.children);
    });
    d.slides.forEach((s) => { walk(s.elements); s.background = rc(s.background); });
    walk(d.master.elements);
    d.master.background = rc(d.master.background);
    d.layouts.forEach((l) => { walk(l.elements); l.background = rc(l.background); });
  });
}
