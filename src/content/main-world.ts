/**
 * Runs in page MAIN world. Must stay tiny and side-effect free beyond hooks.
 * Captures media Blobs WhatsApp materializes for playback.
 */
(() => {
  const SOURCE = 'wt';

  const origCreate = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);

  function isLikelyAudioBlob(obj: Blob): boolean {
    const t = (obj.type || '').toLowerCase();
    if (t.startsWith('audio/')) return true;
    if (t.includes('ogg') || t.includes('opus') || t.includes('mpeg') || t.includes('mp4') || t.includes('webm')) {
      return true;
    }
    // WhatsApp sometimes creates Blobs with empty MIME for decrypted voice notes
    if (!t && obj.size > 256) return true;
    return false;
  }

  function emitBlob(url: string, blob: Blob): void {
    try {
      // Clone so revokeObjectURL / GC on WhatsApp's side does not wipe our copy
      const clone = blob.slice(0, blob.size, blob.type || 'audio/ogg');
      window.postMessage({ source: SOURCE, type: 'AUDIO_BLOB', url, blob: clone }, '*');
    } catch {
      /* ignore */
    }
  }

  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = origCreate(obj as Blob);
    try {
      if (obj instanceof Blob && isLikelyAudioBlob(obj)) {
        emitBlob(url, obj);
      }
    } catch {
      /* ignore */
    }
    return url;
  };

  // Do NOT notify revoke for deletion — we keep clones keyed by the old URL / element src.
  URL.revokeObjectURL = (url: string) => origRevoke(url);

  const proto = HTMLMediaElement.prototype;
  const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
  if (srcDesc?.set && srcDesc.get) {
    Object.defineProperty(proto, 'src', {
      configurable: true,
      enumerable: srcDesc.enumerable,
      get() {
        return srcDesc.get!.call(this);
      },
      set(value: string) {
        srcDesc.set!.call(this, value);
        try {
          if (typeof value === 'string' && value.length > 0) {
            window.postMessage(
              {
                source: SOURCE,
                type: 'MEDIA_SRC',
                url: value,
                tag: (this as HTMLMediaElement).tagName,
                currentSrc: (this as HTMLMediaElement).currentSrc || value,
              },
              '*',
            );
          }
        } catch {
          /* ignore */
        }
      },
    });
  }

  const origPlay = proto.play;
  proto.play = function playPatched(this: HTMLMediaElement, ...args: unknown[]) {
    try {
      const src = this.currentSrc || this.src;
      if (src) {
        window.postMessage(
          {
            source: SOURCE,
            type: 'MEDIA_PLAY',
            url: src,
            tag: this.tagName,
            duration: this.duration,
          },
          '*',
        );
      }
    } catch {
      /* ignore */
    }
    return origPlay.apply(this, args as []);
  };

  window.postMessage({ source: SOURCE, type: 'HOOK_READY' }, '*');
})();
