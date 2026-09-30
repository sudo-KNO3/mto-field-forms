"""Build fill-ready Word templates for the app from the golden templates.

Reads templates/docx/*.docx (Word's own .doc -> .docx conversion of the golden
templates) and writes src/templates/<form>.json: every part of the .docx, with
{{tags}} placed in the exact cells a person would write in. The app fills the
tags on the phone (src/js/docx.js) and zips the parts back into a .docx.

Tags (each sits alone in its own run or paragraph):
  text:key[,key2]        value(s) as text
  choice:key             all options, chosen one(s) bold and boxed ("circled")
  check:key              options with check boxes
  line:key:i:n:chars     line i of n on a ruled block, about `chars` wide
  image:key              inline image (signature)
  sketch:key:n           paragraph -> sketch image, else n blank paragraphs
  cell:table:col         pumping-test grid cell; its row is repeated per reading
  photos                 paragraph -> photo appendix pages

Usage:  python scripts/build_templates.py      (needs: pip install lxml)
"""

import base64
import copy
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % W_NS
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'

# ---- field placement rules, per section heading of the paper form ----------
# (label as printed, action, key(s)). Labels are compared lower-case without
# the trailing colon; a trailing * means "starts with" (for labels containing
# symbols such as µ or °, which Word stores outside the text).

SALT = {
    'file': 'MTO Field Survey (Salt Claim).docx',
    'rules': {
        'GENERAL': [
            ('Property Owner', 'next', 'owner'), ('Date', 'next', 'date'),
            ('AEC Project Number', 'next', 'aecProject'), ('Address', 'next', 'address'),
            ('Telephone Number', 'next', 'phone'), ('Email', 'next', 'email'),
        ],
        'BACKGROUND': [
            ('Purchased property', 'next', 'purchased'), ('Prior investigations', 'next', 'priorInvestigations'),
            ('Company', 'next', 'company'), ('Number of samples', 'next', 'numSamples'),
            ('Quantity / Quality Issues', 'next', 'qqIssues'),
            ('Do Residents Drink Water?', 'nextchoice', 'residentsDrink'),
            ('Is Water Tested?', 'next', 'waterTested'), ('Number of Residents', 'next', 'numResidents'),
        ],
        'FIELD CHEMISTRY DATA': [
            ('Colour / Clarity', 'next', 'colour'), ('Odour?', 'next', 'odour'), ('Sediment?', 'next', 'sediment'),
            ('Location', 'next', 'chemLocation'), ('Raw / Filtered', 'next', 'rawFiltered'),
        ],
        'WELL DESCRIPTION': [
            ('Number of wells', 'next', 'numWells'), ('Dug / Drilled', 'self', 'dugDrilled'),
            ('Overburden / Bedrock', 'self', 'overburdenBedrock'), ('Date of installation', 'next', 'wellInstallDate'),
            ('Depth (m btoc)', 'next', 'depth'), ('Diameter (mm)', 'next', 'diameter'), ('Pump rate', 'next', 'pumpRate'),
            ('Location', 'next', 'wellLocation'), ('Water level(m btoc)', 'next', 'waterLevel'),
            ('Well Pit (y / n)', 'next', 'wellPit'), ('Stick-up (m)', 'next', 'stickUp'),
            ('Testing', 'next', 'testing'), ('Problems', 'next', 'wellProblems'), ('Miscellaneous', 'next', 'misc'),
        ],
        'LAND USE': [
            ('Residential / Agricultural / Commercial', 'self', 'landUse'), ('Neighbours', 'nextlines', 'neighbours'),
        ],
        'SEPTIC BED': [
            ('Location', 'next', 'septicLocation'), ('Age', 'next', 'septicAge'),
            ('Problems', 'next', 'septicProblems'), ('Pumping Frequency', 'next', 'pumpingFreq'),
        ],
        'WATER TREATMENT SYSTEMS': [
            ('System present', 'nextchoice', 'systemPresent'), ('Make', 'next', 'wtMake'),
            ('Date of installation', 'next', 'wtInstallDate'), ('Services', 'nextchoice', 'services'),
            ('Type', 'nextchoice', 'wtType'), ('Salt type', 'nextchoice', 'saltType'),
            ('Number of bags used per month', 'next', 'bagsPerMonth'),
            ('Backwash frequency, volume, & discharge location', 'next', 'softenerBackwash'),
            ('Backwash frequency, volume, & discharge location', 'next', 'roBackwash'),  # 2nd occurrence (R.O.)
            ('Cartridge / Greensand / Other (specify)', 'selfnext', 'filtrationType', 'filtrationOther'),
            ('Cartridge size*', 'next', 'cartridgeSize'),
            ('Make, model, & location', 'next', 'disinfection'),
        ],
    },
    'lines': [("PROPERTY OWNER'S STATEMENT", 'statement'), ('SURFACE DRAINAGE', 'drainage'), ('SURFICIAL GEOLOGY', 'geology')],
    'sketch': ('PROPERTY LAYOUT SKETCH', 'layoutSketch', 'after'),
}

