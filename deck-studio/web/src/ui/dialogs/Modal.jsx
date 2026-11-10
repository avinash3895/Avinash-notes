import React, { useEffect, useRef } from 'react';
import { closeDialog } from '../../lib/store.js';
import { IClose } from '../icons.js';

export default function Modal({ title, children, footer, width = 480, onClose, className = '' }) {
  const ref = useRef(null);
  const close = onClose || closeDialog;
  useEffect(() => {
    const el = ref.current;
    const first = el && el.querySelector('input, select, textarea, button.primary');
    if (first) setTimeout(() => first.focus(), 30);
  }, []);
  // drag the dialog by its title bar
  const onDown = (e) => {
    const box = ref.current;
    const r = box.getBoundingClientRect();
    const sx = e.clientX - r.left; const sy = e.clientY - r.top;
    const move = (ev) => { box.style.left = `${ev.clientX - sx}px`; box.style.top = `${ev.clientY - sy}px`; box.style.transform = 'none'; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={ref} className={`modal ${className}`} style={{ width }} role="dialog"
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close(); }}>
        <div className="modal-title" onPointerDown={onDown}>
          <span>{title}</span>
          <button className="modal-x" onClick={close} title="Close"><IClose /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-ctl">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
