const blobByUrl = new Map<string, Blob>();
/** Authoritative mapping: WhatsApp message data-id → audio bytes */
const blobByMessageId = new Map<string, Blob>();
const urlByMessageId = new Map<string, string>();

/** Message waiting for the next captured blob (play click or transcribe trigger). */
let pendingMessageId: string | null = null;
let pendingExpiresAt = 0;
let hookReady = false;

const PENDING_TTL_MS = 15_000;

export function setPendingMessageId(messageId: string | null): void {
  pendingMessageId = messageId;
  pendingExpiresAt = messageId ? Date.now() + PENDING_TTL_MS : 0;
}

function takePendingMessageId(): string | null {
  if (!pendingMessageId) return null;
  if (Date.now() > pendingExpiresAt) {
    pendingMessageId = null;
    return null;
  }
  const id = pendingMessageId;
  pendingMessageId = null;
  pendingExpiresAt = 0;
  return id;
}

function peekPendingMessageId(): string | null {
  if (!pendingMessageId) return null;
  if (Date.now() > pendingExpiresAt) {
    pendingMessageId = null;
    return null;
  }
  return pendingMessageId;
}

export function bindBlobToMessage(messageId: string, blob: Blob, url?: string): void {
  if (!messageId || blob.size === 0) return;
  blobByMessageId.set(messageId, blob);
  if (url) {
    blobByUrl.set(url, blob);
    urlByMessageId.set(messageId, url);
  }
  console.info('[wt] bound blob → message', messageId.slice(0, 40), blob.size);
}

export function getBlobForMessage(messageId: string): Blob | undefined {
  return blobByMessageId.get(messageId);
}

export function rememberBlob(url: string, blob: Blob): void {
  blobByUrl.set(url, blob);
  const pending = peekPendingMessageId();
  if (pending) {
    bindBlobToMessage(pending, blob, url);
    // Keep pending briefly so MEDIA_SRC/PLAY for same gesture can reuse,
    // but clear after bind so the *next* unrelated blob doesn't steal it.
    takePendingMessageId();
  }
}

export function getHookReady(): boolean {
  return hookReady;
}

async function fetchAsBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    blobByUrl.set(url, blob);
    return blob;
  } catch {
    return null;
  }
}

/**
 * Resolve audio bytes for a specific WhatsApp message. Never falls back to
 * "whichever blob was last captured" — that caused identical transcripts.
 */
export async function resolveAudioBlobForMessage(
  messageId: string,
  audio: HTMLAudioElement | null,
  opts?: { retries?: number; delayMs?: number },
): Promise<Blob | null> {
  const retries = opts?.retries ?? 10;
  const delayMs = opts?.delayMs ?? 350;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const byId = blobByMessageId.get(messageId);
    if (byId && byId.size > 0) return byId;

    const src = audio?.currentSrc || audio?.src || urlByMessageId.get(messageId) || '';
    if (src) {
      const cached = blobByUrl.get(src);
      if (cached && cached.size > 0) {
        bindBlobToMessage(messageId, cached, src);
        return cached;
      }
      if (src.startsWith('blob:') || src.startsWith('https://') || src.startsWith('http://')) {
        const fetched = await fetchAsBlob(src);
        if (fetched) {
          bindBlobToMessage(messageId, fetched, src);
          return fetched;
        }
      }
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return null;
}

export function listenMainWorldBlobs(): void {
  window.addEventListener('message', (ev: MessageEvent) => {
    const data = ev.data;
    if (!data || data.source !== 'wt') return;

    if (data.type === 'HOOK_READY') {
      hookReady = true;
      console.info('[wt] main-world hook ready');
      return;
    }

    if (data.type === 'AUDIO_BLOB' && typeof data.url === 'string' && data.blob instanceof Blob) {
      rememberBlob(data.url, data.blob);
      console.info('[wt] captured audio blob', data.url.slice(0, 48), data.blob.size, data.blob.type);
      return;
    }

    if (
      (data.type === 'MEDIA_SRC' || data.type === 'MEDIA_PLAY') &&
      typeof data.url === 'string'
    ) {
      const pending = peekPendingMessageId();
      const existing = blobByUrl.get(data.url);
      if (pending && existing) {
        bindBlobToMessage(pending, existing, data.url);
        takePendingMessageId();
      }
    }
  });
}

/** Click WhatsApp's play control inside a bubble to force media load for that message. */
export function clickPlayInBubble(bubble: Element): boolean {
  const selectors = [
    '[data-testid="audio-play"]',
    'button[aria-label*="Reproduzir" i]',
    'button[aria-label*="Play" i]',
    'span[data-icon="audio-play"]',
    'span[data-icon="ptt-status-bg-gray"]',
    '[data-testid="ptt"] [role="button"]',
  ];
  for (const sel of selectors) {
    try {
      const el = bubble.querySelector(sel);
      if (el instanceof HTMLElement && !el.closest('.wt-root')) {
        el.click();
        return true;
      }
    } catch {
      /* ignore */
    }
  }

  // Fallback: click the first non-extension button-looking control in the bubble
  const btn = bubble.querySelector('button, [role="button"]');
  if (btn instanceof HTMLElement && !btn.closest('.wt-root')) {
    btn.click();
    return true;
  }
  return false;
}
