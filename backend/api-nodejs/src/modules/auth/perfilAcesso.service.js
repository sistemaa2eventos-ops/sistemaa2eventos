const { supabase } = require('../../config/supabase');

/**
 * Perfis de Acesso: gerenciamento de modelos nomeados de permissões e comportamento de tela.
 *
 * Suporta múltiplos modelos com nome e descrição (ex: Operador de Portaria, Fiscal de Áreas,
 * Coordenação de Credenciamento, Equipe de Apoio), travas granulares (somente leitura, liberar pendente)
 * e restrições de horário/turno.
 *
 * Guardado em system_settings.config.perfis_modelos e perfis_acesso.
 */

const MODULOS = [
    'dashboard', 'checkin', 'checkout', 'fiscalizacao', 'monitoramento', 'pessoas',
    'empresas', 'relatorios', 'veiculos', 'auditoria_documentos', 'producao'
];

const MODOS_TELA_VALIDOS = ['normal', 'tela_cheia', 'quiosque'];
const TIPOS_DIAS_VALIDOS = ['apenas_evento', 'montagem_e_evento', 'livre'];
const PERFIS = ['operador'];

const MODELOS_PADRAO_INICIAIS = [
    {
        id: 'portaria_catraca',
        nome: 'Operador de Portaria / Catraca',
        descricao: 'Credenciamento, validação de pulseiras e liberação de entrada e saída em modo quiosque.',
        padrao: true,
        modulos: {
            checkin: true, checkout: true, fiscalizacao: false, monitoramento: false,
            pessoas: true, empresas: false, relatorios: false, veiculos: false,
            auditoria_documentos: false, producao: false, dashboard: false
        },
        pagina_inicial: 'checkin',
        modo_tela: 'quiosque',
        regras: {
            participantes_somente_leitura: true,
            checkin_liberar_pendente: false,
            empresas_somente_leitura: true,
            bloquear_edicao_dados: true
        },
        restricoes_horario: {
            ativo: false,
            tipo_dias: 'apenas_evento',
            hora_inicio: '06:00',
            hora_fim: '23:59',
            dias_semana: [0, 1, 2, 3, 4, 5, 6]
        }
    },
    {
        id: 'fiscal_areas',
        nome: 'Fiscal de Acesso / Áreas',
        descricao: 'Conferência visual de permissão em postos internos (Camarote, Backstage, Pista) sem registrar passagem.',
        padrao: false,
        modulos: {
            checkin: false, checkout: false, fiscalizacao: true, monitoramento: true,
            pessoas: true, empresas: false, relatorios: false, veiculos: false,
            auditoria_documentos: false, producao: false, dashboard: false
        },
        pagina_inicial: 'fiscalizacao',
        modo_tela: 'tela_cheia',
        regras: {
            participantes_somente_leitura: true,
            checkin_liberar_pendente: false,
            empresas_somente_leitura: true,
            bloquear_edicao_dados: true
        },
        restricoes_horario: {
            ativo: false,
            tipo_dias: 'apenas_evento',
            hora_inicio: '12:00',
            hora_fim: '06:00',
            dias_semana: [0, 1, 2, 3, 4, 5, 6]
        }
    },
    {
        id: 'coordenacao_credenciamento',
        nome: 'Coordenação de Credenciamento',
        descricao: 'Gestão completa de participantes, auditoria documental, empresas contratadas e relatórios de fluxo.',
        padrao: false,
        modulos: {
            checkin: true, checkout: true, fiscalizacao: true, monitoramento: true,
            pessoas: true, empresas: true, relatorios: true, veiculos: true,
            auditoria_documentos: true, producao: false, dashboard: true
        },
        pagina_inicial: 'dashboard',
        modo_tela: 'normal',
        regras: {
            participantes_somente_leitura: false,
            checkin_liberar_pendente: true,
            empresas_somente_leitura: false,
            bloquear_edicao_dados: false
        },
        restricoes_horario: {
            ativo: false,
            tipo_dias: 'montagem_e_evento',
            hora_inicio: '06:00',
            hora_fim: '23:59',
            dias_semana: [0, 1, 2, 3, 4, 5, 6]
        }
    },
    {
        id: 'producao_campo',
        nome: 'Equipe de Apoio à Produção',
        descricao: 'Acesso web aos cronogramas operacionais, checklists de montagem e plantas do evento.',
        padrao: false,
        modulos: {
            checkin: false, checkout: false, fiscalizacao: false, monitoramento: false,
            pessoas: false, empresas: false, relatorios: false, veiculos: false,
            auditoria_documentos: false, producao: true, dashboard: false
        },
        pagina_inicial: 'producao',
        modo_tela: 'normal',
        regras: {
            participantes_somente_leitura: true,
            checkin_liberar_pendente: false,
            empresas_somente_leitura: true,
            bloquear_edicao_dados: false
        },
        restricoes_horario: {
            ativo: false,
            tipo_dias: 'montagem_e_evento',
            hora_inicio: '06:00',
            hora_fim: '23:59',
            dias_semana: [0, 1, 2, 3, 4, 5, 6]
        }
    }
];

