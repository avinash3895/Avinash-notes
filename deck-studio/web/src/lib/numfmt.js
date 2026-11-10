// Excel-style number formats used by chart labels (mirrors server/excel.py)
function splitSections(fmt) {
  const parts = []; let cur = ''; let q = false;
  for (const ch of fmt) {
    if (ch === '"') q = !q;
    if (ch === ';' && !q) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function apply(value, section) {
  let prefix = ''; let suffix = ''; let core = ''; let seen = false;
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    let lit = null;
    if (ch === '"') {
      let j = section.indexOf('"', i + 1); if (j < 0) j = section.length;
      lit = section.slice(i + 1, j); i = j;
    } else if (ch === '\\' && i + 1 < section.length) { lit = section[i + 1]; i++; }
    else if ('0#,.%'.includes(ch)) { seen = true; core += ch; continue; }
    else lit = ch;
    if (!seen) prefix += lit; else suffix += lit;
  }
  const percent = core.includes('%');
  core = core.replace(/%/g, '');
  let scale = 0;
  while (core.endsWith(',')) { scale++; core = core.slice(0, -1); }
  let v = value * (percent ? 100 : 1) / 1000 ** scale;
  const decimals = core.includes('.') ? core.split('.')[1].length : 0;
  const grouping = core.includes(',');
  let text = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping });
  if (/^-0(\.0+)?$/.test(text)) text = text.slice(1);
  return prefix + text + (percent ? '%' : '') + suffix;
}

export function formatNumber(value, fmt) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'number') return String(value);
  if (!fmt || fmt === 'General') {
    const r = Math.round(value * 1e9) / 1e9;
    return String(r);
  }
  const sections = splitSections(fmt);
  if (value < 0 && sections.length > 1) return apply(Math.abs(value), sections[1]);
  return apply(sections.length > 1 ? Math.abs(value) : value, sections[0]);
}

export const NUMBER_FORMATS = [
  { label: '1,235', fmt: '#,##0' },
  { label: '1,234.6', fmt: '#,##0.0' },
  { label: '1,234.57', fmt: '#,##0.00' },
  { label: '1235', fmt: '0' },
  { label: '12%', fmt: '0%' },
  { label: '12.3%', fmt: '0.0%' },
  { label: '1.2k (thousands)', fmt: '#,##0.0,"k"' },
  { label: '1.2m (millions)', fmt: '#,##0.0,,"m"' },
  { label: 'As in Excel', fmt: 'General' },
];
