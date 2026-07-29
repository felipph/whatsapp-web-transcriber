import { MODELS, type ModelKey } from '../stt/models';
import { getConfig, onConfigChange, setConfig } from '../shared/storage';
import type { RuntimeEvent } from '../shared/messages';

const modelSelect = document.getElementById('model') as HTMLSelectElement;
const modelHint = document.getElementById('model-hint') as HTMLElement;
const autoToggle = document.getElementById('auto') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLElement;
const storageEl = document.getElementById('storage') as HTMLElement;
const errorEl = document.getElementById('error') as HTMLElement;

for (const m of MODELS) {
  const opt = document.createElement('option');
  opt.value = m.key;
  opt.textContent = `${m.label}${m.recommended ? ' (recomendado)' : ''} — ${m.sizeLabel}`;
  modelSelect.append(opt);
}

function hint(): void {
  const m = MODELS.find((x) => x.key === modelSelect.value);
  if (!m) return;
  modelHint.textContent = `${m.quality} · ${m.speed}${m.warning ? ` · ${m.warning}` : ''}`;
}

modelSelect.addEventListener('change', hint);

function showError(msg: string | null): void {
  if (!msg) {
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
    return;
  }
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

async function refreshStorage(): Promise<void> {
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'GET_STORAGE_ESTIMATE' })) as {
      usage?: number;
      quota?: number;
    };
    if (typeof res?.usage === 'number') {
      storageEl.textContent = `Armazenamento usado: ${formatBytes(res.usage)}${
        res.quota ? ` de ~${formatBytes(res.quota)}` : ''
      }`;
    }
  } catch {
    storageEl.textContent = '';
  }
}

function render(): void {
  void getConfig().then((cfg) => {
    modelSelect.value = cfg.modelKey;
    autoToggle.checked = cfg.autoTranscribe;
    hint();
    if (cfg.modelStatus === 'ready') {
      statusEl.textContent = cfg.compatibilityMode
        ? `Pronto (${cfg.modelKey}, modo compatibilidade)`
        : `Pronto (${cfg.modelKey})`;
      statusEl.classList.add('ok');
    } else if (cfg.modelStatus === 'downloading' || cfg.modelStatus === 'loading') {
      statusEl.textContent = `${cfg.statusMessage || 'Baixando…'} (${cfg.downloadProgress}%)`;
      statusEl.classList.remove('ok');
    } else if (cfg.modelStatus === 'error') {
      statusEl.textContent = 'Erro ao carregar modelo';
      statusEl.classList.remove('ok');
      showError(cfg.lastError ?? null);
    } else {
      statusEl.textContent = 'Modelo ainda não configurado';
      statusEl.classList.remove('ok');
    }
  });
  void refreshStorage();
}

autoToggle.addEventListener('change', () => {
  void setConfig({ autoTranscribe: autoToggle.checked });
});

document.getElementById('apply-model')!.addEventListener('click', () => {
  const modelKey = modelSelect.value as ModelKey;
  const ok = confirm(
    `Baixar o modelo ${modelKey}? Isso pode usar centenas de MB e substituir o modelo atual.`,
  );
  if (!ok) return;
  showError(null);
  void (async () => {
    await setConfig({ modelKey, modelStatus: 'downloading', downloadProgress: 0 });
    const res = (await chrome.runtime.sendMessage({ type: 'LOAD_MODEL', modelKey })) as {
      ok?: boolean;
      error?: string;
    };
    if (res?.ok === false) showError(res.error ?? 'Falha no download.');
    render();
  })();
});

document.getElementById('clear-transcripts')!.addEventListener('click', () => {
  if (!confirm('Apagar todas as transcrições salvas neste browser?')) return;
  void chrome.runtime.sendMessage({ type: 'CLEAR_TRANSCRIPTS' }).then(render);
});

document.getElementById('clear-model')!.addEventListener('click', () => {
  if (!confirm('Apagar o modelo baixado do disco deste browser?')) return;
  void chrome.runtime.sendMessage({ type: 'CLEAR_MODEL_CACHE' }).then(render);
});

document.getElementById('open-setup')!.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'OPEN_SETUP' });
});

chrome.runtime.onMessage.addListener((msg: RuntimeEvent) => {
  if (msg?.type === 'PROGRESS' || msg?.type === 'READY' || msg?.type === 'LOAD_ERROR') render();
});

onConfigChange(() => render());
render();
