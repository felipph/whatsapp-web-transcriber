# Solução de problemas

Guia diagnóstico (desenvolvimento e uso). Remediação operacional passo a passo: [Runbook](runbook.md).

## Build e carregamento

**`npm run build` falha no `prebuild` (ORT não encontrado)**  
Cause: `node_modules` incompleto ou versão do Transformers sem os arquivos WASM esperados.  
Fix: `npm install` e confira paths em `package.json` → script `prebuild`.

**Chrome rejeita a extensão ao carregar**  
Cause: pasta raiz em vez de `dist/`, ou manifest inválido.  
Fix: carregue `dist/` após `npm run build`.

**Erro de CSP / WASM compile**  
Cause: falta `'wasm-unsafe-eval'` ou tentativa de COOP/COEP.  
Fix: mantenha o CSP atual; **não** habilite COOP/COEP (ver [ADR-0004](../adr/0004-sem-coop-coep.md)).

## Modelo e setup

**Download do modelo trava ou erro**  
Cause: rede/HF bloqueado, permissões de host, disco cheio.  
Fix: confira `host_permissions` no manifest; tente de novo; limpe cache do modelo nas Opções.

**Status fica em downloading/loading para sempre**  
Cause: offscreen morreu ou SW não recebeu `READY`.  
Fix: reload da extensão; veja [Runbook → Offscreen morto](runbook.md).

## Captura e UI no WhatsApp

**Clicar Transcrever dá play no áudio**  
Cause: regressão do fallback `silentPrimeBubble` (removido).  
Fix: confirme que `obtainBlobForMessage` não chama play; rebuild.

**“Áudio ainda não disponível”**  
Cause: blob ainda não existe / não bindado ao `messageId`.  
Fix: play manual uma vez no WhatsApp → Transcrever de novo. Confira logs `[wt] captured audio blob` / `bound blob`.

**Mesmo texto em vários balões**  
Cause: bind global ao “último blob”.  
Fix: use sempre `blobByMessageId` / `messageId`; nunca fallback cross-message.

**FAB pisca / clique não registra**  
Cause: re-render no hover via MutationObserver + `transform`.  
Fix: `data-wt-sig` skip + observer ignora `.wt-root` + clique em `pointerdown` (já no código).

**UI some ao trocar de conversa**  
Cause: observer só em `#main` antigo ou hydrate fraco.  
Fix: observer em `document.body` + `forceHydrate` no chat change.

**UI fica em “Na fila…” para sempre**  
Cause: `JOB_STATUS` não chegou no content script (`runtime.sendMessage` não entrega a content scripts).  
Fix: SW deve usar `chrome.tabs.sendMessage` (já implementado).

## Privacidade / rede

**Áudio saindo da máquina?**  
Cause: não deveria — STT é local. Rede esperada: download do modelo HF + tráfego normal do WhatsApp.  
Fix: inspecione Network na extensão/offscreen; não adicione endpoints de STT cloud.
