// App shell: hash router + three screens (list, editor, export).

import { FORMS, leafFields, visible } from './forms.js';
import { db, newId, requestPersistence } from './db.js';
import { h, renderField } from './fields.js';
import {
  APP_VERSION, buildExport, canShareFiles, downloadFiles, entryTitle, REPORT_CSS, reportBody, setLogoData, shareFiles,
} from './export.js';

const app = document.getElementById('app');
const printRoot = document.getElementById('print');
let flushPending = null; // editor's pending-save flush, run before leaving a screen

// ---------- helpers ----------

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtBytes = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
const isExported = (e) => e.exportedAt && e.exportedAt >= e.updatedAt;
const go = (hash) => { location.hash = hash; };

function status(e) {
  if (isExported(e)) return ['Exported', 'ok'];
  if (e.exportedAt) return ['Edited since export', 'warn'];
  return e.complete ? ['Complete', 'done'] : ['Draft', 'draft'];
}

function topBar(left, title, right) {
  return h('header', { class: 'bar' }, h('div', { class: 'bar-l' }, left), h('h1', { text: title }), h('div', { class: 'bar-r' }, right));
}

function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status', text: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- list ----------

let filter = 'all';

async function listScreen() {
  const entries = await db.all();
  const shown = filter === 'pending' ? entries.filter((e) => !isExported(e)) : entries;
  const selected = new Set();
  const pendingCount = entries.filter((e) => !isExported(e)).length;

  const exportBtn = h('button', {
    class: 'btn primary', disabled: true, text: 'Export',
    onclick: () => go('#/export/' + [...selected].join(',')),
  });
  const refreshExport = () => { exportBtn.disabled = !selected.size; exportBtn.textContent = selected.size ? `Export ${selected.size}` : 'Export'; };

  const card = (e) => {
    const [label, cls] = status(e);
    const cb = h('input', {
      type: 'checkbox', 'aria-label': 'Select for export',
      onclick: (ev) => ev.stopPropagation(),
      onchange: (ev) => { ev.target.checked ? selected.add(e.id) : selected.delete(e.id); refreshExport(); },
    });
    return h('li', { class: 'card entry', onclick: () => go('#/e/' + e.id) },
      h('label', { class: 'pick', onclick: (ev) => ev.stopPropagation() }, cb),
      h('div', { class: 'grow' },
        h('div', { class: 'kicker', text: FORMS[e.formId].short }),
        h('div', { class: 'title', text: entryTitle(e) }),
        h('div', { class: 'meta', text: `${e.data.date ? fmtDate(e.data.date + 'T12:00') : fmtDate(e.createdAt)} · edited ${fmtDate(e.updatedAt)}` })),
      h('span', { class: 'badge ' + cls, text: label }));
  };

  const selectPending = () => {
    app.querySelectorAll('li.entry').forEach((li, i) => {
      const e = shown[i];
      const cb = li.querySelector('input');
      cb.checked = !isExported(e);
      cb.checked ? selected.add(e.id) : selected.delete(e.id);
    });
    refreshExport();
  };

  app.replaceChildren(
    topBar(h('img', { class: 'logo', src: 'icons/logo.png', alt: 'AEC' }), 'MTO Field Forms', null),
    h('main', { class: 'wrap' },
      h('div', { class: 'new-grid' }, Object.values(FORMS).map((f) => h('button', {
        class: 'card new', onclick: () => go('#/new/' + f.id),
      }, h('span', { class: 'plus', text: '+' }), h('span', {}, h('strong', { text: 'New ' + f.short }), h('small', { text: f.title })))),
      ),
      h('div', { class: 'tabs', role: 'tablist' },
        ...[['all', `All (${entries.length})`], ['pending', `Not exported (${pendingCount})`]].map(([k, t]) => h('button', {
          role: 'tab', 'aria-selected': filter === k, class: filter === k ? 'on' : '', text: t,
          onclick: () => { filter = k; listScreen(); },
        }))),
      shown.length
        ? h('ul', { class: 'list' }, shown.map(card))
        : h('p', { class: 'empty', text: entries.length ? 'Everything has been exported.' : 'No forms yet. Start one above; it saves on the phone as you type, even with no signal.' }),
      h('p', { class: 'foot muted', text: `v${APP_VERSION} · ${navigator.onLine ? 'Online' : 'Offline'} · data is stored on this device until exported` })),
    h('footer', { class: 'actions' },
      h('button', { class: 'btn ghost', text: 'Select not exported', disabled: !pendingCount, onclick: selectPending }),
      exportBtn));
}

