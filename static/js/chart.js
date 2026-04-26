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
  const srch = document.getElementById('abn-search');
  if (srch) { srch.value = ''; }

  if (!template.abn_groups) {
    body.innerHTML = '<div class="empty-hint">No notes template defined for this chart type yet.</div>';
    return;
  }

  template.abn_groups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'abn-group';

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
  if (document.body.classList.contains('abn-expanded')) _abnSplitColumns();
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
    detailArea = document.createElement('textarea');
    detailArea.className = 'yesno-detail';
    detailArea.placeholder = 'Add detail…';
    detailArea.dataset.detailFor = field.key;

    detailArea.oninput = () => {
      _syncYesNoValue(toggle, hidden, detailArea);
      detailArea.style.height = 'auto';
      detailArea.style.height = detailArea.scrollHeight + 'px';
      _updateYesNoAnswered();
    };

    fieldEl.appendChild(toggle);
    fieldEl.appendChild(detailArea);
  } else {
    fieldEl.appendChild(toggle);
  }

  const _updateYesNoAnswered = () => {
    const base = hidden.value.replace(/ — .*$/, '').trim();
    const hasDetail = detailArea ? detailArea.value.trim().length > 0 : false;
    fieldEl.classList.toggle('answered', base === 'yes' || base === 'no' || hasDetail);
  };

  yesBtn.onclick = () => {
    if (yesBtn.classList.contains('active-yes')) {
      _clearYesNo(toggle, hidden);
      _syncYesNoValue(toggle, hidden, detailArea);
      if (field.key === 'suicidal' && detailArea) {
        detailArea.placeholder = 'Add detail…';
        detailArea.classList.remove('suicidal-required', 'suicidal-missing');
      }
    } else {
      _setYesNo(toggle, hidden, 'yes');
      _syncYesNoValue(toggle, hidden, detailArea);
      if (field.key === 'suicidal' && detailArea) {
        detailArea.placeholder = 'Required: describe suicidal ideation…';
        detailArea.classList.add('suicidal-required');
        detailArea.focus();
      }
    }
    _updateYesNoAnswered();
  };
  noBtn.onclick = () => {
    if (noBtn.classList.contains('active-no')) {
      _clearYesNo(toggle, hidden);
      _syncYesNoValue(toggle, hidden, detailArea);
      if (field.key === 'suicidal' && detailArea) {
        detailArea.placeholder = 'Add detail…';
        detailArea.classList.remove('suicidal-required', 'suicidal-missing');
      }
    } else {
      _setYesNo(toggle, hidden, 'no');
      _syncYesNoValue(toggle, hidden, detailArea);
      if (field.key === 'suicidal' && detailArea) {
        detailArea.placeholder = 'Add detail…';
        detailArea.classList.remove('suicidal-required', 'suicidal-missing');
      }
    }
    _updateYesNoAnswered();
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
  input.addEventListener('input', () => {
    fieldEl.classList.toggle('answered', input.value.trim().length > 0);
  });

  fieldEl.appendChild(input);
  return fieldEl;
}

