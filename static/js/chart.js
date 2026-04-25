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
  document.getElementById('btn-rules').disabled = false;
  document.getElementById('btn-reset-abn').disabled = false;
  _loadChartRules(templateId);
}

// ── Chart Rules ───────────────────────────────────────────────────────────
function _rulesKey(templateId) { return `chart_rules_${templateId}`; }

let _rulesEditingTpl = null;

function _updateRulesBtn() {
  const btn = document.getElementById('btn-rules');
  if (!btn) return;
  const hasRules = getChartRules().trim().length > 0;
  btn.classList.toggle('active', hasRules);
  btn.title = hasRules ? 'Chart Rules active — click to edit' : 'Chart Rules — none set';
}

function _loadChartRules(templateId) {
  const ta = document.getElementById('rules-textarea');
  if (!ta) return;
  ta.value = localStorage.getItem(_rulesKey(templateId)) || '';
  _updateRulesBtn();
}

function rulesSelectTpl(templateId) {
  // save whatever is in the textarea for the previous template
  if (_rulesEditingTpl) {
    const ta = document.getElementById('rules-textarea');
    if (ta) localStorage.setItem(_rulesKey(_rulesEditingTpl), ta.value);
  }
  _rulesEditingTpl = templateId;
  _loadChartRules(templateId);
  document.querySelectorAll('.rules-tpl-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tplId === templateId)
  );
  const title = document.getElementById('rules-panel-title');
  if (title) title.textContent = `📋 Chart Rules — ${templateId}`;
  document.getElementById('rules-textarea').focus();
}

function saveChartRules() {
  const tplId = _rulesEditingTpl || (currentTemplate && currentTemplate.id);
  if (!tplId) return;
  const ta = document.getElementById('rules-textarea');
  if (!ta) return;
  localStorage.setItem(_rulesKey(tplId), ta.value);
  _updateRulesBtn();
}

function getChartRules() {
  if (!currentTemplate) return '';
  return localStorage.getItem(_rulesKey(currentTemplate.id)) || '';
}

function applyChartRules() {
  saveChartRules();
  const applyBtn = document.querySelector('.rules-apply-btn');
  if (applyBtn) {
    applyBtn.textContent = '✓ Applied!';
    applyBtn.style.background = '#16a34a';
    setTimeout(() => {
      applyBtn.textContent = '✓ Apply Rules';
      applyBtn.style.background = '';
    }, 1200);
  }
  setTimeout(() => toggleChartRules(), 600);
}

function toggleChartRules() {
  const panel    = document.getElementById('rules-panel');
  const formBody = document.getElementById('abn-form-body');
  const open     = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display    = open ? 'flex' : 'none';
  formBody.style.display = open ? 'none' : '';
  if (open) {
    const startTpl = (currentTemplate && currentTemplate.id) || _rulesEditingTpl;
    if (startTpl) rulesSelectTpl(startTpl);
    else document.getElementById('rules-textarea').focus();
  }
  _updateRulesBtn();
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

    let yesnoGrid = null;
    group.fields.forEach(field => {
      if (field.type === 'yesno') {
        if (!yesnoGrid) {
          yesnoGrid = document.createElement('div');
          yesnoGrid.className = 'yesno-grid';
          groupEl.appendChild(yesnoGrid);
        }
        yesnoGrid.appendChild(_renderYesNoField(field));
      } else {
        yesnoGrid = null;
        groupEl.appendChild(_renderTextField(field));
      }
    });

    body.appendChild(groupEl);
  });
}

function _renderYesNoField(field) {
  const fieldEl = document.createElement('div');
  fieldEl.className = 'abn-field yesno-field';

  const lbl = document.createElement('label');
  lbl.className = 'abn-label';
  lbl.textContent = field.label;
  fieldEl.appendChild(lbl);

  const toggle = document.createElement('div');
  toggle.className = 'yesno-toggle' + (field.expandable ? ' yesno-expandable' : '');

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.id = `abn_${field.key}`;
  hidden.dataset.key = field.key;

  const yesBtn = document.createElement('button');
  yesBtn.type = 'button';
  yesBtn.className = 'yesno-btn';
  yesBtn.textContent = 'Yes';

  const noBtn = document.createElement('button');
  noBtn.type = 'button';
  noBtn.className = 'yesno-btn';
  noBtn.textContent = 'No';

  toggle.appendChild(yesBtn);
  toggle.appendChild(noBtn);
  toggle.appendChild(hidden);

  let detailArea = null;
  if (field.expandable) {
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'yesno-btn yesno-expand-btn';
    expandBtn.textContent = '+';

    detailArea = document.createElement('textarea');
    detailArea.className = 'yesno-detail';
    detailArea.placeholder = 'Add detail…';
    detailArea.style.display = 'none';
    detailArea.dataset.detailFor = field.key;

    expandBtn.onclick = () => {
      const open = detailArea.style.display === 'none';
      detailArea.style.display = open ? 'block' : 'none';
      expandBtn.classList.toggle('active-expand', open);
      expandBtn.textContent = open ? '−' : '+';
      if (open) detailArea.focus();
      _syncYesNoValue(toggle, hidden, detailArea);
    };
    detailArea.oninput = () => {
      _syncYesNoValue(toggle, hidden, detailArea);
      expandBtn.classList.toggle('has-detail', detailArea.value.trim().length > 0);
    };
    expandBtn.addEventListener('mousedown', e => e.preventDefault());
    detailArea.addEventListener('blur', () => {
      detailArea.style.display = 'none';
      expandBtn.classList.remove('active-expand');
      expandBtn.textContent = '+';
    });

    toggle.appendChild(expandBtn);
    fieldEl.appendChild(toggle);
    fieldEl.appendChild(detailArea);
  } else {
    fieldEl.appendChild(toggle);
  }

  yesBtn.onclick = () => {
    _setYesNo(toggle, hidden, 'yes');
    _syncYesNoValue(toggle, hidden, detailArea);
    // Suicidal YES: auto-open detail and require a note
    if (field.key === 'suicidal' && detailArea) {
      if (detailArea.style.display === 'none') {
        detailArea.style.display = 'block';
        const expandBtn = toggle.querySelector('.yesno-expand-btn');
        if (expandBtn) { expandBtn.classList.add('active-expand'); expandBtn.textContent = '−'; }
      }
      detailArea.placeholder = 'Required: describe suicidal ideation…';
      detailArea.classList.add('suicidal-required');
      detailArea.focus();
    }
  };
  noBtn.onclick = () => {
    _setYesNo(toggle, hidden, 'no');
    _syncYesNoValue(toggle, hidden, detailArea);
    if (field.key === 'suicidal' && detailArea) {
      detailArea.placeholder = 'Add detail…';
      detailArea.classList.remove('suicidal-required', 'suicidal-missing');
    }
  };

  return fieldEl;
}

