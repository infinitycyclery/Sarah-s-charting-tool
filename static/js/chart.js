'use strict';

let currentTemplate = null;
let currentChartId  = null;
let autoSaveTimer   = null;
const AUTOSAVE_DELAY = 15_000; // 15 seconds after last edit

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

// ── Render ABN Form ────────────────────────────────────────────────────────
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

  // If a chart is already showing, warn before overwriting
  const output = document.getElementById('chart-output');
  if (output.style.display !== 'none' && output.innerText.trim()) {
    document.getElementById('ow-overlay').classList.add('open');
    document.getElementById('ow-dialog').classList.add('open');
    return;
  }

  await _doGenerate();
}

function _owClose() {
  document.getElementById('ow-overlay').classList.remove('open');
  document.getElementById('ow-dialog').classList.remove('open');
}

function owGoBack() { _owClose(); }

async function owKeepOld() {
  _owClose();
  // Ensure the current chart is saved under its own record, then start fresh
  const name = document.getElementById('patient-name').value.trim();
  const text = document.getElementById('chart-output').innerText;
  if (name && text) await persistChart(name, text);
  currentChartId = null;
  await _doGenerate();
}

async function owDeleteReplace() {
  _owClose();
  if (currentChartId) {
    try { await fetch(`/api/chart/${currentChartId}`, { method: 'DELETE' }); } catch {}
    currentChartId = null;
  }
  await _doGenerate();
}

async function _doGenerate() {
  if (!currentTemplate) return;

  const fields = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    const val = el.value.trim();
    if (val) fields[el.dataset.key] = val;
  });

  const patientName = document.getElementById('patient-name').value.trim();
  if (patientName) fields['patient_name'] = patientName;

  const btn = document.getElementById('btn-generate');
  btn.textContent = 'Generating…';
  btn.disabled = true;

  try {
    const resp = await fetch('/api/generate-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: currentTemplate.id, fields }),
    });
    const data = await resp.json();
    if (data.error) { alert(data.error); return; }

    currentChartId = null;
    showChart(data.chart, patientName);
    persistChart(patientName, data.chart, { ...fields });
  } catch (e) {
    alert('Error generating chart: ' + e.message);
  } finally {
    btn.textContent = 'Generate Chart →';
    btn.disabled = false;
  }
}

function showChart(text, patientName) {
  document.getElementById('chart-placeholder').style.display = 'none';
  const output = document.getElementById('chart-output');
  output.style.display = 'block';
  output.textContent = text;

  document.getElementById('btn-delete').disabled = false;
  document.getElementById('btn-save').disabled = false;
  document.getElementById('btn-copy').disabled = false;
  document.getElementById('btn-print').disabled = false;

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
  document.getElementById('btn-delete').disabled = true;
  document.getElementById('btn-save').disabled = true;
  document.getElementById('btn-copy').disabled = true;
  document.getElementById('btn-print').disabled = true;
  document.getElementById('print-header').style.display = 'none';
}

// ── New Chart ──────────────────────────────────────────────────────────────
function newChart() {
  document.querySelectorAll('.abn-input').forEach(el => el.value = '');
  document.getElementById('patient-name').value = '';
  clearChart();
  currentChartId = null;
  clearTimeout(autoSaveTimer);
}

// ── Delete Chart ──────────────────────────────────────────────────────────
function promptDeleteChart() {
  document.getElementById('del-overlay').classList.add('open');
  document.getElementById('del-dialog').classList.add('open');
}

function cancelDeleteChart() {
  document.getElementById('del-overlay').classList.remove('open');
  document.getElementById('del-dialog').classList.remove('open');
}