function _clearYesNo(toggle, hidden) {
  toggle.querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('active-yes', 'active-no'));
  const detail = hidden.value.includes(' — ') ? hidden.value.replace(/^[^—]*— /, '') : '';
  hidden.value = detail ? `— ${detail}` : '';
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
  btn.textContent = '🤖 AI Generating…';
  btn.disabled = true;

  _showLoading();

  try {
    const resp = await fetch('/api/generate-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: currentTemplate.id, fields, chart_rules: getChartRules(), notepad_context: _getNotepadContext() }),
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

function _setAbnExpand(expand) {
  const panel = document.getElementById('left-panel');
  const btn   = document.getElementById('btn-expand-abn');
  panel.classList.toggle('abn-expanded', expand);
  document.body.classList.toggle('abn-expanded', expand);
  btn.classList.toggle('expanded', expand);
  btn.textContent = expand ? '⤡ Collapse' : '⤢ Expand';
  btn.title = expand ? 'Collapse notes panel' : 'Expand notes panel';
  expand ? _abnSplitColumns() : _abnMergeColumns();
}

function _abnSplitColumns() {
  const body = document.getElementById('abn-form-body');
  if (body.querySelector('.abn-col')) return;

  // Items may be inside .abn-group wrappers (first render) or flat in body (after merge)
  const groups = [...body.querySelectorAll(':scope > .abn-group')];
  const sources = groups.length ? groups : [body];

  const items = [];
  sources.forEach(src => {
    [...src.children].forEach(child => {
      if (child.classList.contains('abn-col')) return;
      const weight = child.classList.contains('yesno-grid')
        ? child.querySelectorAll('.yesno-field').length * 2
        : child.querySelector('textarea') ? 2 : 1;
      items.push({ el: child, weight });
    });
  });

  const target = items.reduce((s, i) => s + i.weight, 0) / 2;
  const col1 = document.createElement('div'); col1.className = 'abn-col';
  const col2 = document.createElement('div'); col2.className = 'abn-col';
  let w = 0;
  items.forEach(item => {
    // Put in col1 only if its midpoint still falls below target
    const col = (w + item.weight / 2) < target ? col1 : col2;
    col.appendChild(item.el);
    if (col === col1) w += item.weight;
  });

  groups.forEach(g => g.remove());
  body.appendChild(col1);
  body.appendChild(col2);
}

function _abnMergeColumns() {
  const body = document.getElementById('abn-form-body');
  body.querySelectorAll('.abn-col').forEach(col => {
    [...col.children].forEach(item => body.appendChild(item));
    col.remove();
  });
}

function toggleAbnExpand() { _setAbnExpand(!document.getElementById('left-panel').classList.contains('abn-expanded')); }
function _expandAbn()      { _setAbnExpand(true);  }
function _collapseAbn()    { _setAbnExpand(false); }

function showChart(text, patientName, source) {
  _collapseAbn();
  document.getElementById('chart-placeholder').style.display = 'none';
  const output = document.getElementById('chart-output');
  output.style.display = 'block';
  output.textContent = text;

  document.getElementById('btn-delete').disabled = false;
  document.getElementById('btn-save').classList.add('save-active');
  document.getElementById('btn-copy').disabled = false;
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
    badge.innerHTML = '<img src="/static/img/llama-head.png" class="badge-llama-icon" alt=""> Generated with Llama';
    badge.className = 'chart-source-badge source-ai';
    badge.style.display = 'inline-flex';
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
  document.getElementById('btn-save').className = 'save-indicator';
  document.getElementById('btn-copy').disabled = true;
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
  _patientFirstMode = false;
  ncSelectedTemplateId = null;
  document.querySelectorAll('.nc-tpl-tile').forEach(b => b.classList.remove('selected'));
  ncShowScreen('template');
  document.getElementById('nc-overlay').classList.add('open');
  document.getElementById('nc-dialog').classList.add('open');
}

// Opens dialog patient-first: select patient → then select chart type
let _patientFirstMode = false;
let _patientFirstPendingId = null;
let _patientFirstPendingName = null;
function openPatientFirstDialog() {
  _patientFirstMode = true;
  _patientFirstPendingId = null;
  _patientFirstPendingName = null;
  ncSelectedTemplateId = null;
  document.querySelectorAll('.nc-tpl-tile').forEach(b => b.classList.remove('selected'));
  ncShowScreen('existing');
  document.getElementById('nc-overlay').classList.add('open');
  document.getElementById('nc-dialog').classList.add('open');
}

function closeNewChartDialog() {
  document.getElementById('nc-overlay').classList.remove('open');
  document.getElementById('nc-dialog').classList.remove('open');
}

async function ncPickTemplate(templateId) {
  ncSelectedTemplateId = templateId;
  document.querySelectorAll('.nc-tpl-tile').forEach(b =>
    b.classList.toggle('selected', b.dataset.tplId === templateId)
  );
  const label = document.querySelector(`.nc-tpl-tile[data-tpl-id="${templateId}"] .nc-tpl-tile-name`);
  document.getElementById('nc-chosen-type-label').textContent =
    label ? `Chart type: ${label.textContent}` : '';
  // Patient-first mode: patient already selected, start chart immediately
  if (_patientFirstMode && _patientFirstPendingId) {
    const id = _patientFirstPendingId, name = _patientFirstPendingName;
    _patientFirstMode = false;
    await _resetChart();
    _setPatientName(name);
    closeNewChartDialog();
    showChartsInDropdown(id, name);
    selectTemplate(templateId);
    return;
  }
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
  const hasPatient = !!name.trim();
  const overlay = document.getElementById('no-patient-overlay');
  if (overlay) overlay.classList.toggle('active', !hasPatient);
  document.querySelectorAll('.btn-tpl').forEach(btn =>
    btn.classList.toggle('patient-required', !hasPatient)
  );
}

async function _resetChart() {
  // Flush any pending ABN save BEFORE wiping the form, so in-progress answers aren't lost
  clearTimeout(_abnSaveTimer);
  clearTimeout(autoSaveTimer);
  await _doAbnSave();

  document.querySelectorAll('.abn-input').forEach(el => el.value = '');
  document.querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('active-yes', 'active-no'));
  document.querySelectorAll('.yesno-toggle input[type=hidden]').forEach(el => el.value = '');
  document.querySelectorAll('.yesno-detail').forEach(el => {
    el.value = '';
    el.style.height = '34px';
    el.placeholder = 'Add detail…';
    el.classList.remove('suicidal-required', 'suicidal-missing');
  });
  document.querySelectorAll('.abn-field, .yesno-field').forEach(el => el.classList.remove('answered'));
  _setPatientName('');
  clearChart();
  currentChartId = null;
  _refreshNotepad();
}

async function newChart() { await _resetChart(); }

async function ncSubmitNewPatient() {
  const first = document.getElementById('nc-first-name').value.trim();
  const last  = document.getElementById('nc-last-name').value.trim();
  if (!first && !last) { document.getElementById('nc-first-name').focus(); return; }
  const fullName = [first, last].filter(Boolean).join(' ');
  if (_patientFirstMode) {
    _patientFirstPendingId = null;
    _patientFirstPendingName = fullName;
    ncShowScreen('template');
    return;
  }
  await _resetChart();
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

async function ncSelectExistingPatient(patientId, patientName) {
  if (_patientFirstMode) {
    _patientFirstPendingId = patientId;
    _patientFirstPendingName = patientName;
    ncShowScreen('template');
    return;
  }
  await _resetChart();
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

// ── ABN Field Search ──────────────────────────────────────────────────────
function abnSearch(query) {
  const q = query.trim().toLowerCase();
  const body = document.getElementById('abn-form-body');

  // Target only individual fields — never the yesno-grid wrapper, which has
  // no label of its own and would override matches inside it via opacity inheritance.
  const fields = [...body.querySelectorAll('.abn-field, .yesno-field')];

  if (!q) {
    fields.forEach(f => f.classList.remove('abn-search-dim', 'abn-search-match'));
    return;
  }

  let firstMatch = null;
  fields.forEach(f => {
    const label = f.querySelector(':scope > .abn-label');
    const text = label ? label.textContent.toLowerCase() : '';
    const matches = text.includes(q);
    f.classList.toggle('abn-search-match', matches);
    f.classList.toggle('abn-search-dim', !matches);
    if (matches && !firstMatch) firstMatch = f;
  });

  if (firstMatch) firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function abnClearSearch() {
  const input = document.getElementById('abn-search');
  if (input) input.value = '';
  abnSearch('');
}

function cancelResetAbn() {
  document.getElementById('rabn-overlay').classList.remove('open');
  document.getElementById('rabn-dialog').classList.remove('open');
}

function confirmResetAbn() {
  cancelResetAbn();
  document.querySelectorAll('.abn-input').forEach(el => el.value = '');
  document.querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('active-yes', 'active-no'));
  document.querySelectorAll('.yesno-toggle input[type=hidden]').forEach(el => el.value = '');
  document.querySelectorAll('.yesno-detail').forEach(el => {
    el.value = '';
    el.style.height = '34px';
    el.placeholder = 'Add detail…';
    el.classList.remove('suicidal-required', 'suicidal-missing');
  });
  document.querySelectorAll('.abn-field, .yesno-field').forEach(el => el.classList.remove('answered'));
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
  const ind = document.getElementById('btn-save');
  if (ind) { ind.className = 'save-indicator save-active save-saved'; ind.textContent = ''; }
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

// ── ABN field auto-save (saves even before chart is generated) ─────────────
let _abnSaveTimer = null;
function _scheduleAbnSave() {
  clearTimeout(_abnSaveTimer);
  const ind = document.getElementById('btn-save');
  if (ind) { ind.className = 'save-indicator save-active save-pending'; ind.textContent = ''; }
  _abnSaveTimer = setTimeout(_doAbnSave, 2000);
}

async function _doAbnSave() {
  const name = document.getElementById('patient-name').value.trim();
  if (!name || !currentTemplate) return;

  const fields = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    if (el.value.trim()) fields[el.dataset.key] = el.value.trim();
  });
  delete fields['patient_name'];
  if (!Object.keys(fields).length) return;

  try {
    const chartText = document.getElementById('chart-output').innerText.trim();
    const resp = await fetch('/api/save-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: name,
        template_id:  currentTemplate.id,
        fields,
        chart_text:   chartText,
        chart_id:     currentChartId,
      }),
    });
    const data = await resp.json();
    if (data.chart_id) {
      if (!currentChartId) {
        // First save — migrate any notepad content from the 'new' temp key to the real chart key
        const tempText = localStorage.getItem('notepad_new');
        const tempInc  = localStorage.getItem('notepad_include_new');
        if (tempText) { localStorage.setItem(`notepad_chart_${data.chart_id}`, tempText); localStorage.removeItem('notepad_new'); }
        if (tempInc)  { localStorage.setItem(`notepad_include_${data.chart_id}`, tempInc); localStorage.removeItem('notepad_include_new'); }
        // Push the migrated notepad to the DB immediately
        currentChartId = data.chart_id;
        _doNotepadDbSave();
      }
      currentChartId = data.chart_id;
      if (data.order_num !== undefined) setChartOrderNum(data.order_num);
      showSaveStatus();
    }
  } catch (e) {
    console.warn('ABN auto-save failed:', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('chart-output').addEventListener('input', scheduleAutoSave);
  document.getElementById('abn-form-body').addEventListener('input', _scheduleAbnSave);
  document.getElementById('abn-form-body').addEventListener('change', _scheduleAbnSave);
  document.getElementById('abn-form-body').addEventListener('focusin', () => {
    if (document.getElementById('abn-search').value) abnClearSearch();
  });
  checkOllamaStatus();
  _setPatientName('');
  _startIdleTimer();
  const _manualTheme = localStorage.getItem('themeManual') ? localStorage.getItem('theme') : null;
  _applyDarkMode(_manualTheme ? _manualTheme === 'dark' : _isDarkHour());
});