function normalizarModulos(modulos = {}) {
    const out = {};
    for (const m of MODULOS) out[m] = modulos[m] === true;
    return out;
}

function normalizarPaginaInicial(pagina) {
    if (!pagina || typeof pagina !== 'string') return null;
    return MODULOS.includes(pagina) ? pagina : null;
}

function normalizarModoTela(modo) {
    return MODOS_TELA_VALIDOS.includes(modo) ? modo : 'normal';
}

function normalizarRegras(regras = {}) {
    return {
        participantes_somente_leitura: regras.participantes_somente_leitura === true,
        checkin_liberar_pendente: regras.checkin_liberar_pendente === true,
        empresas_somente_leitura: regras.empresas_somente_leitura === true,
        bloquear_edicao_dados: regras.bloquear_edicao_dados === true
    };
}

function normalizarRestricoesHorario(restricoes = {}) {
    return {
        ativo: restricoes.ativo === true,
        tipo_dias: TIPOS_DIAS_VALIDOS.includes(restricoes.tipo_dias) ? restricoes.tipo_dias : 'apenas_evento',
        hora_inicio: typeof restricoes.hora_inicio === 'string' && restricoes.hora_inicio ? restricoes.hora_inicio : '06:00',
        hora_fim: typeof restricoes.hora_fim === 'string' && restricoes.hora_fim ? restricoes.hora_fim : '23:59',
        dias_semana: Array.isArray(restricoes.dias_semana) ? restricoes.dias_semana : [0, 1, 2, 3, 4, 5, 6]
    };
}

function normalizarModelo(item = {}, index = 0) {
    const rawId = item.id || `modelo_${Date.now()}_${index}`;
    const id = String(rawId).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return {
        id,
        nome: String(item.nome || `Perfil Operacional ${index + 1}`).trim(),
        descricao: String(item.descricao || '').trim(),
        padrao: item.padrao === true,
        modulos: normalizarModulos(item.modulos || {}),
        pagina_inicial: normalizarPaginaInicial(item.pagina_inicial),
        modo_tela: normalizarModoTela(item.modo_tela),
        regras: normalizarRegras(item.regras || {}),
        restricoes_horario: normalizarRestricoesHorario(item.restricoes_horario || {}),
        criado_em: item.criado_em || item.created_at || new Date().toISOString(),
        atualizado_em: item.atualizado_em || item.updated_at || new Date().toISOString(),
        atualizado_por: item.atualizado_por || null
    };
}

async function lerConfig() {
    const { data, error } = await supabase.from('system_settings').select('config').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data?.config || {};
}

async function salvarConfig(config) {
    const { error } = await supabase
        .from('system_settings')
        .upsert({ id: 1, config, updated_at: new Date().toISOString() });
    if (error) throw error;
    return config;
}

async function obterResumoUsuarios() {
    try {
        const { data, error } = await supabase
            .from('perfis')
            .select('nivel_acesso, status, evento_id, permissions');
        if (error || !Array.isArray(data)) {
            return { operadores_total: 0, operadores_ativos: 0, operadores_especificos: 0, operadores_globais: 0, admins_master: 0 };
        }
        let operadoresTotal = 0;
        let operadoresAtivos = 0;
        let operadoresEspecificos = 0;
        let operadoresGlobais = 0;
        let adminsMaster = 0;

        for (const p of data) {
            if (p.nivel_acesso === 'admin_master' || p.nivel_acesso === 'master') {
                adminsMaster++;
                continue;
            }
            if (p.nivel_acesso === 'operador') {
                operadoresTotal++;
                if ((p.status || 'ativo') === 'ativo') operadoresAtivos++;
                const vinculo = p.permissions?.vinculo_tipo || (p.evento_id ? 'especifico' : 'global');
                if (vinculo === 'especifico') operadoresEspecificos++;
                else operadoresGlobais++;
            }
        }
        return {
            operadores_total: operadoresTotal,
            operadores_ativos: operadoresAtivos,
            operadores_especificos: operadoresEspecificos,
            operadores_globais: operadoresGlobais,
            admins_master: adminsMaster
        };
    } catch {
        return { operadores_total: 0, operadores_ativos: 0, operadores_especificos: 0, operadores_globais: 0, admins_master: 0 };
    }
}

