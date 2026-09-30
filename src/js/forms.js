// Form definitions, transcribed from the Golden Templates (.doc) in section order.
// Field types: text, textarea, date, time, number, tel, email, choice (circle one),
// multi (circle any), location (UTM), geounit (mapped surficial unit), photos, sketch,
// signature, table (repeating rows). `docx: false` = app-only, not printed on the form.
// `showIf` hides a field/group unless other fields match: {k, eq} / {k, has}, or an array of them.

const wellDescription = (extra = []) => ({
  title: 'Well Description',
  fields: [
    { k: 'numWells', label: 'Number of wells', type: 'number', half: true },
    { k: 'dugDrilled', label: 'Dug / Drilled', type: 'choice', options: ['Dug', 'Drilled'] },
    { k: 'overburdenBedrock', label: 'Overburden / Bedrock', type: 'choice', options: ['Overburden', 'Bedrock'] },
    { k: 'wellInstallDate', label: 'Date of installation', type: 'text', half: true },
    { k: 'depth', label: 'Depth (m btoc)', type: 'number', half: true },
    { k: 'diameter', label: 'Diameter (mm)', type: 'number', half: true },
    { k: 'pumpRate', label: 'Pump rate', type: 'text', half: true },
    { k: 'wellLocation', label: 'Location', type: 'text' },
    { k: 'waterLevel', label: 'Water level (m btoc)', type: 'number', half: true },
    { k: 'stickUp', label: 'Stick-up (m)', type: 'number', half: true },
    { k: 'wellPit', label: 'Well Pit (y / n)', type: 'choice', options: ['Y', 'N'] },
    ...extra,
  ],
});

const landUse = (neighbourRows) => ({
  title: 'Land Use',
  fields: [
    { k: 'landUse', label: 'Land use', type: 'multi', options: ['Residential', 'Agricultural', 'Commercial'] },
    { k: 'neighbours', label: 'Neighbours', type: 'textarea', rows: neighbourRows },
  ],
});

const surfaceDrainage = (rows) => ({
  title: 'Surface Drainage',
  fields: [{
    k: 'drainage', label: 'Surface drainage', type: 'textarea', rows,
    hint: 'e.g., drainage direction and slope; culvert locations, type, and size; presence of standing or running water; ditch vegetation; etc.',
  }],
});

const septicBed = {
  title: 'Septic Bed',
  fields: [
    { k: 'septicLocation', label: 'Location', type: 'text' },
    { k: 'septicAge', label: 'Age', type: 'text', half: true },
    { k: 'pumpingFreq', label: 'Pumping Frequency', type: 'text', half: true },
    { k: 'septicProblems', label: 'Problems', type: 'textarea', rows: 2 },
  ],
};

const fieldChemistry = (readings = []) => ({
  title: 'Field Chemistry Data',
  fields: [
    ...readings,
    { k: 'colour', label: 'Colour / Clarity', type: 'text' },
    { k: 'odour', label: 'Odour?', type: 'text' },
    { k: 'sediment', label: 'Sediment?', type: 'text' },
    { k: 'chemLocation', label: 'Location', type: 'text', hint: 'Sample point, e.g. kitchen tap' },
    { k: 'rawFiltered', label: 'Raw / Filtered', type: 'choice', options: ['Raw', 'Filtered'] },
  ],
});

const gps = { k: 'gps', label: 'Location (UTM, NAD83)', type: 'location', app: true };

// Surficial Geology: unit looked up from the location on OGS Map 2556, then the pre-written description.
const surficialGeology = (rows, extra = {}) => ({
  title: 'Surficial Geology', ...extra,
  fields: [
    { k: 'geoUnit', label: 'Mapped surficial unit (OGS Map 2556)', type: 'geounit', app: true, docx: false },
    { k: 'geology', label: 'Surficial geology', type: 'textarea', rows, bare: true },
  ],
});

