import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromUTM, geologyText, lccForward, lookupUnit, parseGeology, toUTM } from '../src/js/geo.js';

// Reference values from PROJ (pyproj 3.7): EPSG:4326 -> EPSG:26917 / 26918 (NAD83 UTM 17N / 18N).
const UTM_REF = [
  [43.65, -79.38, 17, 630644, 4834275], // Toronto
  [46.49, -80.99, 17, 500767, 5148492], // Sudbury
  [42.31, -83.03, 17, 332695, 4686192], // Windsor
  [45.42, -75.70, 18, 445234, 5029847], // Ottawa
  [44.23, -76.48, 18, 381801, 4898484], // Kingston
];

test('UTM matches PROJ to the metre and round-trips', () => {
  for (const [lat, lon, zone, e, n] of UTM_REF) {
    const u = toUTM(lat, lon);
    assert.deepEqual([u.zone, u.easting, u.northing], [zone, e, n]);
    const back = fromUTM(u.zone, u.easting, u.northing);
    assert.ok(Math.abs(back.lat - lat) < 1e-5 && Math.abs(back.lon - lon) < 1e-5);
  }
});

test('Lambert Conformal Conic (Map 2556 grid) matches PROJ', () => {
  const p = { lat1: 49, lat2: 77, lat0: 0, lon0: -92, a: 6378206.4, invf: 294.9786982 };
  const [x, y] = lccForward(43.65, -79.38, p);
  assert.ok(Math.abs(x - 1035980.02) < 0.05 && Math.abs(y - 6086292.49) < 0.05);
});

const meta = JSON.parse(readFileSync(new URL('../src/geology/geology.json', import.meta.url), 'utf8'));
const bin = readFileSync(new URL('../src/geology/units.bin', import.meta.url));
const g = parseGeology(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length));

test('lookup returns the mapped unit at checked locations', () => {
  // Checked by eye against the unit numbers printed on the Map 2556 scan.
  const cases = [
    ['Oakville', 43.50, -79.72, 17], ['Brampton', 43.70, -79.76, 17], ['Guelph', 43.55, -80.25, 14],
    ['Sudbury', 46.49, -80.99, 1], ['Tobermory', 45.25, -81.66, 2],
  ];
  for (const [name, lat, lon, unit] of cases) assert.equal(lookupUnit(g, lat, lon)?.unit, unit, name);
});

test('weak colour matches are flagged for checking, clean ones are not', () => {
  // Milton sits on a stippled blue patch printed between the legend colours: must not claim certainty.
  assert.equal(lookupUnit(g, 43.52, -79.88).certain, false);
  assert.equal(lookupUnit(g, 43.50, -79.72).certain, true); // Oakville, Halton Till
});

test('lookup is null off the map sheet', () => {
  assert.equal(lookupUnit(g, 49.8, -86.5), null);
});

test('all 33 units have descriptions, and the report text follows the boilerplate', () => {
  for (let u = 1; u <= 33; u++) assert.ok(meta.units[u]?.title, `unit ${u}`);
  const t = geologyText(g, 17);
  assert.match(t, /^The Ontario Geological Survey \(OGS, 1991\) Map 2556 mapping indicates that the surficial material within the Site consists of Halton Till \(Ontario-Erie lobe\), which is generally described as predominantly silt/);
  assert.match(t, /\nHalton Till is a fine-grained/);
});
