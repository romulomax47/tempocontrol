# Supabase real: configuração e aceite do MVP

Este roteiro configura um projeto novo sem substituir funcionalidades ou dados.
Comece por staging, com contas e medições de teste. Use outro projeto Supabase
para produção, repetindo a mesma migration e configuração com valores próprios.
Não misture contas, banco ou chaves entre os ambientes.

## 1. Pré-requisitos e projeto

1. Use Node.js 24, npm e uma conta Supabase com permissão de administrar o projeto.
2. Crie um projeto dedicado no Dashboard; escolha a região e guarde a senha do
   banco em um gerenciador de senhas. Aguarde o provisionamento.
3. Anote o **Project Reference**, a **Project URL** e a **Publishable key** em
   Connect/Settings → API Keys. A senha do banco é usada pela CLI, nunca pelo app.
4. Defina a origem HTTPS do frontend de staging, por exemplo
   `https://staging.seu-dominio.com`, e a origem de produção separadamente.
5. No diretório deste repositório, execute `npm ci`. Não execute `supabase init`:
   a pasta e a configuração local já existem.

Não envie senhas, tokens de sessão, credenciais SMTP ou chaves privadas ao Git,
à documentação, a capturas de tela ou a mensagens de suporte.

## 2. Aplicar a migration pelo histórico da CLI

Execute no PowerShell, na raiz do repositório. Substitua o Project Reference pelo
de **staging**, conferindo o projeto antes de qualquer escrita:

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF_DE_STAGING
npx supabase migration list
npx supabase db push --dry-run
```

`login` autentica a CLI; `link` seleciona o destino (pode solicitar a senha do
banco de forma interativa). `migration list` compara históricos; `--dry-run`
lista migrations pendentes e não executa o SQL. Não coloque senhas em comandos.

Em um projeto novo, deve estar pendente apenas
`20261007000100_restaurant_mvp.sql`. Confira e aplique:

```powershell
npx supabase db push
npx supabase migration list
```

O identificador `20261007000100` deve aparecer em Local e Remote. A migration é
transacional e cria tabelas, índices, grants, RLS, funções e trigger juntos.
Não execute `db reset`, não desabilite RLS e não edite uma migration já aplicada.
Se houver objetos homônimos ou divergência no histórico, interrompa e investigue;
não use `migration repair` apenas para esconder o erro. Prefira a CLI ao SQL
Editor para aplicar schema; o Editor não registra automaticamente esse histórico.

Para produção, repita link/list/dry-run/push/list com o Project Reference de
produção. Não copie dados de teste. O vínculo local da CLI passa a apontar para
o último projeto escolhido: confira sempre antes de aplicar migrations futuras.

## 3. Auditoria do schema e da segurança

Há uma migration SQL no repositório:
`supabase/migrations/20261007000100_restaurant_mvp.sql`.

| Objeto | Regra atual |
| --- | --- |
| `auth.users` | Identidade, senha e confirmação gerenciadas pelo Supabase Auth. |
| `public.restaurants` | Nome e timezone; leitura somente do restaurante vinculado. |
| `public.restaurant_members` | Um restaurante por usuário; papel owner/staff e nome; sem escrita direta pelo cliente. |
| `public.equipment` | Nome, limites finitos e ativo; leitura no próprio restaurante; criação/edição apenas pelo owner. |
| `public.measurements` | Temperatura finita, snapshots de nomes/limites, autoria e horário do servidor; status gerado com limites inclusivos. Sem edição/exclusão pelo cliente. |
| `create_restaurant(text,text)` | RPC autenticada cria restaurante e vínculo owner atomicamente; recusa usuário já associado. |
| `add_restaurant_member(text,text)` | RPC somente owner; associa conta confirmada existente como staff; não transfere contas já vinculadas. |
| `private.current_restaurant_id()` / `is_restaurant_owner(uuid)` | Helpers consultam `auth.uid()`, evitam recursão de RLS e não aceitam identidade fornecida pelo cliente. |
| `measurement_snapshot` / `private.prepare_measurement()` | Trigger exige equipamento ativo do próprio restaurante e preenche autoria, restaurante, snapshots e data/hora. |

Todas as funções SECURITY DEFINER têm `search_path` vazio e referências
qualificadas. As funções públicas têm EXECUTE apenas para `authenticated`;
helpers ficam em `private`; a função do trigger não tem EXECUTE para clientes.
As quatro tabelas públicas têm RLS habilitada. Grants de coluna impedem que o
cliente forneça autoria, restaurante, data/hora ou status de medições. FKs
compostas reforçam o vínculo entre restaurante, equipamento e responsável.

No Dashboard, mantenha Data API habilitada para `public`, mas **não exponha
`private`**. Não torne grants permissivos para contornar erros do frontend.
Não habilite acesso anônimo ao Auth para este MVP. Realtime e Storage não são
necessários. A chave pública sozinha não concede acesso às tabelas.

No SQL Editor do projeto selecionado, execute estas consultas **somente leitura**:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('restaurants','restaurant_members','equipment','measurements')
order by tablename;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('restaurants','restaurant_members','equipment','measurements')
order by tablename, policyname;

select n.nspname as schema_name, p.proname, p.prosecdef,
       p.proconfig, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'private' and p.proname in
       ('current_restaurant_id','is_restaurant_owner','prepare_measurement'))
   or (n.nspname = 'public' and p.proname in
       ('create_restaurant','add_restaurant_member'));

select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.measurements'::regclass and not tgisinternal;

select grantee, table_name, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and grantee in ('anon','authenticated')
  and table_name in ('restaurants','restaurant_members','equipment','measurements')
order by table_name, grantee, privilege_type;

select grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and grantee in ('anon','authenticated')
  and table_name in ('restaurants','restaurant_members','equipment','measurements')
order by table_name, grantee, column_name, privilege_type;
```

