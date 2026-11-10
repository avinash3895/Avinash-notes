import React, { useEffect, useState } from 'react';
import { useStore, getState, setUI, setState, undo, redo, dismissToast, selectedElements, currentSurface, toast } from './lib/store.js';
import { get, post } from './lib/api.js';
import { newDeck, EMU_PER_PT, EMU_PER_IN } from './lib/model.js';
import * as A from './lib/actions.js';
import {
  initSync, joinDeck, loadDeck, openDeckPath, saveDeck, saveDeckAs, openDeckCmd, newDeckCmd, loadSettings,
} from './lib/files.js';
import { loadChartLibrary, rerenderAllCharts, refreshLinks } from './lib/data.js';
import TitleBar from './ui/TitleBar.jsx';
import Ribbon from './ui/Ribbon.jsx';
import SlidePanel, { PanelSplitter } from './ui/SlidePanel.jsx';
import Canvas from './editor/Canvas.jsx';
import StatusBar, { NotesPane } from './ui/StatusBar.jsx';
import Backstage from './ui/Backstage.jsx';
import DialogHost from './ui/dialogs/Dialogs.jsx';
import ContextMenuHost from './ui/ContextMenu.jsx';
import SlideShow, { SlideSorter } from './ui/SlideShow.jsx';
import { IClose, IWarn, IOk, IInfo } from './ui/icons.js';

function Toasts() {
  const toasts = useStore((s) => s.ui.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="toast-ico">{t.kind === 'error' || t.kind === 'warn' ? <IWarn /> : t.kind === 'success' ? <IOk /> : <IInfo />}</span>
          <span className="toast-msg">{t.message}</span>
          {t.actions.map((a) => <button key={a.label} className="toast-act" onClick={() => { a.run(); dismissToast(t.id); }}>{a.label}</button>)}
          <button className="toast-x" onClick={() => dismissToast(t.id)}><IClose /></button>
        </div>
      ))}
    </div>
  );
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function onKeyDown(e) {
  const st = getState();
  if (st.ui.show || st.ui.dialog) return;
  if (st.ui.backstage) { if (e.key === 'Escape') setUI({ backstage: null }); return; }
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key;
  const lower = k.length === 1 ? k.toLowerCase() : k;
  if (mod && lower === 's') { e.preventDefault(); if (e.shiftKey) saveDeckAs(); else saveDeck(); return; }
  if (mod && lower === 'o') { e.preventDefault(); openDeckCmd(); return; }
  if (mod && lower === 'n') { e.preventDefault(); newDeckCmd(); return; }
  if (k === 'F5') { e.preventDefault(); A.startShow(e.shiftKey); return; }
  if (k === 'F12') { e.preventDefault(); saveDeckAs(); return; }
  if (isTyping(e)) return;
  const sel = st.ui.selection;
  const slidesFocus = st.ui.focus === 'slides';
  if (mod && lower === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && lower === 'y') { e.preventDefault(); redo(); return; }
  if (mod && lower === 'm') { e.preventDefault(); A.addSlide(); return; }
  if (mod && lower === 'c') { e.preventDefault(); A.copySelection(); return; }
  if (mod && lower === 'x') { e.preventDefault(); A.cutSelection(); return; }
  if (mod && lower === 'd') { e.preventDefault(); if (slidesFocus || !sel.length) A.duplicateSlides(st.ui.slideSel); else A.duplicateSelected(); return; }
  if (mod && lower === 'a') { e.preventDefault(); if (slidesFocus) setUI({ slideSel: st.deck.slides.map((s) => s.id) }); else A.selectAll(); return; }
  if (mod && lower === 'g') { e.preventDefault(); if (e.shiftKey) A.ungroupSelected(); else A.groupSelected(); return; }
  if (mod && e.shiftKey && (k === '}' || k === ']')) { e.preventDefault(); A.order('front'); return; }
  if (mod && e.shiftKey && (k === '{' || k === '[')) { e.preventDefault(); A.order('back'); return; }
  if (mod && (lower === 'b' || lower === 'i' || lower === 'u') && sel.length) {
    e.preventDefault();
    const key = { b: 'bold', i: 'italic', u: 'underline' }[lower];
    const cur = A.currentRunProps();
    A.formatRun({ [key]: cur[key] !== true });
    return;
  }
  if (mod && ['e', 'l', 'r', 'j'].includes(lower) && sel.length) { e.preventDefault(); A.formatPara({ align: { e: 'ctr', l: 'l', r: 'r', j: 'just' }[lower] }); return; }
  if (mod && (k === ']' || k === '[') && sel.length) { e.preventDefault(); import('./editor/TextEditor.jsx').then((m) => A.formatRun({ size: (v) => m.stepFont(v || 18, k === ']' ? 1 : -1) })); return; }
  if (k === 'Escape') {
    if (st.ui.insertMode || st.ui.formatPainter) { setUI({ insertMode: null, formatPainter: null }); return; }
    if (st.ui.cellSel) { setUI({ cellSel: null }); return; }
    if (sel.length) { A.clearSelection(); return; }
    return;
  }
  if (k === 'Delete' || k === 'Backspace') {
    e.preventDefault();
    if (slidesFocus) A.deleteSlides(st.ui.slideSel); else if (sel.length) A.deleteSelected();
    return;
  }
  if (slidesFocus && st.ui.view !== 'master') {
    const idx = st.deck.slides.findIndex((s) => s.id === st.ui.slideId);
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); const n = st.deck.slides[Math.min(idx + 1, st.deck.slides.length - 1)]; A.goToSlide(n.id); return; }
    if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); const n = st.deck.slides[Math.max(idx - 1, 0)]; A.goToSlide(n.id); return; }
    if (k === 'Enter') { e.preventDefault(); A.addSlide(); return; }
  }
  if (k.startsWith('Arrow') && sel.length) {
    e.preventDefault();
    const step = mod ? 9525 : Math.round(0.05 * EMU_PER_IN);
    A.nudge(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0);
    return;
  }
  if (!sel.length && (k === 'PageDown' || k === 'PageUp') && st.ui.view === 'normal') {
    e.preventDefault();
    const idx = st.deck.slides.findIndex((s) => s.id === st.ui.slideId);
    const n = st.deck.slides[Math.max(0, Math.min(st.deck.slides.length - 1, idx + (k === 'PageDown' ? 1 : -1)))];
    A.goToSlide(n.id);
    return;
  }
  if (k === 'Tab') {
    e.preventDefault();
    const surf = currentSurface();
    if (!surf || !surf.elements.length) return;
    const i = surf.elements.findIndex((x) => x.id === sel[0]);
    const next = surf.elements[(i + (e.shiftKey ? -1 : 1) + surf.elements.length) % surf.elements.length];
    A.select([next.id]);
    return;
  }
  const one = sel.length === 1 ? selectedElements()[0] : null;
  if (one && one.type === 'shape' && one.text) {
    if (k === 'Enter' || k === 'F2') { e.preventDefault(); A.startEditing(one.id, { selectAll: k === 'Enter' }); return; }
    if (k.length === 1 && !mod && !e.altKey) { e.preventDefault(); A.startEditing(one.id, { selectAll: true, typed: k }); }
  }
}

