import { listenMainWorldBlobs, resolveAudioBlob } from './audio';
import { blobToBase64 } from '../stt/audio-decode';
import {
  findAudioElement,
  findMessageId,
  looksLikeVoiceNote,
  MAIN_PANE,
  queryAll,
  queryFirst,
} from './selectors';
import { ensureUi, injectStyles, renderUi, type UiState } from './ui';
import { getConfig, onConfigChange, type ExtensionConfig } from '../shared/storage';
import type { JobPriority, RuntimeEvent } from '../shared/messages';

listenMainWorldBlobs();
injectStyles();

const states = new Map<string, UiState>();
const seenForAuto = new Set<string>();
let config: ExtensionConfig | null = null;
let missCount = 0;

void getConfig().then((c) => {
  config = c;
  scan();
});

onConfigChange((c) => {
  config = c;
  scan();
});

chrome.runtime.onMessage.addListener((msg: RuntimeEvent) => {
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
  if (msg.type === 'JOB_STATUS') {
    const { messageId, status, text, error } = msg;
    if (status === 'queued') setState(messageId, { kind: 'queued' });
    if (status === 'transcribing') setState(messageId, { kind: 'transcribing' });
    if (status === 'done') setState(messageId, { kind: 'done', text: text ?? '' });
    if (status === 'error')
      setState(messageId, { kind: 'error', message: error ?? 'Não foi possível transcrever' });
    if (status === 'cancelled') setState(messageId, { kind: 'idle' });
    refreshMessageUi(messageId);
  }
});

function setState(messageId: string, state: UiState): void {
  states.set(messageId, state);
}

async function requestTranscript(messageId: string): Promise<string | null> {
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'GET_TRANSCRIPT',
      messageId,
    })) as { ok?: boolean; record?: { text: string } | null };
    return res?.record?.text ?? null;
  } catch {
    return null;
  }
}

async function enqueue(messageId: string, bubble: Element, priority: JobPriority): Promise<void> {
  if (!config || config.modelStatus !== 'ready') {
    setState(messageId, { kind: 'setup' });
    refreshMessageUi(messageId);
    return;
  }

  setState(messageId, { kind: 'queued' });
  refreshMessageUi(messageId);

  const audio = findAudioElement(bubble);
  const blob = await resolveAudioBlob(audio, { retries: 8, delayMs: 400 });
  if (!blob) {
    missCount += 1;
    console.warn('[wt] audio blob missing', {
      messageId,
      missCount,
      hasAudioEl: Boolean(audio),
      src: audio?.currentSrc || audio?.src || null,
    });
    setState(messageId, { kind: 'unavailable' });
    refreshMessageUi(messageId);
    return;
  }

  try {
    const audioBase64 = await blobToBase64(blob);
    await chrome.runtime.sendMessage({
      type: 'TRANSCRIBE_REQUEST',
      messageId,
      priority,
      audioBase64,
      mimeType: blob.type || 'audio/ogg',
      durationSec: audio && Number.isFinite(audio.duration) ? audio.duration : undefined,
    });
  } catch (err) {
    setState(messageId, {
      kind: 'error',
      message: err instanceof Error ? err.message : 'Falha ao enviar áudio',
    });
    refreshMessageUi(messageId);
  }
}

function handlersFor(messageId: string, bubble: Element) {
  return {
    onTranscribe: () => void enqueue(messageId, bubble, 'manual'),
    onRetry: () => void enqueue(messageId, bubble, 'manual'),
    onCancel: () => {
      void chrome.runtime.sendMessage({ type: 'CANCEL_JOB', messageId });
      setState(messageId, { kind: 'idle' });
      refreshMessageUi(messageId);
    },
    onRetranscribe: () => {
      void chrome.runtime.sendMessage({ type: 'DELETE_TRANSCRIPT', messageId }).then(() => {
        void enqueue(messageId, bubble, 'manual');
      });
    },
    onOpenSetup: () => {
      void chrome.runtime.sendMessage({ type: 'OPEN_SETUP' });
    },
  };
}

function refreshMessageUi(messageId: string): void {
  const bubble = document.querySelector(`[data-id="${CSS.escape(messageId)}"]`);
  if (!bubble) return;
  const state = states.get(messageId);
  if (!state) return;
  const root = ensureUi(bubble, messageId);
  renderUi(root, state, handlersFor(messageId, bubble));
}

async function attachToBubble(bubble: Element, isNew: boolean): Promise<void> {
  if (!looksLikeVoiceNote(bubble)) return;
  const messageId = findMessageId(bubble);
  if (!messageId) return;

  let state = states.get(messageId);
  if (!state) {
    if (!config || config.modelStatus !== 'ready') {
      state = { kind: 'setup' };
    } else {
      const cached = await requestTranscript(messageId);
      state = cached ? { kind: 'done', text: cached } : { kind: 'idle' };
    }
    setState(messageId, state);
  }

  const root = ensureUi(bubble, messageId);
  renderUi(root, states.get(messageId)!, handlersFor(messageId, bubble));

  if (
    isNew &&
    config?.modelStatus === 'ready' &&
    config.autoTranscribe &&
    states.get(messageId)?.kind === 'idle' &&
    !seenForAuto.has(messageId)
  ) {
    seenForAuto.add(messageId);
    void enqueue(messageId, bubble, 'auto');
  }
}

function scan(opts?: { treatAsNew?: boolean }): void {
  const main = queryFirst(document, MAIN_PANE) ?? document.body;
  const candidates = queryAll(main, ['[data-id]']);
  for (const el of candidates) {
    void attachToBubble(el, Boolean(opts?.treatAsNew));
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleScan(asNew = false): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => scan({ treatAsNew: asNew }), 200);
}

const knownIds = new Set<string>();

function observe(): void {
  const main = queryFirst(document, MAIN_PANE);
  const target = main ?? document.body;

  // Seed known ids
  queryAll(target, ['[data-id]']).forEach((el) => {
    const id = findMessageId(el);
    if (id) knownIds.add(id);
  });
  scan({ treatAsNew: false });

  const observer = new MutationObserver((mutations) => {
    let sawNew = false;
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        const nodes = node.matches?.('[data-id]')
          ? [node]
          : Array.from(node.querySelectorAll?.('[data-id]') ?? []);
        for (const el of nodes) {
          const id = findMessageId(el);
          if (id && !knownIds.has(id)) {
            knownIds.add(id);
            sawNew = true;
            void attachToBubble(el, true);
          } else if (id) {
            void attachToBubble(el, false);
          }
        }
      });
    }
    // Virtualized re-render: re-apply UI
    scheduleScan(sawNew);
  });

  observer.observe(target, { childList: true, subtree: true });
}

// WhatsApp loads #main late
const boot = setInterval(() => {
  if (queryFirst(document, MAIN_PANE)) {
    clearInterval(boot);
    observe();
  }
}, 500);

setTimeout(() => {
  clearInterval(boot);
  observe();
}, 15000);

console.info('[wt] content script ready');