Esperado: quatro tabelas com `rowsecurity=true`, sete políticas, cinco funções
SECURITY DEFINER com search_path vazio e um trigger `measurement_snapshot` BEFORE
INSERT. `anon` não recebe privilégios nessas tabelas. `authenticated` recebe
SELECT, INSERT de equipment (`restaurant_id,name,minimum,maximum`), UPDATE de
equipment (`name,minimum,maximum,active`) e INSERT de measurements
(`id,equipment_id,temperature`). Grants de SELECT podem também aparecer nas
linhas de privilégios de coluna. Nenhum UPDATE/DELETE de medições é concedido.

O SQL Editor normalmente opera com privilégios administrativos e ignora RLS.
Essas consultas auditam a configuração, mas **não comprovam isolamento**; use
sessões reais e a Data API na etapa 7.

## 4. Configurar autenticação e e-mail remoto

No Dashboard → Authentication:

1. Habilite Email/password, cadastro e confirmação de e-mail. Exija senha com
   pelo menos oito caracteres. Não crie contas de teste automaticamente confirmadas.
2. Em URL Configuration, defina Site URL como a origem HTTPS desse ambiente.
   Adicione a mesma origem exata às Redirect URLs. Para testar localmente contra
   staging, adicione `http://127.0.0.1:5173` e/ou `http://localhost:5173` conforme
   a URL que efetivamente abrir. Use origens sem subdiretórios: o app retorna a
   `window.location.origin` no cadastro e na recuperação de senha.
3. Configure SMTP próprio, remetente autorizado e autenticação do domínio conforme
   seu provedor. Verifique entrega e spam. O envio padrão do Supabase tem
   restrições e não serve como aceite de entrega para clientes de produção.
4. Preserve nos templates os links de confirmação/recovery gerados pelo Supabase
   (`{{ .ConfirmationURL }}` nos templates correspondentes), sem substituir por
   um link fixo para o app. Teste os dois fluxos em navegador real.
5. Confira limites de envio e logs Auth para diagnosticar mensagens ausentes ou
   falhas; não contorne o teste desabilitando confirmação de e-mail.

`supabase/config.toml` controla **somente o ambiente local**. `db push` aplica
schema, não configura SMTP, Site URL, templates ou provedores do projeto remoto.

## 5. Variáveis e build do frontend

Somente estas duas variáveis são necessárias, ambas públicas:

| Variável | Preencher com |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL HTTPS, por exemplo `https://SEU_PROJECT_REF.supabase.co`. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key `sb_publishable_...` do **mesmo projeto**. |

O MVP também aceita o JWT legado `anon`, mas configure uma publishable key em
projetos novos. **Nunca use Service Role Key**, `sb_secret_*`, senha do banco,
segredo JWT ou credenciais SMTP no frontend ou em qualquer variável `VITE_*`.
Não há variável de restaurant_id: a sessão e o banco determinam o vínculo.

Para rodar contra staging localmente:

```powershell
Copy-Item .env.example .env.local
```

Execute a cópia apenas se `.env.local` ainda não existir, para preservar valores
atuais. Edite o arquivo com URL/chave do staging. Ele é ignorado pelo Git.

```powershell
npm run check:env
npm test
npm run lint
npm run build
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Abra `http://127.0.0.1:5173`. Reinicie o Vite após alterar variáveis. A validação
`check:env` confere formato/tipo de chave, **não** a existência do projeto nem sua
conectividade. Os testes automatizados não acessam o Supabase real.

