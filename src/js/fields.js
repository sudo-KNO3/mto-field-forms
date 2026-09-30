import { drawMapCrop, fmtUTM, fromUTM, geologyText, loadGeology, lookupUnit, toUTM, unitInfo } from './geo.js';

// DOM builders for each field type. Every widget writes straight into `data[k]`
// and then calls `changed()` so the editor can autosave and re-check visibility.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const INPUT_TYPES = { text: 'text', tel: 'tel', email: 'email', date: 'date', time: 'time', number: 'text' };

export function renderField(f, data, changed) {
  const label = f.bare ? null : h('span', { class: 'lbl' + (f.bold ? ' bold' : '') }, f.label, f.required ? h('b', { class: 'req', text: ' *' }) : null);
  const hint = f.hint ? h('small', { class: 'hint', text: f.hint }) : null;
  const wrap = (control, cls = '') => h('div', { class: `field ${f.half ? 'half' : ''} ${cls}`, 'data-k': f.k }, label, hint, control);
  const set = (v) => { data[f.k] = v; changed(f.k); };

  switch (f.type) {
    case 'textarea':
      return wrap(h('textarea', {
        rows: f.rows || 3, 'aria-label': f.label, placeholder: f.bare ? f.label : null,
        oninput: (e) => set(e.target.value),
      }, data[f.k] || ''));

    case 'choice':
    case 'multi': {
      const multi = f.type === 'multi';
      const box = h('div', { class: 'seg', role: multi ? 'group' : 'radiogroup', 'aria-label': f.label });
      const paint = () => box.querySelectorAll('button').forEach((b) => {
        const on = multi ? (data[f.k] || []).includes(b.value) : data[f.k] === b.value;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
      });
      for (const opt of f.options) {
        box.append(h('button', {
          type: 'button', value: opt, text: opt,
          onclick: () => {
            if (multi) {
              const cur = new Set(data[f.k] || []);
              cur.has(opt) ? cur.delete(opt) : cur.add(opt);
              set(f.options.filter((o) => cur.has(o)));
            } else {
              set(data[f.k] === opt ? '' : opt); // tap again to clear
            }
            paint();
          },
        }));
      }
      paint();
      return wrap(box);
    }

    case 'location':
      return wrap(renderLocation(f, data, set), 'location-field');

    case 'fillselect': {
      // Dropdown whose choice becomes the text of another field (e.g. Surficial Geology).
      const select = h('select', {
        'aria-label': f.label,
        onchange: (e) => {
          const v = e.target.value;
          const cur = (data[f.target] || '').trim();
          const replaceable = !cur || cur === data[f.target + 'Auto'] || cur === data[f.k];
          if (v && !replaceable && !confirm(`Replace the ${f.target === 'geology' ? 'surficial geology' : f.target} text with "${v}"?`)) {
            e.target.value = data[f.k] || '';
            return;
          }
          set(v);
          if (v) {
            data[f.target] = v;
            const el = document.querySelector(`.field[data-k="${f.target}"] textarea, .field[data-k="${f.target}"] input`);
            if (el) el.value = v;
            changed(f.target);
          }
        },
      }, h('option', { value: '', text: 'Choose…' }), ...f.options.map((o) => h('option', { value: o, text: o, selected: data[f.k] === o || null })));
      return wrap(select, 'fillselect-field');
    }

    case 'geounit':
      return wrap(renderGeoUnit(f, data, set, changed), 'geounit-field');

    case 'photos': {
      const grid = h('div', { class: 'thumbs' });
      const paint = () => grid.replaceChildren(...(data[f.k] || []).map((src, i) => h('div', { class: 'thumb' },
        h('img', { src, alt: `Photo ${i + 1}` }),
        h('button', {
          type: 'button', class: 'x', 'aria-label': 'Remove photo', text: '×',
          onclick: () => { if (confirm('Remove this photo?')) { const a = [...data[f.k]]; a.splice(i, 1); set(a); paint(); } },
        }))));
      const input = h('input', {
        type: 'file', accept: 'image/*', multiple: true, hidden: true,
        onchange: async (e) => {
          const files = [...e.target.files];
          e.target.value = '';
          for (const file of files) {
            try { set([...(data[f.k] || []), await compressImage(file)]); paint(); } catch { alert('Could not read ' + file.name); }
          }
        },
      });
      paint();
      return wrap(h('div', {}, grid, input, h('button', { type: 'button', class: 'btn small', text: '+ Add photo', onclick: () => input.click() })));
    }

    case 'sketch':
    case 'signature': {
      const sig = f.type === 'signature';
      const prev = h('div', { class: 'pad-preview' + (sig ? ' sig' : '') });
      const paint = () => prev.replaceChildren(data[f.k]
        ? h('img', { src: data[f.k], alt: f.label })
        : h('span', { class: 'muted', text: sig ? 'Tap to sign' : 'Tap to draw' }));
      const openPad = () => drawPad({ title: f.label, signature: sig, base: data[f.k] }).then((url) => {
        if (url !== undefined) { set(url); paint(); }
      });
      prev.addEventListener('click', openPad);
      paint();
      return wrap(h('div', {}, prev, h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn small', text: sig ? 'Sign' : 'Draw / edit', onclick: openPad }),
        h('button', { type: 'button', class: 'btn small ghost', text: 'Clear', onclick: () => { if (data[f.k] && confirm('Clear this ' + (sig ? 'signature' : 'sketch') + '?')) { set(''); paint(); } } }),
      )));
    }

    case 'table':
      return wrap(renderTable(f, data, changed), 'table-field');

    default: {
      const numeric = f.type === 'number';
      return wrap(h('input', {
        type: INPUT_TYPES[f.type] || 'text',
        inputmode: numeric ? 'decimal' : null,
        step: f.type === 'time' ? 1 : null,
        autocomplete: 'off',
        'aria-label': f.label,
        value: data[f.k] ?? '',
        oninput: (e) => set(e.target.value),
      }));
    }
  }
}

