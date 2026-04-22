from flask import Flask, render_template, request, jsonify
import json
import re
import sqlite3
from pathlib import Path

app = Flask(__name__)

VERSION = '1.1'

BASE_DIR = Path(__file__).parent
TEMPLATES_DIR = BASE_DIR / 'data' / 'templates'
ABBREVIATIONS_FILE = BASE_DIR / 'data' / 'abbreviations.json'
DB_PATH = BASE_DIR / 'data' / 'charting.db'


# ── Database ──────────────────────────────────────────────────────────────────

def _db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def init_db():
    with _db() as conn:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS patients (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL,
                created_at  TEXT    DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS charts (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id    INTEGER NOT NULL REFERENCES patients(id),
                template_id   TEXT    NOT NULL,
                template_name TEXT,
                fields        TEXT    NOT NULL,
                chart_text    TEXT    NOT NULL,
                created_at    TEXT    DEFAULT (datetime('now','localtime')),
                updated_at    TEXT    DEFAULT (datetime('now','localtime'))
            );
        ''')


init_db()

with open(ABBREVIATIONS_FILE) as f:
    ABBREVIATIONS = json.load(f)

ABBREVS_SORTED = sorted(ABBREVIATIONS.items(), key=lambda x: len(x[0]), reverse=True)

# Single-pass protection regex — alternation ensures longest/most-specific match wins
# and the matched span is never re-scanned, so tokens can't nest.
_PROTECT_RE = re.compile(
    r'\d+/\d+'                                                         # BP: 140/88
    r'|\d+\.?\d*\s*(?:mg|mcg|mEq|mL|ml|L|g|kg|lbs?|cm|mm|in|%)\b'   # doses/units
    r'|\d+\s*(?:yo|y/o)\b'                                            # ages: 58yo
    r'|x\s*\d+\s*[dwmyDWMY]\b'                                        # duration: x3d
    r'|(?<![a-zA-Z])\d+\.?\d*(?![a-zA-Z])',                           # standalone numbers (not DM2, A1C)
    re.IGNORECASE,
)
_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'


def _n_to_alpha(n):
    """Convert non-negative int to a digit-free alphabetic string (A, B…Z, AA, AB…)."""
    if n == 0:
        return 'A'
    s = ''
    while n > 0:
        s = _ALPHA[n % 26] + s
        n //= 26
    return s


def expand_text(text):
    """Expand medical abbreviations while preserving numbers / measurement patterns.

    Uses a single-pass protect-then-restore strategy so protection tokens are
    never re-scanned by subsequent patterns.  Tokens contain no digits, which
    prevents the plain-number pattern from corrupting them.
    """
    protected = {}
    count = [0]

    def protect(match):
        key = f'\x01PROT{_n_to_alpha(count[0])}\x01'  # \x01 = non-word char, all-alpha body
        protected[key] = match.group(0)
        count[0] += 1
        return key

    result = _PROTECT_RE.sub(protect, text)  # single pass — no token-within-token corruption

    for abbrev, expansion in ABBREVS_SORTED:
        result = re.sub(r'\b' + re.escape(abbrev) + r'\b', expansion, result, flags=re.IGNORECASE)

    for key, val in protected.items():
        result = result.replace(key, val)

    return result


VITAL_PATTERNS = {
    'bp':    re.compile(r'\bBP\s*(\d{2,3}/\d{2,3})', re.IGNORECASE),
    'hr':    re.compile(r'\bHR\s*(\d{2,3})', re.IGNORECASE),
    'rr':    re.compile(r'\bRR\s*(\d{1,2})', re.IGNORECASE),
    'temp':  re.compile(r'\bT(?:emp)?\s*([\d]{2,3}\.?\d?)', re.IGNORECASE),
    'o2sat': re.compile(r'\b(?:O2|SpO2|O2sat)\s*([\d]{2,3}%?)', re.IGNORECASE),
    'weight': re.compile(r'\bWt\s*([\d.]+\s*(?:lbs?|kg)?)', re.IGNORECASE),
    'height': re.compile(r'\bHt\s*([\d.\'"]+\s*(?:in|cm)?)', re.IGNORECASE),
}

EXAM_SYSTEM_KEYWORDS = {
    'general': ['NAD', 'WD/WN', 'WD', 'WN', 'comfortable', 'cooperative', 'uncomfortable', 'distressed'],
    'heent':   ['PERRL', 'PERRLA', 'EOMI', 'normocephalic', 'NC/AT', 'pharynx', 'TM', 'sclera', 'conjunctiva'],
    'neuro':   ['A&Ox4', 'A&Ox3', 'A&O', 'CN intact', 'strength WNL', 'oriented', 'sensation WNL', 'reflexes'],
    'resp':    ['CTABL', 'CTAB', 'CTA', 'wheeze', 'rhonchi', 'rales', 'crackles', 'diminished', 'labored'],
    'cv':      ['RRR', 'irregular', 'tachycardic', 'bradycardic', 'S1', 'S2', 'NMR', 'no MRG', 'MRG', 'murmur'],
    'abd':     ['soft', 'NT', 'ND', 'BS+', 'NABS', 'tender', 'distended', 'guarding', 'rebound', 'hepatomegaly'],
    'ext':     ['no edema', 'edema', 'no CCE', 'CCE', '2+ pulses', 'pulses', 'clubbing', 'cyanosis', 'warm'],
    'skin':    ['no rash', 'rash', 'intact', 'lesion', 'wound', 'erythema', 'moist', 'dry'],
    'musculo': ['full ROM', 'limited ROM', 'tenderness', 'swelling', 'deformity', 'crepitus'],
}

SECTION_ALIASES = {
    # Standard clinical prefixes
    'cc': 'cc', 'chief complaint': 'cc', 'c/c': 'cc',
    'hpi': 'hpi', 'history': 'hpi',
    'pmh': 'pmh', 'past medical': 'pmh', 'past hx': 'pmh',
    'psh': 'psh', 'past surgical': 'psh',
    'fh': 'fh', 'family hx': 'fh', 'family history': 'fh',
    'sh': 'sh', 'social hx': 'sh', 'social history': 'sh',
    'meds': 'meds', 'medications': 'meds', 'rx': 'meds',
    'allergies': 'allergies', 'allergy': 'allergies', 'nkda': 'allergies',
    'ros': 'ros',
    'vitals': 'vitals', 'vs': 'vitals',
    'exam': 'exam', 'pe': 'exam',
    'a': 'assessment', 'assessment': 'assessment', 'dx': 'assessment',
    'p': 'plan', 'plan': 'plan', 'tx': 'plan',
    'f/u': 'followup', 'fu': 'followup', 'follow-up': 'followup',
    'interval': 'interval',
    'mse': 'mse',
    'risk': 'risk',
    'labs': 'labs',
    'dispo': 'dispo', 'disposition': 'dispo',
    # TMS B-series (yes/no)
    'b1': 'b1', 'b2': 'b2', 'b3': 'b3', 'b4': 'b4',
    'b5': 'b5', 'b6': 'b6', 'b7': 'b7', 'b8': 'b8',
    # TMS C-series (short answer)
    'c1': 'c1', 'c2': 'c2', 'c3': 'c3', 'c4': 'c4',
    'c5': 'c5', 'c6': 'c6', 'c7': 'c7',
    # TMS D-series (complex)
    'd1': 'd1', 'd2': 'd2', 'd3': 'd3', 'd4': 'd4',
    # TMS F-series (treatment data)
    'f1': 'f1', 'f2': 'f2', 'f3': 'f3', 'f4': 'f4', 'f5': 'f5',
}



def parse_vitals(vitals_text):
    vitals = {'_raw': expand_text(vitals_text)}
    for key, pattern in VITAL_PATTERNS.items():
        m = pattern.search(vitals_text)
        if m:
            vitals[key] = m.group(1).strip()
    return vitals


def parse_exam(exam_text):
    exam = {'_raw': expand_text(exam_text)}
    tokens = [t.strip() for t in re.split(r'[,;]+', exam_text) if t.strip()]
    system_buckets = {s: [] for s in EXAM_SYSTEM_KEYWORDS}
    other = []

    for token in tokens:
        routed = False
        for system, keywords in EXAM_SYSTEM_KEYWORDS.items():
            for kw in keywords:
                if kw.lower() in token.lower():
                    system_buckets[system].append(expand_text(token))
                    routed = True
                    break
            if routed:
                break
        if not routed:
            other.append(expand_text(token))

    for system, parts in system_buckets.items():
        if parts:
            exam[system] = ', '.join(parts)
    if other:
        exam['_other'] = ', '.join(other)
    return exam


def split_abn(text):
    """Split ABN text into section chunks. Supports newline and ' / ' (space-slash-space) separators."""
    lines = text.splitlines()
    if len(lines) > 1:
        return [l.strip() for l in lines if l.strip()]
    # Single-line: split on ' / ' (space-slash-space) to avoid splitting BP like 140/88
    return [chunk.strip() for chunk in re.split(r'\s/\s', text) if chunk.strip()]


def parse_abn(abn_text):
    raw_sections = {}
    for chunk in split_abn(abn_text):
        if ':' in chunk:
            key, _, value = chunk.partition(':')
            key = key.strip().lower()
            value = value.strip()
            if key and value:
                canonical = SECTION_ALIASES.get(key, key)
                if canonical in raw_sections:
                    raw_sections[canonical] += ' ' + value
                else:
                    raw_sections[canonical] = value

    result = {}
    for canonical, value in raw_sections.items():
        if canonical == 'vitals':
            result[canonical] = parse_vitals(value)
        elif canonical == 'exam':
            result[canonical] = parse_exam(value)
        else:
            result[canonical] = expand_text(value)

    return result


def load_template_list():
    templates = []
    for f in sorted(TEMPLATES_DIR.glob('*.json')):
        data = json.loads(f.read_text())
        templates.append({
            'id': data['id'],
            'name': data['name'],
            'description': data.get('description', ''),
        })
    return templates


def load_template(template_id):
    for f in TEMPLATES_DIR.glob('*.json'):
        data = json.loads(f.read_text())
        if data['id'] == template_id:
            return data
    return None


TEMPLATE_LIST = load_template_list()


# ── Chart Generators ──────────────────────────────────────────────────────────

_YES = {'yes', 'y', 'yeah', 'yep', 'yup', 'ya', 'ye', 'true', 'correct', 'positive', 'affirm', 'affirmative'}
_NO  = {'no', 'n', 'nope', 'nah', 'na', 'none', 'false', 'negative', 'deny', 'denies', 'denied'}
_NONE_PMH = {'no', 'n', 'none', 'no history', 'no hx', 'no pmh', 'denies', 'n/a', 'na', 'negative', 'none reported'}
_NO_CHANGE = ('no change', 'no changes', 'no new', 'unchanged', 'none', 'n/a', 'no updates')


def _v(fields, key, default=''):
    return fields.get(key, default).strip()


def _is_yes(val):
    return val.lower().strip().rstrip('.') in _YES


def _is_no(val):
    return val.lower().strip().rstrip('.') in _NO


def _yn(fields, key, yes_text, no_text, other_fmt=None, default=''):
    raw = _v(fields, key)
    v = raw.lower().strip().rstrip('.')
    if v in _YES:
        return yes_text
    if v in _NO:
        return no_text
    if raw:
        return other_fmt.format(raw) if other_fmt else raw
    return default


def generate_tms(fields):
    paragraphs = []

    # ── Name / pronoun shorthand ──
    full_name = _v(fields, 'patient_name')
    first_name = full_name.split()[0] if full_name else ''
    subj = first_name if first_name else 'Patient'   # "Dillon", or "Patient"
    poss = f"{subj}'s" if first_name else "patient's"

    # ── Opening ──
    age       = _v(fields, 'age')
    gender    = _v(fields, 'gender')
    pmh       = _v(fields, 'pmh')
    session   = _v(fields, 'session_num')
    protocol  = _v(fields, 'protocol')
    frequency = _v(fields, 'frequency')

    demo_parts = [p for p in [f'{age} yo' if age else '', gender, 'adult patient'] if p]
    demo = ' '.join(demo_parts)

    pmh_normalized = pmh.lower().strip().rstrip('.') if pmh else ''
    if not pmh or pmh_normalized in _NONE_PMH:
        pmh_phrase = 'with no significant past medical history'
    else:
        pmh_phrase = f'with past medical history significant for {pmh}'

    line = f'{demo} {pmh_phrase} presents in follow-up for TMS.'

    details_parts = [p for p in [
        f'#{session} treatments' if session else '',
        protocol,
        f'{frequency} cadence' if frequency else '',
    ] if p]
    if details_parts:
        line += f' Continued maintenance TMS — {", ".join(details_parts)}.'
    paragraphs.append(line)

    # ── Patient Report ──
    p2 = []
    symptom    = _v(fields, 'symptom_update')
    sleep      = _v(fields, 'sleep')
    fatigue    = _v(fields, 'fatigue')
    anhedonia  = _v(fields, 'anhedonia')
    productive = _v(fields, 'productive')
    collateral = _v(fields, 'collateral')
    work       = _v(fields, 'work')

    if symptom:
        p2.append(f'{subj} reports {symptom}.')

    stable_v = _v(fields, 'stable')
    if stable_v:
        if _is_yes(stable_v):
            p2.append(f'Overall mood and functioning remain stable.')
        elif _is_no(stable_v):
            p2.append(f'{subj} reports decreased stability in mood or functioning.')
        else:
            p2.append(f'Regarding stability, {subj} reports {stable_v}.')

    helping_v = _v(fields, 'helping')
    if helping_v:
        if _is_yes(helping_v):
            p2.append(f'{subj} endorses continued benefit from TMS.')
        elif _is_no(helping_v):
            p2.append(f'{subj} does not currently feel TMS is helping.')
        else:
            p2.append(f'Regarding TMS effectiveness, {subj} reports {helping_v}.')

    if sleep:
        sleep_v = sleep.lower().strip()
        if _is_no(sleep_v) or sleep_v in ('normal', 'good', 'fine', 'okay', 'ok', 'well', 'stable'):
            p2.append(f'Sleep has been stable.')
        else:
            p2.append(f'{subj} reports difficulty with sleep: {sleep}.')

    fatigue_v = fatigue.lower().strip().rstrip('.') if fatigue else ''
    if fatigue_v:
        if _is_yes(fatigue_v):
            p2.append(f'{subj} endorses fatigue.')
        elif _is_no(fatigue_v):
            p2.append(f'{subj} denies significant fatigue.')
        else:
            p2.append(f'{subj} reports fatigue: {fatigue}.')

    if anhedonia:
        anhedonia_v = anhedonia.lower().strip().rstrip('.')
        if _is_yes(anhedonia_v):
            p2.append(f'{subj} continues to endorse anhedonia.')
        elif _is_no(anhedonia_v):
            p2.append(f'{subj} denies anhedonia.')
        else:
            p2.append(f'Regarding anhedonia, {subj} reports {anhedonia}.')

    if productive:
        prod_v = productive.lower().strip().rstrip('.')
        if _is_yes(prod_v):
            p2.append(f'{subj} reports improved productivity and motivation.')
        elif _is_no(prod_v):
            p2.append(f'{subj} continues to have difficulty with productivity and motivation.')
        else:
            p2.append(f'Productivity and motivation: {subj} reports {productive}.')

    social_v = _v(fields, 'socially_isolating')
    if social_v:
        if _is_yes(social_v):
            p2.append(f'{subj} reports social isolation.')
        elif _is_no(social_v):
            p2.append(f'{subj} denies social isolation.')
        else:
            p2.append(f'Socially, {subj} reports {social_v}.')

    if work:
        p2.append(f'Regarding work, {subj} reports {work}.')

    if collateral:
        p2.append(f'Family and friends have noted {collateral}.')

    paragraphs.append(' '.join(s for s in p2 if s))

    # ── Safety ──
    si_v  = _v(fields, 'suicidal')
    sib_v = _v(fields, 'self_harm')

    if si_v:
        if _is_yes(si_v):
            si = f'{subj} reports suicidal ideation.'
        elif _is_no(si_v):
            si = 'Denies suicidal ideation, suicide plan, or intent.'
        else:
            si = f'Regarding suicidal ideation, {subj} reports {si_v}.'
    else:
        si = 'Denies suicidal ideation, suicide plan, or intent.'

    if sib_v:
        if _is_yes(sib_v):
            sib = f'{subj} reports recent self-injurious behavior.'
        elif _is_no(sib_v):
            sib = f'Denies recent self-injurious behavior.'
        else:
            sib = f'Regarding self-harm, {subj} reports {sib_v}.'
    else:
        sib = 'Denies recent self-injurious behavior.'

    paragraphs.append(f'{si} {sib}')

    # ── Side effects / Motor threshold ──
    p4 = []
    se_v = _v(fields, 'side_effects')
    if se_v:
        if _is_yes(se_v):
            p4.append(f'{subj} reports side effects to TMS treatment.')
        elif _is_no(se_v):
            p4.append(f'Denies side effects to TMS.')
        else:
            p4.append(f'{subj} reports the following side effects to TMS: {se_v}.')

    mt_v = _v(fields, 'mt_increased')
    if mt_v:
        if _is_yes(mt_v):
            p4.append('Treatment delivered at prescribed motor threshold.')
        elif _is_no(mt_v):
            p4.append('Not yet at prescribed motor threshold.')
        else:
            p4.append(f'Motor threshold: {mt_v}.')

    if p4:
        paragraphs.append(' '.join(p4))

    # ── Meds / Physical health ──
    med = _v(fields, 'med_change')
    phx = _v(fields, 'physical_health')
    med_v = med.lower().strip().rstrip('.') if med else ''
    phx_v = phx.lower().strip().rstrip('.') if phx else ''

    def _is_no_change(v):
        return not v or v in _NO or v in _NONE_PMH or any(v.startswith(p) for p in _NO_CHANGE)

    if _is_no_change(med_v):
        med_line = 'Denies changes in medications since last visit.'
    else:
        med_line = f'Medication changes since last visit: {med}.'

    if _is_no_change(phx_v):
        phx_line = 'Denies changes in physical health since last visit.'
    else:
        phx_line = f'Physical health update: {phx}.'

    paragraphs.append(f'{med_line} {phx_line}')

    # ── Plan ──
    freq_change = _v(fields, 'freq_change')
    fc_v = freq_change.lower().strip().rstrip('.') if freq_change else ''
    if not freq_change or fc_v in _NO or fc_v in _NONE_PMH or any(fc_v.startswith(p) for p in _NO_CHANGE):
        plan_line = 'Will continue TMS at current frequency.'
    else:
        plan_line = freq_change.rstrip('.')
        plan_line = plan_line[0].upper() + plan_line[1:] + '.'

    paragraphs.append(plan_line)

    # ── Relapse prevention (standard) ──
    paragraphs.append(
        f"Reviewed {poss} TMS course to date, including their response, side effects experienced, "
        "and treatment plan going forward. Reviewed relapse prevention, including importance of remaining "
        "on antidepressant medication and continuing in psychotherapy to reduce the likelihood of relapse "
        "and maximize antidepressant effect. Should relapse occur despite maintenance medication, discussed "
        "returning to TMS treatment sooner rather than later, with consideration given to maintenance TMS "
        "once depressive symptoms are again under control. All questions were answered to patient's "
        "satisfaction, with treatment plan agreed upon as below."
    )

    return '\n\n'.join(paragraphs)


GENERATORS = {
    'tms': generate_tms,
}



@app.route('/')
def index():
    return render_template('index.html',
                           templates=TEMPLATE_LIST,
                           abbreviations_json=json.dumps(ABBREVIATIONS),
                           version=VERSION)


@app.route('/api/template/<template_id>')
def get_template(template_id):
    template = load_template(template_id)
    if template is None:
        return jsonify({'error': 'Template not found'}), 404
    return jsonify(template)


@app.route('/api/parse-abn', methods=['POST'])
def parse_abn_route():
    data = request.get_json(silent=True) or {}
    abn_text = data.get('abn_text', '')
    sections = parse_abn(abn_text)
    return jsonify({'sections': sections})


@app.route('/api/generate-chart', methods=['POST'])
def generate_chart():
    data = request.get_json(silent=True) or {}
    template_id = data.get('template_id', '')
    fields = data.get('fields', {})
    template = load_template(template_id)
    if not template:
        return jsonify({'error': 'Template not found'}), 404
    generator_key = template.get('generator')
    fn = GENERATORS.get(generator_key)
    if not fn:
        return jsonify({'error': f'No generator for template {template_id}'}), 400
    chart_text = fn(fields)
    return jsonify({'chart': chart_text})


@app.route('/api/abbreviations')
def get_abbreviations():
    return jsonify(ABBREVIATIONS)


# ── Patient / Chart persistence ───────────────────────────────────────────────

@app.route('/api/save-chart', methods=['POST'])
def save_chart():
    data = request.get_json(silent=True) or {}
    patient_name = data.get('patient_name', '').strip()
    template_id  = data.get('template_id', '')
    fields       = data.get('fields', {})
    chart_text   = data.get('chart_text', '')
    chart_id     = data.get('chart_id')

    if not patient_name:
        return jsonify({'error': 'Patient name required to save'}), 400

    fields.pop('patient_name', None)   # stored on the patient record, not in fields JSON

    conn = _db()
    try:
        row = conn.execute(
            'SELECT id FROM patients WHERE name = ? COLLATE NOCASE', (patient_name,)
        ).fetchone()
        if row:
            patient_id = row['id']
        else:
            cur = conn.execute('INSERT INTO patients (name) VALUES (?)', (patient_name,))
            patient_id = cur.lastrowid

        tpl = load_template(template_id)
        template_name = tpl['name'] if tpl else template_id

        if chart_id:
            conn.execute(
                "UPDATE charts SET chart_text=?, fields=?, updated_at=datetime('now','localtime') WHERE id=?",
                (chart_text, json.dumps(fields), chart_id)
            )
        else:
            cur = conn.execute(
                'INSERT INTO charts (patient_id, template_id, template_name, fields, chart_text) VALUES (?,?,?,?,?)',
                (patient_id, template_id, template_name, json.dumps(fields), chart_text)
            )
            chart_id = cur.lastrowid

        conn.commit()
        return jsonify({'chart_id': chart_id, 'patient_id': patient_id})
    finally:
        conn.close()


@app.route('/api/patients/search')
def search_patients():
    q = request.args.get('q', '').strip()
    conn = _db()
    try:
        sql = '''
            SELECT p.id, p.name,
                   COUNT(c.id)    AS chart_count,
                   MAX(c.updated_at) AS last_visit
            FROM patients p
            LEFT JOIN charts c ON c.patient_id = p.id
            {where}
            GROUP BY p.id
            ORDER BY last_visit DESC
            LIMIT 30
        '''
        if q:
            rows = conn.execute(
                sql.format(where='WHERE p.name LIKE ? COLLATE NOCASE'),
                (f'%{q}%',)
            ).fetchall()
        else:
            rows = conn.execute(sql.format(where='')).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/patient/<int:patient_id>/charts')
def get_patient_charts(patient_id):
    conn = _db()
    try:
        rows = conn.execute(
            'SELECT id, template_id, template_name, chart_text, created_at, updated_at '
            'FROM charts WHERE patient_id=? ORDER BY updated_at DESC',
            (patient_id,)
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            txt = d['chart_text']
            d['preview'] = (txt[:140] + '…') if len(txt) > 140 else txt
            d['preview'] = d['preview'].replace('\n', ' ')
            result.append(d)
        return jsonify(result)
    finally:
        conn.close()


@app.route('/api/chart/<int:chart_id>')
def get_chart(chart_id):
    conn = _db()
    try:
        row = conn.execute('SELECT * FROM charts WHERE id=?', (chart_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Not found'}), 404
        d = dict(row)
        d['fields'] = json.loads(d['fields'])

        # Also fetch patient name
        pr = conn.execute('SELECT name FROM patients WHERE id=?', (d['patient_id'],)).fetchone()
        d['patient_name'] = pr['name'] if pr else ''
        return jsonify(d)
    finally:
        conn.close()


@app.route('/api/chart/<int:chart_id>', methods=['DELETE'])
def delete_chart(chart_id):
    conn = _db()
    try:
        row = conn.execute('SELECT patient_id FROM charts WHERE id=?', (chart_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Not found'}), 404
        patient_id = row['patient_id']
        conn.execute('DELETE FROM charts WHERE id=?', (chart_id,))
        # Remove patient record if they have no charts left
        remaining = conn.execute('SELECT COUNT(*) FROM charts WHERE patient_id=?', (patient_id,)).fetchone()[0]
        if remaining == 0:
            conn.execute('DELETE FROM patients WHERE id=?', (patient_id,))
        conn.commit()
        return jsonify({'ok': True})
    finally:
        conn.close()


if __name__ == '__main__':
    app.run(debug=True, port=8080)