// ---------- editor ----------

async function editorScreen({ id, formId }) {
  let entry = id ? await db.get(id) : null;
  if (id && !entry) return go('#/');
  const isNew = !entry;
  const form = FORMS[entry?.formId || formId];
  if (!form) return go('#/');
  if (isNew) {
    const now = new Date().toISOString();
    entry = { id: newId(), formId: form.id, createdAt: now, updatedAt: now, complete: false, exportedAt: null, data: {} };
    for (const f of leafFields(form)) if (f.today) entry.data[f.k] = new Date().toLocaleDateString('en-CA');
  }
  const data = entry.data;
  let dirty = false;
  let timer;
  const savedLbl = h('span', { class: 'saved muted', text: isNew ? 'Not saved yet' : 'Saved' });

  const save = async () => {
    clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    entry.updatedAt = new Date().toISOString();
    try {
      await db.put(entry);
      savedLbl.textContent = 'Saved';
    } catch (err) {
      dirty = true;
      savedLbl.textContent = 'NOT SAVED';
      alert('Could not save: ' + (err?.message || err) + '\nPhone storage may be full.');
    }
  };
  flushPending = save;

  const conds = []; // [element, conditions] pairs re-checked on every change
  const counters = [];
  const changed = () => {
    dirty = true;
    savedLbl.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(save, 500);
    conds.forEach(([el, c]) => { el.hidden = !visible(c, data); });
    counters.forEach((fn) => fn());
  };

  const filled = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);
  const build = (fields, inherited) => fields.map((f) => {
    const c = f.showIf ? [...inherited, ...[].concat(f.showIf)] : inherited;
    const el = f.group
      ? h('div', { class: 'group' + (f.indent ? ' indent' : '') + (f.title ? ' titled' : '') }, f.title ? h('div', { class: 'group-title', text: f.title }) : null, build(f.fields, c))
      : renderField(f, data, changed);
    if (f.showIf) { conds.push([el, c]); el.hidden = !visible(c, data); }
    if (f.app) el.classList.add('app-extra');
    return el;
  });

  const sections = form.sections.map((s, i) => {
    const keys = [];
    const collect = (fs) => fs.forEach((f) => (f.group ? collect(f.fields) : keys.push(f.k)));
    collect(s.fields);
    const count = h('span', { class: 'count' });
    const paintCount = () => { count.textContent = `${keys.filter((k) => filled(data[k])).length}/${keys.length}`; };
    counters.push(paintCount);
    paintCount();
    return h('details', { class: 'card section', open: i === 0 || null },
      h('summary', {}, h('span', { text: s.title }), count),
      h('div', { class: 'section-body' }, build(s.fields, [])));
  });

  const done = async () => {
    const missing = leafFields(form).filter((f) => f.required && visible(f.conds, data) && !filled(data[f.k]));
    app.querySelectorAll('.field.invalid').forEach((el) => el.classList.remove('invalid'));
    if (missing.length) {
      missing.forEach((f) => {
        const el = app.querySelector(`.field[data-k="${f.k}"]`);
        el?.classList.add('invalid');
        el?.closest('details')?.setAttribute('open', '');
      });
      if (!confirm(`Missing required: ${missing.map((f) => f.label).join(', ')}.\n\nKeep it as a draft for now?`)) {
        app.querySelector('.field.invalid input, .field.invalid textarea')?.focus();
        return;
      }
      if (entry.complete) { entry.complete = false; dirty = true; }
    } else if (!entry.complete) {
      entry.complete = true; dirty = true;
    }
    if (isNew && !Object.values(data).some(filled)) return go('#/'); // nothing entered
    dirty = dirty || isNew;
    await save();
    go('#/');
  };

  const remove = async () => {
    if (!confirm('Delete this form permanently? This cannot be undone.')) return;
    clearTimeout(timer); dirty = false;
    await db.delete(entry.id);
    toast('Deleted');
    go('#/');
  };

  const print = () => {
    printRoot.innerHTML = `<div class="report">${reportBody(entry)}</div>`;
    window.print();
  };

  app.replaceChildren(
    topBar(h('button', { class: 'btn ghost back', text: '‹ Forms', onclick: done }), form.short, savedLbl),
    h('main', { class: 'wrap editor' },
      h('p', { class: 'form-title', text: form.title }),
      sections,
      h('div', { class: 'danger-zone' }, isNew ? null : h('button', { class: 'btn danger', text: 'Delete this form', onclick: remove }))),
    h('footer', { class: 'actions' },
      h('button', { class: 'btn ghost', text: 'Print / PDF', onclick: print }),
      h('button', { class: 'btn primary', text: 'Done', onclick: done })));
  window.scrollTo(0, 0);
}

