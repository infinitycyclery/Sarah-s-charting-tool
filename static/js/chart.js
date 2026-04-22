'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let currentTemplate = null;
let filledFields = new Set();

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTodayDates();
});

function setTodayDates() {
  const today = new Date().toISOString().split('T')[0];
  ['date_of_service', 'sig_date'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
}

// ── Template Selection ─────────────────────────────────────────────────────
async function selectTemplate(templateId) {
  // Update button states
  document.querySelectorAll('.btn-tpl').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.templateId === templateId);
  });

  const resp = await fetch(`/api/template/${templateId}`);
  if (!resp.ok) { alert('Failed to load template'); return; }
  currentTemplate = await resp.json();

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('chart-form').style.display = 'block';
  document.getElementById('current-tpl-label').textContent = `${currentTemplate.id} — ${currentTemplate.name}`;
  document.getElementById('btn-print').disabled = false;

  renderTemplateSections(currentTemplate);
  setTodayDates();
  clearFillStatus();
}

function renderTemplateSections(template) {
  const container = document.getElementById('template-sections');
  container.innerHTML = '';
  filledFields.clear();

  template.sections.forEach(section => {
    container.appendChild(buildSection(section));
  });
}

function buildSection(section) {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-section';
  wrapper.dataset.sectionId = section.id;

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span>${section.label}</span><span class="collapse-icon">▾</span>`;
  header.addEventListener('click', () => toggleSection(header));

  const body = document.createElement('div');
  body.className = 'section-body';

  const isVitals = section.id === 'vitals';
  const isExam = section.id === 'exam' || (section.fields && section.fields.length > 4 && section.fields.every(f => f.type === 'text'));

  if (isVitals) {
    const grid = document.createElement('div');
    grid.className = 'vitals-grid';
    section.fields.forEach(field => {
      grid.appendChild(buildFieldWrapper(field));
    });
    body.appendChild(grid);
  } else if (isExam && section.fields.length >= 4) {
    const grid = document.createElement('div');
    grid.className = 'exam-grid';
    section.fields.forEach(field => {
      grid.appendChild(buildFieldWrapper(field));
    });
    body.appendChild(grid);
  } else {
    section.fields.forEach(field => {
      body.appendChild(buildFieldWrapper(field));
    });
  }

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  return wrapper;
}

function buildFieldWrapper(field) {
  const wrap = document.createElement('div');
  wrap.className = 'mb-2';

  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = field.label;
  label.setAttribute('for', `field_${field.id}`);
  wrap.appendChild(label);

  wrap.appendChild(buildInput(field));
  return wrap;
}

function buildInput(field) {
  let el;
  if (field.type === 'textarea') {
    el = document.createElement('textarea');
    el.rows = field.rows || 3;
    el.className = 'chart-field';
  } else if (field.type === 'select' && field.options) {
    el = document.createElement('select');
    el.className = 'chart-field';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— select —';
    el.appendChild(blank);
    field.options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      el.appendChild(o);
    });
  } else {
    el = document.createElement('input');
    el.type = 'text';
    el.className = 'chart-field';
  }

  el.id = `field_${field.id}`;
  el.dataset.fieldId = field.id;
  if (field.abn_key) el.dataset.abnKey = field.abn_key;
  if (field.placeholder) el.placeholder = field.placeholder;

  return el;
}

function toggleSection(header) {
  const body = header.nextElementSibling;
  const collapsed = body.classList.toggle('collapsed');
  header.classList.toggle('collapsed', collapsed);
}

// ── ABN Parsing & Auto-fill ────────────────────────────────────────────────
async function parseABN() {
  const abnText = document.getElementById('abn-notes').value.trim();
  if (!abnText) { alert('Please enter some ABN notes first.'); return; }
  if (!currentTemplate) { alert('Please select a template first.'); return; }

  const btn = document.getElementById('btn-parse');
  btn.disabled = true;
  btn.textContent = '⏳ Parsing...';

  try {
    const resp = await fetch('/api/parse-abn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ abn_text: abnText }),
    });
    const { sections } = await resp.json();
    fillFromParsed(sections);
  } catch (e) {
    alert('Error parsing notes: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✦ Parse &amp; Fill Chart';
  }
}

function fillFromParsed(sections) {
  const filled = [];
  const skipped = [];

  // Find all fields with an abn_key
  document.querySelectorAll('[data-abn-key]').forEach(el => {
    const abnKey = el.dataset.abnKey; // e.g. "vitals.bp" or "cc"
    const value = resolveAbnValue(sections, abnKey);
    if (value) {
      if (el.value && el.value.trim()) {
        skipped.push(el.dataset.fieldId);
      } else {
        el.value = value;
        el.classList.add('filled');
        filledFields.add(el.dataset.fieldId);
        filled.push(el.dataset.fieldId);
      }
    }
  });

  showFillStatus(filled, skipped);

  // Ensure sections containing filled fields are expanded
  document.querySelectorAll('.section-body.collapsed').forEach(body => {
    if (body.querySelector('.chart-field.filled')) {
      body.classList.remove('collapsed');
      body.previousElementSibling.classList.remove('collapsed');
    }
  });
}

function resolveAbnValue(sections, abnKey) {
  if (!abnKey) return null;
  const [section, subKey] = abnKey.split('.');

  if (!sections[section]) return null;

  if (!subKey) {
    const val = sections[section];
    return typeof val === 'string' ? val : (val._raw || null);
  }

  // Sub-key (e.g. vitals.bp, exam.general)
  const obj = sections[section];
  if (typeof obj === 'object' && obj[subKey]) return obj[subKey];

  // Fallback: try _raw
  if (obj._raw) return obj._raw;
  return null;
}

function showFillStatus(filled, skipped) {
  const statusEl = document.getElementById('fill-status');
  if (filled.length === 0 && skipped.length === 0) {
    statusEl.innerHTML = '<span style="color:#ef4444;font-size:0.8rem;">⚠ No matching sections found in notes. Check section prefixes (cc:, hpi:, etc.)</span>';
    statusEl.style.display = 'block';
    return;
  }

  let html = `<div class="fill-header">✓ ${filled.length} field${filled.length !== 1 ? 's' : ''} filled</div><div>`;
  filled.forEach(id => { html += `<span class="fill-badge">${id.replace(/_/g, ' ')}</span>`; });
  if (skipped.length) {
    html += `<br><span style="color:#d97706;font-size:0.72rem;">⚠ ${skipped.length} skipped (already had content): `;
    skipped.forEach(id => { html += `<span class="fill-badge skipped">${id.replace(/_/g, ' ')}</span>`; });
    html += '</span>';
  }
  html += '</div>';

  statusEl.innerHTML = html;
  statusEl.style.display = 'block';
}

function clearFillStatus() {
  const el = document.getElementById('fill-status');
  el.style.display = 'none';
  el.innerHTML = '';
}

// ── Clear Form ─────────────────────────────────────────────────────────────
function clearForm() {
  if (!confirm('Clear all chart fields?')) return;
  document.querySelectorAll('.chart-field').forEach(el => {
    el.value = '';
    el.classList.remove('filled');
  });
  document.getElementById('abn-notes').value = '';
  filledFields.clear();
  clearFillStatus();
  setTodayDates();
}

// ── Print ──────────────────────────────────────────────────────────────────
function printChart() {
  if (!currentTemplate) return;
  window.print();
}

// ── Cheat Sheet Toggle ─────────────────────────────────────────────────────
function toggleCheatSheet() {
  const el = document.getElementById('cheat-sheet');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
