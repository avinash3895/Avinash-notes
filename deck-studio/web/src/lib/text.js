// Pure functions on the text model: { paras: [{ ...paraProps, runs: [{ text, ...runProps }] }] }
// A position is { p, o }: paragraph index and character offset inside it.

import { defaultRun } from './model.js';

export const RUN_KEYS = ['font', 'size', 'bold', 'italic', 'underline', 'strike', 'color', 'baseline', 'spacing', 'highlight', 'caps'];
export const PARA_KEYS = ['align', 'level', 'bullet', 'lineSpacing', 'spaceBefore', 'spaceAfter', 'marL', 'indent'];

const clone = (o) => JSON.parse(JSON.stringify(o));

export function runLen(r) {
  return (r.text || '').length;
}

export function paraLen(p) {
  return p.runs.reduce((n, r) => n + runLen(r), 0);
}

export function paraText(p) {
  return p.runs.map((r) => r.text || '').join('');
}

export function bodyText(b) {
  return (b?.paras || []).map(paraText).join('\n');
}

export function cmpPos(a, b) {
  return a.p !== b.p ? a.p - b.p : a.o - b.o;
}

export function orderSel(sel) {
  if (!sel) return null;
  return cmpPos(sel.anchor, sel.focus) <= 0 ? { start: sel.anchor, end: sel.focus } : { start: sel.focus, end: sel.anchor };
}

function sameProps(a, b) {
  if (a.link || b.link || a.field || b.field) return false;
  return RUN_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

export function normalizePara(p) {
  const runs = [];
  for (const r of p.runs) {
    if (!r.text && !r.field && runs.length) continue; // drop empty runs (keep one)
    const last = runs[runs.length - 1];
    if (last && sameProps(last, r) && !last.field && !r.field) last.text += r.text;
    else runs.push(r);
  }
  if (!runs.length) runs.push({ ...p.runs[0], text: '' });
  // an empty first run followed by text: drop the empty one
  if (runs.length > 1 && !runs[0].text && !runs[0].field) runs.shift();
  p.runs = runs;
  return p;
}

// Split runs so that a run boundary exists at offset o; returns run index starting at o
export function splitAt(p, o) {
  let acc = 0;
  for (let i = 0; i < p.runs.length; i++) {
    const r = p.runs[i];
    const len = runLen(r);
    if (o === acc) return i;
    if (o < acc + len) {
      if (r.field) return i; // fields are atomic
      const left = { ...r, text: r.text.slice(0, o - acc) };
      const right = { ...r, text: r.text.slice(o - acc) };
      if (r.link) { left.link = r.link; right.link = r.link; }
      p.runs.splice(i, 1, left, right);
      return i + 1;
    }
    acc += len;
  }
  return p.runs.length;
}

export function propsAt(b, pos) {
  const p = b.paras[Math.min(pos.p, b.paras.length - 1)];
  if (!p) return defaultRun();
  let acc = 0;
  let prev = p.runs[0];
  for (const r of p.runs) {
    const len = runLen(r);
    if (pos.o <= acc + len && pos.o > acc) return r;
    if (pos.o === acc && acc === 0) return r;
    acc += len;
    prev = r;
  }
  return prev || p.runs[0];
}

function strip(r) {
  const out = {};
  for (const k of RUN_KEYS) if (r[k] !== undefined) out[k] = r[k];
  return out;
}

// Insert text (may contain '\n' for new paragraphs, '\v' for line breaks)
export function insertText(b0, sel, text, props) {
  let b = clone(b0);
  let pos = sel.start;
  if (cmpPos(sel.start, sel.end) !== 0) {
    const res = deleteRange(b, sel.start, sel.end);
    b = res.body; pos = res.pos;
  }
  const base = props || strip(propsAt(b, pos));
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, i) => {
    if (i > 0) {
      const res = splitParagraph(b, pos);
      b = res.body; pos = res.pos;
    }
    if (!line) return;
    const p = b.paras[pos.p];
    const idx = splitAt(p, pos.o);
    p.runs.splice(idx, 0, defaultRun({ ...base, text: line.replace(/\v/g, '\n') }));
    normalizePara(p);
    pos = { p: pos.p, o: pos.o + line.length };
  });
  return { body: b, pos };
}

