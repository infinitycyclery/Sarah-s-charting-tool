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
    'cc': 'cc', 'chief complaint': 'cc', 'c/c': 'cc', 'chief c': 'cc',
    'hpi': 'hpi', 'history': 'hpi', 'hist': 'hpi',
    'pmh': 'pmh', 'past medical': 'pmh', 'past hx': 'pmh', 'medical hx': 'pmh',
    'psh': 'psh', 'past surgical': 'psh', 'surgical hx': 'psh',
    'fh': 'fh', 'family hx': 'fh', 'family history': 'fh',
    'sh': 'sh', 'social hx': 'sh', 'social history': 'sh',
    'meds': 'meds', 'medications': 'meds', 'medication': 'meds', 'rx': 'meds',
    'allergies': 'allergies', 'allergy': 'allergies', 'nkda': 'allergies',
    'ros': 'ros', 'review of systems': 'ros',
    'vitals': 'vitals', 'vs': 'vitals', 'vital signs': 'vitals', 'vital': 'vitals',
    'exam': 'exam', 'pe': 'exam', 'physical exam': 'exam', 'physical': 'exam',
    'a': 'assessment', 'assessment': 'assessment', 'dx': 'assessment', 'impression': 'assessment',
    'p': 'plan', 'plan': 'plan', 'tx': 'plan',
    'f/u': 'followup', 'fu': 'followup', 'follow-up': 'followup', 'follow up': 'followup',
    'proc': 'procedure', 'procedure': 'procedure',
    'indication': 'indication', 'ind': 'indication',
    'technique': 'technique', 'tech': 'technique',
    'findings': 'findings', 'finding': 'findings',
    'complications': 'complications', 'comp': 'complications',
    'interval': 'interval', 'interval hx': 'interval',
    'mse': 'mse', 'mental status': 'mse',
    'risk': 'risk',
    'screens': 'screens', 'screenings': 'screens',
    'labs': 'labs', 'lab': 'labs',
    'course': 'course', 'hospital course': 'course',
    'dispo': 'dispo', 'disposition': 'dispo',
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


@app.route('/api/abbreviations')
def get_abbreviations():
    return jsonify(ABBREVIATIONS)


if __name__ == '__main__':
    app.run(debug=True, port=8080)
