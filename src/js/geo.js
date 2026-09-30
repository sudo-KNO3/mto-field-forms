// Coordinates and the offline surficial-geology lookup.
// - UTM on NAD83 (GRS80). GPS positions are WGS84, which matches NAD83 to about a metre in Ontario.
// - OGS Map 2556 is Lambert Conformal Conic on Clarke 1866; see scripts/build_geology.py.
// No network or libraries: the data files in src/geology are cached for offline use.

const D2R = Math.PI / 180;

// ---------- UTM (Snyder, USGS PP 1395, eq. 8-9 .. 8-25) ----------

const GRS80 = { a: 6378137, f: 1 / 298.257222101 };
const K0 = 0.9996;
const BANDS = 'CDEFGHJKLMNPQRSTUVWX';

function ellipse({ a, f }) {
  const e2 = f * (2 - f);
  return { a, e2, ep2: e2 / (1 - e2) };
}

export function toUTM(lat, lon, forcedZone) {
  const { a, e2, ep2 } = ellipse(GRS80);
  const zone = forcedZone || Math.floor((lon + 180) / 6) + 1;
  const lon0 = (zone - 1) * 6 - 180 + 3;
  const phi = lat * D2R;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lon - lon0) * D2R;
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const easting = K0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let northing = K0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
    + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) northing += 10000000;
  const band = BANDS[Math.min(19, Math.max(0, Math.floor((lat + 80) / 8)))];
  return { zone, band, easting: Math.round(easting), northing: Math.round(northing) };
}

export function fromUTM(zone, easting, northing, southern = false) {
  const { a, e2, ep2 } = ellipse(GRS80);
  const lon0 = (zone - 1) * 6 - 180 + 3;
  const x = easting - 500000;
  const y = southern ? northing - 10000000 : northing;
  const M = y / K0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = ep2 * Math.cos(phi1) ** 2;
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * K0);
  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(phi1);
  return { lat: lat / D2R, lon: lon0 + lon / D2R };
}

// "Zone 17T  563412 m E  4821345 m N (NAD83, ±6 m)"
export function fmtUTM(g) {
  if (!g) return '';
  const u = g.utm || toUTM(g.lat, g.lon);
  const acc = g.acc != null ? `, ±${g.acc} m` : '';
  return `Zone ${u.zone}${u.band || ''}  ${u.easting} m E  ${u.northing} m N (NAD83${acc})`;
}

// ---------- Lambert Conformal Conic, 2SP (Snyder eq. 15-1 .. 15-10) ----------

export function lccForward(lat, lon, p) {
  const a = p.a;
  const f = 1 / p.invf;
  const e2 = f * (2 - f);
  const e = Math.sqrt(e2);
  const m = (phi) => Math.cos(phi) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const t = (phi) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2);
  const p1 = p.lat1 * D2R, p2 = p.lat2 * D2R, p0 = p.lat0 * D2R;
  const n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(t(p1)) - Math.log(t(p2)));
  const F = m(p1) / (n * t(p1) ** n);
  const rho0 = a * F * t(p0) ** n;
  const rho = a * F * t(lat * D2R) ** n;
  const theta = n * (lon - p.lon0) * D2R;
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
}

// ---------- geology lookup ----------

let geology = null;
export async function loadGeology(base = 'geology/') {
  geology ??= (async () => {
    const [meta, bin] = await Promise.all([
      fetch(base + 'geology.json').then((r) => r.json()),
      fetch(base + 'units.bin').then((r) => r.arrayBuffer()),
    ]);
    return parseGeology(meta, bin, base);
  })();
  return geology;
}

export function parseGeology(meta, bin, base = 'geology/') {
  const dv = new DataView(bin);
  const magic = String.fromCharCode(...new Uint8Array(bin, 0, 4));
  if (magic !== 'MTOG') throw new Error('Bad geology grid file');
  const width = dv.getUint16(4, true);
  const height = dv.getUint16(6, true);
  const nOffsets = dv.getUint32(8, true);
  const offsets = new Uint32Array(bin.slice(12, 12 + nOffsets * 4));
  const runs = new Uint8Array(bin, 12 + nOffsets * 4);
  return { meta, width, height, offsets, runs, base, tiles: new Set(meta.tiles.present) };
}

// Scan pixel for a WGS84/NAD83 position.
export function toScan(g, lat, lon) {
  const [X, Y] = lccForward(lat, lon, g.meta.projection);
  const [a, b, c, d, tx, ty] = g.meta.affine;
  return { x: a * X + b * Y + tx, y: c * X + d * Y + ty };
}