export function deleteRange(b0, start, end) {
  const b = clone(b0);
  if (cmpPos(start, end) === 0) return { body: b, pos: start };
  const first = b.paras[start.p];
  const last = b.paras[end.p];
  // text after end in last paragraph
  const li = splitAt(last, end.o);
  const tail = last.runs.slice(li);
  const fi = splitAt(first, start.o);
  first.runs = first.runs.slice(0, fi);
  if (start.p === end.p) {
    // recompute tail on the (already split) same paragraph
    first.runs = first.runs.concat(tail.length ? tail : []);
  } else {
    first.runs = first.runs.concat(tail);
    b.paras.splice(start.p + 1, end.p - start.p);
  }
  if (!first.runs.length) first.runs = [{ ...(tail[0] || last.runs[0] || defaultRun()), text: '' }];
  normalizePara(first);
  return { body: b, pos: start };
}

export function splitParagraph(b0, pos) {
  const b = clone(b0);
  const p = b.paras[pos.p];
  const idx = splitAt(p, pos.o);
  const left = p.runs.slice(0, idx);
  const right = p.runs.slice(idx);
  const proto = (right[0] || left[left.length - 1] || p.runs[0]);
  const np = { ...clone(p), runs: right.length ? right : [{ ...proto, text: '', link: undefined, field: undefined }] };
  p.runs = left.length ? left : [{ ...proto, text: '', link: undefined, field: undefined }];
  normalizePara(p);
  normalizePara(np);
  b.paras.splice(pos.p + 1, 0, np);
  return { body: b, pos: { p: pos.p + 1, o: 0 } };
}

// Delete one "unit" backward/forward from a collapsed caret
export function deleteBackward(b, pos) {
  if (pos.o > 0) return deleteRange(b, { p: pos.p, o: pos.o - 1 }, pos);
  if (pos.p > 0) {
    const prevLen = paraLen(b.paras[pos.p - 1]);
    return deleteRange(b, { p: pos.p - 1, o: prevLen }, pos);
  }
  return { body: clone(b), pos };
}

export function deleteForward(b, pos) {
  const len = paraLen(b.paras[pos.p]);
  if (pos.o < len) return deleteRange(b, pos, { p: pos.p, o: pos.o + 1 });
  if (pos.p < b.paras.length - 1) return deleteRange(b, pos, { p: pos.p + 1, o: 0 });
  return { body: clone(b), pos };
}

export function wordRange(b, pos) {
  const text = paraText(b.paras[pos.p]);
  const isWord = (ch) => /[\p{L}\p{N}_'’-]/u.test(ch);
  let s = pos.o; let e = pos.o;
  while (s > 0 && isWord(text[s - 1])) s--;
  while (e < text.length && isWord(text[e])) e++;
  return { start: { p: pos.p, o: s }, end: { p: pos.p, o: e } };
}

// Apply run properties to a range (or everything when range is null)
export function applyRunProps(b0, range, props) {
  const b = clone(b0);
  const start = range ? range.start : { p: 0, o: 0 };
  const end = range ? range.end : { p: b.paras.length - 1, o: paraLen(b.paras[b.paras.length - 1]) };
  for (let pi = start.p; pi <= end.p; pi++) {
    const p = b.paras[pi];
    const s = pi === start.p ? start.o : 0;
    const e = pi === end.p ? end.o : paraLen(p);
    if (s === e && !(range == null) && paraLen(p) > 0) continue;
    if (paraLen(p) === 0 || (s === 0 && e === paraLen(p))) {
      p.runs.forEach((r) => applyTo(r, props));
      normalizePara(p);
      continue;
    }
    splitAt(p, e);
    const si = splitAt(p, s);
    // find the run index where the range ends
    let acc = 0; let endRun = p.runs.length;
    for (let i = 0; i < p.runs.length; i++) { if (acc >= e) { endRun = i; break; } acc += runLen(p.runs[i]); }
    for (let i = si; i < endRun; i++) applyTo(p.runs[i], props);
    normalizePara(p);
  }
  return b;
}

function applyTo(r, props) {
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'function') r[k] = v(r[k], r);
    else r[k] = v;
  }
}

export function applyParaProps(b0, range, props) {
  const b = clone(b0);
  const s = range ? range.start.p : 0;
  const e = range ? range.end.p : b.paras.length - 1;
  for (let i = s; i <= e; i++) {
    const p = b.paras[i];
    for (const [k, v] of Object.entries(props)) {
      p[k] = typeof v === 'function' ? v(p[k], p) : v;
    }
  }
  return b;
}

