# Segurança e limites da demonstração

A API aceita exclusivamente perfis e eventos fictícios de catálogo fechado. Não usar o protótipo para coletar dados reais. O frontend herdado contém formulários e consulta externa de CNPJ; seus valores não são conectados à API nova. O login herdado é uma simulação no navegador, sem validação de identidade pelo servidor.

## Controles implementados

- Autenticação baseada em **JWT (JSON Web Token)** com assinatura criptográfica, expiração configurável e chave secreta gerenciada via variável de ambiente (`JWT_SECRET`).
- CORS explícito, limite de corpo de 16KB, 300 requisições/IP/minuto por processo.
- Campos fechados, timestamps limitados, queries preparadas, eventos idempotentes.
- API não serve a raiz do projeto; os servidores frontend usam lista explícita de arquivos públicos.
- CSV sem cadastros pessoais e com neutralização de fórmulas; nenhuma exportação automática em diretório público.
- Retirada da coleta remove eventos da sessão. Demonstração pública pode ser configurada somente para leitura.
- .env, bancos, logs e dependências ignorados pelo Git.

## Limites conhecidos

A introdução do JWT valida a integridade da sessão no servidor, mas a aplicação ainda pode evoluir para gerenciar múltiplos papéis (roles) e persistência avançada de usuários em banco de dados. CORS não substitui autenticação. O limite em memória não é proteção distribuída contra abuso; SQLite síncrono e agregação em memória destinam-se a base pequena. Retenção e expurgo programado, backup/restauração, criptografia em repouso, observabilidade e TLS devem ser definidos antes de um ambiente real.

Não alegamos conformidade LGPD por haver um checkbox. Qualquer uso com pessoas reais exigiria revisão de finalidade, necessidade, base legal, transparência, direitos e governança. Esses itens são limites de escopo, não validação jurídica.

## Reportar um problema

Não abra issue pública com credenciais ou dados sensíveis. Use o canal privado da equipe/organização do hackathon. Depois da correção, publique uma descrição técnica sem dados confidenciais. Não há e-mail de segurança inventado nesta documentação.
