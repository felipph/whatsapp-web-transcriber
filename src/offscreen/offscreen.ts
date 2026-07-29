import { getModel, type ModelKey } from '../stt/models';
import { decodeToPcm16k, base64ToBlob } from '../stt/audio-decode';
import { TranscriptionQueue } from '../stt/queue';
import { putTranscript, getTranscript, clearTranscripts, deleteTranscript } from '../shared/db';
import type { RuntimeMessage, RuntimeEvent, JobPriority } from '../shared/messages';
import { DEFAULT_MODEL_KEY } from '../stt/models';
import WhisperWorker from '../stt/whisper-worker.ts?worker';

let worker: Worker | null = null;
let loadRequestId = '';
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
/** In-memory model key — offscreen must not use chrome.storage (unavailable here). */
let currentModelKey: ModelKey = DEFAULT_MODEL_KEY;

function broadcast(event: RuntimeEvent): void {
  void chrome.runtime.sendMessage(event).catch(() => {
    /* no listeners */
  });
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new WhisperWorker();
  worker.onmessage = (ev: MessageEvent) => {
    const data = ev.data as {
      type: string;
      progress?: number;
      message?: string;
      requestId?: string;
      device?: string;
      text?: string;
    };

    if (data.type === 'PROGRESS') {
      broadcast({
        type: 'PROGRESS',
        progress: data.progress ?? 0,
        message: data.message ?? 'Baixando…',
      });
      return;
    }

    if (data.type === 'READY') {
      const compatibilityMode = data.device === 'wasm';
      broadcast({
        type: 'READY',
        modelKey: currentModelKey,
        device: data.device ?? 'wasm',
        compatibilityMode,
      });
      resolvePending(data.requestId ?? '', { ok: true, device: data.device });
      return;
    }

    if (data.type === 'RESULT') {
      resolvePending(data.requestId ?? '', { ok: true, text: data.text ?? '' });
      return;
    }

    if (data.type === 'ERROR') {
      if (data.message === 'cancelled') {
        resolvePending(data.requestId ?? '', { ok: false, cancelled: true });
        return;
      }
      resolvePending(data.requestId ?? '', { ok: false, error: data.message });
      if (data.requestId === loadRequestId) {
        broadcast({
          type: 'LOAD_ERROR',
          message: data.message ?? 'Falha no download. Verifique a internet e tente de novo.',
        });
      }
    }
  };

  worker.onerror = (err) => {
    console.error('[wt] worker error', err);
  };

  return worker;
}

function restartWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  ensureWorker();
}

type Pending = {
  resolve: (v: {
    ok: boolean;
    text?: string;
    error?: string;
    cancelled?: boolean;
    device?: string;
  }) => void;
};

const pending = new Map<string, Pending>();

function resolvePending(
  requestId: string,
  value: {
    ok: boolean;
    text?: string;
    error?: string;
    cancelled?: boolean;
    device?: string;
  },
): void {
  const p = pending.get(requestId);
  if (!p) return;
  pending.delete(requestId);
  p.resolve(value);
}

function waitFor(requestId: string, timeoutMs: number): Promise<{
  ok: boolean;
  text?: string;
  error?: string;
  cancelled?: boolean;
  device?: string;
}> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({ ok: false, error: 'Tempo esgotado. Tente de novo.' });
    }, timeoutMs);
    pending.set(requestId, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
    });
  });
}

async function loadModel(modelKey: ModelKey): Promise<void> {
  currentModelKey = modelKey;
  const model = getModel(modelKey);

  broadcast({ type: 'PROGRESS', progress: 0, message: 'Baixando…' });

  const w = ensureWorker();
  loadRequestId = crypto.randomUUID();
  w.postMessage({
    type: 'LOAD',
    modelId: model.id,
    dtype: model.dtype,
    requestId: loadRequestId,
  });

  const result = await waitFor(loadRequestId, 30 * 60 * 1000);
  if (!result.ok) {
    throw new Error(result.error ?? 'Falha ao carregar o modelo.');
  }
}

const queue = new TranscriptionQueue({
  hasCached: async (messageId) => {
    const rec = await getTranscript(messageId);
    return rec?.text;
  },
  onStatus: (messageId, status, payload) => {
    broadcast({
      type: 'JOB_STATUS',
      messageId,
      status,
      text: payload?.text,
      error: payload?.error,
    });
  },
  process: async (job, signal) => {
    const { pcm, durationSec } = await decodeToPcm16k(job.blob);
    if (signal.cancelled) throw new Error('cancelled');

    const timeoutMs = Math.max(2 * 60 * 1000, Math.ceil(durationSec * 4) * 1000);
    const model = getModel(currentModelKey);

    const runOnce = async (): Promise<string> => {
      const w = ensureWorker();
      const requestId = crypto.randomUUID();
      const wait = waitFor(requestId, timeoutMs);

      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => {
        restartWorker();
        resolvePending(requestId, { ok: false, error: 'Tempo esgotado na transcrição.' });
      }, timeoutMs);

      w.postMessage({ type: 'TRANSCRIBE', pcm, requestId }, [pcm.buffer]);

      const result = await wait;
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }

      if (signal.cancelled || result.cancelled) throw new Error('cancelled');
      if (!result.ok) throw new Error(result.error ?? 'Falha ao transcrever.');

      const text = (result.text ?? '').trim();
      await putTranscript({
        messageId: job.messageId,
        text,
        ts: Date.now(),
        modelId: model.id,
      });
      return text;
    };

    try {
      return await runOnce();
    } catch (err) {
      if (signal.cancelled) throw err;
      restartWorker();
      await loadModel(currentModelKey);
      throw err;
    }
  },
});

async function clearModelCache(): Promise<void> {
  if ('caches' in globalThis) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  restartWorker();
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage & { _to?: string }, _sender, sendResponse) => {
  if (!message || message._to !== 'offscreen') return false;

  const handle = async () => {
    switch (message.type) {
      case 'PING_OFFSCREEN':
        return { type: 'OFFSCREEN_ALIVE' } satisfies RuntimeEvent;
      case 'LOAD_MODEL':
        await loadModel(message.modelKey);
        return { ok: true };
      case 'TRANSCRIBE_REQUEST': {
        const blob = base64ToBlob(message.audioBase64, message.mimeType);
        await queue.enqueue({
          messageId: message.messageId,
          blob,
          priority: message.priority as JobPriority,
          durationSec: message.durationSec,
        });
        return { ok: true };
      }
      case 'CANCEL_JOB':
        queue.cancel(message.messageId);
        worker?.postMessage({ type: 'CANCEL' });
        return { ok: true };
      case 'GET_TRANSCRIPT': {
        const rec = await getTranscript(message.messageId);
        return { ok: true, record: rec ?? null };
      }
      case 'DELETE_TRANSCRIPT':
        await deleteTranscript(message.messageId);
        return { ok: true };
      case 'CLEAR_TRANSCRIPTS':
        await clearTranscripts();
        return { ok: true };
      case 'CLEAR_MODEL_CACHE':
        await clearModelCache();
        return { ok: true };
      case 'GET_STORAGE_ESTIMATE': {
        const est = await navigator.storage.estimate();
        return { ok: true, usage: est.usage ?? 0, quota: est.quota ?? 0 };
      }
      default:
        return { ok: false };
    }
  };

  void handle()
    .then(sendResponse)
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error: msg });
    });
  return true;
});

ensureWorker();
