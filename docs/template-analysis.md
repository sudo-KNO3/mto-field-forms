# Golden template analysis

How the two paper forms in [`templates/`](../templates) were read and mapped to the app's form definitions in [`src/js/forms.js`](../src/js/forms.js).

## Method

1. Converted each `.doc` to `.docx` with Word and parsed `word/document.xml` in order: paragraphs, tables, rows, cells, merged cells (`gridSpan`, `vMerge`), bold runs, symbols, page breaks, headers and footers.
2. Rendered each template to PDF and compared it page by page. This caught content the XML does not hold as text (see Form 10 below).
3. Mapped each printed label to one field. The paper's layout cues (options to circle, indents, ruled lines, blank pages) decide each field's type.

## Common structure

| Aspect | Finding | App treatment |
|---|---|---|
| Page | US Letter, 1" top/bottom and 1.25" side margins, Times New Roman | Printed report uses Letter and Times |
| Header | AEC compass logo, top-left on every page | App icon, app bar, report header (`assets/aec-logo.png`) |
| Footer | Salt Claim only: centred page number | Not reproduced (the browser adds page numbers when printing) |
| Section titles | Paragraph style `Title`, bold caps | Collapsible section cards, in the same order as the paper |
| Label/value rows | Borderless tables; label cell plus an underlined blank cell. Some rows hold two pairs side by side | One field per label. Short numeric pairs sit side by side on the phone (`half`) |
| "A / B" text in a value cell | Printed options for the interviewer to circle | `choice` (one) or `multi` (several) tap buttons. The report prints all options with the chosen one circled |
| Stacked ruled rows with no label | Free-text blocks; the number of rules sets the size | `textarea`; row count matches the paper |
| Indented rows (extra empty first cell) | Sub-questions belonging to the row above | Indented group |
| Blank page or area under a sketch heading | Hand-drawn sketch | Finger-drawing pad (`sketch`) plus photos |

## Form A: Field Survey Documentation Sheet (Salt Claim)

Source: `MTO Field Survey (Salt Claim).doc`. 4 pages, 10 tables, page break before the sketch.

| # | Section | Paper layout | Fields |
|---|---|---|---|
| 1 | General | 5-row table; Owner and Date share row 1 | Property Owner\*, Date\*, AEC Project Number, Address, Telephone, Email (+ GPS, app-only) |
| 2 | Background | 2 rows, then 6 indented sub-rows under "Prior investigations" | Purchased property, Prior investigations → Company, Number of samples, Quantity/Quality Issues, Drink water? **Y/N**, Is water tested?, Number of residents |
| 3 | Property Owner's Statement | 6 ruled lines | Free text (6 rows) |
| 4 | Field Chemistry Data | 5 rows | Colour/Clarity, Odour?, Sediment?, Location, **Raw/Filtered** |
| 5 | Well Description | 4-column grid, 8 rows | Number of wells, **Dug/Drilled**, **Overburden/Bedrock**, Install date, Depth (m btoc), Diameter (mm), Pump rate, Location, Water level (m btoc), Well pit **Y/N**, Stick-up (m), Testing, Problems, Miscellaneous |
| 6 | Land Use | Options row plus 2 ruled lines | **Residential/Agricultural/Commercial** (multi), Neighbours |
| 7 | Surface Drainage | Guidance note plus 3 ruled lines | Free text, with the note shown as a hint |
| 8 | Septic Bed | 3 rows; Location and Age share row 1 | Location, Age, Problems, Pumping frequency |
| 9 | Surficial Geology | 5 ruled lines | Free text (5 rows) |
| 10 | Water Treatment Systems | 12-row table with bold sub-headings and indented rows | **System present Yes/No**. If Yes: Make, Install date, **Services** (Entire system/Kitchen faucet), **Type** (Softener/RO/Distillation/Filtration/UV, multi). Sub-blocks appear only for the types ticked: **Water Softener** (Salt type **NaCl/KCl**, bags/month, backwash), **R.O.** (backwash), **Filtration** (**Cartridge/Greensand/Other**; "specify" if Other; cartridge size µm if Cartridge). **Disinfection** (make, model, location) shows whenever a system is present |
| 11 | Property Layout Sketch | Own page | Sketch pad plus site photos |

## Form B: Form 1, Field Survey Documentation Form (Preconstruction Well Testing)

