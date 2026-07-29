# WhatsApp Web Transcriber

Extensão Chrome MV3 que transcreve áudios do WhatsApp Web localmente com Whisper (Transformers.js). Stack: TypeScript, Vite, `@crxjs/vite-plugin`, `@huggingface/transformers` ^3.5.

## Language

All docs and user-facing UI strings in **PT-BR**. Code identifiers in English. Filenames under `docs/` use the PT-BR mapping (`primeiros-passos.md`, `arquitetura.md`, `guias/`, `referencia/`).

## Commands

```bash
npm install          # Dependências
npm run dev          # Vite/CRXJS em watch
npm run build        # tsc --noEmit + vite build (prebuild copia ORT WASM)
npx tsc --noEmit     # Typecheck isolado
```

Não há lint/format/test scripts no `package.json` ainda.

## Structure

```
src/background/   # SW thin: onInstalled, ensureOffscreen, relay, badge, storage lifecycle
src/offscreen/    # Fila + decode + Whisper worker host (NÃO use chrome.storage aqui)
src/content/      # MAIN hook + ISOLATED UI/captura WhatsApp
src/stt/          # models, queue, audio-decode, whisper-worker
src/setup|options|popup/
src/shared/       # messages.ts, storage.ts, db.ts
manifest.config.ts
```

## Conventions

- Mensagens tipadas em `src/shared/messages.ts` (discriminated unions). Novos tipos entram lá primeiro.
- Config só em `chrome.storage.local` via `shared/storage.ts`. Offscreen **não** tem `chrome.storage` — persiste lifecycle no SW ao receber eventos.
- Transcrições em IndexedDB (`shared/db.ts`, DB `wt-transcripts`).
- Content scripts não recebem `runtime.sendMessage` broadcast: o SW usa `chrome.tabs.sendMessage` para `JOB_STATUS` nas abas do WhatsApp.
- UI do balão: `renderUi` só recria DOM se `data-wt-sig` mudou; MutationObserver ignora `.wt-root`.
- Captura de áudio: **nunca** clicar play. Só hooks MAIN + `fetch(audio.src)` + bind por `messageId`.
- Alias `@/*` → `./src/*` (sem `baseUrl` no tsconfig).

## Gotchas

- **CSP WASM:** `script-src 'self' 'wasm-unsafe-eval'` em `manifest.config.ts` é obrigatório.
- **Sem COOP/COEP:** cross-origin isolation faz ORT spawnar `blob:` workers → bloqueados. Use `numThreads: 1` + `wasmPaths` locais em `public/ort/`.
- **SW morre ~30s idle:** a fila vive no **offscreen**, não no service worker.
- **Blob no MAIN world:** isolated world não vê o `Blob` do `createObjectURL`; use `main-world.ts` + `postMessage`.
- **Mesmo transcript em todos os balões:** nunca use “último blob global” sem bind a `data-id` / `messageId`.
- **UI some ao trocar chat:** observar `document.body` e forçar hydrate IndexedDB no chat change.
- **Carregar `dist/`**, não a raiz do repo, em `chrome://extensions`.
- Após mudanças: reload da extensão **e** da aba do WhatsApp Web.

## Key docs

- [Arquitetura](docs/arquitetura.md)
- [Primeiros passos](docs/primeiros-passos.md)
- [Protocolo de mensagens](docs/referencia/api.md)
- [Configuração / storage](docs/referencia/variaveis-de-ambiente.md)
- [Solução de problemas](docs/guias/solucao-de-problemas.md)
- [Runbook](docs/guias/runbook.md)
- [ADRs](docs/adr/)
- [Plano de produto](docs/plano-whatsapp-web-transcriber.md)
