import React, { useState } from 'react';
import { useStore, closeDialog, getState, setUI, commit, toast, selectedElements, updateSelected, updateElement } from '../../lib/store.js';
import * as A from '../../lib/actions.js';
import { activeEditor } from '../../editor/TextEditor.jsx';
import { table as makeTable, EMU_PER_IN, EMU_PER_CM, EMU_PER_PT, bounds, fitElement } from '../../lib/model.js';
import Modal, { Field } from './Modal.jsx';
import { ColorGrid, Popover, usePopover, FontPicker } from '../controls.jsx';
import {
  ChartsDialog, ChartDataDialog, ChartSettingsDialog, LinkNumberDialog, EditLinksDialog, UpdatePptDialog, CompareDialog, ShareDialog,
} from './DataDialogs.jsx';

function ColorField({ value, onChange, allowNone, noneLabel }) {
  const pop = usePopover();
  return (
    <span className="color-field">
      <button className="swatch-btn" style={{ background: value || 'repeating-linear-gradient(45deg,#fff,#fff 3px,#ddd 3px,#ddd 6px)' }} onClick={pop.open} />
      <span className="cf-text">{value || (noneLabel || 'None')}</span>
      {pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close}><ColorGrid onPick={onChange} allowNone={allowNone} noneLabel={noneLabel} onClose={pop.close} current={value} /></Popover>}
    </span>
  );
}

function AskDialog({ title, message, buttons, resolve }) {
  const done = (id) => { closeDialog(); resolve(id); };
  return (
    <Modal title={title} width={460} onClose={() => done('cancel')} footer={(
      <><span className="grow" />{buttons.map((b) => <button key={b.id} className={`btn${b.primary ? ' primary' : ''}`} onClick={() => done(b.id)}>{b.label}</button>)}</>
    )}>
      <div className="ask-msg">{String(message).split('\n').map((l, i) => <p key={i}>{l}</p>)}</div>
    </Modal>
  );
}

function PromptDialog({ title, label, value, hint, resolve }) {
  const [v, setV] = useState(value || '');
  const done = (val) => { closeDialog(); resolve(val); };
  return (
    <Modal title={title} width={520} onClose={() => done(null)} footer={(
      <><span className="grow" /><button className="btn" onClick={() => done(null)}>Cancel</button><button className="btn primary" onClick={() => done(v)}>OK</button></>
    )}>
      {hint && <p className="bs-muted">{hint}</p>}
      <Field label={label}><input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') done(v); }} /></Field>
    </Modal>
  );
}

function FontDialog() {
  const run = A.currentRunProps();
  const [p, setP] = useState({ ...run });
  const set = (k, v) => setP({ ...p, [k]: v });
  const apply = () => {
    const out = {};
    for (const k of ['font', 'size', 'bold', 'italic', 'underline', 'strike', 'color', 'baseline', 'spacing', 'caps']) {
      if (p[k] !== run[k] && p[k] !== '') out[k] = p[k];
    }
    if (Object.keys(out).length) A.formatRun(out);
    closeDialog();
  };
  const style = p.bold && p.italic ? 'bi' : p.bold ? 'b' : p.italic ? 'i' : 'r';
  return (
    <Modal title="Font" width={520} footer={<><span className="grow" /><button className="btn" onClick={closeDialog}>Cancel</button><button className="btn primary" onClick={apply}>OK</button></>}>
      <div className="form-grid">
        <Field label="Latin text font"><FontPicker value={p.font || ''} onPick={(f) => set('font', f)} width={220} /></Field>
        <Field label="Font style">
          <select value={style} onChange={(e) => { const v = e.target.value; setP({ ...p, bold: v.includes('b'), italic: v.includes('i') }); }}>
            <option value="r">Regular</option><option value="b">Bold</option><option value="i">Italic</option><option value="bi">Bold Italic</option>
          </select>
        </Field>
        <Field label="Size (pt)"><input type="number" step="0.5" min="1" value={p.size || ''} onChange={(e) => set('size', Number(e.target.value))} /></Field>
        <Field label="Font colour"><ColorField value={p.color} onChange={(c) => c && set('color', c)} /></Field>
        <Field label="Character spacing (pt)"><input type="number" step="0.5" value={p.spacing || 0} onChange={(e) => set('spacing', Number(e.target.value))} /></Field>
        <Field label="Capitals">
          <select value={p.caps || ''} onChange={(e) => set('caps', e.target.value || null)}><option value="">Normal</option><option value="small">Small caps</option><option value="all">All caps</option></select>
        </Field>
      </div>
      <div className="check-grid">
        <label><input type="checkbox" checked={!!p.underline} onChange={(e) => set('underline', e.target.checked)} /> Underline</label>
        <label><input type="checkbox" checked={!!p.strike} onChange={(e) => set('strike', e.target.checked)} /> Strikethrough</label>
        <label><input type="checkbox" checked={p.baseline > 0} onChange={(e) => set('baseline', e.target.checked ? 30 : 0)} /> Superscript</label>
        <label><input type="checkbox" checked={p.baseline < 0} onChange={(e) => set('baseline', e.target.checked ? -25 : 0)} /> Subscript</label>
      </div>
      <div className="font-sample" style={{ fontFamily: `"${p.font || 'Interstate'}"`, fontWeight: p.bold ? 700 : 400, fontStyle: p.italic ? 'italic' : 'normal', color: p.color, letterSpacing: `${(p.spacing || 0) * 1.333}px`, textDecoration: `${p.underline ? 'underline ' : ''}${p.strike ? 'line-through' : ''}` }}>
        {p.font || 'Interstate'} — The quick brown fox 0123456789
      </div>
    </Modal>
  );
}

