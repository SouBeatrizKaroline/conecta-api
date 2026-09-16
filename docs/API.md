# Contrato REST /api/v1

Extensão compatível: contexto de sessão inclui `recommendation` e mantém `nextStep` textual. Nova consulta versionada: `GET /api/v2/admin/signals`, com a mesma autorização administrativa e filtros, inclui `evaluatedAt`, `activeNow` por sinal e `statusScope: current`. Veja [semântica, exemplos e migração](EVOLUTION.md). O Analytics integrado consulta sinais v2 e verifica capabilities.historicalSignals em /health. As demais rotas usadas pelos clientes permanecem v1.

Base local: http://127.0.0.1:3000. JSON UTF-8; horários em UTC. [OpenAPI 3.1](openapi.json) é a referência legível por ferramentas. Esta cópia do contrato acompanha cada repositório; a fonte de verdade é conecta-api.

## Autorização

- **Público:** health e catalog. Criar sessão só em modo local de escrita, com perfil fictício e analyticsConsent=true.
- **Sessão:** Authorization: Bearer TOKEN_DA_SESSAO, retornado ao criar sessão. Só acessa a própria sessão; expira em 24h.
- **Admin local:** Authorization: Bearer ADMIN_TOKEN, gerado por npm run setup e guardado em .env. Nunca embutir em código frontend.
- **Demo pública:** DEMO_READ_ONLY=true libera apenas GET administrativos da base fictícia e bloqueia gravação. Não usar esse modo com dados reais.

## Endpoints implementados

| Método | Caminho                          | Resultado                                          | Acesso                     |
| ------ | -------------------------------- | -------------------------------------------------- | -------------------------- |
| GET    | /health                          | status, version, simulated, readOnly               | Público                    |
| GET    | /api/v1/catalog                  | Perfis fictícios, interesses e modo                | Público                    |
| POST   | /api/v1/sessions                 | id, token, expiresIn                               | Público, adesão explícita  |
| GET    | /api/v1/sessions/:id/context     | profileId, analyticsConsent, nextStep              | Sessão                     |
| PATCH  | /api/v1/sessions/:id/preferences | Altera coleta; ao retirar remove eventos da sessão | Sessão + escrita           |
| POST   | /api/v1/sessions/:id/events      | accepted, duplicate, id                            | Sessão + coleta habilitada |
| GET    | /api/v1/admin/summary            | KPIs, páginas, primeiros cliques, eventos/dia      | Admin ou demo pública      |
| GET    | /api/v1/admin/journeys           | total e items com timeline                         | Admin ou demo pública      |
| GET    | /api/v1/admin/signals            | total e items com motivo e recomendação            | Admin ou demo pública      |
| PATCH  | /api/v1/admin/signals/:id        | Estado da ação e registro em auditoria             | Admin + escrita            |
| GET    | /api/v1/admin/audit              | Histórico de ações, mais recente primeiro          | Admin ou demo pública      |
| GET    | /api/v1/admin/events.csv         | Download filtrado, até 10.000 eventos              | Admin ou demo pública      |

## Exemplo de sessão

```json
{ "profileId": "demo-01", "analyticsConsent": true }
```

Resposta 201 contém id gerado, token aleatório, expiresIn:86400 e simulated:true. Copie o token somente para a sessão atual. Consulte o catálogo para perfis disponíveis.

## Exemplo de evento

```json
{
  "id": "04af1741-a4a3-49bc-9877-ab8f096fd379",
  "type": "click",
  "page": "oportunidades",
  "target": "explorar",
  "occurredAt": "2026-09-15T15:00:00.000Z"
}
```

Gere UUID novo e data atual ao executar; a data ilustrativa acima expira. Envie para /sessions/ID/events com token da sessão. Novo evento: 201; repetição idêntica: 200; conflito de UUID: 409. Não enviar CPF, CNPJ, e-mail, classe CSS, conteúdo de input ou URL arbitrária.

## Filtros e paginação

summary, journeys, signals e events.csv aceitam **from**, **to** (YYYY-MM-DD) e **segment** (energia, tecnologia, servicos). journeys e signals paginam com **limit** (1–200, padrão 50) e **offset** (0–1.000.000, padrão 0). summary e CSV calculam/exportam o recorte completo; limit/offset não recortam essas respostas. audit aceita somente limit/offset e não recebe filtros da jornada.

Exemplo: /api/v1/admin/journeys?from=2026-09-01&to=2026-09-15&segment=energia&limit=20&offset=0.

## Gestão

PATCH /admin/signals/demo-02:inactive-7d recebe {"status":"planned"}. O sinal deve existir na base completa no momento da atualização. Um sinal produzido apenas por um recorte histórico pode não continuar ativo e a API retorna 400. Ações são estados de trabalho; nenhuma integração de comunicação é chamada.

## Erros

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Token administrativo inválido.",
    "requestId": "uuid-da-requisicao"
  }
}
```

400: contrato/data inválida; 401: token/sessão inválido; 403: origem, consentimento ou gestão protegida; 404: recurso ausente; 409: evento em conflito; 413: corpo maior que 16KB; 429: limite de 300 requisições/IP/minuto; 500: erro interno sem detalhes do banco. CORS permite apenas as origens configuradas. HTTP sem TLS é apenas para loopback local.
