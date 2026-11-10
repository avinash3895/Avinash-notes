import React, { useEffect, useState } from 'react';
import { useStore, setUI, getState, openDialog, toast } from '../lib/store.js';
import { get, post } from '../lib/api.js';
import {
  newDeckCmd, openDeckCmd, openDeckPath, saveDeck, saveDeckAs, saveNewVersion, exportPptx, folderOf, chooseFile, saveSettings,
} from '../lib/files.js';
import { linkInventory } from '../lib/data.js';
import { ScaledSlide } from '../render/SlideView.jsx';
import {
  IHome, IDocNew, IOpen, IInfo, IDocSave, ISaveAs, ISaveVersion, IExport, IUpdatePpt, IShare, ISettings, ICloseBig, IFolder, IDelete,
} from './icons.js';

const NAV = [
  { id: 'home', label: 'Home', icon: IHome },
  { id: 'new', label: 'New', icon: IDocNew },
  { id: 'open', label: 'Open', icon: IOpen },
  { divider: true },
  { id: 'info', label: 'Info', icon: IInfo },
  { id: 'save', label: 'Save', icon: IDocSave, run: () => { saveDeck(); setUI({ backstage: null }); } },
  { id: 'saveas', label: 'Save As', icon: ISaveAs, run: () => { setUI({ backstage: null }); saveDeckAs(); } },
  { id: 'version', label: 'Save New Version', icon: ISaveVersion, run: () => { setUI({ backstage: null }); saveNewVersion(); } },
  { divider: true },
  { id: 'export', label: 'Export', icon: IExport },
  { id: 'update', label: 'Update PowerPoint', icon: IUpdatePpt, run: () => { setUI({ backstage: null }); openDialog('updatePpt'); } },
  { id: 'share', label: 'Share', icon: IShare, run: () => { setUI({ backstage: null }); openDialog('share'); } },
  { divider: true },
  { id: 'options', label: 'Options', icon: ISettings },
];

