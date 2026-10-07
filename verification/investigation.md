# Verificação de 7 de outubro de 2026

## Versões verificadas

- Node: 24.18.0
- Vitest: 4.1.11
- Vite: 8.3.2 no diagnóstico inicial; 8.3.3 na verificação final
- @vitejs/plugin-react: 6.1.2
- jsdom: 26.1.0
- React Testing Library: 16.3.3
- React e React DOM: 19.3.0 na verificação final

Os requisitos de engines e peerDependencies instalados são compatíveis.
NODE_OPTIONS e execArgv estavam vazios no diagnóstico independente.

## Investigação

`npm test -- --reporter=verbose --reporter=json --outputFile=vitest-results.json`
com o pool padrão forks e maxWorkers: 1 terminou com código 1, sem carregar
arquivos de teste (transform/setup/import/tests/environment: 0ms).

Erro do runner:

```text
Error: [vitest-pool]: Failed to start forks worker for test files C:/Users/romulo/tempcontrol/src/App.test.jsx.
 ❯ node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:3532:94
 ❯ Pool.schedule node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:3532:5

Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
 ❯ Timeout.<anonymous> node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:3108:58
 ❯ listOnTimeout node:internal/timers:605:17
 ❯ processTimers node:internal/timers:541:7
```

O timeout de resposta no código instalado do Vitest é 60000ms. O relatório
inicial continha zero testes coletados, e não testes ignorados ou assertions
reprovadas. Tentativas anteriores com threads também falharam no bootstrap.

`node scripts/diagnose-vitest.mjs` conseguiu criar subprocesso e thread,
importar jsdom e vitest/node, e carregar os entrypoints reais forks.js e
threads.js. O diagnóstico ampliado terminou com código 0 em 35998ms.
Isso descarta uma proibição geral de criar workers. O problema foi isolado ao
bootstrap/setup dos pools padrão nesta execução; a causa interna exata do
Vitest não foi determinada. Não há evidência para atribuí-lo às assertions.

Separadamente, os runtimes isolados do terminal/controle do navegador falharam
com `windows sandbox failed: helper_unknown_error: setup refresh had errors`.
Não foi estabelecida relação causal entre esse erro e o timeout do Vitest.

## Configuração que passou

Em vitest.config.js: pool: 'vmThreads', maxWorkers: 1, environment: 'jsdom'.
Nenhum teste, setup ou assertion foi removido, ignorado ou enfraquecido.

1. Execução explícita de vmThreads: 1 arquivo aprovado, 29 testes aprovados,
   0 reprovados, 0 ignorados; código 0; duração 46.30s.
2. Execução de `npm test`, já com a configuração salva: 1 arquivo aprovado,
   29 testes aprovados, 0 reprovados, 0 ignorados; código 0; duração 60.00s.
3. Execução final com reporters verbose/JSON e as versões finais instaladas:
   29 aprovados, 0 reprovados, 0 ignorados; código 0; duração 61.34s.
   Relatório final: ../vitest-results.json.

`npm run build` e `npm run lint` também terminaram com código 0.

## Navegador real

Playwright foi instalado como ferramenta temporária com --no-save e
--package-lock=false. O npm atualizou pacotes instalados dentro das faixas
existentes (incluindo Vite e React), sem gravar a ferramenta no manifesto ou
lockfile. O script usa o Chrome instalado em modo headless,
com um novo contexto, sem acessar o perfil pessoal.

Chrome 154.0.8037.98, servidor Vite em http://127.0.0.1:4173.
Foram registradas pela interface as medições Freezer 01: -20.55°C (normal)
e Geladeira 01: 5.1°C (alerta). Após page.reload(), ambos os registros,
limites, status e horários continuaram idênticos, sem duplicação e sem
erros não tratados no navegador.

Evidências: browser-history.json, before-reload.png e after-reload.png.
