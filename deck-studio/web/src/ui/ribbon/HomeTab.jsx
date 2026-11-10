import React from 'react';
import { useStore, getState, setUI, openDialog, selectedElements, updateSelected } from '../../lib/store.js';
import * as A from '../../lib/actions.js';
import { stepFont } from '../../editor/TextEditor.jsx';
import {
  RibbonGroup, BigButton, SmallButton, Row, Col, ColorButton, FontPicker, SizeCombo, Sep,
} from '../controls.jsx';
import {
  IPaste, ICut, ICopy, IPainter, INewSlide, ILayout, IReset, IBold, IItalic, IUnderline, IStrike, ISub, ISup,
  IFontUp, IFontDown, IClearFmt, ICase, ITextColor, IHighlight, IBullets, INumbering, IIndentUp, IIndentDown,
  IAlignL, IAlignC, IAlignR, IAlignJ, ILineSpacing, IAnchorT, IAnchorM, IAnchorB, IShapes, IFind, IReplace, ISelect,
  IArrange, IFill, ILine, IDocs, IHide, IText,
} from '../icons.js';
import { ShapeGallery, LayoutGallery, arrangeItems, BULLETS, NUMBERING } from './shared.jsx';

export function useFormatState() {
  useStore((s) => s.ui.textTick);
  useStore((s) => s.ui.selection);
  useStore((s) => s.ui.editing);
  useStore((s) => s.ui.cellSel);
  useStore((s) => s.rev);
  return { run: A.currentRunProps(), para: A.currentParaProps(), hasText: A.hasTextSelection() };
}

export function FontGroup() {
  const { run, hasText } = useFormatState();
  const dis = !hasText;
  return (
    <RibbonGroup label="Font" onLauncher={() => openDialog('font')}>
      <Col>
        <Row>
          <FontPicker value={run.font ?? ''} onPick={(f) => A.formatRun({ font: f })} />
          <SizeCombo value={run.size ?? ''} onPick={(s) => A.formatRun({ size: s })} />
          <SmallButton icon={IFontUp} iconOnly title="Increase Font Size (Ctrl+])" disabled={dis} onClick={() => A.formatRun({ size: (v) => stepFont(v || 18, 1) })} />
          <SmallButton icon={IFontDown} iconOnly title="Decrease Font Size (Ctrl+[)" disabled={dis} onClick={() => A.formatRun({ size: (v) => stepFont(v || 18, -1) })} />
          <SmallButton icon={IClearFmt} iconOnly title="Clear All Formatting" disabled={dis} onClick={A.clearFormatting} />
        </Row>
        <Row>
          <SmallButton icon={IBold} iconOnly title="Bold (Ctrl+B)" active={run.bold === true} disabled={dis} onClick={() => A.formatRun({ bold: run.bold !== true })} />
          <SmallButton icon={IItalic} iconOnly title="Italic (Ctrl+I)" active={run.italic === true} disabled={dis} onClick={() => A.formatRun({ italic: run.italic !== true })} />
          <SmallButton icon={IUnderline} iconOnly title="Underline (Ctrl+U)" active={run.underline === true} disabled={dis} onClick={() => A.formatRun({ underline: run.underline !== true })} />
          <SmallButton icon={IStrike} iconOnly title="Strikethrough" active={run.strike === true} disabled={dis} onClick={() => A.formatRun({ strike: run.strike !== true })} />
          <SmallButton icon={ISup} iconOnly title="Superscript" active={run.baseline > 0} disabled={dis} onClick={() => A.formatRun({ baseline: run.baseline > 0 ? 0 : 30 })} />
          <SmallButton icon={ISub} iconOnly title="Subscript" active={run.baseline < 0} disabled={dis} onClick={() => A.formatRun({ baseline: run.baseline < 0 ? 0 : -25 })} />
          <SmallButton title="Character Spacing" disabled={dis} menu={[
            { label: 'Very Tight', run: () => A.formatRun({ spacing: -3 }), checked: run.spacing === -3 },
            { label: 'Tight', run: () => A.formatRun({ spacing: -1.5 }), checked: run.spacing === -1.5 },
            { label: 'Normal', run: () => A.formatRun({ spacing: 0 }), checked: !run.spacing },
            { label: 'Loose', run: () => A.formatRun({ spacing: 3 }), checked: run.spacing === 3 },
            { label: 'Very Loose', run: () => A.formatRun({ spacing: 6 }), checked: run.spacing === 6 },
            { divider: true },
            { label: 'More Spacing...', run: () => openDialog('font', { tab: 'spacing' }) },
          ]}><span className="glyph-av">AV</span></SmallButton>
          <SmallButton icon={ICase} iconOnly title="Change Case" disabled={dis} menu={[
            { label: 'Sentence case.', run: () => A.changeCase('sentence') },
            { label: 'lowercase', run: () => A.changeCase('lower') },
            { label: 'UPPERCASE', run: () => A.changeCase('upper') },
            { label: 'Capitalize Each Word', run: () => A.changeCase('title') },
            { label: 'tOGGLE cASE', run: () => A.changeCase('toggle') },
          ]} />
          <Sep />
          <ColorButton icon={IHighlight} title="Text Highlight Colour" color={run.highlight || '#FFFF00'} allowNone noneLabel="No Colour"
            onPick={(c) => A.formatRun({ highlight: c })} />
          <ColorButton icon={ITextColor} title="Font Colour" color={run.color || '#262626'} onPick={(c) => c && A.formatRun({ color: c })} />
        </Row>
      </Col>
    </RibbonGroup>
  );
}

