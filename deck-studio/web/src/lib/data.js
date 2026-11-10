// Excel links and charts: refresh, Edit Links, chart rendering, linked numbers.
import { getState, setState, setUI, commit, toast, surfaceDraft, currentSurface } from './store.js';
import { post, get } from './api.js';
import { uid, findIn, walkElements, chartEl, EMU_PER_IN, EMU_PER_PT } from './model.js';
import { insertElement } from './actions.js';
import { activeEditor } from '../editor/TextEditor.jsx';

export function sourcePath(deck, srcId) {
  return deck.links?.sources?.[srcId]?.path || '';
}

export function ensureSource(path) {
  const deck = getState().deck;
  const found = Object.entries(deck.links?.sources || {}).find(([, s]) => s.path === path);
  if (found) return found[0];
  const id = uid('x');
  commit((d) => {
    if (!d.links) d.links = { sources: {} };
    d.links.sources[id] = { path };
  });
  return id;
}

// everything in the deck that reads from Excel, grouped by source
export function linkInventory(deck) {
  const out = {};
  const add = (src, kind) => {
    if (!out[src]) out[src] = { charts: 0, numbers: 0, slides: new Set() };
    out[src][kind] += 1;
  };
  deck.slides.forEach((s, si) => {
    walkElements(s.elements, (e) => {
      if (e.type === 'chart' && e.link && e.link.source) { add(e.link.source, 'charts'); out[e.link.source].slides.add(si + 1); }
      const bodies = [];
      if (e.text) bodies.push(e.text);
      if (e.type === 'table') e.rows.forEach((r) => r.cells.forEach((c) => bodies.push(c.text)));
      bodies.forEach((b) => b.paras.forEach((p) => p.runs.forEach((r) => {
        if (r.link && r.link.source) { add(r.link.source, 'numbers'); out[r.link.source].slides.add(si + 1); }
      })));
    });
  });
  return out;
}

function forEachLinkedRun(elements, fn) {
  walkElements(elements, (e) => {
    const bodies = [];
    if (e.text) bodies.push(e.text);
    if (e.type === 'table') e.rows.forEach((r) => r.cells.forEach((c) => bodies.push(c.text)));
    bodies.forEach((b) => b.paras.forEach((p) => p.runs.forEach((r) => { if (r.link) fn(r, e); })));
  });
}