function _syncYesNoValue(toggle, hidden, detailArea) {
  const base = hidden.value.replace(/ — .*$/, '');
  const detail = detailArea ? detailArea.value.trim() : '';
  hidden.value = detail ? (base ? `${base} — ${detail}` : detail) : base;
}

function _renderTextField(field) {
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
  return fieldEl;
}

function _setYesNo(toggle, hidden, val) {
  toggle.querySelectorAll('.yesno-btn:not(.yesno-expand-btn)').forEach(b => b.classList.remove('active-yes', 'active-no'));
  const btn = val === 'yes' ? toggle.querySelector('.yesno-btn:first-child')
                            : toggle.querySelectorAll('.yesno-btn:not(.yesno-expand-btn)')[1];
  if (btn) btn.classList.add(val === 'yes' ? 'active-yes' : 'active-no');
  const detail = hidden.value.includes(' — ') ? hidden.value.replace(/^[^—]*— /, '') : '';
  hidden.value = detail ? `${val} — ${detail}` : val;
}

function _restoreYesNo(hiddenInput, val) {
  const toggle = hiddenInput.closest('.yesno-toggle');
  if (!toggle) return;
  const [base, detail] = val.split(' — ');
  const v = base.toLowerCase().trim();
  if (v === 'yes' || v === 'no') _setYesNo(toggle, hiddenInput, v);
  if (detail) {
    const detailArea = hiddenInput.closest('.abn-field').querySelector('.yesno-detail');
    if (detailArea) {
      detailArea.value = detail;
      detailArea.style.display = 'block';
      const expandBtn = toggle.querySelector('.yesno-expand-btn');
      if (expandBtn) {
        expandBtn.classList.add('active-expand');
        expandBtn.classList.add('has-detail');
        expandBtn.textContent = '−';
      }
    }
  }
}

// ── Loading overlay helpers ─────────────────────────────────────────────────
let _countdownTimer = null;
function _showLoading() {
  const el = document.getElementById('ai-loading');
  if (!el) return;
  el.style.display = 'flex';
  const cd = document.getElementById('ai-countdown');
  if (!cd) return;
  let secs = 15;
  cd.textContent = `Estimated time: ${secs}s`;
  clearInterval(_countdownTimer);
  _countdownTimer = setInterval(() => {
    secs--;
    if (secs > 0) {
      cd.textContent = `Estimated time: ${secs}s`;
    } else {
      cd.textContent = 'Almost done…';
      clearInterval(_countdownTimer);
    }
  }, 1000);
}
function _hideLoading() {
  clearInterval(_countdownTimer);
  const el = document.getElementById('ai-loading');
  if (el) el.style.display = 'none';
  const cd = document.getElementById('ai-countdown');
  if (cd) cd.textContent = '';
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

  // Suicidal YES requires a detail note before generating
  const suicidalHidden = document.querySelector('[data-key="suicidal"]');
  if (suicidalHidden) {
    const val = suicidalHidden.value.trim().toLowerCase();
    const isYes = val === 'yes' || val.startsWith('yes —') || val.startsWith('yes—');
    const hasDetail = val.includes(' — ') && val.split(' — ')[1].trim().length > 0;
    if (isYes && !hasDetail) {
      const detailArea = document.querySelector('[data-detail-for="suicidal"]');
      if (detailArea) {
        detailArea.style.display = 'block';
        detailArea.classList.add('suicidal-missing');
        detailArea.placeholder = 'Required: describe suicidal ideation…';
        const expandBtn = detailArea.closest('.abn-field')?.querySelector('.yesno-expand-btn');
        if (expandBtn) { expandBtn.classList.add('active-expand'); expandBtn.textContent = '−'; }
        detailArea.focus();
        setTimeout(() => detailArea.classList.remove('suicidal-missing'), 1200);
      }
      return;
    }
  }

  const fields = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    const val = el.value.trim();
    if (val) fields[el.dataset.key] = val;
  });

  const patientName = document.getElementById('patient-name').value.trim();
  if (patientName) fields['patient_name'] = patientName;

  const btn = document.getElementById('btn-generate');
  const badge = document.getElementById('ai-status');
  const usingAI = badge && badge.classList.contains('ai-on');
  btn.textContent = usingAI ? '🤖 AI Generating…' : 'Generating…';
  btn.disabled = true;

  if (usingAI) _showLoading();

  try {
    const resp = await fetch('/api/generate-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: currentTemplate.id, fields, chart_rules: getChartRules() }),
    });
    const data = await resp.json();
    if (data.error) { alert(data.error); return; }

    currentChartId = null;
    showChart(data.chart, patientName, data.source);
    persistChart(patientName, data.chart, { ...fields });

    if (usingAI && data.source !== 'ai') {
      showFallbackToast();
    }

    // refresh badge in case Ollama state changed mid-session
    checkOllamaStatus();
  } catch (e) {
    alert('Error generating chart: ' + e.message);
  } finally {
    btn.textContent = 'Generate Chart →';
    btn.disabled = false;
    _hideLoading();
  }
}

