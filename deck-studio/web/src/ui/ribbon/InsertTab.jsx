import React, { useState } from 'react';
import { useStore, getState, setUI, openDialog, toast } from '../../lib/store.js';
import * as A from '../../lib/actions.js';
import { table as makeTable, textbox, body, para, defaultRun, EMU_PER_IN, TEXT_MID } from '../../lib/model.js';
import { activeEditor } from '../../editor/TextEditor.jsx';
import { RibbonGroup, BigButton, SmallButton, Col } from '../controls.jsx';
import { INewSlide, ITable, IImage, IShapesBig, IChart, ITextbox, ISlideNum, IDate, ISymbol, ILink, ICharts } from '../icons.js';
import { ShapeGallery, LayoutGallery } from './shared.jsx';

function TablePicker({ onClose }) {
  const [hover, setHover] = useState([0, 0]);
  const insert = (r, c) => {
    const deck = getState().deck;
    const w = Math.min(deck.size.w - EMU_PER_IN, c * Math.round(1.6 * EMU_PER_IN));
    const t = makeTable(r, c, Math.round((deck.size.w - w) / 2), Math.round(1.6 * EMU_PER_IN), w);
    A.insertElement(t);
    onClose();
  };
  return (
    <div className="table-picker">
      <div className="tp-title">{hover[0] ? `${hover[1]}x${hover[0]} Table` : 'Insert Table'}</div>
      <div className="tp-grid" onMouseLeave={() => setHover([0, 0])}>
        {Array.from({ length: 8 }, (_, r) => (
          <div key={r} className="tp-row">
            {Array.from({ length: 10 }, (_, c) => (
              <span key={c} className={`tp-cell${r < hover[0] && c < hover[1] ? ' on' : ''}`}
                onMouseEnter={() => setHover([r + 1, c + 1])} onClick={() => insert(r + 1, c + 1)} />
            ))}
          </div>
        ))}
      </div>
      <div className="menu-item" onClick={() => { onClose(); openDialog('insertTable'); }}><span className="mi-check" /><span className="mi-label">Insert Table...</span></div>
    </div>
  );
}

export function insertSlideNumber() {
  if (activeEditor) {
    activeEditor.insertRun({ text: '#', field: 'slidenum' });
    return;
  }
  const deck = getState().deck;
  const tb = textbox(deck.size.w - Math.round(1.5 * EMU_PER_IN), deck.size.h - Math.round(0.45 * EMU_PER_IN), EMU_PER_IN, Math.round(0.3 * EMU_PER_IN),
    body([para('', { size: 9, color: TEXT_MID }, { align: 'r' })], { autofit: 'none' }), { name: 'Slide number' });
  tb.text.paras[0].runs = [defaultRun({ text: '#', field: 'slidenum', size: 9, color: TEXT_MID })];
  A.insertElement(tb);
}

export function insertDate() {
  const text = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  if (activeEditor) { activeEditor.insertText(text); return; }
  const deck = getState().deck;
  const tb = textbox(Math.round(0.5 * EMU_PER_IN), deck.size.h - Math.round(0.45 * EMU_PER_IN), Math.round(2.5 * EMU_PER_IN), Math.round(0.3 * EMU_PER_IN),
    body([para(text, { size: 9, color: TEXT_MID })], { autofit: 'none' }));
  A.insertElement(tb);
}

export default function InsertTab() {
  useStore((s) => s.ui.editing);
  return (
    <>
      <RibbonGroup label="Slides">
        <BigButton icon={INewSlide} label="New Slide" split onClick={() => A.addSlide()} menu={(close) => <LayoutGallery onPick={(id) => A.addSlide(id)} onClose={close} />} />
      </RibbonGroup>
      <RibbonGroup label="Tables">
        <BigButton icon={ITable} label="Table" menu={(close) => <TablePicker onClose={close} />} />
      </RibbonGroup>
      <RibbonGroup label="Images">
        <BigButton icon={IImage} label="Pictures" onClick={A.pickImage} title="Insert a picture from this computer (you can also paste one with Ctrl+V)" />
      </RibbonGroup>
      <RibbonGroup label="Illustrations">
        <BigButton icon={IShapesBig} label="Shapes" menu={(close) => <ShapeGallery onClose={close} />} />
        <BigButton icon={IChart} label="Chart" onClick={() => openDialog('charts')} title="Insert a chart from the chart library" />
      </RibbonGroup>
      <RibbonGroup label="Text">
        <BigButton icon={ITextbox} label="Text Box" onClick={() => setUI({ insertMode: { kind: 'textbox' }, selection: [], editing: null })} />
        <Col>
          <SmallButton icon={ISlideNum} label="Slide Number" onClick={insertSlideNumber} />
          <SmallButton icon={IDate} label="Date" onClick={insertDate} />
          <SmallButton icon={ILink} label="Linked Number" onClick={() => {
            if (!activeEditor) { toast('Click inside a text box where the number should go, then choose Linked Number.'); return; }
            openDialog('linkNumber');
          }} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Symbols">
        <BigButton icon={ISymbol} label="Symbol" onClick={() => openDialog('symbol')} />
        <BigButton icon={ICharts} label="Chart Library" onClick={() => openDialog('charts')} />
      </RibbonGroup>
    </>
  );
}
