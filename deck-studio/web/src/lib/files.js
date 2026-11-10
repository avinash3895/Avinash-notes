// Opening, saving, autosave, exporting and keeping two windows in sync.
import { getState, setState, setUI, onCommit, resetHistory, toast, promptText, ask, openDialog } from './store.js';
import { post, get } from './api.js';
import { newDeck } from './model.js';

const WIN_ID = Math.random().toString(36).slice(2);
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('deck-studio') : null;
let applyingRemote = false;
let autosaveTimer = null;
let broadcastTimer = null;

export function deckFileName(path) {
  if (!path) return '';
  return path.split(/[\\/]/).pop();
}

export function folderOf(path) {
  if (!path) return '';
  const parts = path.split(/[\\/]/); parts.pop();
  return parts.join(path.includes('\\') ? '\\' : '/');
}

// ask the server for a real Windows file dialog; falls back to typing a path
export async function chooseFile(mode, kind, opts = {}) {
  try {
    const res = await post('/api/dialog', { mode, kind, title: opts.title, defaultName: opts.defaultName, initialDir: opts.initialDir });
    if (!res.unsupported) return res.path || null;
  } catch (e) { /* fall back */ }
  const label = mode === 'folder' ? 'Folder path' : 'Full file path';
  const v = await promptText(opts.title || 'Choose file', label, opts.fallback || opts.defaultName || '', {
    hint: 'The Windows file picker is not available on this computer, so type or paste the full path instead.',
  });
  return v || null;
}

export function loadDeck(deck, path) {
  const first = deck.slides[0];
  setState({ deck, path: path || null, dirty: false, saveState: path ? 'saved' : 'unsaved', lastSaved: path ? Date.now() : null });
  resetHistory();
  setUI({ slideId: first.id, slideSel: [first.id], selection: [], editing: null, view: 'normal', backstage: null, tab: 'home', masterTarget: 'master' });
  document.title = `${deck.name} - Deck Studio`;
  try { localStorage.setItem('ds:lastPath', path || ''); } catch (e) { /* ignore */ }
}

export async function newDeckCmd() {
  if (!(await confirmDiscard())) return;
  const d = newDeck();
  loadDeck(d, null);
}

export async function confirmDiscard() {
  const st = getState();
  if (!st.dirty || st.saveState === 'saved') return true;
  const r = await ask('Save changes?', `Do you want to save the changes you made to "${st.deck.name}"?`, [
    { id: 'save', label: 'Save', primary: true }, { id: 'discard', label: "Don't Save" }, { id: 'cancel', label: 'Cancel' },
  ]);
  if (r === 'cancel' || !r) return false;
  if (r === 'save') return saveDeck();
  return true;
}

export async function openDeckPath(path) {
  try {
    const res = await post('/api/deck/open', { path });
    if (!res.deck || !res.deck.slides) throw new Error('This file is not a Deck Studio deck.');
    loadDeck(migrate(res.deck), res.path);
    toast(`Opened ${deckFileName(res.path)}`);
  } catch (e) {
    toast(e.message, { kind: 'error' });
  }
}

export async function openDeckCmd() {
  if (!(await confirmDiscard())) return;
  const path = await chooseFile('open', 'deck', { title: 'Open deck', initialDir: getState().settings.autosaveFolder });
  if (path) openDeckPath(path);
}

function migrate(deck) {
  if (!deck.layouts) deck.layouts = newDeck().layouts;
  if (!deck.links) deck.links = { sources: {} };
  if (!deck.master) deck.master = newDeck().master;
  if (!deck.theme) deck.theme = newDeck().theme;
  return deck;
}

export async function saveDeck() {
  const st = getState();
  if (!st.path) return saveDeckAs();
  setState({ saveState: 'saving' });
  try {
    const res = await post('/api/deck/save', { path: st.path, deck: st.deck });
    setState({ path: res.path, dirty: false, saveState: 'saved', lastSaved: Date.now(), saveError: null });
    return true;
  } catch (e) {
    setState({ saveState: 'error', saveError: e.message });
    toast(`Could not save: ${e.message}`, { kind: 'error' });
    return false;
  }
}