export const FORMS = {
  salt: {
    id: 'salt',
    title: 'Field Survey Documentation Sheet',
    short: 'Salt Claim',
    template: 'MTO Field Survey (Salt Claim).doc',
    summary: ['owner', 'address'],
    pageNumbers: true,
    sections: [
      {
        title: 'General',
        fields: [
          { k: 'owner', label: 'Property Owner', type: 'text', required: true },
          { k: 'date', label: 'Date', type: 'date', required: true, today: true },
          { k: 'aecProject', label: 'AEC Project Number', type: 'text' },
          { k: 'address', label: 'Address', type: 'text' },
          { k: 'phone', label: 'Telephone Number', type: 'tel' },
          { k: 'email', label: 'Email', type: 'email' },
          gps,
        ],
      },
      {
        title: 'Background',
        fields: [
          { k: 'purchased', label: 'Purchased property', type: 'text' },
          { k: 'priorInvestigations', label: 'Prior investigations', type: 'text' },
          {
            group: true, indent: true, fields: [
              { k: 'company', label: 'Company', type: 'text' },
              { k: 'numSamples', label: 'Number of samples', type: 'number', half: true },
              { k: 'numResidents', label: 'Number of Residents', type: 'number', half: true },
              { k: 'qqIssues', label: 'Quantity / Quality Issues', type: 'textarea', rows: 2 },
              { k: 'residentsDrink', label: 'Do Residents Drink Water?', type: 'choice', options: ['Y', 'N'] },
              { k: 'waterTested', label: 'Is Water Tested?', type: 'text' },
            ],
          },
        ],
      },
      { title: "Property Owner's Statement", fields: [{ k: 'statement', label: "Property owner's statement", type: 'textarea', rows: 6, bare: true }] },
      fieldChemistry(),
      wellDescription([
        { k: 'testing', label: 'Testing', type: 'text' },
        { k: 'wellProblems', label: 'Problems', type: 'textarea', rows: 2 },
        { k: 'misc', label: 'Miscellaneous', type: 'textarea', rows: 2 },
      ]),
      landUse(2),
      surfaceDrainage(3),
      septicBed,
      surficialGeology(5),
      {
        title: 'Water Treatment Systems',
        fields: [
          { k: 'systemPresent', label: 'System present', type: 'choice', options: ['Yes', 'No'], bold: true },
          {
            group: true, indent: true, showIf: { k: 'systemPresent', eq: 'Yes' }, fields: [
              { k: 'wtMake', label: 'Make', type: 'text' },
              { k: 'wtInstallDate', label: 'Date of installation', type: 'text' },
              { k: 'services', label: 'Services', type: 'choice', options: ['Entire system', 'Kitchen faucet'] },
              { k: 'wtType', label: 'Type', type: 'multi', options: ['Water softener', 'Reverse Osmosis', 'Distillation', 'Filtration', 'UV'] },
            ],
          },
          {
            group: true, title: 'Water Softener', showIf: [{ k: 'systemPresent', eq: 'Yes' }, { k: 'wtType', has: 'Water softener' }], fields: [
              { k: 'saltType', label: 'Salt type', type: 'choice', options: ['NaCl', 'KCl'] },
              { k: 'bagsPerMonth', label: 'Number of bags used per month', type: 'number' },
              { k: 'softenerBackwash', label: 'Backwash frequency, volume, & discharge location', type: 'textarea', rows: 2 },
            ],
          },
          {
            group: true, title: 'R.O.', showIf: [{ k: 'systemPresent', eq: 'Yes' }, { k: 'wtType', has: 'Reverse Osmosis' }], fields: [
              { k: 'roBackwash', label: 'Backwash frequency, volume, & discharge location', type: 'textarea', rows: 2 },
            ],
          },
          {
            group: true, title: 'Filtration', showIf: [{ k: 'systemPresent', eq: 'Yes' }, { k: 'wtType', has: 'Filtration' }], fields: [
              { k: 'filtrationType', label: 'Filter type', type: 'choice', options: ['Cartridge', 'Greensand', 'Other'] },
              { k: 'filtrationOther', label: 'Other (specify)', type: 'text', showIf: { k: 'filtrationType', eq: 'Other' } },
              { k: 'cartridgeSize', label: 'Cartridge size (µm)', type: 'text', showIf: { k: 'filtrationType', eq: 'Cartridge' } },
            ],
          },
          {
            group: true, title: 'Disinfection', showIf: { k: 'systemPresent', eq: 'Yes' }, fields: [
              { k: 'disinfection', label: 'Make, model, & location', type: 'text' },
            ],
          },
        ],
      },
      {
        title: 'Property Layout Sketch', pageBreak: true,
        fields: [
          { k: 'layoutSketch', label: 'Property layout sketch', type: 'sketch', bare: true },
          { k: 'photos', label: 'Site photos', type: 'photos', app: true },
        ],
      },
    ],
  },

  precon: {
    id: 'precon',
    title: 'Form 1 - Field Survey Documentation Form',
    short: 'Precon Well Test',
    template: 'MTO Preconstruction Well Testing Field Form - Template.doc',
    summary: ['owner', 'location'],
    sections: [
      {
        title: 'General',
        fields: [
          { k: 'location', label: 'Location', type: 'text', required: true },
          { k: 'project', label: 'Project', type: 'text' },
          { k: 'owner', label: 'Owner', type: 'text', required: true },
          { k: 'date', label: 'Date', type: 'date', required: true, today: true },
          { k: 'interviewed', label: 'Person Interviewed', type: 'text' },
          { k: 'email', label: 'Email', type: 'email' },
          { k: 'phone', label: 'Telephone Number', type: 'tel' },
          gps,
        ],
      },
      {
        title: 'Background',
        fields: [
          { k: 'ownedSince', label: 'Owned Property / Tenant Since', type: 'text' },
          { k: 'currentProblems', label: 'Current Problems?', type: 'textarea', rows: 2 },
          { k: 'waterUse', label: 'Water Use (# of residents)', type: 'number' },
          { k: 'priorTesting', label: 'Prior investigations / Routine Testing?', type: 'text' },
        ],
      },
      { title: "Property Owner's Statement", fields: [{ k: 'statement', label: "Property owner's statement", type: 'textarea', rows: 11, bare: true }] },
      wellDescription(),
      landUse(1),
      surfaceDrainage(2),
      septicBed,
      {
        title: 'Well Location Sketch',
        fields: [
          { k: 'wellSketch', label: 'Well location sketch', type: 'sketch', bare: true },
          { k: 'photos', label: 'Site photos', type: 'photos', app: true },
        ],
      },
      surficialGeology(2, { pageBreak: true }),
      fieldChemistry([
        { k: 'conductivity', label: 'Conductivity (µS/cm)', type: 'number', half: true },
        { k: 'temperature', label: 'Temperature (°C)', type: 'number', half: true },
        { k: 'ph', label: 'pH', type: 'number', half: true, step: '0.01' },
      ]),
      {
        title: 'Water Treatment Systems',
        fields: [
          { k: 'systemPresent', label: 'System present', type: 'choice', options: ['Yes', 'No'], bold: true },
          {
            group: true, indent: true, showIf: { k: 'systemPresent', eq: 'Yes' }, fields: [
              { k: 'wtType', label: 'Type (filter, RO, UV, softener, other)', type: 'multi', options: ['Filter', 'RO', 'UV', 'Softener', 'Other'] },
              { k: 'wtTypeOther', label: 'Other / details', type: 'text' },
              { k: 'wtInstallDate', label: 'Date of installation', type: 'text' },
              { k: 'services', label: 'Services', type: 'choice', options: ['Entire system', 'Kitchen faucet'] },
            ],
          },
        ],
      },
      {
        title: 'Form 10 - Pumping Test Documentation', pageBreak: true,
        fields: [
          { k: 'staticWL', label: 'Static Water Level (m)', type: 'number', half: true },
          { k: 'casingExt', label: 'Casing Extension Above Ground Surface (m)', type: 'number', half: true },
          { k: 'refPoint', label: 'Reference Point', type: 'choice', options: ['Ground Surface', 'Casing Top'] },
          { k: 'pumpStart', label: 'Pumping Start Time', type: 'time', half: true },
          { k: 'pumpStop', label: 'Pumping Stop Time', type: 'time', half: true },
          { k: 'pumping', label: 'Measurements - Pumping', type: 'table', cols: [{ k: 't', label: 'Time (hh:mm:ss)', type: 'time' }, { k: 'wl', label: 'Water Level', type: 'number' }] },
          { k: 'recovery', label: 'Measurements - Recovery', type: 'table', cols: [{ k: 't', label: 'Time (hh:mm:ss)', type: 'time' }, { k: 'wl', label: 'Water Level', type: 'number' }] },
        ],
      },
      {
        title: 'Deviations & Sign-off', pageBreak: true,
        fields: [
          { k: 'deviations', label: 'Deviations from testing procedures and rationale', type: 'textarea', rows: 4 },
          { k: 'limitations', label: 'Limitations of results based on abovementioned deviation', type: 'textarea', rows: 4 },
          { k: 'signDesignation', label: 'Sign off by', type: 'choice', options: ['P.Geo.', 'P.Eng.'] },
          { k: 'signName', label: 'Name', type: 'text' },
          { k: 'signature', label: 'Signature', type: 'signature' },
          { k: 'signDate', label: 'Date', type: 'date' },
        ],
      },
    ],
  },
};

// Flatten a form into leaf fields (groups expanded), carrying inherited showIf.
export function leafFields(form) {
  const out = [];
  const walk = (fields, conds, section) => {
    for (const f of fields) {
      const c = f.showIf ? [...conds, ...[].concat(f.showIf)] : conds;
      if (f.group) walk(f.fields, c, f.title ? `${section} - ${f.title}` : section);
      else out.push({ ...f, conds: c, section });
    }
  };
  form.sections.forEach((s) => walk(s.fields, [], s.title));
  // `photos` appears once per form; dedupe by key just in case.
  return out.filter((f, i) => out.findIndex((g) => g.k === f.k) === i);
}

export function condMet(cond, data) {
  const v = data[cond.k];
  if ('eq' in cond) return v === cond.eq;
  if ('has' in cond) return Array.isArray(v) && v.includes(cond.has);
  return true;
}

export const visible = (conds, data) => (conds || []).every((c) => condMet(c, data));
