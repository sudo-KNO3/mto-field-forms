# Changelog

## 1.2.1 (2026-09-30)

- Export fills in the surficial geology description for forms that have a location but an empty Surficial Geology section (e.g. forms started before 1.2.0).
- Updates now apply the first time the app is opened with signal (previously it took a second launch).

## 1.2.0 (2026-09-30)

- Location is recorded in **UTM (NAD83)**: GPS capture or manual zone/easting/northing entry. The Word form and CSV carry UTM (the CSV also has latitude/longitude).
- **Surficial geology from the location, offline.** The site's unit is looked up on OGS Map 2556 (1:1,000,000), bundled with the app. The report sentence and the pre-written unit description from the team's Quaternary Geology document are filled in automatically. The app shows the actual map around the site so the unit can be confirmed or changed.
- Long free text in the Word form continues on added ruled lines, and form sections stay together on one page.

## 1.1.0 (2026-09-30)

- Export now includes each form as its golden Word template filled in (.docx). Choices are boxed, sketches, signatures and photos are embedded, and Form 10 is rebuilt as a native table that grows with the readings. This replaces the HTML report file.
- **Word** button in the form editor to share one filled form.
- Template builder (`npm run templates`) and tests to check that every app field has a place in the template.

## 1.0.0 (2026-09-30)

- Salt Claim and Precon Well Test forms, transcribed from the golden templates, including the Form 10 pumping-test sheet that is embedded as an object in the Precon template.
- Offline use through a service worker; autosave to IndexedDB.
- Circle-one choices, conditional water-treatment blocks, sketch and signature pad, photos, GPS, timed pumping and recovery readings.
- Export to JSON, CSV (per form plus pumping readings), images and printable report HTML through the iOS share sheet; exported entries are tracked.
- Print / PDF view laid out like the paper form.
