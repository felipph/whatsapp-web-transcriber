# WhatsApp Web Transcriber

Extensão Chrome (Manifest V3) que transcreve áudios do **WhatsApp Web** 100% no browser com Whisper (Transformers.js). Privacidade primeiro: o áudio não sai do seu PC.

## Desenvolvimento

```bash
npm install
npm run dev
```

Em `chrome://extensions`, ative o **Modo do desenvolvedor** e carregue a pasta `dist/` (ou a que o Vite/CRXJS indicar no terminal).

```bash
npm run build
```

Carregue `dist/` como extensão não empacotada.

## Uso

1. Na instalação, a página de **setup** abre automaticamente.
2. Escolha o modelo Whisper (`tiny` / `base` recomendado / `small` / `medium`) e clique em **Baixar e preparar**.
3. Quando aparecer **Modelo carregado e pronto**, abra o WhatsApp Web.
4. Áudios novos são transcritos automaticamente (toggle no popup). Histórico: botão **Transcrever** em cada balão.

## Privacidade

- STT local (WebGPU ou WASM).
- Rede apenas para download do modelo (Hugging Face) e o tráfego normal do WhatsApp.
- Transcrições em IndexedDB; modelo em Cache Storage; config em `chrome.storage.local`.

Detalhes em [`docs/plano-whatsapp-web-transcriber.md`](docs/plano-whatsapp-web-transcriber.md).