/**
 * Retorna todos os modelos nomeados de perfis de acesso
 */
async function listarModelos({ incluirResumo = true } = {}) {
    const [config, resumoUsuarios] = await Promise.all([
        lerConfig(),
        incluirResumo ? obterResumoUsuarios() : Promise.resolve(null)
    ]);

    let lista = config.perfis_modelos;
    if (!Array.isArray(lista) || lista.length === 0) {
        lista = MODELOS_PADRAO_INICIAIS;
        // Se tinha modelo salvo antigo em perfis_acesso.operador, mescla com o primeiro modelo
        if (config.perfis_acesso?.operador?.modulos) {
            lista[0].modulos = normalizarModulos(config.perfis_acesso.operador.modulos);
            lista[0].pagina_inicial = normalizarPaginaInicial(config.perfis_acesso.operador.pagina_inicial);
            lista[0].modo_tela = normalizarModoTela(config.perfis_acesso.operador.modo_tela);
        }
    }

    // Garante que exatamente um modelo seja padrão
    let temPadrao = false;
    const modelosNormalizados = lista.map((item, idx) => {
        const norm = normalizarModelo(item, idx);
        if (norm.padrao && !temPadrao) {
            temPadrao = true;
        } else if (norm.padrao && temPadrao) {
            norm.padrao = false;
        }
        return norm;
    });

    if (!temPadrao && modelosNormalizados.length > 0) {
        modelosNormalizados[0].padrao = true;
    }

    return {
        modelos: modelosNormalizados,
        modulos: MODULOS,
        resumo_usuarios: resumoUsuarios
    };
}

async function obterModelo(id) {
    const { modelos } = await listarModelos({ incluirResumo: false });
    return modelos.find(m => m.id === id) || null;
}

async function criarModelo(dados = {}, usuario = null) {
    if (!dados.nome || !String(dados.nome).trim()) {
        const err = new Error('O nome do modelo de perfil é obrigatório.');
        err.status = 400;
        throw err;
    }

    const config = await lerConfig();
    const { modelos } = await listarModelos({ incluirResumo: false });

    const novoId = dados.id
        ? String(dados.id).toLowerCase().replace(/[^a-z0-9_-]/g, '_')
        : `modelo_${Date.now()}`;

    if (modelos.some(m => m.id === novoId)) {
        const err = new Error('Já existe um modelo com este identificador.');
        err.status = 409;
        throw err;
    }

    const novoModelo = normalizarModelo({
        ...dados,
        id: novoId,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        atualizado_por: usuario?.email || usuario?.id || null
    }, modelos.length);

    if (novoModelo.padrao) {
        modelos.forEach(m => { m.padrao = false; });
    }

    modelos.push(novoModelo);

    // Se é o único, força padrão
    if (modelos.length === 1) {
        modelos[0].padrao = true;
    }

    config.perfis_modelos = modelos;
    await salvarConfig(config);
    return novoModelo;
}

async function atualizarModelo(id, dados = {}, usuario = null) {
    const config = await lerConfig();
    const { modelos } = await listarModelos({ incluirResumo: false });
    const idx = modelos.findIndex(m => m.id === id);

    if (idx === -1) {
        const err = new Error('Modelo de perfil não encontrado.');
        err.status = 404;
        throw err;
    }

    const anterior = modelos[idx];
    const novoModelo = normalizarModelo({
        ...anterior,
        ...dados,
        id: anterior.id, // Preserva ID original
        atualizado_em: new Date().toISOString(),
        atualizado_por: usuario?.email || usuario?.id || null
    }, idx);

    if (novoModelo.padrao) {
        modelos.forEach(m => { m.padrao = false; });
        novoModelo.padrao = true;
    }

    modelos[idx] = novoModelo;

    // Se nenhum ficou como padrão, mantém o atual como padrão
    if (!modelos.some(m => m.padrao)) {
        modelos[idx].padrao = true;
    }

    config.perfis_modelos = modelos;
    await salvarConfig(config);
    return novoModelo;
}