// ── Dark Mode ─────────────────────────────────────────────────────────────
function _isDarkHour() {
  const h = new Date().getHours();
  return h >= 19 || h < 7; // dark 7 PM → 7 AM
}

function _applyDarkMode(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const btn = document.getElementById('btn-dark-toggle');
  if (btn) btn.textContent = dark ? '☀ Light' : '🌙 Dark';
}

function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = !isDark;
  localStorage.setItem('theme', next ? 'dark' : 'light');
  // If toggling back to what auto would choose anyway, drop the manual override
  if (next === _isDarkHour()) {
    localStorage.removeItem('themeManual');
  } else {
    localStorage.setItem('themeManual', '1');
  }
  _applyDarkMode(next);
}

function _autoThemeCheck() {
  if (localStorage.getItem('themeManual')) return; // respect manual override
  _applyDarkMode(_isDarkHour());
}

// Run auto-check every minute
setInterval(_autoThemeCheck, 60_000);

// ── Notepad ───────────────────────────────────────────────────────────────
function _notepadKey()        { return currentChartId ? `notepad_chart_${currentChartId}` : 'notepad_new'; }
function _notepadIncludeKey() { return currentChartId ? `notepad_include_${currentChartId}` : 'notepad_include_new'; }

function _refreshNotepad() {
  const ta  = document.getElementById('notepad-textarea');
  const chk = document.getElementById('notepad-include-toggle');
  if (ta)  ta.value   = localStorage.getItem(_notepadKey()) || '';
  if (chk) chk.checked = localStorage.getItem(_notepadIncludeKey()) === '1';
}

