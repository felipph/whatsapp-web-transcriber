export type UiState =
  | { kind: 'setup' }
  | { kind: 'idle' }
  | { kind: 'unavailable' }
  | { kind: 'queued' }
  | { kind: 'transcribing' }
  | { kind: 'done'; text: string }
  | { kind: 'error'; message: string };

const ROOT_ATTR = 'data-wt-root';

export function ensureUi(bubble: Element, messageId: string): HTMLElement {
  let root = bubble.querySelector(`[${ROOT_ATTR}="${CSS.escape(messageId)}"]`) as HTMLElement | null;
  if (root) return root;

  root = document.createElement('div');
  root.setAttribute(ROOT_ATTR, messageId);
  root.className = 'wt-root';
  bubble.appendChild(root);
  return root;
}

export function renderUi(
  root: HTMLElement,
  state: UiState,
  handlers: {
    onTranscribe: () => void;
    onRetry: () => void;
    onCancel: () => void;
    onRetranscribe: () => void;
    onCopy: () => void;
    onOpenSetup: () => void;
  },
): void {
  root.replaceChildren();
  root.dataset.state = state.kind;

  if (state.kind === 'setup') {
    root.append(
      fabButton({
        title: 'Configurar extensão',
        svg: icons.gear,
        onClick: handlers.onOpenSetup,
      }),
    );
    return;
  }

  if (state.kind === 'idle') {
    root.append(
      fabButton({
        title: 'Transcrever áudio',
        svg: icons.transcribe,
        onClick: handlers.onTranscribe,
      }),
    );
    return;
  }

  if (state.kind === 'unavailable') {
    const card = statusCard('Toque play no áudio e tente de novo');
    card.append(
      iconButton({
        title: 'Tentar novamente',
        svg: icons.transcribe,
        onClick: handlers.onTranscribe,
      }),
    );
    root.append(card);
    return;
  }

  if (state.kind === 'queued') {
    const card = statusCard('Na fila…', true);
    card.append(
      iconButton({
        title: 'Cancelar',
        svg: icons.close,
        onClick: handlers.onCancel,
      }),
    );
    root.append(card);
    return;
  }

  if (state.kind === 'transcribing') {
    const card = statusCard('Transcrevendo…', true);
    const spin = document.createElement('span');
    spin.className = 'wt-spinner';
    spin.setAttribute('aria-hidden', 'true');
    card.insertBefore(spin, card.firstChild);
    card.append(
      iconButton({
        title: 'Cancelar',
        svg: icons.close,
        onClick: handlers.onCancel,
      }),
    );
    root.append(card);
    return;
  }

  if (state.kind === 'error') {
    const card = statusCard(state.message);
    card.append(
      iconButton({
        title: 'Tentar de novo',
        svg: icons.refresh,
        onClick: handlers.onRetry,
      }),
    );
    root.append(card);
    return;
  }

  if (state.kind === 'done') {
    const card = document.createElement('div');
    card.className = 'wt-card wt-card-done';

    const text = document.createElement('div');
    text.className = 'wt-card-text';
    text.textContent = state.text || '(vazio)';

    const actions = document.createElement('div');
    actions.className = 'wt-card-actions';
    actions.append(
      iconButton({
        title: 'Copiar transcrição',
        svg: icons.copy,
        onClick: handlers.onCopy,
      }),
      iconButton({
        title: 'Re-transcrever',
        svg: icons.refresh,
        onClick: handlers.onRetranscribe,
      }),
    );

    card.append(text, actions);
    root.append(card);
  }
}

function statusCard(message: string, withSpinnerSlot = false): HTMLElement {
  const card = document.createElement('div');
  card.className = 'wt-card wt-card-status';
  const label = document.createElement('span');
  label.className = 'wt-card-status-label';
  label.textContent = message;
  card.append(label);
  void withSpinnerSlot;
  return card;
}