async function excluirModelo(id) {
    const config = await lerConfig();
    const { modelos } = await listarModelos({ incluirResumo: false });

    if (modelos.length <= 1) {
        const err = new Error('Não é possível excluir o único modelo de perfil ativo.');
        err.status = 400;
        throw err;
    }

    const idx = modelos.findIndex(m => m.id === id);
    if (idx === -1) {
        const err = new Error('Modelo de perfil não encontrado.');
        err.status = 404;
        throw err;
    }

    const removido = modelos.splice(idx, 1)[0];

    // Se o removido era o padrão, passa o padrão para o primeiro
    if (removido.padrao && modelos.length > 0) {
        modelos[0].padrao = true;
    }

    config.perfis_modelos = modelos;
    await salvarConfig(config);
    return { excluido: true, id };
}

async function aplicarModeloATodos(modeloId, opcoes = {}) {
    const modelo = await obterModelo(modeloId);
    if (!modelo) {
        const err = new Error('Modelo de perfil inválido.');
        err.status = 400;
        throw err;
    }

    const incluirEventosEspecificos = opcoes.incluir_eventos_especificos !== false;
    const incluirPreferenciasTela = opcoes.incluir_preferencias_tela !== false;
    const incluirRegrasGranulares = opcoes.incluir_regras !== false;
    const incluirRestricoesHorario = opcoes.incluir_horario !== false;

    const { data: usuarios, error } = await supabase
        .from('perfis')
        .select('id, permissions')
        .eq('nivel_acesso', 'operador');
    if (error) throw error;

    const lista = usuarios || [];
    const agora = new Date().toISOString();
    let atualizados = 0;

    for (let i = 0; i < lista.length; i += 15) {
        const lote = lista.slice(i, i + 15);
        const resultados = await Promise.all(lote.map(async (u) => {
            const atual = { ...(u.permissions || {}) };
            delete atual.dispositivos;

            const permissions = {
                ...atual,
                ...modelo.modulos,
                modelo_perfil_id: modelo.id,
                modelo_perfil_nome: modelo.nome
            };

            if (incluirPreferenciasTela) {
                permissions.pagina_inicial = modelo.pagina_inicial || null;
                permissions.modo_tela = modelo.modo_tela || 'normal';
            }

            if (incluirRegrasGranulares && modelo.regras) {
                permissions.regras = { ...modelo.regras };
            }

            if (incluirRestricoesHorario && modelo.restricoes_horario) {
                permissions.restricoes_horario = { ...modelo.restricoes_horario };
            }

            if (incluirEventosEspecificos && atual.eventos_permissoes && typeof atual.eventos_permissoes === 'object') {
                const novoMapa = {};
                for (const [eid, permsEv] of Object.entries(atual.eventos_permissoes)) {
                    const limpo = { ...(permsEv || {}) };
                    delete limpo.dispositivos;
                    novoMapa[eid] = {
                        ...limpo,
                        ...modelo.modulos,
                        regras: incluirRegrasGranulares ? { ...modelo.regras } : limpo.regras
                    };
                }
                permissions.eventos_permissoes = novoMapa;
            }

            const { error: upErr } = await supabase
                .from('perfis')
                .update({ permissions, updated_at: agora })
                .eq('id', u.id);
            return !upErr;
        }));
        atualizados += resultados.filter(Boolean).length;
    }

    return { atualizados, total: lista.length, modelo_nome: modelo.nome };
}

// =========================================================================
// MÉTODOS DE COMPATIBILIDADE LEGADA COM AS ROTAS EXISTENTES (/auth/permissions/operador)
// =========================================================================

async function listar(opcoes = {}) {
    const { modelos, resumo_usuarios } = await listarModelos(opcoes);
    const modeloPadrao = modelos.find(m => m.padrao) || modelos[0];
    return PERFIS.map(perfil => ({
        nivel_acesso: perfil,
        modulos: modeloPadrao ? modeloPadrao.modulos : {},
        pagina_inicial: modeloPadrao?.pagina_inicial || null,
        modo_tela: modeloPadrao?.modo_tela || 'normal',
        regras: modeloPadrao?.regras || {},
        restricoes_horario: modeloPadrao?.restricoes_horario || {},
        personalizado: true,
        atualizado_em: modeloPadrao?.atualizado_em || null,
        atualizado_por: modeloPadrao?.atualizado_por || null,
        ...(resumo_usuarios ? { resumo_usuarios } : {})
    }));
}

