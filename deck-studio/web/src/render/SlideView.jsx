import React, { memo } from 'react';
import { px, isEmptyBody } from '../lib/model.js';
import ElementView from './ElementView.jsx';

// Renders one slide (or the master / a layout) at 96 dpi; the caller scales it.
// mode: 'edit' (canvas), 'thumb' (slide panel), 'show' (slide show)
function SlideViewInner({ deck, surface, mode = 'thumb', slideNumber, ctx = {}, clip = true }) {
  const W = px(deck.size.w); const H = px(deck.size.h);
  const isSlide = surface.kind === 'slide';
  const slide = surface.slide;
  const bg = (isSlide && slide.background) || surface.background || deck.master.background || '#FFFFFF';
  const showMaster = surface.kind === 'layout' ? !surface.layout?.hideMaster : (isSlide ? !slide.hideMaster : false);
  const baseCtx = { mode, slideNumber, editingId: null, ...ctx, mode };
  const masterCtx = { mode: mode === 'edit' ? 'thumb' : mode, slideNumber };
  const visible = (e) => !(mode !== 'edit' && e.placeholder && e.text && isEmptyBody(e.text));
  return (
    <div className={`slide ${mode}${clip ? ' clip' : ''}`} style={{ width: W, height: H }}>
      <div className="slide-bg" style={{ background: bg }} />
      {showMaster && (
        <div className="master-layer">
          {deck.master.elements.map((e) => <ElementView key={e.id} e={e} ctx={masterCtx} />)}
        </div>
      )}
      <div className="el-layer">
        {surface.elements.filter(visible).map((e) => <ElementView key={e.id} e={e} ctx={baseCtx} />)}
      </div>
    </div>
  );
}

const SlideView = memo(SlideViewInner, (a, b) => a.deck.master === b.deck.master && a.deck.size === b.deck.size
  && a.surface.elements === b.surface.elements && a.surface.slide === b.surface.slide
  && a.surface.background === b.surface.background && a.surface.layout === b.surface.layout
  && a.mode === b.mode && a.slideNumber === b.slideNumber && a.ctx === b.ctx && a.clip === b.clip);

export default SlideView;

export function slideSurface(slide) {
  return { kind: 'slide', id: slide.id, elements: slide.elements, slide };
}

// Scaled slide for thumbnails / show / previews
export function ScaledSlide({ deck, slide, surface, width, mode = 'thumb', slideNumber }) {
  const W = px(deck.size.w); const H = px(deck.size.h);
  const s = width / W;
  const surf = surface || slideSurface(slide);
  return (
    <div className="scaled-slide" style={{ width, height: H * s }}>
      <div style={{ transform: `scale(${s})`, transformOrigin: '0 0', width: W, height: H }}>
        <SlideView deck={deck} surface={surf} mode={mode} slideNumber={slideNumber} />
      </div>
    </div>
  );
}
