# WhatsApp Web Transcriber

Transcreve áudios do WhatsApp Web 100% no browser, com privacidade primeiro.

## Visão Geral

Extensão Chrome (Manifest V3) para `web.whatsapp.com` que transforma áudios (PTT) em texto usando Whisper via Transformers.js. O áudio nunca sai do seu PC: decode e STT rodam em um documento offscreen + Web Worker. Setup pós-instalação baixa o modelo; no chat, os áudios mais recentes podem ser auto-transcritos e o histórico sob demanda.

## Funcionalidades

* **STT local**: Whisper (`tiny` / `base` / `small` / `medium`, `dtype: q8`) com WebGPU → fallback WASM
* **Modo híbrido**: auto nos últimos áudios novos + botão Transcrever no histórico
* **Setup na instalação**: escolha de modelo, progresso de download, retomada
* **Fila serial com prioridade**: clique manual passa na frente de jobs automáticos
* **Cache de transcrições**: IndexedDB por `messageId`, com re-transcrever e copiar
* **Privacidade**: sem API de STT externa; rede só para baixar o modelo (Hugging Face)

## Estrutura do Projeto

```bash
├── manifest.config.ts       # Manifest V3 (CRXJS)
├── vite.config.ts           # Build Vite + @crxjs/vite-plugin
├── package.json
├── public/
│   ├── icons/               # Ícones da extensão
│   └── ort/                 # WASM do ONNX Runtime (copiado no prebuild)
├── src/
│   ├── background/          # Service worker (thin): setup, offscreen, relay
│   ├── offscreen/           # Dono da fila + decode + host do Whisper worker
│   ├── content/             # UI WhatsApp, captura de áudio, hooks MAIN/ISOLATED
│   ├── stt/                 # Modelos, fila, decode PCM, whisper-worker
│   ├── setup/               # Onboarding pós-instalação
│   ├── options/             # Preferências e limpeza de cache
│   ├── popup/               # Status rápido + toggle auto
│   └── shared/              # Mensagens tipadas, storage, IndexedDB, CSS
└── docs/                    # Documentação (este padrão)
```

## Pré-requisitos

- **Node.js** 20+ — build e tooling
- **npm** 10+ — gerenciador de pacotes
- **Google Chrome** (ou Chromium) recente — carregar extensão MV3
- Conta/uso do **WhatsApp Web** em `https://web.whatsapp.com`

## Stack principal

* **Chrome MV3**: runtime da extensão (service worker, offscreen, content scripts)
* **TypeScript + Vite**: tipagem e bundling
* **@crxjs/vite-plugin**: empacota a extensão a partir do `manifest.config.ts`
* **@huggingface/transformers** v3: pipeline Whisper no Web Worker
* **IndexedDB / chrome.storage.local / Cache Storage**: transcrições, config e modelo

## Instalação

1. Clone o repositório e instale dependências:

```bash
git clone <repo-url>
cd whatsapp-transcriber
npm install
```

2. Build de produção (também copia assets ORT para `public/ort/`):

```bash
npm run build
```

3. Em `chrome://extensions`, ative **Modo do desenvolvedor** → **Carregar sem compactação** → selecione a pasta `dist/`.

### Como usar

```bash
npm run dev      # rebuild contínuo via Vite/CRXJS
npm run build    # typecheck + build em dist/
```

1. Na instalação, a página de **setup** abre automaticamente.
2. Escolha o modelo (`base` recomendado) e clique em **Baixar e preparar**.
3. Quando estiver pronto, abra o WhatsApp Web.
4. Use o popup para o toggle de auto-transcrição; no chat, use **Transcrever** no histórico.

## Observações e Restrições

* Só funciona em **WhatsApp Web** (não no app desktop nativo nem no mobile).
* Idioma de STT fixo em **PT-BR**.
* A extensão **não dá play** no áudio para capturar bytes; se o blob ainda não existir, a UI pede para tocar play uma vez e tentar de novo.
* Não use COOP/COEP no manifest: isolamento cross-origin faz o ORT criar `blob:` workers bloqueados pelo CSP da extensão.
* CSP das páginas da extensão exige `'wasm-unsafe-eval'` para o Whisper WASM.

## Documentação

- [Primeiros passos](docs/primeiros-passos.md) — setup local completo
- [Arquitetura](docs/arquitetura.md) — componentes e fluxo
- [Contribuindo](CONTRIBUTING.md) — workflow de contribuição
- [ADRs](docs/adr/) — decisões de arquitetura
- [Runbook](docs/guias/runbook.md) — operação e incidentes
- [Plano de produto](docs/plano-whatsapp-web-transcriber.md) — spec original

