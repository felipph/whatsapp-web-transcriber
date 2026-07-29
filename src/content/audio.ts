const blobMap = new Map<string, Blob>();
/** Most recent audio-like blobs (fallback when URL correlation fails). */
const recentBlobs: Blob[] = [];
const MAX_RECENT = 12;

let lastMediaSrc: string | null = null;
let hookReady = false;

export function rememberBlob(url: string, blob: Blob): void {
  blobMap.set(url, blob);
  recentBlobs.unshift(blob);
  if (recentBlobs.length > MAX_RECENT) recentBlobs.length = MAX_RECENT;
}

export function getBlobByUrl(url: string): Blob | undefined {
  return blobMap.get(url);
}

export function getHookReady(): boolean {
  return hookReady;
}

export function getLastMediaSrc(): string | null {
  return lastMediaSrc;
}

async function fetchAsBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    rememberBlob(url, blob);
    return blob;
  } catch {
    return null;
  }
}

/**
 * Try several strategies to obtain playable audio bytes for a media element.
 */
export async function resolveAudioBlob(
  audio: HTMLAudioElement | null,
  opts?: { retries?: number; delayMs?: number },
): Promise<Blob | null> {
  const retries = opts?.retries ?? 5;
  const delayMs = opts?.delayMs ?? 300;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const src = audio?.currentSrc || audio?.src || lastMediaSrc || '';

    if (src) {
      const cached = blobMap.get(src);
      if (cached && cached.size > 0) return cached;

      if (src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) {
        const fetched = await fetchAsBlob(src);
        if (fetched) return fetched;
      }
    }

    // Fallback: newest remembered blob (often the one just played)
    if (recentBlobs.length > 0) {
      const newest = recentBlobs[0]!;
      if (newest.size > 0) return newest;
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
      lastMediaSrc = data.url;
      console.info('[wt] captured audio blob', data.url.slice(0, 48), data.blob.size, data.blob.type);
      return;
    }

    if (data.type === 'MEDIA_SRC' && typeof data.url === 'string') {
      lastMediaSrc = data.url;
      return;
    }

    if (data.type === 'MEDIA_PLAY' && typeof data.url === 'string') {
      lastMediaSrc = data.url;
    }
  });
}
