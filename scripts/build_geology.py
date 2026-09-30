"""Build the offline surficial-geology lookup from local files.

Inputs (defaults point at the team's Quaternary Geology boilerplate folder):
  - M2556 - Quaternary geology of Ontario, southern sheet.pdf   (OGS Map 2556, 1:1,000,000 scan)
  - Quaternary Geology 260512 - DRAFT populated.docx           (pre-written unit descriptions)

Outputs (src/geology/):
  - units.bin        unit number per map cell (run-length encoded rows), for the offline point lookup
  - tiles/*.jpg      the map scan in 512 px tiles, so the app can show the map around a point
  - geology.json     projection, georeference, grid layout, legend names and unit descriptions

How the scan is georeferenced
  Map 2556 is drawn on a Lambert Conformal Conic grid (standard parallels 49N and 77N, central
  meridian 92W, origin 92W 0N; printed in the map's "Sources of information"), Clarke 1866
  ellipsoid (NAD27). The affine transform from projected metres to scan pixels was fitted to
  nine printed meridians (85W-76W, straight lines in this projection) and the 45N/46N edge ticks:
  RMS 1.0 px (about 125 m on the ground). Checked against town dots (Toronto, Sudbury, Ottawa ...).

How units are read from the scan
  Each legend swatch printed on the map gives the unit's colour. Black/grey linework and lettering
  are painted out, halftone dots are averaged (5 px blur) and overprinted symbols removed (17 px
  median), then every cell takes the nearest legend colour (CIELAB). Cells too far from any legend
  colour (symbols, labels) are filled from the nearest classified cell. White = open water / off map.
  This is automatic colour matching of a scanned print: the app shows the matched unit as a
  suggestion together with the map itself, and the user confirms it.

Usage:  python scripts/build_geology.py [--pdf PATH] [--docx PATH]
Needs:  pip install pymupdf opencv-python numpy scipy pyproj
"""

import argparse
import json
import re
import struct
import zipfile
from pathlib import Path

import cv2
import fitz  # PyMuPDF
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = Path(r"N:\Central\Staff\Jenn\Workflow\Templates\Physical Descriptions - Boilerplate wording\Quaternary Geology")
OUT = ROOT / 'src' / 'geology'

PROJ = {  # Lambert Conformal Conic, Clarke 1866 (NAD27), as printed on Map 2556
    'lat1': 49.0, 'lat2': 77.0, 'lat0': 0.0, 'lon0': -92.0,
    'a': 6378206.4, 'invf': 294.9786982,
}
# scan pixel = [a b; c d] . [X Y] + [tx ty]   (X, Y = projected metres)
AFFINE = [0.007823134045747695, 0.0014877368712323635, 0.0015019533851011253,
          -0.007830710512695545, -13028.842473124416, 49348.293232772274]
# Legend swatch boxes on the scan: unit -> [x1, x2, y_centre, half_height] (full-resolution pixels)
SWATCHES = {
    32: [5230, 5337, 4119, 13], 31: [5230, 5337, 4188, 13], 30: [5230, 5337, 4259, 13], 29: [5230, 5337, 4329, 13],
    28: [5230, 5337, 4432, 13], 27: [5230, 5337, 4532, 13], 26: [5230, 5337, 4632, 13], 25: [5230, 5337, 4703, 13],
    24: [5230, 5337, 4802, 13], 23: [5230, 5337, 4873, 13], 22: [5230, 5337, 4973, 13], 21: [5230, 5337, 5100, 13],
    20: [5230, 5337, 5199, 13], 19: [5883, 5991, 4037, 13], 18: [5883, 5991, 4136, 13], 17: [5883, 5991, 4235, 13],
    16: [5883, 5991, 4336, 13], 15: [5883, 5991, 4435, 13], 14: [5883, 5991, 4532, 13], 13: [5883, 5991, 4688, 13],
    12: [5883, 5991, 4817, 13], 11: [5883, 5991, 4916, 13], 10: [5883, 5991, 5044, 13], 9: [5883, 5991, 5172, 13],
    8: [6530, 6639, 4036, 11], 7: [6530, 6639, 4136, 11], 6: [6530, 6639, 4235, 11], 5: [6530, 6639, 4335, 11],
    4: [6530, 6639, 4492, 11], 3: [6530, 6639, 4591, 11], 2: [6530, 6639, 4729, 11], 1: [6530, 6639, 4909, 11],
}
# Map areas that are not geology (legend, title, index map, notes): never classified.
NOT_MAP = [(4500, 3850, 7937, 5453), (6400, 0, 7937, 1150), (6650, 2150, 7600, 3150), (6700, 3150, 7937, 3850)]
WATER = 33
WEAK_FLAG = 0x80   # set on cells whose colour match is weak (unit = byte & 0x7F)
WEAK_DIST = 20     # CIELAB distance to the nearest legend colour (typical: 5-20; above 20 the cell is filled from neighbours)
WEAK_MARGIN = 1.5  # ... or the runner-up unit is practically as close
GRID_STEP = 2      # grid cell = 2 x 2 scan pixels (about 250 m)
TILE = 512


