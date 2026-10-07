# TempControl — auditoria e arquitetura do MVP

## Baseline preservado

O componente local foi copiado, sem alterações funcionais, para `src/LocalApp.jsx`.
`src/history.js` continua responsável pela recuperação e migração das chaves
locais. O arquivo dos 29 testes originais, `src/App.test.jsx`, não foi alterado.
SHA-256 do baseline: `8A029764500CEDCACD178C5265706F2346B69A5F57A53A7E1BDD4BE390297183`.

## Auditoria

| Área | Baseline | Implementação desta etapa |
| --- | --- | --- |
| Identidade | Sem login ou responsável | Supabase Auth: cadastro, confirmação, login, recuperação e logout |
| Restaurante | Sem vínculo | Um restaurante por usuário; proprietário e equipe |
| Equipamentos | Três itens fixos | Cadastro, edição de limites e inativação pelo proprietário |
| Medições | localStorage por navegador | PostgreSQL; sem fallback local em caso de falha |
| Isolamento | Sem conceito de restaurante | RLS e privilégios de coluna em todas as tabelas públicas |
| Integridade | Validação no formulário | Validação também no banco; snapshots e status gerados no servidor |
| Histórico | Sem autoria; data local | Horário UTC do servidor, equipamento e responsável; paginação |
| Celular | Estilos genéricos do template | Campos e botões acessíveis, layout fluido e limites em duas colunas |
| Rede | Sem estados assíncronos | Loading, erro, retry, confirmação de escrita e sucesso |
| Produção | Sem configuração de backend | .env.example, migrations, verificação de ambiente, CI e Netlify |

## Arquitetura

```text
App
├── Supabase configurado → RestaurantApp (sessão)
│   ├── AuthForm (login/cadastro/recuperação)
│   └── Dashboard (carregamento do restaurante)
│       ├── RestaurantSetup (primeiro vínculo)
│       ├── Formulário e histórico de medições
│       ├── EquipmentManager (proprietário)
│       └── TeamManager (proprietário)
├── Sem configuração, desenvolvimento → baseline LocalApp, com aviso
└── Sem configuração, produção → tela de configuração; nunca modo local

Interface → restaurantRepository → cliente oficial supabase-js
         → Supabase Auth + PostgREST → grants/RLS/triggers → PostgreSQL
```

A autorização não depende dos controles escondidos na interface. RLS consulta
o vínculo atual usando `auth.uid()`, e não um restaurante ou papel vindos de
localStorage, metadados editáveis ou parâmetros do navegador.

O callback de Auth é síncrono; requisições são feitas fora dele. Eventos de logout
invalidam respostas antigas de sessão, e a troca de usuário remonta o dashboard.
O SDK pode persistir a **sessão de autenticação** no navegador; as **medições**
do modo Supabase ficam exclusivamente no banco.

## Schema

| Tabela | Campos principais | Regras |
| --- | --- | --- |
| `auth.users` | UUID, e-mail, credenciais | Gerenciada pelo Supabase Auth; sem exposição pública |
| `restaurants` | UUID, nome, timezone, created_at | Leitura somente pelo restaurante do usuário |
| `restaurant_members` | user_id, restaurant_id, display_name, role | Um vínculo por usuário; papéis owner/staff; sem escrita direta pelo cliente |
| `equipment` | UUID, restaurant_id, nome, minimum, maximum, active | Números finitos, mínimo ≤ máximo; proprietário cria/edita; sem exclusão |
| `measurements` | UUID, restaurant_id, equipment_id, recorded_by, temperature, snapshots, status, recorded_at | Histórico imutável; leitura/escrita somente do próprio restaurante |

Os limites são inclusivos. Temperaturas fora do intervalo são aceitas e recebem
`alerta`; valores não numéricos, NaN e infinitos são rejeitados. Colunas double
precision têm a mesma representação de números finitos do JavaScript, sem
arredondamento para um número fixo de casas na entrada.

O navegador só pode inserir `id`, `equipment_id` e `temperature`. O trigger
`private.prepare_measurement` busca um equipamento ativo do restaurante do
usuário autenticado e preenche restaurante, responsável, nomes, limites e horário.
O status é uma coluna gerada. Um bloqueio de leitura no equipamento serializa
alterações concorrentes de limites durante a captura do snapshot.

Os campos `equipment_name`, `responsible_name`, `minimum` e `maximum` preservam
o contexto histórico mesmo depois de editar o equipamento. FKs compostas impedem
cruzar equipamento, responsável e restaurante; índices suportam o histórico.

O UUID do envio é reutilizado após uma resposta incerta de rede. A chave primária
impede duplicação. Ao receber conflito, o repositório só considera o envio bem
sucedido se o registro existente tiver o mesmo responsável, equipamento e valor.

## Funções e permissões

- `create_restaurant(p_name, p_display_name)`: cria restaurante e vínculo owner
  atomicamente para o próprio usuário, somente se ainda não tiver vínculo.
- `add_restaurant_member(p_email, p_display_name)`: somente owner; associa uma
  conta existente e confirmada como staff. Não aceita restaurante, papel ou UUID
  do ator enviados pelo navegador; não transfere contas já vinculadas.
- Helpers de autorização ficam no schema privado, com `search_path = ''`,
  referências qualificadas e grants restritos.