PRECON = {
    'file': 'MTO Preconstruction Well Testing Field Form - Template.docx',
    'rules': {
        'GENERAL': [
            ('Location', 'next', 'location'), ('Project', 'next', 'project'), ('Owner', 'next', 'owner'),
            ('Date', 'next', 'date'), ('Person Interviewed', 'next', 'interviewed'), ('Email', 'next', 'email'),
            ('Telephone Number', 'next', 'phone'),
        ],
        'BACKGROUND': [
            ('Owned Property / Tenant Since', 'next', 'ownedSince'), ('Current Problems?', 'next', 'currentProblems'),
            ('Water Use (# of residents)', 'next', 'waterUse'),
            ('Prior investigations / Routine Testing?', 'next', 'priorTesting'),
        ],
        'WELL DESCRIPTION': SALT['rules']['WELL DESCRIPTION'][:11],
        'LAND USE': SALT['rules']['LAND USE'],
        'SEPTIC BED': SALT['rules']['SEPTIC BED'],
        'FIELD CHEMISTRY DATA': [
            ('Conductivity*', 'next', 'conductivity'), ('Temperature*', 'next', 'temperature'), ('pH', 'next', 'ph'),
            *SALT['rules']['FIELD CHEMISTRY DATA'],
        ],
        'WATER TREATMENT SYSTEMS': [
            ('System present', 'nextchoice', 'systemPresent'),
            ('Type (filter, RO, UV, softener, other)', 'next', 'wtType,wtTypeOther'),
            ('Date of installation', 'next', 'wtInstallDate'), ('Services', 'nextchoice', 'services'),
        ],
        'SIGN OFF': [('Name', 'next', 'signName'), ('Signature', 'nextimage', 'signature'), ('Date', 'next', 'signDate')],
    },
    'lines': [
        ("PROPERTY OWNER'S STATEMENT", 'statement'), ('SURFACE DRAINAGE', 'drainage'), ('SURFICIAL GEOLOGY', 'geology'),
        ('Deviations from testing procedures', 'deviations'), ('Limitations of results', 'limitations'),
    ],
    'sketch': ('WELL LOCATION SKETCH', 'wellSketch', 'table'),
    'form10': True,
}

FORMS = {'salt': SALT, 'precon': PRECON}


# ---- helpers -----------------------------------------------------------------

def el(tag, attrs=None, *children):
    e = etree.Element(W + tag)
    for k, v in (attrs or {}).items():
        e.set(W + k, str(v))
    for c in children:
        e.append(c)
    return e


def text_of(node):
    return ''.join(t.text or '' for t in node.iter(W + 't'))


def norm(s):
    s = re.sub(r'\s+', ' ', s.replace('’', "'")).strip()
    return s[:-1].strip().lower() if s.endswith(':') else s.lower()


def tag_run(tag):
    t = el('t')
    t.set(XML_SPACE, 'preserve')
    t.text = '{{%s}}' % tag
    if tag.startswith('line:'):  # some ruled tables carry a larger paragraph style; keep entries at body size
        return el('r', None, el('rPr', None, el('sz', {'val': 20}), el('szCs', {'val': 20})), t)
    return el('r', None, t)


def para_text(p):
    return text_of(p).strip()