// Repeating rows, e.g. pumping-test time / water-level readings.
function renderTable(f, data, changed) {
  const body = h('div', { class: 'tbl-body' });
  const rows = () => (data[f.k] ||= []);
  const paint = () => {
    body.replaceChildren(...rows().map((row, i) => h('div', { class: 'tbl-row' },
      h('span', { class: 'n', text: i + 1 }),
      ...f.cols.map((c) => c.type === 'time'
        ? h('div', { class: 'time-cell' },
          h('input', { type: 'time', step: 1, value: row[c.k] || '', 'aria-label': `${c.label} row ${i + 1}`, oninput: (e) => { row[c.k] = e.target.value; changed(f.k); } }),
          h('button', { type: 'button', class: 'now', text: 'Now', onclick: (e) => { row[c.k] = nowTime(); e.target.previousSibling.value = row[c.k]; changed(f.k); } }))
        : h('input', { type: 'text', inputmode: 'decimal', value: row[c.k] || '', placeholder: 'm', 'aria-label': `${c.label} row ${i + 1}`, oninput: (e) => { row[c.k] = e.target.value; changed(f.k); } })),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Delete row', text: '×', onclick: () => { rows().splice(i, 1); changed(f.k); paint(); } }),
    )));
  };
  paint();
  return h('div', { class: 'tbl' },
    h('div', { class: 'tbl-head' }, h('span', { class: 'n', text: '#' }), ...f.cols.map((c) => h('span', { text: c.label })), h('span')),
    body,
    h('button', {
      type: 'button', class: 'btn small', text: '+ Add reading (now)',
      onclick: () => {
        rows().push({ t: nowTime() });
        changed(f.k); paint();
        body.lastChild?.querySelector('input[inputmode]')?.focus();
      },
    }));
}

export const nowTime = () => new Date().toTimeString().slice(0, 8);
export const fmtGps = fmtUTM;

