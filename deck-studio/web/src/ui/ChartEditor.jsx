// Separate window: edit one chart type's code. Saving writes the TESTING copy;
// decks that have Testing mode on redraw straight away. "Send to Production"
// makes it permanent for every deck (asking about a backup each time).
import React, { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { python } from '@codemirror/lang-python';
import { keymap } from '@codemirror/view';
import { post } from '../lib/api.js';
import { broadcast } from '../lib/files.js';
import ChartView from '../render/ChartView.jsx';
import { ISave, IProduction, ICopy, IFolder, ITesting, IWarn, IOk, IRefresh } from './icons.js';

function findBlock(code, name) {
  const re = new RegExp(`^${name}\\s*=\\s*"""([\\s\\S]*?)"""`, 'm');
  const m = code.match(re);
  return m ? m[1].trim() : '';
}

export default function ChartEditor({ name }) {
  const host = useRef(null);
  const view = useRef(null);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [spec, setSpec] = useState(null);
  const [err, setErr] = useState(null);
  const [size, setSize] = useState({ w: 640, h: 330 });
  const [confirm, setConfirm] = useState(false);
  const saveRef = useRef(null);

  const preview = async () => {
    try {
      const r = await post('/api/charts/render', { name, frame: { w: size.w * 0.75, h: size.h * 0.75 }, testing: true });
      setSpec(r.spec); setErr(null);
    } catch (e) { setErr(e.message); setSpec(null); }
  };

  const save = async () => {
    const code = view.current.state.doc.toString();
    try {
      await post('/api/charts/save', { name, code });
      setDirty(false);
      setStatus({ ok: true, text: 'Saved to testing. Decks with Testing mode on are redrawn now.' });
      broadcast({ type: 'chart-code', name });
      setMeta((m) => ({ ...m, hasTesting: true }));
      preview();
      return true;
    } catch (e) {
      setStatus({ ok: false, text: e.message });
      return false;
    }
  };
  saveRef.current = save;

  useEffect(() => {
    document.title = `${name}.py - Chart code - Deck Studio`;
    post('/api/charts/code', { name, variant: 'auto' }).then((r) => {
      setMeta(r);
      view.current = new EditorView({
        doc: r.code,
        parent: host.current,
        extensions: [
          basicSetup, python(),
          keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { saveRef.current(); return true; } }]),
          EditorView.updateListener.of((u) => { if (u.docChanged) setDirty(true); }),
          EditorView.theme({ '&': { height: '100%', fontSize: '13px' }, '.cm-scroller': { fontFamily: 'Consolas, "Cascadia Mono", monospace' } }),
        ],
      });
      preview();
    }).catch((e) => setStatus({ ok: false, text: e.message }));
    const before = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => { window.removeEventListener('beforeunload', before); if (view.current) view.current.destroy(); };
  }, [name]);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const promote = async (backup) => {
    setConfirm(false);
    if (dirty && !(await save())) {
      setStatus({ ok: false, text: 'Not sent: fix the error above first, then try again.' });
      return;
    }
    try {
      const r = await post('/api/charts/promote', { name, backup });
      setStatus({ ok: true, text: `Sent to production${r.backup ? `. Backup: ${r.backup}` : ''}. Every deck now uses this version.` });
      setMeta((m) => ({ ...m, hasTesting: false, inProduction: true }));
      broadcast({ type: 'chart-promoted', name });
    } catch (e) { setStatus({ ok: false, text: e.message }); }
  };

  const copyPrompt = async () => {
    const code = view.current ? view.current.state.doc.toString() : '';
    const text = `${findBlock(code, 'AI_PROMPT')}\n\nHere is an existing chart file to follow as an example:\n\n${code}`;
    try { await navigator.clipboard.writeText(text); setStatus({ ok: true, text: 'AI prompt and example code copied. Paste into Claude, describe the chart, then paste the reply here and Save.' }); } catch (e) { setStatus({ ok: false, text: 'Could not copy to the clipboard.' }); }
  };

  return (
    <div className="chart-editor">
      <div className="ce-bar">
        <div className="ce-title">
          <b>{meta ? name : 'Loading...'}.py</b>
          {meta && <span className={`badge ${meta.hasTesting ? 'test' : 'prod'}`}>{meta.hasTesting ? 'Testing copy' : 'Production'}</span>}
          {dirty && <span className="badge dirty">Unsaved</span>}
        </div>
        <button className="btn primary" onClick={save} title="Ctrl+S"><ISave /> Save to Testing</button>
        <button className="btn" onClick={preview}><IRefresh /> Preview</button>
        <button className="btn" onClick={() => setConfirm(true)} disabled={!meta || (!meta.hasTesting && !dirty)}><IProduction /> Send to Production</button>
        <button className="btn" onClick={copyPrompt}><ICopy /> Copy AI Prompt</button>
        <button className="btn" onClick={() => post('/api/charts/folder')}><IFolder /> Library Folder</button>
      </div>
      {confirm && (
        <div className="ce-confirm">
          <span>Make this the version every deck uses. Back up the current production version first?</span>
          <button className="btn primary" onClick={() => promote(true)}>Back up, then send</button>
          <button className="btn" onClick={() => promote(false)}>Send without backup</button>
          <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      )}
      {status && <div className={`ce-status ${status.ok ? 'ok' : 'err'}`}>{status.ok ? <IOk /> : <IWarn />} {status.text}</div>}
      <div className="ce-main">
        <div className="ce-code" ref={host} />
        <div className="ce-side">
          <div className="ce-side-title"><ITesting /> Preview (testing code, sample data)</div>
          <div className="ce-preview" style={{ width: size.w, height: size.h }}>
            {err ? <div className="form-error">{err}</div> : <ChartView spec={spec} w={size.w} h={size.h} />}
          </div>
          <div className="ce-size">
            <label>Preview size <select value={`${size.w}x${size.h}`} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); setSize({ w, h }); }}>
              <option value="640x330">Wide (main chart)</option><option value="480x360">Half slide</option><option value="860x420">Full width</option>
            </select></label>
          </div>
          <div className="ce-help">
            <h4>How this works</h4>
            <ol>
              <li>Change the <b>SETTINGS</b> block at the top (colours, spacing, bar width) or the code below it.</li>
              <li><b>Save to Testing</b> (Ctrl+S). Decks with <b>Testing mode</b> on (Data tab) redraw straight away.</li>
              <li>Happy? <b>Send to Production</b> so every deck uses it. You are asked about a backup each time.</li>
              <li>New chart idea? <b>Copy AI Prompt</b>, paste into Claude with a description, paste the reply here.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
