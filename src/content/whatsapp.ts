import {
  listenMainWorldBlobs,
  resolveAudioBlobForMessage,
  setPendingMessageId,
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
import { ensureUi, injectStyles, renderUi, hasUi, type UiState } from './ui';
import { getConfig, onConfigChange, type ExtensionConfig } from '../shared/storage';
import type { JobPriority, RuntimeEvent } from '../shared/messages';

/** Newest voice notes to auto-queue when opening a chat (bottom → top). */
const AUTO_LIMIT = 3;

listenMainWorldBlobs();
injectStyles();

const states = new Map<string, UiState>();
const seenForAuto = new Set<string>();
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
  opts: { claimUnclaimed: boolean },
): Promise<Blob | null> {
  const run = async (): Promise<Blob | null> => {
    const existing = getBlobForMessage(messageId);
    if (existing) return existing;

    setPendingMessageId(messageId);

    // Never click WhatsApp play — mute+click still leaks audible playback.
    // Wait for createObjectURL / network hooks / existing <audio> src only.
    return resolveAudioBlobForMessage(messageId, findAudioElement(bubble), {
      retries: opts.claimUnclaimed ? 6 : 8,
      delayMs: 250,
      claimUnclaimed: opts.claimUnclaimed,
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
): Promise<void> {
  if (!config || config.modelStatus !== 'ready') {
    setState(messageId, { kind: 'setup' });
    refreshMessageUi(messageId);
    return;
  }

  // Auto may claim recently captured unclaimed blobs; manual stays message-scoped
  // (pending id + audio src) so we never steal another message's audio.
  const claimUnclaimed = priority === 'auto';

  setState(messageId, { kind: 'queued' });
  refreshMessageUi(messageId);

  const blob = await obtainBlobForMessage(messageId, bubble, { claimUnclaimed });
  if (!blob) {
    missCount += 1;
    console.warn('[wt] audio blob missing for message', messageId, { missCount, priority });
    // Auto: leave idle (user can click Transcrever). Manual: honest hint to play once.
    if (priority === 'auto') {
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
    onCopy: () => {
      const state = states.get(messageId);
      const text = state?.kind === 'done' ? state.text : '';
      if (!text) return;
      void navigator.clipboard.writeText(text).catch(() => {
        /* ignore */
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
  // Force update after job status changes
  root.removeAttribute('data-wt-sig');
  renderUi(root, state, handlersFor(messageId, bubble));
}

async function attachToBubble(
  bubble: Element,
  opts?: { forceHydrate?: boolean },
): Promise<void> {
  if (!looksLikeVoiceNote(bubble)) return;
  const messageId = findMessageId(bubble);
  if (!messageId) return;

  const uiMissing = !hasUi(bubble, messageId);
  let state = states.get(messageId);

  const shouldHydrate =
    opts?.forceHydrate ||
    !state ||
    (uiMissing && state.kind !== 'queued' && state.kind !== 'transcribing');

  if (shouldHydrate) {
    if (!config || config.modelStatus !== 'ready') {
      state = state ?? { kind: 'setup' };
    } else {
      const cached = await requestTranscript(messageId);
      if (cached) {
        state = { kind: 'done', text: cached };
      } else if (!state || state.kind === 'done') {
        state = { kind: 'idle' };
      }
    }
    setState(messageId, state);
  }

  const root = ensureUi(bubble, messageId);
  renderUi(root, states.get(messageId)!, handlersFor(messageId, bubble));
}

function scanUiOnly(opts?: { forceHydrate?: boolean }): void {
  const main = queryFirst(document, MAIN_PANE) ?? document.body;
  const candidates = queryAll(main, ['[data-id]']);
  for (const el of candidates) {
    void attachToBubble(el, opts);
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
  return items.reverse();
}

async function autoTranscribeLatest(): Promise<void> {
  if (!config?.autoTranscribe || config.modelStatus !== 'ready') return;

  const latest = listVoiceNotesNewestFirst().slice(0, AUTO_LIMIT);
  for (const { id, el } of latest) {
    if (seenForAuto.has(id)) continue;
    await attachToBubble(el, { forceHydrate: true });
    if (states.get(id)?.kind !== 'idle') continue;
    seenForAuto.add(id);
    await enqueue(id, el, 'auto');
  }
}

let uiDebounce: ReturnType<typeof setTimeout> | null = null;
let autoDebounce: ReturnType<typeof setTimeout> | null = null;

function scheduleUiScan(delayMs = 200, forceHydrate = false): void {
  if (uiDebounce) clearTimeout(uiDebounce);
  uiDebounce = setTimeout(() => scanUiOnly({ forceHydrate }), delayMs);
}

function scheduleAutoLatest(): void {
  if (autoDebounce) clearTimeout(autoDebounce);
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
  // Observe body: WhatsApp often replaces #main when switching chats, which
  // would kill an observer attached only to the old #main node.
  scanUiOnly({ forceHydrate: true });
  scheduleAutoLatest();

  let lastChatKey = getChatKey();
  activeChatKey = lastChatKey;

  const observer = new MutationObserver((mutations) => {
    // Ignore mutations caused by our own UI (hover/focus) to prevent rescan flicker
    const relevant = mutations.some((m) => {
      const t = m.target;
      if (t instanceof Node) {
        const el = t instanceof Element ? t : t.parentElement;
        if (el?.closest?.('.wt-root')) return false;
      }
      for (const n of m.addedNodes) {
        if (n instanceof Element && n.closest('.wt-root')) return false;
      }
      return true;
    });
    if (!relevant) return;

    const key = getChatKey();
    const chatChanged = key !== lastChatKey;
    if (chatChanged) {
      lastChatKey = key;
      activeChatKey = key;
      seenForAuto.clear();
      scheduleUiScan(500, true);
      scheduleAutoLatest();
      return;
    }
    scheduleUiScan(250, false);
  });

  observer.observe(document.body, { childList: true, subtree: true });
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
