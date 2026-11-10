// One store for the whole app: the deck (with undo/redo) plus UI state.
import { useRef, useSyncExternalStore, useCallback } from 'react';
import { produce, setAutoFreeze } from 'immer';
import { findIn } from './model.js';

setAutoFreeze(false);

const listeners = new Set();
let state = {
  deck: null,
  path: null,
  dirty: false,
  saveState: 'saved', // saved | unsaved | saving | error
  saveError: null,
  lastSaved: null,
  rev: 0,
  past: [],
  future: [],
  settings: {},
  fonts: [],
  charts: [], // chart library listing
  ui: {
    slideId: null,
    slideSel: [],
    selection: [],
    editing: null, // { id, cell: [r, c] }
    cellSel: null, // { id, r1, c1, r2, c2 }
    zoom: 0.6,
    fit: true,
    tab: 'home',
    backstage: null, // null | 'home' | 'open' | ...
    view: 'normal', // normal | sorter | master
    masterTarget: 'master',
    notes: true,
    notesHeight: 96,
    panelWidth: 212,
    gridlines: false,
    guides: false,
    smartGuides: true,
    testing: false,
    insertMode: null, // { kind: 'shape', geom } | { kind: 'textbox' } | { kind: 'line', variant }
    dialog: null, // { type, ...props }
    menu: null, // context menu { x, y, items }
    toasts: [],
    show: null, // slideshow { index }
    focus: 'canvas', // canvas | slides | notes
    textTick: 0,
    formatPainter: null,
    units: 'cm',
    chartBusy: false,
  },
};

const history = { limit: 200 };
let coalesceInfo = { key: null, time: 0 };
let commitHooks = [];

export function getState() {
  return state;
}

