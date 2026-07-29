import { getConfig, setConfig } from '../shared/storage';
import type {
  RuntimeMessage,
  RoutedOffscreenMessage,
  OffscreenMessage,
  RuntimeEvent,
} from '../shared/messages';

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';

const OFFSCREEN_TYPES = new Set([
  'LOAD_MODEL',
  'TRANSCRIBE_REQUEST',
  'CANCEL_JOB',
  'GET_TRANSCRIPT',
  'DELETE_TRANSCRIPT',
  'CLEAR_TRANSCRIPTS',
  'CLEAR_MODEL_CACHE',
  'GET_STORAGE_ESTIMATE',
  'PING_OFFSCREEN',
]);

async function hasOffscreen(): Promise<boolean> {
  const clients = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  return clients.length > 0;
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Run local Whisper transcription worker and keep the job queue alive.',
    });
  } catch (err) {
    if (!(await hasOffscreen())) throw err;
  }
  await new Promise((r) => setTimeout(r, 100));
}

async function openSetup(): Promise<void> {
  const url = chrome.runtime.getURL('src/setup/setup.html');
  await chrome.tabs.create({ url });
}

async function routeToOffscreen(message: OffscreenMessage): Promise<unknown> {
  await ensureOffscreen();
  const routed: RoutedOffscreenMessage = { ...message, _to: 'offscreen' };
  return chrome.runtime.sendMessage(routed);
}

async function updateBadge(status: 'ready' | 'error' | 'loading' | 'idle'): Promise<void> {
  try {
    if (status === 'ready') {
      await chrome.action.setBadgeText({ text: '✓' });
      await chrome.action.setBadgeBackgroundColor({ color: '#1a7f37' });
    } else if (status === 'error') {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#cf222e' });
    } else if (status === 'idle') {
      await chrome.action.setBadgeText({ text: '' });
    } else {
      await chrome.action.setBadgeText({ text: '…' });
      await chrome.action.setBadgeBackgroundColor({ color: '#9a6700' });
    }
  } catch {
    /* ignore */
  }
}

/** Persist model lifecycle events from offscreen (which cannot use chrome.storage). */
async function handleOffscreenEvent(msg: RuntimeEvent): Promise<void> {
  if (msg.type === 'PROGRESS') {
    await setConfig({
      modelStatus: msg.progress >= 100 ? 'loading' : 'downloading',
      downloadProgress: msg.progress,
      statusMessage: msg.message,
      lastError: undefined,
    });
    await updateBadge('loading');
    return;
  }
  if (msg.type === 'READY') {
    await setConfig({
      modelKey: msg.modelKey,
      modelStatus: 'ready',
      downloadProgress: 100,
      statusMessage: 'Modelo carregado e pronto.',
      compatibilityMode: msg.compatibilityMode,
      lastError: undefined,
    });
    await updateBadge('ready');
    return;
  }
  if (msg.type === 'LOAD_ERROR') {
    await setConfig({
      modelStatus: 'error',
      lastError: msg.message,
      statusMessage: msg.message,
    });
    await updateBadge('error');
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    if (details.reason === 'install') {
      await setConfig({ modelStatus: 'idle', downloadProgress: 0 });
      await openSetup();
      return;
    }
    const cfg = await getConfig();
    if (cfg.modelStatus !== 'ready') {
      await openSetup();
    }
  })();
});

chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    const cfg = await getConfig();
    if (cfg.modelStatus === 'ready') await updateBadge('ready');
  })();
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  const msg = message as (RuntimeMessage | RuntimeEvent) & { _to?: string };
  if (msg._to === 'offscreen') return false;

  // Offscreen lifecycle events → persist in SW, then let UI pages also hear them
  if (msg.type === 'PROGRESS' || msg.type === 'READY' || msg.type === 'LOAD_ERROR') {
    void handleOffscreenEvent(msg as RuntimeEvent);
    return false;
  }

  if (msg.type === 'JOB_STATUS' || msg.type === 'OFFSCREEN_ALIVE') {
    return false;
  }

  const request = msg as RuntimeMessage;

  const handle = async () => {
    if (request.type === 'OPEN_SETUP') {
      await openSetup();
      return { ok: true };
    }
    if (request.type === 'ENSURE_OFFSCREEN') {
      await ensureOffscreen();
      return { ok: true };
    }
    if (request.type === 'LOAD_MODEL') {
      await setConfig({
        modelKey: request.modelKey,
        modelStatus: 'downloading',
        downloadProgress: 0,
        statusMessage: 'Baixando…',
        lastError: undefined,
      });
      await updateBadge('loading');
      const res = (await routeToOffscreen(request)) as { ok?: boolean; error?: string };
      if (res && res.ok === false) {
        await setConfig({
          modelStatus: 'error',
          lastError: res.error || 'Falha no download. Verifique a internet e tente de novo.',
        });
        await updateBadge('error');
      }
      return res;
    }
    if (request.type === 'CLEAR_MODEL_CACHE') {
      const res = await routeToOffscreen(request);
      await setConfig({
        modelStatus: 'idle',
        downloadProgress: 0,
        statusMessage: 'Modelo removido.',
      });
      await updateBadge('idle');
      return res;
    }
    if (OFFSCREEN_TYPES.has(request.type)) {
      return routeToOffscreen(request as OffscreenMessage);
    }
    return { ok: false, error: 'Mensagem desconhecida' };
  };

  void handle()
    .then(sendResponse)
    .catch((err: unknown) => {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  return true;
});
