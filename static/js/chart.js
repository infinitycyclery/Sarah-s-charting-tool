'use strict';

let currentTemplate = null;

// ── Template Selection ─────────────────────────────────────────────────────
async function selectTemplate(templateId) {
  document.querySelectorAll('.btn-tpl').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.templateId === templateId);
  });

  const resp = await fetch(`/api/template/${templateId}`);
  if (!resp.ok) { alert('Failed to load template'); return; }
  currentTemplate = await resp.json();

  renderAbnForm(currentTemplate);
  clearChart();
  document.getElementById('btn-generate').disabled = false;
}

// ── Render ABN Form (Left Panel) ──────────────────────────────────────────
function renderAbnForm(template) {
  const body = document.getElementById('abn-form-body');
  body.innerHTML = '';

  if (!template.abn_groups) {
    body.innerHTML = '<div class="empty-hint">No notes template defined for this chart type yet.</div>';
    return;
  }

  template.abn_groups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'abn-group';

    const labelEl = document.createElement('div');
    labelEl.className = 'abn-group-label';
    labelEl.textContent = group.label;
    groupEl.appendChild(labelEl);

    group.fields.forEach(field => {
      const fieldEl = document.createElement('div');
      fieldEl.className = 'abn-field';

      const lbl = document.createElement('label');
      lbl.className = 'abn-label';
      lbl.textContent = field.label;
      lbl.setAttribute('for', `abn_${field.key}`);
      fieldEl.appendChild(lbl);

      const isTextarea = field.type === 'textarea';
      const input = document.createElement(isTextarea ? 'textarea' : 'input');
      input.className = 'abn-input';
      input.id = `abn_${field.key}`;
      input.dataset.key = field.key;
      if (!isTextarea) input.type = 'text';
      if (field.default) input.value = field.default;

      fieldEl.appendChild(input);
      groupEl.appendChild(fieldEl);
    });

    body.appendChild(groupEl);
  });
}

// ── Generate Chart ─────────────────────────────────────────────────────────
async function generateChart() {
  if (!currentTemplate) return;

  const fields = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    const key = el.dataset.key;
    const val = el.value.trim();
    if (val) fields[key] = val;
  });

  const patientName = document.getElementById('patient-name').value.trim();
  if (patientName) fields['patient_name'] = patientName;

  const btn = document.getElementById('btn-generate');
  btn.textContent = 'Generating...';
  btn.disabled = true;

  try {
    const resp = await fetch('/api/generate-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: currentTemplate.id, fields }),
    });
    const data = await resp.json();
    if (data.error) { alert(data.error); return; }
    showChart(data.chart, patientName);
  } catch (e) {
    alert('Error generating chart: ' + e.message);
  } finally {
    btn.textContent = 'Generate Chart →';
    btn.disabled = false;
  }
}

function showChart(text, patientName) {
  const placeholder = document.getElementById('chart-placeholder');
  const output = document.getElementById('chart-output');

  placeholder.style.display = 'none';
  output.style.display = 'block';
  output.textContent = text;

  document.getElementById('btn-copy').disabled = false;
  document.getElementById('btn-print').disabled = false;

  // Print header
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('print-patient-name').textContent = patientName || '';
  document.getElementById('print-template-name').textContent = currentTemplate ? currentTemplate.name : '';
  document.getElementById('print-date').textContent = today;
  document.getElementById('print-header').style.display = 'flex';
}

function clearChart() {
  document.getElementById('chart-placeholder').style.display = 'block';
  document.getElementById('chart-output').style.display = 'none';
  document.getElementById('chart-output').textContent = '';
  document.getElementById('btn-copy').disabled = true;
  document.getElementById('btn-print').disabled = true;
  document.getElementById('print-header').style.display = 'none';
}

// ── New Chart ──────────────────────────────────────────────────────────────
function newChart() {
  document.querySelectorAll('.abn-input').forEach(el => el.value = '');
  document.getElementById('patient-name').value = '';
  clearChart();
}

// ── Copy to Clipboard ──────────────────────────────────────────────────────
async function copyChart() {
  const text = document.getElementById('chart-output').innerText;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('btn-copy');
    btn.textContent = '✓ Copied';
    setTimeout(() => btn.textContent = '⎘ Copy', 2000);
  } catch {
    alert('Could not copy — try selecting the text manually.');
  }
}
