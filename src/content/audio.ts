const blobByUrl = new Map<string, Blob>();
/** Authoritative mapping: WhatsApp message data-id → audio bytes */
const blobByMessageId = new Map<string, Blob>();
const urlByMessageId = new Map<string, string>();
/** Playable audio captured without a pending message yet (createObjectURL / network). */
const unclaimedBlobs: { blob: Blob; url: string; ts: number }[] = [];

/** Message waiting for the next captured blob (play click or transcribe trigger). */
let pendingMessageId: string | null = null;
let pendingExpiresAt = 0;
let hookReady = false;

const PENDING_TTL_MS = 15_000;
const UNCLAIMED_TTL_MS = 60_000;
const MAX_UNCLAIMED = 20;

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

function pruneUnclaimed(): void {
  const cutoff = Date.now() - UNCLAIMED_TTL_MS;
  while (unclaimedBlobs.length && unclaimedBlobs[0]!.ts < cutoff) {
    unclaimedBlobs.shift();
  }
  while (unclaimedBlobs.length > MAX_UNCLAIMED) {
    unclaimedBlobs.shift();
  }
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
    takePendingMessageId();
    return;
  }
  unclaimedBlobs.push({ blob, url, ts: Date.now() });
  pruneUnclaimed();
}

/** Claim the newest unclaimed playable blob for a message (silent auto path). */
export function claimUnclaimedBlobForMessage(messageId: string): Blob | null {
  pruneUnclaimed();
  const item = unclaimedBlobs.pop();
  if (!item) return null;
  bindBlobToMessage(messageId, item.blob, item.url);
  return item.blob;
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
 * "whichever blob was last captured" across random messages without claiming.
 */
export async function resolveAudioBlobForMessage(
  messageId: string,
  audio: HTMLAudioElement | null,
  opts?: { retries?: number; delayMs?: number; claimUnclaimed?: boolean },
): Promise<Blob | null> {
  const retries = opts?.retries ?? 10;
  const delayMs = opts?.delayMs ?? 350;
  const claimUnclaimed = opts?.claimUnclaimed ?? false;

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

    if (claimUnclaimed) {
      const claimed = claimUnclaimedBlobForMessage(messageId);
      if (claimed) return claimed;
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
      console.info(
        '[wt] captured audio blob',
        data.via || 'unknown',
        data.url.slice(0, 48),
        data.blob.size,
        data.blob.type,
      );
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

function clickPlayInBubble(bubble: Element): boolean {
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

  const btn = bubble.querySelector('button, [role="button"]');
  if (btn instanceof HTMLElement && !btn.closest('.wt-root')) {
    btn.click();
    return true;
  }
  return false;
}

/**
 * Force WhatsApp to load media for a bubble while keeping speakers silent:
 * mute all <audio>, click play, pause quickly, restore mute state.
 */
export async function silentPrimeBubble(bubble: Element): Promise<boolean> {
  const audios = Array.from(document.querySelectorAll('audio'));
  const prev = audios.map((a) => ({ a, muted: a.muted, volume: a.volume }));
  for (const a of audios) {
    a.muted = true;
    a.volume = 0;
  }

  const clicked = clickPlayInBubble(bubble);
  if (!clicked) {
    for (const { a, muted, volume } of prev) {
      a.muted = muted;
      a.volume = volume;
    }
    return false;
  }

  await new Promise((r) => setTimeout(r, 120));
  for (const a of Array.from(document.querySelectorAll('audio'))) {
    try {
      a.muted = true;
      a.volume = 0;
      a.pause();
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => setTimeout(r, 250));

  for (const { a, muted, volume } of prev) {
    try {
      a.muted = muted;
      a.volume = volume;
    } catch {
      /* ignore */
    }
  }
  return true;
}
