import React, { useEffect, useMemo, useState } from 'react';
import { useStore, getState, closeDialog, toast, ask, promptText, selectedElements, commit, setUI } from '../../lib/store.js';
import { post, get } from '../../lib/api.js';
import {
  loadChartLibrary, insertChart, setChartLink, setChartSettings, linkInventory, changeSource, refreshLinks, linkNumberHere,
  sourcePath, renderCharts,
} from '../../lib/data.js';
import { chooseFile, folderOf, deckFileName } from '../../lib/files.js';
import { findIn, walkElements } from '../../lib/model.js';
import { NUMBER_FORMATS } from '../../lib/numfmt.js';
import ChartView from '../../render/ChartView.jsx';
import SlideView, { slideSurface } from '../../render/SlideView.jsx';
import { px } from '../../lib/model.js';
import Modal, { Field } from './Modal.jsx';
import ExcelPicker from './ExcelPicker.jsx';
import { openChartEditor } from '../ribbon/FormatTabs.jsx';
import { ColorGrid, Popover, usePopover } from '../controls.jsx';
import { ICode, IAdd, IFolder, ITesting, IProduction, IRefresh, IWarn, IOk } from '../icons.js';

// ------------------------------------------------------------ chart library
function ChartPreview({ name, testing, w = 300, h = 160 }) {
  const [spec, setSpec] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    post('/api/charts/render', { name, frame: { w: w * 0.75 * 2, h: h * 0.75 * 2 }, testing })
      .then((r) => alive && setSpec(r.spec)).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [name, testing, w, h]);
  if (err) return <div className="chart-prev-err" style={{ width: w, height: h }}><IWarn /> {err}</div>;
  return (
    <div className="chart-prev" style={{ width: w, height: h }}>
      <div style={{ transform: 'scale(0.5)', transformOrigin: '0 0' }}>
        <ChartView spec={spec} w={w * 2} h={h * 2} />
      </div>
    </div>
  );
}