// Resize photos so a day of field work doesn't fill the phone's browser storage.
async function compressImage(file, max = 1600, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Full-screen finger drawing pad. Resolves to a PNG data URL, or undefined if cancelled.
function drawPad({ title, signature, base }) {
  return new Promise((resolve) => {
    const colors = signature ? ['#111'] : ['#111', '#d22', '#1a5fd0', '#1a8a3a'];
    let color = colors[0];
    const strokes = [];
    let current = null;
    let baseImg = null;

    const canvas = h('canvas', { class: 'pad-canvas' });
    const ctx = canvas.getContext('2d');
    const swatches = colors.length > 1 ? h('div', { class: 'swatches' }, colors.map((c) => h('button', {
      type: 'button', class: 'sw' + (c === color ? ' on' : ''), style: `background:${c}`, 'aria-label': 'Pen colour',
      onclick: (e) => { color = c; swatches.querySelectorAll('.sw').forEach((s) => s.classList.remove('on')); e.target.classList.add('on'); },
    }))) : null;

    const close = (val) => { overlay.remove(); document.body.classList.remove('noscroll'); resolve(val); };
    const overlay = h('div', { class: 'pad-overlay' },
      h('div', { class: 'pad-bar' },
        h('button', { type: 'button', class: 'btn ghost', text: 'Cancel', onclick: () => close(undefined) }),
        h('strong', { text: title }),
        h('button', { type: 'button', class: 'btn primary', text: 'Done', onclick: () => close(canvas.toDataURL('image/png')) })),
      h('div', { class: 'pad-wrap' + (signature ? ' sig' : '') }, canvas),
      h('div', { class: 'pad-bar' },
        swatches,
        h('button', { type: 'button', class: 'btn ghost', text: 'Undo', onclick: () => { strokes.pop(); redraw(); } }),
        h('button', { type: 'button', class: 'btn ghost', text: 'Clear', onclick: () => { strokes.length = 0; baseImg = null; redraw(); } })));

    document.body.append(overlay);
    document.body.classList.add('noscroll');

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    function redraw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (baseImg) {
        const s = Math.min(canvas.width / baseImg.width, canvas.height / baseImg.height);
        ctx.drawImage(baseImg, (canvas.width - baseImg.width * s) / 2, (canvas.height - baseImg.height * s) / 2, baseImg.width * s, baseImg.height * s);
      }
      ctx.lineCap = ctx.lineJoin = 'round';
      for (const s of strokes) drawStroke(s);
    }
    function drawStroke(s) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
      ctx.stroke();
    }
    const pt = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      current = { color, width: (signature ? 2.5 : 3) * dpr, pts: [pt(e)] };
      strokes.push(current);
      drawStroke(current);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      ctx.strokeStyle = current.color;
      ctx.lineWidth = current.width;
      ctx.beginPath();
      ctx.moveTo(...current.pts[current.pts.length - 1]);
      for (const ev of events) { const p = pt(ev); current.pts.push(p); ctx.lineTo(...p); }
      ctx.stroke();
    });
    const end = () => { current = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    if (base) {
      const i = new Image();
      i.onload = () => { baseImg = i; redraw(); };
      i.src = base;
    }
    redraw();
  });
}

// ---------- location (recorded in UTM) ----------

// Other widgets (the geology lookup) listen here for changes to a field.
export const fieldEvents = new EventTarget();

