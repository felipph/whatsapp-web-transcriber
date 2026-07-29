# Configuração e storage

Este projeto **não usa variáveis de ambiente** (`.env`). A referência abaixo cobre as chaves de `chrome.storage.local` e os demais stores.

## chrome.storage.local (`ExtensionConfig`)

Defaults em `src/shared/storage.ts`.

### Campos

| Chave | Obrigatório | Default | Descrição |
|-------|-------------|---------|-----------|
| `modelKey` | sim* | `'base'` | Modelo Whisper: `tiny` \| `base` \| `small` \| `medium` |
| `modelStatus` | sim* | `'idle'` | `idle` \| `downloading` \| `loading` \| `ready` \| `error` |
| `downloadProgress` | sim* | `0` | Progresso 0–100 do download/load |
| `statusMessage` | sim* | `''` | Mensagem humana do progresso |
| `autoTranscribe` | sim* | `true` | Auto-transcrever áudios novos |
| `compatibilityMode` | sim* | `false` | `true` quando device caiu para WASM |
| `lastError` | não | — | Última mensagem de erro de load |

\*Presentes via merge com `DEFAULTS` mesmo se ausentes no storage.

## IndexedDB

| Item | Valor |
|------|--------|
| Nome | `wt-transcripts` |
| Store | `transcripts` |
| KeyPath | `messageId` |
| Record | `{ messageId, text, ts, modelId }` |

API: `src/shared/db.ts`.

## Cache Storage

Usado pelo Transformers.js (`env.useBrowserCache`) para pesos ONNX do modelo escolhido. Limpeza via `CLEAR_MODEL_CACHE` / UI de Opções.

## Manifest (não é storage, mas afeta runtime)

| Item | Valor |
|------|--------|
| Permissions | `storage`, `offscreen`, `tabs` |
| Hosts | `web.whatsapp.com`, Hugging Face, `cdn.jsdelivr.net` |
| CSP extension_pages | `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` |

Ver [Configuração](../guias/configuracao.md) para hierarquia e UX.
