# Auditoria NZT / A2 Eventos — antes de colocar o evento no ar

Data: 27/11/2026. Somente leitura: nenhum arquivo do projeto foi alterado e o banco não foi consultado.
Escrito para: a usuária, para decidir a ordem de correção.

## Como ler este relatório

- Seis frentes foram lidas por agentes em paralelo (empresas, participantes, pulseiras, check-in/reset, documentos/veículos/relatórios, código morto/migrações).
- Cada achado vem com arquivo e linha, como reportado pelo agente. Eu confirmei por grep estes itens: rota de transações sem perfil (`payment.routes.js:33`), convite de empresa aceita `operador` (`empresa.routes.js:39`), watchlist zera `motivo_bloqueio` (`system/watchlist.controller.js:186`), fiscalização usa dia civil (`fiscalizacaoSituacao.service.js:117`) enquanto o turno anterior usa `horario_reset` (`turnoAnterior.service.js:59`), e o número da pulseira só é zerado no reset (`cron.controller.js:328`) e na devolução/perda (`pulseira.service.js:318`).
- Não confirmei ainda: leitor rápido sem janela de lote, a rota legada de portal de empresa, e a existência de tabelas no banco real. Esses itens estão marcados como "a confirmar".
- Nada disso exige bloquear o evento por si só. Os itens da seção 1 são os que mais chance têm de dar problema no dia.

---

## 1. Bloqueantes para o evento (corrigir antes de colocar em uso)

### 1.1 Operação no dia: pulseira, reset e check-out

