# Primeiros passos

Do zero até a extensão transcrevendo no WhatsApp Web.

## Pré-requisitos

| Ferramenta | Versão | Instalação |
|------------|--------|------------|
| Node.js | 20+ | https://nodejs.org |
| npm | 10+ | vem com o Node |
| Chrome / Chromium | recente (MV3) | https://www.google.com/chrome/ |

## Setup

1. Clone e instale:

```bash
git clone <repo-url>
cd whatsapp-transcriber
npm install
```

2. Build:

```bash
npm run build
```

O `prebuild` copia os arquivos WASM/JS do ONNX Runtime de `node_modules/@huggingface/transformers/dist/` para `public/ort/`.

3. Carregue a extensão:

- Abra `chrome://extensions`
- Ative **Modo do desenvolvedor**
- **Carregar sem compactação** → pasta `dist/` (não a raiz do repo)

4. Desenvolvimento contínuo (opcional):

```bash
npm run dev
```

Recarregue a extensão em `chrome://extensions` e a aba do WhatsApp Web após mudanças relevantes.

## Verificar que funciona

1. Na instalação, a página de setup deve abrir sozinha.
2. Escolha **Base** (recomendado) → **Baixar e preparar**.
3. Espere o status **Modelo carregado e pronto** (badge verde `✓` no ícone).
4. Abra `https://web.whatsapp.com`, entre em uma conversa com áudio.
5. Clique **Transcrever** em um balão (ou confie no auto se o toggle do popup estiver ligado).
6. O texto deve aparecer sob o áudio; use o ícone de copiar se quiser.

No DevTools da aba do WhatsApp (console), logs com prefixo `[wt]` indicam captura de blob e bind por mensagem.

## Testes

Não há `npm test` ainda. Use o checklist em [CONTRIBUTING.md](../CONTRIBUTING.md).

Typecheck:

```bash
npx tsc --noEmit
# ou
npm run build
```

## Problemas comuns

**Extensão não aparece / erros ao carregar**
Cause: pasta errada. Fix: carregue `dist/`, rode `npm run build` de novo.

**WASM / CSP bloqueando o modelo**
Cause: CSP sem `'wasm-unsafe-eval'`. Fix: não remova o CSP de `manifest.config.ts`; rebuild.

**“Áudio ainda não disponível”**
Cause: blob ainda não materializado pelo WhatsApp. Fix: toque play uma vez no áudio e clique Transcrever de novo (a extensão não dá play sozinha).

**Setup não abre**
Cause: instalação/atualização sem `onInstalled`. Fix: remova e recarregue a extensão, ou abra setup pelo popup/options.

Mais diagnóstico: [Solução de problemas](guias/solucao-de-problemas.md).
