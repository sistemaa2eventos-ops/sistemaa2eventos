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
        objetivo: 'Cadastra as empresas contratadas do evento, as cotas diárias e envia o link para cada empresa cadastrar a própria equipe.',
        passos: [
            '"Nova empresa": preencha "Dados cadastrais", depois "Configurações" (cota, dias permitidos, regra de remuneração) e "Documentos". "Finalizar & salvar".',
            'Clique em "Gerar convite de cadastro" e envie o link por WhatsApp, e-mail ou copie.',
            'Use "Gerenciar cotas diárias" para limitar quantas pessoas da empresa entram por dia.'
        ],
        atencao: [
            'Gerar um novo link invalida o anterior: quem tiver o link antigo não consegue mais se cadastrar.',
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
        objetivo: 'Conferir os documentos enviados (RG/CNH, ASO, NRs) e aprovar, reprovar ou pedir reenvio. Quem não tem os documentos exigidos da função fica pendente.',
        passos: [
            'Na aba "Fila de análise", clique em "Ver e analisar documento".',
            'Escolha a ação. Ao aprovar, informe o "Tipo do documento" e a "Data de Validade" quando o tipo exigir.',
            'Na aba "Colaboradores", veja o que falta para cada pessoa; em "Vencimentos", o que vai vencer.'
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
        objetivo: 'Registrar a entrada: por leitor de código, CPF, QR, busca por nome com pulseira, ou pela ficha aberta pelo leitor facial.',
        passos: [
            'Em "Conectar leitor facial", escolha o leitor da sua baia e dê o "Nome da estação".',
            'Escolha a área (ou "Todas as áreas (global)").',
            'Bipe ou digite no campo "Leitor ou CPF" e aperte Enter — ou busque pelo nome, informe a pulseira e clique "Vincular pulseira & autorizar".'
        ],
        atencao: [
            'Enter no campo libera a entrada na hora, sem pulseira.',
            'Com o leitor facial vinculado, a ficha da pessoa abre sozinha quando ela passa o rosto — só na estação ligada àquele leitor.',
            'Sem internet, a entrada fica guardada no aparelho ("Aguardando envio") e sobe sozinha depois.'
        ],
        dicas: [
            'Com "Imprimir etiqueta" ligado no evento, a etiqueta sai sozinha a cada entrada nova.',
            '"Modo quiosque (tela cheia)" esconde o menu para a estação de atendimento.'
        ]
    },
    '/checkout': {
        titulo: 'Check-out',
        objetivo: 'Registrar a saída por leitor, CPF, pulseira, QR ou leitor facial.',
        passos: [
            'Vincule a estação e escolha a área, como no check-in.',
            'Bipe ou digite no campo "Leitor, CPF ou pulseira" e aperte Enter (ou "Registrar saída").'
        ],
        atencao: [
            'Com leitor facial vinculado, o reconhecimento já registra a saída, sem confirmação.',
            'Quem não registrar a saída fica "a conferir" no relatório quando o dia vira.'
        ]
    },
    '/fiscalizacao': {
        titulo: 'Fiscalização de áreas',
        objetivo: 'Conferir pulseiras e credenciais nos postos internos, sem registrar entrada nem saída.',
        passos: [
            'Escolha o "Posto de fiscalização" (a área onde você está).',
            'Bipe a pulseira/crachá, use "Ler pela câmera" ou busque pelo nome.',
            'Veja o resultado: LIBERADO, NÃO AUTORIZADO ou BLOQUEADO, com as áreas permitidas.'
        ],
        dicas: ['O posto fica salvo neste navegador. Os contadores valem só para esta sessão da tela.']
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
            'A aba Diárias só mostra valores para empresas com regra de remuneração.'
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
        titulo: 'Logs de auditoria',
        objetivo: 'Histórico de quem fez o quê no painel (cadastros, aprovações, bloqueios, configurações). Somente leitura.',
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
        objetivo: 'Reúne todas as configurações em abas. Cada aba tem a própria ajuda quando aberta pelo menu.',
        dicas: ['Ordem sugerida para um evento novo: Áreas → Pulseiras → Documentos → Leitores e dispositivos → Etiquetas → Comunicação.']
    },
    '/config/geral': {
        titulo: 'Configurações gerais',
        objetivo: 'Nome e logo do sistema, comportamento da interface e alerta de lotação.',
        passos: ['Ajuste e clique em "Salvar Alterações".'],
        atencao: ['A logo enviada só fica gravada depois de "Salvar Alterações".']
    },
    '/config/credenciamento': {
        titulo: 'Credenciamento',
        objetivo: 'Campos do cadastro por tipo (Participante, Expositor, Staff), aprovação automática e texto da LGPD.',
        passos: ['Em cada aba, marque "Habilitado" e "Obrigatório" por campo.', 'Defina a "Auto-aprovação" e o texto de consentimento.', 'Clique em "Salvar matriz de campos" (grava tudo, das três abas).'],
        atencao: ['Com a auto-aprovação desligada, quem se cadastra fica "Pendente" até alguém aprovar.']
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
        passos: ['"Nova área": nome e "Capacidade máxima" (0 = ilimitada).', 'Crie as áreas antes de configurar pulseiras e leitores.'],
        atencao: ['Cada leitor só recebe os rostos das pessoas autorizadas na área dele.']
    },
    '/config/pulseiras': {
        titulo: 'Pulseiras',
        objetivo: 'Lotes de pulseiras: cor, faixa de números e áreas liberadas.',
        passos: ['"Provisionar lote": nome, cor, número inicial e final, método de leitura e "Zonas de acesso permitidas".', '"Criar lote".'],
        atencao: ['Crie as áreas antes: lote sem zona fica "Sem acesso".', 'Excluir um lote é irreversível.']
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
            'Clique "Sync" para enviar os rostos. Em até 1 minuto o leitor aparece online.'
        ],
        atencao: [
            '"Fail Open" libera a passagem se o sistema cair; "Fail Closed" nega. Para segurança, prefira Fail Closed com internet de reserva.',
            '"Liberar" e "Travar" ficam valendo até clicar "Normal".',
            'Leitor de credenciamento não grava entrada/saída: só abre a ficha na tela do operador vinculado.',
            'Reserve um IP fixo para cada leitor no roteador.'
        ],
        dicas: ['A "Fila de Sincronização" mostra os rostos que falharam; use "Reenviar".']
    },
    '/config/leitor-facial': {
        titulo: 'Leitor facial',
        objetivo: 'Terminais faciais e parâmetros biométricos (limiar de reconhecimento e anti-fake).',
        passos: ['Cadastre ou edite o terminal e use "Testar conexão" e "Sincronizar faces".', 'Ajuste o "Limiar de Reconhecimento" e salve.'],
        atencao: ['É a mesma lista de Leitores e dispositivos: o que muda aqui muda lá.', 'Remover aqui não apaga os dados do aparelho.']
    },
    '/config/etiquetas': {
        titulo: 'Etiquetas e crachás',
        objetivo: 'Desenhar a etiqueta que sai na impressora do computador do operador no check-in.',
        passos: [
            'Defina "Largura (mm)" e "Altura (mm)" do papel (o "Modelo" não muda o tamanho sozinho).',
            'Adicione "Texto / variável" e "QR code" e arraste no desenho.',
            '"Salvar layout do evento" e depois "Imprimir teste".',
            'No cadastro do evento, ligue "Habilitar impressão de etiquetas".'
        ],
        atencao: ['Variáveis: {nome_pessoa}, {nome_completo}, {empresa}, {funcao}, {cpf}, {pulseira}, {evento}, {data}.'],
        dicas: ['Para não abrir a janela de impressão a cada pessoa, abra o navegador da recepção com a opção --kiosk-printing.']
    },
    '/config/veiculos': {
        titulo: 'Veículos e estacionamento',
        objetivo: 'Leitura automática de placas (LPR).',
        passos: ['Ligue o módulo, informe o endereço do motor de leitura e a confiança mínima. Salve.']
    },
    '/config/cameras': {
        titulo: 'Câmeras',
        objetivo: 'Câmeras IP usadas no Monitor CFTV e na IA facial.',
        passos: ['"Cadastrar nova câmera": nome, área, IP, porta RTSP, usuário e senha.', 'Use "Testar" e depois "Abrir no monitor CFTV".'],
        atencao: ['"Vigilância 24 h" só funciona com a IA ligada.', 'As câmeras são acessadas pelo agente local: ele precisa estar ligado.']
    },
    '/config/ia-facial': {
        titulo: 'IA facial e câmeras',
        objetivo: 'Equilibrar precisão, fluidez do vídeo e carga no computador do evento.',
        passos: ['Confira o status do motor no topo.', 'Escolha o perfil (Equilibrado é o recomendado) e ajuste.', '"Salvar e aplicar".'],
        atencao: ['Trocar de perfil desfaz os ajustes finos.', 'Se o motor aparecer em CPU, prefira o perfil Leve.']
    },
    '/config/comunicacao': {
        titulo: 'Comunicação & Integrações',
        objetivo: 'E-mail, Telegram, WhatsApp, alertas automáticos, modelos de mensagem e a cópia dos documentos no Google Drive.',
        passos: [
            'Em "Canais & Conexões", preencha o canal e use o botão de teste.',
            'Telegram: crie o bot no @BotFather (Bot Token) e pegue o Chat ID no @userinfobot.',
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
        titulo: 'Logs do sistema',
        objetivo: 'Registros técnicos do servidor, para investigar erros.',
        passos: ['Escolha o nível e o período e clique "Filtrar".'],
        atencao: ['"Limpar logs" apaga os registros e não pode ser desfeito.']
    }
};

// Rotas antigas que abrem outra tela
const APELIDOS = {
    '/config/integracoes': '/config/comunicacao',
    '/config/notificacoes': '/config/comunicacao',
    '/config/terminais': '/config/dispositivos'
};

/** Ajuda da rota atual (com a chave usada para lembrar que já foi vista), ou null. */
export function ajudaDaRota(pathname) {
    const rota = (pathname || '/').replace(/\/+$/, '') || '/';
    const chave = APELIDOS[rota] || rota;
    const ajuda = AJUDAS[chave];
    return ajuda ? { ...ajuda, chave } : null;
}

export const ROTAS_COM_AJUDA = Object.keys(AJUDAS);
