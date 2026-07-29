---
status: accepted
date: 2026-07-28
decision-makers: Felipph Calado
---

# ADR-0002: STT in-browser com Transformers.js + Whisper

## Context and Problem Statement

O produto exige privacidade: áudio não pode ir para API de STT externa. Precisávamos de reconhecimento de fala PT-BR no Chrome.

## Considered Options

- API cloud (OpenAI Whisper API, Google STT, etc.)
- Binário nativo / Native Messaging
- **@huggingface/transformers** v3 + Whisper ONNX no Web Worker

## Decision Outcome

Chosen option: **Transformers.js + Whisper q8 no browser**, because atende privacidade e roda 100% no cliente, com WebGPU → WASM.

### Pros and Cons of the Options

#### API cloud
- Good, because qualidade/ops simples
- Bad, because áudio sai do dispositivo — viola o goal

#### Native Messaging
- Good, because performance nativa
- Bad, because instalação complexa, fora do escopo extensão-only

#### Transformers.js in-browser
- Good, because local, modelos ONNX q8, integra com offscreen/worker
- Bad, because download grande, CPU/GPU do usuário, limites WASM

## Consequences

**Positive:**
- Rede só para baixar pesos (HF); áudio permanece local

**Negative:**
- Setup obrigatório; máquinas fracas precisam `tiny`/`base` e modo compatibilidade WASM

**Neutral:**
- Catálogo `tiny|base|small|medium` em `stt/models.ts`; default `base`

## Confirmation

Transcrição funciona com DevTools Network filtrando: sem upload de áudio para hosts de STT.
