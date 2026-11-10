// Turns the text model into HTML for the canvas (static and editing views use
// the same markup, so text never jumps when you start typing).
// Measurements follow PowerPoint: sizes in points (rendered at 96 dpi),
// single line spacing = 1.2 x font size.

import { px, ptToPx } from './model.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function fontStack(font) {
  const f = (font || 'Interstate').replace(/"/g, '');
  return `"${f}", "Interstate", "Segoe UI", Arial, sans-serif`;
}

export function runStyle(r) {
  const size = ptToPx(r.size || 18);
  const s = [
    `font-family:${esc(fontStack(r.font))}`,
    `font-size:${r.baseline ? size * 0.67 : size}px`,
    `color:${r.color || '#000'}`,
  ];
  if (r.bold) s.push('font-weight:700');
  if (r.italic) s.push('font-style:italic');
  const deco = [];
  if (r.underline) deco.push('underline');
  if (r.strike) deco.push('line-through');
  if (deco.length) s.push(`text-decoration:${deco.join(' ')}`);
  if (r.spacing) s.push(`letter-spacing:${ptToPx(r.spacing)}px`);
  if (r.baseline > 0) s.push(`vertical-align:${size * 0.33}px`);
  if (r.baseline < 0) s.push(`vertical-align:-${size * 0.12}px`);
  if (r.highlight) s.push(`background:${r.highlight}`);
  if (r.caps === 'all') s.push('text-transform:uppercase');
  if (r.caps === 'small') s.push('font-variant:small-caps');
  return s.join(';');
}

