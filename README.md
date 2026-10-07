# TempControl

O TempControl é um sistema web para restaurantes destinado ao registro e ao acompanhamento das temperaturas de equipamentos como geladeiras, freezers e câmaras frias. O projeto busca substituir controles manuais em papel por registros digitais organizados e rastreáveis, com identificação do equipamento, do responsável e do momento de cada medição.

## Problema que o projeto resolve

Na rotina de um restaurante, anotações em papel podem ficar dispersas, dificultar a consulta ao histórico e tornar menos visíveis as temperaturas fora dos limites definidos. O TempControl reúne esses registros em uma interface compartilhada pela equipe, relacionando cada medição ao restaurante e destacando os valores que exigem atenção.

## Funcionalidades atuais

No modo integrado ao Supabase, estão implementados:

- Autenticação por e-mail e senha, cadastro, fluxo de confirmação de e-mail, recuperação de senha e logout.
- Criação de restaurante e associação de contas confirmadas à equipe pelo proprietário.
- Papéis de proprietário (`owner`) e funcionário (`staff`), com um restaurante por usuário.
- Cadastro e edição de equipamentos, configuração de limites mínimo/máximo e ativação ou inativação pelo proprietário.
- Registro de temperaturas numéricas finitas, incluindo valores negativos e decimais, em equipamentos ativos.
- Identificação visual de medições normais e fora dos limites. Os limites são inclusivos; valores fora do intervalo são registrados com status de alerta.
- Persistência das medições no PostgreSQL e histórico paginado com equipamento, temperatura, limites, responsável, data e hora.
- Preservação dos nomes e limites vigentes no momento da medição, mesmo após alterações no equipamento.
- Isolamento dos dados entre restaurantes com Row Level Security (RLS) e permissões no banco.
- Interface responsiva, rótulos associados aos campos e mensagens de carregamento, erro e sucesso.

O histórico não permite edição ou exclusão pelo cliente. A associação de membros utiliza contas já cadastradas e confirmadas; não há envio de convites ou transferência de contas entre restaurantes pela interface.

## Tecnologias utilizadas

As faixas abaixo são as declaradas no `package.json`; o `package-lock.json` registra as versões resolvidas para instalações reproduzíveis.

| Tecnologia | Versão declarada / uso |
| --- | --- |
| React e React DOM | `^19.2.8` — interface e estado dos componentes. |
| Vite | `^8.3.0` — servidor de desenvolvimento e build. |
| JavaScript, HTML e CSS | Código da aplicação, sem TypeScript. |
| Supabase JavaScript SDK | `^2.117.3` — integração com Auth, Data API e funções RPC. |
| Supabase Auth | Cadastro, sessão, login e recuperação de senha. |
| PostgreSQL e RLS | Persistência, integridade, autorização e isolamento por restaurante. |
| Vitest | `^4.1.11` — execução dos testes automatizados. |
| React Testing Library | `^16.3.3` — testes de comportamento da interface. |
| PGlite | `^0.5.8` — PostgreSQL embarcado para testar migration e RLS. |
| ESLint | `^10.10.0` — análise estática. |

O desenvolvimento e a CI estão documentados/configurados para **Node.js 24**. A versão do PostgreSQL hospedado depende do projeto Supabase criado.

## Arquitetura

```text
React
  ↓
Supabase Auth / API
  ↓
PostgreSQL
  ↓
Row Level Security (RLS)
```

- **React:** apresenta formulários, equipamentos e histórico, valida entradas e informa o resultado das operações.
- **Supabase Auth / API:** autentica o usuário e permite consultas, gravações e chamadas RPC pelo SDK oficial.
- **PostgreSQL:** armazena restaurantes, membros, equipamentos e medições. Constraints, funções e um trigger garantem integridade e preenchem os dados de auditoria no servidor.
- **RLS:** aplica a autorização dentro do PostgreSQL em cada operação, com base no usuário autenticado e no seu vínculo com o restaurante. Não é um serviço separado do banco.

As tabelas de domínio são `restaurants`, `restaurant_members`, `equipment` e `measurements`; as identidades são gerenciadas em `auth.users`. O SDK pode persistir a sessão no navegador, mas as medições do modo Supabase ficam no banco, sem fallback para armazenamento local em caso de falha.

Veja a [auditoria, arquitetura e schema](docs/MVP.md) para os detalhes técnicos.

## Como executar localmente

### 1. Clonar e instalar

Tenha Git, Node.js 24 e npm disponíveis:

```sh
git clone https://github.com/romulomax47/tempocontrol.git tempcontrol
cd tempcontrol
npm install
```

