// In-place text editing. The browser never edits the text itself: every key
// press is turned into a change to the deck's text model and the paragraph
// HTML is redrawn from the model. That keeps formatting exact and exportable.
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { bodyHTML, domToPos, posToDom } from '../lib/textHtml.js';
import * as T from '../lib/text.js';
import { getState, setUI, undo, redo } from '../lib/store.js';
import { setParas, stopEditing, moveCellFocus } from '../lib/actions.js';

export let activeEditor = null;

let tickTimer = null;
function bumpTick() {
  if (tickTimer) return;
  tickTimer = setTimeout(() => { tickTimer = null; setUI((u) => ({ textTick: u.textTick + 1 })); }, 60);
}

export default function TextEditor({ el, body, boxStyle, ctx }) {
  const ref = useRef(null);
  const sel = useRef({ anchor: { p: 0, o: 0 }, focus: { p: 0, o: 0 } });
  const parasRef = useRef(body.paras);
  const bodyRef = useRef(body);
  const pending = useRef(null);
  const composing = useRef(null);
  const target = { id: el.id, cell: el.cellRC || null };
  bodyRef.current = body;

  const render = () => {
    const root = ref.current;
    if (!root) return;
    root.innerHTML = bodyHTML({ ...bodyRef.current, paras: parasRef.current }, { editing: true, slideNumber: ctx.slideNumber });
  };

  const applySel = (s) => {
    const root = ref.current;
    if (!root) return;
    const b = { paras: parasRef.current };
    const a = T.clampPos(b, s.anchor); const f = T.clampPos(b, s.focus);
    sel.current = { anchor: a, focus: f };
    const da = posToDom(root, a); const df = posToDom(root, f);
    const ds = window.getSelection();
    try { ds.setBaseAndExtent(da.node, da.offset, df.node, df.offset); } catch (e) { /* ignore */ }
  };

  const range = () => T.orderSel(sel.current);
  const current = () => ({ ...bodyRef.current, paras: parasRef.current });

  const apply = (nb, newSel, opts = {}) => {
    parasRef.current = nb.paras;
    render();
    applySel(newSel);
    setParas(target, nb.paras, { coalesce: opts.coalesce });
    bumpTick();
  };

  // mount: draw and place the caret
  useLayoutEffect(() => {
    render();
    const root = ref.current;
    root.focus({ preventScroll: true });
    const edit = getState().ui.editing || {};
    const b = current();
    let placed = false;
    if (edit.caret && edit.caret.x != null && document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(edit.caret.x, edit.caret.y);
      if (r && root.contains(r.startContainer)) {
        const pos = domToPos(root, r.startContainer, r.startOffset);
        if (pos) { applySel({ anchor: pos, focus: pos }); placed = true; }
      }
    }
    if (!placed && edit.range) { applySel({ anchor: edit.range.start, focus: edit.range.end }); placed = true; }
    if (!placed) {
      if (edit.selectAll) applySel({ anchor: { p: 0, o: 0 }, focus: T.endPos(b) });
      else { const e = T.endPos(b); applySel({ anchor: e, focus: e }); }
    }
    activeEditor = api;
    if (edit.typed) insert(edit.typed, { coalesce: `type-${el.id}` });
    bumpTick();
    return () => { if (activeEditor && activeEditor.id === el.id) activeEditor = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // changes from outside (ribbon formatting, undo): redraw and keep the caret
  const propParas = useRef(body.paras);
  useLayoutEffect(() => {
    if (body.paras === propParas.current) return;
    propParas.current = body.paras;
    if (body.paras !== parasRef.current) {
      parasRef.current = body.paras;
      render();
      applySel(sel.current);
      bumpTick();
    }
  });

  // React's onBeforeInput is not the native event, so listen directly
  const handlerRef = useRef(null);
  useEffect(() => {
    const node = ref.current;
    const fn = (e) => handlerRef.current(e);
    node.addEventListener('beforeinput', fn);
    return () => node.removeEventListener('beforeinput', fn);
  }, []);

  useEffect(() => {
    const onSel = () => {
      const root = ref.current;
      const ds = window.getSelection();
      if (!root || !ds.rangeCount || composing.current) return;
      if (!root.contains(ds.anchorNode)) return;
      const a = domToPos(root, ds.anchorNode, ds.anchorOffset);
      const f = domToPos(root, ds.focusNode, ds.focusOffset);
      if (a && f) {
        const prev = sel.current;
        sel.current = { anchor: a, focus: f };
        if (T.cmpPos(prev.anchor, a) || T.cmpPos(prev.focus, f)) pending.current = null;
        bumpTick();
      }
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const insert = (text, opts) => {
    const r = range();
    const props = pending.current ? { ...T.propsAt(current(), r.start), ...pending.current } : null;
    const clean = props ? Object.fromEntries(Object.entries(props).filter(([k]) => T.RUN_KEYS.includes(k))) : null;
    const res = T.insertText(current(), r, text, clean);
    pending.current = null;
    apply(res.body, { anchor: res.pos, focus: res.pos }, opts);
  };

  const removeRange = (start, end) => {
    const res = T.deleteRange(current(), start, end);
    apply(res.body, { anchor: res.pos, focus: res.pos }, { coalesce: `del-${el.id}` });
  };

  const onBeforeInput = (e) => {
    const root = ref.current;
    const r = range();
    const collapsed = T.cmpPos(r.start, r.end) === 0;
    const t = e.inputType;
    if (t === 'insertCompositionText') return; // IME: handled on compositionend
    e.preventDefault();
    if (t === 'insertText' || t === 'insertReplacementText') {
      const text = e.data ?? (e.dataTransfer && e.dataTransfer.getData('text/plain')) ?? '';
      if (t === 'insertReplacementText' && e.getTargetRanges().length) {
        const tr = e.getTargetRanges()[0];
        const s = domToPos(root, tr.startContainer, tr.startOffset); const f = domToPos(root, tr.endContainer, tr.endOffset);
        if (s && f) { sel.current = { anchor: s, focus: f }; }
      }
      insert(text, { coalesce: `type-${el.id}` });
      return;
    }
    if (t === 'insertParagraph') {
      let b = current(); let pos = r.start;
      if (!collapsed) { const d = T.deleteRange(b, r.start, r.end); b = d.body; pos = d.pos; }
      const res = T.splitParagraph(b, pos);
      apply(res.body, { anchor: res.pos, focus: res.pos });
      return;
    }
    if (t === 'insertLineBreak') { insert('\v'); return; }
    if (t.startsWith('delete')) {
      if (t === 'deleteByCut' || t === 'deleteByDrag') return;
      if (!collapsed) { removeRange(r.start, r.end); return; }
      const ranges = e.getTargetRanges ? e.getTargetRanges() : [];
      if (ranges.length) {
        const tr = ranges[0];
        const s = domToPos(root, tr.startContainer, tr.startOffset); const f = domToPos(root, tr.endContainer, tr.endOffset);
        if (s && f && T.cmpPos(s, f) !== 0) { removeRange(T.cmpPos(s, f) < 0 ? s : f, T.cmpPos(s, f) < 0 ? f : s); return; }
      }
      const res = t.includes('Backward') ? T.deleteBackward(current(), r.start) : T.deleteForward(current(), r.start);
      apply(res.body, { anchor: res.pos, focus: res.pos }, { coalesce: `del-${el.id}` });
      return;
    }
    if (t === 'formatBold') return api.toggle('bold');
    if (t === 'formatItalic') return api.toggle('italic');
    if (t === 'formatUnderline') return api.toggle('underline');
    if (t === 'historyUndo') return undo();
    if (t === 'historyRedo') return redo();
  };

  handlerRef.current = onBeforeInput;

  const onCompositionStart = () => { composing.current = range(); };
  const onCompositionEnd = (e) => {
    const r = composing.current; composing.current = null;
    if (!r) return;
    sel.current = { anchor: r.start, focus: r.end };
    insert(e.data || '');
  };

  const onPaste = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = e.clipboardData.getData('text/plain');
    if (text) insert(text.replace(/\t/g, '\t'));
  };

  const onCopy = (e) => {
    const r = range();
    if (!T.cmpPos(r.start, r.end)) return;
    e.preventDefault();
    e.stopPropagation();
    e.clipboardData.setData('text/plain', selectedText(current(), r));
  };
  const onCut = (e) => {
    const r = range();
    e.stopPropagation();
    if (!T.cmpPos(r.start, r.end)) { e.preventDefault(); return; }
    e.preventDefault();
    e.clipboardData.setData('text/plain', selectedText(current(), r));
    removeRange(r.start, r.end);
  };

  const onKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    e.stopPropagation();
    if (k === 'Escape') { e.preventDefault(); stopEditing(); return; }
    if (k === 'Tab') {
      e.preventDefault();
      if (target.cell) { moveCellFocus(el.id, target.cell, e.shiftKey ? -1 : 1); return; }
      const r = range();
      const p = current().paras[r.start.p];
      if (p.bullet || (r.start.o === 0 && T.cmpPos(r.start, r.end) === 0) || r.start.p !== r.end.p) {
        api.changeLevel(e.shiftKey ? -1 : 1);
      } else insert('\t');
      return;
    }
    if (mod && !e.altKey) {
      const lower = k.toLowerCase();
      if (lower === 'b') { e.preventDefault(); api.toggle('bold'); return; }
      if (lower === 'i') { e.preventDefault(); api.toggle('italic'); return; }
      if (lower === 'u') { e.preventDefault(); api.toggle('underline'); return; }
      if (lower === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (lower === 'y') { e.preventDefault(); redo(); return; }
      if (lower === 'a') { e.preventDefault(); applySel({ anchor: { p: 0, o: 0 }, focus: T.endPos(current()) }); bumpTick(); return; }
      if (lower === 'e') { e.preventDefault(); api.applyPara({ align: 'ctr' }); return; }
      if (lower === 'l') { e.preventDefault(); api.applyPara({ align: 'l' }); return; }
      if (lower === 'r') { e.preventDefault(); api.applyPara({ align: 'r' }); return; }
      if (lower === 'j') { e.preventDefault(); api.applyPara({ align: 'just' }); return; }
      if (k === ']' || (e.shiftKey && (k === '>' || k === '.'))) { e.preventDefault(); api.growFont(1); return; }
      if (k === '[' || (e.shiftKey && (k === '<' || k === ','))) { e.preventDefault(); api.growFont(-1); return; }
      if (lower === 's' || lower === 'p' || lower === 'm' || lower === 'k') {
        // let the global handler see save / print / new slide
        return;
      }
    }
  };

  const api = {
    id: el.id,
    cell: target.cell,
    getRange: () => range(),
    getBody: () => current(),
    focus: () => { ref.current && ref.current.focus({ preventScroll: true }); applySel(sel.current); },
    selectRange: (r) => applySel({ anchor: r.start, focus: r.end }),
    applyRun: (props) => {
      let r = range();
      const b = current();
      if (!T.cmpPos(r.start, r.end)) {
        const w = T.wordRange(b, r.start);
        if (!T.cmpPos(w.start, w.end)) {
          pending.current = { ...(pending.current || {}), ...resolveProps(props, T.propsAt(b, r.start)) };
          bumpTick();
          api.focus();
          return;
        }
        const nb = T.applyRunProps(b, w, props);
        apply(nb, sel.current);
        api.focus();
        return;
      }
      const nb = T.applyRunProps(b, r, props);
      apply(nb, sel.current);
      api.focus();
    },
    applyPara: (props) => {
      const nb = T.applyParaProps(current(), range(), props);
      apply(nb, sel.current);
      api.focus();
    },
    toggle: (key) => {
      const props = api.getProps();
      api.applyRun({ [key]: !(props[key] === true) });
    },
    growFont: (dir) => {
      api.applyRun({ size: (v) => stepFont(v || 18, dir) });
    },
    changeLevel: (dir) => {
      const nb = T.applyParaProps(current(), range(), {});
      const r = range();
      for (let i = r.start.p; i <= r.end.p; i++) {
        const p = nb.paras[i];
        p.level = Math.max(0, Math.min(8, (p.level || 0) + dir));
        Object.assign(p, T.bulletIndent(p.level, p.bullet));
      }
      apply(nb, sel.current);
      api.focus();
    },
    changeCase: (mode) => {
      const nb = T.changeCase(current(), range(), mode);
      apply(nb, sel.current);
      api.focus();
    },
    insertText: (text, props) => {
      if (props) pending.current = { ...(pending.current || {}), ...props };
      insert(text);
      api.focus();
    },
    insertRun: (run) => {
      // insert a special run (linked number, field) at the selection
      const r = range();
      let b = current(); let pos = r.start;
      if (T.cmpPos(r.start, r.end)) { const d = T.deleteRange(b, r.start, r.end); b = d.body; pos = d.pos; }
      b = JSON.parse(JSON.stringify(b));
      const p = b.paras[pos.p];
      const base = T.propsAt(b, pos);
      const idx = T.splitAt(p, pos.o);
      const clean = Object.fromEntries(Object.entries(base).filter(([k]) => T.RUN_KEYS.includes(k)));
      p.runs.splice(idx, 0, { ...clean, ...run });
      T.normalizePara(p);
      const np = { p: pos.p, o: pos.o + (run.text || '').length };
      apply(b, { anchor: np, focus: np });
      api.focus();
    },
    getProps: () => {
      const b = current();
      const r = range();
      const props = T.commonRunProps(b, r);
      if (pending.current) Object.assign(props, pending.current);
      return props;
    },
    getParaProps: () => T.commonParaProps(current(), range()),
  };
  activeEditor = activeEditor && activeEditor.id === el.id ? api : activeEditor;

  return (
    <div className="tb" style={boxStyle}>
      <div
        ref={ref}
        className="tb-in editor"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onCompositionStart={onCompositionStart}
        onCompositionEnd={(e) => onCompositionEnd(e.nativeEvent)}
        onPaste={onPaste}
        onCopy={onCopy}
        onCut={onCut}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function resolveProps(props, base) {
  const out = {};
  for (const [k, v] of Object.entries(props)) out[k] = typeof v === 'function' ? v(base[k], base) : v;
  return out;
}

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
export function stepFont(v, dir) {
  if (dir > 0) return SIZES.find((s) => s > v) || v + 8;
  const smaller = SIZES.filter((s) => s < v);
  return smaller.length ? smaller[smaller.length - 1] : Math.max(1, v - 1);
}

function selectedText(b, r) {
  const out = [];
  for (let pi = r.start.p; pi <= r.end.p; pi++) {
    const t = T.paraText(b.paras[pi]);
    const s = pi === r.start.p ? r.start.o : 0;
    const e = pi === r.end.p ? r.end.o : t.length;
    out.push(t.slice(s, e));
  }
  return out.join('\r\n');
}
