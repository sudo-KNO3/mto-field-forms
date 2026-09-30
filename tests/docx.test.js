import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fillDocument, imageSize, wrap } from '../src/js/docx.js';

const template = (id) => JSON.parse(readFileSync(new URL(`../src/templates/${id}.json`, import.meta.url)));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Pull a stored (uncompressed) part back out of the zip the filler wrote.
function readPart(zipBytes, name) {
  const buf = Buffer.from(zipBytes);
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const size = buf.readUInt32LE(i + 18);
    const nlen = buf.readUInt16LE(i + 26);
    const n = buf.toString('utf8', i + 30, i + 30 + nlen);
    const start = i + 30 + nlen;
    if (n === name) return buf.subarray(start, start + size);
    i = start + size;
  }
  return null;
}

test('wrap splits on width and keeps explicit newlines', () => {
  assert.deepEqual(wrap('aaa bbb ccc', 7), ['aaa bbb', 'ccc']);
  assert.deepEqual(wrap('one\ntwo', 50), ['one', 'two']);
});

test('imageSize reads PNG dimensions', () => {
  const bytes = Buffer.from(PNG.split(',')[1], 'base64');
  assert.deepEqual(imageSize(new Uint8Array(bytes)), { w: 1, h: 1 });
});

test('salt: every tag is filled, values and circled choices land in the document', () => {
  const entry = {
    id: 'aaaa1111', formId: 'salt', createdAt: '2026-09-30T14:00:00Z', updatedAt: '2026-09-30T15:00:00Z',
    data: {
      owner: 'Jane Smith & Sons', date: '2026-09-30', dugDrilled: 'Drilled', landUse: ['Residential'],
      statement: 'Water turned salty in spring. '.repeat(20), systemPresent: 'Yes', wtType: ['Water softener'], saltType: 'KCl',
      layoutSketch: PNG, photos: [PNG], gps: { lat: 43.65, lon: -79.38, acc: 5 },
    },
  };
  const zip = fillDocument(template('salt'), entry);
  const doc = readPart(zip, 'word/document.xml').toString('utf8');
  assert.ok(!doc.includes('{{'), 'no tags left');
  assert.ok(doc.includes('Jane Smith &amp; Sons'));
  assert.ok(doc.includes('Zone 17T  630644 m E  4834275 m N (NAD83, ±5 m)'), 'location printed in UTM');
  assert.ok(doc.includes('UTM (NAD83):'));
  assert.ok((doc.match(/spring\./g) || []).length >= 20, 'long statement kept in full on added ruled lines');
  assert.match(doc, /<w:bdr [^>]*\/><\/w:rPr><w:t xml:space="preserve"> Drilled /);
  assert.match(doc, / KCl /);
  assert.ok(doc.includes('SITE PHOTOGRAPHS'));
  assert.equal((doc.match(/<w:drawing>/g) || []).length, 2, 'sketch + 1 photo');
  assert.ok(readPart(zip, 'word/media/mto1.png'));
  assert.match(readPart(zip, 'word/_rels/document.xml.rels').toString(), /rIdMto2/);
});

test('precon: Form 10 grid grows past the printed rows and hidden fields stay blank', () => {
  const pumping = Array.from({ length: 35 }, (_, i) => ({ t: `10:${String(i).padStart(2, '0')}:00`, wl: (3 + i / 100).toFixed(2) }));
  const entry = {
    id: 'bbbb2222', formId: 'precon', createdAt: '2026-09-30T14:00:00Z', updatedAt: '2026-09-30T15:00:00Z',
    data: { owner: 'Bob Lee', location: 'Hwy 7', systemPresent: 'No', wtInstallDate: '1999', refPoint: 'Casing Top', pumping, signature: PNG },
  };
  const doc = readPart(fillDocument(template('precon'), entry), 'word/document.xml').toString('utf8');
  assert.ok(!doc.includes('{{'));
  assert.ok(doc.includes('10:34:00') && doc.includes('3.34'));
  assert.ok(!doc.includes('1999'), 'treatment details hidden when no system');
  assert.ok(doc.includes('☒ Casing Top') && doc.includes('☐ Ground Surface'));
  assert.ok(!doc.includes('CorelDraw'), 'embedded drawing replaced');
});

test('every app field has a place in its Word template', async () => {
  const { FORMS, leafFields } = await import('../src/js/forms.js');
  for (const id of Object.keys(FORMS)) {
    const placed = new Set(template(id).placed);
    const missing = leafFields(FORMS[id]).filter((f) => f.docx !== false).map((f) => f.k).filter((k) => !placed.has(k));
    assert.deepEqual(missing, [], `${id}: add these to scripts/build_templates.py`);
  }
});

test('ruled rows in nested tables (Precon geology) grow without breaking the table XML', () => {
  const entry = { id: 'cccc3333', formId: 'precon', createdAt: '2026-09-30T14:00:00Z', updatedAt: '2026-09-30T15:00:00Z',
    data: { owner: 'A', location: 'B', geology: 'Silty clay till. '.repeat(40) } };
  const doc = readPart(fillDocument(template('precon'), entry), 'word/document.xml').toString('utf8');
  for (const tag of ['w:tbl', 'w:tr', 'w:tc', 'w:p']) {
    const open = (doc.match(new RegExp(`<${tag}(?: [^>]*)?(?<!/)>`, 'g')) || []).length; // not self-closing
    const close = (doc.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    assert.equal(open, close, `<${tag}> balanced`);
  }
  assert.ok((doc.match(/till\./g) || []).length >= 40);
  assert.ok(!/<\/w:tbl><\/w:tc>/.test(doc), 'Word requires every table cell to end with a paragraph');
});