export function ParagraphGroup() {
  const { para, hasText } = useFormatState();
  const dis = !hasText;
  const b = para.bullet;
  const isBul = b && b.type === 'char';
  const isNum = b && b.type === 'num';
  const anchor = (() => {
    const sel = selectedElements();
    if (sel.length === 1 && sel[0].text) return sel[0].text.anchor;
    return null;
  })();
  const setAnchor = (a) => updateSelected((e) => { if (e.type === 'shape' && e.text) e.text.anchor = a; });
  return (
    <RibbonGroup label="Paragraph" onLauncher={() => openDialog('paragraph')}>
      <Col>
        <Row>
          <SmallButton icon={IBullets} iconOnly split title="Bullets" active={!!isBul} disabled={dis}
            onClick={() => A.setBullet(isBul ? null : BULLETS[1].bullet)}
            menu={BULLETS.map((x) => ({ label: x.label, run: () => A.setBullet(x.bullet), checked: JSON.stringify(x.bullet) === JSON.stringify(b || null) }))} />
          <SmallButton icon={INumbering} iconOnly split title="Numbering" active={!!isNum} disabled={dis}
            onClick={() => A.setBullet(isNum ? null : NUMBERING[1].bullet)}
            menu={NUMBERING.map((x) => ({ label: x.label, run: () => A.setBullet(x.bullet), checked: JSON.stringify(x.bullet) === JSON.stringify(b || null) }))} />
          <SmallButton icon={IIndentDown} iconOnly title="Decrease List Level (Shift+Tab)" disabled={dis} onClick={() => A.changeLevel(-1)} />
          <SmallButton icon={IIndentUp} iconOnly title="Increase List Level (Tab)" disabled={dis} onClick={() => A.changeLevel(1)} />
          <SmallButton icon={ILineSpacing} iconOnly title="Line Spacing" disabled={dis} menu={[
            ...[[1.0, '1.0'], [1.15, '1.15'], [1.5, '1.5'], [2.0, '2.0'], [2.5, '2.5'], [3.0, '3.0']].map(([v, lbl]) => ({ label: lbl, run: () => A.formatPara({ lineSpacing: v }), checked: Number(para.lineSpacing) === v })),
            { divider: true },
            { label: 'Line Spacing Options...', run: () => openDialog('paragraph') },
          ]} />
        </Row>
        <Row>
          <SmallButton icon={IAlignL} iconOnly title="Align Left (Ctrl+L)" active={para.align === 'l'} disabled={dis} onClick={() => A.formatPara({ align: 'l' })} />
          <SmallButton icon={IAlignC} iconOnly title="Center (Ctrl+E)" active={para.align === 'ctr'} disabled={dis} onClick={() => A.formatPara({ align: 'ctr' })} />
          <SmallButton icon={IAlignR} iconOnly title="Align Right (Ctrl+R)" active={para.align === 'r'} disabled={dis} onClick={() => A.formatPara({ align: 'r' })} />
          <SmallButton icon={IAlignJ} iconOnly title="Justify (Ctrl+J)" active={para.align === 'just'} disabled={dis} onClick={() => A.formatPara({ align: 'just' })} />
          <Sep />
          <SmallButton icon={anchor === 'b' ? IAnchorB : anchor === 'ctr' ? IAnchorM : IAnchorT} iconOnly title="Align Text (vertical)" disabled={anchor == null} menu={[
            { label: 'Top', icon: IAnchorT, run: () => setAnchor('t'), checked: anchor === 't' },
            { label: 'Middle', icon: IAnchorM, run: () => setAnchor('ctr'), checked: anchor === 'ctr' },
            { label: 'Bottom', icon: IAnchorB, run: () => setAnchor('b'), checked: anchor === 'b' },
          ]} />
        </Row>
      </Col>
    </RibbonGroup>
  );
}

