// aipanel.js — UI + persistence for the "AI Pool & Prompt" panel.
//   * multi-model selection (catalog + custom "provider:model" lines)
//   * one textarea of API keys per provider (one key per line)
//   * parallel batches / retries
//   * editable system prompt + user prompt template
// Settings live in localStorage; API keys are only stored when "Remember keys" is ticked.

import { DEFAULT_SYSTEM_PROMPT, DEFAULT_PROMPT_TEMPLATE, setPromptConfig } from './engines.js';
import { parseKeys, parseCustomModels, buildSlots } from './pool.js';

const LS_KEY = 'vntl_aio_ai_v1';
const Common = globalThis.VNTranslationCommon;

const KEY_PROVIDERS = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'deepl', label: 'DeepL' },
];

const $ = (id) => document.getElementById(id);

const els = {};
let onChangeCb = () => {};
let getCurrentEngine = () => '';

function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save() {
  try {
    const remember = !!els.remember?.checked;
    const data = {
      enabled: !!els.enabled?.checked,
      models: selectedModelIds(),
      custom: els.custom?.value || '',
      parallel: Number(els.parallel?.value) || 3,
      retries: Number(els.retries?.value) || 4,
      remember,
      prompt: { system: els.system?.value || '', template: els.template?.value || '' },
      keys: {},
    };
    if (remember) for (const p of KEY_PROVIDERS) data.keys[p.id] = els.keys[p.id]?.value || '';
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch { /* storage unavailable */ }
}

function selectedModelIds() {
  if (!els.models) return [];
  return Array.from(els.models.querySelectorAll('input[type=checkbox]:checked')).map((c) => c.value);
}

function catalog() {
  return (Common?.getEngineOptions?.() || []).map((e) => ({
    id: e.id, provider: e.provider, model: e.id, label: e.label, uiLabel: e.uiLabel,
  }));
}

function renderModelList(selected) {
  const frag = document.createDocumentFragment();
  const groups = new Map();
  for (const m of catalog()) {
    if (!groups.has(m.provider)) groups.set(m.provider, []);
    groups.get(m.provider).push(m);
  }
  const titles = { gemini: 'Gemini', openai: 'OpenAI', openrouter: 'OpenRouter', deepseek: 'DeepSeek', deepl: 'DeepL', free: 'Free (no key)' };

  for (const [provider, list] of groups) {
    const h = document.createElement('div');
    h.className = 'pool-group';
    h.textContent = titles[provider] || provider;
    frag.appendChild(h);
    for (const m of list) {
      const lab = document.createElement('label');
      lab.className = 'check pool-model';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = m.id;
      cb.checked = selected.has(m.id);
      const span = document.createElement('span');
      span.textContent = m.uiLabel || m.label;
      lab.append(cb, span);
      frag.appendChild(lab);
    }
  }
  els.models.replaceChildren(frag);
}

// ------------------------------------------------------------------ public ----

export function getModels() {
  const byId = new Map(catalog().map((m) => [m.id, m]));
  const picked = selectedModelIds().map((id) => byId.get(id)).filter(Boolean);
  return [...picked, ...parseCustomModels(els.custom?.value)];
}

export function getKeysByProvider() {
  const out = {};
  for (const p of KEY_PROVIDERS) out[p.id] = parseKeys(els.keys?.[p.id]?.value);
  return out;
}

export function getPoolConfig() {
  // Called by app.js before initAiPanel() has run (or when the markup is missing).
  if (!els.enabled || !els.models) {
    return { enabled: false, models: [], keysByProvider: {}, slots: [], skipped: [], retries: 0 };
  }
  const models = getModels();
  const keysByProvider = getKeysByProvider();
  const { slots, skipped } = buildSlots(models, keysByProvider);
  return {
    enabled: !!els.enabled?.checked,
    models,
    keysByProvider,
    slots,
    skipped,
    retries: Math.min(10, Math.max(0, Number(els.retries?.value) || 0)),
  };
}

export function getParallel() {
  if (!els.parallel) return 1;
  return Math.min(32, Math.max(1, Number(els.parallel?.value) || 1));
}

function updateSummary() {
  if (!els.summary) return;
  const cfg = getPoolConfig();
  if (!cfg.enabled) { els.summary.textContent = ''; return; }
  const modelCount = new Set(cfg.slots.map((s) => s.modelId)).size;
  let text = `${cfg.slots.length} slot(s) = ${modelCount} model(s) × keys, round-robin.`;
  if (cfg.skipped.length) text += ` No key for: ${cfg.skipped.map((m) => m.label).join(', ')}.`;
  if (!cfg.slots.length) text = 'Pick at least one model and add its API key(s).';
  els.summary.textContent = text;
}

function syncPoolVisibility() {
  const on = !!els.enabled.checked;
  els.body.style.display = on ? '' : 'none';
  // The legacy single-engine controls are ignored while the pool is on.
  for (const id of ['engineRow', 'deepseekKeyRow', 'openaiKeyRow']) {
    const row = $(id);
    if (!row) continue;
    row.dataset.poolHidden = on ? '1' : '';
    if (on) row.style.display = 'none';
    else if (id === 'engineRow') row.style.display = '';
  }
  if (!on) onChangeCb({ poolOff: true });
}

function applyPrompt() {
  setPromptConfig({ system: els.system.value, template: els.template.value });
}

export function initAiPanel({ onChange, currentEngine } = {}) {
  if (typeof onChange === 'function') onChangeCb = onChange;
  if (typeof currentEngine === 'function') getCurrentEngine = currentEngine;

  els.enabled = $('poolEnabled');
  els.body = $('poolBody');
  els.models = $('poolModels');
  els.custom = $('poolCustomModels');
  els.retries = $('poolRetries');
  els.parallel = $('parallelBatches');
  els.remember = $('poolRememberKeys');
  els.summary = $('poolSummary');
  els.system = $('promptSystem');
  els.template = $('promptTemplate');
  els.keys = {};
  for (const p of KEY_PROVIDERS) els.keys[p.id] = $('poolKeys_' + p.id);

  if (!els.enabled || !els.models) return; // markup missing

  const saved = loadSaved();
  const selected = new Set(Array.isArray(saved.models) ? saved.models : []);

  renderModelList(selected);
  els.enabled.checked = !!saved.enabled;
  els.custom.value = saved.custom || '';
  els.retries.value = String(saved.retries ?? 4);
  if (els.parallel) els.parallel.value = String(saved.parallel ?? 3);
  els.remember.checked = !!saved.remember;
  for (const p of KEY_PROVIDERS) els.keys[p.id].value = saved.keys?.[p.id] || '';
  els.system.value = saved.prompt?.system || DEFAULT_SYSTEM_PROMPT;
  els.template.value = saved.prompt?.template || DEFAULT_PROMPT_TEMPLATE;
  applyPrompt();

  const changed = () => { updateSummary(); save(); };

  els.enabled.addEventListener('change', () => {
    // First time: preselect the engine that is currently chosen in the single-engine dropdown.
    if (els.enabled.checked && !selectedModelIds().length && !els.custom.value.trim()) {
      const cur = getCurrentEngine();
      const cb = cur ? els.models.querySelector(`input[value="${CSS.escape(cur)}"]`) : null;
      if (cb) cb.checked = true;
    }
    syncPoolVisibility();
    changed();
  });
  els.models.addEventListener('change', changed);
  els.custom.addEventListener('input', changed);
  els.retries.addEventListener('input', changed);
  els.parallel?.addEventListener('input', changed);
  els.remember.addEventListener('change', changed);
  for (const p of KEY_PROVIDERS) els.keys[p.id].addEventListener('input', changed);

  const onPrompt = () => { applyPrompt(); save(); };
  els.system.addEventListener('input', onPrompt);
  els.template.addEventListener('input', onPrompt);
  $('btnPromptReset')?.addEventListener('click', () => {
    els.system.value = DEFAULT_SYSTEM_PROMPT;
    els.template.value = DEFAULT_PROMPT_TEMPLATE;
    onPrompt();
  });

  syncPoolVisibility();
  updateSummary();
}