def is_title(p):
    ps = p.find(f'{W}pPr/{W}pStyle')
    return ps is not None and ps.get(W + 'val') == 'Title'


def cell_width(tc):
    w = tc.find(f'{W}tcPr/{W}tcW')
    return int(w.get(W + 'w')) if w is not None else 8856


def chars_for(width_twips):
    # Times New Roman 10 pt averages ~4.6 pt per character.
    return max(20, int(width_twips / 20 / 4.6))


def add_bottom_border(tc):
    tcpr = tc.find(W + 'tcPr')
    if tcpr is None:
        tcpr = el('tcPr')
        tc.insert(0, tcpr)
    if tcpr.find(W + 'tcBorders') is not None:
        return
    borders = el('tcBorders', None, el('bottom', {'val': 'single', 'sz': 6, 'space': 0, 'color': 'auto'}))
    # tcBorders comes after tcW / gridSpan / vMerge in the schema.
    idx = 0
    for i, c in enumerate(tcpr):
        if c.tag in (W + 'tcW', W + 'gridSpan', W + 'hMerge', W + 'vMerge'):
            idx = i + 1
    tcpr.insert(idx, borders)


def set_cell(tc, tag):
    """Replace a cell's content with one paragraph holding the tag run."""
    had_underscores = '___' in text_of(tc)
    paras = tc.findall(W + 'p')
    first = paras[0]
    for p in paras[1:]:
        tc.remove(p)
    for c in list(first):
        if c.tag != W + 'pPr':
            first.remove(c)
    first.append(tag_run(tag))
    if had_underscores:
        # The paper had "_____" text here; draw a real underline instead and move
        # the label's 12 pt gap from after the text to before it, so label, value
        # and line share one baseline (as in the General section).
        add_bottom_border(tc)
        label = tc.getprevious()
        label_p = label.find(W + 'p') if label is not None and label.tag == W + 'tc' else None
        before, after = 0, 240  # Normal style
        sp = label_p.find(f'{W}pPr/{W}spacing') if label_p is not None else None
        if sp is not None:
            before, after = int(sp.get(W + 'before', 0)), int(sp.get(W + 'after', 240))
        for para in (first, label_p):
            if para is not None:
                set_spacing(para, before + after, 0)


def set_spacing(p, before, after):
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = el('pPr'); p.insert(0, ppr)
    for sp in ppr.findall(W + 'spacing'):
        ppr.remove(sp)
    # spacing sits after pStyle/keepNext/pageBreakBefore/borders/tabs and before ind/jc/rPr
    pos = next((i for i, c in enumerate(ppr) if c.tag in (W + 'ind', W + 'jc', W + 'rPr')), len(ppr))
    ppr.insert(pos, el('spacing', {'before': before, 'after': after}))


def next_cell(tc):
    n = tc.getnext()
    while n is not None and n.tag != W + 'tc':
        n = n.getnext()
    return n


def following_table(p):
    for sib in p.itersiblings():
        if sib.tag == W + 'tbl':
            return sib
        if sib.tag == W + 'p' and para_text(sib) and not para_text(sib).startswith('('):
            break  # stop at the next real paragraph; skip guidance notes like "(e.g., ...)"
    return None


# ---- build -------------------------------------------------------------------