async function confirmDeleteChart() {
  if (!currentChartId) {
    // Chart was never saved — just clear the view
    cancelDeleteChart();
    newChart();
    return;
  }

  const btn = document.querySelector('.del-btn-confirm');
  btn.textContent = 'Deleting…';
  btn.disabled = true;

  try {
    const resp = await fetch(`/api/chart/${currentChartId}`, { method: 'DELETE' });
    const data = await resp.json();
    if (data.error) { alert(data.error); return; }
    cancelDeleteChart();
    newChart();
  } catch (e) {
    alert('Error deleting chart: ' + e.message);
  } finally {
    btn.textContent = 'Yes, Delete';
    btn.disabled = false;
  }
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

// ── Manual Save ───────────────────────────────────────────────────────────
async function manualSave() {
  const name = document.getElementById('patient-name').value.trim();
  const text = document.getElementById('chart-output').innerText;
  if (!name) { alert('Enter a patient name before saving.'); return; }

  const btn = document.getElementById('btn-save');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  await persistChart(name, text);

  btn.textContent = '✓ Saved';
  setTimeout(() => { btn.textContent = '💾 Save'; btn.disabled = false; }, 2000);
}

// ── Auto-save ──────────────────────────────────────────────────────────────
async function persistChart(patientName, chartText, fieldsOverride) {
  if (!patientName || !currentTemplate || !chartText.trim()) return;

  const fields = fieldsOverride ? { ...fieldsOverride } : {};
  if (!fieldsOverride) {
    document.querySelectorAll('[data-key]').forEach(el => {
      if (el.value.trim()) fields[el.dataset.key] = el.value.trim();
    });
  }
  delete fields['patient_name'];

  try {
    const resp = await fetch('/api/save-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: patientName,
        template_id:  currentTemplate.id,
        fields,
        chart_text:   chartText,
        chart_id:     currentChartId,
      }),
    });
    const data = await resp.json();
    if (data.chart_id) {
      currentChartId = data.chart_id;
      showSaveStatus();
    }
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}

function showSaveStatus() {
  const el = document.getElementById('save-status');
  if (!el) return;
  const t = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  el.textContent = `● Saved ${t}`;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 5000);
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    const name = document.getElementById('patient-name').value.trim();
    const text = document.getElementById('chart-output').innerText;
    if (name && text && currentChartId) persistChart(name, text);
  }, AUTOSAVE_DELAY);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('chart-output').addEventListener('input', scheduleAutoSave);
});

// ── Patient History Modal ─────────────────────────────────────────────────
function openPatientHistory() {
  document.getElementById('ph-overlay').classList.add('open');
  document.getElementById('ph-modal').classList.add('open');
  document.getElementById('ph-search-input').value = '';
  loadRecentPatients();
  setTimeout(() => document.getElementById('ph-search-input').focus(), 60);
}

function closePatientHistory() {
  document.getElementById('ph-overlay').classList.remove('open');
  document.getElementById('ph-modal').classList.remove('open');
}

async function loadRecentPatients() {
  try {
    const data = await (await fetch('/api/patients/search')).json();
    renderPatientList(data);
  } catch { renderPatientList([]); }
}

async function searchPatients(q) {
  try {
    const data = await (await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`)).json();
    renderPatientList(data);
  } catch { renderPatientList([]); }
}

function renderPatientList(patients) {
  const body = document.getElementById('ph-body');
  body.innerHTML = '';

  if (!patients.length) {
    body.innerHTML = '<div class="ph-empty">No patients found.</div>';
    return;
  }

  patients.forEach(p => {
    const row = document.createElement('div');
    row.className = 'ph-patient-row';
    const lastVisit = p.last_visit
      ? new Date(p.last_visit.replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    row.innerHTML = `
      <div>
        <div class="ph-patient-name">${esc(p.name)}</div>
        <div class="ph-patient-meta">${p.chart_count} chart${p.chart_count !== 1 ? 's' : ''} &nbsp;·&nbsp; Last visit: ${lastVisit}</div>
      </div>
      <span class="ph-chevron">›</span>`;
    row.onclick = () => showPatientCharts(p.id, p.name);
    body.appendChild(row);
  });
}

async function showPatientCharts(patientId, patientName) {
  const body = document.getElementById('ph-body');
  body.innerHTML = '<div class="ph-empty">Loading…</div>';

  try {
    const charts = await (await fetch(`/api/patient/${patientId}/charts`)).json();
    body.innerHTML = '';

    const back = document.createElement('div');
    back.className = 'ph-back-btn';
    back.innerHTML = `‹ Back &nbsp;&nbsp; <strong>${esc(patientName)}</strong>`;
    back.onclick = loadRecentPatients;
    body.appendChild(back);

    if (!charts.length) {
      const empty = document.createElement('div');
      empty.className = 'ph-empty';
      empty.textContent = 'No charts saved yet.';
      body.appendChild(empty);
      return;
    }

    charts.forEach(c => {
      const row = document.createElement('div');
      row.className = 'ph-chart-row';
      const d = new Date(c.updated_at.replace(' ', 'T')).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      row.innerHTML = `
        <div class="ph-chart-header">
          <span class="ph-chart-tpl">${esc(c.template_id)} · ${esc(c.template_name)}</span>
          <span class="ph-chart-date">${d}</span>
        </div>
        <div class="ph-chart-preview">${esc(c.preview)}</div>`;
      row.onclick = () => loadChartRecord(c.id, patientName);
      body.appendChild(row);
    });
  } catch {
    body.innerHTML = '<div class="ph-empty">Error loading charts.</div>';
  }
}

async function loadChartRecord(chartId, patientName) {
  try {
    const data = await (await fetch(`/api/chart/${chartId}`)).json();
    if (data.error) { alert(data.error); return; }

    closePatientHistory();

    document.getElementById('patient-name').value = data.patient_name || patientName;
    await selectTemplate(data.template_id);

    Object.entries(data.fields).forEach(([key, val]) => {
      const el = document.getElementById(`abn_${key}`);
      if (el) el.value = val;
    });

    showChart(data.chart_text, data.patient_name || patientName);
    currentChartId = chartId;
  } catch (e) {
    alert('Error loading chart: ' + e.message);
  }
}

// ── Patient Name Autocomplete ─────────────────────────────────────────────
let _pdTimer = null;

function onPatientInput(val) {
  clearTimeout(_pdTimer);
  if (!val.trim()) { closePatientDropdownNow(); return; }
  _pdTimer = setTimeout(() => fetchPatientSuggestions(val.trim()), 250);
}

async function fetchPatientSuggestions(q) {
  try {
    const data = await (await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`)).json();
    renderPatientDropdown(data);
  } catch { closePatientDropdownNow(); }
}

