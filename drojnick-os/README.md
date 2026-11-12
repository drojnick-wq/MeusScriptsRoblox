<!-- coderabbit-ai-generated:v1 -->

# DROJNICK OS — operação e entrega

Implementação original em Node.js 24, Express, JavaScript de navegador e SQLite. Os scripts Roblox existentes foram preservados. Esta é a primeira fatia funcional da especificação, não a plataforma integral de 35 seções.

## Executar

Na pasta drojnick-os: `npm ci`, depois `npm start`. Abra http://localhost:3000. Crie uma conta pelo botão de perfil, com senha de pelo menos 10 caracteres. Não há senha administrativa predefinida. Testes: `npm test` (banco temporário, sem usar dados da aplicação).

Para variáveis locais: copie .env.example para .env, configure somente no ambiente seguro e execute `node --env-file=.env server.js`. npm start não carrega .env automaticamente.

## Fluxo reproduzível

1. Crie conta e abra Radar de negócios.
2. Com GOOGLE_PLACES_API_KEY configurada, escolha Google Places; sem chave, escolha Demonstração identificada. O modo de teste não consulta empresas reais.
3. Pesquise categoria e cidade, salve o lead e abra Análise de empresas.
4. Analise o lead; o relatório separa os dados informados, inferências e informações indisponíveis. A pontuação é determinística com pesos visíveis e não mede crédito.
5. Gere o site. Edite apresentação, telefone, endereço, cor e produtos no formato Nome | preço. Salve a versão e recarregue para verificar persistência.
6. Abra a demonstração em /preview/ID. Ela contém identificação comercial, navegação, cardápio e carrinho básico para preparação de pedido no WhatsApp.
7. Crie a proposta com R$ 500. Abra a página pública e baixe o PDF verdadeiro, gerado no servidor.
8. Cadastre um telefone comercial brasileiro válido no lead. Enviar proposta + demonstração prepara a mensagem para revisão; abrir WhatsApp não marca envio. Use a confirmação manual somente depois de enviar.
9. Mova o lead no Kanban ou altere a etapa no formulário. Registre negociação e venda pela proposta. O financeiro considera apenas registros reais da conta, incluindo confirmações manuais explicitamente identificadas.
10. A venda cria uma tarefa de entrega. No editor, escolha publicação definitiva somente após aprovação do conteúdo.

## Configuração e publicação

- PORT: porta HTTP, padrão 3000.
- DATA_DIR: diretório persistente do SQLite e segredo local de sessão, padrão data/.
- SESSION_SECRET: segredo gerado no gerenciador seguro de produção; sem a variável, o aplicativo gera arquivo local com permissão 0600.
- PUBLIC_BASE_URL: URL HTTPS pública para links da proposta e WhatsApp. Configure o domínio externo correto.
- NODE_ENV=production: cookies seguros, requer HTTPS e proxy confiável.
- GOOGLE_PLACES_API_KEY: habilite Places API (New), permissões e faturamento. O conector usa searchText com máscara de campos e paginação. A disponibilidade e o uso dos dados seguem os termos do fornecedor.
- OPENAI_API_KEY e OPENAI_MODEL: assistente externo opcional. Chaves só são lidas no servidor. A geração dos sites desta entrega é por templates; ela não finge usar IA.

Hospede em servidor Node 24 com volume persistente, HTTPS e um proxy confiável. Execute uma instância por banco SQLite; arquitetura horizontal e PostgreSQL exigem adaptação. Faça backup consistente usando a API de backup do SQLite ou parando o serviço antes de copiar data/. Não copie somente o arquivo principal enquanto WAL estiver ativo. Mantenha os backups protegidos. Domínio e SSL são configurados na hospedagem, não automaticamente pela aplicação. O Preview do ambiente não representa uma implantação definitiva com SLA.

## Segurança implementada

