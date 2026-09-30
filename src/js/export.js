// Export: turns saved entries into files (JSON, CSV, images, printable report)
// and hands them to the iOS share sheet so they can be saved to OneDrive.

import { FORMS, leafFields, visible } from './forms.js';
import { fmtGps } from './fields.js';
import { DOCX_MIME, fillDocument } from './docx.js';

export const APP_VERSION = '1.1.0';
const MEDIA = new Set(['photos', 'sketch', 'signature']);

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
export const slug = (s) => String(s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'untitled';
// Label as printed on the paper form: "Odour?" stays as is, "Depth" becomes "Depth:".
const lbl = (s) => esc(s) + (/[?:]$/.test(s) ? '' : ':');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function entryTitle(entry) {
  const form = FORMS[entry.formId];
  return form.summary.map((k) => entry.data[k]).filter(Boolean).join(' · ') || 'Untitled';
}

// Base name shared by all files belonging to one entry, e.g. SaltClaim_2026-09-30_Smith_a1b2
export function entryBase(entry) {
  const form = FORMS[entry.formId];
  return `${slug(form.short).replace(/-/g, '')}_${entry.data.date || entry.createdAt.slice(0, 10)}_${slug(entry.data.owner)}_${entry.id.slice(0, 4)}`;
}

// Text value of a field as it appears in CSV cells and the printed report.
export function displayValue(f, v) {
  if (v == null || v === '') return '';
  if (Array.isArray(v) && f.type === 'multi') return v.join('; ');
  if (f.type === 'gps') return fmtGps(v);
  if (f.type === 'table') return v.filter((r) => r.t || r.wl).map((r) => `${r.t || '?'} = ${r.wl || '?'}`).join('; ');
  return String(v);
}

function dataUrlToBlob(url) {
  const [head, b64] = url.split(',');
  const mime = head.match(/data:(.*?);/)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const csvCell = (v) => (/[",\r\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); // BOM so Excel reads µ/° correctly

// The filled golden template for one entry, as a Word file.
export function docxFile(entry, template) {
  return new File([fillDocument(template, entry)], `${entryBase(entry)}.docx`, { type: DOCX_MIME });
}

/**
 * Build all export files for the given entries.
 * `templates` maps formId -> loaded template (see docx.js loadTemplate); forms
 * without one are exported without a Word file.
 * Returns { files: File[], summary } — kept separate from sharing because iOS
 * only allows navigator.share() directly inside a tap, not after async work.
 */
export function buildExport(entries, { includeMedia = true, templates = {} } = {}) {
  const when = stamp();
  const files = [];
  const add = (name, content, type) => files.push(new File([content], name, { type }));
  const jsonEntries = [];

  for (const formId of Object.keys(FORMS)) {
    const form = FORMS[formId];
    const group = entries.filter((e) => e.formId === formId);
    if (!group.length) continue;
    const fields = leafFields(form);
    const header = ['Entry ID', 'Form', 'Status', 'Created', 'Last edited', ...fields.map((f) => `${f.section}: ${f.label}`)];
    const rows = [header];
    const readings = [['Entry ID', 'Owner', 'Location', 'Phase', 'Reading #', 'Time (hh:mm:ss)', 'Water Level']];

    for (const e of group) {
      const base = entryBase(e);
      const data = {};
      const row = [e.id, form.short, e.complete ? 'Complete' : 'Draft', e.createdAt, e.updatedAt];
      for (const f of fields) {
        let v = visible(f.conds, e.data) ? e.data[f.k] : undefined;
        if (MEDIA.has(f.type)) {
          const urls = [].concat(v || []).filter(Boolean);
          const names = urls.map((u, i) => {
            const ext = u.startsWith('data:image/png') ? 'png' : 'jpg';
            const name = `${base}_${f.k}${urls.length > 1 || f.type === 'photos' ? '-' + (i + 1) : ''}.${ext}`;
            if (includeMedia) files.push(new File([dataUrlToBlob(u)], name, { type: ext === 'png' ? 'image/png' : 'image/jpeg' }));
            return name;
          });
          v = f.type === 'photos' ? names : names[0];
          row.push(names.join('; '));
        } else {
          row.push(displayValue(f, v));
        }
        if (f.type === 'table') {
          (v || []).forEach((r, i) => (r.t || r.wl) && readings.push([e.id, e.data.owner || '', e.data.location || '', f.label.replace(/^Measurements - /, ''), i + 1, r.t || '', r.wl || '']));
        }
        if (v !== undefined && v !== '') data[f.k] = v;
      }
      rows.push(row);
      jsonEntries.push({ id: e.id, form: formId, formTitle: form.title, template: form.template, status: e.complete ? 'complete' : 'draft', createdAt: e.createdAt, updatedAt: e.updatedAt, data });
      if (templates[formId]) files.push(docxFile(e, templates[formId]));
    }
    add(`MTO_${slug(form.short).replace(/-/g, '')}_${when}.csv`, toCsv(rows), 'text/csv');
    if (readings.length > 1) add(`MTO_PumpingTest_${when}.csv`, toCsv(readings), 'text/csv');
  }

  const json = { app: 'MTO Field Forms', version: APP_VERSION, exportedAt: new Date().toISOString(), count: jsonEntries.length, entries: jsonEntries };
  files.unshift(new File([JSON.stringify(json, null, 2)], `MTO_export_${when}.json`, { type: 'application/json' }));

  const bytes = files.reduce((n, f) => n + f.size, 0);
  return { files, summary: { count: entries.length, files: files.length, bytes } };
}

export const canShareFiles = (files) => !!(navigator.canShare && navigator.canShare({ files }));

// Must be called synchronously from a tap handler.
export function shareFiles(files) {
  return navigator.share({ files, title: 'MTO field forms export' });
}

// Desktop fallback: download each file.
export function downloadFiles(files) {
  files.forEach((f, i) => setTimeout(() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, i * 250));
}

// ---- Printable report, laid out like the paper template ----

function renderFieldsHtml(fields, data) {
  let html = '';
  for (const f of fields) {
    if (f.group) {
      if (!visible([].concat(f.showIf || []), data)) continue;
      html += `<div class="grp${f.indent ? ' ind' : ''}">${f.title ? `<div class="gt">${esc(f.title)}:</div>` : ''}${renderFieldsHtml(f.fields, data)}</div>`;
      continue;
    }
    if (!visible([].concat(f.showIf || []), data)) continue;
    const v = data[f.k];
    if (f.type === 'photos') {
      if (v?.length) html += `<div class="photos">${v.map((u) => `<img src="${u}">`).join('')}</div>`;
    } else if (f.type === 'sketch') {
      html += v ? `<img class="sketch" src="${v}">` : '<div class="sketch empty"></div>';
    } else if (f.type === 'signature') {
      html += `<div class="r"><span class="l">${lbl(f.label)}</span><span class="v">${v ? `<img class="sig" src="${v}">` : ''}</span></div>`;
    } else if (f.type === 'table') {
      const rows = (v || []).filter((r) => r.t || r.wl);
      html += `<div class="tt">${esc(f.label.replace(/^Measurements - /, ''))}:</div><table><tr><th>Time (hh:mm:ss)</th><th>Water Level</th></tr>${rows.map((r) => `<tr><td>${esc(r.t)}</td><td>${esc(r.wl)}</td></tr>`).join('') || '<tr><td>&nbsp;</td><td></td></tr>'}</table>`;
    } else if (f.type === 'choice' || f.type === 'multi') {
      // Show every option like the paper, with the chosen one(s) circled.
      const chosen = [].concat(v || []);
      html += `<div class="r"><span class="l">${lbl(f.label)}</span><span class="v opts">${f.options.map((o) => `<span class="${chosen.includes(o) ? 'circ' : ''}">${esc(o)}</span>`).join(' / ')}</span></div>`;
    } else if (f.bare) {
      html += `<div class="block" style="min-height:${(f.rows || 3) * 1.55}em">${esc(v || '')}</div>`;
    } else {
      html += `<div class="r${f.type === 'textarea' ? ' ta' : ''}"><span class="l">${lbl(f.label)}</span><span class="v">${esc(displayValue(f, v))}</span></div>`;
    }
  }
  return html;
}

export function reportBody(entry) {
  const form = FORMS[entry.formId];
  let html = `<header class="rh"><img src="${LOGO_URL()}" alt=""><h1>${esc(form.title.toUpperCase())}</h1></header>`;
  for (const s of form.sections) {
    const tableSection = s.fields.some((f) => f.type === 'table');
    html += `<section class="${s.pageBreak ? 'pb' : ''}${tableSection ? ' pump' : ''}"><h2>${esc(s.title.toUpperCase())}</h2>`;
    const hint = s.fields.length === 1 && s.fields[0].hint;
    if (hint) html += `<p class="hint">(${esc(hint)})</p>`;
    html += renderFieldsHtml(s.fields, entry.data) + '</section>';
  }
  html += `<footer class="rf">${esc(form.short)} · Entry ${esc(entry.id.slice(0, 8))} · Last edited ${esc(new Date(entry.updatedAt).toLocaleString())}</footer>`;
  return html;
}

// Resolved at call time so the embedded logo works in exported standalone files too.
let logoData = '';
export function setLogoData(url) { logoData = url; }
const LOGO_URL = () => logoData || 'icons/logo.png';

export const REPORT_CSS = `
.report{font-family:"Times New Roman",Times,serif;color:#000;font-size:11pt;line-height:1.35;max-width:7in;margin:0 auto}
.report .rh{display:flex;align-items:center;gap:14px;margin-bottom:10px}
.report .rh img{width:44px;height:44px}
.report h1{font-size:16pt;margin:0;flex:1;text-align:center}
.report h2{font-size:10.5pt;margin:18px 0 8px;letter-spacing:.02em}
.report .hint{font-size:8pt;margin:-4px 0 6px}
.report .r{display:flex;gap:10px;margin:5px 0;break-inside:avoid}
.report .r .l{flex:0 0 38%}
.report .r .v{flex:1;border-bottom:1px solid #000;min-height:1.3em;white-space:pre-wrap}
.report .r .v.opts{border-bottom:none}
.report .circ{border:1.5px solid #000;border-radius:50%;padding:0 6px}
.report .grp.ind{margin-left:1.2em}
.report .gt,.report .tt{font-weight:bold;margin-top:8px}
.report .block{white-space:pre-wrap;background:repeating-linear-gradient(transparent 0 1.55em,#000 1.55em calc(1.55em + 1px));line-height:1.55em;padding-bottom:1px}
.report .sketch{display:block;max-width:100%;max-height:8in;margin:0 auto;border:1px solid #000}
.report .sketch.empty{height:6in}
.report .sig{max-height:50px}
.report .photos{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.report .photos img{width:100%;break-inside:avoid}
.report table{border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:9pt;margin-bottom:8px}
.report th,.report td{border:1px solid #000;padding:2px 6px;text-align:center}
.report .rf{margin-top:24px;font-size:8pt;color:#444;text-align:center}
@media print{.report .pb{break-before:page}}
`;
