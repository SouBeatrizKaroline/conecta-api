# Verificação da entrega

## Verificação da integração API e Analytics em 15/09/2026

- API: 12 testes aprovados; Analytics: 1 teste aprovado; sintaxe verificada nos dois.
- `npm run check:integration`: aprovado usando os clientes reais dos repositórios irmãos. Coleta, contexto, sinais v2, mudança de estado, auditoria, CSV e retirada da coleta.
- Navegador local: conexão administrativa; 37 eventos, seis perfis e nove sessões; ação planejada com auditoria.
- App/demo original: iniciou sessão e concluiu jornada; a resposta nextStep foi exibida. Arquivos do App não foram alterados.
- Analytics: recorte até 12/09 mostrou sinal histórico da empresa 02 desativado após conclusão em 15/09. Estado planejado permaneceu visível e o seletor ficou desabilitado.
- Filtro Energia e período histórico: quatro eventos; período futuro: estado vazio com zero eventos.
- Exportação acionada após editar filtros sem atualizar: utiliza a consulta da análise exibida.
- Inspeção visual na largura disponível do navegador, cerca de 600px. O controle de viewport não confirmou 390px; não registramos validação móvel a 390px nesta revisão.
- Modo público sem token: leitura disponível e seletores de ações desabilitados. API sem capabilities: aviso de atualização e análise anterior ocultada.
- App verificado no commit `6d2839be14f7cf1879c46e275256a57b3754987c`, com árvore de trabalho limpa.
- Sem implantação em nuvem, dados reais ou teste de carga. Os registros abaixo pertencem às revisões anteriores.

Verificação local em 15/09/2026, Node.js 24.19.0, Windows. Os resultados descrevem o protótipo e não certificam um ambiente produtivo.

## Evolução de contexto e sinais v2

Sintaxe dos módulos novos e formatação dos arquivos alterados aprovadas. A verificação global de formatação ainda aponta 15 arquivos preexistentes não alterados nesta revisão; não foi registrada como aprovada.

Nesta revisão, 12 testes HTTP/persistência passaram localmente no Node.js 24.19.0: os oito anteriores e quatro novos cenários de contexto, isolamento, retirada da coleta e sinais históricos. A API foi testada; App e Analytics não foram alterados nem revalidados no navegador nesta revisão. Os resultados de navegador abaixo são o registro da entrega anterior, não uma nova execução.

## Testes automatizados da entrega anterior

| Sistema   | Resultado                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API       | 8 testes aprovados: fluxo de eventos, idempotência, autorização, isolamento de sessões, retirada de coleta, validação, limites, persistência, CSV, sinais e auditoria |
| App       | 1 teste aprovado: cliente só coleta após iniciar sessão, usa token próprio e interrompe após retirada                                                                 |
| Analytics | 1 teste aprovado: cliente envia Bearer no cabeçalho e trata erro de autenticação                                                                                      |
| Sintaxe   | npm run check aprovado nos três repositórios                                                                                                                          |

Execute npm ci, npm run check, npm test e npm run format:check para repetir as verificações automatizadas. Os testes HTTP sobem servidores temporários e não alteram a base de demonstração.

## Navegador e dados reais do protótipo

- API com seed: 37 eventos, 6 perfis fictícios e 9 sessões.
- App: sessão iniciada e dois cliques em Ajuda aumentaram a base para 40 eventos e 10 sessões.
- O primeiro clique dessa sessão apareceu como Ajuda, com 9 primeiros cliques anteriores em Explorar oportunidades.
- Retirada da coleta pela interface removeu os três eventos da sessão; a base voltou a 37 eventos e 9 sessões.
- Analytics: conexão com token local, gráficos e jornadas carregados da API.
- Filtro Tecnologia: 12 eventos, 2 perfis, 3 sessões e 1 perfil com retorno.
- Ação alterada de Aberta para Planejada pela interface, com registro correspondente na auditoria.
- Exportação CSV acionada pela interface e resposta confirmada; conteúdo e ausência de dados cadastrais também cobertos pelo teste da API.
- Telas novas inspecionadas em desktop e largura móvel de 390px; nenhuma rolagem horizontal detectada nessa largura.
- Nenhum erro de JavaScript reportado pelo navegador durante os fluxos executados.

## Preservação e limites

Os cinco arquivos de código do frontend de origem foram comparados com o conteúdo Git da revisão 65a0705c7e9ae1a98ce9396b204cef268b0997eb. O manifesto de hashes está no conecta-app em docs/source-baseline.json. A documentação e os novos módulos ficam separados.

Não foram verificados integração Petronect, envio de mensagens, dados reais, carga produtiva ou migração MariaDB porque não estão implementados. A evidência ponta a ponta cobre o módulo demonstrativo e as telas principais do App com rastreamento consentido.

Os checks do GitHub Actions são publicados junto com os repositórios; consulte a aba Actions para o resultado remoto de cada commit.
