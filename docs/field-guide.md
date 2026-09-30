# Field guide (iPhone)

## Install (once, about 2 minutes)

1. Open the app link in **Safari**. It must be Safari; Chrome on iPhone can't install it.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open it from the home screen once while you have signal. That caches it for offline use.
4. Check it: turn on **Airplane Mode**, open the app, start a form, type something, close the app, reopen it. Your entry should still be there.

## Filling out forms

- Tap **New Salt Claim Form** or **New MTO Field Form**.
- Everything saves as you type. The top-right corner shows **Saved**. You can close the app at any time.
- Tap a section heading to open or close it. The number on the right shows fields filled / total.
- On-paper "circle one" choices are buttons. Tap to select; tap again to clear.
- **Sketch / Signature**: tap the box and draw with your finger. **Undo** and **Clear** are at the bottom. Tap **Done** to keep it.
- **Location**: tap **Capture GPS** (outdoors, give it a few seconds). The location is recorded in **UTM (NAD83)**. No GPS signal? Tap **Enter UTM** and type the zone, easting and northing.
- **Surficial soils** (MTO Field Form): pick *Granular / Sandy soils*, *Fine grained soils* or *Limited overburden thickness / Bedrock* to write that into Surficial Geology. It won't be overwritten by the map lookup; use **Insert description** if you want the mapped unit's description instead.
- **Surficial Geology** fills itself in from the location. The app looks up the unit on OGS Map 2556 and inserts the standard sentence and the unit description. **Check the small map**: the pink cross is the site. Read the unit number printed on the map there. If it's different, pick the right unit under **Change unit…**. A yellow note means the site is near a unit boundary or shoreline. You can edit the text freely afterwards.
- **Pumping test**: tap **+ Add reading (now)** for each reading. It stamps the time; type the water level. **Now** re-stamps a row.
- **Done** returns to the list. If a required field (marked \*) is empty, you can keep the form as a draft.
- **Word** creates this form's filled golden template right away, so you can preview it or send it on its own.
- **Print / PDF** opens a quick paper-style view. In the print screen, tap **Share** to save it as a PDF.

## Sending to OneDrive (when you have signal)

1. On the list screen, tap **Select not exported** (or tick the forms you want).
2. Tap **Export**, then **Share / Save to OneDrive**.
3. Choose **OneDrive**, or **Save to Files → OneDrive**. Pick the project folder, then tap **Upload / Save**.
4. The forms are marked **Exported**. If you edit one afterwards, it shows **Edited since export** and appears under **Not exported** again.

Each export contains:

| File | What it is |
|---|---|
| `MTO_export_<date>.json` | All data, raw. This is the master copy |
| `MTO_SaltClaimForm_<date>.csv`, `MTO_MTOFieldForm_<date>.csv` | One row per form. Opens in Excel |
| `MTO_PumpingTest_<date>.csv` | Every pumping and recovery reading, one per row |
| `<form>_<date>_<owner>.docx` | **The golden template, filled in.** Open in Word; **File → Save as PDF** for the final copy |
| `.jpg` / `.png` | Photos, sketches and signatures |

## Important

- Until you export, forms exist **only on this phone**. Export at the end of each day.
- Deleting the home-screen app, or clearing Safari website data, erases unexported forms.
