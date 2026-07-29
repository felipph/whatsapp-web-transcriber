# Configuração

## Fontes de configuração

Não há `.env`. A configuração do usuário vive em **`chrome.storage.local`**, acessada por `src/shared/storage.ts`.

Precedência efetiva:

1. Valores gravados em `chrome.storage.local`
2. Defaults em `DEFAULTS` (`storage.ts`) — ex.: `modelKey: 'base'`, `autoTranscribe: true`

Manifest (`manifest.config.ts`) define permissões, hosts e CSP — não é config de runtime do usuário.

Modelos disponíveis: catálogo estático em `src/stt/models.ts`.

## Referência completa

Ver [Configuração / storage](../referencia/variaveis-de-ambiente.md) para todas as chaves.

## Desenvolvimento

- Use Opções ou Popup para toggles e troca de modelo.
- Logs `[wt]` no console da aba do WhatsApp ajudam a depurar captura.
- Após editar `manifest.config.ts`, rebuild + reload da extensão é obrigatório.

## “Produção” (uso real no Chrome)

- Modelo permanece em Cache Storage do contexto da extensão.
- Transcrições em IndexedDB `wt-transcripts`.
- Limpeza: Opções → limpar transcrições / limpar cache do modelo.
