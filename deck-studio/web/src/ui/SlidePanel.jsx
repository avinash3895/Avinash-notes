import React, { useEffect, useRef, useState } from 'react';
import { useStore, getState, setUI } from '../lib/store.js';
import { ScaledSlide } from '../render/SlideView.jsx';
import * as A from '../lib/actions.js';
import { openContextMenu } from './ContextMenu.jsx';

function SlideThumb({ deck, slide, index, width, selected, current, onDown, onDragStart, dropBefore }) {
  return (
    <div className={`thumb-row${current ? ' current' : ''}${selected ? ' selected' : ''}${slide.hidden ? ' hidden-slide' : ''}`}
      onMouseDown={onDown} draggable onDragStart={onDragStart} data-index={index}>
      {dropBefore && <div className="drop-line" />}
      <div className="thumb-num">{index + 1}{slide.hidden && <span className="hid-mark" title="Hidden slide">⊘</span>}</div>
      <div className="thumb-box">
        <ScaledSlide deck={deck} slide={slide} width={width} slideNumber={index + 1} />
      </div>
    </div>
  );
}

export default function SlidePanel() {
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.ui.slideId);
  const slideSel = useStore((s) => s.ui.slideSel);
  const view = useStore((s) => s.ui.view);
  const masterTarget = useStore((s) => s.ui.masterTarget);
  const width = useStore((s) => s.ui.panelWidth);
  const [drop, setDrop] = useState(null);
  const dragIds = useRef(null);
  const listRef = useRef(null);
  const thumbW = width - 52;

  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector('.thumb-row.current');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [slideId]);

  if (view === 'master') {
    const items = [{ id: 'master', name: 'Slide Master', surface: { kind: 'master', id: 'master', elements: deck.master.elements, background: deck.master.background } },
      ...deck.layouts.map((l) => ({ id: l.id, name: l.name, surface: { kind: 'layout', id: l.id, elements: l.elements, background: l.background, layout: l } }))];
    return (
      <div className="slide-panel master" style={{ width }}>
        <div className="sp-list">
          {items.map((it, i) => (
            <div key={it.id} className={`thumb-row${masterTarget === it.id ? ' current selected' : ''}${i > 0 ? ' layout' : ''}`}
              onMouseDown={() => setUI({ masterTarget: it.id, selection: [], editing: null })} title={it.name}>
              <div className="thumb-num">{i === 0 ? '' : ''}</div>
              <div className="thumb-box">
                <ScaledSlide deck={deck} surface={it.surface} width={i === 0 ? thumbW : thumbW - 22} mode="edit" slideNumber="#" />
                <div className="thumb-caption">{it.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const onDown = (e, s, i) => {
    const st = getState();
    setUI({ focus: 'slides' });
    if (e.button === 2) {
      if (!st.ui.slideSel.includes(s.id)) A.goToSlide(s.id);
      return;
    }
    if (e.shiftKey) {
      const cur = deck.slides.findIndex((x) => x.id === st.ui.slideId);
      const [a, b] = [Math.min(cur, i), Math.max(cur, i)];
      setUI({ slideSel: deck.slides.slice(a, b + 1).map((x) => x.id), selection: [], editing: null });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const sel = st.ui.slideSel.includes(s.id) ? st.ui.slideSel.filter((x) => x !== s.id) : [...st.ui.slideSel, s.id];
      setUI({ slideSel: sel.length ? sel : [s.id], slideId: s.id, selection: [], editing: null });
      return;
    }
    if (st.ui.slideSel.includes(s.id) && st.ui.slideSel.length > 1) { setUI({ slideId: s.id, selection: [], editing: null }); return; }
    A.goToSlide(s.id);
  };

  const onDragStart = (e, s) => {
    const sel = getState().ui.slideSel;
    dragIds.current = sel.includes(s.id) ? sel : [s.id];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'slides');
  };

  const onDragOver = (e) => {
    if (!dragIds.current) return;
    e.preventDefault();
    const rows = [...listRef.current.querySelectorAll('.thumb-row')];
    let idx = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { idx = i; break; }
    }
    setDrop(idx);
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (dragIds.current != null && drop != null) A.moveSlides(dragIds.current, drop);
    dragIds.current = null;
    setDrop(null);
  };

  return (
    <div className="slide-panel" style={{ width }} onContextMenu={(e) => { e.preventDefault(); openContextMenu(e.clientX, e.clientY, 'slides'); }}
      onMouseDown={() => setUI({ focus: 'slides' })}>
      <div className="sp-list" ref={listRef} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={() => setDrop(null)} onDragEnd={() => { dragIds.current = null; setDrop(null); }}>
        {deck.slides.map((s, i) => (
          <SlideThumb key={s.id} deck={deck} slide={s} index={i} width={thumbW} current={s.id === slideId}
            selected={slideSel.includes(s.id)} dropBefore={drop === i}
            onDown={(e) => onDown(e, s, i)} onDragStart={(e) => onDragStart(e, s)} />
        ))}
        {drop === deck.slides.length && <div className="drop-line end" />}
        <div className="sp-tail" onDoubleClick={() => A.addSlide()} title="Double-click to add a slide" />
      </div>
    </div>
  );
}

export function PanelSplitter() {
  const onDown = (e) => {
    e.preventDefault();
    const startX = e.clientX; const startW = getState().ui.panelWidth;
    const move = (ev) => setUI({ panelWidth: Math.max(130, Math.min(420, startW + ev.clientX - startX)) });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div className="splitter v" onPointerDown={onDown} />;
}
