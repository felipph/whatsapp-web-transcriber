import {
  listenMainWorldBlobs,
  resolveAudioBlobForMessage,
  setPendingMessageId,
  clickPlayInBubble,
  getBlobForMessage,
} from './audio';
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

/** Newest voice notes to auto-queue when opening a chat (bottom → top). */
const AUTO_LIMIT = 3;

listenMainWorldBlobs();
injectStyles();

const states = new Map<string, UiState>();
const seenForAuto = new Set<string>();
const knownIds = new Set<string>();
let config: ExtensionConfig | null = null;
let missCount = 0;
let activeChatKey = '';

// When the user plays a voice note, mark that message as pending so the next
// captured blob is bound to the correct data-id.
document.addEventListener(
  'click',
  (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (t.closest('.wt-root')) return;
    const bubble = t.closest('[data-id]');
    if (!bubble || !looksLikeVoiceNote(bubble)) return;
    const id = findMessageId(bubble);
    if (id) setPendingMessageId(id);
  },
  true,
);

void getConfig().then((c) => {
  config = c;
  scanUiOnly();
});

onConfigChange((c) => {
  config = c;
  scanUiOnly();
  scheduleAutoLatest();
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

let obtainChain: Promise<unknown> = Promise.resolve();

async function obtainBlobForMessage(
  messageId: string,
  bubble: Element,
  opts: { allowPlay: boolean },
): Promise<Blob | null> {
  const run = async (): Promise<Blob | null> => {
    const existing = getBlobForMessage(messageId);
    if (existing) return existing;

    setPendingMessageId(messageId);
    if (opts.allowPlay) {
      clickPlayInBubble(bubble);
    }

    const audio = findAudioElement(bubble);
    // Without play, only a few short retries — media may already be in DOM
    const retries = opts.allowPlay ? 12 : 3;
    return resolveAudioBlobForMessage(messageId, audio, {
      retries,
      delayMs: opts.allowPlay ? 400 : 200,
    });
  };

  const next = obtainChain.then(run, run);
  obtainChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function enqueue(
  messageId: string,
  bubble: Element,
  priority: JobPriority,
  opts?: { allowPlay?: boolean },
): Promise<void> {
  if (!config || config.modelStatus !== 'ready') {
    setState(messageId, { kind: 'setup' });
    refreshMessageUi(messageId);
    return;
  }

  const allowPlay = opts?.allowPlay ?? priority === 'manual';

  setState(messageId, { kind: 'queued' });
  refreshMessageUi(messageId);

  const blob = await obtainBlobForMessage(messageId, bubble, { allowPlay });
  if (!blob) {
    missCount += 1;
    console.warn('[wt] audio blob missing for message', messageId, { missCount, allowPlay });
    // Auto without play: leave idle (user can click Transcrever). Manual: show hint.
    if (priority === 'auto' && !allowPlay) {
      setState(messageId, { kind: 'idle' });
      seenForAuto.delete(messageId);
    } else {
      setState(messageId, { kind: 'unavailable' });
    }
    refreshMessageUi(messageId);
    return;
  }

  try {
    const audio = findAudioElement(bubble);
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
    onTranscribe: () => void enqueue(messageId, bubble, 'manual', { allowPlay: true }),
    onRetry: () => void enqueue(messageId, bubble, 'manual', { allowPlay: true }),
    onCancel: () => {
      void chrome.runtime.sendMessage({ type: 'CANCEL_JOB', messageId });
      setState(messageId, { kind: 'idle' });
      refreshMessageUi(messageId);
    },
    onRetranscribe: () => {
      void chrome.runtime.sendMessage({ type: 'DELETE_TRANSCRIPT', messageId }).then(() => {
        void enqueue(messageId, bubble, 'manual', { allowPlay: true });
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

async function attachToBubble(bubble: Element): Promise<void> {
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
}

function scanUiOnly(): void {
  const main = queryFirst(document, MAIN_PANE) ?? document.body;
  const candidates = queryAll(main, ['[data-id]']);
  for (const el of candidates) {
    void attachToBubble(el);
  }
}

function getChatKey(): string {
  const header =
    document.querySelector('#main header span[title]') ||
    document.querySelector('#main header [data-testid="conversation-info-header-chat-title"]') ||
    document.querySelector('#main header span[dir="auto"]');
  if (header instanceof HTMLElement) {
    return header.getAttribute('title') || header.textContent?.trim() || 'chat';
  }
  return 'chat';
}

/** Voice notes newest-first (bottom of the chat → top). */
function listVoiceNotesNewestFirst(): { id: string; el: Element }[] {
  const main = queryFirst(document, MAIN_PANE) ?? document.body;
  const candidates = queryAll(main, ['[data-id]']).filter((el) => looksLikeVoiceNote(el));
  const items: { id: string; el: Element }[] = [];
  for (const el of candidates) {
    const id = findMessageId(el);
    if (id) items.push({ id, el });
  }
  // DOM is older→newer top→bottom; reverse for bottom→top processing
  return items.reverse();
}

async function autoTranscribeLatest(): Promise<void> {
  if (!config?.autoTranscribe || config.modelStatus !== 'ready') return;

  const latest = listVoiceNotesNewestFirst().slice(0, AUTO_LIMIT);
  for (const { id, el } of latest) {
    if (seenForAuto.has(id)) continue;
    await attachToBubble(el);
    if (states.get(id)?.kind !== 'idle') continue;
    seenForAuto.add(id);
    // No autoplay — only works if media bytes are already available
    await enqueue(id, el, 'auto', { allowPlay: false });
  }
}

let uiDebounce: ReturnType<typeof setTimeout> | null = null;
let autoDebounce: ReturnType<typeof setTimeout> | null = null;

function scheduleUiScan(): void {
  if (uiDebounce) clearTimeout(uiDebounce);
  uiDebounce = setTimeout(() => scanUiOnly(), 200);
}

function scheduleAutoLatest(): void {
  if (autoDebounce) clearTimeout(autoDebounce);
  // Wait for WhatsApp to finish painting the conversation
  autoDebounce = setTimeout(() => {
    const key = getChatKey();
    if (key !== activeChatKey) {
      activeChatKey = key;
      seenForAuto.clear();
    }
    void autoTranscribeLatest();
  }, 900);
}

function observe(): void {
  const main = queryFirst(document, MAIN_PANE);
  const target = main ?? document.body;

  queryAll(target, ['[data-id]']).forEach((el) => {
    const id = findMessageId(el);
    if (id) knownIds.add(id);
  });
  scanUiOnly();
  scheduleAutoLatest();

  const observer = new MutationObserver((mutations) => {
    let sawStructuralChange = false;
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
            sawStructuralChange = true;
          }
          void attachToBubble(el);
        }
      });
    }
    scheduleUiScan();
    if (sawStructuralChange) scheduleAutoLatest();
  });

  observer.observe(target, { childList: true, subtree: true });
}

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