| # | Gravidade | Problema | Onde | Cenário no dia | Correção sugerida |
|---|---|---|---|---|---|
| O1 | CRÍTICO | Check-out não libera o número da pulseira no cadastro. | `checkin.controller.js:528-626`, `database.service.js:57-175`; só `cron.controller.js:328` e `pulseira.service.js:318` zeram `pessoas.numero_pulseira`. | A pessoa A sai e devolve a pulseira 45. Dez minutos depois, a pessoa B recebe a 45 do mesmo lote e leva **409 "pertence a outra pessoa"** (`pulseiraLote.js:14-24` olha `pessoas.numero_pulseira`). | No check-out, zerar `numero_pulseira` e fechar o vínculo em `pulseira_vinculos`; ou fazer `outraPessoaNoLote` usar o mesmo critério de `buscarStatusPulseira`. |
| O2 | CRÍTICO | Fiscalização usa dia civil (meia-noite), o check-in usa `horario_reset`. | `fiscalizacaoSituacao.service.js:116-117, 155`; `pulseira.service.js:463`; `validation.service.js:101-103`; `monitor.controller.js:15, 60-70, 136-140` versus `validation.service.js:217` e `turnoAnterior.service.js:59`. | Evento com reset às 06:00. Pessoa entrou às 22h e continua dentro à 01h. O check-in a trata como saída; a fiscalização diz **"pulseira de outro dia — credenciamento"** ou **"sem check-in hoje"**. Só ocorre entre 00h e o reset. | Usar `ultimaOcorrenciaHorario(horario_reset)` em fiscalização, `buscarStatusPulseira` e estatísticas. **Confirmar primeiro o `horario_reset` real** (consulta S1). Se for 00:00, este item não se aplica. |
| O3 | ALTO | Reset manual no meio do turno fecha todos os presentes, desvincula as pulseiras e arquiva o relatório de **ontem**. | `cron.controller.js:297-316` (saída forçada agora), `321-333` (zera números), `355-357` (arquiva ontem); `monitor.controller.js:740-752`; confirmação em `ConfigEvento.jsx:64` não avisa. | Admin clica às 15h: todos saem, pulseiras ficam livres, relatório salvo é o de ontem. | Confirmação explicando o efeito; arquivar o dia correto; reset manual não desvincular pulseira. |
| O4 | ALTO | Número anulado ou corrigido continua "em uso" (log de entrada não é corrigido). | `pulseira.service.js:425-460` (`buscarStatusPulseira`); RPC `anular_ultimo_lancamento_pulseira` (migração 20261112c) e `corrigirNumero` (`pulseira.service.js:355-402`) só mexem em `pulseira_vinculos`/`pessoas`. | Credenciou com X, operador trocou para Y. A ficha mostra X em uso. Depois X pode ser entregue a outra pessoa e duas pessoas ficam com o mesmo número. | Ao anular/corrigir, gravar checkout de correção ou filtrar pelo vínculo ativo. |
| O5 | ALTO | Vínculo órfão: número gravado antes do registro de acesso dar certo. | `checkin.controller.js` ~464-466 e ~860-870 gravam `numero_pulseira` antes de `registrarAcesso`; em erro não reverte. Reset só zera `checkin_feito/checkout_feito`. | Pessoa fica em `autorizado` com número preso; o número bloqueia o lote para sempre sem registro de quem segura. | Gravar o número só após `registrarAcesso` OK; no reset, limpar quem tem número e sem entrada aberta. |
| O6 | ALTO | Pulseira perdida/devolvida num dia anterior vira pendência que não fecha. | Reset zera número → trigger `registrar_vinculo_pulseira` fecha vínculo como `desvinculada` → `encerrar()` (`pulseira.service.js:300-323`) exige vínculo aberto → 404 "não tem pulseira em uso". `desvinculada` não está em `MOTIVOS_BLOQUEIO`. | Botão "Marcar como devolvida" falha; o número fica livre e a pendência fica ativa. | `encerrar()` aceitar `desvinculada` pelo log da pendência; gravar `devolvida` antes do reset se a pessoa estiver fora. |
| O7 | ALTO | Credenciamento aceita lote escolhido pelo cliente fora da janela e fora da faixa de números. | `checkin.controller.js` ~784-797: quando vem `tipo_pulseira_id`, lê o lote direto, sem `escolherLote` e sem conferir `numero_inicial..numero_final`. | Lote de montagem usado no show day. | Passar pelo mesmo `escolherLote` e checar a faixa também nesse caminho. |
| O8 | ALTO (a confirmar) | Leitor rápido/código de barras não usa janela de lote quando há só uma pessoa com o número. | `codigoLeitor.js` ~60-90; `leitorRapido` (`checkin.controller.js` ~640-700) não chama `escolherLote` (confirmar: o `escolherLote` aparece nas linhas 456 e 803, que são check-in por pulseira e credenciamento). | Portaria por leitor deixa entrar com pulseira fora da janela — contradiz o deploy b43ba55. | Após casar a pessoa, checar o lote do número e recusar com 403 se bloqueado (saída liberada). |
| O9 | ALTO | Desbloqueio na Watchlist é global: atinge bloqueios de outros eventos e apaga "expulso". | `system/watchlist.controller.js:179-190` faz update em `pessoas` por CPF sem `evento_id`: `bloqueado=false`, `status_acesso='autorizado'`, `motivo_bloqueio=null`. Rota exige só `monitor escrita`. | Operador de um evento desbloqueia pessoa expulsa em outro evento. | Restringir ao evento; não sobrescrever `expulso`. |
| O10 | ALTO | `expulso` não é tratado como bloqueio em todos os caminhos. | `validation.service.js:288` e `checkin.routes.js:153` checam só `bloqueado`; `documento.service.js:207-210` devolve a `autorizado` ao aprovar documento; `pessoa.service.js:553` e `679-688` (PUT genérico altera `bloqueado`, `ativo`, `aceite_lgpd` sem motivo). | Pessoa expulsa volta a entrar depois de enviar um documento. | Tratar `expulso` como bloqueio em todos; desbloqueio passa pela reavaliação de documentos. |
| O11 | ALTO | Importação Excel sobrescreve pessoas já autorizadas ou com check-in feito. | `excel.controller.js:138-149`: upsert com `onConflict: 'cpf, evento_id'` (com espaço — confirmar no PostgREST), grava `status_acesso='pendente'`, troca `empresa_id`, `nome_mae='Pendente Análise'`. | Pessoa já autorizada volta a pendente e fica barrada na portaria. | Usar o mesmo `gravarLinhas` da planilha e não mexer em status. |
| O12 | ALTO | Pulseira presa em pessoa `autorizado` (reset só zera `checkin_feito/checkout_feito`). | `cron.controller.js:321-333`. | Número some do lote. | Incluir no reset quem tem número e não tem entrada aberta. |
| O13 | ALTO (a confirmar) | Botão de reset agendado em `ConfigCron.jsx:75` chama `POST /eventos/reset/manual` sem evento. | Backend `cron.controller.js:391` responde 400. | Botão falha silenciosamente. | Trocar para `/eventos/${id}/reset-manual` (como `ConfigEvento.jsx:67`). |

