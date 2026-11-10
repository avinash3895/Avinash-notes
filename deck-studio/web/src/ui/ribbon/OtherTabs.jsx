import React from 'react';
import { useStore, getState, setUI, openDialog, commit, toast, ask, promptText } from '../../lib/store.js';
import * as A from '../../lib/actions.js';
import { THEMES, uid, fitElement, bounds } from '../../lib/model.js';
import { refreshLinks, rerenderAllCharts, loadChartLibrary } from '../../lib/data.js';
import { exportPptx, openUpdatePowerPoint, newWindow } from '../../lib/files.js';
import { RibbonGroup, BigButton, SmallButton, Col, Check, ColorButton } from '../controls.jsx';
import {
  IThemes, ISlideSize, IBackground, INormal, ISorter, INotes, IGrid, IZoom, IZoomFit, INewWindow, IPlayBig, IPlay, IHide,
  ILink, IRefresh, IRefreshAll, ICharts, ITesting, IExport, IUpdatePpt, ICompare, ILayout, IAdd, IDelete, IClose, IFont, IColor, ICode,
} from '../icons.js';
import { ScaledSlide } from '../../render/SlideView.jsx';

function ThemeCard({ theme, active, onPick }) {
  const c = theme.colors;
  return (
    <div className={`theme-card${active ? ' active' : ''}`} onClick={onPick} title={theme.name}>
      <div className="tc-face" style={{ background: c.lt1 }}>
        <span className="tc-aa" style={{ fontFamily: `"${theme.fonts.major}"`, color: c.accent1 }}>Aa</span>
        <span className="tc-bars">{['accent1', 'accent2', 'accent3', 'accent4'].map((k) => <i key={k} style={{ background: c[k] }} />)}</span>
      </div>
      <div className="tc-name">{theme.name}</div>
    </div>
  );
}