export function ChartsDialog() {
  const charts = useStore((s) => s.charts);
  const root = useStore((s) => s.chartRoot);
  const testing = useStore((s) => s.ui.testing);
  const [pick, setPick] = useState(null);
  const [step, setStep] = useState('pick');
  const [link, setLink] = useState(null);
  const [useSample, setUseSample] = useState(true);
  useEffect(() => { loadChartLibrary(); }, []);
  useEffect(() => { if (!pick && charts.length) setPick(charts[0].name); }, [charts, pick]);
  const cur = charts.find((c) => c.name === pick);

  const doInsert = async () => {
    let table = null;
    if (!useSample) {
      if (!link || !link.path || !link.table) { toast('Choose an Excel file, sheet and named table, or use sample data.', { kind: 'warn' }); return; }
      try { table = await post('/api/excel/table', link); } catch (e) { toast(e.message, { kind: 'error' }); return; }
    }
    closeDialog();
    await insertChart(pick, useSample ? { title: cur && cur.title } : { link, table: { columns: table.columns, rows: table.rows }, title: cur && cur.title });
  };

  const promote = async (name) => {
    const r = await ask('Send to Production', `Make the testing version of "${name}" the one every deck uses?\n\nDo you want to back up the current production version first?`, [
      { id: 'backup', label: 'Back up, then send', primary: true }, { id: 'nobackup', label: 'Send without backup' }, { id: 'cancel', label: 'Cancel' },
    ]);
    if (r !== 'backup' && r !== 'nobackup') return;
    try {
      const res = await post('/api/charts/promote', { name, backup: r === 'backup' });
      toast(`"${name}" is now in production${res.backup ? ' (backup saved)' : ''}.`, { kind: 'success' });
      await loadChartLibrary();
      import('../../lib/files.js').then((m) => m.broadcast({ type: 'chart-promoted', name }));
      window.dispatchEvent(new CustomEvent('ds-chart-code', { detail: { type: 'chart-promoted', name } }));
    } catch (e) { toast(e.message, { kind: 'error' }); }
  };

  const discard = async (name) => {
    const r = await ask('Discard testing changes', `Throw away the testing version of "${name}"? Production is not affected.`);
    if (r !== 'ok') return;
    await post('/api/charts/discard', { name });
    await loadChartLibrary();
    window.dispatchEvent(new CustomEvent('ds-chart-code', { detail: { type: 'chart-promoted', name } }));
  };

  const addNew = async () => {
    const title = await promptText('Add new chart', 'Chart title', 'My new chart', { hint: 'A testing copy is created from the chart you have selected in the list. Edit its code, then Send to Production.' });
    if (!title) return;
    const name = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'new_chart';
    try {
      await post('/api/charts/new', { name, title, base: pick });
      await loadChartLibrary();
      setPick(name);
      openChartEditor(name);
    } catch (e) { toast(e.message, { kind: 'error' }); }
  };

  return (
    <Modal title="Charts" width={880} className="charts-dialog" footer={step === 'pick' ? (
      <>
        <button className="btn" onClick={addNew}><IAdd /> Add new chart</button>
        <button className="btn" onClick={() => post('/api/charts/folder').catch((e) => toast(e.message, { kind: 'error' }))}><IFolder /> Open library folder</button>
        <span className="grow" />
        <button className="btn" onClick={closeDialog}>Cancel</button>
        <button className="btn primary" disabled={!cur || (!cur.inProduction && !testing)} onClick={() => setStep('data')}>Insert...</button>
      </>
    ) : (
      <>
        <button className="btn" onClick={() => setStep('pick')}>Back</button>
        <span className="grow" />
        <button className="btn" onClick={closeDialog}>Cancel</button>
        <button className="btn primary" onClick={doInsert}>Insert chart</button>
      </>
    )}>
      {step === 'pick' ? (
        <div className="charts-layout">
          <div className="charts-list">
            {charts.map((c) => (
              <div key={c.name} className={`chart-row${pick === c.name ? ' active' : ''}`} onClick={() => setPick(c.name)} onDoubleClick={() => setStep('data')}>
                <div className="cr-title">{c.title}</div>
                <div className="cr-badges">
                  {c.inProduction && <span className="badge prod">Production</span>}
                  {c.hasTesting && <span className="badge test">Testing</span>}
                  {c.error && <span className="badge err" title={c.error}>Error</span>}
                </div>
              </div>
            ))}
            {!charts.length && <div className="bs-muted">Loading the chart library...</div>}
          </div>
          {cur && (
            <div className="chart-detail">
              <ChartPreview key={`${cur.name}-${testing}-${cur.modified}`} name={cur.name} testing={testing || !cur.inProduction} w={440} h={220} />
              <h3>{cur.title}</h3>
              <p className="bs-muted">{cur.description}</p>
              {cur.error && <div className="form-error">{cur.error}</div>}
              <div className="cd-actions">
                <button className="btn" onClick={() => openChartEditor(cur.name)}><ICode /> Edit code</button>
                {cur.hasTesting && <button className="btn" onClick={() => promote(cur.name)}><IProduction /> Send to Production</button>}
                {cur.hasTesting && cur.inProduction && <button className="btn" onClick={() => discard(cur.name)}>Discard testing</button>}
              </div>
              {cur.hasTesting && !testing && <div className="hint-box"><ITesting /> This chart has testing changes. Turn on Testing mode (Data tab) to see them in open decks.</div>}
              <div className="bs-muted small">Library: {root}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="insert-data">
          <div className="radio-row">
            <label><input type="radio" checked={useSample} onChange={() => setUseSample(true)} /> Use sample data (link it later)</label>
            <label><input type="radio" checked={!useSample} onChange={() => setUseSample(false)} /> Link to an Excel table</label>
          </div>
          {!useSample && <ExcelPicker value={link} onChange={setLink} />}
          {useSample && <ChartPreview name={cur.name} testing={testing || !cur.inProduction} w={520} h={240} />}
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------- chart data link
export function ChartDataDialog({ id }) {
  const deck = useStore((s) => s.deck);
  const el = selectedElements().find((e) => e.id === id) || findIn(deck.slides.flatMap((s) => s.elements), id);
  const init = el && el.link ? { path: sourcePath(deck, el.link.source), sheet: el.link.sheet, table: el.link.table } : null;
  const [link, setLink] = useState(init);
  if (!el) return null;
  const apply = async () => {
    if (!link || !link.path || !link.table) { toast('Choose a file, sheet and named table.', { kind: 'warn' }); return; }
    try {
      const t = await post('/api/excel/table', link);
      await setChartLink(el.id, link, { columns: t.columns, rows: t.rows });
      closeDialog();
      toast('Chart linked to Excel.', { kind: 'success' });
    } catch (e) { toast(e.message, { kind: 'error' }); }
  };
  const unlink = () => {
    commit((d) => { walkAll(d, (e) => { if (e.id === el.id) e.link = null; }); });
    closeDialog();
    toast('The chart keeps its current values but no longer refreshes from Excel.');
  };
  return (
    <Modal title={el.link ? 'Change Data Link' : 'Link Chart to Excel'} width={640} footer={(
      <>
        {el.link && <button className="btn" onClick={unlink}>Unlink (keep values)</button>}
        <span className="grow" />
        <button className="btn" onClick={closeDialog}>Cancel</button>
        <button className="btn primary" onClick={apply}>OK</button>
      </>
    )}>
      <p className="bs-muted">The chart reads a named table. The first row of the table holds the column names.</p>
      <ExcelPicker value={link} onChange={setLink} />
    </Modal>
  );
}

function walkAll(d, fn) {
  d.slides.forEach((s) => walkElements(s.elements, fn));
  walkElements(d.master.elements, fn);
  d.layouts.forEach((l) => walkElements(l.elements, fn));
}

// --------------------------------------------------------- chart settings
function SettingInput({ k, def, value, onChange }) {
  const pop = usePopover();
  const v = value === undefined ? def : value;
  const isColor = (x) => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x);
  if (typeof def === 'boolean') return <input type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} />;
  if (typeof def === 'number') return <input type="number" step={Number.isInteger(def) ? 1 : 0.01} value={v} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
  if (isColor(def)) {
    return (
      <span className="color-field">
        <button className="swatch-btn" style={{ background: v }} onClick={pop.open} />
        <input value={v} onChange={(e) => onChange(e.target.value)} />
        {pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close}><ColorGrid onPick={(c) => c && onChange(c)} onClose={pop.close} /></Popover>}
      </span>
    );
  }
  if (Array.isArray(def) && (def.every(isColor) && def.length)) {
    const arr = Array.isArray(v) ? v : def;
    return (
      <span className="color-list">
        {arr.map((c, i) => <ColorSlot key={i} color={c} onPick={(nc) => { const n = [...arr]; n[i] = nc; onChange(n); }} />)}
        <button className="mini" onClick={() => onChange([...arr, '#5B6770'])}>+</button>
        {arr.length > 1 && <button className="mini" onClick={() => onChange(arr.slice(0, -1))}>−</button>}
      </span>
    );
  }
  if (Array.isArray(def)) return <input value={(Array.isArray(v) ? v : []).join(', ')} placeholder="(all)" onChange={(e) => onChange(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />;
  return <input value={v ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

function ColorSlot({ color, onPick }) {
  const pop = usePopover();
  return (
    <>
      <button className="swatch-btn" style={{ background: color }} onClick={pop.open} title={color} />
      {pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close}><ColorGrid onPick={(c) => c && onPick(c)} onClose={pop.close} /></Popover>}
    </>
  );
}

const pretty = (k) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function ChartSettingsDialog({ id }) {
  const charts = useStore((s) => s.charts);
  const testing = useStore((s) => s.ui.testing);
  const el = selectedElements().find((e) => e.id === id);
  const [over, setOver] = useState(el ? { ...(el.settings || {}) } : {});
  const meta = charts.find((c) => c.name === (el && el.chartType));
  useEffect(() => { if (!charts.length) loadChartLibrary(); }, []);
  if (!el) return null;
  const defs = (testing && meta && meta.testingSettings) || (meta && meta.settings) || {};
  const apply = async (close) => {
    const clean = Object.fromEntries(Object.entries(over).filter(([k, v]) => v !== undefined && JSON.stringify(v) !== JSON.stringify(defs[k])));
    await setChartSettings(el.id, clean);
    if (close) closeDialog();
  };
  return (
    <Modal title={`Chart Settings — ${meta ? meta.title : el.chartType}`} width={600} footer={(
      <>
        <button className="btn" onClick={() => setOver({})}>Reset all to library defaults</button>
        <span className="grow" />
        <button className="btn" onClick={() => apply(false)}>Apply</button>
        <button className="btn primary" onClick={() => apply(true)}>OK</button>
      </>
    )}>
      <p className="bs-muted">These settings apply to this chart only. Defaults come from the chart library code.</p>
      <div className="settings-grid">
        {Object.entries(defs).map(([k, def]) => (
          <React.Fragment key={k}>
            <span className={`sg-key${over[k] !== undefined && JSON.stringify(over[k]) !== JSON.stringify(def) ? ' changed' : ''}`}>{pretty(k)}</span>
            <span className="sg-val">
              <SettingInput k={k} def={def} value={over[k]} onChange={(v) => setOver({ ...over, [k]: v })} />
              {over[k] !== undefined && <button className="mini" title="Back to default" onClick={() => { const n = { ...over }; delete n[k]; setOver(n); }}>↺</button>}
            </span>
          </React.Fragment>
        ))}
        {!Object.keys(defs).length && <span className="bs-muted">This chart has no SETTINGS block.</span>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------- linked number
export function LinkNumberDialog() {
  const [v, setV] = useState({ format: '#,##0' });
  const [custom, setCustom] = useState(false);
  const apply = async () => {
    if (!v.path || !v.sheet || !v.ref) { toast('Choose the file, sheet and cell.', { kind: 'warn' }); return; }
    try {
      await linkNumberHere(v);
      closeDialog();
      toast('Linked number inserted. It updates when you Refresh.', { kind: 'success' });
    } catch (e) { toast(e.message, { kind: 'error' }); }
  };
  return (
    <Modal title="Insert Linked Number" width={600} footer={(
      <><span className="grow" /><button className="btn" onClick={closeDialog}>Cancel</button><button className="btn primary" onClick={apply}>Insert</button></>
    )}>
      <p className="bs-muted">The number goes where your cursor is in the text box, and keeps the text box's font and size.</p>
      <ExcelPicker mode="value" value={v} onChange={(n) => setV({ ...v, ...n })} />
      <Field label="Number format">
        <span className="file-row">
          {!custom ? (
            <select value={v.format} onChange={(e) => (e.target.value === '__custom' ? setCustom(true) : setV({ ...v, format: e.target.value }))}>
              {NUMBER_FORMATS.map((f) => <option key={f.fmt} value={f.fmt}>{f.label}  ({f.fmt})</option>)}
              <option value="__custom">Custom…</option>
            </select>
          ) : <input value={v.format} onChange={(e) => setV({ ...v, format: e.target.value })} placeholder='#,##0.0"m"' />}
        </span>
      </Field>
    </Modal>
  );
}

// -------------------------------------------------------------- edit links
export function EditLinksDialog() {
  const deck = useStore((s) => s.deck);
  const [status, setStatus] = useState({});
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const sources = Object.entries(deck.links?.sources || {});
  const inv = useMemo(() => linkInventory(deck), [deck]);
  const check = async () => {
    try { const r = await post('/api/links/check', { sources: deck.links?.sources || {} }); setStatus(r.status); } catch (e) { toast(e.message, { kind: 'error' }); }
  };
  useEffect(() => { check(); }, [JSON.stringify(deck.links)]);
  useEffect(() => { if (!sel && sources.length) setSel(sources[0][0]); }, [sources.length]);
  const change = async () => {
    if (!sel) return;
    const old = sourcePath(deck, sel);
    const p = await chooseFile('open', 'excel', { title: `Change source: ${deckFileName(old)}`, initialDir: folderOf(old), fallback: old });
    if (!p) return;
    setBusy(true);
    try {
      const r = await changeSource(sel, p);
      if (r.missing.length) toast(`Repointed to ${deckFileName(p)}, but these tables are missing there: ${r.missing.join(', ')}`, { kind: 'warn', ms: 12000 });
      else toast(`All charts and numbers now read from ${deckFileName(p)}.`, { kind: 'success' });
      check();
    } catch (e) { toast(e.message, { kind: 'error' }); }
    setBusy(false);
  };
  const update = async () => {
    if (!sel) return;
    setBusy(true);
    await refreshLinks('all', { sources: [sel] });
    setBusy(false);
  };
  const breakLink = async () => {
    if (!sel) return;
    const r = await ask('Break link', 'Charts and numbers from this file keep their current values but will no longer refresh. Continue?');
    if (r !== 'ok') return;
    commit((d) => {
      walkAll(d, (e) => {
        if (e.type === 'chart' && e.link && e.link.source === sel) e.link = null;
        const bodies = [];
        if (e.text) bodies.push(e.text);
        if (e.type === 'table') e.rows.forEach((row) => row.cells.forEach((c) => bodies.push(c.text)));
        bodies.forEach((b) => b.paras.forEach((p) => p.runs.forEach((run) => { if (run.link && run.link.source === sel) delete run.link; })));
      });
      delete d.links.sources[sel];
    });
    setSel(null);
  };
  return (
    <Modal title="Edit Links" width={820} className="edit-links" footer={(
      <><span className="bs-muted small">Tip: save the Excel file before updating — Deck Studio reads the last saved values.</span><span className="grow" /><button className="btn primary" onClick={closeDialog}>Close</button></>
    )}>
      <div className="el-layout">
        <div className="el-table">
          <table>
            <thead><tr><th>Source</th><th>Uses</th><th>Status</th></tr></thead>
            <tbody>
              {sources.map(([id, s]) => {
                const st = status[id];
                const i = inv[id];
                return (
                  <tr key={id} className={sel === id ? 'sel' : ''} onClick={() => setSel(id)}>
                    <td><b>{deckFileName(s.path)}</b><div className="bs-muted small">{folderOf(s.path)}</div></td>
                    <td>{i ? `${i.charts} chart${i.charts === 1 ? '' : 's'}, ${i.numbers} number${i.numbers === 1 ? '' : 's'}` : 'Not used'}</td>
                    <td>{!st ? '…' : st.exists ? (st.error ? <span className="st-err"><IWarn /> {st.error}</span> : <span className="st-ok"><IOk /> OK{st.modified ? ` · saved ${new Date(st.modified * 1000).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span>) : <span className="st-err"><IWarn /> File not found</span>}</td>
                  </tr>
                );
              })}
              {!sources.length && <tr><td colSpan={3} className="bs-muted">This deck has no links to Excel yet. Link a chart (Chart Design › Link to Excel) or insert a Linked Number.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="el-buttons">
          <button className="btn" disabled={!sel || busy} onClick={update}><IRefresh /> Update Values</button>
          <button className="btn" disabled={!sel || busy} onClick={change}>Change Source...</button>
          <button className="btn" disabled={!sel} onClick={() => post('/api/open-path', { path: sourcePath(deck, sel) }).catch((e) => toast(e.message, { kind: 'error' }))}>Open Source</button>
          <button className="btn" disabled={!sel} onClick={breakLink}>Break Link</button>
          <button className="btn" onClick={check}>Check Status</button>
        </div>
      </div>
      {sel && inv[sel] && <div className="bs-muted small">Used on slide{inv[sel].slides.size === 1 ? '' : 's'}: {[...inv[sel].slides].join(', ')}</div>}
      {sel && deck.links.sources[sel] && deck.links.sources[sel].previous && <div className="bs-muted small">Previously: {deck.links.sources[sel].previous}</div>}
    </Modal>
  );
}

// --------------------------------------------------------- update ppt
export function UpdatePptDialog() {
  const settings = useStore((s) => s.settings);
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.ui.slideId);
  const slideSel = useStore((s) => s.ui.slideSel);
  const [target, setTarget] = useState(settings.lastExport || '');
  const [scope, setScope] = useState('all');
  const [save, setSave] = useState(true);
  const [ppt, setPpt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { get('/api/powerpoint/status').then(setPpt).catch(() => setPpt({ running: false, files: [] })); }, []);
  const run = async () => {
    if (!target) { toast('Choose the PowerPoint file to update.', { kind: 'warn' }); return; }
    const ids = scope === 'all' ? null : scope === 'current' ? [slideId] : slideSel;
    setBusy(true); setResult(null);
    try {
      const r = await post('/api/powerpoint/update', { deck, target, slideIds: ids, save });
      setResult(r);
      toast(`PowerPoint updated: ${r.replaced} slide(s) replaced, ${r.added} added.`, { kind: 'success' });
    } catch (e) { setResult({ error: e.message }); }
    setBusy(false);
  };
  return (
    <Modal title="Update PowerPoint" width={640} footer={(
      <><span className="grow" /><button className="btn" onClick={closeDialog}>Close</button><button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Updating...' : 'Update'}</button></>
    )}>
      <p className="bs-muted">Slides that came from this deck are replaced in place; new slides are added at the end. Other slides in the file are not touched. This works while the file is open in PowerPoint.</p>
      <Field label="PowerPoint file">
        <span className="file-row">
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="C:\\...\\Board pack.pptx" />
          <button className="btn" onClick={async () => { const p = await chooseFile('open', 'pptx', { title: 'Choose the PowerPoint file to update', initialDir: folderOf(target) }); if (p) setTarget(p); }}>Browse...</button>
        </span>
      </Field>
      {ppt && ppt.files && ppt.files.length > 0 && (
        <div className="recent-sources">Open in PowerPoint now: {ppt.files.map((f) => <button key={f} className="link" onClick={() => setTarget(f)}>{deckFileName(f)}</button>)}</div>
      )}
      {ppt && ppt.unavailable && <div className="hint-box"><IWarn /> {ppt.unavailable}</div>}
      <Field label="Slides to send">
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">All slides ({deck.slides.length})</option>
          <option value="current">Current slide only</option>
          <option value="selected">Selected slides ({slideSel.length})</option>
        </select>
      </Field>
      <label className="check-row"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save the PowerPoint file after updating</label>
      {result && (result.error ? <div className="form-error">{result.error}</div> : <div className="hint-box ok"><IOk /> {result.replaced} replaced, {result.added} added{result.wasOpen ? ' (file was open in PowerPoint)' : ''}.</div>)}
    </Modal>
  );
}

// ------------------------------------------------------------- compare
export function CompareDialog() {
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.ui.slideId);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const slide = deck.slides.find((s) => s.id === slideId);
  const n = deck.slides.indexOf(slide) + 1;
  useEffect(() => {
    post('/api/compare', { deck, slideIds: [slideId] }).then(setRes).catch((e) => setErr(e.message));
  }, []);
  const W = 520; const H = W * px(deck.size.h) / px(deck.size.w);
  const s = W / px(deck.size.w);
  return (
    <Modal title={`Check Export — slide ${n}`} width={1140} footer={<><span className="bs-muted small">Differences in line breaks usually mean a font is not installed on this computer.</span><span className="grow" /><button className="btn primary" onClick={closeDialog}>Close</button></>}>
      <div className="compare">
        <div>
          <div className="cmp-title">Deck Studio</div>
          <div className="cmp-box" style={{ width: W, height: H }}>
            <div style={{ transform: `scale(${s})`, transformOrigin: '0 0' }}><SlideView deck={deck} surface={slideSurface(slide)} mode="show" slideNumber={n} /></div>
          </div>
        </div>
        <div>
          <div className="cmp-title">Exported .pptx{res ? ` (drawn by ${res.engine})` : ''}</div>
          <div className="cmp-box" style={{ width: W, height: H }}>
            {res && res.images[0] && <img src={res.images[0]} alt="Exported slide" style={{ width: W, height: H }} />}
            {!res && !err && <div className="cmp-wait">Exporting and drawing in PowerPoint...</div>}
            {err && <div className="form-error">{err}</div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- share
export function ShareDialog() {
  const deck = useStore((s) => s.deck);
  const [busy, setBusy] = useState(false);
  const go = async (how, mode) => {
    setBusy(true);
    try {
      const r = await post('/api/share', { deck, how, mode });
      if (r.mailed) toast('Outlook opened a new email with the file attached.', { kind: 'success' });
      else if (r.shown) toast('File created and shown in its folder.', { kind: 'success' });
      else toast(`Outlook was not available, so the file is shown in its folder instead. (${r.reason || ''})`, { kind: 'warn' });
      closeDialog();
    } catch (e) { toast(e.message, { kind: 'error' }); }
    setBusy(false);
  };
  return (
    <Modal title="Share" width={520} footer={<><span className="grow" /><button className="btn" onClick={closeDialog}>Close</button></>}>
      <div className="share-opts">
        <button className="exp-card" disabled={busy} onClick={() => go('pptx', 'mail')}><b>Email as PowerPoint</b><p>Exports a .pptx and opens a new Outlook email with it attached.</p></button>
        <button className="exp-card" disabled={busy} onClick={() => go('deck', 'mail')}><b>Email the Deck Studio file</b><p>Attaches the editable .dstudio deck (charts stay linked).</p></button>
        <button className="exp-card" disabled={busy} onClick={() => go('pptx', 'folder')}><b>Create a PowerPoint copy</b><p>Exports a .pptx and opens its folder, ready to drag into Teams or email.</p></button>
      </div>
      <div className="bs-muted small">Deck: {deck.name}</div>
    </Modal>
  );
}

export { renderCharts, setUI, getState };