// Refresh Excel-linked charts and numbers. scope: 'slide' | 'all' | [slideIds] ; sources: limit to these sources
export async function refreshLinks(scope = 'slide', opts = {}) {
  const st = getState();
  const deck = st.deck;
  let slideIds;
  if (scope === 'all') slideIds = deck.slides.map((s) => s.id);
  else if (Array.isArray(scope)) slideIds = scope;
  else slideIds = [st.ui.slideId];
  const onlySources = opts.sources || null;
  const reqs = []; const keyIndex = {};
  const want = (src) => !onlySources || onlySources.includes(src);
  const addReq = (r) => {
    const key = JSON.stringify(r);
    if (!(key in keyIndex)) { keyIndex[key] = reqs.length; reqs.push(r); }
    return keyIndex[key];
  };
  const chartJobs = []; const runJobs = [];
  for (const s of deck.slides) {
    if (!slideIds.includes(s.id)) continue;
    walkElements(s.elements, (e) => {
      if (e.type === 'chart' && e.link && want(e.link.source)) {
        const path = sourcePath(deck, e.link.source);
        chartJobs.push({ slideId: s.id, id: e.id, req: addReq({ kind: 'table', path, sheet: e.link.sheet, table: e.link.table }) });
      }
    });
    forEachLinkedRun(s.elements, (r, e) => {
      if (!want(r.link.source)) return;
      const path = sourcePath(deck, r.link.source);
      runJobs.push({ slideId: s.id, id: e.id, link: r.link, req: addReq({ kind: 'value', path, sheet: r.link.sheet, ref: r.link.ref, format: r.link.format }) });
    });
  }
  if (!reqs.length) {
    if (!opts.quiet) toast(scope === 'slide' ? 'Nothing on this slide is linked to Excel.' : 'Nothing in this deck is linked to Excel.');
    return { charts: 0, numbers: 0, errors: [] };
  }
  const tid = toast('Refreshing from Excel...', { sticky: true });
  let res;
  try {
    res = await post('/api/excel/batch', { requests: reqs });
  } catch (e) {
    setUI((u) => ({ toasts: u.toasts.filter((t) => t.id !== tid) }));
    toast(e.message, { kind: 'error' });
    return null;
  }
  const results = res.results;
  const errors = [];
  let numbers = 0;
  const linkKey = (l) => `${l.source}|${l.sheet}|${l.ref}|${l.format}`;
  const runValues = {};
  runJobs.forEach((j) => { runValues[`${j.slideId}|${j.id}|${linkKey(j.link)}`] = results[j.req]; });
  commit((d) => {
    for (const s of d.slides) {
      if (!slideIds.includes(s.id)) continue;
      walkElements(s.elements, (e) => {
        const job = chartJobs.find((j) => j.id === e.id && j.slideId === s.id);
        if (!job) return;
        const r = results[job.req];
        if (r.ok) { e.data = { columns: r.columns, rows: r.rows }; e.error = null; e.refreshed = Date.now(); } else { e.error = r.error; errors.push(`Chart on slide ${d.slides.indexOf(s) + 1}: ${r.error}`); }
      });
      forEachLinkedRun(s.elements, (run, e) => {
        const r = runValues[`${s.id}|${e.id}|${linkKey(run.link)}`];
        if (!r) return;
        if (r.ok) { if (run.text !== r.text) run.text = r.text || ' '; run.link.error = null; numbers++; } else { run.link.error = r.error; errors.push(`Number on slide ${d.slides.indexOf(s) + 1}: ${r.error}`); }
      });
    }
  });
  const charts = chartJobs.filter((j) => results[j.req].ok);
  await renderCharts(charts.map((j) => ({ slideId: j.slideId, id: j.id })), { silent: false });
  setUI((u) => ({ toasts: u.toasts.filter((t) => t.id !== tid) }));
  const parts = [];
  if (chartJobs.length) parts.push(`${charts.length} chart${charts.length === 1 ? '' : 's'}`);
  if (runJobs.length) parts.push(`${numbers} number${numbers === 1 ? '' : 's'}`);
  if (errors.length) {
    toast(`Refreshed ${parts.join(' and ')}. ${errors.length} problem${errors.length === 1 ? '' : 's'}: ${errors.slice(0, 2).join('; ')}`, { kind: 'warn', ms: 12000 });
  } else if (!opts.quiet) {
    toast(`Refreshed ${parts.join(' and ')} from Excel.`, { kind: 'success' });
  }
  return { charts: charts.length, numbers, errors };
}

function locate(deck, target) {
  if (target.slideId) {
    const s = deck.slides.find((x) => x.id === target.slideId);
    return s ? findIn(s.elements, target.id) : null;
  }
  for (const s of deck.slides) { const e = findIn(s.elements, target.id); if (e) return e; }
  const m = findIn(deck.master.elements, target.id);
  if (m) return m;
  for (const l of deck.layouts) { const e = findIn(l.elements, target.id); if (e) return e; }
  return null;
}

// Ask the chart library to draw charts (targets: [{ slideId?, id }])
export async function renderCharts(targets, opts = {}) {
  const st = getState();
  const items = [];
  for (const t of targets) {
    const e = locate(st.deck, t);
    if (!e || e.type !== 'chart') continue;
    items.push({ key: e.id, name: e.chartType, table: e.data, settings: e.settings || {}, frame: { w: e.w / EMU_PER_PT, h: e.h / EMU_PER_PT } });
  }
  if (!items.length) return;
  setUI({ chartBusy: true });
  let res;
  try {
    res = await post('/api/charts/render-batch', { items, testing: getState().ui.testing });
  } catch (e) {
    setUI({ chartBusy: false });
    toast(e.message, { kind: 'error' });
    return;
  }
  setUI({ chartBusy: false });
  const errors = [];
  commit((d) => {
    for (const t of targets) {
      const e = locate(d, t);
      const r = e && res.results[e.id];
      if (!r) continue;
      if (r.ok) { e.spec = r.spec; e.error = null; e.source = r.source; if (!e.data && r.sample) e.sampleData = true; } else { e.error = r.error; errors.push(r.error); }
    }
  }, { silent: opts.silent !== false });
  if (errors.length) toast(`Chart problem: ${errors[0]}`, { kind: 'error', ms: 10000 });
}