def load_scan(pdf):
    doc = fitz.open(pdf)
    page = next(p for p in doc if p.get_images())
    pix = fitz.Pixmap(doc, page.get_images(full=True)[0][0])
    arr = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def classify(im):
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    # Black/grey linework and lettering: dark and unsaturated. (Dark map greens are saturated;
    # lavender bedrock and grey organics are never this dark.)
    ink = (((hsv[:, :, 2] < 90) & (hsv[:, :, 1] < 100)) | (hsv[:, :, 2] < 50)).astype(np.uint8)
    ink = cv2.dilate(ink, np.ones((3, 3), np.uint8))
    sm = cv2.blur(im, (5, 5))
    valid = (1 - ink).astype(np.float32)
    num = cv2.blur(sm.astype(np.float32) * valid[..., None], (25, 25))
    den = cv2.blur(valid, (25, 25))
    fill = (num / np.maximum(den[..., None], 1e-3)).astype(np.uint8)
    sm = np.where(ink[..., None] > 0, fill, sm).astype(np.uint8)
    sm = cv2.medianBlur(sm, 17)
    lab_full = cv2.cvtColor(sm, cv2.COLOR_BGR2LAB).astype(np.float32)

    colours = {}
    for u, (x1, x2, y, hh) in SWATCHES.items():
        w = x2 - x1  # sample either side of the unit number printed in the box
        v = np.concatenate([lab_full[y - hh:y + hh, x1 + int(w * .10):x1 + int(w * .30)].reshape(-1, 3),
                            lab_full[y - hh:y + hh, x2 - int(w * .30):x2 - int(w * .10)].reshape(-1, 3)])
        colours[u] = np.median(v, 0)
    units = np.array(sorted(colours))
    P = np.array([colours[u] for u in units], np.float32)

    H, W = im.shape[:2]
    lab = cv2.resize(lab_full, (W // GRID_STEP, H // GRID_STEP), interpolation=cv2.INTER_AREA)
    h, w = lab.shape[:2]
    flat = lab.reshape(-1, 3)
    D = np.stack([np.linalg.norm(flat - P[i], axis=1) for i in range(len(units))], 1)
    # Geographic rule: marine units 26/27 (Champlain Sea) only occur in the Ottawa - St. Lawrence
    # lowlands. Elsewhere their blues are glaciolacustrine (24/25) look-alikes.
    lon, lat = cell_lonlat(w, h)
    outside_sea = ((lon < -77.3) | (lat < 44.5)).ravel()
    for u in (26, 27):
        D[outside_sea, list(units).index(u)] = np.inf
    lbl = units[D.argmin(1)].astype(np.uint8)
    white = (flat[:, 0] > 225) & (np.hypot(flat[:, 1] - 128, flat[:, 2] - 128) < 14)
    Ds = np.sort(D, 1)
    # Weak match: colour well away from every legend swatch, or nearly as close to a second unit.
    weak = ((Ds[:, 0] > WEAK_DIST) | (Ds[:, 1] - Ds[:, 0] < WEAK_MARGIN)) & ~white
    lbl[Ds[:, 0] > 20] = 0
    lbl[white] = WATER
    lbl = lbl.reshape(h, w)
    weak = cv2.blur(weak.reshape(h, w).astype(np.float32), (5, 5)) > 0.5

    # Majority filter (5 x 5 cells) to drop speckle, then fill unknowns from the nearest unit.
    best = np.zeros_like(lbl); bestc = np.zeros(lbl.shape, np.float32); k = np.ones((5, 5), np.float32)
    for u in range(1, WATER + 1):
        c = cv2.filter2D((lbl == u).astype(np.float32), -1, k, borderType=cv2.BORDER_CONSTANT)
        m = c > bestc; best[m] = u; bestc[m] = c[m]
    best[lbl == WATER] = WATER
    unk = best == 0
    idx = ndimage.distance_transform_edt(unk, return_distances=False, return_indices=True)
    best[unk] = best[idx[0], idx[1]][unk]
    best[weak & (best != WATER)] |= WEAK_FLAG
    for x0, y0, x1, y1 in NOT_MAP:
        best[y0 // GRID_STEP:y1 // GRID_STEP, x0 // GRID_STEP:x1 // GRID_STEP] = 0
    return best, {int(u): [round(float(c), 1) for c in colours[u]] for u in units}


def cell_lonlat(w, h):
    """Longitude/latitude (NAD27) of every grid cell centre, via the inverse georeference."""
    from pyproj import Proj
    lcc = Proj(proj='lcc', lat_1=PROJ['lat1'], lat_2=PROJ['lat2'], lat_0=PROJ['lat0'], lon_0=PROJ['lon0'],
               a=PROJ['a'], rf=PROJ['invf'], units='m')
    a, b, c, d, tx, ty = AFFINE
    inv = np.linalg.inv(np.array([[a, b], [c, d]]))
    px, py = np.meshgrid((np.arange(w) + 0.5) * GRID_STEP, (np.arange(h) + 0.5) * GRID_STEP)
    X = inv[0, 0] * (px - tx) + inv[0, 1] * (py - ty)
    Y = inv[1, 0] * (px - tx) + inv[1, 1] * (py - ty)
    return lcc(X, Y, inverse=True)


def encode_rle(grid):
    """Row offsets (uint32 per row, +1 end) followed by runs of (unit uint8, length uint16 LE)."""
    body = bytearray()
    offsets = []
    for row in grid:
        offsets.append(len(body) // 3)
        change = np.flatnonzero(np.diff(row)) + 1
        starts = np.concatenate([[0], change])
        ends = np.concatenate([change, [len(row)]])
        for s, e in zip(starts, ends):
            body += struct.pack('<BH', int(row[s]), int(e - s))
    offsets.append(len(body) // 3)
    header = struct.pack('<4sHHI', b'MTOG', grid.shape[1], grid.shape[0], len(offsets))
    return header + struct.pack(f'<{len(offsets)}I', *offsets) + bytes(body)


def write_tiles(im):
    tdir = OUT / 'tiles'
    tdir.mkdir(parents=True, exist_ok=True)
    for old in tdir.glob('*.jpg'):
        old.unlink()
    H, W = im.shape[:2]
    kept = []
    for ty in range(0, (H + TILE - 1) // TILE):
        for tx in range(0, (W + TILE - 1) // TILE):
            t = im[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE]
            if (t > 245).all(axis=2).mean() > 0.995:
                continue  # blank paper
            cv2.imwrite(str(tdir / f'{tx}_{ty}.jpg'), t, [cv2.IMWRITE_JPEG_QUALITY, 60])
            kept.append(f'{tx}_{ty}')
    return kept


def read_descriptions(docx):
    xml = zipfile.ZipFile(docx).read('word/document.xml').decode('utf8')
    paras = []
    for p in re.findall(r'<w:p[ >].*?</w:p>', xml):
        text = ''.join(re.findall(r'<w:t[^>]*>([^<]*)', p)).replace('&amp;', '&').strip()
        style = re.search(r'w:pStyle w:val="([^"]+)"', p)
        if text:
            paras.append((style.group(1) if style else '', text))
    units, cur = {}, None
    for style, text in paras:
        m = re.match(r'^(\d+) - (.+)$', text)
        if style.startswith('Heading') and m:
            cur = units.setdefault(int(m.group(1)), {'title': m.group(2)})
        elif cur is None:
            continue
        elif text.startswith('OGS legend:'):
            cur['legend'] = text[len('OGS legend:'):].strip()
        elif text.startswith('Source:'):
            conf = re.search(r'\[confidence:\s*([^\]]+)\]', text)
            cur['source'] = re.sub(r'\s*\[confidence:[^\]]*\]', '', text[len('Source:'):]).strip()
            if conf:
                cur['confidence'] = conf.group(1).strip()
        elif 'description' not in cur:
            cur['description'] = text
    return units


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', default=str(SRC_DIR / 'M2556 - Quaternary geology of Ontario, southern sheet.pdf'))
    ap.add_argument('--docx', default=str(SRC_DIR / 'Quaternary Geology 260512 - DRAFT populated.docx'))
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    im = load_scan(args.pdf)
    grid, colours = classify(im)
    (OUT / 'units.bin').write_bytes(encode_rle(grid))
    tiles = write_tiles(im)
    units = read_descriptions(args.docx)
    missing = [u for u in range(1, 34) if u not in units]
    if missing:
        raise SystemExit(f'descriptions missing for units {missing}')

    meta = {
        'source': 'OGS Map 2556, Quaternary Geology of Ontario, southern sheet (Barnett, Henry and Cowan 1991), 1:1,000,000',
        'citation': 'Barnett, P.J., Henry, A.P. and Cowan, W.R. 1991. Quaternary Geology of Ontario, southern sheet; Ontario Geological Survey, Map 2556, scale 1:1,000,000.',
        'projection': PROJ, 'affine': AFFINE,
        'scan': {'width': int(im.shape[1]), 'height': int(im.shape[0])},
        'grid': {'step': GRID_STEP, 'width': int(grid.shape[1]), 'height': int(grid.shape[0]), 'water': WATER, 'weakFlag': WEAK_FLAG},
        'tiles': {'size': TILE, 'present': tiles},
        'colours': colours,
        'units': units,
    }
    (OUT / 'geology.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
    size = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file())
    print(f'grid {grid.shape[1]}x{grid.shape[0]}, {len(tiles)} tiles, {len(units)} unit descriptions, {size / 1e6:.1f} MB in {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