// Common value of a property over a range: value or '' when mixed
export function commonRunProps(b, range) {
  const out = {};
  const seen = {};
  const start = range ? range.start : { p: 0, o: 0 };
  const end = range ? range.end : { p: b.paras.length - 1, o: paraLen(b.paras[b.paras.length - 1]) };
  const collapsed = range && cmpPos(start, end) === 0;
  const visit = (r) => {
    for (const k of RUN_KEYS) {
      const v = r[k] ?? null;
      if (!(k in seen)) { seen[k] = true; out[k] = v; } else if (out[k] !== v) out[k] = '';
    }
  };
  if (collapsed) { visit(propsAt(b, start)); return out; }
  for (let pi = start.p; pi <= end.p; pi++) {
    const p = b.paras[pi];
    const s = pi === start.p ? start.o : 0;
    const e = pi === end.p ? end.o : paraLen(p);
    let acc = 0;
    let any = false;
    for (const r of p.runs) {
      const len = runLen(r);
      if (acc + len > s && acc < e) { visit(r); any = true; }
      acc += len;
    }
    if (!any && paraLen(p) === 0) visit(p.runs[0]);
  }
  return out;
}

export function commonParaProps(b, range) {
  const s = range ? range.start.p : 0;
  const e = range ? range.end.p : b.paras.length - 1;
  const out = {};
  for (let i = s; i <= e; i++) {
    const p = b.paras[i];
    for (const k of PARA_KEYS) {
      const v = k === 'bullet' ? JSON.stringify(p[k] || null) : (p[k] ?? null);
      if (i === s) out[k] = v; else if (out[k] !== v) out[k] = '';
    }
  }
  if (out.bullet && out.bullet !== '') out.bullet = JSON.parse(out.bullet);
  return out;
}

export function changeCase(b0, range, mode) {
  const b = clone(b0);
  const fn = {
    upper: (t) => t.toUpperCase(),
    lower: (t) => t.toLowerCase(),
    sentence: (t, first) => (first ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t.toLowerCase()),
    title: (t) => t.toLowerCase().replace(/(^|[\s(\-"'])(\p{L})/gu, (m, a, c) => a + c.toUpperCase()),
    toggle: (t) => [...t].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
  }[mode];
  const start = range ? range.start : { p: 0, o: 0 };
  const end = range ? range.end : { p: b.paras.length - 1, o: paraLen(b.paras[b.paras.length - 1]) };
  for (let pi = start.p; pi <= end.p; pi++) {
    const p = b.paras[pi];
    const s = pi === start.p ? start.o : 0;
    const e = pi === end.p ? end.o : paraLen(p);
    let acc = 0;
    for (const r of p.runs) {
      const len = runLen(r);
      const a = Math.max(s, acc) - acc;
      const z = Math.min(e, acc + len) - acc;
      if (z > a && !r.field) {
        r.text = r.text.slice(0, a) + fn(r.text.slice(a, z), acc + a === 0) + r.text.slice(z);
      }
      acc += len;
    }
  }
  return b;
}

export function clampPos(b, pos) {
  const p = Math.max(0, Math.min(pos.p, b.paras.length - 1));
  const o = Math.max(0, Math.min(pos.o, paraLen(b.paras[p])));
  return { p, o };
}

export function endPos(b) {
  const p = b.paras.length - 1;
  return { p, o: paraLen(b.paras[p]) };
}

// Replace occurrences of a string throughout a body (keeps formatting of the first run of each match)
export function replaceAll(b0, find, repl, matchCase) {
  let b = clone(b0);
  let count = 0;
  if (!find) return { body: b, count };
  for (let pi = 0; pi < b.paras.length; pi++) {
    let guard = 0;
    for (;;) {
      const text = paraText(b.paras[pi]);
      const hay = matchCase ? text : text.toLowerCase();
      const needle = matchCase ? find : find.toLowerCase();
      const idx = hay.indexOf(needle, guard);
      if (idx < 0) break;
      const props = strip(propsAt(b, { p: pi, o: idx + 1 }));
      const res = insertText(b, { start: { p: pi, o: idx }, end: { p: pi, o: idx + find.length } }, repl, props);
      b = res.body;
      guard = idx + repl.length;
      count++;
    }
  }
  return { body: b, count };
}

export function bulletIndent(level, bullet) {
  const step = 228600; // 0.25in hanging indent per PowerPoint default
  if (!bullet) return { marL: level * 457200, indent: 0 };
  return { marL: step + level * 457200, indent: -step };
}