function toggleNotepad() {
  const panel = document.getElementById('notepad-panel');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) {
    _refreshNotepad();
    document.getElementById('notepad-textarea').focus();
  }
}

let _notepadDbTimer = null;

function saveNotepad() {
  const ta  = document.getElementById('notepad-textarea');
  const chk = document.getElementById('notepad-include-toggle');
  if (ta)  localStorage.setItem(_notepadKey(), ta.value);
  if (chk) localStorage.setItem(_notepadIncludeKey(), chk.checked ? '1' : '0');
  clearTimeout(_notepadDbTimer);
  _notepadDbTimer = setTimeout(_doNotepadDbSave, 1000);
}

async function _doNotepadDbSave() {
  if (!currentChartId) return;
  const ta      = document.getElementById('notepad-textarea');
  const chk     = document.getElementById('notepad-include-toggle');
  const text    = ta  ? ta.value    : (localStorage.getItem(_notepadKey()) || '');
  const include = chk ? chk.checked : (localStorage.getItem(_notepadIncludeKey()) === '1');
  try {
    await fetch(`/api/chart/${currentChartId}/notepad`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notepad_text: text, notepad_include: include }),
    });
  } catch (e) {
    // Silent — localStorage still holds the data
  }
}

let _notepadOnRight = false;