### 1.2 Segurança e dados pessoais (vazamento e acesso indevido)

| # | Gravidade | Problema | Onde | Correção sugerida |
|---|---|---|---|---|
| S1 | CRÍTICO | Lista de transações financeiras sem perfil nem evento: qualquer usuário logado (inclusive operador) lista transações de todos os eventos com nome e CPF dos pagantes. Confirmado no código. | `payments/payment.routes.js:33` (GET) e `:40` (PUT reconcile) só `authenticate`; `payment.controller.js:76-88` filtra evento só se vier na query. | `requireEvent`, `authorize('master','admin','supervisor')`, forçar `evento_id`, também no reconcile. |
| S2 | CRÍTICO | Operador consegue a chave de acesso do portal da empresa. Confirmado: `send-invite` aceita `operador`. | `entities/empresa.routes.js:39`; `empresa.controller.js:287` usa `req.body.email` como destino; chave vai no e-mail (`emailService.js:184`). | Convite só para e-mail cadastrado; restringir a admin/supervisor; nunca mandar chave para destino do corpo. |
| S3 | ALTO (a confirmar) | Rota legada `/api/portal/empresa` ainda montada (`app.js:218`), aceita token do painel e não filtra empresa/evento em `GET /colaboradores` e `/dashboard`; `POST /colaboradores` espalha `req.body`. | `modules/portal/empresa.routes.js`. Nenhum frontend a usa. | Remover a montagem e o arquivo. |
| S4 | ALTO | Pré-cadastro por link da empresa devolve nome, e-mail, nome da mãe e data de nascimento a quem envia um CPF pré-cadastrado. Limite de 120/15 min por IP não impede varredura. | `planilha/planilha.service.js:177-192`, `planilha.controller.js:93-110`. | Exigir segundo fator (data de nascimento) ou devolver só "encontrado". |
| S5 | ALTO | Cadastro público `/public/portal/cadastro`: sem aceite LGPD, sem rate limit, mass assignment (`.insert({...cleanPessoa})` aceita `bloqueado`, `ativo`, `status_documentos`, `pagamento_validado`). Usa `invite_token`, `pessoas.status` que não aparecem em nenhuma migração — pode estar sempre falhando. | `public.controller.js:847-936`; `public.routes.js`. | Whitelist de campos; aceite LGPD; rate limit; confirmar schema. |
| S6 | ALTO | Histórico de veículo lido de outro evento por UUID. `limit` vira string na paginação (página 2 com limit 20 gera `range(20, 2019)`). | `entities/veiculo.controller.js:399-412`. | Validar veículo contra o evento; `parseInt`; filtrar `evento_id`. |
| S7 | ALTO | Watchlist aplicada de forma desigual: só o cadastro manual recusa CPF monitorado (e mostra o motivo, contra o sigilo). Link público, planilha e importação Excel não checam. | `pessoa.service.js:386-398`; `watchlist.service.js:129`; `public.controller.js`; `planilha.service.js:136-164`; `excel.controller.js:138-149`. | Checagem única em todos os caminhos; mensagem genérica. |
| S8 | ALTO | `eventos.config` guarda senhas de equipamento em texto (`password`, `senha`, `password_device`, `user_device`, `control_token`). | Relatado; a confirmar se há cifragem. | Cifrar; não exibir no front. |
| S9 | ALTO | Campos de trabalho em área técnica e altura nunca são gravados: o código escreve `trabalha_area_tecnica`/`trabalha_altura`, a coluna é `trabalho_*`. Descarte silencioso, só log de info. | `public.controller.js:686-687`; `database/supabase/migrations/08_iam_ecm_expansion.sql:80-81`. | Corrigir o nome; transformar descarte em erro. |
| S10 | MÉDIO | Filtro de empresa em relatórios é ignorado em `porArea`, `porLeitor`, `porFuncao`, `porStatus` (filtro de empresa não aplicado). | `reports/report.controller.js:292, 473, 511, 558`. | Aplicar `empresa_id`. |
| S11 | MÉDIO | Histórico/veículo: busca com `search` interpolado em `.or()` (vírgula quebra o filtro). Placa com hífen não bate (LPR devolve "não cadastrado"). | `veiculo.service.js:40`; `veiculo.controller.js:147-160, 362, 457`. | Normalizar placa `[^A-Z0-9]` em todos os pontos; escapar busca. |

