/** Isolated selectors with fallbacks — WhatsApp DOM changes often. */

export const MAIN_PANE = ['#main', '[data-testid="conversation-panel-body"]'];

export const MESSAGE_ROW = [
  '[data-id]',
  'div[data-testid="msg-container"]',
  '.message-in, .message-out',
];

export const AUDIO_IN_BUBBLE = [
  'audio',
  '[data-testid="audio-play"]',
  'button[aria-label*="áudio" i]',
  'button[aria-label*="audio" i]',
];

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

export function findAudioElement(bubble: Element): HTMLAudioElement | null {
  const audio = bubble.querySelector('audio');
  return audio instanceof HTMLAudioElement ? audio : null;
}

export function looksLikeVoiceNote(el: Element): boolean {
  if (el.querySelector('audio')) return true;
  if (el.querySelector('[data-testid="audio-play"]')) return true;
  if (el.querySelector('span[data-testid="audio-duration"]')) return true;
  // PT-BR / EN aria hints
  if (el.querySelector('[aria-label*="Mensagem de voz" i], [aria-label*="Voice message" i]')) {
    return true;
  }
  return false;
}
