import React from 'react';
import { createPortal } from 'react-dom';
import { useStore, setUI, getState, selectedElements, openDialog } from '../lib/store.js';
import * as A from '../lib/actions.js';
import { refreshLinks } from '../lib/data.js';
import { MenuList } from './controls.jsx';
import { arrangeItems } from './ribbon/shared.jsx';
import {
  ICut, ICopy, IPaste, IDelete, IGroup, IUngroup, IToFront, IToBack, ILink, ISettings, INewSlide, IDocs, IHide, ILayout,
  IRefresh, IBackground, IText, IPainter, ICode,
} from './icons.js';
import { openChartEditor } from './ribbon/FormatTabs.jsx';

export function openContextMenu(x, y, kind) {
  setUI({ menu: { x, y, kind } });
}

function elementItems() {
  const sel = selectedElements();
  const one = sel.length === 1 ? sel[0] : null;
  const items = [
    { label: 'Cut', icon: ICut, run: A.cutSelection, shortcut: 'Ctrl+X' },
    { label: 'Copy', icon: ICopy, run: A.copySelection, shortcut: 'Ctrl+C' },
    { label: 'Paste', icon: IPaste, run: () => A.pasteClip(), shortcut: 'Ctrl+V' },
    { divider: true },
  ];
  if (one && one.type === 'shape') {
    items.push({ label: 'Edit Text', icon: IText, run: () => A.startEditing(one.id) });
  }
  if (one && one.type === 'chart') {
    items.push({ label: 'Chart Settings...', icon: ISettings, run: () => openDialog('chartSettings', { id: one.id }) });
    items.push({ label: one.link ? 'Change Data Link...' : 'Link to Excel...', icon: ILink, run: () => openDialog('chartData', { id: one.id }) });
    items.push({ label: 'Edit Chart Code', icon: ICode, run: () => openChartEditor(one.chartType) });
    items.push({ label: 'Refresh Data', icon: IRefresh, run: () => refreshLinks([getState().ui.slideId]), disabled: !one.link });
  }
  items.push({ label: 'Format Painter', icon: IPainter, run: A.pickFormat, disabled: !one });
  items.push({ divider: true });
  items.push({ label: 'Group', icon: IGroup, run: A.groupSelected, disabled: sel.length < 2, shortcut: 'Ctrl+G' });
  items.push({ label: 'Ungroup', icon: IUngroup, run: A.ungroupSelected, disabled: !sel.some((e) => e.type === 'group'), shortcut: 'Ctrl+Shift+G' });
  items.push({ label: 'Bring to Front', icon: IToFront, run: () => A.order('front') });
  items.push({ label: 'Send to Back', icon: IToBack, run: () => A.order('back') });
  const arr = arrangeItems();
  items.push(arr.find((x) => x.label === 'Align'));
  items.push(arr.find((x) => x.label === 'Rotate'));
  items.push({ divider: true });
  if (one && (one.type === 'shape' || one.type === 'image' || one.type === 'line')) items.push({ label: 'Format Shape...', icon: ISettings, run: () => openDialog('formatPane') });
  items.push({ label: 'Delete', icon: IDelete, run: A.deleteSelected, shortcut: 'Del' });
  return items;
}

function slideCanvasItems() {
  const st = getState();
  return [
    { label: 'Paste', icon: IPaste, run: () => A.pasteClip(), shortcut: 'Ctrl+V' },
    { divider: true },
    { label: 'Layout', icon: ILayout, submenu: st.deck.layouts.map((l) => ({ label: l.name, run: () => A.applyLayout([st.ui.slideId], l.id) })) },
    { label: 'Reset Slide', run: () => A.applyLayout([st.ui.slideId], null, true) },
    { label: 'Format Background...', icon: IBackground, run: () => openDialog('background') },
    { divider: true },
    { label: 'Refresh Excel Links', icon: IRefresh, run: () => refreshLinks('slide') },
    { label: 'New Slide', icon: INewSlide, run: () => A.addSlide(), shortcut: 'Ctrl+M' },
  ];
}

function slidePanelItems() {
  const st = getState();
  const ids = st.ui.slideSel;
  const hidden = st.deck.slides.filter((s) => ids.includes(s.id)).every((s) => s.hidden);
  return [
    { label: 'Cut', icon: ICut, run: () => { setUI({ focus: 'slides' }); A.cutSelection(); } },
    { label: 'Copy', icon: ICopy, run: () => { setUI({ focus: 'slides' }); A.copySelection(); } },
    { label: 'Paste', icon: IPaste, run: () => A.pasteClip() },
    { divider: true },
    { label: 'New Slide', icon: INewSlide, run: () => A.addSlide(), shortcut: 'Ctrl+M' },
    { label: 'Duplicate Slide', icon: IDocs, run: () => A.duplicateSlides(ids), shortcut: 'Ctrl+D' },
    { label: 'Delete Slide', icon: IDelete, run: () => A.deleteSlides(ids) },
    { divider: true },
    { label: 'Layout', icon: ILayout, submenu: st.deck.layouts.map((l) => ({ label: l.name, run: () => A.applyLayout(ids, l.id) })) },
    { label: 'Reset Slide', run: () => A.applyLayout(ids, null, true) },
    { label: 'Format Background...', icon: IBackground, run: () => openDialog('background') },
    { label: 'Refresh Excel Links', icon: IRefresh, run: () => refreshLinks(ids) },
    { divider: true },
    { label: hidden ? 'Show Slide' : 'Hide Slide', icon: IHide, run: () => A.toggleHideSlides(ids) },
  ];
}

export default function ContextMenuHost() {
  const menu = useStore((s) => s.ui.menu);
  if (!menu) return null;
  const items = menu.kind === 'element' ? elementItems() : menu.kind === 'slides' ? slidePanelItems() : slideCanvasItems();
  const close = () => setUI({ menu: null });
  const maxH = window.innerHeight;
  const est = items.length * 26;
  const top = menu.y + est > maxH ? Math.max(4, maxH - est - 8) : menu.y;
  const left = menu.x + 260 > window.innerWidth ? window.innerWidth - 264 : menu.x;
  return createPortal(
    <div className="ctx-backdrop" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close(); }}>
      <div className="popover ctx" style={{ left, top }} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}>
        <MenuList items={items.filter(Boolean)} onClose={close} />
      </div>
    </div>,
    document.body,
  );
}
