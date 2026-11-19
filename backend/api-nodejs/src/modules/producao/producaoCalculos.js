'use strict';

const crypto = require('crypto');

const ALGORITMO_CIFRA = 'aes-256-gcm';

function obterChaveCriptografia() {
    const segredo = process.env.PRODUCAO_ENCRYPTION_KEY
        || process.env.JWT_SECRET
        || process.env.SUPABASE_SERVICE_ROLE_KEY
        || 'nzt-producao-key';
    return crypto.createHash('sha256').update(String(segredo)).digest();
}

/**
 * Cifra dados sensíveis (chave PIX / conta bancária) usando AES-256-GCM.
 */
function cifrarDadosBancarios(textoPlano) {
    if (!textoPlano) return null;
    const texto = String(textoPlano).trim();
    if (!texto) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITMO_CIFRA, obterChaveCriptografia(), iv);
    const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${cifrado.toString('base64')}`;
}

/**
 * Decifra dados bancários protegidos por AES-256-GCM.
 */
function decifrarDadosBancarios(textoCifrado) {
    if (!textoCifrado || typeof textoCifrado !== 'string') return null;
    const partes = textoCifrado.split(':');
    if (partes.length !== 3) return null;
    try {
        const iv = Buffer.from(partes[0], 'base64');
        const tag = Buffer.from(partes[1], 'base64');
        const conteudo = Buffer.from(partes[2], 'base64');
        const decipher = crypto.createDecipheriv(ALGORITMO_CIFRA, obterChaveCriptografia(), iv);
        decipher.setAuthTag(tag);
        const claro = Buffer.concat([decipher.update(conteudo), decipher.final()]);
        return claro.toString('utf8');
    } catch {
        return null;
    }
}

const PAPEIS_VEEM_TODOS_CACHES = new Set(['admin_master', 'master', 'produtor_geral', 'financeiro', 'auditoria']);
const PAPEIS_VEEM_ORCAMENTOS = new Set(['admin_master', 'master', 'produtor_geral', 'financeiro', 'auditoria']);
const PAPEIS_APROVAM_PLANTA = new Set(['admin_master', 'master', 'arquiteto_evento']);
const PAPEIS_APROVAM_TAREFA = new Set(['admin_master', 'master', 'produtor_geral']);
const PAPEIS_MANUTENCAO_CATALOGO = new Set(['admin_master', 'master', 'produtor_geral', 'auditoria']);

/**
 * Resolve o contexto efetivo do usuário no Módulo de Produção.
 * Admin Master pode simular outro perfil via headers para validação operacional.
 */
function resolverContextoUsuario(estado, user, headers = {}) {
    const produtores = estado?.produtores || [];

    if (user?.eh_portal_produtor === true) {
        const portalLogin = String(user?.login_acesso || user?.email || '').trim().toLowerCase();
        const vinculoPortal = produtores.find((p) =>
            (user.produtor_id && p.id === user.produtor_id) ||
            (portalLogin && ((p.login_acesso || '').toLowerCase() === portalLogin || (p.email || '').toLowerCase() === portalLogin))
        ) || null;

        return {
            userId: vinculoPortal?.id || user.produtor_id || null,
            email: (vinculoPortal?.email || user?.email || '').toLowerCase(),
            login_acesso: vinculoPortal?.login_acesso || portalLogin || null,
            nome: vinculoPortal?.nome || user?.nome || 'Produtor',
            ehMaster: false,
            simulando: false,
            eh_portal_produtor: true,
            papel_producao: vinculoPortal?.papel_producao || 'produtor_area',
            area_id: vinculoPortal?.area_id || null,
            produtorId: vinculoPortal?.id || user.produtor_id || null
        };
    }

    const rawRole = user?.nivel_acesso || user?.role || 'operador';
    const ehMaster = rawRole === 'admin_master' || rawRole === 'master';
    const userId = user?.id || null;
    const email = (user?.email || '').toLowerCase();

    const vinculo = produtores.find((p) =>
        (userId && p.user_id === userId) ||
        (email && p.email && p.email.toLowerCase() === email)
    ) || null;

    const simPerfil = ehMaster ? (headers['x-producao-perfil-simulacao'] || '').trim() : '';
    const simArea = ehMaster ? (headers['x-producao-area-simulacao'] || '').trim() : '';

    if (simPerfil) {
        const areaPadraoSim = simArea || (estado?.areas?.[0]?.id || null);
        const produtorSim = produtores.find((p) =>
            p.papel_producao === simPerfil && (!areaPadraoSim || p.area_id === areaPadraoSim)
        ) || produtores.find((p) => p.papel_producao === simPerfil) || null;

        return {
            userId,
            email,
            nome: user?.nome || user?.nome_completo || email || 'Simulação',
            ehMaster: false,
            simulando: true,
            papel_producao: simPerfil,
            area_id: simPerfil === 'produtor_area' ? (simArea || produtorSim?.area_id || areaPadraoSim) : null,
            produtorId: produtorSim?.id || vinculo?.id || null
        };
    }

    if (ehMaster) {
        return {
            userId,
            email,
            nome: user?.nome || user?.nome_completo || email || 'Admin Master',
            ehMaster: true,
            simulando: false,
            papel_producao: 'admin_master',
            area_id: null,
            produtorId: vinculo?.id || null
        };
    }

    if (vinculo) {
        return {
            userId,
            email,
            nome: vinculo.nome || user?.nome || email,
            ehMaster: false,
            simulando: false,
            papel_producao: vinculo.papel_producao || 'produtor_area',
            area_id: vinculo.area_id || null,
            produtorId: vinculo.id
        };
    }

    const papelFallback = rawRole === 'admin' ? 'produtor_geral' : 'produtor_area';
    return {
        userId,
        email,
        nome: user?.nome || user?.nome_completo || email || 'Produtor',
        ehMaster: false,
        simulando: false,
        papel_producao: papelFallback,
        area_id: null,
        produtorId: null
    };
}

/**
 * Regra de segurança obrigatória: cachê e dados bancários são visíveis apenas
 * para Financeiro, Auditoria, Produtor Geral, Admin Master ou o próprio produtor.
 */
function podeVerCache(ctx, produtor) {
    if (!ctx || !produtor) return false;
    if (PAPEIS_VEEM_TODOS_CACHES.has(ctx.papel_producao)) return true;
    if (ctx.produtorId && produtor.id === ctx.produtorId) return true;
    if (!ctx.eh_portal_produtor) {
        if (ctx.userId && produtor.user_id && produtor.user_id === ctx.userId) return true;
        if (ctx.email && produtor.email && produtor.email.toLowerCase() === ctx.email.toLowerCase()) return true;
    }
    return false;
}

/**
 * Remove campos financeiros confidenciais no servidor quando o solicitante não tem permissão.
 */
function sanitizarProdutorParaUsuario(produtor, ctx) {
    const copia = {
        ...produtor,
        login_acesso: produtor.login_acesso || produtor.email || null,
        possui_login: Boolean(produtor.senha_hash || produtor.possui_login || produtor.user_id),
        login_atualizado_em: produtor.login_atualizado_em || null
    };
    delete copia.senha_hash;
    const permitido = podeVerCache(ctx, produtor);

    if (!permitido) {
        delete copia.dados_bancarios_cifrados;
        delete copia.chave_pix;
        delete copia.historico_cache;
        copia.valor_cache_centavos = null;
        copia.tipo_cache = null;
        copia.cache_restrito = true;
        return copia;
    }

    const pixDecifrado = copia.dados_bancarios_cifrados
        ? decifrarDadosBancarios(copia.dados_bancarios_cifrados)
        : (copia.chave_pix || null);

    delete copia.dados_bancarios_cifrados;
    copia.chave_pix = pixDecifrado;
    copia.cache_restrito = false;
    return copia;
}

function podeVerOrcamentos(ctx) {
    return Boolean(ctx && PAPEIS_VEEM_ORCAMENTOS.has(ctx.papel_producao));
}

function podeAprovarPlanta(ctx) {
    return Boolean(ctx && PAPEIS_APROVAM_PLANTA.has(ctx.papel_producao));
}

function podeAprovarTarefa(ctx) {
    return Boolean(ctx && PAPEIS_APROVAM_TAREFA.has(ctx.papel_producao));
}

function podeGerenciarCatalogo(ctx) {
    return Boolean(ctx && PAPEIS_MANUTENCAO_CATALOGO.has(ctx.papel_producao));
}

/**
 * Filtra tarefas conforme o papel: produtor de área vê apenas tarefas da sua área;
 * staff vê apenas tarefas atribuídas a ele.
 */
function filtrarTarefasPorPermissao(tarefas = [], ctx) {
    if (!ctx) return [];
    if (['admin_master', 'master', 'produtor_geral', 'arquiteto_evento', 'auditoria', 'financeiro'].includes(ctx.papel_producao)) {
        return tarefas;
    }
    if (ctx.papel_producao === 'produtor_area') {
        if (!ctx.area_id) {
            return tarefas.filter((t) => ctx.produtorId && t.produtor_atribuido_id === ctx.produtorId);
        }
        return tarefas.filter((t) =>
            t.area_id === ctx.area_id || (ctx.produtorId && t.produtor_atribuido_id === ctx.produtorId)
        );
    }
    if (ctx.papel_producao === 'staff') {
        return tarefas.filter((t) => ctx.produtorId && t.produtor_atribuido_id === ctx.produtorId);
    }
    return [];
}

/**
 * Calcula progresso por etapa, percentual de prazo consumido, atraso previsto e risco.
 */
function calcularAnalisePrazoTarefa(tarefa, agora = new Date()) {
    const etapas = Array.isArray(tarefa.etapas) ? tarefa.etapas : [];
    const totalEtapas = etapas.length;
    const etapasConcluidas = etapas.filter((e) => e.concluida).length;
    const percentualConcluido = totalEtapas > 0
        ? Math.round((etapasConcluidas / totalEtapas) * 100)
        : (tarefa.status === 'concluida' ? 100 : Number(tarefa.percentual_concluido || 0));

    const inicio = tarefa.data_inicio_planejada ? new Date(tarefa.data_inicio_planejada) : null;
    const fim = tarefa.data_fim_planejada ? new Date(tarefa.data_fim_planejada) : null;
    const refAgora = agora instanceof Date ? agora : new Date(agora);

    let percentualPrazoConsumido = 0;
    let atrasoPrevistoHoras = 0;
    let saudePrazo = 'no_prazo';

    if (tarefa.status === 'concluida') {
        const fimReal = tarefa.data_fim_real ? new Date(tarefa.data_fim_real) : refAgora;
        if (fim && fimReal > fim) {
            atrasoPrevistoHoras = Math.round(((fimReal - fim) / 3600000) * 10) / 10;
        }
        return {
            total_etapas: totalEtapas,
            etapas_concluidas: etapasConcluidas,
            percentual_concluido: 100,
            percentual_prazo_consumido: 100,
            atraso_previsto_horas: atrasoPrevistoHoras,
            saude_prazo: 'concluida'
        };
    }

    if (inicio && fim && fim > inicio) {
        const duracaoTotalMs = fim.getTime() - inicio.getTime();
        const decorridoMs = Math.max(0, refAgora.getTime() - inicio.getTime());
        percentualPrazoConsumido = Math.min(200, Math.round((decorridoMs / duracaoTotalMs) * 100));

        if (refAgora > fim) {
            saudePrazo = 'atrasada';
            atrasoPrevistoHoras = Math.round(((refAgora.getTime() - fim.getTime()) / 3600000) * 10) / 10;
        } else if (percentualPrazoConsumido >= 70 && percentualConcluido < 50) {
            saudePrazo = 'em_risco';
            const ritmoNecessario = percentualConcluido > 0
                ? decorridoMs / (percentualConcluido / 100)
                : duracaoTotalMs * 1.4;
            const terminoProjetado = inicio.getTime() + ritmoNecessario;
            if (terminoProjetado > fim.getTime()) {
                atrasoPrevistoHoras = Math.round(((terminoProjetado - fim.getTime()) / 3600000) * 10) / 10;
            }
        } else if (tarefa.status === 'bloqueada') {
            saudePrazo = 'em_risco';
        }
    } else if (tarefa.status === 'bloqueada') {
        saudePrazo = 'em_risco';
    }

    return {
        total_etapas: totalEtapas,
        etapas_concluidas: etapasConcluidas,
        percentual_concluido: percentualConcluido,
        percentual_prazo_consumido: percentualPrazoConsumido,
        atraso_previsto_horas: atrasoPrevistoHoras,
        saude_prazo: saudePrazo
    };
}

/**
 * Calcula cadeia de caminho crítico (dependências fim -> início) e propaga impacto de atrasos.
 */
function calcularCaminhoCritico(tarefas = [], dependencias = [], agora = new Date()) {
    const mapa = new Map();
    const analisadas = tarefas.map((t) => {
        const analise = calcularAnalisePrazoTarefa(t, agora);
        const item = {
            ...t,
            ...analise,
            eh_caminho_critico: false,
            impacto_atraso_horas: analise.atraso_previsto_horas,
            bloqueada_por_dependencia: false
        };
        mapa.set(item.id, item);
        return item;
    });

    const predecessorasPorDestino = new Map();
    const sucessorasPorOrigem = new Map();
    for (const dep of dependencias) {
        if (!predecessorasPorDestino.has(dep.tarefa_dependente_id)) {
            predecessorasPorDestino.set(dep.tarefa_dependente_id, []);
        }
        predecessorasPorDestino.get(dep.tarefa_dependente_id).push(dep.tarefa_origem_id);

        if (!sucessorasPorOrigem.has(dep.tarefa_origem_id)) {
            sucessorasPorOrigem.set(dep.tarefa_origem_id, []);
        }
        sucessorasPorOrigem.get(dep.tarefa_origem_id).push(dep.tarefa_dependente_id);
    }

    // Identifica nós com maior cadeia de dependências e propaga atrasos
    const profundidade = new Map();
    const visitando = new Set();

    function calcularProfundidade(id) {
        if (profundidade.has(id)) return profundidade.get(id);
        if (visitando.has(id)) return 1;
        visitando.add(id);
        const sucs = sucessorasPorOrigem.get(id) || [];
        let maxSuc = 0;
        for (const sId of sucs) {
            if (mapa.has(sId)) {
                maxSuc = Math.max(maxSuc, calcularProfundidade(sId));
            }
        }
        visitando.delete(id);
        const val = 1 + maxSuc;
        profundidade.set(id, val);
        return val;
    }

    let maiorCadeia = 0;
    for (const t of analisadas) {
        const p = calcularProfundidade(t.id);
        if (p > maiorCadeia) maiorCadeia = p;
    }

    // Marca caminho crítico (tarefas em cadeias principais >= 2 ou prioridade crítica com dependentes)
    for (const t of analisadas) {
        const sucs = sucessorasPorOrigem.get(t.id) || [];
        const preds = predecessorasPorDestino.get(t.id) || [];
        const p = profundidade.get(t.id) || 1;
        if ((maiorCadeia >= 2 && (p === maiorCadeia || (preds.length > 0 && p >= 1))) || (t.prioridade === 'critica' && sucs.length > 0)) {
            t.eh_caminho_critico = true;
        }
        for (const pId of preds) {
            const pred = mapa.get(pId);
            if (pred && pred.status !== 'concluida') {
                t.bloqueada_por_dependencia = true;
                if (pred.impacto_atraso_horas > 0) {
                    t.impacto_atraso_horas = Math.max(t.impacto_atraso_horas, pred.impacto_atraso_horas);
                }
            }
        }
    }

    return analisadas;
}

const ELEMENTO_DIFF_CAMPOS = ['x', 'y', 'largura', 'altura', 'rotacao', 'tipo', 'rotulo', 'cor', 'texto'];

function elementoFoiModificado(a, b) {
    return ELEMENTO_DIFF_CAMPOS.some((c) => a?.[c] !== b?.[c]);
}

/**
 * Compara os elementos da versão oficial base com a proposta de intervenção.
 */
function compararPropostaPlanta(versaoBase, proposta) {
    const baseElementos = Array.isArray(versaoBase?.elementos_json) ? versaoBase.elementos_json : [];
    const propElementos = Array.isArray(proposta?.elementos_alterados_json) ? proposta.elementos_alterados_json : [];

    const mapaBase = new Map(baseElementos.map((e) => [e.id, e]));
    const mapaProp = new Map(propElementos.map((e) => [e.id, e]));

    const adicionados = [];
    const modificados = [];
    const removidos = [];
    const inalterados = [];

    for (const elem of propElementos) {
        if (!mapaBase.has(elem.id)) {
            adicionados.push({ ...elem, diff_status: 'adicionado' });
        } else {
            const antigo = mapaBase.get(elem.id);
            if (elementoFoiModificado(antigo, elem)) {
                modificados.push({ ...elem, anterior: antigo, diff_status: 'modificado' });
            } else {
                inalterados.push({ ...elem, diff_status: 'inalterado' });
            }
        }
    }

    for (const elem of baseElementos) {
        if (!mapaProp.has(elem.id)) {
            removidos.push({ ...elem, diff_status: 'removido' });
        }
    }

    return {
        adicionados,
        modificados,
        removidos,
        inalterados,
        resumo: {
            adicionados: adicionados.length,
            modificados: modificados.length,
            removidos: removidos.length
        }
    };
}

/**
 * Verifica se outras propostas pendentes ou aprovadas alteram os mesmos elementos da planta.
 */
function detectarConflitosPropostas(versaoBase, propostaAlvo, outrasPropostas = []) {
    const diffAlvo = compararPropostaPlanta(versaoBase, propostaAlvo);
    const idsTocadosAlvo = new Set([
        ...diffAlvo.adicionados.map((e) => e.id),
        ...diffAlvo.modificados.map((e) => e.id),
        ...diffAlvo.removidos.map((e) => e.id)
    ]);

    const conflitos = [];
    for (const outra of outrasPropostas) {
        if (!outra || outra.id === propostaAlvo.id || !['pendente', 'em_analise', 'aprovada'].includes(outra.status)) {
            continue;
        }
        const diffOutra = compararPropostaPlanta(versaoBase, outra);
        const idsOutra = [
            ...diffOutra.adicionados.map((e) => e.id),
            ...diffOutra.modificados.map((e) => e.id),
            ...diffOutra.removidos.map((e) => e.id)
        ];
        const emComum = idsOutra.filter((id) => idsTocadosAlvo.has(id));
        if (emComum.length > 0) {
            conflitos.push({
                proposta_conflitante_id: outra.id,
                proposta_conflitante_titulo: outra.titulo,
                elementos_em_conflito: emComum
            });
        }
    }
    return conflitos;
}

/**
 * Avalia se um novo registro de presença configura dobra (segundo turno no mesmo dia
 * ou jornada acumulada superior a 10 horas).
 */
function avaliarDobraPresenca(registrosAnteriores = [], produtorId, dataHoraISO) {
    const dataRef = new Date(dataHoraISO);
    const diaRef = dataRef.toISOString().slice(0, 10);
    const doDia = registrosAnteriores.filter((r) =>
        r.produtor_id === produtorId &&
        String(r.data_hora || '').slice(0, 10) === diaRef
    );

    const checkinsHoje = doDia.filter((r) => r.tipo === 'checkin');
    const checkoutsHoje = doDia.filter((r) => r.tipo === 'checkout');

    if (checkinsHoje.length >= 1 && checkoutsHoje.length >= 1) {
        return { ehDobra: true, motivo: 'Segundo turno no mesmo dia (dobra de escala)' };
    }

    if (checkinsHoje.length > 0) {
        const primeiroCheckin = new Date(checkinsHoje[0].data_hora);
        const horas = (dataRef.getTime() - primeiroCheckin.getTime()) / 3600000;
        if (horas > 10) {
            return { ehDobra: true, motivo: `Jornada estendida (${horas.toFixed(1)}h > 10h)` };
        }
    }
    return { ehDobra: false, motivo: null };
}

module.exports = {
    cifrarDadosBancarios,
    decifrarDadosBancarios,
    resolverContextoUsuario,
    podeVerCache,
    sanitizarProdutorParaUsuario,
    podeVerOrcamentos,
    podeAprovarPlanta,
    podeAprovarTarefa,
    podeGerenciarCatalogo,
    filtrarTarefasPorPermissao,
    calcularAnalisePrazoTarefa,
    calcularCaminhoCritico,
    compararPropostaPlanta,
    detectarConflitosPropostas,
    avaliarDobraPresenca
};