// ── Draft History ─────────────────────────────────────────────────────────
let _drafts = [];
let _draftIdx = -1;

function _initDrafts(text) {
  _drafts = [{ text, label: 'Original' }];
  _draftIdx = 0;
  _renderDraftNav();
}

function _pushDraft(text) {
  // discard any forward history if user went back
  _drafts = _drafts.slice(0, _draftIdx + 1);
  _drafts.push({ text, label: `Rev. ${_drafts.length}` });
  _draftIdx = _drafts.length - 1;
  _renderDraftNav();
}

function _renderDraftNav() {
  const nav = document.getElementById('draft-nav');
  if (!nav) return;
  nav.innerHTML = '';
  if (_drafts.length <= 1) { nav.style.display = 'none'; return; }
  nav.style.display = 'flex';
  const lbl = document.createElement('span');
  lbl.className = 'draft-nav-label';
  lbl.textContent = 'Versions:';
  nav.appendChild(lbl);
  _drafts.forEach((d, i) => {
    const btn = document.createElement('button');
    btn.className = 'draft-pill' + (i === _draftIdx ? ' active' : '');
    btn.textContent = d.label;
    btn.onclick = () => _switchDraft(i);
    nav.appendChild(btn);
  });
}

function _switchDraft(idx) {
  _draftIdx = idx;
  document.getElementById('chart-output').textContent = _drafts[idx].text;
  _renderDraftNav();
}

// ── Chart Refinement Chat ─────────────────────────────────────────────────
async function sendRefinement() {
  const input  = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) { input.focus(); return; }

  const currentText = document.getElementById('chart-output').innerText || document.getElementById('chart-output').textContent;
  if (!currentText) return;

  const sendBtn = document.getElementById('chat-send-btn');
  input.disabled = true;
  sendBtn.disabled = true;
  sendBtn.textContent = '…';
  _showLoading();

  try {
    const patientName = document.getElementById('patient-name').value.trim();
    const resp = await fetch('/api/refine-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_chart: currentText,
        message,
        patient_name: patientName,
        template_id:  currentTemplate ? currentTemplate.id : '',
        chart_rules:  getChartRules(),
      }),
    });
    const data = await resp.json();
    if (data.error) {
      showOllamaDialog('AI Refinement Unavailable', _ollamaNotRunningHTML('llama3.1:8b'));
      return;
    }

    _pushDraft(data.chart);
    document.getElementById('chart-output').textContent = data.chart;
    input.value = '';

    persistChart(
      patientName,
      data.chart,
      _getFields()
    );
  } catch (e) {
    alert('Refinement error: ' + e.message);
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    sendBtn.textContent = '↑ Refine';
    input.focus();
    _hideLoading();
  }
}

function _getFields() {
  const fields = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    const val = el.value.trim();
    if (val) fields[el.dataset.key] = val;
  });
  return fields;
}

function showChart(text, patientName, source) {
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

  setChartSourceBadge(source);
  setChartOrderNum(null);

  // show chat footer + initialise draft history
  const footer = document.getElementById('chart-chat-footer');
  if (footer) footer.style.display = 'flex';
  _initDrafts(text);
}

function setChartOrderNum(orderNum) {
  const el = document.getElementById('chart-order-num');
  if (!el) return;
  if (orderNum !== null && orderNum !== undefined) {
    el.textContent = `Chart Order #${orderNum}`;
    el.style.display = 'inline-block';
  } else {
    el.style.display = 'none';
  }
}