### 1.3 Empresas (cadastro e portal)

| # | Gravidade | Problema | Correção |
|---|---|---|---|
| E1 | ALTO | Excluir empresa faz `DELETE` direto. A limpeza em cascata (`empresa.service.js:123`) não é chamada. `pessoas.empresa_id ON DELETE SET NULL` deixa pessoas ativas, sem empresa, sem a regra de bloqueio; documentos ficam no storage (LGPD). | Usar cascata ou recusar exclusão com participantes. |
| E2 | ALTO | Evento encerrado não bloqueia o portal: login e escrita continuam (`portalEmpresaAuth.js:103-126`, `portalEmpresa.service.js:59-82`). | Recusar evento encerrado (ou só leitura). |
| E3 | ALTO | Empresa inativa: link público aceita novos cadastros (`public.controller.js` ~255-270). Tela de empresas não tem campo "ativo". Bloqueio no check-in já funciona. | Checar `ativo` no link; controle na tela. |
| E4 | MÉDIO | Link de empresa não expira (`registration_token_expires_at=null`) e não respeita fim do evento. | Expirar no fim do evento. |
| E5 | MÉDIO | Regras diferentes por caminho: CPF sem validar DV no público; sem cota diária no público/planilha; contagem de vagas sem filtrar evento (`public.controller.js:609`); documento vencido vira `pendente` sem aviso. | Unificar validação. |
| E6 | MÉDIO | Campos mortos/divergentes: `email_convite` lido e nunca gravado; `responsavel_legal` ignorado no create; listagem ignora `search/page/limit` (`empresa.controller.js:41-52`). | Alinhar painel e API. |
| E7 | BAIXO | `empresa.service.js` (235 linhas) é código morto (nada importa). | Apagar após conferir. |

### 1.4 Participantes, planilha e CPF

| # | Gravidade | Problema | Correção |
|---|---|---|---|
| P1 | ALTO (confirmar no banco) | CPF com pontuação em registros antigos gera duplicata: planilha e público comparam só dígitos, mas `checkin.controller.js:944-945` busca os dois formatos. | Consulta P1 abaixo; migração para normalizar. |
| P2 | ALTO | Duplicidade de CPF: `pessoas` tem `UNIQUE(evento_id, cpf)` no banco, mas **a tabela é definida duas vezes nas migrações** com esquemas diferentes (ver seção 2). | Confirmar qual definição está ativa (consulta M1). |
| P3 | ALTO | CPF é a chave na planilha, mas a importação Excel usa outro caminho (ver O11). | Unificar com `gravarLinhas`. |

**Resposta à pergunta "o CPF é o validador de pré-cadastrados?":** a resposta é **parcialmente**. Pela planilha e pelo cadastro público, o CPF identifica a pessoa dentro do evento (com `UNIQUE(evento_id, cpf)`), e só dígitos são gravados. Mas (a) a importação Excel sobrescreve status (O11), (b) registros antigos com máscara não casam (P1), e (c) a watchlist não é checada em todos os caminhos (S7).

