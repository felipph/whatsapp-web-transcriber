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

/** Only audio inside this message — never the shared document player. */
export function findAudioElement(bubble: Element): HTMLAudioElement | null {
  const root = bubble.closest('[data-id]') ?? bubble;
  const inBubble = root.querySelector('audio');
  return inBubble instanceof HTMLAudioElement ? inBubble : null;
}

export function looksLikeVoiceNote(el: Element): boolean {
  if (el.querySelector('audio')) return true;
  if (el.querySelector('[data-testid="audio-play"]')) return true;
  if (el.querySelector('span[data-testid="audio-duration"]')) return true;
  if (el.querySelector('[data-testid="ptt"]')) return true;
  // Mic badge on avatar (incoming/outgoing voice notes)
  if (
    el.querySelector(
      'span[data-icon="ptt-out-blue"], span[data-icon="ptt-in-blue"], span[data-icon*="ptt"], [data-testid="ptt-status"]',
    )
  ) {
    return true;
  }
  if (el.querySelector('button[aria-label*="velocidade" i], button[aria-label*="speed" i]')) {
    return true;
  }
  const text = el.textContent || '';
  if (/\b\d+[.,]\d+x\b/.test(text) && /\d+:\d{2}/.test(text)) return true;
  // Waveform scrubber often shows current time + message meta time without 1.0x yet
  if (
    el.querySelector('[role="slider"], input[type="range"]') &&
    /\d+:\d{2}/.test(text)
  ) {
    return true;
  }
  if (el.querySelector('[aria-label*="Mensagem de voz" i], [aria-label*="Voice message" i]')) {
    return true;
  }
  return false;
}
