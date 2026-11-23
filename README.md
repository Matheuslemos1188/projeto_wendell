# Machine Airsoft

Painel de equipamentos de proteção, compras, estoque e manutenção. Este pacote contém o código-fonte completo em React, o CSS, a API local e o esquema PostgreSQL para Supabase.

## Abrir agora, sem Docker

Extraia o ZIP e abra **ABRIR-SEM-DOCKER.html** no Chrome ou Edge. Esta versão já está compilada em React. Ela abre com dados de exemplo e guarda as alterações no navegador. O código-fonte fica em `src/`.

## Editar e executar com Node.js

Com Node.js 22.12 ou superior, abra o PowerShell nesta pasta e rode:

```powershell
npm.cmd ci
npm.cmd run dev
```

Abra o endereço indicado no terminal. Com a configuração inicial, essa execução também usa dados de demonstração salvos no navegador. Use `npm.cmd run build` para gerar a compilação em `dist/`.

## Usar PostgreSQL sem Docker

**Supabase.** Execute `supabase/schema.sql` no SQL Editor, crie um usuário de teste com e-mail confirmado em Authentication e preencha a URL e a chave publicável em `src/client/supabase/config.js`. Execute `npm.cmd run dev` e entre com a conta criada. Para publicar essa versão, gere um novo build depois de configurar o Supabase. O workflow do GitHub Pages publica a pasta `dist/`.

**PostgreSQL local existente.** Copie `.env.example` para `.env`, ajuste `DATABASE_URL` para um banco vazio ao qual sua conta tenha acesso e rode `npm.cmd run dev:postgres`. A API local cria a tabela e insere os dados de demonstração no primeiro acesso. Se preferir iniciar o PostgreSQL por Docker, o arquivo `compose.yaml` permite executar `docker compose up -d` antes de rodar o mesmo comando.

## Estrutura

- `index.html` é a entrada que o Vite usa para montar o painel React.
- `src/client/` contém a interface React, o CSS e a integração com Supabase.
- `src/domain/` contém os dados de exemplo e as regras usadas na demonstração.
- `src/server/` contém a API da demonstração com PostgreSQL local.
- `supabase/` contém o esquema relacional, as políticas RLS e as operações de estoque.
- `docs/SPEC.md` descreve o MVP e os critérios de aceitação.