O argumento `tempcontrol` define o nome da pasta local; o repositório no GitHub se chama `tempocontrol`. Para instalar exatamente as versões do lockfile, utilize `npm ci` no lugar de `npm install`.

### 2. Configurar o ambiente

Para utilizar o backend real, configure um projeto Supabase conforme o [guia de configuração](docs/SUPABASE_SETUP.md), incluindo as migrations e o Auth.

Copie `.env.example` para `.env.local` na raiz do projeto. No PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Se o arquivo já existir, edite-o sem sobrescrever sua configuração. Preencha somente estas variáveis públicas, usando valores do **mesmo projeto Supabase**:

```dotenv
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
```

| Variável | Valor esperado |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL HTTPS do Supabase. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável `sb_publishable_...`. O código também aceita o JWT legado de papel `anon`. |

Os valores acima são exemplos, não credenciais. `.env.local` é ignorado pelo Git. Reinicie o servidor de desenvolvimento ao alterar as variáveis.

Valide o formato da configuração:

```sh
npm run check:env
```

Esse comando verifica a configuração pública; não testa conectividade, migrations ou login no projeto remoto.

### 3. Iniciar a aplicação

```sh
npm run dev
```

A URL padrão do Vite é **http://localhost:5173**. Caso a porta esteja ocupada, confira a URL informada no terminal. Cadastre a origem efetivamente utilizada nas Redirect URLs do Supabase.

Sem as duas variáveis, o desenvolvimento mantém disponível o modo local anterior, com equipamentos de demonstração e histórico no navegador. Esse modo não oferece autenticação ou dados compartilhados, e não importa automaticamente suas medições para o Supabase. Em produção, a ausência de configuração mostra uma tela de configuração e não habilita o modo local.

## Supabase

É necessário possuir um projeto Supabase configurado para utilizar autenticação e persistência compartilhada. **Aplique as migrations antes de utilizar o backend real**; elas criam tabelas, índices, permissões, políticas RLS, funções e trigger.