Hash bcrypt, sessões persistentes com cookies HttpOnly/SameSite, sessão renovada no login, isolamento de registros por conta, validação Zod, SQL parametrizado, escape de HTML, rejeição de origens cruzadas nas mutações, rate limiting e logs de ações comerciais. URLs públicas de demonstração/proposta são compartilháveis por identificadores aleatórios: quem possuir o link pode acessá-las. Despublicar bloqueia o site, mas não revoga o link da proposta. Contas atualmente têm capacidades equivalentes e dados separados. CSP estrita, recuperação de senha, verificação de e-mail, MFA, RBAC e administração multiusuário ainda não implementados. Os logs não constituem auditoria inviolável.

## Cobertura real

Implementado: autenticação; radar com categoria/cidade, paginação e deduplicação por fornecedor; cadastro manual; análise determinística; site público e editor de campos estruturados; versões e restauração; cardápio e carrinho básico; propostas públicas e PDF; WhatsApp com revisão; CRM de 11 etapas com arrastar/soltar; notas; tarefas; vendas e financeiro básicos; assistente OpenAI configurável; painel com registros da conta e gráfico por período.

Parcial: três variantes de paleta sobre a mesma estrutura, sem biblioteca completa por segmento; editor sem arrastar blocos, imagens ou autosave; dashboard com indicadores principais; análise sem inspeção do website; clientes derivados de leads fechados; automações síncronas sem fila; formulário de configuração informa variáveis, não armazena chaves pelo navegador.

Não implementado: Mercado Pago/Pix/webhooks, checkout, entrega/adicionais de produtos, contratos e assinatura, aceite público de propostas, propostas editáveis/duplicação, exportação de projetos/CSV, expiração/senha de demonstrações, exclusão pela interface, geração em lote, filas/retries, controle de custos, domínios/SSL automáticos, papéis de colaboradores/clientes, organizações compartilhadas, catálogo de dezesseis templates, recorrência/despesas, CNPJ, pesos configuráveis, provedores Anthropic/Google AI, SEO avançado, uploads, restauração de backup pelo painel.

## Custos externos

Google Places e IA dependem do consumo e contrato do fornecedor; não foi feita cotação. Hospedagem, volume persistente, domínio, backups e HTTPS dependem da infraestrutura escolhida. Links wa.me não utilizam WhatsApp Business Platform. Nenhuma mensagem é enviada automaticamente. Não há processamento de cartões nesta entrega.

## Evidências e limites

12 verificações automatizadas passaram: autenticação, integração ausente, demonstração identificada, deduplicação, análise, persistência/escape, PDF, preparação versus confirmação de WhatsApp, CRM/venda sem duplicação, publicação e isolamento de contas. Chromium verificou cadastro, busca demonstrativa, lead, análise, geração, edição persistente, proposta e layout móvel. Nenhuma mensagem foi enviada a terceiros. Google Places e OpenAI reais não foram exercitados, pois não estavam configurados; isso impede afirmar que o cenário com restaurante real foi demonstrado. ChromeOS físico não foi testado. O ZIP não foi fornecido e a referência online não pôde ser consultada pela ferramenta disponível.

## Matriz de avaliação

| Critério | Evidência entregue | Limite |
|---|---|---|
| Qualidade visual (10) | Dashboard original dark/roxo; capturas desktop/mobile | Sem avaliação externa |
| Funcionalidades reais (20) | APIs, banco, autenticação e fluxo testado | Módulos avançados pendentes |
| Radar e dados (10) | Conector Places, paginação, origem e modo demo rotulado | Sem consulta real validada |
| Geração/edição (15) | Site navegável, editor, persistência e versões | Estrutura básica; sem geração IA do site |
| Propostas/WhatsApp (10) | PDF, link público, número normalizado, mensagem revisável | Envio real não realizado |
| CRM/persistência (10) | SQLite, Kanban, notas, tarefas e registros comerciais | Sem filtros avançados/CSV |
| Segurança (10) | Hash, sessões, validação e teste entre duas contas | Sem auditoria independente/RBAC |
| Performance (5) | Interface sem framework pesado, processamento no servidor | Sem benchmark em Chromebook |
| Manutenção (5) | Fonte formatada, lockfile, teste reproduzível e documentação | Monólito inicial a modularizar |
| Publicação (5) | Serviço no Preview, rotas públicas, guia de hospedagem | Sem domínio público definitivo |

Não foi atribuída nota: os pesos solicitados são referência de avaliação, não comprovação de pontuação.