function moveNotepad() {
  const panel   = document.getElementById('notepad-panel');
  const btn     = document.getElementById('notepad-move-btn');
  const leftEl  = document.getElementById('left-panel');
  const rightEl = document.getElementById('right-panel');

  _notepadOnRight = !_notepadOnRight;
  if (_notepadOnRight) {
    rightEl.appendChild(panel);
    panel.classList.add('notepad-panel--right');
    btn.textContent = '⇤ Move Left';
  } else {
    // Re-insert before the panel-footer in the left panel
    const footer = leftEl.querySelector('.panel-footer');
    leftEl.insertBefore(panel, footer);
    panel.classList.remove('notepad-panel--right');
    btn.textContent = '⇥ Move Right';
  }
}

function _getNotepadContext() {
  if (localStorage.getItem(_notepadIncludeKey()) !== '1') return '';
  return (localStorage.getItem(_notepadKey()) || '').trim();
}

// ── Privacy Screen ────────────────────────────────────────────────────────
const IDLE_TIMEOUT_MS = 60_000;
let _idleTimer = null;

function _startIdleTimer() {
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt =>
    document.addEventListener(evt, _resetIdleTimer, { passive: true })
  );
  _resetIdleTimer();
}

function _resetIdleTimer() {
  document.getElementById('privacy-overlay').classList.remove('active');
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    document.getElementById('privacy-overlay').classList.add('active');
  }, IDLE_TIMEOUT_MS);
}

