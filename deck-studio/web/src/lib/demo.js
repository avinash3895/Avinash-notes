// A small starter deck: title, the main plan-comparison chart linked to the
// sample Excel file, a slide with a linked number, and a table.
import { post } from './api.js';
import { newDeck, slideFromLayout, chartEl, textbox, body, para, defaultRun, table, EMU_PER_IN, uid } from './model.js';

export async function buildDemoDeck() {
  const d = newDeck('Plan review X');
  const L = (id) => d.layouts.find((l) => l.id === id);
  const IN = EMU_PER_IN;
  let files = [];
  try { files = (await post('/api/samples')).files; } catch (e) { files = []; }
  const src = files[0] ? uid('x') : null;
  if (src) d.links.sources[src] = { path: files[0] };

  // 1. title
  const s1 = d.slides[0];
  s1.elements.find((e) => e.placeholder === 'title').text.paras[0].runs[0].text = 'Plan review X';
  s1.elements.find((e) => e.placeholder === 'subtitle').text.paras[0].runs[0].text = 'Prior plan vs current plan, 2025-2030';

  // 2. main chart
  const s2 = slideFromLayout(L('titleonly'));
  s2.elements[0].text.paras[0].runs[0].text = 'Current plan is ahead of prior plan in every year';
  const ch = chartEl('plan_comparison', Math.round(0.5 * IN), Math.round(1.45 * IN), d.size.w - IN, Math.round(5.3 * IN), { name: 'Plan comparison' });
  if (src) ch.link = { source: src, sheet: 'Plan', table: 'PlanBySegment' };
  s2.elements.push(ch);

  // 3. text with linked number
  const s3 = slideFromLayout(L('content'));
  s3.elements[0].text.paras[0].runs[0].text = 'Key messages';
  const bodyEl = s3.elements[1];
  const bp = bodyEl.text.paras[0];
  const mk = (runs) => ({ ...JSON.parse(JSON.stringify(bp)), runs: runs.map((r) => defaultRun({ ...bp.runs[0], ...r })) });
  bodyEl.text.paras = [
    mk([{ text: 'Current plan totals ' }, src ? { text: '0', bold: true, color: '#00778B', link: { source: src, sheet: 'Plan', ref: 'Total_Current', format: '#,##0' } } : { text: '...' }, { text: ' across the six years' }]),
    mk([{ text: 'Growth versus prior plan: ' }, src ? { text: '0%', bold: true, color: '#00778B', link: { source: src, sheet: 'Plan', ref: 'Growth', format: '0.0%' } } : { text: '...' }]),
    mk([{ text: 'Segment X drives most of the uplift; Y and Z are broadly in line' }]),
    mk([{ text: 'Numbers in teal are linked to Excel: save the workbook, then Data › Refresh Slide' }]),
  ];

  // 4. table
  const s4 = slideFromLayout(L('titleonly'));
  s4.elements[0].text.paras[0].runs[0].text = 'Plan by segment';
  const t = table(4, 4, Math.round(0.5 * IN), Math.round(1.6 * IN), Math.round(8 * IN));
  const data = [['Segment', 'Prior', 'Current', 'Change'], ['X', '64', '74', '+10'], ['Y', '37', '40', '+3'], ['Z', '20', '22', '+2']];
  t.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
    cell.text.paras[0].runs[0].text = data[r][c];
    if (c > 0) cell.text.paras[0].align = 'r';
  }));
  s4.elements.push(t);
  const note = textbox(Math.round(0.5 * IN), Math.round(3.4 * IN), Math.round(8 * IN), Math.round(0.4 * IN),
    body([para('Source: Plan Data 01.xlsx (sample). Replace with your own file via Data › Edit Links.', { size: 10, color: '#595959', italic: true })]));
  s4.elements.push(note);

  d.slides.push(s2, s3, s4);
  return d;
}
