# Protocolo de mensagens (API interna)

Não há HTTP API. A “API” é o protocolo `chrome.runtime` tipado em `src/shared/messages.ts`.

## Direções

| Direção | Mecanismo |
|---------|-----------|
| UI / content → SW | `chrome.runtime.sendMessage` |
| SW → offscreen | `sendMessage` com `_to: 'offscreen'` após `ensureOffscreen` |
| Offscreen → SW (eventos) | `chrome.runtime.sendMessage` (`PROGRESS`, `READY`, `JOB_STATUS`, …) |
| SW → content script | `chrome.tabs.sendMessage` nas abas `web.whatsapp.com/*` |
| MAIN → ISOLATED | `window.postMessage` (`source: 'wt'`) |

## Mensagens para o offscreen (`OffscreenMessage`)

| `type` | Payload principal | Efeito |
|--------|-------------------|--------|
| `LOAD_MODEL` | `modelKey` | Baixa/carrega Whisper |
| `TRANSCRIBE_REQUEST` | `messageId`, `priority`, `audioBase64`, `mimeType`, `durationSec?` | Enfileira job |
| `CANCEL_JOB` | `messageId` | Cancela job |
| `GET_TRANSCRIPT` | `messageId` | Lê IndexedDB |
| `DELETE_TRANSCRIPT` | `messageId` | Remove cache |
| `CLEAR_TRANSCRIPTS` | — | Limpa store |
| `CLEAR_MODEL_CACHE` | — | Limpa pesos em cache |
| `GET_STORAGE_ESTIMATE` | — | `navigator.storage.estimate()` |
| `PING_OFFSCREEN` | — | Health |

## Mensagens só no SW (`RuntimeMessage` extras)

| `type` | Efeito |
|--------|--------|
| `ENSURE_OFFSCREEN` | Cria documento offscreen se necessário |
| `OPEN_SETUP` | Abre `setup.html` |
| `CANCEL_LOAD` | Cancela download/load em andamento |

## Eventos (`RuntimeEvent`)

| `type` | Campos | Consumidores |
|--------|--------|--------------|
| `PROGRESS` | `progress`, `message` | SW → storage; setup/options |
| `READY` | `modelKey`, `device`, `compatibilityMode` | SW → storage/badge |
| `LOAD_ERROR` | `message` | SW → storage/badge |
| `JOB_STATUS` | `messageId`, `status`, `text?`, `error?` | SW → tabs WhatsApp |
| `OFFSCREEN_ALIVE` | — | health |

Status de job: `queued` \| `transcribing` \| `done` \| `error` \| `cancelled`.

## postMessage MAIN → ISOLATED

Payloads com `source: 'wt'`: `HOOK_READY`, `AUDIO_BLOB` (`url`, `blob`, `via`), `MEDIA_SRC` / `MEDIA_PLAY` (`url`).

Fonte da verdade: `src/shared/messages.ts` e `src/content/audio.ts` / `main-world.ts`.
