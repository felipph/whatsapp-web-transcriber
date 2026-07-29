---
status: accepted
date: 2026-07-28
decision-makers: Felipph Calado
---

# ADR-0003: Captura de áudio via hook MAIN world (sem play programático)

## Context and Problem Statement

O `<audio>` do WhatsApp aponta para `blob:` criado no **main world**. O content script isolated não tem o `Blob`. Dar play para forçar carga vazava áudio audível e atrapalhava UX.

## Considered Options

- Clicar play (mute + pause) como fallback
- Pedir ao usuário sempre dar play antes
- Hook `URL.createObjectURL` / fetch / XHR no **world: MAIN** + bind por `messageId`

## Decision Outcome

Chosen option: **hook MAIN + fetch do src + bind por mensagem; nunca play programático**, because captura silenciosa quando o WA materializa o blob, e falha de forma honesta (“Áudio ainda não disponível”) quando não materializou.

### Pros and Cons of the Options

#### Play programático
- Good, because força o WA a carregar mídia
- Bad, because playback audível vaza na prática; frágil com DOM do WA

#### Só play manual do usuário
- Good, because previsível
- Bad, because pior UX no caminho feliz quando o blob já existe

#### Hook MAIN + fetch
- Good, because silencioso e alinhado ao pipeline real do WA
- Bad, because depende de seletores/hooks e pode falhar após updates do WA

## Consequences

**Positive:**
- Transcrever/auto não disparam áudio

**Negative:**
- Casos sem blob exigem um play manual do usuário antes do retry

**Neutral:**
- Auto pode `claimUnclaimed`; manual permanece escopado ao `messageId`/pending

## Confirmation

Clique em Transcrever com volume alto: nenhum áudio deve tocar; logs `[wt] captured` / `bound blob` no caminho feliz.
