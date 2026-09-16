# Executar os três sistemas

O App principal envia eventos categóricos para esta API somente depois do consentimento da demonstração. A sessão fictícia atravessa `home.html` e `oportunidades.html` via `sessionStorage`; dados digitados, identificadores cadastrais e termos de busca não fazem parte do contrato de eventos.

## Integração de sinais v2 (revisão atual)

Atualize primeiro a API e depois o Analytics. O painel exige `/health.capabilities.historicalSignals: true`; em uma API anterior, informa que a atualização é necessária. O App mantém os endpoints v1 e não precisa de alteração para enviar eventos ou exibir `nextStep` na demo.

- Analytics lê sinais em `/api/v2/admin/signals` e mostra referência UTC, atividade atual e estado atual da ação.
- Sinais históricos que não estão ativos hoje têm edição desabilitada. O servidor revalida toda escrita.
- O CSV usa os filtros da última análise exibida, mesmo que os campos tenham sido editados depois.
- A conexão e as consultas bloqueiam controles enquanto carregam. Falhas ocultam a análise anterior.
- A integração validada cobre `demo.html` e as telas principais `home.html`/`oportunidades.html`. O visual do App foi preservado; apenas o módulo `integration/tracking.js` é carregado.
- API publicada atual: https://conecta-api-2x27.onrender.com. Sites publicados ainda precisam ter suas origens adicionadas em `ALLOWED_ORIGINS`.

### Repetir o teste entre repositórios

Com os três repositórios em pastas irmãs e as dependências da API instaladas, execute dentro de conecta-api:

```sh
npm run check:integration
```

O teste importa os clientes originais do App e Analytics, sobe a API em porta temporária e usa banco em memória. Verifica coleta, recomendação, sinais v2, gestão, auditoria, CSV e retirada da coleta. Não modifica o App nem a base local. Para outro arranjo de pastas, configure `CONECTA_APP_PATH` e `CONECTA_ANALYTICS_PATH`.

## Requisitos

Git, Node.js 24.x e npm. Banco SQLite embutido no Node: não é necessário instalar MariaDB para esta versão. Alguns Node 24 emitem aviso de API experimental para node:sqlite; mantenha a versão documentada. Os frontends novos não exigem build ou CDN; as telas herdadas dependem de CDNs externos para Tailwind/Lucide/fontes.

```sh
git clone https://github.com/SouBeatrizKaroline/conecta-app.git
git clone https://github.com/SouBeatrizKaroline/conecta-api.git
git clone https://github.com/SouBeatrizKaroline/conecta-analytics.git
```

### Terminal 1: API

```sh
cd conecta-api
npm ci
npm run setup
npm run seed
npm test
npm start
```

setup cria .env com token aleatório e escrita local, sem sobrescrever arquivo existente. Abra o .env local para copiar ADMIN_TOKEN ao painel. O token não é exibido em logs nem enviado ao GitHub. seed insere 37 eventos de seis empresas fictícias apenas quando a base não tem eventos. A idade dos eventos é relativa ao dia de execução, para demonstrar sinais.

### Terminal 2: frontend do usuário

```sh
cd conecta-app
npm ci
npm start
```

Abra http://127.0.0.1:8080/home.html. Marque o aceite LGPD demonstrativo, conclua o cadastro e explore oportunidades. `home.html` e `oportunidades.html` carregam `integration/tracking.js`, que não lê campos de formulário, CNPJ, e-mail ou busca. Para teste técnico isolado, use também http://127.0.0.1:8080/demo.html.

### Terminal 3: Analytics

```sh
cd conecta-analytics
npm ci
npm start
```

Abra http://127.0.0.1:8081, informe a API e `ADMIN_TOKEN` ou `DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD` e conecte. Atualize após interagir com a jornada. Abra um perfil para ver a sequência, altere um sinal para “Planejada”, crie um rascunho de campanha e exporte CSV.

## Roteiro demonstrável de ponta a ponta

1. Com a base inicial: 37 eventos, 6 perfis, 9 sessões, 3 perfis com retorno e 1 com conclusão.
2. Na página demonstrativa, inicie uma sessão: um page_view é registrado.
3. Clique duas vezes em ajuda ou oportunidades e atualize o Analytics.
4. Observe a nova sessão, o primeiro clique e a timeline do perfil.
5. Revise a recomendação e registre o estado da ação. Consulte a auditoria no painel.
6. Exporte CSV com o mesmo período/segmento; os dados vêm da API.
7. Volte à jornada e desative a coleta. Atualize o painel: os eventos daquela sessão foram removidos; a carga inicial continua disponível.

## Modo de leitura para apresentação pública

No backend, use DEMO_READ_ONLY=true com uma base exclusivamente fictícia. GET administrativos passam a dispensar token e todas as gravações ficam bloqueadas. A API deve estar atrás de HTTPS; configure HOST/PORT e ALLOWED_ORIGINS no provedor. Não inclua .env, banco ou tokens em hospedagem estática. A publicação de aplicação/hospedagem é uma etapa separada da publicação dos repositórios.

No Render, os outbound IPs compartilhados informados são `74.220.50.0/24` e `74.220.58.0/24`. Eles não são exclusivos. Se alguma integração externa exigir allowlist única, contrate Dedicated IP.

## Problemas comuns

| Sintoma                                 | Verificação                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Dados indisponíveis / Failed to fetch   | API iniciada? Endereço correto? Origem e porta incluídas em ALLOWED_ORIGINS?                    |
| 401 no Analytics                        | Use o ADMIN_TOKEN do .env da API em execução; não o token de sessão                             |
| 403 ao iniciar jornada                  | DEMO_READ_ONLY deve ser false na demonstração local de escrita                                  |
| Cadastro não aparece no painel          | O painel mostra eventos categóricos; dados digitados em formulário não são enviados à API        |
| Nenhum evento no painel                 | Execute seed numa base vazia, ajuste filtros ou registre a jornada demonstrativa                |
| Contagens não mudam                     | Clique em Atualizar análise; o painel não faz atualização em tempo real                         |
| Porta ocupada                           | Defina PORT e atualize as origens/endereços correspondentes                                     |