export async function saveDeckAs() {
  const st = getState();
  const path = await chooseFile('save', 'deck', {
    title: 'Save deck as', defaultName: `${st.deck.name}.dstudio`, initialDir: folderOf(st.path) || st.settings.autosaveFolder,
    fallback: `${st.settings.autosaveFolder || ''}${st.settings.autosaveFolder ? (st.settings.autosaveFolder.includes('\\') ? '\\' : '/') : ''}${st.deck.name}.dstudio`,
  });
  if (!path) return false;
  const name = deckFileName(path).replace(/\.dstudio$/i, '');
  setState((s) => ({ deck: { ...s.deck, name }, path }));
  document.title = `${name} - Deck Studio`;
  return saveDeck();
}

// "Deck v01" -> "Deck v02" next to the current file, then keep working on the new version
export async function saveNewVersion() {
  const st = getState();
  try {
    const res = await post('/api/deck/next-version', { path: st.path, name: st.deck.name });
    setState((s) => ({ deck: { ...s.deck, name: res.name }, path: res.path }));
    document.title = `${res.name} - Deck Studio`;
    const ok = await saveDeck();
    if (ok) toast(`Saved as new version "${res.name}"`);
  } catch (e) {
    toast(e.message, { kind: 'error' });
  }
}

export async function renameDeck(name) {
  const st = getState();
  const clean = (name || '').trim();
  if (!clean || clean === st.deck.name) return;
  let path = st.path;
  if (path) {
    try {
      const res = await post('/api/deck/rename', { path, name: clean });
      path = res.path;
    } catch (e) {
      toast(e.message, { kind: 'error' });
      return;
    }
  }
  setState((s) => ({ deck: { ...s.deck, name: clean }, path, dirty: true, saveState: 'unsaved' }));
  document.title = `${clean} - Deck Studio`;
  scheduleAutosave(200);
}

export function scheduleAutosave(ms = 1500) {
  const st = getState();
  if (!st.settings.autosave) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveNow, ms);
}

async function autosaveNow() {
  const st = getState();
  if (!st.settings.autosave || !st.dirty) return;
  if (st.ui.editing) { scheduleAutosave(1500); return; }
  setState({ saveState: 'saving' });
  try {
    const res = await post('/api/deck/autosave', { path: st.path, deck: st.deck });
    const now = getState();
    setState({ path: res.path, lastSaved: Date.now(), saveError: null, saveState: now.rev === st.rev ? 'saved' : 'unsaved', dirty: now.rev !== st.rev });
    if (now.rev !== st.rev) scheduleAutosave();
    if (!st.path) toast(`AutoSave is on: saving to ${folderOf(res.path)}`);
  } catch (e) {
    setState({ saveState: 'error', saveError: e.message });
  }
}

export async function setAutosave(on) {
  const settings = await post('/api/settings', { autosave: on });
  setState({ settings: { ...getState().settings, ...settings } });
  if (on) scheduleAutosave(100);
}

export async function loadSettings() {
  try {
    const s = await get('/api/settings');
    setState({ settings: s });
    return s;
  } catch (e) {
    return {};
  }
}

export async function saveSettings(changes) {
  const s = await post('/api/settings', changes);
  setState({ settings: { ...getState().settings, ...s } });
  return s;
}