Para staging hospedado/produção, configure as mesmas duas variáveis no ambiente
correspondente da hospedagem **antes do build**. Vite incorpora esses valores ao
JavaScript: trocar variáveis requer novo build/deploy. Publique `dist/` via HTTPS
com fallback SPA. `netlify.toml` já executa `check:env && build`. Em outros hosts,
use `npm run check:env && npm run build` e Node 24. Sem configuração, produção
mostra erro de configuração; não utiliza o histórico local como substituto.

## 6. Checklist end-to-end no Supabase real

Use três endereços de e-mail controlados: owner A, funcionário A e owner B. Use
perfis de navegador separados para A/B. Registre ambiente, data, versão do app,
resultado e evidências sem tokens/senhas para cada item. Todos começam pendentes:
os testes locais e os HTTP fixtures não equivalem a este aceite.

- [ ] **Cadastro/confirmar:** cadastre A pelo app; confira o usuário no Auth, tente
  entrar antes da confirmação (deve falhar), receba o e-mail, confirme e entre.
- [ ] **Login:** senha incorreta mostra erro; senha correta abre o onboarding.
- [ ] **Restaurante A:** informe nome do restaurante e responsável. Verifique um
  restaurante e vínculo owner no banco. Recarregue: não deve repetir onboarding.
- [ ] **Associação:** funcionário A cadastra/confirma sem criar restaurante;
  owner A associa seu e-mail em Responsáveis. Funcionário atualiza vínculo e vê A.
  Conta não confirmada ou já associada deve ser recusada.
- [ ] **Permissões:** funcionário registra, mas não administra equipamentos/equipe.
- [ ] **Equipamento:** owner A cria equipamento TESTE com limites -22 e -18;
  funcionário passa a enxergá-lo após atualizar/recarregar. Limites invertidos
  são recusados. Equipamento desativado não aceita novas medições.
- [ ] **Temperaturas:** registre -20.5, -22 e -18: status normal. Registre -22.1
  e -17.9: status alerta visível. Campo vazio/não numérico não deve salvar.
- [ ] **Auditoria:** histórico mostra equipamento, nome do responsável, temperatura,
  limites e data/hora. No banco, confira recorded_by, restaurant_id, snapshots e
  recorded_at. Status e limites devem corresponder ao equipamento no registro.
- [ ] **Snapshots:** altere nome/limites do equipamento; medições anteriores
  conservam os nomes/limites e status históricos.
- [ ] **Persistência:** recarregue, saia/entre e abra outro navegador/dispositivo
  autenticado em A. As medições devem continuar presentes sem localStorage de medições.
- [ ] **Logout/troca:** logout remove o histórico da tela. Entrar como B não pode
  mostrar nem transitoriamente o histórico de A.
- [ ] **Restaurante B:** cadastre/confirme owner B e crie restaurante/equipamento B;
  não deve ver restaurante, equipe, equipamentos ou medições A (e vice-versa).
- [ ] **RLS direto:** execute todos os testes da etapa 7 com IDs conhecidos de A/B.
- [ ] **Falhas de rede:** em staging, fique offline ao registrar: erro claro,
  sem falsa confirmação, mantendo os campos. Retorne online, tente novamente e
  confirme uma única medição. Erros de carregamento devem permitir nova tentativa.
- [ ] **Recuperação:** solicite recuperação, receba o e-mail, abra o link no domínio
  correto, altere senha e confirme login com a nova senha.
- [ ] **Celular:** confirme formulários, foco, mensagens e histórico legíveis,
  controles acessíveis e ausência de rolagem horizontal.

O histórico local antigo não é importado automaticamente: testar persistência
real exige criar medições no modo Supabase. Não apague dados locais para testar.

## 7. Isolamento pela Data API, sem privilégios administrativos

Em staging, anote pelo SQL Editor apenas UUIDs de restaurante A/B, equipamento A/B
e uma medição A. Eles não são credenciais. Faça as chamadas abaixo com a chave
publicável e o **access_token de sessão do usuário B**; nunca com service_role,
secret key ou token administrativo. Obtenha a sessão no seu próprio perfil B
pelas ferramentas de rede do navegador. Não compartilhe/exporte o token.

Exemplo no console do navegador de staging (substitua IDs; prompts evitam gravar
o token literalmente no histórico do console; os valores permanecem em memória
durante o teste). As escritas abaixo devem ser bloqueadas; se alguma passar,
interrompa o aceite e investigue antes de operar:

