import React, { useEffect } from 'react';
import { useStore, setUI, selectedElements } from '../lib/store.js';
import HomeTab from './ribbon/HomeTab.jsx';
import InsertTab from './ribbon/InsertTab.jsx';
import { DesignTab, SlideShowTab, DataTab, ViewTab, MasterTab } from './ribbon/OtherTabs.jsx';
import { ShapeFormatTab, ChartDesignTab, TableDesignTab, TableLayoutTab } from './ribbon/FormatTabs.jsx';
import { startShow } from '../lib/actions.js';
import { IPlay, IShare } from './icons.js';
import { openDialog } from '../lib/store.js';

const TABS = [
  { id: 'home', label: 'Home', comp: HomeTab },
  { id: 'insert', label: 'Insert', comp: InsertTab },
  { id: 'design', label: 'Design', comp: DesignTab },
  { id: 'show', label: 'Slide Show', comp: SlideShowTab },
  { id: 'data', label: 'Data', comp: DataTab },
  { id: 'view', label: 'View', comp: ViewTab },
];

export function contextualTabs() {
  const sel = selectedElements();
  const out = [];
  if (!sel.length) return out;
  const types = new Set(sel.map((e) => e.type));
  if (types.has('shape') || types.has('line') || types.has('image') || types.has('group')) out.push({ id: 'shape', label: types.size === 1 && types.has('image') ? 'Picture Format' : 'Shape Format', comp: ShapeFormatTab, group: 'Drawing Tools' });
  if (sel.length === 1 && types.has('chart')) out.push({ id: 'chart', label: 'Chart Design', comp: ChartDesignTab, group: 'Chart Tools' });
  if (sel.length === 1 && types.has('table')) {
    out.push({ id: 'table', label: 'Table Design', comp: TableDesignTab, group: 'Table Tools' });
    out.push({ id: 'tableLayout', label: 'Layout', comp: TableLayoutTab, group: 'Table Tools' });
  }
  return out;
}

export default function Ribbon() {
  const tab = useStore((s) => s.ui.tab);
  const view = useStore((s) => s.ui.view);
  useStore((s) => s.ui.selection);
  useStore((s) => s.rev);
  const collapsed = useStore((s) => s.ui.ribbonCollapsed);
  const ctx = contextualTabs();
  const tabs = view === 'master' ? [{ id: 'master', label: 'Slide Master', comp: MasterTab, master: true }, ...TABS.filter((t) => t.id !== 'design')] : TABS;
  const all = [...tabs, ...ctx];
  const current = all.find((t) => t.id === tab) || tabs[0];

  // leave a contextual tab when its object is deselected
  useEffect(() => {
    if (!all.find((t) => t.id === tab)) setUI({ tab: view === 'master' ? 'master' : 'home' });
  }, [tab, all.map((t) => t.id).join(','), view]);

  const Comp = current.comp;
  return (
    <div className={`ribbon${collapsed ? ' collapsed' : ''}`}>
      <div className="ribbon-tabs">
        <button className="rtab file" onClick={() => setUI({ backstage: 'home' })}>File</button>
        {tabs.map((t) => (
          <button key={t.id} className={`rtab${current.id === t.id ? ' active' : ''}${t.master ? ' master' : ''}`}
            onClick={() => setUI({ tab: t.id, ribbonCollapsed: false })} onDoubleClick={() => setUI({ ribbonCollapsed: !collapsed })}>{t.label}</button>
        ))}
        {ctx.map((t) => (
          <button key={t.id} className={`rtab contextual${current.id === t.id ? ' active' : ''}`} onClick={() => setUI({ tab: t.id, ribbonCollapsed: false })} title={t.group}>{t.label}</button>
        ))}
        <span className="rtabs-fill" />
        <button className="rtab-action" onClick={() => startShow(true)} title="Present from current slide (Shift+F5)"><IPlay /> Present</button>
        <button className="rtab-action share" onClick={() => openDialog('share')} title="Share this deck"><IShare /> Share</button>
      </div>
      {!collapsed && (
        <div className="ribbon-body" key={current.id}>
          <Comp />
        </div>
      )}
    </div>
  );
}