function ParagraphDialog() {
  const para = A.currentParaProps();
  const [p, setP] = useState({
    align: para.align || 'l', marL: Number(para.marL) || 0, indent: Number(para.indent) || 0,
    spaceBefore: Number(para.spaceBefore) || 0, spaceAfter: Number(para.spaceAfter) || 0, lineSpacing: Number(para.lineSpacing) || 1,
  });
  const cm = (emuV) => Math.round(emuV / EMU_PER_CM * 100) / 100;
  const special = p.indent < 0 ? 'hanging' : p.indent > 0 ? 'first' : 'none';
  const apply = () => { A.formatPara(p); closeDialog(); };
  return (
    <Modal title="Paragraph" width={520} footer={<><span className="grow" /><button className="btn" onClick={closeDialog}>Cancel</button><button className="btn primary" onClick={apply}>OK</button></>}>
      <h4>General</h4>
      <Field label="Alignment">
        <select value={p.align} onChange={(e) => setP({ ...p, align: e.target.value })}><option value="l">Left</option><option value="ctr">Centred</option><option value="r">Right</option><option value="just">Justified</option></select>
      </Field>
      <h4>Indentation</h4>
      <div className="form-grid">
        <Field label="Before text (cm)"><input type="number" step="0.1" value={cm(p.marL)} onChange={(e) => setP({ ...p, marL: Math.round(Number(e.target.value) * EMU_PER_CM) })} /></Field>
        <Field label="Special">
          <select value={special} onChange={(e) => setP({ ...p, indent: e.target.value === 'none' ? 0 : e.target.value === 'hanging' ? -Math.abs(p.indent || 228600) : Math.abs(p.indent || 228600) })}>
            <option value="none">(none)</option><option value="first">First line</option><option value="hanging">Hanging</option>
          </select>
        </Field>
        <Field label="By (cm)"><input type="number" step="0.1" min="0" value={cm(Math.abs(p.indent))} onChange={(e) => setP({ ...p, indent: (special === 'first' ? 1 : -1) * Math.round(Number(e.target.value) * EMU_PER_CM) })} disabled={special === 'none'} /></Field>
      </div>
      <h4>Spacing</h4>
      <div className="form-grid">
        <Field label="Before (pt)"><input type="number" step="1" min="0" value={p.spaceBefore} onChange={(e) => setP({ ...p, spaceBefore: Number(e.target.value) })} /></Field>
        <Field label="After (pt)"><input type="number" step="1" min="0" value={p.spaceAfter} onChange={(e) => setP({ ...p, spaceAfter: Number(e.target.value) })} /></Field>
        <Field label="Line spacing (multiple)"><input type="number" step="0.05" min="0.5" max="5" value={p.lineSpacing} onChange={(e) => setP({ ...p, lineSpacing: Number(e.target.value) })} /></Field>
      </div>
    </Modal>
  );
}