function setChartSourceBadge(source) {
  const badge = document.getElementById('chart-source-badge');
  if (!badge) return;
  if (source === 'ai') {
    badge.textContent = '🤖 AI Generated';
    badge.className = 'chart-source-badge source-ai';
    badge.style.display = 'inline-block';
  } else if (source === 'rules') {
    badge.textContent = '📝 Rule-based';
    badge.className = 'chart-source-badge source-rules';
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function showFallbackToast() {
  const toast = document.getElementById('fallback-toast');
  if (!toast) return;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 8000);
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
  const footer = document.getElementById('chart-chat-footer');
  if (footer) footer.style.display = 'none';
  _drafts = []; _draftIdx = -1;
  const nav = document.getElementById('draft-nav');
  if (nav) { nav.innerHTML = ''; nav.style.display = 'none'; }
}

// ── New Chart ──────────────────────────────────────────────────────────────
let ncSelectedTemplateId = null;

function openNewChartDialog() {
  ncSelectedTemplateId = null;
  document.querySelectorAll('.nc-tpl-tile').forEach(b => b.classList.remove('selected'));
  ncShowScreen('template');
  document.getElementById('nc-overlay').classList.add('open');
  document.getElementById('nc-dialog').classList.add('open');
}

function closeNewChartDialog() {
  document.getElementById('nc-overlay').classList.remove('open');
  document.getElementById('nc-dialog').classList.remove('open');
}

function ncPickTemplate(templateId) {
  ncSelectedTemplateId = templateId;
  document.querySelectorAll('.nc-tpl-tile').forEach(b =>
    b.classList.toggle('selected', b.dataset.tplId === templateId)
  );
  const label = document.querySelector(`.nc-tpl-tile[data-tpl-id="${templateId}"] .nc-tpl-tile-name`);
  document.getElementById('nc-chosen-type-label').textContent =
    label ? `Chart type: ${label.textContent}` : '';
  ncShowScreen('choice');
}

function ncShowScreen(name) {
  document.querySelectorAll('.nc-screen').forEach(s => s.style.display = 'none');
  document.getElementById(`nc-screen-${name}`).style.display = '';
  document.getElementById('nc-dialog').classList.toggle('nc-wide', name === 'existing');
  if (name === 'new') {
    document.getElementById('nc-first-name').value = '';
    document.getElementById('nc-last-name').value = '';
    setTimeout(() => document.getElementById('nc-first-name').focus(), 50);
  } else if (name === 'existing') {
    document.getElementById('nc-patient-search').value = '';
    _ncDoSearch('');
    setTimeout(() => document.getElementById('nc-patient-search').focus(), 50);
  }
}

function _setPatientName(name) {
  document.getElementById('patient-name').value = name;
  const lbl = document.getElementById('topbar-patient-name');
  if (lbl) { lbl.textContent = name; lbl.style.display = name ? '' : 'none'; }
}

function _resetChart() {
  document.querySelectorAll('.abn-input').forEach(el => el.value = '');
  document.querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('active-yes', 'active-no', 'active-expand', 'has-detail'));
  document.querySelectorAll('.yesno-expand-btn').forEach(b => { b.textContent = '+'; });
  document.querySelectorAll('.yesno-toggle input[type=hidden]').forEach(el => el.value = '');
  document.querySelectorAll('.yesno-detail').forEach(el => {
    el.value = ''; el.style.display = 'none';
    el.placeholder = 'Add detail…';
    el.classList.remove('suicidal-required', 'suicidal-missing');
  });
  _setPatientName('');
  clearChart();
  currentChartId = null;
  clearTimeout(autoSaveTimer);
}

function newChart() { _resetChart(); }

async function ncSubmitNewPatient() {
  const first = document.getElementById('nc-first-name').value.trim();
  const last  = document.getElementById('nc-last-name').value.trim();
  if (!first && !last) { document.getElementById('nc-first-name').focus(); return; }
  const fullName = [first, last].filter(Boolean).join(' ');
  _resetChart();
  _setPatientName(fullName);
  closeNewChartDialog();
  if (ncSelectedTemplateId) await selectTemplate(ncSelectedTemplateId);
}

let _ncSearchTimer = null;
function ncSearchPatients(q) {
  clearTimeout(_ncSearchTimer);
  _ncSearchTimer = setTimeout(() => _ncDoSearch(q), 220);
}