export function DesignTab() {
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.ui.slideId);
  const slide = deck.slides.find((s) => s.id === slideId);
  const setSize = async (w, h) => {
    if (deck.size.w === w && deck.size.h === h) return;
    commit((d) => {
      const from = { x: 0, y: 0, w: d.size.w, h: d.size.h };
      const s = Math.min(w / d.size.w, h / d.size.h);
      const to = { x: (w - d.size.w * s) / 2, y: (h - d.size.h * s) / 2, w: d.size.w * s, h: d.size.h * s };
      const fix = (list) => list.forEach((e) => fitElement(e, from, to));
      d.slides.forEach((sl) => fix(sl.elements));
      fix(d.master.elements);
      d.layouts.forEach((l) => fix(l.elements));
      d.size = { w, h };
    });
    void bounds;
  };
  return (
    <>
      <RibbonGroup label="Themes" className="wide">
        <div className="theme-strip">
          {THEMES.map((t) => (
            <ThemeCard key={t.name} theme={t} active={deck.theme.name === t.name} onPick={async () => {
              const r = await ask('Apply theme', `Apply the "${t.name}" colours and fonts to the whole deck? Colours and fonts that came from the current theme are swapped for the new ones.`, [
                { id: 'ok', label: 'Apply to deck', primary: true }, { id: 'new', label: 'New objects only' }, { id: 'cancel', label: 'Cancel' },
              ]);
              if (r === 'ok') A.applyTheme(t, true);
              if (r === 'new') A.applyTheme(t, false);
            }} />
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup label="Variants">
        <Col>
          <SmallButton icon={IColor} label="Colours" onClick={() => openDialog('themeColors')} />
          <SmallButton icon={IFont} label="Fonts" onClick={() => openDialog('themeFonts')} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Customise">
        <BigButton icon={ISlideSize} label="Slide Size" menu={[
          { label: 'Widescreen (16:9)', checked: deck.size.w === 12192000 && deck.size.h === 6858000, run: () => setSize(12192000, 6858000) },
          { label: 'Standard (4:3)', checked: deck.size.w === 9144000 && deck.size.h === 6858000, run: () => setSize(9144000, 6858000) },
        ]} />
        <BigButton icon={IBackground} label="Format Background" onClick={() => openDialog('background')} />
        <BigButton icon={ILayout} label="Edit Slide Master" onClick={() => A.setView('master')} />
      </RibbonGroup>
      <RibbonGroup label="Background">
        <Col>
          <ColorButton icon={IBackground} label="Slide Colour" color={(slide && slide.background) || deck.master.background}
            allowNone noneLabel="Use master background"
            onPick={(c) => commit((d) => { const s = d.slides.find((x) => x.id === slideId); if (s) s.background = c; })} />
          <Check label="Hide background graphics" checked={slide && slide.hideMaster}
            onChange={(v) => commit((d) => { const s = d.slides.find((x) => x.id === slideId); if (s) s.hideMaster = v; })} />
        </Col>
      </RibbonGroup>
    </>
  );
}

export function SlideShowTab() {
  return (
    <>
      <RibbonGroup label="Start Slide Show">
        <BigButton icon={IPlayBig} label="From Beginning" onClick={() => A.startShow(false)} title="F5" />
        <BigButton icon={IPlay} label="From Current Slide" onClick={() => A.startShow(true)} title="Shift+F5" />
      </RibbonGroup>
      <RibbonGroup label="Set Up">
        <BigButton icon={IHide} label="Hide Slide" onClick={() => A.toggleHideSlides(getState().ui.slideSel)} />
      </RibbonGroup>
    </>
  );
}

export function DataTab() {
  const testing = useStore((s) => s.ui.testing);
  const busy = useStore((s) => s.ui.chartBusy);
  return (
    <>
      <RibbonGroup label="Excel Links">
        <BigButton icon={ILink} label="Edit Links" onClick={() => openDialog('editLinks')} title="See and change which Excel files the deck reads from" />
        <BigButton icon={IRefresh} label="Refresh Slide" onClick={() => refreshLinks('slide')} title="Read the saved Excel values for this slide" />
        <Col>
          <SmallButton icon={IRefreshAll} label="Refresh All" onClick={() => refreshLinks('all')} />
          <SmallButton icon={ILink} label="Link Number" onClick={() => openDialog('linkNumber')} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Charts">
        <BigButton icon={ICharts} label="Charts" onClick={() => openDialog('charts')} title="Chart library: insert, edit code, add new" />
        <BigButton icon={ITesting} label={testing ? 'Testing: On' : 'Testing Mode'} active={testing} title="Use the testing versions of chart code in open decks"
          onClick={async () => {
            setUI({ testing: !testing });
            await loadChartLibrary();
            await rerenderAllCharts();
            toast(!testing ? 'Testing mode on: charts use your testing code. Send to Production to make it permanent.' : 'Testing mode off: charts use production code.');
          }} />
        <Col>
          <SmallButton icon={IRefresh} label={busy ? 'Redrawing...' : 'Redraw Charts'} onClick={() => rerenderAllCharts()} />
          <SmallButton icon={ICode} label="Open Library Folder" onClick={() => import('../../lib/api.js').then((m) => m.post('/api/charts/folder').catch((e) => toast(e.message, { kind: 'error' })))} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="PowerPoint">
        <BigButton icon={IExport} label="Export" onClick={exportPptx} title="Create a .pptx with native, editable charts" />
        <BigButton icon={IUpdatePpt} label="Update PowerPoint" onClick={openUpdatePowerPoint} title="Replace slides inside a .pptx, even while it is open" />
        <BigButton icon={ICompare} label="Check Export" onClick={() => openDialog('compare')} title="Compare this slide with how PowerPoint draws the export" />
      </RibbonGroup>
    </>
  );
}

export function ViewTab() {
  const view = useStore((s) => s.ui.view);
  const notes = useStore((s) => s.ui.notes);
  const grid = useStore((s) => s.ui.gridlines);
  const guides = useStore((s) => s.ui.guides);
  const smart = useStore((s) => s.ui.smartGuides);
  const units = useStore((s) => s.ui.units);
  return (
    <>
      <RibbonGroup label="Presentation Views">
        <BigButton icon={INormal} label="Normal" active={view === 'normal'} onClick={() => A.setView('normal')} />
        <BigButton icon={ISorter} label="Slide Sorter" active={view === 'sorter'} onClick={() => A.setView('sorter')} />
      </RibbonGroup>
      <RibbonGroup label="Master Views">
        <BigButton icon={ILayout} label="Slide Master" active={view === 'master'} onClick={() => A.setView('master')} />
      </RibbonGroup>
      <RibbonGroup label="Show">
        <Col>
          <Check label="Gridlines" checked={grid} onChange={(v) => setUI({ gridlines: v })} />
          <Check label="Guides" checked={guides} onChange={(v) => setUI({ guides: v })} />
          <Check label="Smart Guides" checked={smart} onChange={(v) => setUI({ smartGuides: v })} />
        </Col>
        <Col>
          <Check label="Notes" checked={notes} onChange={(v) => setUI({ notes: v })} />
          <Check label="Measure in inches" checked={units === 'in'} onChange={(v) => setUI({ units: v ? 'in' : 'cm' })} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Zoom">
        <BigButton icon={IZoom} label="Zoom" onClick={() => openDialog('zoom')} />
        <BigButton icon={IZoomFit} label="Fit to Window" onClick={() => setUI({ fit: true })} />
      </RibbonGroup>
      <RibbonGroup label="Window">
        <BigButton icon={INewWindow} label="New Window" onClick={newWindow} title="Open the same deck in a second window" />
      </RibbonGroup>
      <RibbonGroup label="Notes">
        <BigButton icon={INotes} label="Notes" active={notes} onClick={() => setUI({ notes: !notes })} />
      </RibbonGroup>
    </>
  );
}

export function MasterTab() {
  const deck = useStore((s) => s.deck);
  const target = useStore((s) => s.ui.masterTarget);
  const layout = deck.layouts.find((l) => l.id === target);
  return (
    <>
      <RibbonGroup label="Edit Master">
        <BigButton icon={IAdd} label="Insert Layout" onClick={() => {
          const id = uid('L');
          commit((d) => { d.layouts.push({ id, name: 'Custom Layout', elements: [] }); });
          setUI({ masterTarget: id, selection: [] });
        }} />
        <BigButton icon={IDelete} label="Delete Layout" disabled={!layout || deck.layouts.length <= 1} onClick={async () => {
          const used = deck.slides.filter((s) => s.layout === target).length;
          const ok = await ask('Delete layout', `Delete the "${layout.name}" layout?${used ? ` ${used} slide(s) use it; they keep their content.` : ''}`);
          if (ok !== 'ok') return;
          commit((d) => { d.layouts = d.layouts.filter((l) => l.id !== target); });
          setUI({ masterTarget: 'master', selection: [] });
        }} />
        <BigButton icon={ILayout} label="Rename" disabled={!layout} onClick={async () => {
          const name = await promptText('Rename Layout', 'Layout name', layout.name);
          if (name) commit((d) => { const l = d.layouts.find((x) => x.id === target); l.name = name; });
        }} />
      </RibbonGroup>
      <RibbonGroup label="Background">
        <Col>
          <ColorButton icon={IBackground} label="Background" color={layout ? (layout.background || deck.master.background) : deck.master.background}
            allowNone={!!layout} noneLabel="Same as master"
            onPick={(c) => commit((d) => { if (layout) d.layouts.find((x) => x.id === target).background = c; else if (c) d.master.background = c; })} />
          {layout && <Check label="Hide master graphics" checked={!!layout.hideMaster} onChange={(v) => commit((d) => { d.layouts.find((x) => x.id === target).hideMaster = v; })} />}
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Placeholders">
        <Col>
          <SmallButton label="Insert Title Placeholder" disabled={!layout} onClick={() => insertPlaceholder('title')} />
          <SmallButton label="Insert Text Placeholder" disabled={!layout} onClick={() => insertPlaceholder('body')} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Close">
        <BigButton icon={IClose} label="Close Master View" onClick={() => A.setView('normal')} />
      </RibbonGroup>
    </>
  );
}

function insertPlaceholder(kind) {
  import('../../lib/model.js').then((M) => {
    const deck = getState().deck;
    const IN = M.EMU_PER_IN;
    const b = kind === 'title'
      ? M.body([M.para('', { size: 28, bold: true, color: deck.theme.colors.accent1, font: deck.theme.fonts.major })], { anchor: 'b', autofit: 'none' })
      : M.body([M.para('', { size: 18, font: deck.theme.fonts.minor }, { bullet: { type: 'char', char: '•' }, marL: 228600, indent: -228600 })], { autofit: 'none' });
    const tb = M.textbox(Math.round(0.5 * IN), Math.round(kind === 'title' ? 0.3 * IN : 1.4 * IN), deck.size.w - IN, Math.round(kind === 'title' ? 0.9 * IN : 4.8 * IN), b,
      { placeholder: kind, prompt: kind === 'title' ? 'Click to add title' : 'Click to add text', name: kind === 'title' ? 'Title' : 'Text' });
    A.insertElement(tb);
  });
}

export { ScaledSlide };