const ROMAN = [['m', 1000], ['cm', 900], ['d', 500], ['cd', 400], ['c', 100], ['xc', 90], ['l', 50], ['xl', 40], ['x', 10], ['ix', 9], ['v', 5], ['iv', 4], ['i', 1]];
function roman(n) {
  let out = '';
  for (const [s, v] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

export function numberLabel(scheme, n) {
  switch (scheme) {
    case 'arabicParenR': return `${n})`;
    case 'arabicPlain': return `${n}`;
    case 'alphaLcPeriod': return `${String.fromCharCode(96 + ((n - 1) % 26) + 1)}.`;
    case 'alphaUcPeriod': return `${String.fromCharCode(64 + ((n - 1) % 26) + 1)}.`;
    case 'alphaLcParenR': return `${String.fromCharCode(96 + ((n - 1) % 26) + 1)})`;
    case 'romanLcPeriod': return `${roman(n)}.`;
    case 'romanUcPeriod': return `${roman(n).toUpperCase()}.`;
    default: return `${n}.`;
  }
}

// ctx: { slideNumber, prompt, editing }
export function bodyHTML(b, ctx = {}) {
  const paras = b?.paras || [];
  const counters = {};
  let out = '';
  const empty = paras.every((p) => p.runs.every((r) => !r.text && !r.field));
  paras.forEach((p, i) => {
    const first = p.runs[0] || {};
    const style = [
      `text-align:${({ l: 'left', ctr: 'center', r: 'right', just: 'justify' })[p.align] || 'left'}`,
      `padding-left:${px(p.marL || 0)}px`,
      `text-indent:${px(p.indent || 0)}px`,
      `line-height:${1.2 * (p.lineSpacing || 1)}`,
      `margin:${ptToPx(p.spaceBefore || 0)}px 0 ${ptToPx(p.spaceAfter || 0)}px 0`,
    ];
    let bulletAttr = '';
    if (p.bullet) {
      let label = '';
      if (p.bullet.type === 'num') {
        const key = `${p.level || 0}:${p.bullet.scheme}`;
        counters[key] = (counters[key] || (p.bullet.start || 1) - 1) + 1;
        label = numberLabel(p.bullet.scheme, counters[key]);
      } else {
        label = p.bullet.char || '•';
      }
      const bsize = ptToPx(first.size || 18) * (p.bullet.size || 1);
      const bfont = p.bullet.type === 'num' ? fontStack(first.font) : `"${p.bullet.font || 'Arial'}", Arial`;
      bulletAttr = ` data-b="${esc(label)}" style="--bw:${Math.max(0, -px(p.indent || 0))}px;--bs:${bsize}px;--bc:${p.bullet.color || first.color || '#000'};--bf:${esc(bfont)};${style.join(';')}"`;
    } else {
      Object.keys(counters).forEach((k) => { if (k.startsWith(`${p.level || 0}:`)) delete counters[k]; });
    }
    const pAttrs = bulletAttr || ` style="${style.join(';')}"`;
    let inner = '';
    const hasText = p.runs.some((r) => r.text || r.field);
    if (!hasText) {
      if (empty && ctx.prompt && i === 0 && !ctx.editing) {
        inner = `<span class="ph-prompt" style="${runStyle(first)}">${esc(ctx.prompt)}</span>`;
      } else {
        inner = `<span data-r style="${runStyle(first)}"><br data-ph="1"></span>`;
      }
    } else {
      for (const r of p.runs) {
        if (r.field === 'slidenum') {
          const t = String(ctx.slideNumber ?? '#');
          inner += `<span data-r data-atom="${(r.text || '#').length}" contenteditable="false" class="field" style="${runStyle(r)}">${esc(t)}</span>`;
          continue;
        }
        if (!r.text) continue;
        const cls = r.link ? ' class="linked"' : '';
        const parts = r.text.split('\n').map(esc);
        inner += `<span data-r${cls} style="${runStyle(r)}">${parts.join('<br>')}</span>`;
      }
      const last = p.runs[p.runs.length - 1];
      if (last && last.text && last.text.endsWith('\n')) inner += '<br data-ph="1">';
    }
    out += `<p class="tp${p.bullet ? ' bul' : ''}" data-p="${i}"${pAttrs}>${inner}</p>`;
  });
  return out;
}

export function bodyBoxStyle(b, el) {
  const ins = b?.insets || { l: 91440, t: 45720, r: 91440, b: 45720 };
  return {
    paddingLeft: px(ins.l), paddingRight: px(ins.r), paddingTop: px(ins.t), paddingBottom: px(ins.b),
    justifyContent: ({ t: 'flex-start', ctr: 'center', b: 'flex-end' })[b?.anchor || (el?.textbox ? 't' : 'ctr')] || 'flex-start',
    whiteSpace: b?.wrap === false ? 'pre' : 'pre-wrap',
  };
}

// ------------------------------------------------- DOM <-> model positions
function nodeLen(n) {
  if (n.nodeType === 3) return n.nodeValue.length;
  if (n.nodeName === 'BR') return n.dataset && n.dataset.ph ? 0 : 1;
  if (n.dataset && n.dataset.atom) return Number(n.dataset.atom);
  let len = 0;
  for (const c of n.childNodes) len += nodeLen(c);
  return len;
}

function offsetWithin(container, node, offset) {
  // characters before (node, offset) inside container
  let count = 0;
  let done = false;
  const walk = (n) => {
    if (done) return;
    if (n === node) {
      if (n.nodeType === 3) { count += offset; } else {
        for (let i = 0; i < offset && i < n.childNodes.length; i++) count += nodeLen(n.childNodes[i]);
      }
      done = true;
      return;
    }
    if (n.nodeType === 3) { count += n.nodeValue.length; return; }
    if (n.nodeName === 'BR') { count += nodeLen(n); return; }
    if (n.dataset && n.dataset.atom) {
      if (n.contains(node)) { count += offset > 0 ? Number(n.dataset.atom) : 0; done = true; return; }
      count += Number(n.dataset.atom); return;
    }
    for (const c of n.childNodes) walk(c);
  };
  walk(container);
  return count;
}

export function domToPos(root, node, offset) {
  if (!root.contains(node)) return null;
  let p = node.nodeType === 1 ? node : node.parentElement;
  if (p === root) {
    // between paragraphs
    const idx = Math.min(offset, root.children.length - 1);
    const pe = root.children[Math.max(0, idx)];
    if (!pe) return { p: 0, o: 0 };
    if (offset >= root.children.length) return { p: Number(pe.dataset.p), o: nodeLen(pe) };
    return { p: Number(pe.dataset.p), o: 0 };
  }
  p = p.closest('p[data-p]');
  if (!p) return null;
  return { p: Number(p.dataset.p), o: offsetWithin(p, node, offset) };
}

export function posToDom(root, pos) {
  const pe = root.querySelector(`p[data-p="${pos.p}"]`);
  if (!pe) return { node: root, offset: 0 };
  let remaining = pos.o;
  let result = null;
  const walk = (n) => {
    if (result) return;
    if (n.nodeType === 3) {
      const len = n.nodeValue.length;
      if (remaining <= len) { result = { node: n, offset: remaining }; return; }
      remaining -= len;
      return;
    }
    if (n.nodeName === 'BR') {
      const len = nodeLen(n);
      if (len === 0) { if (remaining === 0) result = { node: n.parentNode, offset: [...n.parentNode.childNodes].indexOf(n) }; return; }
      if (remaining === 0) { result = { node: n.parentNode, offset: [...n.parentNode.childNodes].indexOf(n) }; return; }
      remaining -= 1;
      if (remaining === 0) { result = { node: n.parentNode, offset: [...n.parentNode.childNodes].indexOf(n) + 1 }; }
      return;
    }
    if (n.dataset && n.dataset.atom) {
      const len = Number(n.dataset.atom);
      const parent = n.parentNode;
      const idx = [...parent.childNodes].indexOf(n);
      if (remaining === 0) { result = { node: parent, offset: idx }; return; }
      if (remaining <= len) { result = { node: parent, offset: idx + 1 }; remaining = 0; return; }
      remaining -= len;
      return;
    }
    for (const c of n.childNodes) walk(c);
  };
  walk(pe);
  if (!result) {
    // end of paragraph
    const last = pe.lastChild;
    if (last && last.nodeType === 1 && last.lastChild && last.lastChild.nodeType === 3) {
      result = { node: last.lastChild, offset: last.lastChild.nodeValue.length };
    } else {
      result = { node: pe, offset: pe.childNodes.length };
    }
  }
  return result;
}