### 1.5 Auditoria documental, veículos, remuneração e relatórios

| # | Gravidade | Problema | Correção |
|---|---|---|---|
| D1 | ALTO | Regra de remuneração **desativada continua sendo paga** no fechamento. A tela mostra "(inativa)" mas `regraDaPessoa` (`remuneracao.service.js:103-106`) não lê `ativo`. | Ignorar `ativo === false` ou bloquear desativar regra em uso. |
| D2 | ALTO | Liberação do dia expira à meia-noite, não no reset: pessoa liberada às 23h volta a ser barrada às 00h no mesmo turno (`auditoria.service.js:18, 53`). | Usar o dia do evento (`horario_reset`). |
| D3 | ALTO (confirmar) | Placa única global ou por evento: se a mesma placa existir em dois eventos, a consulta falha (`maybeSingle`) e aparece "NAO_CADASTRADO" para os dois. | Unicidade `(placa, evento_id)`; consulta sempre com evento. |
| D4 | MÉDIO | Diário consolidado usa empresa **atual** (`pessoas.empresa_id`), o fechamento usa a empresa **da época** (`logs_acesso.empresa_id`). Pessoa que trocou de empresa aparece inteira na nova no diário e dividida no fechamento. | Usar o log de entrada. |
| D5 | MÉDIO | Snapshot diário duplicado: `salvarFechamentoDiario` faz insert sem upsert (reset manual + automático no mesmo dia). | Upsert. |
| D6 | MÉDIO | Registro de encerramento assume "veículos não têm evento_id", mas o código grava. Pacote pode omitir veículos. | Filtrar por `evento_id`. |
| D7 | MÉDIO | Documento aprovado antes de o tipo exigir validade conta válido para sempre. Isenção por origem `interno`/`importacao` (confirmar se é intenção). | Revisar regra. |

### 1.6 Monitor, KPIs e áreas

| # | Gravidade | Problema | Correção |
|---|---|---|---|
| M1 | ALTO | Três critérios de "presente": KPI usa `status_acesso='checkin_feito'`; dashboard por empresa usa último movimento do dia civil; fiscalização usa dia civil. Entre 00h e o reset, KPI mostra 120 e a tabela soma 80. | Um critério único (ver O2). |
| M2 | MÉDIO | Fiscalização não filtra área por evento nem por tipo (`checkin.controller.js:1084-1091`); área só de monitoramento aparece como autorizada. | Filtrar evento e tipo; usar `bloqueioPorTipoArea`. |
| M3 | MÉDIO | Reset: `_ultimoResetPorEvento` marcado antes da execução (`cron.controller.js:132-133`). Se falhar no meio, não tenta de novo no dia. Reset depende de bater o minuto exato (`118-137`). | Rodar se o dia ainda não foi fechado (checar no banco). |
| M4 | MÉDIO | Checkout duplicado sem trava no banco (`registrar_acesso_etapa` só bloqueia entrada duplicada). | Índice único parcial ou checagem também de saída. |
| M5 | MÉDIO | Reentrada após reset pode exigir liberação (saída forçada gravada com dia civil do dia novo). Confirmar se é intenção. | Confirmar com a usuária. |

---

## 2. Banco de dados, migrações e tabelas

