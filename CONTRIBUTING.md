# Contribuindo

## Workflow de desenvolvimento

1. Crie um branch a partir de `main`:

```bash
git checkout -b feat/descricao-curta
```

2. Faça as mudanças, rode typecheck/build e teste na extensão carregada a partir de `dist/`:

```bash
npm run build
```

3. Abra um Pull Request descrevendo o problema, a solução e como testar no WhatsApp Web.

## Estilo de código

- TypeScript strict (`tsconfig.json`).
- Sem scripts de lint/format no projeto ainda — mantenha o estilo dos arquivos vizinhos.
- Strings de UI em PT-BR; identificadores de código em inglês.
- Prefira mudanças cirúrgicas: não refatore arquivos não relacionados ao PR.

## Mensagens de commit

Prefira Conventional Commits curtos, em PT-BR ou EN:

- `feat(content): evitar play no fallback de captura`
- `fix(ui): eliminar flicker do FAB no hover`
- `docs: adicionar runbook`

## Testes

Não há suite automatizada ainda. Checklist mínimo antes do PR:

- [ ] `npm run build` passa
- [ ] Setup baixa modelo e chega em “pronto”
- [ ] Transcrever manual **não** dá play audível no áudio
- [ ] Auto (toggle ligado) processa os últimos áudios sem autoplay
- [ ] Trocar de conversa e voltar: UI/transcrições reaparecem (hydrate IndexedDB)
- [ ] Popup/options refletem status do modelo

## Code review

- PRs devem ser revisáveis: um tema por PR quando possível.
- Chame atenção para mudanças em `manifest.config.ts`, CSP, captura de áudio e fila offscreen — são as áreas de maior risco.
- Documente gotchas novos em `AGENTS.md` se um agente/humano puder tropeçar de novo.

Mais contexto: [Arquitetura](docs/arquitetura.md), [ADRs](docs/adr/).