async function obter(perfil, opcoes = {}) {
    const { modelos, resumo_usuarios } = await listarModelos(opcoes);
    const modeloPadrao = modelos.find(m => m.padrao) || modelos[0];
    if (!modeloPadrao) return null;
    return {
        nivel_acesso: perfil,
        modulos: modeloPadrao.modulos,
        pagina_inicial: modeloPadrao.pagina_inicial,
        modo_tela: modeloPadrao.modo_tela,
        regras: modeloPadrao.regras,
        restricoes_horario: modeloPadrao.restricoes_horario,
        personalizado: true,
        atualizado_em: modeloPadrao.atualizado_em,
        atualizado_por: modeloPadrao.atualizado_por,
        ...(resumo_usuarios ? { resumo_usuarios } : {})
    };
}

async function padraoDoPerfil(perfil) {
    try {
        const item = await obter(perfil, { incluirResumo: false });
        if (!item) {
            return {
                modulos: Object.fromEntries(MODULOS.map(m => [m, m === 'dashboard'])),
                pagina_inicial: null,
                modo_tela: 'normal',
                regras: normalizarRegras({}),
                restricoes_horario: normalizarRestricoesHorario({})
            };
        }
        return {
            modulos: item.modulos,
            pagina_inicial: item.pagina_inicial || null,
            modo_tela: item.modo_tela || 'normal',
            regras: item.regras || normalizarRegras({}),
            restricoes_horario: item.restricoes_horario || normalizarRestricoesHorario({})
        };
    } catch {
        return {
            modulos: Object.fromEntries(MODULOS.map(m => [m, m === 'dashboard'])),
            pagina_inicial: null,
            modo_tela: 'normal',
            regras: normalizarRegras({}),
            restricoes_horario: normalizarRestricoesHorario({})
        };
    }
}

async function modulosDoPerfil(perfil) {
    const padrao = await padraoDoPerfil(perfil);
    return padrao.modulos;
}

async function salvar(perfil, dados = {}, usuario) {
    const { modelos } = await listarModelos({ incluirResumo: false });
    const padrao = modelos.find(m => m.padrao) || modelos[0];
    if (padrao) {
        return atualizarModelo(padrao.id, dados, usuario);
    }
    return criarModelo({ ...dados, padrao: true }, usuario);
}

async function aplicarATodos(perfil, opcoes = {}) {
    const { modelos } = await listarModelos({ incluirResumo: false });
    const padrao = modelos.find(m => m.padrao) || modelos[0];
    if (!padrao) {
        throw new Error('Nenhum modelo de perfil encontrado.');
    }
    return aplicarModeloATodos(padrao.id, opcoes);
}

async function obterPoliticasEspeciais() {
    const config = await lerConfig();
    return {
        producao: config.politicas_producao || {
            exigir_lgpd_primeiro_acesso: true,
            permitir_ponto_geolocalizacao: true,
            ocultar_cache_tecnicos: true,
            aprovar_presenca_automatico: false
        },
        central: config.politicas_central || {
            tempo_bloqueio_inatividade_min: 15,
            exigir_confirmacao_ptz: true,
            audio_bidirecional_habilitado: true,
            auditoria_rigorosa_ativa: true
        },
        empresas: config.politicas_empresas || {
            exigir_aprovacao_edicao_participante: true,
            exigir_aprovacao_exclusao_participante: true,
            exigir_aprovacao_exclusao_documento: true,
            bloquear_pos_prazo_evento: true,
            horas_limite_pre_cadastro: 24
        }
    };
}

async function salvarPoliticasEspeciais(tipo, dados = {}, usuario = null) {
    const config = await lerConfig();
    const agora = new Date().toISOString();
    const emailUser = usuario?.email || usuario?.id || 'admin';

    if (tipo === 'producao') {
        config.politicas_producao = { ...(config.politicas_producao || {}), ...dados, atualizado_em: agora, atualizado_por: emailUser };
    } else if (tipo === 'central') {
        config.politicas_central = { ...(config.politicas_central || {}), ...dados, atualizado_em: agora, atualizado_por: emailUser };
    } else if (tipo === 'empresas') {
        config.politicas_empresas = { ...(config.politicas_empresas || {}), ...dados, atualizado_em: agora, atualizado_por: emailUser };
    } else {
        const err = new Error('Tipo de política inválido.');
        err.status = 400;
        throw err;
    }

    await salvarConfig(config);
    return obterPoliticasEspeciais();
}

module.exports = {
    MODULOS, PERFIS, MODOS_TELA_VALIDOS, TIPOS_DIAS_VALIDOS,
    listarModelos, obterModelo, criarModelo, atualizarModelo, excluirModelo, aplicarModeloATodos,
    obterPoliticasEspeciais, salvarPoliticasEspeciais,
    listar, obter, salvar, aplicarATodos, modulosDoPerfil, padraoDoPerfil
};
