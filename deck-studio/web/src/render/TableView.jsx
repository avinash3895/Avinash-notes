import React from 'react';
import { px } from '../lib/model.js';
import { TextBlock } from './ElementView.jsx';

const PT = 4 / 3;

function borderCss(b) {
  if (!b || !b.color || !(b.width > 0)) return 'none';
  return `${Math.max(0.5, b.width * PT)}px ${b.dash === 'dash' ? 'dashed' : b.dash === 'dot' ? 'dotted' : 'solid'} ${b.color}`;
}

export default function TableView({ e, ctx }) {
  const sel = ctx.cellSel && ctx.cellSel.id === e.id ? ctx.cellSel : null;
  const inSel = (r, c) => sel && r >= Math.min(sel.r1, sel.r2) && r <= Math.max(sel.r1, sel.r2)
    && c >= Math.min(sel.c1, sel.c2) && c <= Math.max(sel.c1, sel.c2);
  const editing = ctx.editingId === e.id ? ctx.editingCell : null;
  return (
    <table className="tbl" style={{ width: px(e.cols.reduce((a, b) => a + b, 0)) }}>
      <colgroup>{e.cols.map((w, i) => <col key={i} style={{ width: px(w) }} />)}</colgroup>
      <tbody>
        {e.rows.map((row, r) => (
          <tr key={r} style={{ height: px(row.h) }}>
            {row.cells.map((cell, c) => {
              if (cell.hMerge || cell.vMerge) return null;
              const b = cell.borders || {};
              const m = cell.margins || {};
              const isEditing = editing && editing[0] === r && editing[1] === c;
              const body = { ...cell.text, insets: { l: m.l ?? 91440, r: m.r ?? 91440, t: m.t ?? 45720, b: m.b ?? 45720 }, anchor: cell.anchor || 't', autofit: 'none' };
              return (
                <td key={c} data-cell={`${r},${c}`} colSpan={cell.span || 1} rowSpan={cell.rowSpan || 1}
                  className={inSel(r, c) ? 'cell-sel' : undefined}
                  style={{
                    background: cell.fill && cell.fill.color ? cell.fill.color : 'transparent',
                    borderLeft: borderCss(b.l), borderRight: borderCss(b.r), borderTop: borderCss(b.t), borderBottom: borderCss(b.b),
                    verticalAlign: ({ t: 'top', ctr: 'middle', b: 'bottom' })[cell.anchor || 't'],
                  }}>
                  <div className="cell-box">
                    <TextBlock b={body} el={{ ...e, cellRC: [r, c], textbox: true }} ctx={ctx} editable={!!isEditing} />
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
