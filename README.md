# TempControl

Aplicação React + Vite para registrar temperaturas por restaurante, com Supabase
Auth e PostgreSQL/RLS. O baseline local continua disponível em desenvolvimento
sem configuração; produção exige Supabase.

- [Auditoria, arquitetura e schema](docs/MVP.md)
- [Configuração, migrations, variáveis e deploy](docs/DEPLOY.md)
- [Supabase do zero e checklist de aceite real](docs/SUPABASE_SETUP.md)

## Desenvolvimento e verificações

- `npm install`
- `npm run dev`
- `npm test` — testes de interface com Vitest e React Testing Library.
- `npm run build`
- `npm run lint`
- `npm run test:db` — migration e isolamento com PostgreSQL embarcado.
- `npm run check:env` — valida as variáveis públicas antes do deploy.

O Vitest usa `vmThreads` com um único worker. Neste ambiente Windows, os pools
padrão `forks` e `threads` excederam o timeout de inicialização antes de carregar
os testes. O contexto VM executa a mesma suíte, sem desativar testes ou assertions.

Para repetir a verificação no Chrome instalado, inicie
`npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`, instale a ferramenta opcional com
`npm install --no-save --package-lock=false playwright` e execute
`node scripts/verify-browser-history.mjs`. O script usa um contexto novo com
dados sintéticos, registra duas medições e compara o histórico após uma recarga
real. Evidências ficam em `verification/`.

`node scripts/diagnose-vitest.mjs` verifica versões, imports e a inicialização
independente de um subprocesso e uma thread, incluindo os entrypoints do Vitest.

## Histórico local de desenvolvimento e recuperação

Esta seção descreve somente o baseline local. No modo Supabase, as medições
são persistidas no PostgreSQL com autoria e isolamento por restaurante.

A chave canônica é `tempcontrol_medicoes`. Na abertura, registros válidos dela e de `Tempcontrol_medicoes` são reunidos. Cópias iguais entre as chaves são deduplicadas pelos campos da medição; repetições dentro de uma mesma origem são preservadas. A chave antiga permanece como fonte de recuperação.

JSON corrompido e listas com registros inválidos geram aviso. Antes de substituir dados danificados, o conteúdo original é preservado em `<chave>.backup`. Um backup diferente já existente não é sobrescrito: nesse caso, a gravação é bloqueada e a interface avisa. Somente registros válidos são exibidos.

Se a leitura do armazenamento falhar, nenhuma chave é sobrescrita. Falhas de gravação mantêm as medições na sessão e exibem aviso; esses registros não sobrevivem a uma recarga. Reabra a página depois de restabelecer o acesso ao armazenamento.

Sem identificadores nas medições antigas, cópias com todos os campos iguais entre as duas chaves são consideradas a mesma medição. O armazenamento é local ao navegador, sem sincronização entre dispositivos ou abas simultâneas.