O passo a passo, incluindo a CLI, SMTP, confirmação de e-mail, URLs de redirecionamento e testes entre dois restaurantes, está em [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

`supabase/config.toml` configura apenas o ambiente local. Aplicar migrations com `db push` não configura o Auth ou o SMTP do projeto hospedado. No primeiro acesso, o proprietário cria seu restaurante; os funcionários criam e confirmam suas contas antes de serem associados por ele.

## Scripts disponíveis

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia o servidor Vite de desenvolvimento. |
| `npm run build` | Gera o build de produção em `dist/`. |
| `npm run preview` | Serve o build localmente para conferência; não substitui hospedagem de produção. |
| `npm run lint` | Executa o ESLint. |
| `npm test` | Executa toda a suíte Vitest uma vez. |
| `npm run test:db` | Executa os testes da migration e de RLS com PostgreSQL embarcado. |
| `npm run check:env` | Valida as variáveis públicas necessárias ao deploy. |

## Testes

Execute a suíte completa:

```sh
npm test
```

Para verificar especificamente as regras do banco:

```sh
npm run test:db
```

A suíte cobre comportamento da interface, autenticação com respostas controladas, validação, histórico local, operações do repositório e integridade/isolamento da migration no PostgreSQL embarcado. Não exige Docker nem credenciais remotas e não acessa um projeto Supabase real.

O Vitest usa `vmThreads` com um único worker. Neste ambiente Windows, os pools `forks` e `threads` excederam o timeout de inicialização antes de carregar os testes. A configuração atual executa a suíte sem desativar testes ou assertions. Para investigar a inicialização:

```sh
node scripts/diagnose-vitest.mjs
```

### Verificação opcional no navegador

Para repetir a verificação do **histórico local**, utilize Chrome instalado e execute o Vite sem configuração Supabase, na porta esperada pelo script:

```sh
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

Em outro terminal, a ferramenta opcional Playwright pode ser instalada sem adicioná-la ao manifesto ou ao lockfile:

```sh
npm install --no-save --package-lock=false playwright
node scripts/verify-browser-history.mjs
```

Esse script usa um contexto novo com dados sintéticos, registra medições e compara o histórico após recarregar. As evidências ficam em `verification/`.

O script `scripts/verify-mvp-browser.mjs` verifica a interface móvel com o SDK Supabase e respostas HTTP controladas; possui requisitos próprios de ferramenta e servidor descritos na [auditoria do MVP](docs/MVP.md). Nenhuma dessas verificações substitui o [checklist com Supabase real](docs/SUPABASE_SETUP.md#6-checklist-end-to-end-no-supabase-real).

## Segurança

- RLS restringe leituras e escritas ao restaurante do usuário autenticado; funções e grants também limitam operações por papel e por coluna.
- O servidor determina restaurante, responsável, horário, limites históricos e status das medições. A autorização não depende apenas dos controles exibidos na interface.
- Não envie secrets, arquivos de ambiente preenchidos, senhas do banco, tokens de sessão ou credenciais SMTP ao repositório.
- **Service Role Key e chaves `sb_secret_*` nunca devem ser utilizadas no frontend.** Variáveis `VITE_*` são incorporadas ao JavaScript público.
- Mantenha o schema `private` fora dos schemas expostos pela Data API e valide o isolamento com sessões de restaurantes diferentes antes de operar.

## Estrutura do projeto

```text
tempcontrol/
├── .github/workflows/     # Verificações automatizadas na CI
├── docs/                  # Arquitetura, Supabase e deploy
├── scripts/               # Ambiente, diagnóstico e verificações no navegador
├── src/
│   ├── assets/            # Recursos visuais
│   ├── cloud/             # Autenticação, restaurante, equipe e equipamentos
│   ├── lib/               # Cliente Supabase, repositório e validações
│   ├── App.jsx            # Seleção entre Supabase e modo local
│   ├── LocalApp.jsx       # Interface local de desenvolvimento
│   └── history.js         # Recuperação e persistência do histórico local
├── supabase/
│   ├── migrations/        # Schema, funções, trigger e RLS
│   └── tests/             # Testes de integração SQL
├── verification/          # Relatórios e capturas de verificações
├── .env.example           # Modelo de configuração pública
├── netlify.toml           # Build e hospedagem estática
└── package.json           # Dependências e scripts
```

Os testes de interface e serviços também ficam junto aos arquivos de `src/`.

## Histórico local de desenvolvimento e recuperação

Esta seção se aplica somente ao modo local. A chave canônica é `tempcontrol_medicoes`. Na abertura, registros válidos dela e de `Tempcontrol_medicoes` são reunidos. Cópias iguais entre as chaves são deduplicadas pelos campos da medição; repetições dentro de uma mesma origem são preservadas. A chave antiga permanece como fonte de recuperação.

JSON corrompido e listas com registros inválidos geram aviso. Antes de substituir dados danificados, o conteúdo original é preservado em `<chave>.backup`. Um backup diferente já existente não é sobrescrito: nesse caso, a gravação é bloqueada e a interface avisa. Somente registros válidos são exibidos.

Se a leitura do armazenamento falhar, nenhuma chave é sobrescrita. Falhas de gravação mantêm as medições na sessão e exibem aviso; esses registros não sobrevivem a uma recarga. Reabra a página depois de restabelecer o acesso ao armazenamento.

Sem identificadores nas medições antigas, cópias com todos os campos iguais entre as duas chaves são consideradas a mesma medição. O armazenamento é local ao navegador, sem sincronização entre dispositivos ou abas simultâneas.

## Deploy e documentação

O build gera arquivos estáticos em `dist/`. Configure as variáveis públicas antes de compilar e utilize HTTPS com fallback SPA. O `netlify.toml` já define o comando `npm run check:env && npm run build`, a saída e headers básicos. Alterar variáveis na hospedagem exige novo build/deploy.

O build sem variáveis é permitido para verificações em CI, mas não habilita o backend em produção. A CI executa instalação reproduzível, testes, lint e build; não aplica migrations nem publica automaticamente.

- [Configuração do Supabase e aceite real](docs/SUPABASE_SETUP.md)
- [Auditoria, arquitetura e schema](docs/MVP.md)
- [Configuração e deploy](docs/DEPLOY.md)

## Status do projeto

O TempControl está em fase **MVP**, em validação e preparação para testes em ambiente real. A implementação e as verificações locais não substituem o aceite do Supabase hospedado, da entrega de e-mails e do uso operacional por um restaurante.

## Roadmap

### Implementado

- [x] Autenticação e vínculo entre usuários e restaurante.
- [x] Gestão de equipamentos e limites pelo proprietário.
- [x] Registro de temperaturas, alertas e histórico com responsável.
- [x] Persistência PostgreSQL, políticas RLS e testes automatizados.
- [x] Interface responsiva e documentação de configuração.

### Próximas etapas

- [ ] Concluir a validação com Supabase hospedado, incluindo e-mails e isolamento entre restaurantes.
- [ ] Realizar o deploy e validar o ambiente de produção.
- [ ] Testar o MVP com um restaurante piloto.
- [ ] Priorizar melhorias futuras com base no feedback dos usuários.

## Autor

**Romulo Max**

- GitHub: [romulomax47](https://github.com/romulomax47)
- Repositório: [romulomax47/tempocontrol](https://github.com/romulomax47/tempocontrol)
