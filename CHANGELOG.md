# Changelog

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
