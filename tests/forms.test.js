import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMS, leafFields, visible } from '../src/js/forms.js';

// Section order must match the paper templates (see docs/template-analysis.md).
const EXPECTED_SECTIONS = {
  salt: ['General', 'Background', "Property Owner's Statement", 'Field Chemistry Data', 'Well Description', 'Land Use',
    'Surface Drainage', 'Septic Bed', 'Surficial Geology', 'Water Treatment Systems', 'Property Layout Sketch'],
  precon: ['General', 'Background', "Property Owner's Statement", 'Well Description', 'Land Use', 'Surface Drainage',
    'Septic Bed', 'Well Location Sketch', 'Surficial Geology', 'Field Chemistry Data', 'Water Treatment Systems',
    'Form 10 - Pumping Test Documentation', 'Deviations & Sign-off'],
};

for (const form of Object.values(FORMS)) {
  test(`${form.id}: sections follow the template order`, () => {
    assert.deepEqual(form.sections.map((s) => s.title), EXPECTED_SECTIONS[form.id]);
  });

  test(`${form.id}: field keys are unique`, () => {
    const keys = [];
    const walk = (fs) => fs.forEach((f) => (f.group ? walk(f.fields) : keys.push(f.k)));
    form.sections.forEach((s) => walk(s.fields));
    assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
  });

  test(`${form.id}: showIf targets exist and choices have options`, () => {
    const leaves = leafFields(form);
    const keys = new Set(leaves.map((f) => f.k));
    for (const f of leaves) {
      for (const c of f.conds) assert.ok(keys.has(c.k), `${f.k} depends on unknown field ${c.k}`);
      if (f.type === 'choice' || f.type === 'multi') assert.ok(f.options?.length >= 2, `${f.k} needs options`);
    }
  });

  test(`${form.id}: list-summary fields exist`, () => {
    const keys = leafFields(form).map((f) => f.k);
    for (const k of form.summary) assert.ok(keys.includes(k), `${k} missing`);
  });
}

test('salt: water softener block only shows when system present and softener selected', () => {
  const f = leafFields(FORMS.salt).find((x) => x.k === 'saltType');
  assert.equal(visible(f.conds, {}), false);
  assert.equal(visible(f.conds, { systemPresent: 'Yes', wtType: ['UV'] }), false);
  assert.equal(visible(f.conds, { systemPresent: 'No', wtType: ['Water softener'] }), false);
  assert.equal(visible(f.conds, { systemPresent: 'Yes', wtType: ['UV', 'Water softener'] }), true);
});

test('precon: Form 10 pumping test captured from the embedded object', () => {
  const keys = leafFields(FORMS.precon).map((f) => f.k);
  for (const k of ['staticWL', 'refPoint', 'casingExt', 'pumpStart', 'pumpStop', 'pumping', 'recovery', 'signName', 'signature'])
    assert.ok(keys.includes(k), `missing ${k}`);
});
