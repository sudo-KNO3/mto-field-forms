import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExport, entryBase, toCsv } from '../src/js/export.js';

const templates = Object.fromEntries(['salt', 'precon'].map((id) => [id, JSON.parse(readFileSync(new URL(`../src/templates/${id}.json`, import.meta.url)))]));

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const salt = {
  id: 'aaaa1111-2222', formId: 'salt', createdAt: '2026-09-30T14:00:00.000Z', updatedAt: '2026-09-30T15:00:00.000Z',
  complete: true, exportedAt: null,
  data: {
    owner: 'Jane Smith', date: '2026-09-30', address: '12 Concession Rd, "North"',
    systemPresent: 'No', wtType: ['Water softener'], saltType: 'NaCl', // hidden: system not present
    landUse: ['Residential', 'Agricultural'], layoutSketch: PNG, photos: [PNG, PNG],
  },
};
const precon = {
  id: 'bbbb2222-3333', formId: 'precon', createdAt: '2026-09-30T14:00:00.000Z', updatedAt: '2026-09-30T15:00:00.000Z',
  complete: false, exportedAt: null,
  data: { owner: 'Bob Lee', location: 'Hwy 7 Lot 3', date: '2026-09-30', pumping: [{ t: '10:00:00', wl: '3.21' }, { t: '10:05:00', wl: '3.40' }], recovery: [] },
};

test('toCsv quotes commas, quotes and newlines and adds a BOM', () => {
  assert.equal(toCsv([['a', 'b,c', 'say "hi"', 'x\ny']]), '﻿a,"b,c","say ""hi""","x\ny"');
});

test('entryBase is filesystem-safe', () => {
  assert.equal(entryBase(salt), 'SaltClaimForm_2026-09-30_Jane-Smith_aaaa');
});

test('buildExport produces json, per-form csv, pumping csv, images and Word files', async () => {
  const { files, summary } = buildExport([salt, precon], { templates });
  const names = files.map((f) => f.name);
  assert.match(names[0], /^MTO_export_.*\.json$/);
  assert.ok(names.some((n) => /^MTO_SaltClaimForm_.*\.csv$/.test(n)));
  assert.ok(names.some((n) => /^MTO_MTOFieldForm_.*\.csv$/.test(n)));
  assert.ok(names.some((n) => /^MTO_PumpingTest_.*\.csv$/.test(n)));
  assert.ok(names.includes('SaltClaimForm_2026-09-30_Jane-Smith_aaaa_layoutSketch.png'));
  assert.ok(names.includes('SaltClaimForm_2026-09-30_Jane-Smith_aaaa_photos-2.png'));
  assert.equal(names.filter((n) => n.endsWith('.docx')).length, 2);
  assert.equal(summary.count, 2);

  const json = JSON.parse(await files[0].text());
  const s = json.entries.find((e) => e.id === salt.id);
  assert.equal(s.data.saltType, undefined, 'hidden fields are not exported');
  assert.deepEqual(s.data.photos, ['SaltClaimForm_2026-09-30_Jane-Smith_aaaa_photos-1.png', 'SaltClaimForm_2026-09-30_Jane-Smith_aaaa_photos-2.png']);

  const pump = await files.find((f) => f.name.startsWith('MTO_PumpingTest_')).text();
  assert.match(pump, /bbbb2222-3333,Bob Lee,Hwy 7 Lot 3,Pumping,2,10:05:00,3\.40/);

  const csv = await files.find((f) => f.name.startsWith('MTO_SaltClaimForm_')).text();
  assert.match(csv, /Land Use: Land use/);
  assert.match(csv, /Residential; Agricultural/);
  assert.match(csv, /"12 Concession Rd, ""North"""/);
});

test('buildExport can leave out media, and skips Word files without a template', () => {
  const { files } = buildExport([salt], { includeMedia: false });
  assert.deepEqual(files.map((f) => f.name.split('_')[1]), ['export', 'SaltClaimForm']);
});
