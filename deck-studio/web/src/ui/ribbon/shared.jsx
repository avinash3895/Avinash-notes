import React from 'react';
import { SHAPES, LINE_TOOLS, shapePath } from '../../lib/geom.js';
import { setUI, getState, useStore, selectedElements } from '../../lib/store.js';
import { ScaledSlide } from '../../render/SlideView.jsx';
import * as A from '../../lib/actions.js';
import {
  IToFront, IToBack, IBackward, IGroup, IUngroup, IRotR, IRotL, IFlipH, IFlipV, IObjAlignL, IObjAlignC, IObjAlignR,
  IAnchorT, IAnchorM, IAnchorB, IDistH, IDistV,
} from '../icons.js';

export function ShapeIcon({ geom, size = 20 }) {
  const w = size; const h = geom === 'rightArrow' || geom === 'leftArrow' || geom === 'homePlate' || geom === 'chevron' ? size * 0.7 : size;
  return (
    <svg width={size} height={size} viewBox={`-1 -1 ${size + 2} ${size + 2}`}>
      <g transform={`translate(0,${(size - h) / 2})`}>
        <path d={shapePath(geom, w, h)} fill="none" stroke="#444" strokeWidth="1.1" fillRule="evenodd" />
      </g>
    </svg>
  );
}

function LineIcon({ variant }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <line x1="3" y1="17" x2="17" y2="3" stroke="#444" strokeWidth="1.3" />
      {(variant === 'arrow' || variant === 'doubleArrow') && <polygon points="17,3 11.5,4.5 15.5,8.5" fill="#444" />}
      {variant === 'doubleArrow' && <polygon points="3,17 8.5,15.5 4.5,11.5" fill="#444" />}
    </svg>
  );
}

export function ShapeGallery({ onClose }) {
  const groups = [];
  SHAPES.forEach((s) => {
    let g = groups.find((x) => x.name === s.group);
    if (!g) { g = { name: s.group, items: [] }; groups.push(g); }
    g.items.push(s);
  });
  const pick = (mode) => { setUI({ insertMode: mode, selection: [], editing: null }); onClose && onClose(); };
  return (
    <div className="shape-gallery">
      <div className="sg-title">Lines</div>
      <div className="sg-grid">
        {LINE_TOOLS.map((l) => <button key={l.id} title={l.name} onClick={() => pick({ kind: 'line', variant: l.id })}><LineIcon variant={l.id} /></button>)}
      </div>
      <div className="sg-title">Text</div>
      <div className="sg-grid">
        <button title="Text Box" onClick={() => pick({ kind: 'textbox' })}>
          <svg width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="14" fill="none" stroke="#444" /><text x="10" y="14" fontSize="10" textAnchor="middle" fill="#444" fontFamily="Segoe UI">A</text></svg>
        </button>
      </div>
      {groups.map((g) => (
        <React.Fragment key={g.name}>
          <div className="sg-title">{g.name}</div>
          <div className="sg-grid">
            {g.items.map((s) => <button key={s.id} title={s.name} onClick={() => pick({ kind: 'shape', geom: s.id })}><ShapeIcon geom={s.id} /></button>)}
          </div>
        </React.Fragment>
      ))}
      <div className="sg-hint">Click and drag on the slide to draw. Hold Shift for a perfect square, circle or straight line.</div>
    </div>
  );
}

