const blobMap = new Map<string, Blob>();

export function rememberBlob(url: string, blob: Blob): void {
  blobMap.set(url, blob);
}

export function forgetBlob(url: string): void {
  blobMap.delete(url);
}

export function getBlobByUrl(url: string): Blob | undefined {
  return blobMap.get(url);
}

export async function resolveAudioBlob(audio: HTMLAudioElement): Promise<Blob | null> {
  const src = audio.currentSrc || audio.src;
  if (!src) return null;

  const cached = blobMap.get(src);
  if (cached) return cached;

  // Fallback: fetch blob: URL while still alive
  if (src.startsWith('blob:')) {
    try {
      const res = await fetch(src);
      if (!res.ok) return null;
      const blob = await res.blob();
      blobMap.set(src, blob);
      return blob;
    } catch {
      return null;
    }
  }

  return null;
}

export function listenMainWorldBlobs(): void {
  window.addEventListener('message', (ev: MessageEvent) => {
    const data = ev.data;
    if (!data || data.source !== 'wt') return;
    if (data.type === 'AUDIO_BLOB' && typeof data.url === 'string' && data.blob instanceof Blob) {
      rememberBlob(data.url, data.blob);
    }
    if (data.type === 'AUDIO_REVOKE' && typeof data.url === 'string') {
      forgetBlob(data.url);
    }
  });
}