async function _ncDoSearch(q) {
  const list = document.getElementById('nc-patient-list');
  list.innerHTML = '<div class="nc-list-empty">Loading…</div>';
  try {
    const patients = await (await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`)).json();
    list.innerHTML = '';
    if (!patients.length) {
      list.innerHTML = '<div class="nc-list-empty">No patients found.</div>';
      return;
    }
    patients.forEach(p => {
      const row = document.createElement('div');
      row.className = 'nc-patient-row';
      const lastVisit = p.last_visit
        ? new Date(p.last_visit.replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'No charts';
      row.innerHTML = `
        <span class="nc-patient-name">${esc(p.name)}</span>
        <span class="nc-patient-meta">${p.chart_count} chart${p.chart_count !== 1 ? 's' : ''} · ${lastVisit}</span>`;
      row.onclick = () => ncSelectExistingPatient(p.id, p.name);
      list.appendChild(row);
    });
  } catch {
    list.innerHTML = '<div class="nc-list-empty">Error loading patients.</div>';
  }
}

function ncSelectExistingPatient(patientId, patientName) {
  _resetChart();
  _setPatientName(patientName);
  closeNewChartDialog();
  showChartsInDropdown(patientId, patientName);
  if (ncSelectedTemplateId) selectTemplate(ncSelectedTemplateId);
}

// ── Reset ABN Fields ─────────────────────────────────────────────────────
function promptResetAbn() {
  document.getElementById('rabn-overlay').classList.add('open');
  document.getElementById('rabn-dialog').classList.add('open');
}

function cancelResetAbn() {
  document.getElementById('rabn-overlay').classList.remove('open');
  document.getElementById('rabn-dialog').classList.remove('open');
}

function confirmResetAbn() {
  cancelResetAbn();
  document.querySelectorAll('.abn-input').forEach(el => el.value = '');
  document.querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('active-yes', 'active-no'));
  document.querySelectorAll('.yesno-expand-btn').forEach(b => { b.textContent = '+'; b.classList.remove('active-expand', 'has-detail'); });
  document.querySelectorAll('.yesno-toggle input[type=hidden]').forEach(el => el.value = '');
  document.querySelectorAll('.yesno-detail').forEach(el => {
    el.value = ''; el.style.display = 'none';
    el.placeholder = 'Add detail…';
    el.classList.remove('suicidal-required', 'suicidal-missing');
  });
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
      if (data.order_num !== undefined) setChartOrderNum(data.order_num);
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
  checkOllamaStatus();
});

async function checkOllamaStatus() {
  const badge = document.getElementById('ai-status');
  badge.onclick = null;
  try {
    const data = await (await fetch('/api/ollama-status')).json();
    if (data.enabled && data.available) {
      badge.className = 'ai-status ai-on';
      badge.textContent = `🤖 AI · ${data.model}`;
      badge.title = 'Ollama is running — charts will be AI-generated';
    } else if (data.enabled && data.ollama_running && !data.model_ready) {
      badge.className = 'ai-status ai-warn';
      badge.textContent = '⚠️ Model not downloaded';
      badge.title = 'Ollama is running but the model isn\'t pulled yet — click for help';
      badge.onclick = () => showOllamaDialog('Model Not Downloaded', _ollamaModelNotPulledHTML(data.model));
    } else if (data.enabled && !data.ollama_running) {
      badge.className = 'ai-status ai-off';
      badge.textContent = '📝 Rules (Ollama offline)';
      badge.title = 'Ollama is not running — click for setup help';
      badge.onclick = () => showOllamaDialog('Ollama Not Running', _ollamaNotRunningHTML(data.model));
    } else {
      badge.className = 'ai-status ai-off';
      badge.textContent = '📝 Rules';
      badge.title = 'AI generation is disabled';
    }
  } catch {
    badge.className = 'ai-status ai-off';
    badge.textContent = '📝 Rules';
  }
}

function _ollamaNotRunningHTML(model) {
  return `<p>Ollama is not running on this computer. Charts are being generated using the built-in rule-based generator instead.</p>
<p><strong>To enable AI chart generation:</strong></p>
<ol>
  <li>Download and install Ollama from <strong>ollama.com</strong></li>
  <li>Once installed, Ollama runs automatically in the menu bar</li>
  <li>Open Terminal and run: <code>ollama pull ${model}</code><br>
      <em style="color:#6b7280">(this is a ~5 GB download, only needed once)</em></li>
  <li>Reload this page — the badge will turn green when ready</li>
</ol>`;
}

function _ollamaModelNotPulledHTML(model) {
  return `<p>Ollama is running but the <code>${model}</code> model hasn't been downloaded yet.</p>
<p><strong>To download the model:</strong></p>
<ol>
  <li>Open Terminal (Finder → Applications → Utilities → Terminal)</li>
  <li>Run: <code>ollama pull ${model}</code><br>
      <em style="color:#6b7280">(~5 GB download, only needed once)</em></li>
  <li>Wait for the download to finish, then reload this page</li>
</ol>`;
}

function showOllamaDialog(title, bodyHTML) {
  document.getElementById('ol-dialog-title').textContent = title;
  document.getElementById('ol-dialog-body').innerHTML = bodyHTML;
  document.getElementById('ol-overlay').classList.add('open');
  document.getElementById('ol-dialog').classList.add('open');
}

function closeOllamaDialog() {
  document.getElementById('ol-overlay').classList.remove('open');
  document.getElementById('ol-dialog').classList.remove('open');
}

// ── Patient List Panel ────────────────────────────────────────────────────
let _plSearchTimer = null;

function openPatientList() {
  document.getElementById('pl-overlay').classList.add('open');
  document.getElementById('pl-panel').classList.add('open');
  document.getElementById('pl-search').value = '';
  _plDoLoad('');
  setTimeout(() => document.getElementById('pl-search').focus(), 60);
}

function closePatientList() {
  document.getElementById('pl-overlay').classList.remove('open');
  document.getElementById('pl-panel').classList.remove('open');
}

function plSearch(q) {
  clearTimeout(_plSearchTimer);
  _plSearchTimer = setTimeout(() => _plDoLoad(q), 250);
}

async function _plDoLoad(q) {
  const list = document.getElementById('pl-list');
  list.innerHTML = '<div class="pl-empty">Loading…</div>';
  try {
    const patients = await (await fetch(`/api/patients?q=${encodeURIComponent(q)}`)).json();
    list.innerHTML = '';
    if (!patients.length) {
      list.innerHTML = '<div class="pl-empty">No patients found.</div>';
      return;
    }
    let lastLetter = '';
    patients.forEach(p => {
      const letter = (p.name[0] || '#').toUpperCase();
      if (!q && letter !== lastLetter) {
        const div = document.createElement('div');
        div.className = 'pl-letter-divider';
        div.textContent = letter;
        list.appendChild(div);
        lastLetter = letter;
      }
      list.appendChild(_plMakeRow(p));
    });
  } catch {
    list.innerHTML = '<div class="pl-empty">Error loading patients.</div>';
  }
}

function _plMakeRow(p) {
  const row = document.createElement('div');
  row.className = 'pl-row';
  row.id = `pl-row-${p.id}`;

  const lastVisit = p.last_visit
    ? new Date(p.last_visit.replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No charts';

  row.innerHTML = `
    <div class="pl-row-info">
      <div class="pl-row-name">${esc(p.name)}</div>
      <div class="pl-row-meta">${p.chart_count} chart${p.chart_count !== 1 ? 's' : ''} · Last visit: ${lastVisit}</div>
    </div>
    <div class="pl-row-actions">
      <button class="pl-btn-edit" onclick="event.stopPropagation();plStartEdit(${p.id}, '${esc(p.name).replace(/'/g, "\\'")}')">✏ Edit</button>
      <button class="pl-btn-delete" onclick="event.stopPropagation();plStartDelete(${p.id}, '${esc(p.name).replace(/'/g, "\\'")}')">🗑 Delete</button>
    </div>`;
  row.onclick = () => plShowCharts(p.id, p.name);
  return row;
}

function plStartEdit(patientId, currentName) {
  const row = document.getElementById(`pl-row-${patientId}`);
  row.innerHTML = `
    <div class="pl-edit-form">
      <input class="pl-edit-input" id="pl-edit-input-${patientId}" type="text"
             value="${esc(currentName)}" autocomplete="off"
             onkeydown="if(event.key==='Enter') plSaveEdit(${patientId}); if(event.key==='Escape') plCancelEdit(${patientId}, '${esc(currentName).replace(/'/g, "\\'")}')">
      <button class="pl-btn-save" onclick="plSaveEdit(${patientId})">Save</button>
      <button class="pl-btn-cancel-edit" onclick="plCancelEdit(${patientId}, '${esc(currentName).replace(/'/g, "\\'")}')">Cancel</button>
    </div>`;
  document.getElementById(`pl-edit-input-${patientId}`).select();
}

async function plSaveEdit(patientId) {
  const input = document.getElementById(`pl-edit-input-${patientId}`);
  const newName = input.value.trim();
  if (!newName) { input.focus(); return; }
  try {
    await fetch(`/api/patient/${patientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    const q = document.getElementById('pl-search').value;
    _plDoLoad(q);
  } catch { alert('Error saving name.'); }
}