function renderPatientDropdown(patients) {
  const dd = document.getElementById('patient-dropdown');
  dd.innerHTML = '';

  if (!patients.length) {
    dd.innerHTML = '<div class="pd-empty">No matching patients — will create new on save.</div>';
  } else {
    const lbl = document.createElement('div');
    lbl.className = 'pd-section-label';
    lbl.textContent = 'Existing patients';
    dd.appendChild(lbl);

    patients.forEach(p => {
      const row = document.createElement('div');
      row.className = 'pd-patient-row';
      const lastVisit = p.last_visit
        ? new Date(p.last_visit.replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';
      row.innerHTML = `
        <div>
          <div class="pd-patient-name">${esc(p.name)}</div>
          <div class="pd-patient-meta">${p.chart_count} chart${p.chart_count !== 1 ? 's' : ''} · Last: ${lastVisit}</div>
        </div>
        <span class="pd-chevron">›</span>`;
      // mousedown fires before blur, so the click registers before dropdown closes
      row.onmousedown = (e) => { e.preventDefault(); showChartsInDropdown(p.id, p.name); };
      dd.appendChild(row);
    });
  }

  dd.classList.add('open');
}

async function showChartsInDropdown(patientId, patientName) {
  const dd = document.getElementById('patient-dropdown');
  dd.innerHTML = '<div class="pd-empty">Loading…</div>';
  dd.classList.add('open');

  try {
    const charts = await (await fetch(`/api/patient/${patientId}/charts`)).json();
    dd.innerHTML = '';

    const back = document.createElement('div');
    back.className = 'pd-back';
    back.innerHTML = `‹ &nbsp;<strong>${esc(patientName)}</strong>`;
    back.onmousedown = (e) => { e.preventDefault(); fetchPatientSuggestions(document.getElementById('patient-name').value.trim()); };
    dd.appendChild(back);

    if (!charts.length) {
      // No prior charts — just set the name and close
      dd.innerHTML += '<div class="pd-empty">No saved charts — ready for new chart.</div>';
      document.getElementById('patient-name').value = patientName;
      setTimeout(closePatientDropdownNow, 1200);
      return;
    }

    const lbl = document.createElement('div');
    lbl.className = 'pd-section-label';
    lbl.textContent = 'Select a chart to resume';
    dd.appendChild(lbl);

    charts.forEach(c => {
      const row = document.createElement('div');
      row.className = 'pd-chart-row';
      const d = new Date(c.updated_at.replace(' ', 'T')).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      row.innerHTML = `
        <div class="pd-chart-header">
          <span class="pd-chart-tpl">${esc(c.template_id)} · ${esc(c.template_name)}</span>
          <span class="pd-chart-date">${d}</span>
        </div>
        <div class="pd-chart-preview">${esc(c.preview)}</div>`;
      row.onmousedown = (e) => { e.preventDefault(); loadChartRecord(c.id, patientName); closePatientDropdownNow(); };
      dd.appendChild(row);
    });
  } catch {
    dd.innerHTML = '<div class="pd-empty">Error loading charts.</div>';
  }
}

function closePatientDropdown() {
  // Small delay so mousedown on a row fires first
  setTimeout(closePatientDropdownNow, 150);
}

function closePatientDropdownNow() {
  const dd = document.getElementById('patient-dropdown');
  if (dd) { dd.classList.remove('open'); dd.innerHTML = ''; }
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
