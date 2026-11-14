# BARBERFLOW

- O repositório oficial é `https://github.com/JorgeNovoJulho/barberflow`.
- A cada implementação ou correção, valide com `npm run build` e
  `npm run typecheck`, além dos testes específicos da mudança. Revise o diff,
  crie um commit e atualize o GitHub. Confira a branch remota e preserve o
  trabalho existente. Se houver proteção de branch, use uma PR.
- Inclua migrações novas em `supabase/migrations`. Mantenha credenciais,
  arquivos locais de ambiente, dependências e resultados de compilação fora
  do Git.

- Antes de toda alteração de interface, consulte o Modern Web Guidance. Pesquise o padrão com
  "npx -y modern-web-guidance@latest search", recupere o guia aplicável com "retrieve" e
  verifique a implementação quanto à responsividade, acessibilidade e compatibilidade.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