function plCancelEdit(patientId, originalName) {
  const row = document.getElementById(`pl-row-${patientId}`);
  const lastVisitEl = row.querySelector('.pl-row-meta');
  row.innerHTML = `
    <div class="pl-row-info">
      <div class="pl-row-name">${esc(originalName)}</div>
      <div class="pl-row-meta">${lastVisitEl ? lastVisitEl.textContent : ''}</div>
    </div>
    <div class="pl-row-actions">
      <button class="pl-btn-edit" onclick="event.stopPropagation();plStartEdit(${patientId}, '${esc(originalName).replace(/'/g, "\\'")}')">✏ Edit</button>
      <button class="pl-btn-delete" onclick="event.stopPropagation();plStartDelete(${patientId}, '${esc(originalName).replace(/'/g, "\\'")}')">🗑 Delete</button>
    </div>`;
  row.onclick = () => plShowCharts(patientId, originalName);
}

function plStartDelete(patientId, name) {
  const row = document.getElementById(`pl-row-${patientId}`);
  row.innerHTML = `
    <div class="pl-confirm-row">
      <span class="pl-confirm-msg">Delete <strong>${esc(name)}</strong> and all their charts?</span>
      <button class="pl-btn-confirm-del" onclick="plConfirmDelete(${patientId})">Yes, Delete</button>
      <button class="pl-btn-cancel-del" onclick="plCancelDelete(${patientId}, '${esc(name).replace(/'/g, "\\'")}')">Cancel</button>
    </div>`;
}

async function plConfirmDelete(patientId) {
  try {
    await fetch(`/api/patient/${patientId}`, { method: 'DELETE' });
    const q = document.getElementById('pl-search').value;
    _plDoLoad(q);
  } catch { alert('Error deleting patient.'); }
}

function plCancelDelete(patientId, name) {
  const q = document.getElementById('pl-search').value;
  _plDoLoad(q);
}

function plShowNewPatientForm() {
  const list = document.getElementById('pl-list');
  if (document.getElementById('pl-new-form')) return; // already showing
  const form = document.createElement('div');
  form.className = 'pl-new-patient-form';
  form.id = 'pl-new-form';
  form.innerHTML = `
    <span class="pl-form-label">New Patient:</span>
    <input class="pl-edit-input" id="pl-new-first" type="text" placeholder="First name" autocomplete="off">
    <input class="pl-edit-input" id="pl-new-last"  type="text" placeholder="Last name"  autocomplete="off"
           onkeydown="if(event.key==='Enter') plSubmitNewPatient()">
    <button class="pl-btn-save" onclick="plSubmitNewPatient()">Create</button>
    <button class="pl-btn-cancel-edit" onclick="this.closest('#pl-new-form').remove()">Cancel</button>`;
  list.prepend(form);
  document.getElementById('pl-new-first').focus();
}

async function plSubmitNewPatient() {
  const first = document.getElementById('pl-new-first').value.trim();
  const last  = document.getElementById('pl-new-last').value.trim();
  if (!first && !last) { document.getElementById('pl-new-first').focus(); return; }
  const name = [first, last].filter(Boolean).join(' ');
  try {
    const resp = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await resp.json();
    if (data.error) { alert(data.error); return; }
    const q = document.getElementById('pl-search').value;
    _plDoLoad(q);
  } catch { alert('Error creating patient.'); }
}