function fabButton(opts: {
  title: string;
  svg: string;
  onClick: () => void;
}): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'wt-fab';
  b.title = opts.title;
  b.setAttribute('aria-label', opts.title);
  b.innerHTML = opts.svg;
  bindClick(b, opts.onClick);
  return b;
}

function iconButton(opts: {
  title: string;
  svg: string;
  onClick: () => void;
}): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'wt-icon-btn';
  b.title = opts.title;
  b.setAttribute('aria-label', opts.title);
  b.innerHTML = opts.svg;
  bindClick(b, opts.onClick);
  return b;
}

function bindClick(el: HTMLElement, onClick: () => void): void {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
}

const icons = {
  /** Document + sound waves — matches mockup trigger */
  transcribe: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#53bdeb" d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 1.5V9h4.5L14 4.5z"/><path fill="none" stroke="#53bdeb" stroke-width="1.6" stroke-linecap="round" d="M9.2 13.2v3.2M11.4 12v5.6M13.6 13.5v2.6"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="5" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M20 12a8 8 0 1 1-2.3-5.6"/><path fill="currentColor" d="M20 4v5h-5l5-5z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 7l10 10M17 7L7 17"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#53bdeb" d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm8.1 2.2-1.3-.2a6.8 6.8 0 0 0-.6-1.4l.8-1.1-1.5-1.5-1.1.8c-.4-.3-.9-.5-1.4-.6l-.2-1.3h-2.2l-.2 1.3c-.5.1-1 .3-1.4.6l-1.1-.8-1.5 1.5.8 1.1c-.3.4-.5.9-.6 1.4l-1.3.2v2.2l1.3.2c.1.5.3 1 .6 1.4l-.8 1.1 1.5 1.5 1.1-.8c.4.3.9.5 1.4.6l.2 1.3h2.2l.2-1.3c.5-.1 1-.3 1.4-.6l1.1.8 1.5-1.5-.8-1.1c.3-.4.5-.9.6-1.4l1.3-.2v-2.2z"/></svg>`,
};

export function injectStyles(): void {
  if (document.getElementById('wt-styles')) return;
  const style = document.createElement('style');
  style.id = 'wt-styles';
  style.textContent = `
    .wt-root {
      margin: 4px 8px 6px;
      max-width: min(85%, 420px);
      font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 14.2px;
      line-height: 1.4;
      color: #111b21;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
    .wt-fab {
      appearance: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: #fff;
      box-shadow: 0 1px 3px rgba(11, 20, 26, 0.18), 0 0 0 1px rgba(0,0,0,0.04);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .wt-fab:hover {
      transform: translateY(-1px);
      box-shadow: 0 3px 8px rgba(11, 20, 26, 0.2), 0 0 0 1px rgba(0,0,0,0.05);
    }
    .wt-fab:active { transform: translateY(0); }
    .wt-card {
      background: #f0f2f5;
      border-radius: 10px;
      padding: 10px 12px 8px;
      width: 100%;
      box-sizing: border-box;
      position: relative;
    }
    .wt-card-done {
      background: #f0f2f5;
    }
    .wt-card-status {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #667781;
      font-size: 13px;
      padding: 8px 10px;
    }
    .wt-card-status-label { flex: 1; }
    .wt-card-text {
      white-space: pre-wrap;
      user-select: text;
      color: #111b21;
      padding-right: 4px;
      margin-bottom: 6px;
    }
    .wt-card-actions {
      display: flex;
      justify-content: flex-end;
      gap: 2px;
    }
    .wt-icon-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: #8696a0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
    }
    .wt-icon-btn:hover {
      background: rgba(11, 20, 26, 0.06);
      color: #54656f;
    }
    .wt-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid #d1d7db;
      border-top-color: #53bdeb;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
      animation: wt-spin 0.8s linear infinite;
    }
    @keyframes wt-spin { to { transform: rotate(360deg); } }
  `;
  document.documentElement.appendChild(style);
}