export function LayoutGallery({ onPick, onClose, current }) {
  const deck = useStore((s) => s.deck);
  return (
    <div className="layout-gallery">
      <div className="menu-header">{deck.theme.name} layouts</div>
      <div className="lg-grid">
        {deck.layouts.map((l) => (
          <div key={l.id} className={`lg-item${current === l.id ? ' cur' : ''}`} onClick={() => { onPick(l.id); onClose && onClose(); }}>
            <ScaledSlide deck={deck} surface={{ kind: 'layout', id: l.id, elements: l.elements, background: l.background, layout: l }} width={118} mode="edit" slideNumber="#" />
            <span>{l.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function arrangeItems() {
  const sel = selectedElements();
  const one = sel.length === 1;
  const has = sel.length > 0;
  return [
    { header: 'Order Objects' },
    { label: 'Bring to Front', icon: IToFront, run: () => A.order('front'), disabled: !has, shortcut: 'Ctrl+Shift+]' },
    { label: 'Send to Back', icon: IToBack, run: () => A.order('back'), disabled: !has, shortcut: 'Ctrl+Shift+[' },
    { label: 'Bring Forward', icon: IToFront, run: () => A.order('forward'), disabled: !has },
    { label: 'Send Backward', icon: IBackward, run: () => A.order('backward'), disabled: !has },
    { header: 'Group Objects' },
    { label: 'Group', icon: IGroup, run: A.groupSelected, disabled: sel.length < 2, shortcut: 'Ctrl+G' },
    { label: 'Ungroup', icon: IUngroup, run: A.ungroupSelected, disabled: !sel.some((e) => e.type === 'group'), shortcut: 'Ctrl+Shift+G' },
    { header: 'Position Objects' },
    {
      label: 'Align', icon: IObjAlignL, disabled: !has, submenu: [
        { label: one ? 'Align Left (to slide)' : 'Align Left', icon: IObjAlignL, run: () => A.align('left') },
        { label: 'Align Center', icon: IObjAlignC, run: () => A.align('center') },
        { label: 'Align Right', icon: IObjAlignR, run: () => A.align('right') },
        { divider: true },
        { label: 'Align Top', icon: IAnchorT, run: () => A.align('top') },
        { label: 'Align Middle', icon: IAnchorM, run: () => A.align('middle') },
        { label: 'Align Bottom', icon: IAnchorB, run: () => A.align('bottom') },
        { divider: true },
        { label: 'Distribute Horizontally', icon: IDistH, run: () => A.distribute('h'), disabled: sel.length < 2 },
        { label: 'Distribute Vertically', icon: IDistV, run: () => A.distribute('v'), disabled: sel.length < 2 },
      ],
    },
    {
      label: 'Rotate', icon: IRotR, disabled: !has, submenu: [
        { label: 'Rotate Right 90°', icon: IRotR, run: () => A.rotateSelected(90) },
        { label: 'Rotate Left 90°', icon: IRotL, run: () => A.rotateSelected(-90) },
        { label: 'Flip Vertical', icon: IFlipV, run: () => A.flipSelected('v') },
        { label: 'Flip Horizontal', icon: IFlipH, run: () => A.flipSelected('h') },
      ],
    },
  ];
}

export function hasSelection() {
  return getState().ui.selection.length > 0;
}

export const BULLETS = [
  { label: 'None', bullet: null },
  { label: '•  Filled round', bullet: { type: 'char', char: '•', font: 'Arial' } },
  { label: '–  Dash', bullet: { type: 'char', char: '–', font: 'Arial' } },
  { label: '▪  Filled square', bullet: { type: 'char', char: '▪', font: 'Arial' } },
  { label: '►  Arrow', bullet: { type: 'char', char: '►', font: 'Arial', size: 0.8 } },
  { label: '✓  Tick', bullet: { type: 'char', char: '✓', font: 'Segoe UI Symbol' } },
  { label: '○  Hollow round', bullet: { type: 'char', char: '○', font: 'Arial' } },
];

export const NUMBERING = [
  { label: 'None', bullet: null },
  { label: '1.  2.  3.', bullet: { type: 'num', scheme: 'arabicPeriod' } },
  { label: '1)  2)  3)', bullet: { type: 'num', scheme: 'arabicParenR' } },
  { label: 'a.  b.  c.', bullet: { type: 'num', scheme: 'alphaLcPeriod' } },
  { label: 'A.  B.  C.', bullet: { type: 'num', scheme: 'alphaUcPeriod' } },
  { label: 'i.  ii.  iii.', bullet: { type: 'num', scheme: 'romanLcPeriod' } },
  { label: 'I.  II.  III.', bullet: { type: 'num', scheme: 'romanUcPeriod' } },
];
