---
status: accepted
date: 2026-07-28
decision-makers: Felipph Calado
---

# ADR-0001: Fila de transcrição no documento offscreen

## Context and Problem Statement

O service worker MV3 é efêmero (~30s idle) e não pode manter de forma confiável uma fila longa de jobs Whisper. Precisávamos de um contexto persistente na extensão para decode + worker.

## Considered Options

- Manter a fila no service worker
- Manter a fila no content script da aba WhatsApp
- Documento **offscreen** como dono da fila e do worker

## Decision Outcome

Chosen option: **offscreen document**, because sobrevive ao idle do SW e isola CPU/WASM fora da página do WhatsApp.

### Pros and Cons of the Options

#### Fila no service worker
- Good, because API central simples
- Bad, because o SW morre e perde fila/estado

#### Fila no content script
- Good, because perto do DOM
- Bad, because some ao fechar a aba; compete com a página; sem worker pesado ideal

#### Offscreen
- Good, because persistente com reason `WORKERS`, centraliza decode+Whisper
- Bad, because `chrome.storage` não está disponível — lifecycle precisa relay no SW

## Consequences

**Positive:**
- Fila serial com prioridade manual > auto vive em um só lugar (`stt/queue.ts` no offscreen)

**Negative:**
- SW deve criar/garantir offscreen e persistir eventos `PROGRESS`/`READY` no storage

**Neutral:**
- Protocolo tipado com `_to: 'offscreen'`

## Confirmation

Jobs longos continuam após idle do SW; `PING_OFFSCREEN` / jobs de teste respondem após reload parcial do SW.
