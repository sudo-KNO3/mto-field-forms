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

    case 'gps': {
      const out = h('span', { class: 'gps-out' });
      const paint = () => {
        const g = data[f.k];
        out.replaceChildren(g
          ? h('a', { href: `https://maps.apple.com/?ll=${g.lat},${g.lon}&q=Site`, target: '_blank', text: fmtGps(g) })
          : 'Not captured');
      };
      const btn = h('button', {
        type: 'button', class: 'btn small', text: 'Capture',
        onclick: () => {
          if (!navigator.geolocation) return alert('Location is not available on this device.');
          btn.disabled = true; btn.textContent = 'Locating…';
          navigator.geolocation.getCurrentPosition((p) => {
            set({ lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy), at: new Date().toISOString() });
            paint(); btn.disabled = false; btn.textContent = 'Re-capture';
          }, (err) => {
            alert('Could not get location: ' + err.message);
            btn.disabled = false; btn.textContent = 'Capture';
          }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
        },
      });
      if (data[f.k]) btn.textContent = 'Re-capture';
      paint();
      return wrap(h('div', { class: 'row' }, out, btn));
    }

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
export const fmtGps = (g) => `${g.lat}, ${g.lon} (±${g.acc} m)`;

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