export function allChartTargets(deck) {
  const out = [];
  deck.slides.forEach((s) => walkElements(s.elements, (e) => { if (e.type === 'chart') out.push({ slideId: s.id, id: e.id }); }));
  return out;
}

export async function rerenderAllCharts(filterType) {
  const deck = getState().deck;
  let targets = allChartTargets(deck);
  if (filterType) targets = targets.filter((t) => locate(deck, t)?.chartType === filterType);
  await renderCharts(targets, { silent: true });
}

export async function loadChartLibrary() {
  try {
    const res = await get('/api/charts/list');
    setState({ charts: res.charts, chartRoot: res.root });
    return res.charts;
  } catch (e) {
    toast(e.message, { kind: 'error' });
    return [];
  }
}

export async function insertChart(chartType, opts = {}) {
  const deck = getState().deck;
  const w = Math.round(9 * EMU_PER_IN); const h = Math.round(4.6 * EMU_PER_IN);
  const el = chartEl(chartType, Math.round((deck.size.w - w) / 2), Math.round(1.55 * EMU_PER_IN), w, h);
  if (opts.link) {
    el.link = { source: ensureSource(opts.link.path), sheet: opts.link.sheet, table: opts.link.table };
    el.data = opts.table || null;
  }
  el.name = opts.title || 'Chart';
  insertElement(el);
  const surf = currentSurface();
  await renderCharts([{ slideId: surf.kind === 'slide' ? surf.id : undefined, id: el.id }], { silent: true });
  return el;
}

export async function setChartLink(id, link, table) {
  const src = ensureSource(link.path);
  commit((d) => {
    const e = findIn(surfaceDraft(d), id);
    if (!e) return;
    e.link = { source: src, sheet: link.sheet, table: link.table };
    e.data = table;
  });
  await renderCharts([{ id }], { silent: true });
}

export async function changeSource(srcId, newPath) {
  const check = await post('/api/links/check', { sources: { [srcId]: { path: newPath } } });
  const info = check.status[srcId];
  if (!info.exists) throw new Error('That file does not exist.');
  // make sure the tables the deck uses exist in the new file
  const deck = getState().deck;
  const needed = new Set();
  deck.slides.forEach((s) => walkElements(s.elements, (e) => { if (e.type === 'chart' && e.link && e.link.source === srcId && e.link.table) needed.add(e.link.table); }));
  const missing = [...needed].filter((t) => !(info.tables || []).includes(t));
  commit((d) => { d.links.sources[srcId] = { ...d.links.sources[srcId], path: newPath, previous: sourcePath(deck, srcId) }; });
  const res = await refreshLinks('all', { sources: [srcId], quiet: true });
  return { missing, result: res };
}

export async function linkNumberHere({ path, sheet, ref, format }) {
  if (!activeEditor) throw new Error('Click inside a text box first, where the number should go.');
  const res = await post('/api/excel/value', { path, sheet, ref, format });
  const src = ensureSource(path);
  activeEditor.insertRun({ text: res.text || String(res.value ?? ''), link: { source: src, sheet, ref, format } });
  return res;
}

export function chartMeta(name) {
  return (getState().charts || []).find((c) => c.name === name);
}

export function setChartSettings(id, settings) {
  commit((d) => {
    const e = findIn(surfaceDraft(d), id);
    if (e) e.settings = settings;
  });
  return renderCharts([{ id }], { silent: true });
}