function Recent({ compact }) {
  const [list, setList] = useState(null);
  const load = () => get('/api/recent').then((r) => setList(r.recent)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  if (!list) return <div className="bs-muted">Loading...</div>;
  if (!list.length) return <div className="bs-muted">Decks you open or save will show up here.</div>;
  return (
    <div className={`recent-list${compact ? ' compact' : ''}`}>
      {list.map((r) => (
        <div key={r.path} className={`recent-item${r.exists ? '' : ' missing'}`} onClick={() => r.exists && openDeckPath(r.path)} title={r.path}>
          <span className="ri-icon"><svg viewBox="0 0 32 32" width="26" height="26"><rect x="3" y="5" width="26" height="22" rx="3" fill="#00778B" /><rect x="8" y="16" width="4" height="7" fill="#75E4E3" /><rect x="14" y="12" width="4" height="11" fill="#fff" /><rect x="20" y="9" width="4" height="14" fill="#FFD200" /></svg></span>
          <span className="ri-text">
            <span className="ri-name">{(r.name || r.path.split(/[\\/]/).pop()).replace(/\.dstudio$/i, '')}</span>
            <span className="ri-path">{r.exists ? r.folder : 'File not found'}</span>
          </span>
          <span className="ri-date">{r.modified ? new Date(r.modified * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
          <button className="ri-remove" title="Remove from list" onClick={(e) => { e.stopPropagation(); post('/api/recent/remove', { path: r.path }).then(load); }}><IDelete /></button>
        </div>
      ))}
    </div>
  );
}

function NewPane() {
  return (
    <div className="bs-new">
      <div className="new-card" onClick={newDeckCmd}>
        <div className="nc-face">
          <div className="nc-bar" />
          <div className="nc-title">House deck</div>
          <div className="nc-rule" />
        </div>
        <span>Blank house deck (16:9)</span>
      </div>
    </div>
  );
}

function InfoPane() {
  const deck = useStore((s) => s.deck);
  const path = useStore((s) => s.path);
  const lastSaved = useStore((s) => s.lastSaved);
  const inv = linkInventory(deck);
  const sources = Object.entries(deck.links?.sources || {});
  const charts = deck.slides.reduce((n, s) => n + s.elements.filter((e) => e.type === 'chart').length, 0);
  return (
    <div className="bs-info">
      <div className="info-main">
        <h2>{deck.name}</h2>
        <div className="bs-muted">{path || 'Not saved yet'}</div>
        <div className="info-buttons">
          {path && <button className="btn" onClick={() => post('/api/reveal', { path })}><IFolder /> Show in folder</button>}
          <button className="btn" onClick={() => { setUI({ backstage: null }); openDialog('editLinks'); }}>Edit Links to Files</button>
        </div>
        <h3>Excel links</h3>
        {sources.length ? sources.map(([id, s]) => (
          <div key={id} className="info-link">
            <b>{s.path.split(/[\\/]/).pop()}</b>
            <span className="bs-muted">{inv[id] ? `${inv[id].charts} chart(s), ${inv[id].numbers} number(s), slides ${[...inv[id].slides].join(', ')}` : 'not used'}</span>
          </div>
        )) : <div className="bs-muted">This deck has no links to Excel yet.</div>}
      </div>
      <div className="info-side">
        <h3>Properties</h3>
        <dl>
          <dt>Slides</dt><dd>{deck.slides.length}</dd>
          <dt>Hidden slides</dt><dd>{deck.slides.filter((s) => s.hidden).length}</dd>
          <dt>Charts</dt><dd>{charts}</dd>
          <dt>Theme</dt><dd>{deck.theme.name}</dd>
          <dt>Fonts</dt><dd>{deck.theme.fonts.major} / {deck.theme.fonts.minor}</dd>
          <dt>Slide size</dt><dd>{deck.size.w === 12192000 ? 'Widescreen 16:9' : 'Standard 4:3'}</dd>
          <dt>Last saved</dt><dd>{lastSaved ? new Date(lastSaved).toLocaleString('en-GB') : '—'}</dd>
          <dt>Created</dt><dd>{deck.created ? new Date(deck.created).toLocaleDateString('en-GB') : '—'}</dd>
        </dl>
      </div>
    </div>
  );
}

function ExportPane() {
  const deck = useStore((s) => s.deck);
  const last = useStore((s) => s.settings.lastExport);
  return (
    <div className="bs-export">
      <div className="exp-card" onClick={() => { setUI({ backstage: null }); exportPptx(); }}>
        <IExport />
        <div>
          <b>Export to PowerPoint (.pptx)</b>
          <p>Creates a new PowerPoint file with the same fonts, colours and layout. Charts become native PowerPoint charts you can edit (right-click › Edit Data).</p>
        </div>
      </div>
      <div className="exp-card" onClick={() => { setUI({ backstage: null }); openDialog('updatePpt'); }}>
        <IUpdatePpt />
        <div>
          <b>Update an existing PowerPoint file</b>
          <p>Replaces the slides that came from this deck inside a .pptx you pick, and adds new ones at the end. Works while the file is open in PowerPoint. Other slides in that file are left alone.</p>
        </div>
      </div>
      <div className="exp-card" onClick={() => { setUI({ backstage: null }); openDialog('compare'); }}>
        <IInfo />
        <div>
          <b>Check the export</b>
          <p>Shows this slide next to the way PowerPoint draws the exported version, so you can spot any differences before sending.</p>
        </div>
      </div>
      {last && <div className="bs-muted">Last export: {last}</div>}
      <div className="exp-preview">
        <ScaledSlide deck={deck} slide={deck.slides[0]} width={300} slideNumber={1} />
      </div>
    </div>
  );
}

function OptionsPane() {
  const settings = useStore((s) => s.settings);
  const units = useStore((s) => s.ui.units);
  const pickFolder = async (key, title) => {
    const p = await chooseFile('folder', 'any', { title, initialDir: settings[key], fallback: settings[key] });
    if (p) { await saveSettings({ [key]: p }); toast('Saved.'); }
  };
  return (
    <div className="bs-options">
      <h3>Saving</h3>
      <div className="opt-row">
        <div><b>AutoSave</b><div className="bs-muted">Save changes automatically a moment after you make them.</div></div>
        <button className={`switch${settings.autosave ? ' on' : ''}`} onClick={() => saveSettings({ autosave: !settings.autosave })}><i /></button>
      </div>
      <div className="opt-row">
        <div><b>AutoSave folder</b><div className="bs-muted">{settings.autosaveFolder}</div></div>
        <button className="btn" onClick={() => pickFolder('autosaveFolder', 'Choose AutoSave folder')}>Change...</button>
      </div>
      <h3>Charts</h3>
      <div className="opt-row">
        <div><b>Shared chart library</b><div className="bs-muted">{settings.chartLibrary}</div></div>
        <button className="btn" onClick={() => pickFolder('chartLibrary', 'Choose chart library folder')}>Change...</button>
      </div>
      <h3>PowerPoint export</h3>
      <div className="opt-row">
        <div><b>House template (optional)</b><div className="bs-muted">{settings.exportTemplate || 'None: Deck Studio builds the slide master, theme colours and fonts itself.'}</div></div>
        <span>
          <button className="btn" onClick={async () => { const p = await chooseFile('open', 'potx', { title: 'Choose a PowerPoint template' }); if (p) saveSettings({ exportTemplate: p }); }}>Choose...</button>
          {settings.exportTemplate && <button className="btn" onClick={() => saveSettings({ exportTemplate: '' })}>Clear</button>}
        </span>
      </div>
      <h3>Display</h3>
      <div className="opt-row">
        <div><b>Measurements</b><div className="bs-muted">Units used for sizes in the ribbon.</div></div>
        <select value={units} onChange={(e) => setUI({ units: e.target.value })}><option value="cm">Centimetres</option><option value="in">Inches</option></select>
      </div>
      <div className="bs-muted small">Settings file: AppData\DeckStudio\settings.json · Server: {settings.windows ? 'Windows' : 'other'}</div>
    </div>
  );
}

export default function Backstage() {
  const pane = useStore((s) => s.ui.backstage);
  if (!pane) return null;
  const close = () => setUI({ backstage: null });
  return (
    <div className="backstage" onKeyDown={(e) => { if (e.key === 'Escape') close(); }} tabIndex={-1}>
      <nav className="bs-nav">
        <button className="bs-back" onClick={close} title="Back"><svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="none" stroke="#fff" /><path d="M11.5 6L7.5 10l4 4" fill="none" stroke="#fff" strokeWidth="1.5" /></svg></button>
        {NAV.map((n, i) => n.divider ? <div key={i} className="bs-div" /> : (
          <button key={n.id} className={`bs-item${pane === n.id ? ' active' : ''}`} onClick={() => (n.run ? n.run() : setUI({ backstage: n.id }))}>
            <n.icon /> <span>{n.label}</span>
          </button>
        ))}
        <span className="bs-fill" />
        <button className="bs-item" onClick={close}><ICloseBig /> <span>Close</span></button>
      </nav>
      <main className="bs-main">
        {pane === 'home' && (
          <>
            <h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}</h1>
            <h3>New</h3>
            <NewPane />
            <h3>Recent</h3>
            <Recent />
          </>
        )}
        {pane === 'new' && (<><h1>New</h1><NewPane /></>)}
        {pane === 'open' && (
          <>
            <h1>Open</h1>
            <div className="bs-open">
              <button className="btn big" onClick={() => { openDeckCmd(); }}><IOpen /> Browse...</button>
            </div>
            <h3>Recent</h3>
            <Recent />
          </>
        )}
        {pane === 'info' && (<><h1>Info</h1><InfoPane /></>)}
        {pane === 'export' && (<><h1>Export</h1><ExportPane /></>)}
        {pane === 'options' && (<><h1>Options</h1><OptionsPane /></>)}
      </main>
    </div>
  );
}

export { folderOf, getState };
