import React, { useEffect, useRef, useState } from 'react';
import { useStore, setUI, getState, commit } from '../lib/store.js';
import { setZoom, zoomStep, setView, startShow } from '../lib/actions.js';
import { INotes, INormal, ISorter, IPlay, IZoomFit, ITesting } from './icons.js';

export default function StatusBar() {
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.ui.slideId);
  const view = useStore((s) => s.ui.view);
  const zoom = useStore((s) => s.ui.zoom);
  const notes = useStore((s) => s.ui.notes);
  const testing = useStore((s) => s.ui.testing);
  const insertMode = useStore((s) => s.ui.insertMode);
  const fp = useStore((s) => s.ui.formatPainter);
  const masterTarget = useStore((s) => s.ui.masterTarget);
  const idx = deck.slides.findIndex((s) => s.id === slideId);
  const pct = Math.round(zoom * 100);
  const toSlider = (z) => (z <= 1 ? (z - 0.1) / 0.9 * 50 : 50 + (z - 1) / 3 * 50);
  const fromSlider = (v) => (v <= 50 ? 0.1 + v / 50 * 0.9 : 1 + (v - 50) / 50 * 3);
  let left = view === 'master'
    ? (masterTarget === 'master' ? 'Slide Master' : `Layout: ${(deck.layouts.find((l) => l.id === masterTarget) || {}).name}`)
    : `Slide ${idx + 1} of ${deck.slides.length}`;
  if (insertMode) left += '  •  Click and drag to draw (Esc to cancel)';
  if (fp) left += '  •  Format Painter: click an object';
  return (
    <div className="statusbar">
      <div className="sb-left">
        <span>{left}</span>
        {testing && <span className="sb-testing"><ITesting /> Charts use testing code</span>}
      </div>
      <div className="sb-right">
        <button className={`sb-btn${notes ? ' on' : ''}`} onClick={() => setUI({ notes: !notes })} title="Notes"><INotes /> Notes</button>
        <span className="sb-div" />
        <button className={`sb-icon${view === 'normal' ? ' on' : ''}`} title="Normal" onClick={() => setView('normal')}><INormal /></button>
        <button className={`sb-icon${view === 'sorter' ? ' on' : ''}`} title="Slide Sorter" onClick={() => setView('sorter')}><ISorter /></button>
        <button className="sb-icon" title="Slide Show (Shift+F5)" onClick={() => startShow(true)}><IPlay /></button>
        <span className="sb-div" />
        <button className="sb-zoom-btn" onClick={() => zoomStep(-1)} title="Zoom Out">−</button>
        <input className="zoom-slider" type="range" min="0" max="100" step="0.5" value={toSlider(zoom)} onChange={(e) => setZoom(fromSlider(Number(e.target.value)))} />
        <button className="sb-zoom-btn" onClick={() => zoomStep(1)} title="Zoom In">+</button>
        <button className="sb-pct" onClick={() => import('../lib/store.js').then((m) => m.openDialog('zoom'))} title="Zoom">{pct}%</button>
        <button className="sb-icon" title="Fit slide to current window" onClick={() => setUI({ fit: true })}><IZoomFit /></button>
      </div>
    </div>
  );
}

export function NotesPane() {
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.ui.slideId);
  const height = useStore((s) => s.ui.notesHeight);
  const slide = deck.slides.find((s) => s.id === slideId);
  const [text, setText] = useState(slide ? slide.notes || '' : '');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(slide ? slide.notes || '' : ''); }, [slide && slide.notes, slideId]);
  if (!slide) return null;
  const onDown = (e) => {
    e.preventDefault();
    const startY = e.clientY; const startH = getState().ui.notesHeight;
    const move = (ev) => setUI({ notesHeight: Math.max(40, Math.min(400, startH - (ev.clientY - startY))) });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="notes-pane" style={{ height }}>
      <div className="splitter h" onPointerDown={onDown} />
      <textarea value={text} placeholder="Click to add notes" spellCheck
        onFocus={() => { focused.current = true; setUI({ focus: 'notes', selection: [], editing: null }); }}
        onBlur={() => { focused.current = false; }}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = e.target.value; setText(v);
          commit((d) => { const s = d.slides.find((x) => x.id === slideId); if (s) s.notes = v; }, { coalesce: `notes-${slideId}` });
        }} />
    </div>
  );
}