// ----------------------------------------------------------------- export
export async function exportPptx() {
  const st = getState();
  const last = st.settings.lastExport;
  const path = await chooseFile('save', 'pptx', {
    title: 'Export to PowerPoint', defaultName: `${st.deck.name}.pptx`,
    initialDir: folderOf(last) || folderOf(st.path) || st.settings.documents,
    fallback: `${folderOf(st.path) || st.settings.documents || ''}${(folderOf(st.path) || st.settings.documents || '').includes('\\') ? '\\' : '/'}${st.deck.name}.pptx`,
  });
  if (!path) return;
  const id = toast('Exporting to PowerPoint...', { sticky: true });
  try {
    const res = await post('/api/export', { deck: st.deck, path });
    setUI((u) => ({ toasts: u.toasts.filter((t) => t.id !== id) }));
    setState({ settings: { ...getState().settings, lastExport: res.path } });
    toast(`Exported ${res.slides} slide${res.slides === 1 ? '' : 's'} to ${deckFileName(res.path)}`, {
      kind: 'success',
      actions: [
        { label: 'Open', run: () => post('/api/open-path', { path: res.path }).catch((e) => toast(e.message, { kind: 'error' })) },
        { label: 'Show in folder', run: () => post('/api/reveal', { path: res.path }) },
      ],
    });
  } catch (e) {
    setUI((u) => ({ toasts: u.toasts.filter((t) => t.id !== id) }));
    toast(e.message, { kind: 'error' });
  }
}

export function openUpdatePowerPoint() {
  openDialog('updatePpt');
}

// ------------------------------------------------------- window syncing
export function newWindow() {
  const st = getState();
  const url = `${location.origin}/?join=${encodeURIComponent(st.deck.id)}`;
  const w = window.open(url, `_blank`, 'popup=yes,width=1440,height=900');
  if (!w) toast('Chrome blocked the new window. Allow pop-ups for Deck Studio and try again.', { kind: 'warn' });
}

export function initSync() {
  if (!channel) return;
  channel.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.from === WIN_ID) return;
    const st = getState();
    if (m.type === 'hello' && st.deck && st.deck.id === m.deckId) {
      channel.postMessage({ type: 'deck', from: WIN_ID, deckId: st.deck.id, deck: st.deck, path: st.path, saveState: st.saveState, to: m.from });
    }
    if (m.type === 'deck' && (m.to === WIN_ID || (st.deck && st.deck.id === m.deckId))) {
      applyingRemote = true;
      const first = !st.deck || st.deck.id !== m.deckId;
      setState({ deck: m.deck, path: m.path, saveState: m.saveState || st.saveState, dirty: m.saveState !== 'saved' });
      if (first) {
        const s0 = m.deck.slides[0];
        setUI({ slideId: s0.id, slideSel: [s0.id] });
        document.title = `${m.deck.name} - Deck Studio`;
      } else if (!m.deck.slides.some((s) => s.id === st.ui.slideId)) {
        setUI({ slideId: m.deck.slides[0].id, slideSel: [m.deck.slides[0].id], selection: [], editing: null });
      }
      applyingRemote = false;
    }
    if (m.type === 'saved' && st.deck && st.deck.id === m.deckId) {
      setState({ path: m.path, saveState: 'saved', dirty: false, lastSaved: Date.now() });
    }
    if (m.type === 'chart-code' || m.type === 'chart-promoted') {
      window.dispatchEvent(new CustomEvent('ds-chart-code', { detail: m }));
    }
  };
  onCommit(() => {
    if (applyingRemote) return;
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => {
      const st = getState();
      channel.postMessage({ type: 'deck', from: WIN_ID, deckId: st.deck.id, deck: st.deck, path: st.path, saveState: st.saveState });
    }, 120);
    scheduleAutosave();
  });
}

export function joinDeck(deckId) {
  return new Promise((resolve) => {
    if (!channel) { resolve(false); return; }
    let done = false;
    const handler = (ev) => {
      const m = ev.data || {};
      if (m.type === 'deck' && m.deckId === deckId && !done) { done = true; channel.removeEventListener('message', handler); resolve(true); }
    };
    channel.addEventListener('message', handler);
    channel.postMessage({ type: 'hello', from: WIN_ID, deckId });
    setTimeout(() => { if (!done) { done = true; resolve(false); } }, 1500);
  });
}

export function broadcast(msg) {
  if (channel) channel.postMessage({ ...msg, from: WIN_ID });
}

export function isRemoteApplying() {
  return applyingRemote;
}
