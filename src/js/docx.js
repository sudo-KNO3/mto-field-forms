// Fills a golden template (src/templates/<form>.json, built by
// scripts/build_templates.py) with an entry's data and returns a .docx file.
// Pure and synchronous once the template is loaded, so it runs offline and
// can be unit-tested in Node.

import { FORMS, leafFields, visible } from './forms.js';
import { fmtUTM } from './geo.js';

const EMU_PER_INCH = 914400;
const MIN_READING_ROWS = 30; // blank rows printed on the paper Form 10 grid

const templates = {};
export async function loadTemplate(formId) {
  templates[formId] ??= fetch(`templates/${formId}.json`).then((r) => {
    if (!r.ok) throw new Error(`Template ${formId} not available`);
    return r.json();
  });
  return templates[formId];
}

const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- values ----------

function fieldValues(form, entry) {
  const fields = Object.fromEntries(leafFields(form).map((f) => [f.k, f]));
  const data = entry.data || {};
  const get = (k) => (fields[k] && visible(fields[k].conds, data) ? data[k] : undefined);
  const text = (k) => {
    const f = fields[k];
    const v = get(k);
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
    if (f?.type === 'location') return fmtUTM(v);
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  };
  return { fields, get, text };
}

// ---------- run builders ----------

// Rebuild run properties in schema order (rFonts, b, sz, szCs, u, bdr) so Word accepts them.
function rPr(base, { bold = false, boxed = false } = {}) {
  const pick = (name) => (base.match(new RegExp(`<w:${name}\\b[^>]*/>`)) || [''])[0];
  const b = bold ? '<w:b/>' : pick('b');
  const bdr = boxed ? '<w:bdr w:val="single" w:sz="8" w:space="0" w:color="000000"/>' : '';
  const inner = pick('rFonts') + b + pick('sz') + pick('szCs') + pick('u') + bdr;
  return inner ? `<w:rPr>${inner}</w:rPr>` : '';
}

function textRuns(text, base) {
  const lines = String(text).split(/\r?\n/);
  const body = lines.map((l, i) => (i ? '<w:br/>' : '') + `<w:t xml:space="preserve">${xmlEsc(l)}</w:t>`).join('');
  return `<w:r>${rPr(base)}${body}</w:r>`;
}

function choiceRuns(options, chosen, base, style) {
  if (style === 'check') {
    return options.map((o) => `<w:r>${rPr(base)}<w:t xml:space="preserve">${chosen.includes(o) ? '☒' : '☐'} ${xmlEsc(o)}     </w:t></w:r>`).join('');
  }
  return options.map((o, i) => (i ? `<w:r>${rPr(base)}<w:t xml:space="preserve"> / </w:t></w:r>` : '')
    + `<w:r>${rPr(base, { bold: chosen.includes(o), boxed: chosen.includes(o) })}<w:t xml:space="preserve">${chosen.includes(o) ? ' ' + xmlEsc(o) + ' ' : xmlEsc(o)}</w:t></w:r>`).join('');
}

// Greedy word wrap; used to spread long text over the ruled lines of the paper form.
export function wrap(text, width) {
  const out = [];
  for (const para of String(text).split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + word).length > width) { out.push(line); line = word; } else line = line ? line + ' ' + word : word;
    }
    out.push(line);
  }
  return out;
}

// ---------- images ----------

function dataUrlBytes(url) {
  const [head, b64] = url.split(',');
  const mime = head.match(/data:(.*?);/)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

export function imageSize(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) { // PNG: IHDR width/height
    const v = new DataView(bytes.buffer, bytes.byteOffset);
    return { w: v.getUint32(16), h: v.getUint32(20) };
  }
  let i = 2; // JPEG: walk markers to the first SOFn
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const m = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
      return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + len;
  }
  return { w: 800, h: 600 };
}

class Media {
  constructor() { this.items = []; }
  add(dataUrl, maxW, maxH) {
    const { mime, bytes } = dataUrlBytes(dataUrl);
    const n = this.items.length + 1;
    const ext = mime === 'image/png' ? 'png' : 'jpeg';
    const rid = `rIdMto${n}`;
    const { w, h } = imageSize(bytes);
    const scale = Math.min(maxW / w, maxH / h);
    const cx = Math.round(w * scale * EMU_PER_INCH);
    const cy = Math.round(h * scale * EMU_PER_INCH);
    this.items.push({ name: `word/media/mto${n}.${ext}`, bytes, rid, ext });
    const id = 5000 + n;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>`
      + `<wp:docPr id="${id}" name="Picture ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>`
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="mto${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr>`
      + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
      + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
      + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }
}

// ---------- fill ----------

const TAG_RUN = /<w:r>(<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)?<w:t xml:space="preserve">\{\{([^}]+)\}\}<\/w:t><\/w:r>/g;
const TAG_PARA = (tag) => new RegExp(`<w:p>(?:(?!</w:p>).)*?\\{\\{${tag}\\}\\}(?:(?!</w:p>).)*?</w:p>`, 'g');