function renderLocation(f, data, set) {
  const out = h('div', { class: 'utm-out' });
  const manual = h('div', { class: 'utm-manual', hidden: true });
  const paint = () => {
    const g = data[f.k];
    if (!g) { out.replaceChildren(h('span', { class: 'muted', text: 'Not recorded' })); return; }
    const u = g.utm || toUTM(g.lat, g.lon);
    out.replaceChildren(
      h('div', { class: 'utm-main' },
        h('span', {}, h('small', { text: 'Zone ' }), `${u.zone}${u.band || ''}`),
        h('span', {}, `${u.easting}`, h('small', { text: ' m E' })),
        h('span', {}, `${u.northing}`, h('small', { text: ' m N' }))),
      h('div', { class: 'utm-sub muted' },
        `NAD83${g.acc != null ? ` · ±${g.acc} m` : ''} · ${g.source === 'manual' ? 'entered by hand' : 'GPS'}`,
        g.at ? ` · ${new Date(g.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '',
        ' · ', h('a', { href: `https://maps.apple.com/?ll=${g.lat},${g.lon}&q=Site`, target: '_blank', text: 'map' })));
  };
  const btn = h('button', {
    type: 'button', class: 'btn small', text: data[f.k] ? 'Re-capture GPS' : 'Capture GPS',
    onclick: () => {
      if (!navigator.geolocation) return alert('Location is not available on this device.');
      btn.disabled = true; btn.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition((p) => {
        const lat = +p.coords.latitude.toFixed(7);
        const lon = +p.coords.longitude.toFixed(7);
        set({ lat, lon, acc: Math.round(p.coords.accuracy), at: new Date().toISOString(), source: 'gps', utm: toUTM(lat, lon) });
        paint(); btn.disabled = false; btn.textContent = 'Re-capture GPS';
      }, (err) => {
        alert('Could not get location: ' + err.message + '\nYou can enter the UTM coordinates by hand instead.');
        btn.disabled = false; btn.textContent = 'Capture GPS';
      }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
    },
  });
  // Manual UTM entry (e.g. read off a handheld GPS or a site plan).
  const cur = data[f.k]?.utm || {};
  const zone = h('input', { type: 'text', inputmode: 'numeric', value: cur.zone ?? 17, 'aria-label': 'UTM zone' });
  const east = h('input', { type: 'text', inputmode: 'numeric', value: cur.easting ?? '', placeholder: 'e.g. 563412', 'aria-label': 'Easting' });
  const north = h('input', { type: 'text', inputmode: 'numeric', value: cur.northing ?? '', placeholder: 'e.g. 4821345', 'aria-label': 'Northing' });
  const applyManual = () => {
    const z = +zone.value; const e = +east.value; const n = +north.value;
    if (!(z >= 15 && z <= 18) || !(e > 100000 && e < 900000) || !(n > 4500000 && n < 6500000)) return; // Ontario ranges
    const { lat, lon } = fromUTM(z, e, n);
    set({ lat: +lat.toFixed(7), lon: +lon.toFixed(7), at: new Date().toISOString(), source: 'manual', utm: { ...toUTM(lat, lon, z), easting: e, northing: n } });
    paint();
  };
  [zone, east, north].forEach((i) => i.addEventListener('input', applyManual));
  manual.append(
    h('label', {}, h('small', { text: 'Zone' }), zone),
    h('label', {}, h('small', { text: 'Easting (m)' }), east),
    h('label', {}, h('small', { text: 'Northing (m)' }), north));
  const toggle = h('button', { type: 'button', class: 'btn small ghost', text: 'Enter UTM', onclick: () => { manual.hidden = !manual.hidden; } });
  paint();
  return h('div', {}, out, h('div', { class: 'row' }, btn, toggle), manual);
}

// ---------- mapped surficial unit (offline lookup on OGS Map 2556) ----------

function renderGeoUnit(f, data, set, changed) {
  const box = h('div', { class: 'geo' });
  const canvas = h('canvas', { class: 'geo-map', width: 640, height: 400, 'aria-label': 'OGS Map 2556 around the site' });
  let zoom = 1.5;
  let g = null;
  let hit = null;

  const setGeologyText = (text) => {
    data.geology = text;
    data.geologyAuto = text;
    const ta = document.querySelector('.field[data-k="geology"] textarea');
    if (ta) ta.value = text;
    changed('geology');
  };
  // Fill the description when it is empty or still the previous automatic text.
  const autoFill = (unit) => {
    if (!data.geology || data.geology === data.geologyAuto) setGeologyText(geologyText(g, unit));
  };
  const choose = (unit, source) => {
    set({ unit, source, share: hit && hit.unit === unit ? +hit.share.toFixed(2) : null, at: new Date().toISOString() });
    autoFill(unit);
    paint();
  };
  const draw = () => drawMapCrop(g, canvas, hit.scan.x, hit.scan.y, zoom);

  const paint = () => {
    const cur = data[f.k];
    const loc = data.gps;
    const parts = [];
    if (!g) {
      parts.push(h('p', { class: 'muted', text: 'Loading map…' }));
    } else if (!loc && !cur) {
      parts.push(h('p', { class: 'muted', text: 'Record the location (General section) to look up the mapped unit, or choose it below.' }));
    } else if (loc && !hit) {
      parts.push(h('p', { class: 'geo-note warn', text: 'This location is outside Map 2556 (southern Ontario sheet). Choose the unit below.' }));
    }
    const unit = cur?.unit;
    const info = unit && g ? unitInfo(g, unit) : null;
    if (info) {
      parts.push(h('div', { class: 'geo-unit' }, h('span', { class: 'geo-num', text: unit }), h('strong', { text: info.title })));
      if (info.legend) parts.push(h('p', { class: 'geo-legend', text: info.legend }));
    }
    if (hit) {
      if (cur?.source === 'user' && cur.unit !== hit.unit) {
        parts.push(h('p', { class: 'geo-note', text: `Chosen by hand. The map colour at this point suggests ${hit.unit} – ${unitInfo(g, hit.unit).title}.` }));
      } else if (!hit.certain) {
        const others = hit.mix.filter((m) => m.unit !== hit.unit && m.share >= 0.1).slice(0, 2)
          .map((m) => `${m.unit} – ${unitInfo(g, m.unit).title} (${Math.round(m.share * 100)}%)`);
        const why = hit.nearShore ? 'the point is on a shoreline' : hit.weakColour ? 'the map colour here is a weak match to the legend' : 'the point is near a unit boundary';
        parts.push(h('p', { class: 'geo-note warn', text: `Check the map below: ${why}${others.length ? `. Nearby: ${others.join('; ')}` : ''}. Read the unit number printed on the map and change it below if needed.` }));
      } else {
        parts.push(h('p', { class: 'geo-note ok', text: `Matched from the map colour (${Math.round(hit.share * 100)}% of the area within 1 km). Confirm against the unit number printed on the map.` }));
      }
    }
    if (info?.confidence) parts.push(h('p', { class: 'geo-note', text: `The description for this unit is marked "${info.confidence}" in the source document.` }));
    if (hit) {
      parts.push(canvas, h('div', { class: 'row geo-zoom' },
        h('button', { type: 'button', class: 'btn small ghost', text: '−', 'aria-label': 'Zoom out', onclick: () => { zoom = Math.max(0.5, zoom / 1.5); draw(); } }),
        h('button', { type: 'button', class: 'btn small ghost', text: '+', 'aria-label': 'Zoom in', onclick: () => { zoom = Math.min(4, zoom * 1.5); draw(); } }),
        h('small', { class: 'muted', text: 'OGS Map 2556 (1:1,000,000)' })));
    }
    if (g) {
      const select = h('select', {
        'aria-label': 'Surficial unit',
        onchange: (e) => { if (e.target.value) choose(+e.target.value, 'user'); },
      }, h('option', { value: '', text: unit ? 'Change unit…' : 'Choose unit…' }),
      ...Object.keys(g.meta.units).map(Number).filter((u) => u <= 32).sort((p, q) => p - q)
        .map((u) => h('option', { value: u, text: `${u} – ${g.meta.units[u].title}` })));
      parts.push(h('div', { class: 'row geo-actions' }, select,
        unit ? h('button', {
          type: 'button', class: 'btn small', text: 'Insert description',
          onclick: () => {
            if (data.geology && data.geology !== data.geologyAuto && !confirm('Replace the surficial geology text with the description for this unit?')) return;
            setGeologyText(geologyText(g, unit));
          },
        }) : null));
    }
    box.replaceChildren(...parts);
    if (hit) draw();
  };

  const update = () => {
    const loc = data.gps;
    hit = loc && g ? lookupUnit(g, loc.lat, loc.lon) : null;
    const cur = data[f.k];
    if (hit && (!cur || (cur.source !== 'user' && cur.unit !== hit.unit))) return choose(hit.unit, 'map');
    paint();
  };
  loadGeology().then((geo) => { g = geo; update(); }).catch(() => {
    box.replaceChildren(h('p', { class: 'geo-note warn', text: 'The geology map is not available offline yet. Open the app once with signal.' }));
  });
  fieldEvents.addEventListener('change', (e) => { if (e.detail === 'gps' && g) update(); });
  paint();
  return box;
}
