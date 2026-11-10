// Text engine checks. Run:  node tests/text.test.mjs
import assert from 'node:assert/strict';
import * as T from '../web/src/lib/text.js';
import { body, para } from '../web/src/lib/model.js';

const txt = (b) => b.paras.map((p) => p.runs.map((r) => r.text).join('')).join('|');
let b = body([para('Hello world')]);

let r = T.insertText(b, { start: { p: 0, o: 5 }, end: { p: 0, o: 5 } }, ',');
assert.equal(txt(r.body), 'Hello, world');
assert.deepEqual(r.pos, { p: 0, o: 6 });

r = T.splitParagraph(r.body, { p: 0, o: 6 });
assert.equal(txt(r.body), 'Hello,| world');
r = T.deleteBackward(r.body, { p: 1, o: 0 });
assert.equal(txt(r.body), 'Hello, world');

const bold = T.applyRunProps(r.body, { start: { p: 0, o: 7 }, end: { p: 0, o: 12 } }, { bold: true });
assert.equal(bold.paras[0].runs.length, 2);
assert.equal(bold.paras[0].runs[1].text, 'world');
assert.equal(bold.paras[0].runs[1].bold, true);
assert.equal(T.commonRunProps(bold, { start: { p: 0, o: 0 }, end: { p: 0, o: 12 } }).bold, '');

const del = T.deleteRange(bold, { p: 0, o: 3 }, { p: 0, o: 9 });
assert.equal(txt(del.body), 'Helrld');

const multi = T.insertText(b, { start: { p: 0, o: 11 }, end: { p: 0, o: 11 } }, '\nline 2\nline 3');
assert.equal(txt(multi.body), 'Hello world|line 2|line 3');

const rep = T.replaceAll(multi.body, 'line', 'row', false);
assert.equal(rep.count, 2);
assert.equal(txt(rep.body), 'Hello world|row 2|row 3');

assert.equal(txt(T.changeCase(b, null, 'upper')), 'HELLO WORLD');
assert.equal(txt(T.changeCase(b, null, 'title')), 'Hello World');
console.log('text engine: all checks passed');