function cell(g, cx, cy) {
  if (cx < 0 || cy < 0 || cx >= g.width || cy >= g.height) return 0;
  let i = g.offsets[cy];
  const end = g.offsets[cy + 1];
  let x = 0;
  for (; i < end; i++) {
    const unit = g.runs[i * 3];
    const len = g.runs[i * 3 + 1] | (g.runs[i * 3 + 2] << 8);
    if (cx < x + len) return unit;
    x += len;
  }
  return 0;
}

/**
 * Surficial unit at a point, with the mix of units within about 1 km so
 * the app can say how certain the match is.
 * Returns null when the point is outside the map sheet.
 */
export function lookupUnit(g, lat, lon, radiusCells = 4) {
  const { x, y } = toScan(g, lat, lon);
  const step = g.meta.grid.step;
  const cx = Math.round(x / step);
  const cy = Math.round(y / step);
  const water = g.meta.grid.water;
  const WEAK = g.meta.grid.weakFlag || 0x80; // cell byte = unit | WEAK when its colour match was weak
  const counts = new Map();
  let total = 0;
  let weak = 0;
  for (let dy = -radiusCells; dy <= radiusCells; dy++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      if (dx * dx + dy * dy > radiusCells * radiusCells) continue;
      const raw = cell(g, cx + dx, cy + dy);
      const u = raw & ~WEAK;
      if (!u) continue;
      if (raw & WEAK) weak++;
      counts.set(u, (counts.get(u) || 0) + 1);
      total++;
    }
  }
  let unit = cell(g, cx, cy) & ~WEAK;
  if (!unit || !total) return null;
  const nearShore = unit === water;
  if (nearShore) { // GPS on a shoreline the 1:1,000,000 map draws as water: use the nearest land unit
    const land = [...counts].filter(([u]) => u !== water).sort((p, q) => q[1] - p[1]);
    if (land.length) unit = land[0][0];
  }
  const landTotal = [...counts].filter(([u]) => u !== water).reduce((n, [, c]) => n + c, 0) || 1;
  const mix = [...counts].filter(([u]) => u !== water).map(([u, c]) => ({ unit: u, share: c / landTotal })).sort((p, q) => q.share - p.share);
  const share = mix.find((m) => m.unit === unit)?.share ?? 1;
  const weakShare = weak / total;
  return {
    unit, share, mix, nearShore, weakColour: weakShare > 0.3, scan: { x, y },
    certain: !nearShore && unit !== water && share >= 0.75 && weakShare <= 0.3,
  };
}

export function unitInfo(g, unit) {
  return g.meta.units[String(unit)] || null;
}

// Name used in report wording, e.g. "Halton Till (Ontario-Erie lobe)" or "glaciofluvial ice-contact deposits".
export function unitName(info) {
  const label = (info.legend || info.title).split(':')[0].trim();
  return /till\b/i.test(label) && label !== 'Till' ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

// The team's boilerplate sentence (Quaternary Geology template) followed by the pre-written description.
export function geologyText(g, unit) {
  const info = unitInfo(g, unit);
  if (!info) return '';
  const legendDesc = (info.legend || '').split(':').slice(1).join(':').trim();
  const sentence = `The Ontario Geological Survey (OGS, 1991) Map 2556 mapping indicates that the surficial material within the Site consists of ${unitName(info)}`
    + (legendDesc ? `, which is generally described as ${legendDesc}.` : '.');
  return info.description ? `${sentence}\n${info.description}` : sentence;
}

// Draw the scanned map around a point (with a marker) into a canvas.
export async function drawMapCrop(g, canvas, scanX, scanY, zoom = 1) {
  const size = g.meta.tiles.size;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const x0 = scanX - w / (2 * zoom);
  const y0 = scanY - h / (2 * zoom);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const loads = [];
  for (let ty = Math.floor(y0 / size); ty <= Math.floor((y0 + h / zoom) / size); ty++) {
    for (let tx = Math.floor(x0 / size); tx <= Math.floor((x0 + w / zoom) / size); tx++) {
      if (!g.tiles.has(`${tx}_${ty}`)) continue;
      loads.push(new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, (tx * size - x0) * zoom, (ty * size - y0) * zoom, size * zoom, size * zoom); resolve(); };
        img.onerror = resolve;
        img.src = `${g.base}tiles/${tx}_${ty}.jpg`;
      }));
    }
  }
  await Promise.all(loads);
  ctx.strokeStyle = '#e0169a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 12, 0, Math.PI * 2);
  ctx.moveTo(w / 2 - 22, h / 2); ctx.lineTo(w / 2 - 6, h / 2);
  ctx.moveTo(w / 2 + 6, h / 2); ctx.lineTo(w / 2 + 22, h / 2);
  ctx.moveTo(w / 2, h / 2 - 22); ctx.lineTo(w / 2, h / 2 - 6);
  ctx.moveTo(w / 2, h / 2 + 6); ctx.lineTo(w / 2, h / 2 + 22);
  ctx.stroke();
}