export function fillDocument(template, entry) {
  const form = FORMS[entry.formId];
  const { fields, get, text } = fieldValues(form, entry);
  const media = new Media();
  let doc = template.parts['word/document.xml'].text;

  // 1. Pumping-test grid: repeat the tagged row once per reading (at least the paper's row count).
  doc = doc.replace(/<w:tr>(?:(?!<\/?w:tr[ >]).)*?\{\{cell:(?:(?!<\/?w:tr[ >]).)*?<\/w:tr>/g, (row) => {
    const tables = [...new Set([...row.matchAll(/\{\{cell:(\w+):/g)].map((m) => m[1]))];
    const data = Object.fromEntries(tables.map((t) => [t, (get(t) || []).filter((r) => r.t || r.wl)]));
    const n = Math.max(MIN_READING_ROWS, ...Object.values(data).map((d) => d.length));
    return Array.from({ length: n }, (_, i) => row.replace(TAG_RUN, (m, base = '', tag) => {
      const [, table, col] = tag.split(':');
      const v = data[table]?.[i]?.[col];
      return v ? textRuns(v, base) : '';
    })).join('');
  });

  // (Row patterns never cross another <w:tr>: some ruled tables are nested inside other tables.)
  // 1b. Ruled free-text blocks: one line of text per ruled row, adding ruled rows when the text is
  //     longer than the paper allows. Added rows keep the borders but drop other text (e.g. a label).
  doc = doc.replace(/<w:tr[ >](?:(?!<\/?w:tr[ >]).)*?\{\{line:(\w+):(\d+):(\d+):(\d+)\}\}(?:(?!<\/?w:tr[ >]).)*?<\/w:tr>/g, (row, key, i, n, chars) => {
    [i, n, chars] = [+i, +n, +chars];
    const lines = wrap(text(key), chars);
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    const fill = (r, line) => r.replace(TAG_RUN, (m, base = '') => (line ? textRuns(line, base) : ''));
    if (i < n - 1 || lines.length <= n) return fill(row, lines[i] || '');
    const blank = row.replace(/(<w:t(?: [^>]*)?>)(?!\{\{)[^<]*(<\/w:t>)/g, '$1$2');
    return fill(row, lines[i]) + lines.slice(n).map((l) => fill(blank, l)).join('');
  });

  // 2. Sketch paragraph: the drawing, or the blank space the paper leaves for one.
  doc = doc.replace(/<w:p>(?:(?!<\/w:p>).)*?\{\{sketch:(\w+):(\d+)\}\}(?:(?!<\/w:p>).)*?<\/w:p>/g, (m, key, n) => {
    const url = get(key);
    if (url) return `<w:p><w:pPr><w:spacing w:before="120" w:after="120"/><w:jc w:val="center"/></w:pPr>${media.add(url, 6.0, 7.5)}</w:p>`;
    return '<w:p/>'.repeat(Math.max(1, +n));
  });

  // 3. Photo appendix.
  doc = doc.replace(TAG_PARA('photos'), () => {
    const photos = get('photos') || [];
    if (!photos.length) return '';
    return '<w:p><w:pPr><w:pStyle w:val="Title"/><w:pageBreakBefore/><w:jc w:val="left"/></w:pPr><w:r><w:t>SITE PHOTOGRAPHS</w:t></w:r></w:p>'
      + photos.map((url, i) => `<w:p><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/><w:jc w:val="center"/></w:pPr>${media.add(url, 6.0, 3.6)}</w:p>`
        + `<w:p><w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>Photo ${i + 1}</w:t></w:r></w:p>`).join('');
  });

  // 4. Inline tags.
  doc = doc.replace(TAG_RUN, (m, base = '', tag) => {
    const [kind, key, ...rest] = tag.split(':');
    if (kind === 'text') {
      const v = key.split(',').map(text).filter(Boolean).join(' — ');
      return v ? textRuns(v, base) : '';
    }
    if (kind === 'choice' || kind === 'check') {
      const chosen = [].concat(get(key) || []);
      return choiceRuns(fields[key].options, chosen, base, kind);
    }
    if (kind === 'image') {
      const url = get(key);
      return url ? media.add(url, 2.0, 0.45) : '';
    }
    return '';
  });

  // 5. Package parts.
  const parts = { ...template.parts, 'word/document.xml': { text: doc } };
  if (media.items.length) {
    const relsName = 'word/_rels/document.xml.rels';
    const rels = media.items.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.name.slice(5)}"/>`).join('');
    parts[relsName] = { text: parts[relsName].text.replace('</Relationships>', rels + '</Relationships>') };
    let types = parts['[Content_Types].xml'].text;
    for (const ext of new Set(media.items.map((m) => m.ext))) {
      if (!new RegExp(`Extension="${ext}"`, 'i').test(types)) types = types.replace('<Default ', `<Default Extension="${ext}" ContentType="image/${ext}"/><Default `);
    }
    parts['[Content_Types].xml'] = { text: types };
    for (const m of media.items) parts[m.name] = { bytes: m.bytes };
  }
  const title = `${form.title} — ${[entry.data.owner, entry.data.date].filter(Boolean).join(', ')}`;
  parts['docProps/core.xml'] = { text: parts['docProps/core.xml'].text.replace(/<dc:title>[^<]*<\/dc:title>/, `<dc:title>${xmlEsc(title)}</dc:title>`) };
  return zip(parts);
}

// ---------- zip (stored, no compression) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function b64Bytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function zip(parts) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  // [Content_Types].xml first, as Office writes it.
  const names = Object.keys(parts).sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : 0));
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const name of names) {
    const p = parts[name];
    const data = p.bytes || (p.text != null ? enc.encode(p.text) : b64Bytes(p.b64));
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true); cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, nameBytes.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, names.length, true); end.setUint16(10, names.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const c of all) { out.set(c, pos); pos += c.length; }
  return out;
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
