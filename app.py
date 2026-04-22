from flask import Flask, render_template, request, jsonify
import json
import re
from pathlib import Path

app = Flask(__name__)

BASE_DIR = Path(__file__).parent
TEMPLATES_DIR = BASE_DIR / 'data' / 'templates'
ABBREVIATIONS_FILE = BASE_DIR / 'data' / 'abbreviations.json'

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

def _v(fields, key, default=''):
    return fields.get(key, default).strip()

def _yn(fields, key, yes_text, no_text, other_fmt=None, default=''):
    v = _v(fields, key).lower()
    if v in ('yes', 'y'):
        return yes_text
    if v in ('no', 'n'):
        return no_text
    raw = _v(fields, key)
    if raw:
        return other_fmt.format(raw) if other_fmt else raw
    return default

def generate_tms(fields):
    paragraphs = []

    # ── Opening ──
    age        = _v(fields, 'age')
    gender     = _v(fields, 'gender')
    pmh        = _v(fields, 'pmh')
    session    = _v(fields, 'session_num')
    protocol   = _v(fields, 'protocol')
    frequency  = _v(fields, 'frequency')

    demo = ' '.join(filter(None, [f'{age} yo' if age else '', gender, 'adult patient']))
    if pmh:
        demo += f' with past medical history significant for {pmh}'
    line = demo + ' presents in follow-up for TMS.'

    details = ', '.join(filter(None, [
        f'#{session} treatments' if session else '',
        protocol,
        f'{frequency} frequency' if frequency else '',
    ]))
    if details:
        line += f' Continued TMS — {details}.'
    paragraphs.append(line)

    # ── Patient Report ──
    p2 = []
    symptom  = _v(fields, 'symptom_update')
    sleep    = _v(fields, 'sleep')
    fatigue  = _v(fields, 'fatigue')
    anhedonia = _v(fields, 'anhedonia')
    productive = _v(fields, 'productive')
    social   = _v(fields, 'socially_isolating')
    collateral = _v(fields, 'collateral')
    work     = _v(fields, 'work')

    if symptom:
        p2.append(f'Patient reports {symptom}.')
    p2.append(_yn(fields, 'stable',
        'Overall mood and functioning remain stable.',
        'Patient reports decreased stability in mood or functioning.',
        'Stability: {}.'))
    p2.append(_yn(fields, 'helping',
        'Patient endorses continued benefit from TMS.',
        'Patient does not currently feel TMS is helping.',
        'Regarding TMS effectiveness: {}.'))
    if sleep:
        p2.append(f'Sleep: {sleep}.')
    p2.append(_yn(fields, 'fatigue', 'Endorses fatigue.', 'Denies significant fatigue.', 'Fatigue: {}.'))
    if anhedonia:
        p2.append(f'Anhedonia: {anhedonia}.')
    if productive:
        p2.append(f'Productivity and motivation: {productive}.')
    p2.append(_yn(fields, 'socially_isolating', 'Reports social isolation.', 'Denies social isolation.', 'Social: {}.'))
    if work:
        p2.append(f'Work: {work}.')
    if collateral:
        p2.append(f'Collateral: {collateral}.')
    paragraphs.append(' '.join(s for s in p2 if s))

    # ── Safety ──
    si = _yn(fields, 'suicidal',
        'Reports suicidal ideation.',
        'Denies suicidal ideation, suicide plan, or intent.',
        'Suicidal ideation: {}.',
        'Denies suicidal ideation, suicide plan, or intent.')
    sib = _yn(fields, 'self_harm',
        'Reports recent self-injurious behavior.',
        'Denies recent self-injurious behavior.',
        'Self-harm: {}.',
        'Denies recent self-injurious behavior.')
    paragraphs.append(f'{si} {sib}')

    # ── Side effects ──
    p4 = []
    se = _yn(fields, 'side_effects',
        'Reports side effects to TMS treatment.',
        'Denies side effects to TMS.',
        'Side effects: {}.')
    if se:
        p4.append(se)
    mt = _yn(fields, 'mt_increased',
        'Treatment delivered at prescribed motor threshold.',
        'Not yet at prescribed motor threshold.',
        'Motor threshold: {}.')
    if mt:
        p4.append(mt)
    if p4:
        paragraphs.append(' '.join(p4))

    # ── Meds / Physical health ──
    med = _v(fields, 'med_change')
    phx = _v(fields, 'physical_health')
    med_line = f'Medication changes: {med}.' if med and med.lower() not in ('no','n','none') else 'Denies changes in medications since last visit.'
    phx_line = f'Physical health changes: {phx}.' if phx and phx.lower() not in ('no','n','none') else 'Denies changes in physical health since last visit.'
    paragraphs.append(f'{med_line} {phx_line}')

    # ── Plan ──
    freq_change = _v(fields, 'freq_change')
    plan_line = f'Treatment plan: {freq_change}.' if freq_change and freq_change.lower() not in ('no','n','none') else 'Will continue TMS at current frequency.'
    paragraphs.append(plan_line)

    # ── Relapse prevention (standard) ──
    paragraphs.append(
        "Reviewed patient's TMS course to date, including their response, side effects experienced, "
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
                           abbreviations_json=json.dumps(ABBREVIATIONS))


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


if __name__ == '__main__':
    app.run(debug=True, port=8080)
