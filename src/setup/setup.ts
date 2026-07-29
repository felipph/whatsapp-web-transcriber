import { MODELS, type ModelKey } from '../stt/models';
import { getConfig, onConfigChange, setConfig } from '../shared/storage';
import type { RuntimeEvent } from '../shared/messages';

const modelSelect = document.getElementById('model') as HTMLSelectElement;
const modelHint = document.getElementById('model-hint') as HTMLElement;
const downloadBtn = document.getElementById('download') as HTMLButtonElement;
const progressWrap = document.getElementById('progress-wrap') as HTMLElement;
const progressFill = document.getElementById('progress-fill') as HTMLElement;
const progressLabel = document.getElementById('progress-label') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const errorEl = document.getElementById('error') as HTMLElement;
const openWa = document.getElementById('open-wa') as HTMLAnchorElement;

for (const m of MODELS) {
  const opt = document.createElement('option');
  opt.value = m.key;
  opt.textContent = `${m.label}${m.recommended ? ' (recomendado)' : ''} — ${m.sizeLabel}`;
  modelSelect.append(opt);
}

function updateHint(): void {
  const m = MODELS.find((x) => x.key === modelSelect.value);
  if (!m) return;
  modelHint.textContent = `${m.quality} · ${m.speed}${m.warning ? ` · ${m.warning}` : ''}`;
}

modelSelect.addEventListener('change', updateHint);

function showError(msg: string | null): void {
  if (!msg) {
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
    return;
  }
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function renderFromConfig(): void {
  void getConfig().then((cfg) => {
    modelSelect.value = cfg.modelKey;
    updateHint();

    if (cfg.modelStatus === 'downloading' || cfg.modelStatus === 'loading') {
      progressWrap.classList.remove('hidden');
      progressFill.style.width = `${cfg.downloadProgress}%`;
      progressLabel.textContent = cfg.statusMessage || 'Baixando…';
      statusEl.textContent = '';
      downloadBtn.disabled = true;
      downloadBtn.textContent = 'Preparando…';
      openWa.classList.add('hidden');
      return;
    }

    if (cfg.modelStatus === 'ready') {
      progressWrap.classList.add('hidden');
      statusEl.textContent = cfg.compatibilityMode
        ? 'Modelo carregado e pronto. (Modo compatibilidade — mais lento, sem WebGPU.)'
        : 'Modelo carregado e pronto.';
      statusEl.classList.add('ok');
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Trocar / baixar de novo';
      openWa.classList.remove('hidden');
      showError(null);
      return;
    }

    if (cfg.modelStatus === 'error') {
      progressWrap.classList.add('hidden');
      statusEl.textContent = '';
      showError(cfg.lastError || 'Falha no download. Verifique a internet e tente de novo.');
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Tentar de novo';
      openWa.classList.add('hidden');
      return;
    }

    progressWrap.classList.add('hidden');
    statusEl.textContent = '';
    statusEl.classList.remove('ok');
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Baixar e preparar';
    openWa.classList.add('hidden');
  });
}

downloadBtn.addEventListener('click', () => {
  const modelKey = modelSelect.value as ModelKey;
  showError(null);
  void (async () => {
    await setConfig({
      modelKey,
      modelStatus: 'downloading',
      downloadProgress: 0,
      statusMessage: 'Baixando…',
      lastError: undefined,
    });
    renderFromConfig();
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'LOAD_MODEL',
        modelKey,
      })) as { ok?: boolean; error?: string };
      if (res && res.ok === false) {
        await setConfig({
          modelStatus: 'error',
          lastError: res.error || 'Falha no download. Verifique a internet e tente de novo.',
        });
      }
    } catch (err) {
      await setConfig({
        modelStatus: 'error',
        lastError: err instanceof Error ? err.message : 'Falha no download.',
      });
    }
    renderFromConfig();
  })();
});

chrome.runtime.onMessage.addListener((msg: RuntimeEvent) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'PROGRESS' || msg.type === 'READY' || msg.type === 'LOAD_ERROR') {
    renderFromConfig();
  }
});

onConfigChange(() => renderFromConfig());
renderFromConfig();

// Resume: if we reopen mid-download, kick load again for the selected model
void getConfig().then((cfg) => {
  if (cfg.modelStatus === 'downloading' || cfg.modelStatus === 'loading') {
    void chrome.runtime.sendMessage({ type: 'LOAD_MODEL', modelKey: cfg.modelKey });
  }
});