| # | Gravidade | Problema | Ação |
|---|---|---|---|
| B1 | ALTO | Tabelas com **duas definições** em migrações: `pessoas` (uma com `numero_pulseira TEXT`, `status_acesso`, `evento_id`; outra com `cpf`, `face_embedding`, `criado_em`), `logs_acesso` (dois esquemas com `tipo`/`metodo` diferentes), `pessoa_evento_empresa`. Não se sabe qual está ativo sem ver o banco. | Consulta M1 e M2. |
| B2 | ALTO | `pulseiras_pendencia.numero_pulseira` é INTEGER, mas `pessoas.numero_pulseira` é TEXT. Comparações entre elas podem falhar ou perder zero à esquerda. | Padronizar. |
| B3 | ALTO | Tabelas usadas no código **sem CREATE** no repositório: `watchlist` (runtime em vários módulos), `logs_veiculos`, `transacoes_financeiras`, `mensagem_templates`, `biometria_pessoa`, `snapshots`, `logs_sync`/`system_sync_logs`, `watchlist_alertas`, `watchlist_contatos`, `dispositivos`. | Verificar no banco (consulta M3). Se existirem, versionar o CREATE. Se não, módulo quebrado. |
| B4 | ALTO | `logs_veiculos` é gravada pelo código, mas `20261031b` dropou `logs_acesso_veiculos`. Relacionado a B3. | Confirmar. |
| B5 | MÉDIO | Duas árvores de migrações: `supabase/migrations` (até 20261126, a que o CLAUDE.md cita) e `database/supabase/migrations` (até 20260914). Duplicatas `20260414_security_*`, `18_*`, `19_*`, e `database/legacy/` com 13 arquivos. | Marcar as antigas como histórico (README). |
| B6 | MÉDIO | Scripts usam `funcionarios` (tabela substituída por `pessoas`): `backend/api-nodejs/src/scripts/db_tools/*.ps1`, `check_db.js`, `tests/debug_sync.js`. | Mover para `_deprecated`. |
| B7 | MÉDIO | `pessoa_documentos` e `pessoas` por evento: certo. Documento de outro evento não entra (verificado OK). | — |
| B8 | BAIXO | Status das migrações 20261123, 20261125b, 20261126 citados no CLAUDE.md não confirmados no banco. O deploy não aplica migrações (é manual). | Consulta M4. |

---

## 3. Código morto, rotas e lixo versionado

**Código morto (rotas e arquivos sem uso):**
- `getCompanyEmployeesByToken`, `getCompanyDocumentsByToken`, `uploadCompanyDocumentByToken` (`public.controller.js:342, 944, 1014`) sem rota.
- `getPersonByToken` (`public.controller.js:388`): rota `/person/:token` sem chamador, e seleciona `nome` (coluna renomeada para `nome_completo`) — sempre 404.
- `app/api/register/[token]/route.ts` (public-web): não chamado, com CORS `*`.
- `autoCheckoutRoutine` (`cron.controller.js:192-198`) retorna na primeira linha.
- `revogarDocumentosVencidos` (`cron.controller.js:369`) sem chamador.
- `GET /reports/ponto` e `/reports/company-summary` sem uso no frontend.
- Candidatas (confirmar com grep no mobile e portais): `/api/payments`, `/api/messages`, `/api/portal/cliente`.
- Aliases duplicados: `app.js:191, 195, 220-221`.

**Lixo versionado no git:**
- `design-preview/` (4 HTML de protótipo) — apagar ou mover para `docs/`.
- `yolov8n.pt` (6,5 MB) na raiz — binário de modelo no git; remover do git e ignorar.
- `backend/api-nodejs/temp-create-test-user.js` — script temporário.
- `temp2.txt` e `temp_log.txt` (idênticos, 112 KB) — não rastreados e ignorados; apagar localmente.
- `backend/api-nodejs/src/database/migrations/_deprecated/` e `database/legacy/` — histórico fora do build.

**Textos desatualizados:**
- `Fiscalizacao.jsx:641` diz que pulseira de outro dia "nunca aparece", mas o bloco existe em `:680`.
- `CLAUDE.md` cita `.env.example`, que não existe na raiz.

**Scripts que escrevem no banco** (não estão no deploy, mas o testador roda robôs contra o Evento de Teste em produção): `test_intelbras_flow.js:16`, `seed_nexus.js:27-28` (datas fixas), `reset_admin.js:37` (CPF 000.000.000-00, grava). Garantir que nenhum escreva sem o id do evento de teste.

---

