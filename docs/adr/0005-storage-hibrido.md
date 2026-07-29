---
status: accepted
date: 2026-07-28
decision-makers: Felipph Calado
---

# ADR-0005: IndexedDB para transcrições; storage.local para config

## Context and Problem Statement

Transcrições podem crescer e ultrapassar a quota prática de `chrome.storage.local` (~10MB). Config (modelo, prefs, progresso) precisa de API simples e `onChanged` para UI.

## Considered Options

- Tudo em `chrome.storage.local`
- Tudo em IndexedDB
- **Híbrido:** config em `storage.local`, transcripts em IndexedDB

## Decision Outcome

Chosen option: **híbrido**, because encaixa quotas e padrões de observação (`onChanged` para popup/options; IDB para volume).

### Pros and Cons of the Options

#### Só storage.local
- Good, because API única
- Bad, because quota e serialização pesada de textos longos

#### Só IndexedDB
- Good, because escala
- Bad, because UI de setup/popup precisa de mais boilerplate; offscreen já usa IDB para transcripts

#### Híbrido
- Good, because cada store no seu ponto forte
- Bad, because dois mecanismos para o desenvolvedor lembrar

## Consequences

**Positive:**
- Config reativa via `onConfigChange`; transcripts por `messageId` em `wt-transcripts`

**Negative:**
- Offscreen sem `chrome.storage` — SW espelha lifecycle do modelo

**Neutral:**
- Limpeza separada: `CLEAR_TRANSCRIPTS` vs `CLEAR_MODEL_CACHE`

## Confirmation

Muitas transcrições não corrompem config; `getTranscript` / hydrate após chat switch funcionam.