async function checkOllamaStatus() {
  const badge = document.getElementById('ai-status');
  badge.onclick = null;
  try {
    const data = await (await fetch('/api/ollama-status')).json();
    if (data.enabled && data.available) {
      badge.className = 'ai-status ai-on';
      badge.innerHTML = '<img src="/static/img/llama-head.png" class="ai-status-llama"> AI Lama is running';
      badge.title = 'Ollama is running — charts will be AI-generated';
    } else if (data.enabled && data.ollama_running && !data.model_ready) {
      badge.className = 'ai-status ai-warn';
      badge.textContent = '⚠️ Model not downloaded';
      badge.title = 'Ollama is running but the model isn\'t pulled yet — click for help';
      badge.onclick = () => showOllamaDialog('Model Not Downloaded', _ollamaModelNotPulledHTML(data.model));
      setTimeout(() => showOllamaDialog('Model Not Downloaded', _ollamaModelNotPulledHTML(data.model)), 2000);
    } else if (data.enabled && !data.ollama_running) {
      badge.className = 'ai-status ai-off';
      badge.textContent = '📝 Rules (Ollama offline)';
      badge.title = 'Ollama is not running — click for setup help';
      badge.onclick = () => showOllamaDialog('AI Lama Offline', _ollamaNotRunningHTML(data.model));
      setTimeout(() => showOllamaDialog('AI Lama Offline', _ollamaNotRunningHTML(data.model)), 2000);
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
  return `<p>The Ai Lama is not currently running Sarah... go to the desktop and start up the Lama tool then come back and REFRESH THE PAGE :)</p>`;
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
    btn.onclick = async () => {
      await _resetChart();
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
      const fieldEl = el.closest('.abn-field, .yesno-field');
      if (fieldEl && val.trim()) fieldEl.classList.add('answered');
    });

    showChart(data.chart_text, data.patient_name || patientName);
    if (data.order_num !== undefined && data.order_num !== null) setChartOrderNum(data.order_num);
    currentChartId = chartId;
    // Sync notepad from DB into localStorage so _refreshNotepad reads it
    if (data.notepad_text !== undefined) {
      localStorage.setItem(`notepad_chart_${chartId}`, data.notepad_text || '');
      localStorage.setItem(`notepad_include_${chartId}`, data.notepad_include ? '1' : '0');
    }
    _refreshNotepad();
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
// ── Admin Password ────────────────────────────────────────────────────────
let _adminUnlocked = false;
let _adminLockTimer = null;
const ADMIN_LOCK_MS = 5 * 60 * 1000; // re-lock after 5 minutes

function _resetAdminLockTimer() {
  clearTimeout(_adminLockTimer);
  _adminLockTimer = setTimeout(() => {
    _adminUnlocked = false;
    document.getElementById('admin-dropdown').style.display = 'none';
  }, ADMIN_LOCK_MS);
}

function toggleAdminMenu(e) {
  if (e) e.stopPropagation();
  if (!_adminUnlocked) {
    _openAdminLock();
    return;
  }
  const dd = document.getElementById('admin-dropdown');
  dd.style.display = dd.style.display === 'none' ? 'flex' : 'none';
}

function _openAdminLock() {
  const modal = document.getElementById('admin-lock-modal');
  const input = document.getElementById('admin-lock-input');
  modal.style.display = 'flex';
  input.value = '';
  input.focus();
}

function _closeAdminLock() {
  document.getElementById('admin-lock-modal').style.display = 'none';
}

function _submitAdminLock() {
  const val = document.getElementById('admin-lock-input').value;
  if (val === '0090') {
    _adminUnlocked = true;
    _resetAdminLockTimer();
    _closeAdminLock();
    const dd = document.getElementById('admin-dropdown');
    dd.style.display = 'flex';
  } else {
    const input = document.getElementById('admin-lock-input');
    input.value = '';
    input.placeholder = 'Incorrect — try again';
    input.classList.add('admin-lock-error');
    setTimeout(() => {
      input.placeholder = 'Password';
      input.classList.remove('admin-lock-error');
      input.focus();
    }, 1200);
  }
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
  document.getElementById('vac-bulk-bar').style.display = data.charts.length ? 'flex' : 'none';
  document.getElementById('vac-select-all').checked = false;
  _vacUpdateBulkBar();

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
      <label class="vac-check-wrap" onclick="event.stopPropagation()">
        <input type="checkbox" class="vac-card-check" data-id="${c.id}" onchange="_vacUpdateBulkBar()">
      </label>
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

function _vacUpdateBulkBar() {
  const checks = [...document.querySelectorAll('.vac-card-check:checked')];
  const total  = document.querySelectorAll('.vac-card-check').length;
  const count  = checks.length;
  document.getElementById('vac-selected-count').textContent = `${count} selected`;
  document.getElementById('vac-bulk-delete-btn').disabled = count === 0;
  document.getElementById('vac-select-all').checked = count > 0 && count === total;
  document.getElementById('vac-select-all').indeterminate = count > 0 && count < total;
}

function vacToggleSelectAll(checked) {
  document.querySelectorAll('.vac-card-check').forEach(cb => cb.checked = checked);
  _vacUpdateBulkBar();
}

async function vacBulkDelete() {
  const ids = [...document.querySelectorAll('.vac-card-check:checked')].map(cb => Number(cb.dataset.id));
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} chart${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return;

  await Promise.all(ids.map(id => fetch(`/api/chart/${id}`, { method: 'DELETE' })));
  loadVacCharts();
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