Source: `MTO Preconstruction Well Testing Field Form - Template.doc`. 5 pages, 14 tables (2 nested), 1 embedded OLE object.

| # | Section | Differences from Form A |
|---|---|---|
| 1 | General | Location\*, Project, Owner\*, Date\*, Person Interviewed, Email, Telephone (+ GPS) |
| 2 | Background | Owned/Tenant since, Current problems?, Water use (# residents), Prior investigations / routine testing? |
| 3 | Property Owner's Statement | 11 ruled lines |
| 4 | Well Description | Same grid, without Testing/Problems/Misc |
| 5–7 | Land Use, Surface Drainage, Septic Bed | 1 Neighbours line; 1 drainage line |
| 8 | Well Location Sketch | Sketch area. In the .doc, the next two sections sit in nested tables inside this sketch table |
| 9 | Surficial Geology | Nested table, 1 ruled line |
| 10 | Field Chemistry Data | Adds **Conductivity (µS/cm)**, **Temperature (°C)** and **pH** in a left column |
| 11 | Water Treatment Systems | Shorter: System present; Type (filter, RO, UV, softener, other), Install date, Services |
| 12 | **Form 10: Pumping Test Documentation** | See below |
| 13 | Deviations & Sign-off | Deviations and rationale (4 lines), Limitations (4 lines), sign-off by **P.Geo./P.Eng.** with Name, Signature and Date |

### Form 10 (embedded object)

After a run of blank paragraphs, page 4 has a bold "Form 10" and then an embedded **CorelDRAW OLE object**. Its only text is in the rendered preview (`image1.wmf`), so a plain text extraction misses the whole sheet. From the rendered page:

- Static Water Level
- Reference Point: ☐ Ground Surface ☐ Casing Top
- Casing Extension Above Ground Surface
- Pumping Start Time / Pumping Stop Time (hh:mm:ss)
- Measurements: two side-by-side grids, **Pumping** and **Recovery**, each with columns *Time (hh:mm:ss)* and *Water Level*, about 34 rows each

App treatment: numeric and time fields, a Reference Point choice, and two repeating tables. **+ Add reading (now)** stamps the current time and each row has a **Now** button, so readings can be logged in real time. There's no fixed row limit. Readings are also exported in long format (`MTO_PumpingTest_*.csv`) for Excel or charting.

## Filled Word export

`scripts/build_templates.py` turns each golden template into a fill-ready template (`src/templates/<form>.json`). It finds each printed label, scoped to its section heading, and puts a `{{tag}}` in the cell where a person would write. On the phone, `src/js/docx.js` fills the tags and writes a real `.docx`. The header logo, fonts, borders, page layout and page numbers all come from the original.

| On paper | In the filled .docx |
|---|---|
| Blank underlined cell | Value typed on the line |
| `_____` placeholder text | Value on a real underline, aligned with its label |
| "A / B" to circle | All options printed; the chosen one **bold and boxed** |
| Ruled lines | Text wrapped line by line onto the rules; overflow continues on the last line |
| Sketch area | The sketch, scaled to fit; blank area kept if there's no sketch |
| Form 10 (CorelDRAW picture) | Rebuilt as a native Word table in the same layout (Arial). The reading grid shows at least 30 rows and grows with more readings; its header repeats on following pages |
| Signature line | Signature image |
| (none) | App additions: a *GPS Coordinates* row under General, and a *Site Photographs* page at the end |

Changes to the paper layout, all intentional:

- Form 10 labels carry units ("Static Water Level (m)").
- Page breaks before the sketch, Form 10 and Deviations pages are set as paragraph properties, so filled content can't create blank pages.
- "Sign off by P.Geo. / P. Eng." shows the chosen designation boxed.

## App-only additions

These are marked "· app" in the form and are not on the paper:

- **GPS location** (General). Captures lat/lon and accuracy.
- **Site photos** (with each sketch). Resized to at most 1600 px so storage stays small.

## Judgement calls to confirm

- **Required fields**: only owner, date and (Precon) location. Everything else is optional, as on paper. A form missing a required field can still be saved as a draft.
- **Dates of installation** are free text, because owners often give "approx. 1990".
- **Salt Claim "Disinfection"** shows for any installed system, because the paper's Type list has UV but no separate disinfection option.
- **Precon water treatment "Type"** is a free-text line on paper. The app offers the five listed types as buttons plus a free-text "Other / details".
