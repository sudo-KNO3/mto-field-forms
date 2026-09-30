# Surficial geology lookup

The app fills in the Surficial Geology section from the site location. It works fully offline.

## What it uses

| Input | Local source |
|---|---|
| Unit map | *M2556 - Quaternary geology of Ontario, southern sheet.pdf* (OGS Map 2556, Barnett, Henry and Cowan 1991, 1:1,000,000) |
| Unit wording | *Quaternary Geology 260512 - DRAFT populated.docx*: the OGS legend text, the pre-written description and the source for each of the 33 units |

Both files are in `N:\Central\Staff\Jenn\Workflow\Templates\Physical Descriptions - Boilerplate wording\Quaternary Geology`. `scripts/build_geology.py` turns them into `src/geology/`, about 7 MB, which the app caches for offline use.

## How the lookup works

1. The location (UTM NAD83) is converted to the map's own grid. Map 2556 uses Lambert Conformal Conic, standard parallels 49°N and 77°N, central meridian 92°W, Clarke 1866 ellipsoid.
2. The map scan was georeferenced to its printed meridians and parallels, with an RMS error of 1 px, or about 125 m on the ground.
3. Each map cell (about 250 m) was assigned the legend unit whose printed colour it matches.
4. The app reads the unit at the site and reports how much of the area within 1 km is the same unit.

The inserted text follows the team's boilerplate:

> The Ontario Geological Survey (OGS, 1991) Map 2556 mapping indicates that the surficial material within the Site consists of *Halton Till (Ontario-Erie lobe)*, which is generally described as *predominantly silt to silty clay matrix, high in matrix carbonate content and clast poor.*

It is followed by the pre-written description for that unit.

## Limits (why the tech confirms it)

- **Scale.** At 1:1,000,000 the unit boundaries are generalized. A site near a boundary can sit on either side. The app warns when less than 75% of the area within 1 km is one unit, or the colour match there is weak.
- **Colour matching of a scanned print.** Some units have similar colours, and overprinted symbols can mislead the match. This mostly happens in drumlin fields such as Peterborough. The closest pairs are 9/21, 3/15 and 5/18. That's why the app shows the actual map around the site: the unit number printed on the map is the authority, and the unit can be changed with one tap.
- **Coverage.** The southern sheet ends at about 47°N. North of that, choose the unit by hand.
- **Descriptions** come from the *DRAFT populated* document. Units the draft flags as low or medium confidence show that flag in the app. Update the document and rebuild to change the wording.
- **Site-specific conditions** (boreholes, test pits) always take precedence over regional mapping.

## Checked locations

Checked against the scan: Oakville and Brampton → 17 Halton Till; Guelph → 14 Wentworth Till; Sudbury → 1 Precambrian bedrock; Tobermory → 2 Paleozoic bedrock. `tests/geo.test.js` checks these, and checks that UTM and the map projection agree with PROJ.

Known weak spots, which the app flags with "Check the map below":
- Milton: a stippled blue patch printed between the legend colours for 24 and 26.
- Drumlin fields such as Peterborough, where symbols are printed over the till colour.
- Town centres, where lettering covers the map.

A cell is flagged when its colour could not be matched (CIELAB distance over 20) or two units are practically tied. A site is flagged when more than 30% of the area within 1 km is flagged, or when no unit covers 75% of it.

Colour matching can also be wrong without a flag, where a map colour happens to sit close to another unit's legend swatch. Always compare with the printed unit number.

One geographic rule is applied: marine units 26 and 27 (Champlain Sea) are only assigned east of 77.3°W and north of 44.5°N.
