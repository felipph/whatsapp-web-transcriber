---
status: accepted
date: 2026-07-28
decision-makers: Felipph Calado
---

# ADR-0004: Sem COOP/COEP no manifest (ORT com numThreads 1)

## Context and Problem Statement

Whisper/ONNX Runtime se beneficia de `SharedArrayBuffer` via cross-origin isolation (COOP/COEP). Em extensões Chrome, isso faz o ORT criar workers `blob:`, bloqueados pelo CSP de extension pages.

## Considered Options

- Habilitar COOP/COEP no manifest
- Servir workers via `chrome-extension://` + `numThreads: 1` e WASM local em `public/ort/`
- Remover WASM e usar só WebGPU (sem fallback)

## Decision Outcome

Chosen option: **não habilitar COOP/COEP**; usar **WASM paths locais** e **`numThreads: 1`**, because é o único caminho estável sob CSP MV3 com `'wasm-unsafe-eval'`.

### Pros and Cons of the Options

#### COOP/COEP
- Good, because SAB / multithread
- Bad, because `blob:` workers bloqueados → STT quebra

#### WASM local + single thread
- Good, because funciona no CSP da extensão
- Bad, because mais lento que multithread

#### Só WebGPU
- Good, because rápido quando disponível
- Bad, because sem fallback em máquinas sem WebGPU

## Consequences

**Positive:**
- Load do modelo e inferência WASM funcionam de forma previsível

**Negative:**
- Inferência WASM single-thread mais lenta

**Neutral:**
- Comentário explícito no `manifest.config.ts` para não reintroduzir COOP/COEP

## Confirmation

`npm run build` + load modelo em Chrome estável sem erros de worker/`blob:` no console do offscreen.