- Owner: lê dados do restaurante, registra medições, configura equipamentos e
  associa contas. Staff: lê dados do restaurante e registra medições.
- Anônimo: sem acesso às tabelas nem às funções de vínculo.
- Nem owner nem staff podem editar/apagar medições ou escrever vínculos
  diretamente. Chaves privadas jamais participam do frontend.

## Testes e alcance da verificação

`npm test` executa o baseline, testes de interface, o contrato HTTP com o cliente
oficial Supabase e a migration em PostgreSQL embarcado (PGlite). Os testes SQL
executam grants, RLS, triggers e constraints de verdade sob roles diferentes.
Somente o schema Auth e a função `auth.uid()` fornecidos pelo Supabase são
simulados a partir da claim de sessão; não são mocks das políticas da aplicação.

Testes de interface usam serviços controlados para testar erros/loading/retry
sem depender da rede. Isso não substitui o teste final de e-mail e autenticação
em um projeto Supabase real, descrito em DEPLOY.md.

`scripts/verify-mvp-browser.mjs` verifica o app no Chrome instalado com viewport
375×812 e HTTP controlado, usando o SDK real. Confere login, alerta/normal,
reload, ausência de medições em localStorage, logout e overflow. A ferramenta
opcional fica isolada: `npm install --prefix .verification-tools --no-save
--package-lock=false playwright`. O servidor de teste deve usar porta 4175,
URL `https://tempcontrol-smoke.example` e chave pública sintética
`sb_publishable_smoke_only`; as requisições desse host são interceptadas pelo
script. Não use esse fixture como configuração de produção. Evidências ficam
em `verification/mvp-browser.json` e `verification/mvp-mobile-*.png`.

O pool continua `vmThreads`, com um único worker. Nenhum dos 29 testes originais
foi removido, enfraquecido ou ignorado. `.env.local` não é usado para conectar
testes a projetos reais.

## Limites intencionais

Sem modo offline no fluxo Supabase, sem sensores, relatórios, notificações,
faturamento, múltiplos restaurantes por usuário ou edição retroativa de medições.
O timezone inicial é America/Sao_Paulo e o histórico mostra explicitamente esse
fuso. A hora de origem é a do servidor, não a do celular.

Os registros locais antigos não contêm restaurante nem responsável autenticado.
Continuam intactos no navegador; não são atribuídos automaticamente a um usuário
real. Uma eventual importação auditável desses registros exige definir sua
proveniência, fora desta etapa.

Backups, retenção, restauração e revogação administrativa de contas devem ser
definidos pelo operador do restaurante no Supabase. Exclusões de usuários ou
equipamentos referenciados são bloqueadas para preservar a trilha histórica.

## Arquivos desta etapa

| Área | Arquivos adicionados/alterados |
| --- | --- |
| Entrada e visual | `src/App.jsx`, `src/LocalApp.jsx` (cópia preservada), `src/App.css`, `index.html` |
| Autenticação e telas | `src/cloud/RestaurantApp.jsx`, `AuthForm.jsx`, `RestaurantSetup.jsx`, `Dashboard.jsx`, `EquipmentManager.jsx`, `TeamManager.jsx` |
| Acesso a dados e validação | `src/lib/supabase.js`, `config.js`, `restaurantRepository.js`, `validation.js` |
| Testes novos | `src/cloud/AuthForm.test.jsx`, `Dashboard.test.jsx`, `src/lib/validation.test.js`, `restaurantRepository.test.js`, `supabase/tests/rls.test.js` |
| Supabase | `supabase/config.toml`, `supabase/migrations/20261007000100_restaurant_mvp.sql` |
| Build e deploy | `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `vite.config.js`, `vitest.config.js`, `netlify.toml`, `.github/workflows/ci.yml`, `scripts/check-env.mjs` |
| Documentação e QA | `README.md`, `docs/MVP.md`, `docs/DEPLOY.md`, `scripts/verify-mvp-browser.mjs`, relatórios/capturas `verification/mvp-*` |

`src/App.test.jsx`, `src/history.js`, `src/main.jsx` e `src/index.css` foram preservados.
Alterações já existentes em `.vscode/extensions.json` não foram tocadas.

## Resultados finais

- `npm test`: **98 aprovados, 0 falhas, 0 ignorados**, em 6 arquivos.
  Inclui 29 do baseline, 14 de validação/configuração, 22 SQL, 27 de interface
  e 6 do contrato HTTP com o cliente oficial Supabase.
- `npm run lint`: código 0, sem erros.
- `npm run build`: código 0; Vite 8.3.2; bundle principal 453.47 kB
  (129.24 kB gzip). Nenhuma variável real do Supabase foi incluída nesse build.
- SHA-256 dos 29 testes preservados confirmado após a implementação.
- Chrome 154, viewport 375×812: login, gravação normal/alerta, reload,
  logout, ausência de overflow e legibilidade com preferência escura passaram.
  Zero medições em localStorage e zero erros não tratados na página.
- SQL/RLS foi executado em PostgreSQL embarcado; navegador usou HTTP controlado.
  Aplicação remota da migration, e-mail real e deploy continuam como ações manuais
  descritas em `docs/DEPLOY.md`.

Evidências: `verification/mvp-tests.json`, `verification/mvp-browser.json`
e `verification/mvp-mobile-*.png`.
