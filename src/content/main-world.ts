/**
 * Runs in page MAIN world. Captures decrypted/playable audio without needing UI play
 * when WhatsApp already materializes Blobs (createObjectURL) or fetches raw audio.
 */
(() => {
  const SOURCE = 'wt';

  const origCreate = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);
  const origFetch = window.fetch.bind(window);

  function emitBlob(url: string, blob: Blob, via: string): void {
    try {
      const clone = blob.slice(0, blob.size, blob.type || 'audio/ogg');
      window.postMessage({ source: SOURCE, type: 'AUDIO_BLOB', url, blob: clone, via }, '*');
    } catch {
      /* ignore */
    }
  }

  function looksLikeAudioMime(type: string): boolean {
    const t = (type || '').toLowerCase();
    return (
      t.startsWith('audio/') ||
      t.includes('ogg') ||
      t.includes('opus') ||
      t.includes('mpeg') ||
      t.includes('mp4') ||
      t.includes('webm')
    );
  }

  function isLikelyAudioBlob(obj: Blob): boolean {
    if (looksLikeAudioMime(obj.type)) return true;
    // Empty MIME decrypted voice notes
    if (!obj.type && obj.size > 256) return true;
    return false;
  }

  function urlLooksLikeMedia(url: string): boolean {
    const u = url.toLowerCase();
    return (
      u.includes('.ogg') ||
      u.includes('opus') ||
      u.includes('audio') ||
      u.includes('mmg.') ||
      u.includes('whatsapp.net') ||
      u.includes('whatsapp.com')
    );
  }

  async function blobIsOggOrAudio(blob: Blob): Promise<boolean> {
    if (looksLikeAudioMime(blob.type)) return true;
    if (blob.size < 4) return false;
    try {
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      // OggS
      if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) {
        return true;
      }
      // ID3 / MP3 sync
      if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true;
      if (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  async function maybeEmitNetworkBlob(url: string, blob: Blob): Promise<void> {
    if (blob.size < 256) return;
    // Skip likely E2E ciphertext (octet-stream without audio magic)
    if (!(await blobIsOggOrAudio(blob))) return;
    const key = url || `network:${Date.now()}:${blob.size}`;
    emitBlob(key, blob, 'network');
  }

  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = origCreate(obj as Blob);
    try {
      if (obj instanceof Blob && isLikelyAudioBlob(obj)) {
        emitBlob(url, obj, 'createObjectURL');
      }
    } catch {
      /* ignore */
    }
    return url;
  };

  URL.revokeObjectURL = (url: string) => origRevoke(url);

  window.fetch = async function wtFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const res = await origFetch(input as RequestInfo, init);
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const ct = res.headers.get('content-type') || '';
      if (looksLikeAudioMime(ct) || urlLooksLikeMedia(url)) {
        const clone = res.clone();
        void clone
          .blob()
          .then((blob) => maybeEmitNetworkBlob(url, blob))
          .catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
    return res;
  };

  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;
  XHR.open = function wtOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    (this as XMLHttpRequest & { __wtUrl?: string }).__wtUrl =
      typeof url === 'string' ? url : url.href;
    return origOpen.call(
      this,
      method,
      url,
      async ?? true,
      username,
      password,
    );
  };
  XHR.send = function wtSend(this: XMLHttpRequest, body?: XMLHttpRequestBodyInit | null) {
    this.addEventListener('load', () => {
      try {
        const url = (this as XMLHttpRequest & { __wtUrl?: string }).__wtUrl || '';
        const ct = this.getResponseHeader('content-type') || '';
        if (!looksLikeAudioMime(ct) && !urlLooksLikeMedia(url)) return;
        const type = this.responseType;
        if (type === 'blob' && this.response instanceof Blob) {
          void maybeEmitNetworkBlob(url, this.response);
          return;
        }
        if (type === 'arraybuffer' && this.response instanceof ArrayBuffer) {
          void maybeEmitNetworkBlob(
            url,
            new Blob([this.response], { type: ct || 'audio/ogg' }),
          );
        }
      } catch {
        /* ignore */
      }
    });
    return origSend.call(this, body);
  };

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
