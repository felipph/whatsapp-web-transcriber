/// <reference lib="webworker" />

import { pipeline, env } from '@huggingface/transformers';

env.useBrowserCache = true;
env.allowLocalModels = false;

// Chrome MV3 CSP blocks blob: workers. Keep ORT single-threaded and load WASM from the extension package.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.numThreads = 1;
  // Served from public/ort/ → chrome-extension://<id>/ort/
  env.backends.onnx.wasm.wasmPaths = `${self.location.origin}/ort/`;
}

type WorkerIn =
  | {
      type: 'LOAD';
      modelId: string;
      dtype: 'q8';
      requestId: string;
    }
  | {
      type: 'TRANSCRIBE';
      pcm: Float32Array;
      requestId: string;
    }
  | { type: 'CANCEL'; requestId?: string };

type WorkerOut =
  | { type: 'PROGRESS'; progress: number; message: string; requestId: string }
  | { type: 'READY'; device: string; requestId: string }
  | { type: 'RESULT'; text: string; requestId: string }
  | { type: 'ERROR'; message: string; requestId: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null;
let cancelCurrent = false;

function post(msg: WorkerOut): void {
  self.postMessage(msg);
}

async function detectWebGpu(): Promise<boolean> {
  try {
    if (!('gpu' in navigator)) return false;
    // @ts-expect-error navigator.gpu typing varies by TS lib
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

function humanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/CSP|Content Security Policy|blob:/i.test(raw)) {
    return 'Falha ao iniciar o motor local (CSP). Recarregue a extensão e tente de novo.';
  }
  if (/Failed to fetch|NetworkError|net::/i.test(raw)) {
    return 'Falha no download. Verifique a internet e tente de novo.';
  }
  return raw || 'Falha ao carregar o modelo.';
}

async function loadModel(modelId: string, dtype: 'q8', requestId: string): Promise<void> {
  // Re-apply before each load (ORT may reset defaults)
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.wasmPaths = `${self.location.origin}/ort/`;
  }

  const preferGpu = await detectWebGpu();
  const devices: Array<'webgpu' | 'wasm'> = preferGpu ? ['webgpu', 'wasm'] : ['wasm'];

  let lastError: unknown;
  for (const device of devices) {
    try {
      post({
        type: 'PROGRESS',
        progress: 100,
        message: `Iniciando motor (${device})…`,
        requestId,
      });
      asr = await (pipeline as Function)('automatic-speech-recognition', modelId, {
        device,
        dtype,
        progress_callback: (data: { status?: string; progress?: number; file?: string }) => {
          if (typeof data.progress === 'number') {
            const pct = Math.max(0, Math.min(100, Math.round(data.progress)));
            const phase =
              data.status === 'done'
                ? 'Carregando na memória…'
                : data.file
                  ? `Baixando ${data.file}…`
                  : 'Baixando…';
            post({ type: 'PROGRESS', progress: pct, message: phase, requestId });
          } else if (data.status === 'ready') {
            post({ type: 'PROGRESS', progress: 100, message: 'Carregando na memória…', requestId });
          }
        },
      });
      post({ type: 'READY', device, requestId });
      return;
    } catch (err) {
      console.error(`[wt] load failed on ${device}`, err);
      lastError = err;
      asr = null;
    }
  }

  post({ type: 'ERROR', message: humanError(lastError), requestId });
}

async function transcribe(pcm: Float32Array, requestId: string): Promise<void> {
  if (!asr) {
    post({ type: 'ERROR', message: 'Modelo ainda não está pronto.', requestId });
    return;
  }
  cancelCurrent = false;
  try {
    const out = await asr(pcm, {
      language: 'pt',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    if (cancelCurrent) {
      post({ type: 'ERROR', message: 'cancelled', requestId });
      return;
    }
    const text = Array.isArray(out)
      ? out.map((o: { text?: string }) => String(o.text ?? '')).join(' ').trim()
      : String((out as { text?: string }).text ?? '').trim();
    post({ type: 'RESULT', text, requestId });
  } catch (err) {
    post({ type: 'ERROR', message: humanError(err), requestId });
  }
}

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type === 'CANCEL') {
    cancelCurrent = true;
    return;
  }
  if (msg.type === 'LOAD') {
    void loadModel(msg.modelId, msg.dtype, msg.requestId);
    return;
  }
  if (msg.type === 'TRANSCRIBE') {
    void transcribe(msg.pcm, msg.requestId);
  }
};

export {};
