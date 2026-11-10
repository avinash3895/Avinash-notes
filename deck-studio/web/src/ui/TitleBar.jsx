import React, { useEffect, useRef, useState } from 'react';
import { useStore, setUI, undo, redo } from '../lib/store.js';
import { renameDeck, saveDeck, setAutosave, folderOf } from '../lib/files.js';
import { IUndo, IRedo, ISave, ITesting } from './icons.js';

function SaveStatus() {
  const st = useStore((s) => s.saveState);
  const path = useStore((s) => s.path);
  const err = useStore((s) => s.saveError);
  const autosave = useStore((s) => s.settings.autosave);
  let text = '';
  if (st === 'saving') text = 'Saving...';
  else if (st === 'error') text = 'Not saved';
  else if (st === 'saved' && path) text = `Saved to ${folderOf(path).split(/[\\/]/).pop() || 'disk'}`;
  else if (path) text = autosave ? 'Unsaved changes' : 'Unsaved changes';
  else text = autosave ? 'Not saved yet' : 'Not saved';
  return <span className={`save-status ${st}`} title={err || path || ''}>{text}</span>;
}

export default function TitleBar() {
  const name = useStore((s) => s.deck.name);
  const autosave = useStore((s) => s.settings.autosave);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const testing = useStore((s) => s.ui.testing);
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(name);
  const ref = useRef(null);
  useEffect(() => { if (!edit) setVal(name); }, [name, edit]);
  useEffect(() => { if (edit && ref.current) { ref.current.focus(); ref.current.select(); } }, [edit]);
  const done = (save) => { setEdit(false); if (save) renameDeck(val); };
  return (
    <div className="titlebar">
      <div className="tb-left">
        <span className="app-logo" title="Deck Studio">
          <svg viewBox="0 0 32 32" width="20" height="20"><rect x="2" y="4" width="28" height="24" rx="4" fill="#FFFFFF" /><rect x="7" y="17" width="4" height="7" fill="#3BAEB7" /><rect x="13" y="12" width="4" height="12" fill="#00778B" /><rect x="19" y="9" width="4" height="15" fill="#FFD200" /></svg>
        </span>
        <label className="autosave" title="Save automatically to your chosen folder (File > Options)">
          <span>AutoSave</span>
          <button className={`switch${autosave ? ' on' : ''}`} onClick={() => setAutosave(!autosave)}><i /></button>
          <span className="sw-state">{autosave ? 'On' : 'Off'}</span>
        </label>
        <button className="qat" title="Save (Ctrl+S)" onClick={saveDeck}><ISave /></button>
        <button className="qat" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><IUndo /></button>
        <button className="qat" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}><IRedo /></button>
      </div>
      <div className="tb-center">
        {edit ? (
          <input ref={ref} className="deck-name-input" value={val} onChange={(e) => setVal(e.target.value)}
            onBlur={() => done(true)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }} />
        ) : (
          <button className="deck-name" title="Rename deck" onClick={() => setEdit(true)}>{name}</button>
        )}
        <span className="dot">•</span>
        <SaveStatus />
      </div>
      <div className="tb-right">
        {testing && <span className="testing-badge" title="Charts are drawn with testing code" onClick={() => setUI({ tab: 'data' })}><ITesting /> Testing mode</span>}
        <span className="brand">Deck Studio</span>
      </div>
    </div>
  );
}
