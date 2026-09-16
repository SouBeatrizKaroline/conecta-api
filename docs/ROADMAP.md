# Roadmap

## v0.1 — Base demonstrável

- [x] Três repositórios com responsabilidades e contrato documentados.
- [x] Frontend herdado preservado e demonstração de integração separada.
- [x] API com sessões, eventos, consentimento, SQLite e base fictícia.
- [x] Métricas, primeiro clique, retorno, timelines e sinais por regras.
- [x] CSV filtrado e gestão de estado de ações com auditoria.
- [x] Testes automatizados de API, segurança e persistência.

## Evolução implementada na main

- [x] Contexto explicável por sessão, com prioridade de regras.
- [x] Consulta de sinais v2 com referência histórica e atividade atual separadas.
- [x] Contrato OpenAPI e testes de regressão.
- [ ] Consumir e apresentar esses campos nos frontends.

## v0.2 — Evolução coordenada pela equipe

- [ ] Instrumentar as telas principais após estabilização, com catálogo explícito de eventos.
- [ ] Unificar scripts duplicados e melhorar o login demonstrativo sem sugerir autenticação real.
- [ ] Definir identidade pseudônima de visitantes e frequência de sessão para um cenário de uso validado.
- [ ] Exibir interesses e preferências em visão dedicada; separar canais/autorização de marketing.
- [ ] Melhorar episódios de sinais, filtros históricos e paginação visual para bases maiores.
- [ ] Validar linguagem, navegação e acessibilidade com usuários/operadores.
- [ ] Publicar aplicação e API em hospedagem com HTTPS e base fictícia de leitura.

## v0.3 — Preparação técnica futura

- [ ] Migrações versionadas e adaptação para MariaDB/PostgreSQL.
- [ ] Autenticação individual, papéis, organizações e trilha de auditoria atribuída.
- [ ] Retenção, expurgo, backup/restauração e monitoramento.
- [ ] Fila de eventos, reenvio com mesmo UUID e testes de carga.
- [ ] Integração real somente mediante autorização, definição de contrato e validação de proteção de dados.

Metas futuras não são funcionalidades concluídas nem compromissos contratuais. Reengajamento, ROI e impacto de negócio ainda precisam ser medidos.
