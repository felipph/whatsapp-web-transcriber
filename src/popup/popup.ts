import { getConfig, onConfigChange, setConfig } from '../shared/storage';

const statusEl = document.getElementById('status') as HTMLElement;
const autoToggle = document.getElementById('auto') as HTMLInputElement;

function render(): void {
  void getConfig().then((cfg) => {
    autoToggle.checked = cfg.autoTranscribe;
    if (cfg.modelStatus === 'ready') {
      statusEl.textContent = cfg.compatibilityMode
        ? `Pronto · ${cfg.modelKey} (compatibilidade)`
        : `Pronto · modelo ${cfg.modelKey}`;
      statusEl.classList.add('ok');
    } else if (cfg.modelStatus === 'downloading' || cfg.modelStatus === 'loading') {
      statusEl.textContent = `Baixando… ${cfg.downloadProgress}%`;
      statusEl.classList.remove('ok');
    } else if (cfg.modelStatus === 'error') {
      statusEl.textContent = 'Erro no modelo — abra o setup';
      statusEl.classList.remove('ok');
    } else {
      statusEl.textContent = 'Configure o modelo para começar';
      statusEl.classList.remove('ok');
    }
  });
}

autoToggle.addEventListener('change', () => {
  void setConfig({ autoTranscribe: autoToggle.checked });
});

document.getElementById('open-wa')!.addEventListener('click', () => {
  void chrome.tabs.create({ url: 'https://web.whatsapp.com' });
});

document.getElementById('open-setup')!.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'OPEN_SETUP' });
});

document.getElementById('open-options')!.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

onConfigChange(() => render());
render();