## 4. Mudanças não commitadas

25 arquivos modificados (+302/-127). **Atenção:** o deploy faz `git fetch` + `git reset --hard origin/master` + `git clean -fd` na VPS (`.github/workflows/deploy.yml:86-88`). Ou seja, **o que está só no computador não vai para produção**, mas pode divergir do que foi testado. Há mudanças de backend (`auth.js`, `checkin.controller.js`, `videoRelay.js`, `health.service.js`) que só existem local. Commitar em lotes separados, com teste.

Também há aviso de CRLF em todos os arquivos: definir `.gitattributes`.

---

## 5. O que já está OK (verificado pelos agentes)

- Documento vencido é avaliado igual na auditoria, no check-in e na listagem (`documentoRequisitos.service.js:72`).
- Documentos são por `pessoa_id` e pessoas são por evento: documento de outro evento não entra.
- Entrada só é barrada se o evento tem regra para a função; saída nunca é barrada.
- Fechamento e ponto-resumo usam o mesmo `montarTurnos`; saída forçada fica "a conferir".
- LPR exige token do dispositivo do mesmo evento. Registro de encerramento remove campos sensíveis.
- Login do portal da empresa: scrypt, rate limit, token próprio com escopo e validade; chave nova derruba sessões.
- Fases (`montagem/evento/desmontagem`) estão em minúsculo em backend, frontend e produção; labels só na UI.
- Janela de lote que cruza a meia-noite está correta.
- Checkout de pulseira ignora a janela de propósito.
- Todas as URLs de `api.get/post` em Checkin, Checkout, Fiscalização, Monitor e Dashboard existem no backend.
- Replay offline não sobrescreve status com log antigo.
- Reset não apaga histórico (vínculos ficam em `pulseira_vinculos`).
- CPF é sempre gravado só com dígitos (`sanitizePII`, `lerCpf`, `registerEmployee`).
- Unicidade `(evento_id, cpf)` existe. Planilha não sobrescreve pessoa de outra empresa.
- Pré-cadastro só completa registro pendente da própria empresa com origem externa.
- Rate limit em `/register` e `/generate-upload-url`. Token inválido responde 404 antes de consultar o banco.

---

## 6. Ordem sugerida

**Antes de qualquer uso (bloqueia ou vaza dado):** S1, S2, S4, S5, S3, O9, O10, O11, E1, E2, O1, O2 (depois de ver `horario_reset`), O13.

**Antes do primeiro dia de operação (pulseira e turno):** O4, O5, O6, O7, O8, O12, M1, M3, D1, D2, S9, S7.

**Depois do evento ou em paralelo com baixo risco:** B5, B6, E7, design-preview, yolov8n.pt, temp files, comentários desatualizados.

**Regra do projeto:** pelo CLAUDE.md, cada correção de código passa pelo guardião (`GUARDIAN_SKILL.md`): diagnóstico e aprovação antes de escrever código. Migrações e deploy também seguem o protocolo. Nenhuma correção foi feita nesta sessão.

---

## 7. Consultas para rodar no Supabase (somente leitura)

Ver o arquivo `consultas_verificacao_evento.sql` na mesma pasta. Elas cobrem: horário de reset, pulseiras presas, vínculos abertos, pessoas presas em `checkin_feito`, duplicidade de CPF, existência das tabelas sem CREATE, políticas de RLS de `pulseiras_pendencia`, e duplicatas de snapshot.

## 8. O que não foi possível verificar sem o banco

- Estado real das tabelas e colunas (B1, B3, B4, P1, P2).
- Se o `onConflict` com espaço funciona (O11).
- Se o `expulso` com `bloqueado=false` deixa entrar (O10).
- Se a RLS de `pulseiras_pendencia` vaza entre eventos (a policy compara `evento_id` com o subselect; pode ser `p.evento_id = p.evento_id`).
- Entrega real do e-mail de convite (S2) e o que o operador vê.
- Se o `horario_reset` dos eventos ativos é 00:00 (decide O2).
