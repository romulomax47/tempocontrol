# Configuração e deploy

## 1. Criar e configurar o projeto Supabase

Crie um projeto dedicado no Supabase. A migration inicial usa nomes próprios;
se o projeto já contiver tabelas com esses nomes, revise a compatibilidade antes
de aplicar. Nenhuma alteração remota foi executada automaticamente nesta etapa.

No diretório do repositório:

```sh
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

`db push` aplica `supabase/migrations/20261007000100_restaurant_mvp.sql`, incluindo
tabelas, índices, grants, funções, trigger e RLS. Use a CLI para manter o histórico
de migrations. Não execute reset de banco remoto para aplicar esta mudança.

Alternativamente, o SQL completo pode ser aplicado uma única vez no SQL Editor;
nesse caso será necessário reconciliar o histórico da CLI antes de usar db push.

Para desenvolvimento local com Docker, `npx supabase start` utiliza o
`supabase/config.toml` e as migrations versionadas. A suíte SQL embarcada pode ser
executada sem Docker: `npm run test:db`.

## 2. Configurar o Auth

No dashboard do Supabase:

1. Habilite o provedor e-mail/senha e a confirmação de e-mail. Configure senha
   mínima de 8 caracteres ou mais (a interface exige no mínimo 8 no cadastro).
2. Em URL Configuration, defina Site URL como a origem HTTPS de produção e inclua
   essa origem nas Redirect URLs. Para desenvolvimento, inclua exatamente
   `http://127.0.0.1:5173` e/ou `http://localhost:5173` usados pelo frontend.
3. Configure SMTP próprio e o remetente/domínio para produção. O SMTP padrão
   do Supabase é destinado a testes e tem restrições de destinatários.
4. Mantenha o schema `private` fora dos schemas expostos pela Data API. Exponha
   `public`; não desabilite RLS nem use uma chave service_role no navegador.

Cadastro e recuperação retornam à origem do app. Confirme que os templates de
e-mail usam os links de confirmação/recovery do Supabase com o redirect configurado.

## 3. Variáveis públicas do frontend

Copie `.env.example` para `.env.local` e defina:

```dotenv
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
```

Obtenha URL e chave no painel Connect/API Keys. A chave `sb_publishable_*` é
pública por definição; o JWT legado de papel `anon` também é aceito nessa variável.
As permissões dependem da sessão do usuário e de RLS.

Nunca coloque chave `sb_secret_*`, `service_role`, senha do PostgreSQL, segredo JWT
ou credencial SMTP em variável VITE_, no código ou no repositório. Essas variáveis
são incorporadas ao JavaScript servido ao navegador. O build rejeita chaves
privadas reconhecidas; `check:env` também rejeita configuração ausente/inválida.

`supabase/config.toml` configura o ambiente **local**. URLs, confirmação e SMTP
do projeto remoto devem ser configurados no dashboard; `db push` não os altera.

## 4. Instalar, verificar e publicar

Use Node 24 (validado neste projeto):

```sh
npm ci
npm test
npm run lint
npm run check:env
npm run build
```

Publique `dist/` em hospedagem estática HTTPS com fallback SPA para `index.html`.
O arquivo `netlify.toml` já define build, pasta de saída, fallback e headers básicos.
Configure as duas variáveis no painel da hospedagem **antes** de compilar.
Outros provedores estáticos podem usar os mesmos comandos e diretório.

Sem variáveis, `npm run build` ainda permite verificar o código em CI, mas o app
de produção mostra uma tela de configuração e nunca habilita o modo local.
O build da Netlify executa `check:env` e bloqueia um deploy sem Supabase.

A CI incluída executa install reproduzível, suíte completa, lint e build sem
credenciais externas. Ela não aplica migrations nem publica automaticamente.

## 5. Primeiro restaurante e equipe

1. O proprietário cria sua conta, confirma o e-mail e entra.
2. Informa seu nome e o nome do restaurante. O banco cria seu vínculo owner.
3. Cadastra os equipamentos e seus limites reais; os três equipamentos de
   demonstração não são copiados para o banco.
4. Cada funcionário cria e confirma sua própria conta, sem criar outro restaurante.
5. O proprietário associa o e-mail confirmado e o nome na seção Responsáveis.
6. O funcionário entra novamente ou toca Atualizar vínculo. Terá papel staff,
   poderá registrar medições e verá apenas o restaurante associado.

Contas existentes não são transferidas entre restaurantes pela interface.
Mudanças administrativas de acesso e retenção devem respeitar os vínculos de
auditoria e ser feitas pelo operador do projeto, sem apagar histórico.

## 6. Aceite no projeto real

Antes de usar em operação, valide com contas reais de dois restaurantes:

- Confirmação de cadastro e recuperação de senha chegam por e-mail e retornam
  ao domínio correto.
- Cada owner cria seu restaurante e equipamentos; staff registra normalmente.
- Negativos, decimais e valores nos limites são aceitos; fora do limite gera alerta.
- Após reload e em outro dispositivo autenticado, as mesmas medições aparecem
  com responsável e horário corretos.
- A conta B não vê nem grava em equipamentos da conta A, inclusive por chamada
  direta à Data API usando UUIDs conhecidos.
- Logout remove o acesso visual; uma conta diferente não vê dados da anterior.
- Falha de rede apresenta erro, preserva os valores e não anuncia escrita salva.
- Teste em celular, e configure backups e a rotina de restauração do banco.

O schema e RLS foram testados localmente em PostgreSQL embarcado. Autenticação,
entrega de e-mails, permissões do projeto hospedado e deploy final precisam desse
aceite, pois nenhum projeto/credencial de produção foi disponibilizado.

## Referências oficiais

- [Supabase Auth com React](https://supabase.com/docs/guides/auth/quickstarts/react)
- [RLS no PostgreSQL/Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Migrations e deploy](https://supabase.com/docs/guides/deployment/database-migrations)
- [SMTP de produção](https://supabase.com/docs/guides/auth/auth-smtp)
