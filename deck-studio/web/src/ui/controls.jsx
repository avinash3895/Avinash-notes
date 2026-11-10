import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IChevDown, ICheck, IChevRight } from './icons.js';
import { useStore, getState, setUI } from '../lib/store.js';

const keepFocus = (e) => e.preventDefault();

// ------------------------------------------------------------ popovers
export function Popover({ anchor, onClose, children, className = '', align = 'left' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const el = ref.current;
    const w = el.offsetWidth; const h = el.offsetHeight;
    let left = align === 'right' ? r.right - w : r.left;
    let top = r.bottom + 2;
    if (left + w > window.innerWidth - 6) left = window.innerWidth - w - 6;
    if (top + h > window.innerHeight - 6) top = Math.max(6, r.top - h - 2);
    setPos({ left: Math.max(6, left), top });
  }, [anchor, align]);
  useEffect(() => {
    const down = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !(anchor && anchor.contains(e.target))) onClose();
    };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('mousedown', down, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true); };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className={`popover ${className}`} style={pos} onMouseDown={(e) => { if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) e.preventDefault(); }}>
      {children}
    </div>,
    document.body,
  );
}

export function usePopover() {
  const [anchor, setAnchor] = useState(null);
  return {
    anchor,
    open: (e) => setAnchor(anchor ? null : e.currentTarget),
    close: () => setAnchor(null),
  };
}

