# MTO Field Forms

An offline iPhone app for the AEC MTO field survey forms. It works with no signal, saves every entry on the phone, and exports batches (JSON, CSV, images and printable reports) to OneDrive through the iOS share sheet.

It's a Progressive Web App (PWA): static HTML/JS hosted on GitHub Pages and installed from Safari with **Add to Home Screen**. There's no App Store, no Microsoft login, and no server-side storage.

## Forms

| Form | Template | Highlights |
|---|---|---|
| **Salt Claim** (Field Survey Documentation Sheet) | `templates/MTO Field Survey (Salt Claim).doc` | Conditional water-treatment blocks, property layout sketch |
| **Precon Well Test** (Form 1 + Form 10) | `templates/MTO Preconstruction Well Testing Field Form - Template.doc` | Field chemistry readings, pumping and recovery test log, P.Geo./P.Eng. signature |

[docs/template-analysis.md](docs/template-analysis.md) explains how each paper field maps to the app.

## How it works

```
Safari (iPhone) ── service worker caches the app ──> opens with no signal
     │
     ├─ Forms  (src/js/forms.js: schema transcribed from the templates)
     ├─ Storage (IndexedDB: one JSON record per form, autosaved as you type)
     └─ Export (src/js/export.js) → JSON + CSV + images + report.html
                                     └─> iOS share sheet → OneDrive
```

## Project layout

```
src/                 deployed app (GitHub Pages serves this folder)
  index.html
  css/app.css
  js/app.js          screens and routing: list, editor, export
  js/forms.js        form definitions (edit here to change fields)
  js/fields.js       input widgets: choices, sketch pad, photos, GPS, readings table
  js/db.js           IndexedDB storage
  js/export.js       CSV, JSON, report and share sheet
  sw.js              offline cache
  manifest.webmanifest, icons/
templates/           golden .doc templates (source of truth)
assets/              logo source for the icons
docs/                template analysis, deployment, field guide
scripts/             dev server, icon generator
tests/               node:test unit tests
```

## Development

Requires Node 20 or newer. There are no dependencies to install.

```sh
npm start     # serve src/ at http://localhost:8080
npm test      # run unit tests
npm run icons # rebuild src/icons from assets/aec-logo.png (Windows)
```

To change a form, edit `src/js/forms.js`. Each field is one line, e.g. `{ k: 'depth', label: 'Depth (m btoc)', type: 'number' }`. Types are `text`, `textarea`, `number`, `date`, `time`, `tel`, `email`, `choice`, `multi`, `gps`, `photos`, `sketch`, `signature` and `table`. `showIf` makes a field conditional. Don't rename the `k` of a field that is already in use: existing entries store their data under that key.

## Docs

- [Field guide](docs/field-guide.md): install on iPhone, fill out, export to OneDrive
- [Deployment](docs/deployment.md): GitHub Pages setup and releasing updates
- [Template analysis](docs/template-analysis.md): field-by-field mapping from the paper forms
