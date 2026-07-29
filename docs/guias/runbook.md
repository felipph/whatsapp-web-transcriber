# Runbook

Procedimentos operacionais para a extensão em uso local no Chrome.

## Health check

1. Ícone da extensão: badge `✓` verde ⇒ modelo `ready`.
2. Popup: texto de status “pronto” (ou equivalente) e toggle auto responsivo.
3. No WhatsApp Web, um balão de áudio mostra o FAB da extensão.

```bash
npm run build
# chrome://extensions → Recarregar a extensão
```

Esperado: sem erros vermelhos na página de detalhes da extensão; setup/options abrem.

## Logs

| Onde | Como |
|------|------|
| Aba WhatsApp | DevTools → Console → filtrar `[wt]` |
| Service worker | `chrome://extensions` → Service worker → “Inspecionar” |
| Offscreen | Inspecionar o documento offscreen (via SW / frames da extensão) |
| Setup/Options/Popup | DevTools na respectiva página da extensão |

Padrões úteis:

- `[wt] main-world hook ready` — hook MAIN ok
- `[wt] captured audio blob` — bytes capturados
- `[wt] bound blob → message` — correlação ok
- `[wt] audio blob missing` — captura falhou (sem play automático)

## Incidentes comuns

### Modelo não carrega / status error

**Sintoma:** badge `!`, setup/options em erro, `LOAD_ERROR`.  
**Remediação:**
1. Abra Opções → limpar cache do modelo (`CLEAR_MODEL_CACHE`).
2. Recarregue a extensão.
3. Rode o setup de novo e baixe o modelo.
4. Se falhar, teste `tiny` (menor) para isolar OOM/rede.  
**Verificar:** evento `READY` + `modelStatus: 'ready'` no storage.

### Offscreen / fila parada

**Sintoma:** jobs ficam em queued/transcribing; SW idle.  
**Remediação:**
1. Recarregue a extensão (recria offscreen no próximo `ENSURE_OFFSCREEN` / job).
2. Envie um Transcrever de teste.
3. Inspecione o SW por erros ao `chrome.offscreen.createDocument`.  
**Verificar:** `JOB_STATUS` chega na aba via `tabs.sendMessage`.

### Captura sem blob

**Sintoma:** unavailable após Transcrever; log `audio blob missing`.  
**Remediação:**
1. Confirme MAIN hook ready.
2. Play manual no áudio do WhatsApp.
3. Transcrever de novo (pending/bind deve associar o blob).  
**Verificar:** log `bound blob → message` e UI saindo de unavailable.

### Transcrições sumiram na UI (dados ainda no IDB)

**Sintoma:** ao voltar ao chat, sem texto; IndexedDB ainda tem records.  
**Remediação:**
1. Recarregue a aba do WhatsApp.
2. Confirme hydrate no chat change (`forceHydrate`).
3. Se necessário, abra DevTools → Application → IndexedDB `wt-transcripts`.  
**Verificar:** cards `done` reaparecem sem reprocessar.

### Uso excessivo de disco

**Sintoma:** Cache Storage grande após vários modelos.  
**Remediação:**
1. Opções → limpar cache do modelo e/ou limpar transcrições.
2. Ou `CLEAR_MODEL_CACHE` / `CLEAR_TRANSCRIPTS` via messaging.  
**Verificar:** `GET_STORAGE_ESTIMATE` / estimativa nas opções.

## Rollback

Ver [Deploy → Rollback](deploy.md#rollback).

## Escalação

Projeto solo — sem on-call. Escalone para o mantenedor em [README → Responsáveis](../../README.md#responsáveis).

Diagnóstico de setup/dev: [Solução de problemas](solucao-de-problemas.md).