```javascript
{
  const url = prompt('Project URL de staging').replace(/\/$/, '');
  const key = prompt('Publishable key de staging');
  const token = prompt('Access token da sessão do usuário B');
  const restaurantA = 'UUID_RESTAURANTE_A';
  const equipmentA = 'UUID_EQUIPAMENTO_A';
  const measurementA = 'UUID_MEDICAO_A';
  async function request(path, method = 'GET', body, authenticated = true) {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    console.log(method, path, response.status, await response.text());
  }
  for (const table of ['restaurants', 'restaurant_members', 'equipment', 'measurements']) {
    const column = table === 'restaurants' ? 'id' : 'restaurant_id';
    await request(`${table}?${column}=eq.${restaurantA}&select=*`);
  }
  await request(`equipment?id=eq.${equipmentA}`, 'PATCH', { name: 'ACESSO_INDEVIDO' });
  await request('equipment', 'POST', {
    restaurant_id: restaurantA, name: 'ACESSO_INDEVIDO', minimum: -22, maximum: -18,
  });
  await request('measurements', 'POST', { equipment_id: equipmentA, temperature: -20 });
  await request(`measurements?id=eq.${measurementA}`, 'PATCH', { temperature: 0 });
  await request(`measurements?id=eq.${measurementA}`, 'DELETE');
  await request('equipment?select=*', 'GET', undefined, false);
  await request('rpc/create_restaurant', 'POST', {
    p_name: 'ACESSO_ANONIMO', p_display_name: 'Teste',
  }, false);
}
```

- [ ] Leituras B→A retornam `200 []`, nunca linhas A.
- [ ] UPDATE B→equipamento A pode retornar `200 []` (nenhuma linha visível);
  confirme com A que o nome permanece intacto. INSERT B→A deve falhar.
- [ ] INSERT de medição B→equipamento A deve falhar e não criar linha.
- [ ] UPDATE/DELETE de medições falham por grants; A continua vendo a original.
- [ ] Chamadas anônimas falham por permissão/autenticação e não criam restaurante.
- [ ] Repita leituras e tentativas cruzadas usando sessão A contra IDs B.
- [ ] Com sessão do funcionário A, tente PATCH de equipamento A e RPC
  `add_restaurant_member`: ambos devem ser recusados.
- [ ] Com sessão A, tente inserir medição do próprio equipamento acrescentando
  `recorded_by`, `recorded_at` ou `restaurant_id`: deve falhar por grants de coluna.
- [ ] Confirme pelo owner e SQL Editor que nenhuma tentativa proibida alterou dados.

O status HTTP sozinho não prova isolamento: confira corpo, quantidade de linhas
e dados persistidos. Não teste DELETE administrativo nem use o SQL Editor como
substituto das chamadas autenticadas. Tokens vencidos geram erro de autenticação:
obtenha nova sessão antes de concluir que RLS funcionou. Feche o perfil de teste
após o aceite e mantenha as evidências sem credenciais.

## 8. Critério de liberação e diagnóstico

Libere produção após todos os itens passarem no staging e após repetir os fluxos
essenciais no projeto/domínio final. Configure backups e responsabilidade pela
administração de acessos. O MVP não oferece transferência de restaurante ou
exclusão de histórico; não remova vínculos de auditoria para limpar testes.

| Sintoma | Conferir |
| --- | --- |
| Tela de configuração | Variáveis públicas no build, mesmo projeto e novo deploy após alteração. |
| Tabelas/RPC ausentes | migration list, projeto vinculado e schema public na Data API. |
| E-mail não chega | SMTP, remetente, limites de envio, spam e logs Auth. |
| Link abre domínio errado | Site URL, Redirect URLs, templates e origem usada pelo app. |
| Associação recusada | E-mail confirmado e conta sem vínculo anterior. |
| HTTP 401/403 | Sessão válida, chave do mesmo projeto, grants/RLS; não trocar por chave privada. |
| HTTP 400 ao registrar | Equipamento ativo do próprio restaurante e temperatura finita. |

Não foi aplicado SQL remoto nem validada entrega real de e-mail sem um projeto
configurado. Testes em PostgreSQL embarcado verificam schema/RLS localmente;
o checklist acima verifica Auth, Data API, SMTP e hospedagem reais.

## Referências oficiais

- [CLI: db push e dry-run](https://supabase.com/docs/reference/cli/supabase-db-push)
- [Histórico de migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Chaves públicas e privadas](https://supabase.com/docs/guides/getting-started/api-keys)
- [URLs de redirecionamento](https://supabase.com/docs/guides/auth/redirect-urls)
- [SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
