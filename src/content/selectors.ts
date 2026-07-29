/** Isolated selectors with fallbacks — WhatsApp DOM changes often. */

export const MAIN_PANE = ['#main', '[data-testid="conversation-panel-body"]'];

export function queryFirst(root: ParentNode, selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch {
      /* invalid selector */
    }
  }
  return null;
}

export function queryAll(root: ParentNode, selectors: string[]): Element[] {
  const seen = new Set<Element>();
  const out: Element[] = [];
  for (const sel of selectors) {
    try {
      root.querySelectorAll(sel).forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          out.push(el);
        }
      });
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function findMessageId(el: Element): string | null {
  const withId = el.closest('[data-id]') as HTMLElement | null;
  const id = withId?.getAttribute('data-id');
  return id && id.length > 0 ? id : null;
}

/**
 * WhatsApp may keep a shared <audio> outside the bubble. Prefer in-bubble, then
 * any playing/document audio that looks related.
 */
export function findAudioElement(bubble: Element): HTMLAudioElement | null {
  const inBubble = bubble.querySelector('audio');
  if (inBubble instanceof HTMLAudioElement) return inBubble;

  const inRow = bubble.closest('[data-id]')?.querySelector('audio');
  if (inRow instanceof HTMLAudioElement) return inRow;

  const all = Array.from(document.querySelectorAll('audio'));
  const playing = all.find((a) => !a.paused && !a.ended);
  if (playing) return playing;

  // Last audio that has a real src
  for (let i = all.length - 1; i >= 0; i--) {
    const a = all[i]!;
    if (a.src || a.currentSrc) return a;
  }

  return null;
}

export function looksLikeVoiceNote(el: Element): boolean {
  if (el.querySelector('audio')) return true;
  if (el.querySelector('[data-testid="audio-play"]')) return true;
  if (el.querySelector('span[data-testid="audio-duration"]')) return true;
  if (el.querySelector('[data-testid="ptt"]')) return true;
  if (el.querySelector('button[aria-label*="velocidade" i], button[aria-label*="speed" i]')) {
    return true;
  }
  // Waveform / 1.0x control (matches current WA voice UI)
  if (/\b\d+[.,]\d+x\b/.test(el.textContent || '')) {
    const hasTime = /\d+:\d{2}/.test(el.textContent || '');
    if (hasTime) return true;
  }
  if (el.querySelector('[aria-label*="Mensagem de voz" i], [aria-label*="Voice message" i]')) {
    return true;
  }
  return false;
}
