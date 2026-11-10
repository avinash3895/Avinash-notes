import React, { useEffect, useState } from 'react';
import { post } from '../../lib/api.js';
import { useStore } from '../../lib/store.js';
import { chooseFile } from '../../lib/files.js';
import { Field } from './Modal.jsx';

// file -> sheet -> named table (or cell / name for single numbers)
export default function ExcelPicker({ value, onChange, mode = 'table' }) {
  const deck = useStore((s) => s.deck);
  const sources = Object.values(deck.links?.sources || {}).map((s) => s.path);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [preview, setPreview] = useState(null);
  const v = value || {};

  const inspect = async (path) => {
    setErr(null); setInfo(null); setPreview(null);
    if (!path) return;
    try {
      const res = await post('/api/excel/inspect', { path });
      setInfo(res);
      if (!v.sheet || !res.sheets.find((s) => s.name === v.sheet)) {
        const withTable = res.sheets.find((s) => s.tables.length) || res.sheets[0];
        const next = { ...v, path, sheet: withTable ? withTable.name : '' };
        if (mode === 'table') next.table = withTable && withTable.tables[0] ? withTable.tables[0].name : '';
        onChange(next);
      }
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { if (v.path) inspect(v.path); }, [v.path]);

  useEffect(() => {
    let alive = true;
    if (mode === 'table' && v.path && v.sheet && v.table) {
      post('/api/excel/table', { path: v.path, sheet: v.sheet, table: v.table }).then((t) => { if (alive) setPreview(t); }).catch((e) => alive && setErr(e.message));
    }
    if (mode === 'value' && v.path && v.sheet && v.ref) {
      post('/api/excel/value', { path: v.path, sheet: v.sheet, ref: v.ref, format: v.format }).then((t) => { if (alive) { setPreview(t); setErr(null); } }).catch((e) => alive && setErr(e.message));
    }
    return () => { alive = false; };
  }, [v.path, v.sheet, v.table, v.ref, v.format, mode]);

  const browse = async () => {
    const p = await chooseFile('open', 'excel', { title: 'Choose an Excel file' });
    if (p) onChange({ ...v, path: p, sheet: '', table: '' });
  };

  const sheet = info && info.sheets.find((s) => s.name === v.sheet);
  return (
    <div className="excel-picker">
      <Field label="Excel file">
        <span className="file-row">
          <input value={v.path || ''} placeholder="C:\\...\\Plan Data 01.xlsx" onChange={(e) => onChange({ ...v, path: e.target.value })} onBlur={() => v.path && inspect(v.path)} />
          <button className="btn" onClick={browse}>Browse...</button>
        </span>
      </Field>
      {sources.length > 0 && (
        <div className="recent-sources">
          Files this deck already uses:{' '}
          {sources.map((p) => <button key={p} className="link" onClick={() => onChange({ ...v, path: p, sheet: '', table: '' })}>{p.split(/[\\/]/).pop()}</button>)}
        </div>
      )}
      {info && (
        <Field label="Sheet (tab)">
          <select value={v.sheet || ''} onChange={(e) => {
            const s = info.sheets.find((x) => x.name === e.target.value);
            onChange({ ...v, sheet: e.target.value, table: mode === 'table' && s && s.tables[0] ? s.tables[0].name : v.table });
          }}>
            {info.sheets.map((s) => <option key={s.name} value={s.name}>{s.name}{s.tables.length ? ` (${s.tables.length} table${s.tables.length > 1 ? 's' : ''})` : ''}</option>)}
          </select>
        </Field>
      )}
      {info && mode === 'table' && (
        <Field label="Named table" hint={sheet && !sheet.tables.length ? 'This sheet has no named tables. In Excel: select the data, Insert > Table, then name it under Table Design.' : null}>
          <select value={v.table || ''} onChange={(e) => onChange({ ...v, table: e.target.value })}>
            {(sheet ? sheet.tables : []).map((t) => <option key={t.name} value={t.name}>{t.name} ({t.ref})</option>)}
            {!(sheet && sheet.tables.length) && <option value="">(none)</option>}
          </select>
        </Field>
      )}
      {info && mode === 'value' && (
        <Field label="Cell or name" hint="A cell like B4, or a name defined in Excel (Formulas > Name Manager).">
          <span className="file-row">
            <input value={v.ref || ''} placeholder="B4" onChange={(e) => onChange({ ...v, ref: e.target.value })} />
            {info.names.length > 0 && (
              <select value="" onChange={(e) => { const n = info.names.find((x) => x.name === e.target.value); if (n) onChange({ ...v, ref: n.name, sheet: n.sheet || (n.ref.split('!')[0] || '').replace(/'/g, '') || v.sheet }); }}>
                <option value="">Names...</option>
                {info.names.map((n) => <option key={n.name} value={n.name}>{n.name} = {n.ref}</option>)}
              </select>
            )}
          </span>
        </Field>
      )}
      {err && <div className="form-error">{err}</div>}
      {mode === 'table' && preview && (
        <div className="table-preview">
          <table>
            <thead><tr>{preview.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
            <tbody>{preview.rows.slice(0, 8).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c == null ? '' : String(c)}</td>)}</tr>)}</tbody>
          </table>
          {preview.rows.length > 8 && <div className="bs-muted">…{preview.rows.length - 8} more rows</div>}
        </div>
      )}
      {mode === 'value' && preview && !err && <div className="value-preview">Value now: <b>{preview.text}</b> <span className="bs-muted">({String(preview.value)})</span></div>}
    </div>
  );
}