async function plShowCharts(patientId, patientName) {
  const list = document.getElementById('pl-list');
  list.innerHTML = '<div class="pl-empty">Loading charts…</div>';

  try {
    const charts = await (await fetch(`/api/patient/${patientId}/charts`)).json();
    list.innerHTML = '';

    const back = document.createElement('div');
    back.className = 'pl-charts-header';
    back.innerHTML = `
      <button class="pl-back-btn" onclick="_plDoLoad(document.getElementById('pl-search').value)">← Back</button>
      <span class="pl-charts-patient">${esc(patientName)}</span>
      <button class="pl-btn-new-chart" onclick="plNewChartForPatient(${patientId}, '${esc(patientName).replace(/'/g, "\\'")}')">+ New Chart</button>`;
    list.appendChild(back);

    if (!charts.length) {
      const empty = document.createElement('div');
      empty.className = 'pl-empty';
      empty.textContent = 'No charts saved yet.';
      list.appendChild(empty);
      return;
    }

    // Build filter bar
    const types = [...new Set(charts.map(c => c.template_id))];
    {
      const filterBar = document.createElement('div');
      filterBar.className = 'pl-filter-bar';
      filterBar.id = 'pl-filter-bar';
      const lbl = document.createElement('span');
      lbl.className = 'pl-filter-label';
      lbl.textContent = 'Filter:';
      filterBar.appendChild(lbl);
      const allBtn = document.createElement('button');
      allBtn.className = 'pl-filter-btn active';
      allBtn.textContent = 'All';
      allBtn.dataset.filter = '';
      filterBar.appendChild(allBtn);
      types.forEach(tid => {
        const btn = document.createElement('button');
        btn.className = 'pl-filter-btn';
        btn.textContent = tid;
        btn.dataset.filter = tid;
        filterBar.appendChild(btn);
      });
      filterBar.onclick = e => {
        const btn = e.target.closest('.pl-filter-btn');
        if (!btn) return;
        filterBar.querySelectorAll('.pl-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.dataset.filter;
        list.querySelectorAll('.pl-chart-row').forEach(row => {
          row.style.display = (!f || row.dataset.tplId === f) ? '' : 'none';
        });
      };
      list.appendChild(filterBar);
    }

    charts.forEach(c => {
      const row = document.createElement('div');
      row.className = 'pl-chart-row';
      row.dataset.tplId = c.template_id;
      const d = new Date(c.updated_at.replace(' ', 'T')).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      row.innerHTML = `
        <div class="pl-chart-order-badge">#${c.order_num ?? c.id}</div>
        <div class="pl-chart-row-content">
          <div class="pl-chart-row-header">
            <span class="pl-chart-tpl">${esc(c.template_id)} · ${esc(c.template_name)}</span>
            <span class="pl-chart-date">${d}</span>
          </div>
          <div class="pl-chart-preview">${esc(c.preview)}</div>
        </div>`;
      row.onclick = () => loadChartRecord(c.id, patientName);
      list.appendChild(row);
    });
  } catch {
    list.innerHTML = '<div class="pl-empty">Error loading charts.</div>';
  }
}

function plNewChartForPatient(patientId, patientName) {
  const list = document.getElementById('pl-list');
  list.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'pl-charts-header';
  header.innerHTML = `
    <button class="pl-back-btn" onclick="plShowCharts(${patientId}, '${esc(patientName).replace(/'/g, "\\'")}')">← Back</button>
    <span class="pl-charts-patient">New chart for ${esc(patientName)}</span>`;
  list.appendChild(header);

  const hint = document.createElement('div');
  hint.className = 'pl-tpl-hint';
  hint.textContent = 'Select a chart type:';
  list.appendChild(hint);

  const grid = document.createElement('div');
  grid.className = 'pl-tpl-grid';

  document.querySelectorAll('.btn-tpl').forEach(tile => {
    const tplId   = tile.dataset.templateId;
    const tplName = tile.querySelector('.tpl-name').textContent;
    const btn = document.createElement('button');
    btn.className = 'pl-tpl-tile';
    btn.innerHTML = `<span class="pl-tpl-tile-id">${esc(tplId)}</span><span class="pl-tpl-tile-name">${esc(tplName)}</span>`;
    btn.onclick = () => {
      _resetChart();
      _setPatientName(patientName);
      closePatientList();
      selectTemplate(tplId);
    };
    grid.appendChild(btn);
  });

  list.appendChild(grid);
}

async function loadChartRecord(chartId, patientName) {
  try {
    const data = await (await fetch(`/api/chart/${chartId}`)).json();
    if (data.error) { alert(data.error); return; }

    closePatientList();

    _setPatientName(data.patient_name || patientName);
    await selectTemplate(data.template_id);

    Object.entries(data.fields).forEach(([key, val]) => {
      const el = document.getElementById(`abn_${key}`);
      if (!el) return;
      el.value = val;
      _restoreYesNo(el, val);
    });

    showChart(data.chart_text, data.patient_name || patientName);
    if (data.order_num !== undefined && data.order_num !== null) setChartOrderNum(data.order_num);
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
      _setPatientName(patientName);
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

// ── View All Charts ───────────────────────────────────────────────────────
let vacPage = 1;
let vacQuery = '';
// ── Update ────────────────────────────────────────────────────────────────
function toggleAdminMenu(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('admin-dropdown');
  dd.style.display = dd.style.display === 'none' ? 'flex' : 'none';
}
document.addEventListener('click', function(e) {
  const menu = document.getElementById('admin-menu');
  if (menu && !menu.contains(e.target)) {
    document.getElementById('admin-dropdown').style.display = 'none';
  }
});

async function runUpdate() {
  const btn = document.getElementById('btn-update');
  btn.textContent = '⟳ Updating…';
  btn.disabled = true;

  try {
    const resp = await fetch('/api/update', { method: 'POST' });
    const data = await resp.json();

    if (!data.ok) {
      alert('Update failed:\n\n' + data.output);
    } else if (data.current) {
      btn.textContent = '✓ Up to date';
      setTimeout(() => { btn.textContent = '⟳ Update'; btn.disabled = false; }, 2500);
      return;
    } else {
      alert('Updated successfully! The tool will reload now.\n\n' + data.output);
      location.reload();
    }
  } catch {
    alert('Update failed — make sure the server is running and connected to the internet.');
  }

  btn.textContent = '⟳ Update';
  btn.disabled = false;
}

// ── Export / Import ───────────────────────────────────────────────────────
function exportData() {
  window.location.href = '/api/export';
}

async function importData(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  const confirmed = confirm(
    `Import "${file.name}"?\n\nExisting patients and charts will be kept. ` +
    `Only new records will be added (no duplicates).`
  );
  if (!confirmed) return;

  const form = new FormData();
  form.append('file', file);

  try {
    const resp = await fetch('/api/import', { method: 'POST', body: form });
    const data = await resp.json();
    if (data.error) { alert('Import failed: ' + data.error); return; }
    alert(
      `Import complete!\n` +
      `• ${data.patients_added} new patient(s) added\n` +
      `• ${data.charts_added} new chart(s) added`
    );
  } catch {
    alert('Import failed — check that the file is a valid export.');
  }
}

let vacSearchTimer = null;

function openVac() {
  document.getElementById('vac-overlay').classList.add('open');
  document.getElementById('vac-panel').classList.add('open');
  vacPage = 1;
  vacQuery = '';
  document.getElementById('vac-search').value = '';
  loadVacCharts();
  setTimeout(() => document.getElementById('vac-search').focus(), 60);
}

function closeVac() {
  document.getElementById('vac-overlay').classList.remove('open');
  document.getElementById('vac-panel').classList.remove('open');
}

function vacSearch(q) {
  clearTimeout(vacSearchTimer);
  vacSearchTimer = setTimeout(() => {
    vacQuery = q;
    vacPage = 1;
    loadVacCharts();
  }, 300);
}

async function loadVacCharts() {
  document.getElementById('vac-list').innerHTML = '<div class="vac-loading">Loading…</div>';
  try {
    const url = `/api/charts?page=${vacPage}&q=${encodeURIComponent(vacQuery)}`;
    const data = await (await fetch(url)).json();
    renderVacCharts(data);
  } catch {
    document.getElementById('vac-list').innerHTML = '<div class="vac-empty">Error loading charts.</div>';
  }
}

function renderVacCharts(data) {
  const list = document.getElementById('vac-list');
  list.innerHTML = '';

  if (!data.charts.length) {
    list.innerHTML = '<div class="vac-empty">No charts found.</div>';
    renderVacPagination(data, 'vac-pagination-top');
    renderVacPagination(data, 'vac-pagination-bot');
    return;
  }

  data.charts.forEach(c => {
    const isFinished = c.status === 'finished';
    const card = document.createElement('div');
    card.className = `vac-card${isFinished ? ' finished' : ''}`;
    card.id = `vac-card-${c.id}`;

    const created = new Date(c.created_at.replace(' ', 'T'));
    const d = created.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    const daysAgo = Math.floor((Date.now() - created.getTime()) / 86400000);
    const daysLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;

    card.innerHTML = `
      <div class="vac-card-inner">
        <div class="vac-card-left">
          <span class="vac-tpl-badge">${esc(c.template_id)}</span>
          <span class="vac-order-num">#${c.order_num ?? c.id}</span>
        </div>
        <div class="vac-card-mid">
          <div class="vac-card-name">${esc(c.patient_name)}</div>
          <div class="vac-card-meta">${d}</div>
          <div class="vac-card-preview">${esc(c.preview)}</div>
        </div>
        <div class="vac-card-right">
          <span class="vac-days-ago">${daysLabel}</span>
        </div>
      </div>`;
    card.onclick = () => vacLoadChart(c.id, c.patient_name);
    list.appendChild(card);
  });

  renderVacPagination(data, 'vac-pagination-top');
  renderVacPagination(data, 'vac-pagination-bot');
}

function renderVacPagination(data, containerId) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  if (data.pages <= 1) return;

  const wrap = document.createElement('div');
  wrap.className = 'vac-pagination';

  const prev = document.createElement('button');
  prev.className = 'vac-pg-btn';
  prev.textContent = '‹ Prev';
  prev.disabled = data.page <= 1;
  prev.onclick = () => { vacPage = data.page - 1; loadVacCharts(); };
  wrap.appendChild(prev);

  const start = Math.max(1, data.page - 3);
  const end   = Math.min(data.pages, data.page + 3);

  if (start > 1) {
    const b = makePageBtn(1); wrap.appendChild(b);
    if (start > 2) wrap.appendChild(makeEllipsis());
  }
  for (let i = start; i <= end; i++) wrap.appendChild(makePageBtn(i, i === data.page));
  if (end < data.pages) {
    if (end < data.pages - 1) wrap.appendChild(makeEllipsis());
    wrap.appendChild(makePageBtn(data.pages));
  }

  const next = document.createElement('button');
  next.className = 'vac-pg-btn';
  next.textContent = 'Next ›';
  next.disabled = data.page >= data.pages;
  next.onclick = () => { vacPage = data.page + 1; loadVacCharts(); };
  wrap.appendChild(next);

  const info = document.createElement('span');
  info.className = 'vac-pg-info';
  const from = (data.page - 1) * 25 + 1;
  const to   = Math.min(data.page * 25, data.total);
  info.textContent = `${from}–${to} of ${data.total}`;
  wrap.appendChild(info);

  el.appendChild(wrap);
}

function makePageBtn(page, active = false) {
  const b = document.createElement('button');
  b.className = `vac-pg-btn${active ? ' active' : ''}`;
  b.textContent = page;
  b.onclick = () => { vacPage = page; loadVacCharts(); };
  return b;
}

function makeEllipsis() {
  const s = document.createElement('span');
  s.className = 'vac-pg-ellipsis';
  s.textContent = '…';
  return s;
}

async function toggleVacStatus(chartId, currentStatus) {
  const newStatus = currentStatus === 'finished' ? 'active' : 'finished';
  try {
    await fetch(`/api/chart/${chartId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const card = document.getElementById(`vac-card-${chartId}`);
    if (card) {
      card.classList.toggle('finished', newStatus === 'finished');
      const btn = card.querySelector('.vac-status-btn');
      btn.className = `vac-status-btn ${newStatus}`;
      btn.textContent = newStatus === 'finished' ? '✓ Finished' : '● Active';
      btn.onclick = () => toggleVacStatus(chartId, newStatus);
    }
  } catch (e) {
    alert('Error updating status: ' + e.message);
  }
}

async function vacLoadChart(chartId, patientName) {
  closeVac();
  await loadChartRecord(chartId, patientName);
}