function FindDialog({ mode }) {
  const [find, setFind] = useState('');
  const [repl, setRepl] = useState('');
  const [mc, setMc] = useState(false);
  const [rep, setRep] = useState(mode === 'replace');
  const next = () => { if (!find) return; if (!A.find(find, mc)) toast(`"${find}" was not found.`); };
  const replaceOne = () => {
    if (!find) return;
    if (activeEditor) {
      const r = activeEditor.getRange();
      const b = activeEditor.getBody();
      const t = b.paras[r.start.p].runs.map((x) => x.text).join('').slice(r.start.o, r.end.o);
      if ((mc ? t : t.toLowerCase()) === (mc ? find : find.toLowerCase())) activeEditor.insertText(repl);
    }
    next();
  };
  return (
    <Modal title={rep ? 'Replace' : 'Find'} width={460} footer={(
      <>
        {!rep && <button className="btn" onClick={() => setRep(true)}>Replace...</button>}
        <span className="grow" />
        <button className="btn primary" onClick={next}>Find Next</button>
        {rep && <button className="btn" onClick={replaceOne}>Replace</button>}
        {rep && <button className="btn" onClick={() => { const n = A.replaceAllText(find, repl, mc); toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}.`); }}>Replace All</button>}
        <button className="btn" onClick={closeDialog}>Close</button>
      </>
    )}>
      <Field label="Find what"><input value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} /></Field>
      {rep && <Field label="Replace with"><input value={repl} onChange={(e) => setRepl(e.target.value)} /></Field>}
      <label className="check-row"><input type="checkbox" checked={mc} onChange={(e) => setMc(e.target.checked)} /> Match case</label>
    </Modal>
  );
}

function ZoomDialog() {
  const zoom = useStore((s) => s.ui.zoom);
  const [v, setV] = useState(Math.round(zoom * 100));
  return (
    <Modal title="Zoom" width={300} footer={<><span className="grow" /><button className="btn" onClick={closeDialog}>Cancel</button><button className="btn primary" onClick={() => { A.setZoom(v / 100); closeDialog(); }}>OK</button></>}>
      <div className="radio-col">
        <label><input type="radio" name="z" onChange={() => { setUI({ fit: true }); closeDialog(); }} /> Fit</label>
        {[400, 200, 100, 66, 50, 33].map((z) => <label key={z}><input type="radio" name="z" checked={v === z} onChange={() => setV(z)} /> {z}%</label>)}
      </div>
      <Field label="Percent"><input type="number" min="10" max="400" value={v} onChange={(e) => setV(Number(e.target.value))} /></Field>
    </Modal>
  );
}

const SYMBOLS = '→ ← ↑ ↓ ↔ ⇒ ▲ ▼ ► ◄ • · – — … ± × ÷ ≈ ≠ ≤ ≥ ∑ √ ∞ ° ‰ % € £ $ ¥ ¢ © ® ™ § ¶ † ‡ ✓ ✔ ✗ ✘ ★ ☆ ● ○ ■ □ ◆ ◇ ½ ¼ ¾ ¹ ² ³ α β γ δ Δ μ π σ Σ Ω'.split(' ');

function SymbolDialog() {
  return (
    <Modal title="Symbol" width={460} footer={<><span className="grow" /><button className="btn" onClick={closeDialog}>Close</button></>}>
      {!activeEditor && <p className="bs-muted">Click inside a text box first, then insert a symbol.</p>}
      <div className="symbol-grid">
        {SYMBOLS.map((s) => <button key={s} onMouseDown={(e) => e.preventDefault()} onClick={() => activeEditor && activeEditor.insertText(s)} disabled={!activeEditor}>{s}</button>)}
      </div>
    </Modal>
  );
}

function InsertTableDialog() {
  const [r, setR] = useState(4);
  const [c, setC] = useState(4);
  const go = () => {
    const deck = getState().deck;
    const w = Math.min(deck.size.w - EMU_PER_IN, c * Math.round(1.6 * EMU_PER_IN));
    A.insertElement(makeTable(Math.max(1, r), Math.max(1, c), Math.round((deck.size.w - w) / 2), Math.round(1.6 * EMU_PER_IN), w));
    closeDialog();
  };
  return (
    <Modal title="Insert Table" width={300} footer={<><span className="grow" /><button className="btn" onClick={closeDialog}>Cancel</button><button className="btn primary" onClick={go}>OK</button></>}>
      <Field label="Number of columns"><input type="number" min="1" max="30" value={c} onChange={(e) => setC(Number(e.target.value))} /></Field>
      <Field label="Number of rows"><input type="number" min="1" max="60" value={r} onChange={(e) => setR(Number(e.target.value))} /></Field>
    </Modal>
  );
}

function BackgroundDialog() {
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.ui.slideId);
  const slide = deck.slides.find((s) => s.id === slideId);
  const setBg = (c, all) => commit((d) => { d.slides.forEach((s) => { if (all || s.id === slideId) s.background = c; }); });
  return (
    <Modal title="Format Background" width={420} footer={(
      <>
        <button className="btn" onClick={() => { setBg(slide.background, true); toast('Background applied to all slides.'); }}>Apply to All</button>
        <button className="btn" onClick={() => setBg(null, false)}>Reset Background</button>
        <span className="grow" /><button className="btn primary" onClick={closeDialog}>Close</button>
      </>
    )}>
      <Field label="Solid fill colour"><ColorField value={slide.background || deck.master.background} onChange={(c) => setBg(c, false)} allowNone noneLabel="Master background" /></Field>
      <label className="check-row"><input type="checkbox" checked={!!slide.hideMaster} onChange={(e) => commit((d) => { d.slides.find((s) => s.id === slideId).hideMaster = e.target.checked; })} /> Hide background graphics (master objects)</label>
    </Modal>
  );
}

const SLOT_NAMES = { dk1: 'Text/Background - Dark 1', lt1: 'Text/Background - Light 1', dk2: 'Text/Background - Dark 2', lt2: 'Text/Background - Light 2', accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3', accent4: 'Accent 4', accent5: 'Accent 5', accent6: 'Accent 6', hlink: 'Hyperlink', folHlink: 'Followed Hyperlink' };

function ThemeColorsDialog() {
  const theme = useStore((s) => s.deck.theme);
  const [t, setT] = useState(JSON.parse(JSON.stringify(theme)));
  return (
    <Modal title="Theme Colours" width={460} footer={<><span className="grow" /><button className="btn" onClick={closeDialog}>Cancel</button><button className="btn primary" onClick={() => { A.applyTheme({ ...t, name: t.name === theme.name ? `${theme.name} (custom)` : t.name }, true); closeDialog(); }}>Save</button></>}>
      <p className="bs-muted">Objects using a theme colour are updated. The colours are written into the PowerPoint theme on export.</p>
      <div className="settings-grid">
        {Object.keys(SLOT_NAMES).map((k) => (
          <React.Fragment key={k}><span className="sg-key">{SLOT_NAMES[k]}</span><span className="sg-val"><ColorField value={t.colors[k]} onChange={(c) => c && setT({ ...t, colors: { ...t.colors, [k]: c } })} /></span></React.Fragment>
        ))}
      </div>
    </Modal>
  );
}

function ThemeFontsDialog() {
  const theme = useStore((s) => s.deck.theme);
  const [major, setMajor] = useState(theme.fonts.major);
  const [minor, setMinor] = useState(theme.fonts.minor);
  return (
    <Modal title="Theme Fonts" width={440} footer={<><span className="grow" /><button className="btn" onClick={closeDialog}>Cancel</button><button className="btn primary" onClick={() => { A.applyTheme({ ...theme, fonts: { major, minor } }, false); closeDialog(); }}>Save</button></>}>
      <p className="bs-muted">Text that uses the current heading or body font is switched to the new one.</p>
      <Field label="Heading font"><FontPicker value={major} onPick={setMajor} width={240} /></Field>
      <Field label="Body font"><FontPicker value={minor} onPick={setMinor} width={240} /></Field>
      <div className="font-sample" style={{ fontFamily: `"${major}"`, fontSize: 22, fontWeight: 700 }}>Heading</div>
      <div className="font-sample" style={{ fontFamily: `"${minor}"` }}>Body text sample, 0123456789</div>
    </Modal>
  );
}

function FormatPane({ tab: initialTab }) {
  useStore((s) => s.rev);
  const units = useStore((s) => s.ui.units);
  const [tab, setTab] = useState(initialTab || 'shape');
  const els = selectedElements();
  const e = els[0];
  if (!e) return <Modal title="Format" width={360}><p className="bs-muted">Select an object first.</p></Modal>;
  const u = units === 'in' ? EMU_PER_IN : EMU_PER_CM;
  const b = bounds(e);
  const setB = (k, v) => updateElement(e.id, (x) => { const nb = { ...bounds(x), [k]: Math.round(v * u) }; fitElement(x, bounds(x), nb); });
  const ins = (e.text && e.text.insets) || { l: 91440, r: 91440, t: 45720, b: 45720 };
  return (
    <Modal title="Format Shape" width={420} className="format-pane" footer={<><span className="grow" /><button className="btn primary" onClick={closeDialog}>Close</button></>}>
      <div className="tabs">
        <button className={tab === 'shape' ? 'active' : ''} onClick={() => setTab('shape')}>Fill & Line</button>
        <button className={tab === 'size' ? 'active' : ''} onClick={() => setTab('size')}>Size & Position</button>
        {e.text && <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}>Text Box</button>}
      </div>
      {tab === 'shape' && (
        <>
          {e.type !== 'line' && <Field label="Fill"><ColorField value={e.fill && e.fill.color} allowNone noneLabel="No fill" onChange={(c) => updateSelected((x) => { if (x.type !== 'line') x.fill = c ? { color: c, alpha: x.fill && x.fill.alpha } : null; })} /></Field>}
          {e.type !== 'line' && e.fill && <Field label="Transparency (%)"><input type="number" min="0" max="100" value={Math.round((1 - (e.fill.alpha ?? 1)) * 100)} onChange={(ev) => updateSelected((x) => { if (x.fill) x.fill.alpha = 1 - Number(ev.target.value) / 100; })} /></Field>}
          <Field label="Line"><ColorField value={e.line && e.line.color} allowNone={e.type !== 'line'} noneLabel="No line" onChange={(c) => updateSelected((x) => { if (x.type === 'line') { if (c) x.line.color = c; } else x.line = c ? { width: 1, dash: 'solid', ...(x.line || {}), color: c } : null; })} /></Field>
          {e.line && <Field label="Width (pt)"><input type="number" step="0.25" min="0.25" value={e.line.width || 1} onChange={(ev) => updateSelected((x) => { if (x.line) x.line.width = Number(ev.target.value); })} /></Field>}
          {e.line && <Field label="Dash type"><select value={e.line.dash || 'solid'} onChange={(ev) => updateSelected((x) => { if (x.line) x.line.dash = ev.target.value; })}>
            <option value="solid">Solid</option><option value="sysDash">Square dot</option><option value="dot">Round dot</option><option value="dash">Dash</option><option value="dashDot">Dash dot</option><option value="lgDash">Long dash</option>
          </select></Field>}
        </>
      )}
      {tab === 'size' && (
        <div className="form-grid">
          <Field label={`Height (${units})`}><input type="number" step="0.01" value={(b.h / u).toFixed(2)} onChange={(ev) => setB('h', Number(ev.target.value))} /></Field>
          <Field label={`Width (${units})`}><input type="number" step="0.01" value={(b.w / u).toFixed(2)} onChange={(ev) => setB('w', Number(ev.target.value))} /></Field>
          <Field label={`Horizontal position (${units})`}><input type="number" step="0.01" value={(b.x / u).toFixed(2)} onChange={(ev) => setB('x', Number(ev.target.value))} /></Field>
          <Field label={`Vertical position (${units})`}><input type="number" step="0.01" value={(b.y / u).toFixed(2)} onChange={(ev) => setB('y', Number(ev.target.value))} /></Field>
          {(e.type === 'shape' || e.type === 'image') && <Field label="Rotation (°)"><input type="number" step="1" value={e.rot || 0} onChange={(ev) => updateSelected((x) => { x.rot = ((Number(ev.target.value) % 360) + 360) % 360; })} /></Field>}
          <label className="check-row"><input type="checkbox" checked={!!e.lockAspect} onChange={(ev) => updateSelected((x) => { x.lockAspect = ev.target.checked; })} /> Lock aspect ratio</label>
        </div>
      )}
      {tab === 'text' && e.text && (
        <>
          <Field label="Vertical alignment"><select value={e.text.anchor} onChange={(ev) => A.setBodyProps({ anchor: ev.target.value })}><option value="t">Top</option><option value="ctr">Middle</option><option value="b">Bottom</option></select></Field>
          <Field label="Autofit"><select value={e.text.autofit} onChange={(ev) => A.setBodyProps({ autofit: ev.target.value })}><option value="none">Do not Autofit</option><option value="shape">Resize shape to fit text</option></select></Field>
          <div className="form-grid">
            {['l', 'r', 't', 'b'].map((k) => (
              <Field key={k} label={`${{ l: 'Left', r: 'Right', t: 'Top', b: 'Bottom' }[k]} margin (cm)`}>
                <input type="number" step="0.05" min="0" value={(ins[k] / EMU_PER_CM).toFixed(2)} onChange={(ev) => A.setBodyProps({ insets: { ...ins, [k]: Math.round(Number(ev.target.value) * EMU_PER_CM) } })} />
              </Field>
            ))}
          </div>
          <label className="check-row"><input type="checkbox" checked={e.text.wrap !== false} onChange={(ev) => A.setBodyProps({ wrap: ev.target.checked })} /> Wrap text in shape</label>
        </>
      )}
    </Modal>
  );
}

function CropDialog({ id }) {
  const el = selectedElements().find((e) => e.id === id);
  if (!el) return null;
  const c = el.crop || {};
  const set = (k, v) => updateElement(id, (x) => {
    const old = x.crop || {};
    const nc = { ...old, [k]: Math.max(0, Math.min(0.9, v / 100)) };
    // keep the picture's on-screen scale: shrink the frame by what was cropped
    const visW = 1 - (old.l || 0) - (old.r || 0); const visH = 1 - (old.t || 0) - (old.b || 0);
    const fullW = x.w / visW; const fullH = x.h / visH;
    const nw = fullW * (1 - (nc.l || 0) - (nc.r || 0)); const nh = fullH * (1 - (nc.t || 0) - (nc.b || 0));
    x.x += Math.round(fullW * ((nc.l || 0) - (old.l || 0)));
    x.y += Math.round(fullH * ((nc.t || 0) - (old.t || 0)));
    x.w = Math.round(nw); x.h = Math.round(nh);
    x.crop = nc;
  });
  return (
    <Modal title="Crop Picture" width={360} footer={<><button className="btn" onClick={() => updateElement(id, (x) => { x.crop = null; })}>Reset</button><span className="grow" /><button className="btn primary" onClick={closeDialog}>Close</button></>}>
      <div className="form-grid">
        {['l', 't', 'r', 'b'].map((k) => (
          <Field key={k} label={`${{ l: 'Left', t: 'Top', r: 'Right', b: 'Bottom' }[k]} (%)`}>
            <input type="number" min="0" max="90" step="1" value={Math.round((c[k] || 0) * 100)} onChange={(e) => set(k, Number(e.target.value))} />
          </Field>
        ))}
      </div>
    </Modal>
  );
}

const MAP = {
  ask: AskDialog, prompt: PromptDialog, font: FontDialog, paragraph: ParagraphDialog, find: FindDialog, zoom: ZoomDialog,
  symbol: SymbolDialog, insertTable: InsertTableDialog, background: BackgroundDialog, themeColors: ThemeColorsDialog,
  themeFonts: ThemeFontsDialog, formatPane: FormatPane, crop: CropDialog,
  charts: ChartsDialog, chartData: ChartDataDialog, chartSettings: ChartSettingsDialog, linkNumber: LinkNumberDialog,
  editLinks: EditLinksDialog, updatePpt: UpdatePptDialog, compare: CompareDialog, share: ShareDialog,
};

export default function DialogHost() {
  const dialog = useStore((s) => s.ui.dialog);
  if (!dialog) return null;
  const C = MAP[dialog.type];
  if (!C) return null;
  return <C key={dialog.type} {...dialog} />;
}

export { EMU_PER_PT };