export default function HomeTab() {
  const slideId = useStore((s) => s.ui.slideId);
  const deck = useStore((s) => s.deck);
  const sel = useStore((s) => s.ui.selection);
  const fp = useStore((s) => s.ui.formatPainter);
  const slide = deck.slides.find((s) => s.id === slideId);
  const one = sel.length > 0;
  return (
    <>
      <RibbonGroup label="Clipboard">
        <BigButton icon={IPaste} label="Paste" split onClick={() => A.pasteClip()} menu={[
          { label: 'Paste (keep formatting)', run: () => A.pasteClip(), shortcut: 'Ctrl+V' },
          { label: 'Paste text only', run: async () => { try { const t = await navigator.clipboard.readText(); if (t && !t.startsWith('DECKSTUDIO:')) A.pasteFromSystem({ clipboardData: { getData: () => t, files: [] }, preventDefault() {} }); } catch (e) { /* ignore */ } } },
        ]} />
        <Col>
          <SmallButton icon={ICut} label="Cut" disabled={!one} onClick={A.cutSelection} />
          <SmallButton icon={ICopy} label="Copy" disabled={!one} onClick={A.copySelection} />
          <SmallButton icon={IPainter} label="Format Painter" active={!!fp} disabled={!one && !fp} onClick={() => (fp ? setUI({ formatPainter: null }) : A.pickFormat())} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Slides">
        <BigButton icon={INewSlide} label="New Slide" split onClick={() => A.addSlide()} menu={(close) => <LayoutGallery onPick={(id) => A.addSlide(id)} onClose={close} />} />
        <Col>
          <SmallButton icon={ILayout} label="Layout" menu={(close) => <LayoutGallery current={slide && slide.layout} onPick={(id) => A.applyLayout(getState().ui.slideSel, id)} onClose={close} />} />
          <SmallButton icon={IReset} label="Reset" title="Reset the slide's placeholders to the layout" onClick={() => A.applyLayout(getState().ui.slideSel, null, true)} />
          <SmallButton icon={IDocs} label="Duplicate" onClick={() => A.duplicateSlides(getState().ui.slideSel)} />
        </Col>
      </RibbonGroup>
      <FontGroup />
      <ParagraphGroup />
      <RibbonGroup label="Drawing">
        <BigButton icon={IShapes} label="Shapes" menu={(close) => <ShapeGallery onClose={close} />} />
        <BigButton icon={IArrange} label="Arrange" menu={arrangeItems()} />
        <Col>
          <ColorButton icon={IFill} label="Shape Fill" color={(selectedElements()[0] || {}).fill?.color || '#00778B'} allowNone
            onPick={(c) => updateSelected((e) => { if (e.type === 'shape' || e.type === 'image') e.fill = c ? { color: c } : null; })} />
          <ColorButton icon={ILine} label="Shape Outline" color={(selectedElements()[0] || {}).line?.color || '#00778B'} allowNone noneLabel="No Outline"
            onPick={(c) => updateSelected((e) => { if (e.type === 'line') { if (c) e.line.color = c; } else if (e.type === 'shape' || e.type === 'image') e.line = c ? { color: c, width: (e.line && e.line.width) || 1, dash: (e.line && e.line.dash) || 'solid' } : null; })} />
          <SmallButton icon={IText} label="Text Box" onClick={() => setUI({ insertMode: { kind: 'textbox' }, selection: [], editing: null })} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Editing">
        <Col>
          <SmallButton icon={IFind} label="Find" onClick={() => openDialog('find', { mode: 'find' })} />
          <SmallButton icon={IReplace} label="Replace" onClick={() => openDialog('find', { mode: 'replace' })} />
          <SmallButton icon={ISelect} label="Select" menu={[
            { label: 'Select All', run: A.selectAll, shortcut: 'Ctrl+A' },
            { label: 'Hide / Show Slide', icon: IHide, run: () => A.toggleHideSlides(getState().ui.slideSel) },
          ]} />
        </Col>
      </RibbonGroup>
    </>
  );
}