// ---------- export ----------

async function exportScreen(ids) {
  const entries = (await Promise.all(ids.map((id) => db.get(id)))).filter(Boolean);
  if (!entries.length) return go('#/');
  let includeMedia = true;
  let result;

  const info = h('div', { class: 'card pad' });
  const shareBtn = h('button', { class: 'btn primary big', text: 'Share / Save to OneDrive' });
  const markBtn = h('button', { class: 'btn ghost', text: 'Mark as exported without sharing' });

  const prepare = () => {
    result = buildExport(entries, { includeMedia });
    const { summary, files } = result;
    info.replaceChildren(
      h('p', {}, h('strong', { text: `${summary.count} form${summary.count > 1 ? 's' : ''}` }), ` → ${summary.files} files, ${fmtBytes(summary.bytes)}`),
      h('ul', { class: 'files' }, files.map((f) => h('li', {}, h('span', { text: f.name }), h('small', { class: 'muted', text: fmtBytes(f.size) })))));
  };

  const markExported = async () => {
    const now = new Date().toISOString();
    for (const e of entries) { e.exportedAt = now; await db.put(e); }
  };

  shareBtn.onclick = () => {
    // No awaits before share(): iOS requires it to run directly in the tap.
    if (canShareFiles(result.files)) {
      shareFiles(result.files).then(async () => {
        await markExported();
        toast(`Exported ${entries.length} form${entries.length > 1 ? 's' : ''}`);
        go('#/');
      }).catch((err) => {
        if (err.name !== 'AbortError') alert('Share failed: ' + err.message);
      });
    } else {
      downloadFiles(result.files);
      setTimeout(async () => {
        if (confirm('Files downloaded. Mark these forms as exported?')) { await markExported(); go('#/'); }
      }, result.files.length * 250 + 800);
    }
  };
  markBtn.onclick = async () => {
    if (confirm('Mark as exported without sending any files?')) { await markExported(); go('#/'); }
  };

  prepare();
  app.replaceChildren(
    topBar(h('button', { class: 'btn ghost back', text: '‹ Cancel', onclick: () => go('#/') }), 'Export', null),
    h('main', { class: 'wrap' },
      h('ol', { class: 'steps muted' },
        h('li', { text: 'Tap Share / Save to OneDrive.' }),
        h('li', {}, 'Choose ', h('strong', { text: 'OneDrive' }), ' (or ', h('strong', { text: 'Save to Files → OneDrive' }), ').'),
        h('li', { text: 'Pick the project folder and tap Save / Upload.' })),
      h('label', { class: 'card pad toggle' },
        h('input', { type: 'checkbox', checked: true, onchange: (e) => { includeMedia = e.target.checked; prepare(); } }),
        h('span', { text: 'Include photos, sketches & signatures as image files' })),
      info,
      h('p', { class: 'muted small', text: 'The .json holds the raw data, the .csv files open in Excel, and each _report.html prints like the paper form (open it and choose Print → Save as PDF).' })),
    h('footer', { class: 'actions col' }, shareBtn, markBtn));
}

// ---------- router ----------

async function route() {
  if (flushPending) { const f = flushPending; flushPending = null; await f(); }
  const [, a, b] = location.hash.split('/');
  if (a === 'new') return editorScreen({ formId: b });
  if (a === 'e') return editorScreen({ id: b });
  if (a === 'export') return exportScreen((b || '').split(',').filter(Boolean));
  return listScreen();
}

// Flush unsaved edits if the app is backgrounded or closed mid-form.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPending?.(); });
window.addEventListener('pagehide', () => flushPending?.());
window.addEventListener('hashchange', route);
window.addEventListener('online', () => location.hash.length < 3 && listScreen());
window.addEventListener('offline', () => location.hash.length < 3 && listScreen());

document.head.append(h('style', { text: REPORT_CSS }));

// Embed the logo as a data URL so exported reports display it anywhere.
fetch('icons/logo.png').then((r) => r.blob()).then((b) => new Promise((res) => {
  const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b);
})).then(setLogoData).catch(() => {});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
requestPersistence();
route();
