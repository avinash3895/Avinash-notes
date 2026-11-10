import React, { useEffect, useRef, useState } from 'react';
import { useStore, setUI } from '../lib/store.js';
import { px } from '../lib/model.js';
import SlideView, { slideSurface } from '../render/SlideView.jsx';
import { stopShow } from '../lib/actions.js';

// Full-screen slide show. Only what is inside the slide is shown.
export default function SlideShow() {
  const show = useStore((s) => s.ui.show);
  const deck = useStore((s) => s.deck);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [typed, setTyped] = useState('');
  const [cursor, setCursor] = useState(true);
  const hideTimer = useRef(null);
  const visible = deck.slides.map((s, i) => ({ s, i })).filter((x) => !x.s.hidden);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    const onFs = () => { if (!document.fullscreenElement) setUI({ show: null }); };
    document.addEventListener('fullscreenchange', onFs);
    return () => { window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onFs); };
  }, []);

  if (!show) return null;
  let pos = visible.findIndex((x) => x.i >= show.index);
  if (pos < 0) pos = visible.length - 1;
  const ended = show.end;
  const go = (p) => {
    if (p < 0) return;
    if (p >= visible.length) { setUI({ show: { index: deck.slides.length, end: true } }); return; }
    setUI({ show: { index: visible[p].i } });
  };
  const onKey = (e) => {
    e.preventDefault(); e.stopPropagation();
    const k = e.key;
    if (k === 'Escape') { stopShow(); return; }
    if (/^[0-9]$/.test(k)) { setTyped(typed + k); return; }
    if (k === 'Enter' && typed) { const n = parseInt(typed, 10) - 1; setTyped(''); const p = visible.findIndex((x) => x.i === n); if (p >= 0) go(p); return; }
    if (ended) { if (['ArrowLeft', 'PageUp', 'Backspace', 'p'].includes(k)) go(visible.length - 1); else stopShow(); return; }
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(k)) go(pos + 1);
    if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(k)) go(pos - 1);
    if (k === 'Home') go(0);
    if (k === 'End') go(visible.length - 1);
    if (k === 'b' || k === '.') setUI({ show: { ...show, black: !show.black } });
    if (k === 'w' || k === ',') setUI({ show: { ...show, white: !show.white } });
  };
  const W = px(deck.size.w); const H = px(deck.size.h);
  const s = Math.min(vp.w / W, vp.h / H);
  const cur = visible[pos];
  return (
    <div className={`slideshow${cursor ? '' : ' nocursor'}`} tabIndex={0} ref={(el) => el && el.focus()} onKeyDown={onKey}
      onMouseMove={() => { setCursor(true); clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setCursor(false), 2500); }}
      onClick={() => (ended ? stopShow() : go(pos + 1))} onContextMenu={(e) => { e.preventDefault(); go(pos - 1); }}>
      {ended ? (
        <div className="show-end">End of slide show, click to exit.</div>
      ) : cur && (
        <div className="show-stage" style={{ width: W * s, height: H * s }}>
          <div style={{ transform: `scale(${s})`, transformOrigin: '0 0', width: W, height: H }}>
            <SlideView deck={deck} surface={slideSurface(cur.s)} mode="show" slideNumber={cur.i + 1} />
          </div>
        </div>
      )}
      {(show.black || show.white) && <div className="show-blank" style={{ background: show.white ? '#fff' : '#000' }} />}
      {cursor && !ended && (
        <div className="show-controls" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => go(pos - 1)} title="Previous">‹</button>
          <span>{pos + 1} / {visible.length}</span>
          <button onClick={() => go(pos + 1)} title="Next">›</button>
          <button onClick={stopShow} title="End show (Esc)">End</button>
        </div>
      )}
    </div>
  );
}

export function SlideSorter() {
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.ui.slideId);
  const slideSel = useStore((s) => s.ui.slideSel);
  const [size, setSize] = useState(240);
  const [drop, setDrop] = useState(null);
  const drag = useRef(null);
  return (
    <div className="sorter" onMouseDown={() => setUI({ focus: 'slides' })}>
      <div className="sorter-grid" onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (drag.current && drop != null) import('../lib/actions.js').then((A) => A.moveSlides(drag.current, drop)); drag.current = null; setDrop(null); }}>
        {deck.slides.map((s, i) => (
          <div key={s.id} className={`sorter-item${s.id === slideId ? ' current' : ''}${slideSel.includes(s.id) ? ' selected' : ''}${s.hidden ? ' hidden-slide' : ''}${drop === i ? ' drop' : ''}`}
            draggable onDragStart={() => { drag.current = slideSel.includes(s.id) ? slideSel : [s.id]; }}
            onDragOver={(e) => { const r = e.currentTarget.getBoundingClientRect(); setDrop(e.clientX < r.left + r.width / 2 ? i : i + 1); }}
            onMouseDown={(e) => {
              if (e.ctrlKey) setUI({ slideSel: slideSel.includes(s.id) ? slideSel.filter((x) => x !== s.id) : [...slideSel, s.id], slideId: s.id });
              else setUI({ slideId: s.id, slideSel: [s.id] });
            }}
            onDoubleClick={() => setUI({ view: 'normal', slideId: s.id, slideSel: [s.id] })}>
            <div className="sorter-thumb"><ScaledThumb deck={deck} slide={s} width={size} n={i + 1} /></div>
            <div className="sorter-num">{i + 1}{s.hidden ? ' (hidden)' : ''}</div>
          </div>
        ))}
      </div>
      <div className="sorter-zoom"><span>Size</span><input type="range" min="140" max="420" value={size} onChange={(e) => setSize(Number(e.target.value))} /></div>
    </div>
  );
}

function ScaledThumb({ deck, slide, width, n }) {
  const W = px(deck.size.w); const H = px(deck.size.h); const s = width / W;
  return (
    <div style={{ width, height: H * s, overflow: 'hidden', position: 'relative' }}>
      <div style={{ transform: `scale(${s})`, transformOrigin: '0 0', width: W, height: H }}>
        <SlideView deck={deck} surface={slideSurface(slide)} mode="thumb" slideNumber={n} />
      </div>
    </div>
  );
}
