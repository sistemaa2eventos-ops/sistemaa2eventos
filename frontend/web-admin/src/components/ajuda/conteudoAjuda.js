/**
 * Ajuda de cada tela do painel (abre sozinha na primeira visita e pelo botão "?").
 * Rótulos iguais aos da tela. Ao mudar uma tela, atualize o texto dela aqui.
 *
 * Campos: titulo, objetivo, passos (em ordem), atencao (o que costuma dar errado), dicas.
 */
const AJUDAS = {
    '/': {
        titulo: 'Dashboard',
        objetivo: 'Mostra o evento ativo em tempo real: quem está dentro, entradas e saídas do dia, negados, lotação por área, leitores e o que precisa de atenção agora.',
        passos: [
            'Confira no topo o evento ativo. Sem evento, clique em "Ir para eventos" e use "Gerenciar" no evento certo.',
            'Leia o bloco "O que precisa de atenção": cada alerta tem o botão "Abrir", que leva à tela onde se resolve.',
            'Acompanhe "Presentes agora", o fluxo por hora e a lotação por área durante a operação.'
        ],
        atencao: [
            '"Reset diário" fecha o dia: quem não está no evento passa a ausente e começa um novo dia de operação. Use só no fim do expediente.',
            'O percentual de lotação só aparece se a "Capacidade" estiver preenchida no evento.'
        ],
        dicas: ['Os números se atualizam sozinhos a cada minuto; o ícone "Atualizar dados" força na hora.']
    },
    '/eventos': {
        titulo: 'Eventos',
        objetivo: 'Cria e administra os eventos. Tudo no sistema (empresas, pessoas, leitores, relatórios) pertence a um evento.',
        tituloPassos: 'Ordem para preparar um evento',
        passos: [
            '"Novo evento": preencha nome, datas, "Horário reset diário" e "Capacidade". Ligue "Habilitar impressão de etiquetas" se for imprimir no check-in. "Salvar e ativar".',
            'Clique em "Gerenciar" para tornar o evento ativo.',
            'Configurações → Áreas: crie as áreas (com capacidade).',
            'Configurações → Pulseiras: crie os lotes e as zonas liberadas.',
            'Configurações → Credenciamento: escolha os campos do formulário de pré-cadastro.',
            'Configurações → Documentos: marque os documentos de "Todos (padrão)" (ex.: RG/CNH frente e verso) e os extras de cada função.',
            'Leitores e dispositivos: cadastre os leitores, ligue ao agente local, "Config online" e "Sync".',
            'Empresas: cadastre as empresas e envie o convite de pré-cadastro.'
        ],
        atencao: [
            '"Excluir" apaga o evento de verdade, mesmo que o título do aviso fale em desativar.',
            'O "Horário reset diário" define quando o dia de operação vira; turnos sem saída até lá ficam "a conferir".'
        ]
    },
    '/empresas': {
        titulo: 'Empresas',
        objetivo: 'Cadastra as empresas contratadas do evento, as cotas diárias e envia os links para o responsável anexar a documentação da empresa e cadastrar a equipe.',
        passos: [
            '"Nova empresa": preencha "Dados cadastrais" e "Configurações" (cota, dias permitidos, regra de remuneração) e clique em "Finalizar & salvar".',
            'Clique em "Gerar convite de cadastro" para copiar ou enviar por e-mail / WhatsApp os dois links (documentação da empresa e cadastro de colaboradores).',
            'Para anexar documentos da empresa manualmente (arquivo ou foto pela câmera), clique no ícone "Documentos da empresa" nas Ações ou na etapa "Documentos" ao editar a empresa.',
            'Use "Gerenciar cotas diárias" para limitar quantas pessoas da empresa entram por dia.'
        ],
        atencao: [
            'Gerar um novo link invalida o anterior: quem tiver o link antigo não consegue mais se cadastrar.',
            'Os documentos da empresa entram na fila de Auditoria documental e são salvos na pasta da empresa no Google Drive.',
            'Os "Dias permitidos" valem para todos os colaboradores da empresa.',
            'Excluir a empresa mantém os colaboradores, mas eles podem perder o acesso.'
        ],
        dicas: ['"Regras de remuneração" (no topo) define diária, meia diária e hora extra usadas na aba Diárias dos relatórios.']
    },
    '/pessoas': {
        titulo: 'Participantes',
        objetivo: 'Lista, cadastra e gerencia as pessoas do evento: dados, documentos, QR code, bloqueio e importação por planilha.',
        passos: [
            '"Novo participante": preencha "Dados pessoais", "Acesso" (datas/fases) e "Documentos" e salve. Cadastro feito aqui não exige documento: o operador confere no atendimento.',
            'Para aprovar quem veio pelo link, abra o cadastro, marque o parecer dos documentos como completo e salve.',
            'Para muitas pessoas: "Baixar modelo", preencha e "Importar planilha".'
        ],
        atencao: [
            'A aba "Pendentes" mostra quem aguarda aprovação do cadastro; pendências de documento ficam na Auditoria documental.',
            'Bloquear e desbloquear pedem justificativa e valem na hora, inclusive nos leitores.',
            '"Expulsar do evento" só aparece para quem está com check-in feito.'
        ],
        dicas: ['Duplo clique na linha abre a edição.']
    },
    '/auditoria': {
        titulo: 'Auditoria documental',
        objetivo: 'Conferir os documentos enviados pelas empresas e pelos colaboradores (CNPJ, contratos, RG/CNH, ASO, NRs) e aprovar, reprovar ou pedir reenvio.',
        passos: [
            'Na aba "Fila de análise", clique em "Ver e analisar documento".',
            'Escolha a ação. Ao aprovar, informe o "Tipo do documento" e a "Data de Validade" quando o tipo exigir.',
            'Na aba "Colaboradores", veja o que falta para cada pessoa; em "Empresas", confira os documentos de cada empresa; em "Vencimentos", o que vai vencer.'
        ],
        atencao: [
            'Reprovar e pedir reenvio exigem motivo.',
            'Quais documentos cada função precisa é definido em Configurações → Documentos ("Todos (padrão)" vale para todos; cada função soma extras).',
            'Cadastros feitos pelo operador não exigem documento e não aparecem como pendentes.'
        ],
        dicas: ['Marque várias linhas para aprovar, pedir reenvio ou reprovar em lote.']
    },
    '/checkin': {
        titulo: 'Check-in',
        objetivo: 'Registrar a entrada: pelo rosto, na hora (sem abrir a ficha), ou pela pulseira dentro da ficha de conferência. O campo de texto só localiza a pessoa e abre a ficha.',
        passos: [
            'Em "Conectar estação", escolha o leitor facial e/ou as câmeras da sua baia e dê o "Nome da estação".',
            'Escolha a área. "Todas as áreas (global)" é livre: a pessoa entra e sai quantas vezes quiser, sem liberação. Só área com portão ("Controla entrada") bloqueia a reentrada.',
            'No campo "Leitor, CPF ou nome", bipe o QR/código de barras, use "Ler pela câmera" ou digite o CPF e aperte Enter: abre a ficha da pessoa. Digitando o nome, escolha a pessoa na lista.',
            'Na ficha, bipe a pulseira em "Número da pulseira" (a entrada sai sozinha) ou digite o número e aperte Enter ou "Vincular pulseira & autorizar".'
        ],
        atencao: [
            'O campo nunca registra a entrada sozinho, nem por código, CPF ou nome: a entrada só sai pela pulseira lida na ficha.',
            'Em área com portão, entrada seguida de nova entrada, na mesma etapa, dia e área, é recusada enquanto a pessoa estiver dentro. Depois de uma saída, a nova entrada só passa na área geral ("Todas as áreas") ou, na área com portão, com "Liberar reentrada" feito por quem controla a entrada.',
            'Sem pulseira, a entrada só sai pelo botão "Confirmar entrada sem pulseira" na ficha.',
            'Os leitores físicos da portaria registram a entrada sozinhos, sem passar por esta tela.',
            'Com o leitor facial vinculado, o rosto registra a entrada na hora, sem abrir a ficha, só na estação ligada àquele leitor. Vale em todas as áreas. A entrada aparece na lista de registros.',
            'O rosto da mesma pessoa reconhecido de novo em até 20 s não registra outra entrada.',
            'Área que controla entrada (portão): se a pessoa já está dentro, o rosto não registra e aparece um aviso no topo da tela ("Pessoa já está dentro"); o aviso some em 30 s ou com o X. Se ela saiu e não foi liberada, o aviso traz "Liberar reentrada" (só para admin, supervisor e operador; quem não tem o botão precisa pedir ao controlador). Depois de liberar, a entrada é tentada de novo uma vez.',
            'Entrada bloqueada aberta na ficha (pela pulseira ou pela busca) continua na ficha: "Liberar reentrada" aparece quando a pessoa já saiu e a saída não foi liberada. "Pessoa já está dentro" tem o botão "Registrar saída": registra a saída pela pulseira da pessoa e, depois disso, a entrada pode ser confirmada de novo. Sem pulseira em uso, a saída não é registrada nesta ficha.',
            'Sem internet, a entrada fica guardada no aparelho ("Aguardando envio") e sobe sozinha depois, na ordem em que foi lida. Se o servidor recusar um desses acessos, ou não responder em 3 tentativas, ele aparece em "Recusados pelo servidor" até você dispensar.',
            'Texto que não é código (nome, palavra solta) não vai para a fila sem internet: aparece "Não é um código válido" na hora.',
            'Passagens recusadas: quando o servidor não aceita uma entrada ou saída (por exemplo, pessoa que já estava dentro), ela aparece no bloco "Passagens recusadas", com nome, hora e motivo. Confira com a pessoa e clique em "Resolver" para tirar da lista. O bloco some quando não há mais pendências.'
        ],
        dicas: [
            'Com "Imprimir etiqueta" ligado no evento, a etiqueta sai sozinha a cada entrada nova. "Imprimir etiqueta: ON" na tela abre a prévia só quando o evento não imprime sozinho (a etiqueta nunca sai duas vezes).',
            '"Modo quiosque (tela cheia)" esconde o menu para a estação de atendimento.'
        ]
    },
    '/checkout': {
        titulo: 'Check-out',
        objetivo: 'Registrar a saída pela pulseira: bipada ou lida pela câmera, a saída é registrada na hora; digitada, abre a ficha de conferência já preenchida e um Enter registra. Pelo leitor facial, o rosto registra a saída na hora.',
        passos: [
            'Vincule a estação e escolha a área, como no check-in.',
            'No campo "Leitor, pulseira, CPF ou nome", bipe a pulseira ou use "Ler pela câmera": a saída é registrada na hora, sem abrir a ficha (tela verde "Saída liberada").',
            'Digitando o número da pulseira e apertando Enter, abre a ficha da pessoa com o número já preenchido: confira e aperte Enter de novo para registrar a saída.',
            'CPF, QR do crachá ou nome (escolhido na lista) abrem a ficha vazia: bipe ou digite a pulseira desta pessoa para registrar a saída.',
            'Na ficha, pulseira de outra pessoa não registra a saída: a tela avisa "Esta pulseira é de outra pessoa" e nada é registrado.'
        ],
        atencao: [
            'Só a pulseira da própria pessoa registra a saída direto. CPF, QR do crachá e nome nunca registram sozinhos: abrem a ficha.',
            'Pessoa sem pulseira cadastrada não tem saída pela ficha ("Sem pulseira cadastrada"). Pelo rosto, a saída não depende de pulseira.',
            'Com leitor facial vinculado à estação, a saída pelo rosto é registrada na hora, sem abrir a ficha. Só a estação ligada àquele leitor reage. Texto digitado continua abrindo a ficha.',
            'Os leitores físicos da portaria registram sozinhos, sem passar por esta tela.',
            'Sem internet, a ficha não abre: a pessoa precisa ser localizada pelo servidor. Uma saída lida na ficha fica guardada no aparelho e sobe sozinha depois. Se o servidor recusar ou não responder em 3 tentativas, ela aparece em "Recusados pelo servidor" até você dispensar; as leituras seguintes não esperam por ela.',
            'Se a pessoa entrou num dia anterior e não registrou a saída, abre a janela "Saída de um dia anterior": confira o horário sugerido (o da saída do dia anterior) e clique em "Corrigir saída". O turno antigo é corrigido e nada é lançado para hoje.',
            'Quem não registrar a saída fica "a conferir" no relatório quando o dia vira.',
            'Passagens recusadas: quando o servidor não aceita uma entrada ou saída, ela aparece no bloco "Passagens recusadas", com nome, hora e motivo. Confira com a pessoa e clique em "Resolver" para tirar da lista. O bloco some quando não há mais pendências.'
        ]
    },
    '/fiscalizacao': {
        titulo: 'Fiscalização de áreas',
        objetivo: 'Conferir pulseiras e credenciais nos postos internos, sem registrar entrada nem saída.',
        passos: [
            'Escolha o "Posto de fiscalização" (a área onde você está).',
            'No campo "Leitor, pulseira, CPF ou nome", bipe a pulseira ou o crachá, digite o número ou o CPF e aperte Enter, ou use "Ler pela câmera". Pelo nome, escolha a pessoa na lista (Enter com nome não fiscaliza).',
            'Veja o resultado: LIBERADO, NÃO AUTORIZADO ou BLOQUEADO, com as áreas permitidas.'
        ],
        dicas: [
            'O posto fica salvo neste navegador. Os contadores valem só para esta sessão da tela.',
            'A fiscalização não registra entrada nem saída: a regra de uma leitura por etapa e por dia não se aplica aqui.'
        ]
    },
    '/monitor': {
        titulo: 'Monitor em tempo real',
        objetivo: 'Acompanhar as passagens ao vivo, os leitores, a lista de alerta (watchlist), as câmeras e a saúde do sistema.',
        passos: [
            '"Ao vivo": filtre por área, leitor ou tipo (Check-in, Check-out, Negado).',
            '"Leitores": confira se todos estão online.',
            '"Watchlist": cadastre CPFs a vigiar ("Novo alvo") e os contatos que recebem o alerta ("Notificações externas").'
        ],
        atencao: [
            'A aba Watchlist só aparece para administrador.',
            '"Desbloquear" um alvo exige justificativa e libera o acesso em todos os eventos.'
        ]
    },
    '/reports': {
        titulo: 'Relatórios',
        objetivo: 'Presença do dia, ponto, diárias, pulseiras e acessos por área, empresa, leitor, função e status, com exportação em Excel e PDF.',
        passos: [
            'Escolha a aba e a "Data de referência" (ou o período).',
            'Filtre por empresa ou pesquise pelo nome.',
            'Use "Exportar Excel" ou "Exportar PDF" — sai exatamente o que está na tela.'
        ],
        atencao: [
            'As horas contam da primeira entrada até a última saída do turno, sem descontar intervalos.',
            'Turno sem saída registrada aparece "a conferir" e fica fora das horas até alguém corrigir.',
            'A aba Diárias só mostra valores para empresas com regra de remuneração.',
            'A aba "Atendimento" mostra o tempo de cada operador e calcula quantos operadores o próximo evento precisa; o botão "Planilha orçamentária" gera o Excel com custos e preço.'
        ]
    },
    '/veiculos': {
        titulo: 'Veículos',
        objetivo: 'Cadastrar os veículos autorizados e registrar passagens de entrada e saída.',
        passos: [
            '"Novo veículo": placa, marca, modelo e empresa. "Cadastrar veículo".',
            'Use "Consultar placa" na portaria e "Registrar passagem" para entrada ou saída.'
        ],
        atencao: ['Bloquear o veículo exige justificativa.']
    },
    '/usuarios': {
        titulo: 'Operadores',
        objetivo: 'Definir quem entra no painel, em quais eventos e com quais módulos.',
        passos: [
            '"Novo operador": e-mail, nome e telefone.',
            'Escolha "Enviar convite por e-mail / link" ou "Definir senha inicial agora".',
            'Escolha o vínculo (global ou por evento) e os módulos liberados. "Criar operador".'
        ],
        atencao: [
            'Use um login por computador: cada login tem um limite de requisições por minuto, e vários computadores no mesmo login dividem esse limite.',
            'Só os módulos marcados aparecem no menu do operador.',
            'O chip "Pediu nova senha" indica um pedido: use "Definir / Resetar Senha".'
        ],
        dicas: ['O modelo de módulos para operadores novos fica em Configurações → Perfis de acesso.']
    },
    '/audit-logs': {
        titulo: 'Auditoria e logs — ações dos usuários',
        objetivo: 'Histórico de quem fez o quê no painel (cadastros, aprovações, bloqueios, configurações). Somente leitura. A aba "Logs técnicos" mostra os registros do servidor.',
        passos: ['Filtre por módulo e período e clique em "Atualizar logs".', 'Passe o mouse em "Detalhes" para ver o que mudou.']
    },
    '/cftv': {
        titulo: 'Monitor CFTV',
        objetivo: 'Mosaico das câmeras ao vivo, com alerta quando alguém da watchlist é reconhecido.',
        passos: ['Escolha o layout (1x1 a 4x4) e "Selecionar Câmeras".', 'Clique numa câmera para focar nela.'],
        atencao: [
            'Só as primeiras câmeras passam vídeo ao vivo (padrão 9); as demais mostram foto. O número é ajustado em Configurações → IA facial.',
            'O layout e as câmeras escolhidas ficam salvos neste navegador.'
        ]
    },

    // ---------- Configurações ----------
    '/configuracoes': {
        titulo: 'Configurações',
        objetivo: 'Índice de tudo o que se configura, nos mesmos grupos do menu lateral: Evento, Credenciais físicas, Equipamentos, Comunicação e Sistema.',
        dicas: ['Ordem para um evento novo: Eventos → Áreas → Regras de acesso → Credenciamento → Documentos → Pulseiras → Etiquetas → Leitores e dispositivos → Câmeras e IA facial.']
    },
    '/config/documentos': {
        titulo: 'Documentos obrigatórios',
        objetivo: 'Quais documentos cada função precisa ter aprovados e dentro da validade. Vale para quem se cadastra pelo link; cadastro feito pelo operador não exige documento.',
        passos: [
            'Em "Tipos de documento", confira ou crie os tipos (marque "validade" quando o documento vence, como ASO e NRs).',
            'Na linha "Todos (padrão)", marque o mínimo para todos — ex.: RG/CNH frente e verso. Sem eles, o pré-cadastro não é enviado.',
            'Adicione cada função (ex.: ELETRICISTA) e marque os documentos extras dela.',
            '"Salvar configuração": a situação de todos é recalculada.'
        ],
        atencao: [
            'Os documentos da função são pedidos no link, mas a pessoa pode enviar depois: ela fica pendente na Auditoria até completar.',
            'Tipo já salvo não pode ser apagado, só desativado.'
        ]
    },
    '/config/geral': {
        titulo: 'Configurações gerais',
        objetivo: 'Nome e logo do sistema, comportamento da interface e alerta de lotação.',
        passos: ['Ajuste e clique em "Salvar Alterações".'],
        atencao: ['A logo enviada só fica gravada depois de "Salvar Alterações".']
    },
    '/config/credenciamento': {
        titulo: 'Credenciamento',
        objetivo: 'Define o que a pessoa preenche no link de pré-cadastro enviado para cada empresa do evento ativo.',
        passos: [
            'Ligue os campos que devem aparecer (e ser obrigatórios): e-mail, data de nascimento, nome da mãe, função, foto do rosto, dias de trabalho.',
            'Clique em "Salvar formulário" — vale na hora, inclusive para os links já enviados.',
            'Configure os documentos pedidos em Documentos e envie o link em Empresas → "Gerar convite de cadastro".'
        ],
        atencao: [
            'Nome completo e CPF são sempre obrigatórios.',
            'Desligar a "Foto do rosto" impede o reconhecimento facial nos leitores para quem se cadastrar pelo link.',
            'Quem se cadastra pelo link fica pendente até um administrador aprovar.'
        ]
    },
    '/config/checkin': {
        titulo: 'Regras de acesso',
        objetivo: 'Tempo mínimo entre passagens (anti-passback), saída automática e bloqueio por lotação.',
        passos: ['Ajuste e salve ("Salvar regras de tempo" e "Salvar lotação" gravam tudo junto).'],
        atencao: [
            'O anti-passback (padrão 15 min) faz o leitor negar uma nova passagem logo em seguida, inclusive a saída de quem acabou de entrar.',
            'Com "Bloquear entradas ao atingir a capacidade", os leitores param de liberar quando a área enche. A capacidade fica em Áreas.'
        ]
    },
    '/config/areas': {
        titulo: 'Áreas',
        objetivo: 'As áreas de acesso do evento (ex.: Palco, Backstage, Produção). São usadas por pulseiras, leitores e câmeras.',
        passos: [
            '"Nova área": nome e "Capacidade máxima" (0 = ilimitada).',
            '"Controla entrada (portão)" vem marcado: quem entra por esta área faz check-in e, ao sair, check-out.',
            'Crie as áreas antes de configurar pulseiras e leitores.'
        ],
        atencao: [
            'Cada leitor só recebe os rostos das pessoas autorizadas na área dele.',
            'Em área com portão, a reentrada depois de uma saída só acontece com "Liberar reentrada" no aviso ou na ficha do Check-in, feito por quem controla a entrada.',
            'Em área com portão, o rosto registra a entrada na hora; se a pessoa já está dentro ou saiu sem liberação, o Check-in mostra o aviso em vez de registrar. No Check-out, a saída pelo rosto é registrada na hora, com ou sem portão.',
            'Desmarque "Controla entrada" em áreas de circulação livre: nelas a pessoa entra e sai quantas vezes quiser, sem liberação. A opção "Todas as áreas (global)" do Check-in já funciona assim.'
        ]
    },
    '/config/pulseiras': {
        titulo: 'Pulseiras',
        objetivo: 'Lotes de pulseiras: cor, faixa de números, áreas liberadas e fase do evento (Montagem, Evento, Desmontagem).',
        passos: ['"Provisionar lote": nome, cor, etapa/fase de validade, data específica (opcional), início e fim de uso (opcional), número inicial e final, método de leitura e "Zonas de acesso permitidas".', '"Criar lote".'],
        atencao: ['Crie as áreas antes: lote sem zona fica "Sem acesso".', 'Lotes de fases diferentes podem repetir números e cores; ao rodar o reset de turnos as pulseiras anteriores são liberadas automaticamente.', 'Excluir um lote é irreversível.', 'Fora da fase, data ou horário de uso do lote, a pulseira é recusada no credenciamento e no check-in.'],
        tituloConferir: 'Conferir antes do evento',
        passosConferir: [
            'Janela de horário: crie um lote com "Início uso" 16:00 e "Fim uso" 02:00. Tente vincular uma pulseira desse lote fora desse horário: o sistema deve recusar com aviso.',
            'Devolução: no credenciamento, com uma pessoa que já tem pulseira, clique em "Marcar como Devolvida". A pulseira sai da pessoa e aparece no histórico como devolvida.',
            'Pulseira errada: no credenciamento, "Lançamento errado" desfaz a pulseira em uso. Se houve troca, a anterior volta com a mesma hora de entrada. Também funciona em Relatórios → Pulseiras, mesmo horas depois, desde que o número não esteja com outra pessoa no evento.',
            'Trocada ou perdida: o número não volta a ser entregue no mesmo lote do evento. Uma marcação feita por engano se desfaz em Relatórios → Pulseiras ("Desfazer").',
            'Troca de empresa: refaça a saída e o credenciamento com a pulseira nova. Acessos antes da troca contam na empresa anterior; os depois, na nova, no ponto, no fechamento e nos logs.',
            'Lotes sobrepostos: crie dois lotes com a mesma faixa de números, um de "Montagem" e outro de "Evento (Showday)". No dia de cada fase, a leitura deve usar o lote certo.'
        ]
    },
    '/manual-equipamentos': {
        titulo: 'Manual de equipamentos',
        objetivo: 'Passo a passo de rede, PC do evento, leitores faciais e câmeras: montagem, testes e correções.',
        passos: ['Use a busca para achar um assunto (ex.: "relógio", "Config Online").', 'Clique numa seção no índice para ir até ela.', '"Imprimir" gera uma versão em papel ou PDF para levar ao evento.']
    },
    '/config/dispositivos': {
        titulo: 'Leitores e dispositivos',
        objetivo: 'Cadastrar e operar os leitores faciais, câmeras, catracas e impressoras.',
        tituloPassos: 'Como ligar um leitor facial',
        passos: [
            'Crie as áreas antes (Configurações → Áreas).',
            'Em "Agentes locais", clique "Novo agente" e instale o agente num computador da rede do evento (o token aparece uma única vez). Ele precisa ficar ligado.',
            '"Novo dispositivo": nome, IP, usuário e senha do leitor, "Modo de operação", "Área / local" e, em "Conexão com o leitor", escolha "Via agente local".',
            'No card do leitor: "Config online" com os campos em branco (aponta o leitor para o servidor).',
            'Clique "Sync" para enviar os rostos. Em até 1 minuto o leitor aparece online.',
            'Ajuste a "Confiança mínima do rosto" (recomendado 75%): passagem facial abaixo disso é negada.'
        ],
        atencao: [
            '"Fail Open" libera a passagem se o sistema cair; "Fail Closed" nega. Para segurança, prefira Fail Closed com internet de reserva.',
            '"Liberar" e "Travar" ficam valendo até clicar "Normal".',
            'Leitor de credenciamento não grava entrada/saída: só abre a ficha na tela do operador vinculado.',
            '"Quem reconhece o rosto → Leitor + confirmação da IA": o motor de IA confere a foto tirada pelo leitor com o cadastro (até 1,5 s). Só vale com o leitor em modo online e o motor ligado.',
            '"Se a IA não responder": "Vale o reconhecimento do leitor" mantém a fila andando; "Negar" é para áreas restritas. Com o motor desligado no painel, vale sempre o leitor.',
            '"Usar também como câmera" cria uma câmera com o vídeo do leitor (em Câmeras, escolha IA e gravação dela).',
            'Para entrada e saída pelo rosto (sem pulseira), use "Modo de operação: Bidirecional" e "Fluxo de acesso: Toggle": a primeira passagem do dia é entrada, a seguinte é saída.',
            'Reserve um IP fixo para cada leitor no roteador.',
            'As métricas do card só informam: um leitor com "sem resposta" no "Alcance" continua com os botões ligados. O que liga e desliga "Sync" e "Câmera" é o status online/offline do leitor.'
        ],
        dicas: [
            'A "Fila de Sincronização" mostra os rostos que falharam; use "Reenviar".',
            'Métricas do card: "Alcance" é o tempo que o leitor levou para responder agora ("sem resposta" = não respondeu); "Último evento" é a última passagem recebida; "Faces no leitor" são os rostos gravados nele; "Erros (24 h)" conta as falhas do dia (passe o mouse para ver a última); "Fila pendente" são envios esperando; "Medido" diz quando foi a medição.',
            'Ao abrir a tela, a lista aparece primeiro e as métricas chegam alguns segundos depois ("medindo..."). "Medir agora" mede todos os equipamentos na hora.',
            '"Integração do equipamento" (no cadastro de leitor facial, catraca ou câmera) diz de onde vem o vídeo: "Canal de vídeo" é a câmera dentro do aparelho (normalmente 1), "Porta RTSP" é a porta do vídeo (normalmente 554) e "Caminho RTSP (opcional)" só se o fabricante pedir outro caminho. Deixe em branco para usar o padrão; a linha "Vídeo" mostra como fica o endereço, com a senha escondida.'
        ]
    },

    '/config/etiquetas': {
        titulo: 'Etiquetas e crachás',
        objetivo: 'Editor visual completo para crachás PVC, credenciais e etiquetas térmicas com seleção por área, grupos, camadas reais e guias magnéticas.',
        passos: [
            'Aba "Formato": selecione o padrão da impressora ou informe as dimensões (mm); envie a arte do evento (que entra como camada com ordem e trava).',
            'Só Referência (crachás pré-impressos): marque a arte como "Só referência" para orientar os dados na tela sem enviá-la para a impressora.',
            'Aba "Elementos": adicione textos/variáveis, QR Code, Código de Barras 1D vetorial, foto, logos ou formas geométricas.',
            'Aba "Camadas": ordene o nível de profundidade (Z-Index) trazendo para frente ou enviando para trás com efeito visual imediato.',
            'Painel "Propriedades": trave proporção de fotos/logos ou ative redimensionamento livre para esticar para cima e para os lados.',
            'Use "Imprimir Teste" para validar a saída física e "Salvar Layout" para fixar o desenho no evento.'
        ],
        atencao: [
            'Variáveis dinâmicas aceitas: {nome_pessoa}, {nome_completo}, {empresa}, {funcao}, {cpf}, {pulseira}, {evento}, {data}.',
            'Elementos marcados como "Só referência" ou ocultados na aba Camadas não saem na impressão.',
            'No cadastro do evento, ative "Habilitar impressão de etiquetas" para imprimir direto no credenciamento.'
        ],
        dicas: [
            'Seleção por área: clique e arraste o mouse no vazio da prancheta para selecionar múltiplos elementos de uma vez só.',
            'Escala em grupo: puxe as alças verdes da seleção para redimensionar todos juntos ou use os botões de −10% / +10%.',
            'Grupos (Ctrl+G): trave elementos juntos na mesma camada para se moverem e escalarem em bloco. Desagrupe com Ctrl+Shift+G.',
            'Grade visível: selecione a cor (azul, magenta, branca, preta) e intensidade no menu superior para enxergar sobre qualquer arte.',
            'Atalhos: setas para ajuste milimétrico (1 px ou 10 px com Shift), Delete para exclusão em lote e Ctrl+] / Ctrl+[ para avançar/recuar camada.',
            'Para impressão instantânea sem diálogo do Windows na recepção, inicie o Chrome com o parâmetro --kiosk-printing.'
        ]
    },
    '/config/veiculos': {
        titulo: 'Veículos e estacionamento',
        objetivo: 'Leitura automática de placas (LPR).',
        passos: ['Ligue o módulo, informe o endereço do motor de leitura e a confiança mínima. Salve.']
    },
    '/config/cameras': {
        titulo: 'Câmeras e IA facial',
        objetivo: 'Cadastrar as câmeras, escolher em quais roda o reconhecimento facial e quais gravam, e assistir às gravações.',
        passos: [
            'Aba "Câmeras": "Cadastrar nova câmera" com nome, área, IP, porta RTSP, usuário e senha; use "Testar".',
            'No cartão de cada câmera, "Inteligência": "Só monitorar" (vídeo sem IA), "IA ao assistir" (reconhece enquanto alguém assiste) ou "IA 24 h" (alerta mesmo com o painel fechado).',
            'No cartão, "Gravação": "Não gravar", "Contínua" (blocos de 5 min) ou "Em alertas" (10 s antes a 30 s depois de cada alerta da IA ou acesso negado no leitor da mesma área).',
            'No topo: "Motor de IA do evento" e "Gravação do evento" desligam tudo sem perder as escolhas de cada câmera; "Espaço máximo" e "Guardar por" controlam o que fica no PC.',
            'Aba "Gravações": filtre por câmera, tipo e dia; assista ou baixe.',
            'Aba "Motor de IA facial": "Verificar compatibilidade e ligar IA neste PC" e o perfil do motor.',
            'Servidor de IA central (fora do evento): na aba "Motor de IA facial", quadro "Servidores de IA", o Admin Master cadastra o servidor e copia o token (aparece uma vez). No evento, em "Onde roda o reconhecimento", escolha "Servidor de IA central": o PC do evento acha os rostos e o servidor diz quem é.'
        ],
        atencao: [
            'Vídeo, IA e gravação passam pelo PC do evento (agente local): ele precisa ficar ligado. Rode o ligar-ia-facial.bat nele após cada atualização.',
            'As gravações ficam só no PC do evento (não vão para a nuvem). Se o PC for perdido, elas se perdem junto; para ter prova fora do PC, ligue "Copiar os trechos de alerta para o Google Drive" nas opções avançadas da câmera.',
            'Passou do espaço ou do prazo, as gravações mais antigas são apagadas. Quem assiste ou baixa fica registrado.',
            'LGPD: avise no local, com placas, que há gravação de imagens.',
            'Com o servidor central, o PC do evento continua precisando do motor ligado: ele acha os rostos e, se o servidor não responder em 2,5 s, reconhece sozinho. O chip "Reconhecendo no servidor central" no topo mostra onde está acontecendo agora.',
            'Token de servidor de IA vazou ou o PC foi perdido: revogue o servidor no quadro "Servidores de IA". Ele é desconectado na hora.',
            'Catracas e leitores são cadastrados em Leitores e dispositivos.'
        ]
    },

    '/config/comunicacao': {
        titulo: 'Comunicação & Integrações',
        objetivo: 'E-mail, Telegram, WhatsApp, alertas automáticos, modelos de mensagem e a cópia dos documentos no Google Drive.',
        passos: [
            'Em "Canais & Conexões", preencha o canal e use o botão de teste.',
            'Telegram: crie o bot no @BotFather (Bot Token) e pegue o Chat ID no @userinfobot.',
            'Telegram tem dois destinos: o "Chat ID Global" recebe a watchlist (pode ser o grupo da equipe); o "Chat ID dos alertas do sistema" recebe leitor sem conexão, PC do evento desconectado, lotação e servidor (use o seu pessoal).',
            'Clique "Salvar Alterações" no fim da página.',
            'Em "Alertas & Automações", ligue os alertas e salve de novo.'
        ],
        atencao: [
            'Canais e alertas só gravam com "Salvar Alterações"; os modelos têm o botão "Salvar template".',
            'Google Drive: precisa das credenciais no servidor (guia docs/GOOGLE_DRIVE.md). Depois, "Conectar Google Drive" e "Copiar tudo deste evento".'
        ]
    },
    '/config/permissoes': {
        titulo: 'Perfis de acesso',
        objetivo: 'Os módulos que todo operador novo recebe.',
        passos: ['Marque os módulos e clique "Salvar perfil".', 'Se quiser aplicar aos operadores que já existem, use "Aplicar a todos".'],
        atencao: ['"Aplicar a todos" substitui os ajustes individuais feitos em Operadores.']
    },
    '/config/seguranca': {
        titulo: 'Segurança',
        objetivo: 'Duração do login e proteções de acesso.',
        passos: ['Ajuste e clique "Salvar regras".']
    },
    '/config/webhooks': {
        titulo: 'Webhooks e chaves de API',
        objetivo: 'Integrar com outros sistemas (ERP, PowerBI, Zapier).',
        passos: ['"Gerar novo" cria uma chave de API.', 'Em "Novo webhook", escolha o gatilho, informe a URL e "Adicionar webhook".'],
        atencao: ['Revogar uma chave corta o acesso de quem a usa.', 'Excluir um webhook não pede confirmação.']
    },
    '/config/cron': {
        titulo: 'Rotinas automáticas',
        objetivo: 'Horários do fechamento do dia, do relatório diário e da limpeza de registros.',
        passos: ['Ajuste os horários e clique "Salvar Alterações".'],
        atencao: [
            'O relatório diário precisa rodar depois do reset de turno.',
            '"Reset de Turno Agora" fecha o dia na hora: use só no fim do expediente.'
        ]
    },
    '/config/idiomas': {
        titulo: 'Idiomas',
        objetivo: 'Idioma padrão do painel e do portal.',
        atencao: ['Salva ao escolher; vale depois de recarregar a página.']
    },
    '/config/banco-dados': {
        titulo: 'Banco de dados',
        objetivo: 'Conferir a conexão com o banco e a sincronização.',
        passos: ['"Testar conexão" mostra a latência.'],
        atencao: ['Os campos são somente leitura.']
    },
    '/config/gamificacao': {
        titulo: 'Gamificação',
        objetivo: 'Pontos por ações dos participantes.',
        passos: ['Ligue "Computar pontuação por ações isoladas", ajuste os pontos e salve.']
    },
    '/config/logs': {
        titulo: 'Auditoria e logs — logs técnicos',
        objetivo: 'Registros técnicos do servidor, para investigar erros. As ações dos usuários ficam na aba "Ações dos usuários".',
        passos: ['Escolha o nível e o período e clique "Filtrar".'],
        atencao: ['"Limpar logs" apaga os registros e não pode ser desfeito.']
    },
};

// Rotas antigas que abrem outra tela
const APELIDOS = {
    '/config/integracoes': '/config/comunicacao',
    '/config/notificacoes': '/config/comunicacao',
    '/config/terminais': '/config/dispositivos',
    '/config/leitor-facial': '/config/dispositivos',
    '/config/ia-facial': '/config/cameras'
};

/** Ajuda da rota atual (com a chave usada para lembrar que já foi vista), ou null. */
export function ajudaDaRota(pathname) {
    const rota = (pathname || '/').replace(/\/+$/, '') || '/';
    const chave = APELIDOS[rota] || rota;
    const ajuda = AJUDAS[chave];
    return ajuda ? { ...ajuda, chave } : null;
}

export const ROTAS_COM_AJUDA = Object.keys(AJUDAS);