export default function App({ join }) {
  const deck = useStore((s) => s.deck);
  const view = useStore((s) => s.ui.view);
  const notes = useStore((s) => s.ui.notes);
  const [boot, setBoot] = useState('Starting Deck Studio...');

  useEffect(() => {
    (async () => {
      initSync();
      const settings = await loadSettings();
      if (!settings || !settings.chartLibrary) setBoot(null);
      get('/api/fonts').then((r) => setState({ fonts: r.fonts })).catch(() => {});
      loadChartLibrary();
      let opened = false;
      if (join) opened = await joinDeck(join);
      if (!opened) {
        let last = '';
        try { last = localStorage.getItem('ds:lastPath') || ''; } catch (e) { /* ignore */ }
        if (last) {
          try {
            const ex = await post('/api/fs/exists', { path: last });
            if (ex.isFile) { await openDeckPath(last); opened = !!getState().deck; }
          } catch (e) { /* ignore */ }
        }
      }
      if (!getState().deck) {
        const d = newDeck();
        loadDeck(d, null);
        await seedDemoIfFirstRun();
      }
      setBoot(null);
    })().catch((e) => setBoot(`Could not start: ${e.message}`));
  }, [join]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    const onPaste = (e) => {
      if (isTyping(e) || getState().ui.dialog || getState().ui.backstage) return;
      A.pasteFromSystem(e);
    };
    document.addEventListener('paste', onPaste);
    const onChartCode = async (ev) => {
      const m = ev.detail || {};
      await loadChartLibrary();
      if (m.type === 'chart-promoted' || getState().ui.testing) {
        await rerenderAllCharts(m.name);
        toast(m.type === 'chart-promoted' ? `Charts redrawn with the new production version of "${m.name}".` : `Charts redrawn with your testing code for "${m.name}".`);
      }
    };
    window.addEventListener('ds-chart-code', onChartCode);
    const beforeUnload = (e) => {
      const st = getState();
      if (st.dirty && st.saveState !== 'saved') { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('ds-chart-code', onChartCode);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  if (!deck) return <div className="boot">{boot || 'Loading...'}</div>;
  return (
    <div className="app">
      <TitleBar />
      <Ribbon />
      <div className="workspace">
        {view === 'sorter' ? <SlideSorter /> : (
          <>
            <SlidePanel />
            <PanelSplitter />
            <div className="editor-col">
              <Canvas />
              {notes && view === 'normal' && <NotesPane />}
            </div>
          </>
        )}
      </div>
      <StatusBar />
      <Backstage />
      <DialogHost />
      <ContextMenuHost />
      <SlideShow />
      <Toasts />
    </div>
  );
}

// First run: a short demo deck that shows the main chart linked to sample Excel files
async function seedDemoIfFirstRun() {
  let seen = false;
  try { seen = localStorage.getItem('ds:seenDemo') === '1'; } catch (e) { /* ignore */ }
  if (seen) return;
  try { localStorage.setItem('ds:seenDemo', '1'); } catch (e) { /* ignore */ }
  try {
    const { buildDemoDeck } = await import('./lib/demo.js');
    const deck = await buildDemoDeck();
    if (deck) loadDeck(deck, null);
    await rerenderAllCharts();
    await refreshLinks('all', { quiet: true });
  } catch (e) {
    console.warn('demo deck failed', e);
  }
  void EMU_PER_PT;
}
