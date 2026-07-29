# Deploy

Esta extensão não tem pipeline de staging/produção em servidor. O “deploy” é build local + instalação no Chrome (ou empacotamento futuro para a Chrome Web Store).

## Ambientes

| Ambiente | Como | Branch |
|----------|------|--------|
| Desenvolvimento | `npm run dev` + Load unpacked `dist/` | branch de feature |
| Local “release” | `npm run build` + Load unpacked `dist/` | `main` |
| Chrome Web Store | TODO: empacotar ZIP de `dist/` e publicar | tag de versão |

## Processo de release local

```bash
npm install
npm run build
```

1. Em `chrome://extensions`, clique **Atualizar** na extensão carregada (ou remova e carregue `dist/` de novo).
2. Recarregue abas abertas de `web.whatsapp.com`.
3. Confirme badge/setup: modelo ainda `ready` ou rode o setup de novo se a versão invalidar o cache.

## Checklist pré-release

- [ ] `npm run build` sem erros
- [ ] Versão alinhada em `package.json` e `manifest.config.ts`
- [ ] Smoke: setup → WhatsApp → transcrever manual sem play audível
- [ ] Smoke: toggle auto + troca de conversa (hydrate)
- [ ] Docs atualizados se houver mudança de comportamento

## Rollback

1. Faça checkout da tag/commit anterior que funcionava.
2. `npm run build`.
3. Em `chrome://extensions`, recarregue a extensão a partir do novo `dist/`.
4. Se o modelo corromper, em Opções use limpar cache do modelo e baixe de novo.

Para operação diária e incidentes, veja o [Runbook](runbook.md).