def build(form_id, spec):
    src = ROOT / 'templates' / 'docx' / spec['file']
    with ZipFile(src) as z:
        parts = {n: z.read(n) for n in z.namelist()}
    root = etree.fromstring(parts['word/document.xml'])
    body = root.find(W + 'body')
    placed = set()

    # 1. Label rules, scoped to the section heading above each cell.
    rules = {sec: list(rs) for sec, rs in spec['rules'].items()}
    section = None
    cells = []
    for node in body.iter(W + 'p', W + 'tc'):
        if node.tag == W + 'p':
            txt = para_text(node)
            if is_title(node) and txt:
                section = norm(txt).upper()
            elif txt.startswith('Sign off by'):
                section = 'SIGN OFF'
        elif node.tag == W + 'tc':
            cells.append((node, section))

    for tc, sec in cells:
        label = norm(''.join(text_of(p) for p in tc.findall(W + 'p')))
        if not label or sec not in rules:
            continue
        for i, rule in enumerate(rules[sec]):
            want = rule[0].lower()
            if (want.endswith('*') and label.startswith(want[:-1])) or label == norm(want):
                break
        else:
            continue
        rule = rules[sec].pop(i)
        action, keys = rule[1], rule[2:]
        nxt = next_cell(tc)
        if action == 'next':
            set_cell(nxt, 'text:' + keys[0])
        elif action == 'nextchoice':
            set_cell(nxt, 'choice:' + keys[0])
        elif action == 'nextimage':
            set_cell(nxt, 'image:' + keys[0])
        elif action == 'self':
            set_cell(tc, 'choice:' + keys[0])
        elif action == 'selfnext':
            set_cell(tc, 'choice:' + keys[0])
            set_cell(nxt, 'text:' + keys[1])
        elif action == 'nextlines':
            row = tc.getparent()
            col = list(row.findall(W + 'tc')).index(nxt)
            targets = [nxt]
            for r in row.itersiblings(W + 'tr'):
                rc = r.findall(W + 'tc')
                if norm(text_of(rc[0])) or len(rc) <= col:
                    break
                targets.append(rc[col])
            for j, t in enumerate(targets):
                set_cell(t, f'line:{keys[0]}:{j}:{len(targets)}:{chars_for(cell_width(t))}')
        for k in keys:
            placed.update(k.split(','))
    leftover = {sec: [r[0] for r in rs] for sec, rs in rules.items() if rs}
    if leftover:
        sys.exit(f'{form_id}: labels not found in template: {leftover}')

    # 2. Ruled free-text blocks: the table right after an anchor paragraph.
    paras = list(body.iter(W + 'p'))
    for anchor, key in spec['lines']:
        p = next((p for p in paras if norm(para_text(p)).startswith(norm(anchor))), None)
        tbl = following_table(p) if p is not None else None
        if tbl is None:
            sys.exit(f'{form_id}: no ruled table after "{anchor}"')
        rows = tbl.findall(W + 'tr')
        for i, r in enumerate(rows):
            tc = r.find(W + 'tc')
            set_cell(tc, f'line:{key}:{i}:{len(rows)}:{chars_for(cell_width(tc))}')
        placed.add(key)

    # 3. Sketch.
    anchor, key, mode = spec['sketch']
    head = next(p for p in paras if para_text(p).upper() == anchor)
    for br in head.iter(W + 'br'):
        if br.get(W + 'type') == 'page':
            run = br.getparent()
            run.remove(br)
            hppr = head.find(W + 'pPr')
            hppr.insert(1 if hppr.find(W + 'pStyle') is not None else 0, el('pageBreakBefore'))
            prev = head.getprevious()
            while prev is not None and prev.tag == W + 'p' and not para_text(prev):
                victim, prev = prev, prev.getprevious()
                victim.getparent().remove(victim)
    if mode == 'after':
        head.addnext(el('p', None, tag_run(f'sketch:{key}:0')))
    else:
        tc = following_table(head).find(f'{W}tr/{W}tc')
        n = len(tc.findall(W + 'p'))
        for p in tc.findall(W + 'p'):
            tc.remove(p)
        tc.append(el('p', None, tag_run(f'sketch:{key}:{n}')))
    placed.add(key)

    # 4. GPS row (app addition) appended to the General table.
    general = next(p for p in paras if is_title(p) and para_text(p).upper() == 'GENERAL')
    gtbl = following_table(general)
    last = gtbl.findall(W + 'tr')[-1]
    row = copy.deepcopy(last)
    for n in row.iter():  # copied paragraph ids must stay unique
        for a in [a for a in n.attrib if a.startswith('{http://schemas.microsoft.com/office/word/2010/wordml}')]:
            del n.attrib[a]
    label_tc, value_tc = row.findall(W + 'tc')[:2]
    lp = label_tc.find(W + 'p')
    for c in list(lp):
        if c.tag != W + 'pPr':
            lp.remove(c)
    t = el('t'); t.text = 'GPS Coordinates:'
    lp.append(el('r', None, t))
    set_cell(value_tc, 'text:gps')
    last.addnext(row)
    placed.add('gps')

    # 5. Sign-off designation (Precon): "Sign off by P.Geo. / P. Eng." -> choice.
    for p in paras:
        if para_text(p).startswith('Sign off by'):
            for c in list(p):
                if c.tag != W + 'pPr':
                    p.remove(c)
            t = el('t'); t.set(XML_SPACE, 'preserve'); t.text = 'Sign off by '
            p.append(el('r', None, t))
            p.append(tag_run('choice:signDesignation'))
            placed.add('signDesignation')

    # 5b. Sign-off table: bottom-align so names and dates sit level with the signature line.
    for p in paras:
        if para_text(p).startswith('Sign off by'):
            tbl = following_table(p)
            for tcp in tbl.iter(W + 'tcPr'):
                tcp.append(el('vAlign', {'val': 'bottom'}))

    # 6. Form 10: replace the embedded CorelDRAW picture with a native, fillable sheet.
    if spec.get('form10'):
        build_form10(body, parts)
        placed.update(['staticWL', 'refPoint', 'casingExt', 'pumpStart', 'pumpStop', 'pumping', 'recovery'])

    # 7. Photo appendix placeholder, just before the final section properties.
    sect = body.find(W + 'sectPr')
    sect.addprevious(el('p', None, tag_run('photos')))
    placed.add('photos')

    parts['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    out = {}
    for name, data in parts.items():
        if name.endswith(('.xml', '.rels')):
            out[name] = {'text': data.decode('utf-8')}
        else:
            out[name] = {'b64': base64.b64encode(data).decode('ascii')}
    dest = ROOT / 'src' / 'templates' / f'{form_id}.json'
    dest.write_text(json.dumps({'form': form_id, 'source': spec['file'], 'placed': sorted(placed), 'parts': out}), encoding='utf-8')
    print(f'{form_id}: {len(placed)} fields placed -> {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)')


FORM10_ROWS = 30
ARIAL = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'


def build_form10(body, parts):
    obj = next(r for r in body.iter(W + 'object'))
    obj_p = obj.getparent().getparent()
    rids = [e.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id') for e in obj.iter()
            if e.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]

    # "Form 10" heading starts a new page; drop the blank paragraphs that used to push it there.
    form10 = next(p for p in body.iter(W + 'p') if para_text(p) == 'Form 10')
    prev = form10.getprevious()
    while prev is not None and prev.tag == W + 'p' and not para_text(prev) and prev.find(f'.//{W}drawing') is None:
        victim, prev = prev, prev.getprevious()
        body.remove(victim)
    ppr = form10.find(W + 'pPr')
    ppr.insert(0, el('pageBreakBefore'))

    def p(text='', bold=False, size=20, jc=None, before=0, after=0, tag=None):
        rpr = ARIAL + ('<w:b/>' if bold else '') + f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
        run = f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{text}</w:t></w:r>' if text else ''
        tagrun = f'<w:r><w:rPr>{ARIAL}<w:sz w:val="{size}"/></w:rPr><w:t xml:space="preserve">{{{{{tag}}}}}</w:t></w:r>' if tag else ''
        return (f'<w:p><w:pPr><w:spacing w:before="{before}" w:after="{after}"/>' + (f'<w:jc w:val="{jc}"/>' if jc else '') +
                f'<w:rPr>{rpr}</w:rPr></w:pPr>{run}{tagrun}</w:p>')

    def tc(width, content, bottom=False, span=1, borders=None):
        b = borders or ('<w:tcBorders><w:bottom w:val="single" w:sz="6" w:space="0" w:color="auto"/></w:tcBorders>' if bottom else '')
        gs = f'<w:gridSpan w:val="{span}"/>' if span > 1 else ''
        return f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{gs}{b}</w:tcPr>{content}</w:tc>'

    def tbl(grid, rows, borders=''):
        g = ''.join(f'<w:gridCol w:w="{w}"/>' for w in grid)
        return (f'<w:tbl><w:tblPr><w:tblW w:w="{sum(grid)}" w:type="dxa"/>{borders}<w:tblLayout w:type="fixed"/>'
                f'<w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>'
                f'<w:tblGrid>{g}</w:tblGrid>{"".join(rows)}</w:tbl>')

    def tr(*cells, h=None, header=False):  # header rows repeat when the grid runs onto another page
        pr = (f'<w:trHeight w:val="{h}"/>' if h else '') + ('<w:tblHeader/>' if header else '')
        return '<w:tr>' + (f'<w:trPr>{pr}</w:trPr>' if pr else '') + ''.join(cells) + '</w:tr>'
    lbl = lambda t: p(t, before=200)
    val = lambda tag: p(before=200, tag=tag)

    fields = tbl([3900, 4956], [
        tr(tc(3900, lbl('Static Water Level (m):')), tc(4956, val('text:staticWL'), bottom=True)),
        tr(tc(3900, lbl('Reference Point:')), tc(4956, val('check:refPoint'))),
        tr(tc(3900, lbl('Casing Extension Above Ground Surface (m):')), tc(4956, val('text:casingExt'), bottom=True)),
    ])
    times = tbl([2500, 1928, 2500, 1928], [
        tr(tc(2500, lbl('Pumping Start Time:') + p('(hh:mm:ss)')), tc(1928, val('text:pumpStart'), bottom=True),
           tc(2500, lbl('Pumping Stop Time:') + p('(hh:mm:ss)')), tc(1928, val('text:pumpStop'), bottom=True)),
    ])
    grid_b = ('<w:tblBorders>' + ''.join(f'<w:{s} w:val="single" w:sz="{12 if s in ("top", "left", "bottom", "right") else 4}" w:space="0" w:color="auto"/>'
                                         for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV')) + '</w:tblBorders>')
    mid = '<w:tcBorders><w:right w:val="single" w:sz="12" w:space="0" w:color="auto"/></w:tcBorders>'
    head = lambda t: p(t, jc='center', size=18)
    cell = lambda tag: p(jc='center', size=18, tag=tag)
    # "Pumping:" / "Recovery:" captions are the grid's own first row (a separate table
    # would merge into it), and both header rows repeat if readings run onto another page.
    open_top = '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:right w:val="nil"/></w:tcBorders>'
    caption = lambda t: p(t, bold=True, before=120)
    measure = tbl([2214] * 4, [
        tr(tc(4428, caption('Pumping:'), span=2, borders=open_top), tc(4428, caption('Recovery:'), span=2, borders=open_top), header=True),
        tr(tc(2214, head('Time (hh:mm:ss)')), tc(2214, head('Water Level (m)'), borders=mid), tc(2214, head('Time (hh:mm:ss)')), tc(2214, head('Water Level (m)')), header=True),
        tr(tc(2214, cell('cell:pumping:t')), tc(2214, cell('cell:pumping:wl'), borders=mid),
           tc(2214, cell('cell:recovery:t')), tc(2214, cell('cell:recovery:wl')), h=250),
    ], grid_b)

    xml = (p('PUMPING TEST DOCUMENTATION', bold=True, size=28, jc='center', before=120, after=240)
           + fields + times + p('Measurements:', before=240) + measure + p())
    frag = etree.fromstring(f'<w:root xmlns:w="{W_NS}">{xml}</w:root>')
    for node in list(frag):
        obj_p.addprevious(node)
    body.remove(obj_p)

    # "Deviations ..." page starts fresh, as on the paper form.
    dev = next(p for p in body.iter(W + 'p') if para_text(p).startswith('Deviations from testing'))
    dppr = dev.find(W + 'pPr')
    if dppr is None:
        dppr = el('pPr'); dev.insert(0, dppr)
    dppr.insert(0, el('pageBreakBefore'))

    # Drop the now-unused OLE object and its preview image.
    rels_name = 'word/_rels/document.xml.rels'
    rels = etree.fromstring(parts[rels_name])
    for rel in list(rels):
        if rel.get('Id') in rids:
            parts.pop('word/' + rel.get('Target'), None)
            rels.remove(rel)
    parts[rels_name] = etree.tostring(rels, xml_declaration=True, encoding='UTF-8', standalone=True)


if __name__ == '__main__':
    for fid, spec in FORMS.items():
        build(fid, spec)