// menu items: { label, icon, shortcut, run, checked, disabled, divider, header, submenu, render }
export function MenuList({ items, onClose }) {
  const [sub, setSub] = useState(null);
  return (
    <div className="menu" role="menu">
      {items.filter(Boolean).map((it, i) => {
        if (it.divider) return <div key={i} className="menu-div" />;
        if (it.header) return <div key={i} className="menu-header">{it.header}</div>;
        if (it.render) return <div key={i} className="menu-custom">{it.render(onClose)}</div>;
        const Icon = it.icon;
        return (
          <div key={i} className={`menu-item${it.disabled ? ' disabled' : ''}${sub === i ? ' open' : ''}`}
            onMouseEnter={(e) => setSub(it.submenu ? { i, el: e.currentTarget } : null)}
            onClick={() => { if (it.disabled || it.submenu) return; onClose(); it.run && it.run(); }}>
            <span className="mi-check">{it.checked ? <ICheck /> : Icon ? <Icon /> : it.swatch ? <span className="mi-swatch" style={{ background: it.swatch }} /> : null}</span>
            <span className="mi-label" style={it.style}>{it.label}</span>
            {it.shortcut && <span className="mi-short">{it.shortcut}</span>}
            {it.submenu && <span className="mi-sub"><IChevRight /></span>}
            {it.submenu && sub && sub.i === i && (
              <SubMenu anchor={sub.el} items={it.submenu} onClose={onClose} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SubMenu({ anchor, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = ref.current.offsetWidth; const h = ref.current.offsetHeight;
    let left = r.right - 2; if (left + w > window.innerWidth) left = r.left - w + 2;
    let top = r.top - 4; if (top + h > window.innerHeight) top = window.innerHeight - h - 6;
    setPos({ left, top });
  }, [anchor]);
  return createPortal(
    <div ref={ref} className="popover submenu" style={pos} onMouseDown={keepFocus} onClick={(e) => e.stopPropagation()}>
      <MenuList items={items} onClose={onClose} />
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------- buttons
export function RibbonGroup({ label, children, onLauncher, className = '' }) {
  return (
    <div className={`rgroup ${className}`}>
      <div className="rgroup-body">{children}</div>
      <div className="rgroup-label">
        {label}
        {onLauncher && <button className="launcher" onMouseDown={keepFocus} onClick={onLauncher} title={`${label} options`}>
          <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 1h6v6M7 7L2.5 2.5M7 4v3H4" fill="none" stroke="currentColor" /></svg>
        </button>}
      </div>
    </div>
  );
}

export function BigButton({ icon: Icon, label, onClick, active, disabled, menu, split, title, className = '' }) {
  const pop = usePopover();
  const items = typeof menu === 'function' ? null : menu;
  const body = (
    <>
      <span className="bb-icon">{Icon && <Icon />}</span>
      <span className="bb-label">{label}{menu && !split && <IChevDown className="chev" />}</span>
    </>
  );
  if (split && menu) {
    return (
      <div className={`bigbtn split${disabled ? ' disabled' : ''}${pop.anchor ? ' open' : ''} ${className}`} title={title}>
        <button className={`bb-main${active ? ' active' : ''}`} onMouseDown={keepFocus} onClick={onClick} disabled={disabled}>
          <span className="bb-icon">{Icon && <Icon />}</span>
        </button>
        <button className="bb-drop" onMouseDown={keepFocus} onClick={pop.open} disabled={disabled}>
          <span className="bb-label">{label}<IChevDown className="chev" /></span>
        </button>
        {pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close}>{items ? <MenuList items={items} onClose={pop.close} /> : menu(pop.close)}</Popover>}
      </div>
    );
  }
  return (
    <>
      <button className={`bigbtn${active ? ' active' : ''}${pop.anchor ? ' open' : ''} ${className}`} title={title} disabled={disabled}
        onMouseDown={keepFocus} onClick={menu ? pop.open : onClick}>
        {body}
      </button>
      {menu && pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close}>{items ? <MenuList items={items} onClose={pop.close} /> : menu(pop.close)}</Popover>}
    </>
  );
}

export function SmallButton({ icon: Icon, label, onClick, active, disabled, title, menu, split, children, className = '', iconOnly }) {
  const pop = usePopover();
  const items = typeof menu === 'function' ? null : menu;
  const content = (
    <>
      {Icon && <Icon className="sb-icon" />}
      {children}
      {label && !iconOnly && <span className="sb-label">{label}</span>}
    </>
  );
  if (split && menu) {
    return (
      <span className={`smallbtn-split${disabled ? ' disabled' : ''}${pop.anchor ? ' open' : ''}`}>
        <button className={`smallbtn${active ? ' active' : ''} ${className}`} onMouseDown={keepFocus} onClick={onClick} title={title || label} disabled={disabled}>{content}</button>
        <button className="smallbtn drop" onMouseDown={keepFocus} onClick={pop.open} disabled={disabled} title={`${title || label} options`}><IChevDown /></button>
        {pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close}>{items ? <MenuList items={items} onClose={pop.close} /> : menu(pop.close)}</Popover>}
      </span>
    );
  }
  return (
    <>
      <button className={`smallbtn${active ? ' active' : ''}${pop.anchor ? ' open' : ''} ${className}`} onMouseDown={keepFocus}
        onClick={menu ? pop.open : onClick} title={title || label} disabled={disabled}>
        {content}
        {menu && <IChevDown className="chev" />}
      </button>
      {menu && pop.anchor && <Popover anchor={pop.anchor} onClose={pop.close}>{items ? <MenuList items={items} onClose={pop.close} /> : menu(pop.close)}</Popover>}
    </>
  );
}

export function Row({ children }) {
  return <div className="rrow">{children}</div>;
}

export function Col({ children, className = '' }) {
  return <div className={`rcol ${className}`}>{children}</div>;
}

export function Sep() {
  return <span className="rsep" />;
}

// --------------------------------------------------------- colour picker
function mix(hex, amount, toWhite) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const t = toWhite ? 255 : 0;
  return '#' + c.map((v) => Math.round(v + (t - v) * amount).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const STANDARD = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];

export function ColorGrid({ onPick, allowNone, noneLabel = 'No Fill', current, onClose }) {
  const theme = useStore((s) => s.deck.theme);
  const recent = useStore((s) => s.ui.recentColors || []);
  const keys = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
  const base = keys.map((k) => theme.colors[k]);
  const rows = [base];
  const variants = [[0.8, true], [0.6, true], [0.4, true], [0.25, false], [0.5, false]];
  variants.forEach(([a, w]) => rows.push(base.map((c, i) => {
    if (i === 0) return w ? mix('#FFFFFF', [0.05, 0.15, 0.25, 0.35, 0.5][variants.findIndex((v) => v[0] === a)], false) : mix('#FFFFFF', a === 0.25 ? 0.25 : 0.5, false);
    if (i === 1) return mix('#000000', [0.5, 0.35, 0.25, 0.15, 0.05][variants.findIndex((v) => v[0] === a)], true);
    return mix(c, a, w);
  })));
  const pick = (c) => {
    onPick(c);
    if (c) {
      const st = getState();
      const r = [c, ...(st.ui.recentColors || []).filter((x) => x !== c)].slice(0, 10);
      setTimeout(() => setUI({ recentColors: r }));
    }
    onClose && onClose();
  };
  const inputRef = useRef(null);
  return (
    <div className="colorgrid">
      {allowNone && <div className="cg-none" onClick={() => pick(null)}><span className="cg-x" />{noneLabel}</div>}
      <div className="cg-title">Theme Colours</div>
      <div className="cg-theme">
        {rows.map((row, r) => (
          <div key={r} className={`cg-row${r === 0 ? ' first' : ''}`}>
            {row.map((c, i) => <span key={i} className={`cg-sw${current && current.toUpperCase() === c.toUpperCase() ? ' cur' : ''}`} style={{ background: c }} title={c} onClick={() => pick(c)} />)}
          </div>
        ))}
      </div>
      <div className="cg-title">Standard Colours</div>
      <div className="cg-row">{STANDARD.map((c) => <span key={c} className="cg-sw" style={{ background: c }} title={c} onClick={() => pick(c)} />)}</div>
      {recent.length > 0 && <>
        <div className="cg-title">Recent Colours</div>
        <div className="cg-row">{recent.map((c) => <span key={c} className="cg-sw" style={{ background: c }} title={c} onClick={() => pick(c)} />)}</div>
      </>}
      <div className="cg-more" onClick={() => inputRef.current && inputRef.current.click()}>
        <span className="cg-wheel" />More Colours...
        <input ref={inputRef} type="color" defaultValue={current || '#00778B'} onChange={(e) => pick(e.target.value.toUpperCase())} />
      </div>
      <HexInput onPick={pick} current={current} />
    </div>
  );
}

function HexInput({ onPick, current }) {
  const [v, setV] = useState(current || '');
  return (
    <div className="cg-hex">
      <span>Hex</span>
      <input value={v} placeholder="#00778B" onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { const c = v.startsWith('#') ? v : `#${v}`; if (/^#[0-9a-f]{6}$/i.test(c)) onPick(c.toUpperCase()); } }} />
    </div>
  );
}

export function ColorButton({ icon: Icon, label, color, onPick, allowNone, noneLabel, title, extra }) {
  const pop = usePopover();
  return (
    <span className={`smallbtn-split color${pop.anchor ? ' open' : ''}`}>
      <button className="smallbtn" onMouseDown={keepFocus} onClick={() => onPick(color === undefined ? '#FF0000' : color)} title={title || label}>
        <span className="color-ico">{Icon && <Icon className="sb-icon" />}<span className="color-bar" style={{ background: color || 'transparent' }} /></span>
        {label && <span className="sb-label">{label}</span>}
      </button>
      <button className="smallbtn drop" onMouseDown={keepFocus} onClick={pop.open} title={`${title || label} colours`}><IChevDown /></button>
      {pop.anchor && (
        <Popover anchor={pop.anchor} onClose={pop.close}>
          <ColorGrid onPick={onPick} allowNone={allowNone} noneLabel={noneLabel} onClose={pop.close} />
          {extra && extra(pop.close)}
        </Popover>
      )}
    </span>
  );
}

// ---------------------------------------------------------- font picker
export function FontPicker({ value, onPick, width = 132 }) {
  const fonts = useStore((s) => s.fonts);
  const theme = useStore((s) => s.deck.theme);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value || '');
  const [anchor, setAnchor] = useState(null);
  const inputRef = useRef(null);
  useEffect(() => { if (!open) setText(value || ''); }, [value, open]);
  const list = useMemo(() => {
    const q = text.toLowerCase();
    const all = fonts.length ? fonts : ['Interstate', 'Arial', 'Calibri', 'Segoe UI', 'Times New Roman', 'Georgia', 'Verdana', 'Tahoma', 'Courier New'];
    return open && q && q !== (value || '').toLowerCase() ? all.filter((f) => f.toLowerCase().includes(q)) : all;
  }, [fonts, text, open, value]);
  const commitText = () => { if (text && text !== value) onPick(text); setOpen(false); };
  return (
    <span className="combo" style={{ width }} ref={setAnchor}>
      <input ref={inputRef} value={open ? text : (value || '')} placeholder={value === '' ? '' : 'Font'} spellCheck={false}
        onFocus={(e) => { setOpen(true); setText(value || ''); e.target.select(); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { commitText(); inputRef.current.blur(); } if (e.key === 'Escape') { setOpen(false); inputRef.current.blur(); } }}
        style={{ fontFamily: value ? `"${value}", "Segoe UI"` : undefined }} />
      <button className="combo-drop" onMouseDown={(e) => { e.preventDefault(); if (open) setOpen(false); else { setOpen(true); setText(value || ''); } }}><IChevDown /></button>
      {open && anchor && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} className="font-pop">
          <div className="font-list">
            <div className="menu-header">Theme Fonts</div>
            <div className="font-item" style={{ fontFamily: `"${theme.fonts.major}"` }} onClick={() => { onPick(theme.fonts.major); setOpen(false); }}>{theme.fonts.major}<span className="font-tag">(Headings)</span></div>
            <div className="font-item" style={{ fontFamily: `"${theme.fonts.minor}"` }} onClick={() => { onPick(theme.fonts.minor); setOpen(false); }}>{theme.fonts.minor}<span className="font-tag">(Body)</span></div>
            <div className="menu-header">All Fonts</div>
            {list.slice(0, 600).map((f) => (
              <div key={f} className={`font-item${f === value ? ' cur' : ''}`} style={{ fontFamily: `"${f}", "Segoe UI"` }} onClick={() => { onPick(f); setOpen(false); }}>{f}</div>
            ))}
            {!list.length && <div className="font-empty">No installed font matches "{text}". Press Enter to use it anyway.</div>}
          </div>
        </Popover>
      )}
    </span>
  );
}

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];

export function SizeCombo({ value, onPick, width = 50, sizes = SIZES }) {
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const pop = usePopover();
  const wrap = useRef(null);
  return (
    <span className="combo" style={{ width }} ref={wrap}>
      <input value={focus ? text : (value === '' || value == null ? '' : String(value))} spellCheck={false}
        onFocus={(e) => { setFocus(true); setText(value == null ? '' : String(value)); setTimeout(() => e.target.select()); }}
        onBlur={() => setFocus(false)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { const n = parseFloat(text); if (n > 0 && n <= 4000) onPick(Math.round(n * 2) / 2); e.target.blur(); }
          if (e.key === 'Escape') e.target.blur();
        }} />
      <button className="combo-drop" onMouseDown={(e) => { e.preventDefault(); pop.open({ currentTarget: wrap.current }); }}><IChevDown /></button>
      {pop.anchor && (
        <Popover anchor={pop.anchor} onClose={pop.close}>
          <div className="size-list">
            {sizes.map((s) => <div key={s} className={`size-item${s === value ? ' cur' : ''}`} onClick={() => { onPick(s); pop.close(); }}>{s}</div>)}
          </div>
        </Popover>
      )}
    </span>
  );
}

export function NumberField({ label, value, onChange, step = 0.1, min, max, suffix = '', width = 76, decimals = 2, title }) {
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const shown = value === '' || value == null || Number.isNaN(value) ? '' : `${Number(value).toFixed(decimals)}${suffix ? ` ${suffix}` : ''}`;
  const apply = (v) => {
    let n = parseFloat(String(v).replace(',', '.'));
    if (Number.isNaN(n)) return;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onChange(n);
  };
  return (
    <label className="numfield" title={title || label}>
      {label && <span className="nf-label">{label}</span>}
      <span className="nf-box" style={{ width }}>
        <input value={focus ? text : shown} onFocus={(e) => { setFocus(true); setText(value == null ? '' : String(Number(value).toFixed(decimals))); setTimeout(() => e.target.select()); }}
          onBlur={() => { setFocus(false); if (text !== '') apply(text); }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { apply(text); e.target.blur(); } if (e.key === 'Escape') { setText(''); e.target.blur(); } if (e.key === 'ArrowUp') { e.preventDefault(); apply((Number(value) || 0) + step); } if (e.key === 'ArrowDown') { e.preventDefault(); apply((Number(value) || 0) - step); } }} />
        <span className="nf-spin">
          <button onMouseDown={(e) => { e.preventDefault(); apply((Number(value) || 0) + step); }}>▴</button>
          <button onMouseDown={(e) => { e.preventDefault(); apply((Number(value) || 0) - step); }}>▾</button>
        </span>
      </span>
    </label>
  );
}

export function Check({ label, checked, onChange, disabled }) {
  return (
    <label className={`rcheck${disabled ? ' disabled' : ''}`} onMouseDown={keepFocus}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Gallery({ items, render, onPick, columns = 6, className = '' }) {
  return (
    <div className={`gallery ${className}`} style={{ gridTemplateColumns: `repeat(${columns}, auto)` }}>
      {items.map((it, i) => (
        <div key={it.id || i} className={`gallery-item${it.active ? ' active' : ''}`} title={it.name} onMouseDown={keepFocus} onClick={() => onPick(it)}>
          {render(it)}
        </div>
      ))}
    </div>
  );
}