function emit() {
  for (const l of listeners) l();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(partial) {
  const next = typeof partial === 'function' ? partial(state) : partial;
  state = { ...state, ...next };
  emit();
}

export function setUI(partial) {
  const next = typeof partial === 'function' ? partial(state.ui) : partial;
  state = { ...state, ui: { ...state.ui, ...next } };
  emit();
}

export function onCommit(fn) {
  commitHooks.push(fn);
  return () => { commitHooks = commitHooks.filter((f) => f !== fn); };
}

function uiSnapshot() {
  const u = state.ui;
  return { slideId: u.slideId, selection: u.selection, view: u.view, masterTarget: u.masterTarget };
}

// Change the deck. recipe(draft) mutates a draft copy (immer).
// opts.coalesce: merge quick successive edits (typing) into one undo step
// opts.silent: change without adding an undo step (e.g. auto-fit heights)
export function commit(recipe, opts = {}) {
  const before = state.deck;
  const after = produce(before, recipe);
  if (after === before) return false;
  let past = state.past;
  const now = Date.now();
  if (!opts.silent) {
    const merge = opts.coalesce && coalesceInfo.key === opts.coalesce && now - coalesceInfo.time < 1500;
    if (!merge) {
      past = [...past, { deck: before, ui: uiSnapshot() }];
      if (past.length > history.limit) past = past.slice(past.length - history.limit);
    }
    coalesceInfo = { key: opts.coalesce || null, time: now };
  }
  state = {
    ...state, deck: after, past, future: opts.silent ? state.future : [],
    dirty: true, saveState: 'unsaved', rev: state.rev + 1,
  };
  emit();
  for (const h of commitHooks) h(opts);
  return true;
}

export function resetHistory() {
  state = { ...state, past: [], future: [] };
  coalesceInfo = { key: null, time: 0 };
}

export function undo() {
  const { past, future, deck } = state;
  if (!past.length) return;
  const prev = past[past.length - 1];
  state = {
    ...state, deck: prev.deck, past: past.slice(0, -1), future: [{ deck, ui: uiSnapshot() }, ...future],
    dirty: true, saveState: 'unsaved', rev: state.rev + 1,
    ui: { ...state.ui, ...restoreUI(prev.deck, prev.ui), editing: null, cellSel: null },
  };
  coalesceInfo = { key: null, time: 0 };
  emit();
  for (const h of commitHooks) h({ undo: true });
}

export function redo() {
  const { past, future, deck } = state;
  if (!future.length) return;
  const next = future[0];
  state = {
    ...state, deck: next.deck, future: future.slice(1), past: [...past, { deck, ui: uiSnapshot() }],
    dirty: true, saveState: 'unsaved', rev: state.rev + 1,
    ui: { ...state.ui, ...restoreUI(next.deck, next.ui), editing: null, cellSel: null },
  };
  coalesceInfo = { key: null, time: 0 };
  emit();
  for (const h of commitHooks) h({ redo: true });
}

function restoreUI(deck, ui) {
  const slideId = deck.slides.find((s) => s.id === ui.slideId) ? ui.slideId : deck.slides[0]?.id;
  return { slideId, selection: ui.selection || [], view: ui.view, masterTarget: ui.masterTarget, slideSel: [slideId] };
}

// React hook: re-render when the selected value changes
export function useStore(selector, equal = Object.is) {
  const cache = useRef({ has: false, value: undefined });
  const getSnapshot = useCallback(() => {
    const v = selector(state);
    if (cache.current.has && equal(cache.current.value, v)) return cache.current.value;
    cache.current = { has: true, value: v };
    return v;
  }, [selector, equal]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const shallow = (a, b) => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a); const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
};

// ------------------------------------------------------------- surfaces
// The thing being edited on the canvas: a slide, the master, or a layout.
export function surfaceOf(deck, ui) {
  if (!deck) return null;
  if (ui.view === 'master') {
    if (ui.masterTarget === 'master') return { kind: 'master', id: 'master', elements: deck.master.elements, background: deck.master.background };
    const l = deck.layouts.find((x) => x.id === ui.masterTarget) || deck.layouts[0];
    return { kind: 'layout', id: l.id, elements: l.elements, background: l.background, layout: l };
  }
  const slide = deck.slides.find((s) => s.id === ui.slideId) || deck.slides[0];
  return slide ? { kind: 'slide', id: slide.id, elements: slide.elements, slide } : null;
}

export function surfaceDraft(draft, ui = state.ui) {
  if (ui.view === 'master') {
    if (ui.masterTarget === 'master') return draft.master.elements;
    const l = draft.layouts.find((x) => x.id === ui.masterTarget) || draft.layouts[0];
    return l.elements;
  }
  const slide = draft.slides.find((s) => s.id === ui.slideId) || draft.slides[0];
  return slide.elements;
}

export function currentSurface() {
  return surfaceOf(state.deck, state.ui);
}

export function selectedElements() {
  const surf = currentSurface();
  if (!surf) return [];
  return state.ui.selection.map((id) => findIn(surf.elements, id)).filter(Boolean);
}

export function updateSelected(fn, opts) {
  const ids = state.ui.selection;
  if (!ids.length) return;
  commit((d) => {
    const els = surfaceDraft(d);
    ids.forEach((id) => {
      const e = findIn(els, id);
      if (e) fn(e, d);
    });
  }, opts);
}

export function updateElement(id, fn, opts) {
  commit((d) => {
    const e = findIn(surfaceDraft(d), id);
    if (e) fn(e, d);
  }, opts);
}

// -------------------------------------------------------------- toasts
let toastId = 0;
export function toast(message, opts = {}) {
  const id = ++toastId;
  const t = { id, message, kind: opts.kind || 'info', actions: opts.actions || [], sticky: !!opts.sticky };
  setUI((u) => ({ toasts: [...u.toasts, t] }));
  if (!opts.sticky) setTimeout(() => dismissToast(id), opts.ms || (opts.kind === 'error' ? 9000 : 4500));
  return id;
}

export function dismissToast(id) {
  setUI((u) => ({ toasts: u.toasts.filter((t) => t.id !== id) }));
}

export function openDialog(type, props = {}) {
  setUI({ dialog: { type, ...props }, menu: null });
}

export function closeDialog() {
  setUI({ dialog: null });
}

// a promise-based confirm, rendered by the Dialogs host
export function ask(title, message, buttons = [{ id: 'ok', label: 'OK', primary: true }, { id: 'cancel', label: 'Cancel' }]) {
  return new Promise((resolve) => {
    openDialog('ask', { title, message, buttons, resolve });
  });
}

export function promptText(title, label, value = '', opts = {}) {
  return new Promise((resolve) => {
    openDialog('prompt', { title, label, value, resolve, ...opts });
  });
}
