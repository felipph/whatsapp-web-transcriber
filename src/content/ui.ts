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
    onOpenSetup: () => void;
  },
): void {
  root.replaceChildren();

  const row = document.createElement('div');
  row.className = 'wt-row';

  if (state.kind === 'setup') {
    const btn = button('Configurar extensão', handlers.onOpenSetup);
    row.append(btn);
    root.append(row);
    return;
  }

  if (state.kind === 'idle') {
    row.append(button('Transcrever', handlers.onTranscribe));
    root.append(row);
    return;
  }

  if (state.kind === 'unavailable') {
    row.append(label('Áudio ainda não disponível'));
    row.append(button('Tentar', handlers.onTranscribe));
    root.append(row);
    return;
  }

  if (state.kind === 'queued') {
    row.append(label('Na fila…'));
    row.append(button('Cancelar', handlers.onCancel, true));
    root.append(row);
    return;
  }

  if (state.kind === 'transcribing') {
    row.append(spinner(), label('Transcrevendo…'));
    row.append(button('Cancelar', handlers.onCancel, true));
    root.append(row);
    return;
  }

  if (state.kind === 'error') {
    row.append(label(state.message));
    row.append(button('Tentar de novo', handlers.onRetry));
    root.append(row);
    return;
  }

  if (state.kind === 'done') {
    const text = document.createElement('div');
    text.className = 'wt-text';
    text.textContent = state.text || '(vazio)';
    const actions = document.createElement('div');
    actions.className = 'wt-row';
    actions.append(button('Re-transcrever', handlers.onRetranscribe, true));
    root.append(text, actions);
  }
}

function button(text: string, onClick: () => void, subtle = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = subtle ? 'wt-btn wt-btn-subtle' : 'wt-btn';
  b.textContent = text;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

function label(text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'wt-label';
  s.textContent = text;
  return s;
}

function spinner(): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'wt-spinner';
  s.setAttribute('aria-hidden', 'true');
  return s;
}

export function injectStyles(): void {
  if (document.getElementById('wt-styles')) return;
  const style = document.createElement('style');
  style.id = 'wt-styles';
  style.textContent = `
    .wt-root {
      margin: 6px 8px 4px;
      max-width: 85%;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.35;
      color: #111b21;
    }
    .wt-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .wt-btn {
      appearance: none;
      border: none;
      background: #00a884;
      color: #fff;
      border-radius: 16px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .wt-btn:hover { filter: brightness(0.95); }
    .wt-btn-subtle {
      background: transparent;
      color: #667781;
      border: 1px solid #d1d7db;
      font-weight: 500;
    }
    .wt-label { color: #667781; }
    .wt-text {
      background: rgba(0,0,0,0.04);
      border-radius: 8px;
      padding: 8px 10px;
      white-space: pre-wrap;
      user-select: text;
      margin-bottom: 4px;
    }
    .wt-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid #d1d7db;
      border-top-color: #00a884;
      border-radius: 50%;
      display: inline-block;
      animation: wt-spin 0.8s linear infinite;
    }
    @keyframes wt-spin { to { transform: rotate(360deg); } }
  `;
  document.documentElement.appendChild(style);
}
