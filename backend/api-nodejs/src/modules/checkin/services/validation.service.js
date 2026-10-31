const { supabase } = require('../../../config/supabase');
const { buscarTodos } = require('../../../utils/buscarTodos');
const logger = require('../../../services/logger');
const cacheService = require('../../../services/cacheService');
const { getHojeLocal, getInicioHojeLocal, getLimitesDiaLocalUTC, ultimaOcorrenciaHorario, TIMEZONE } = require('../../../utils/dateUtils');

// Logs gravados pelo credenciamento (entrega de pulseira) não contam como passagem em leitor
const MARCADOR_CREDENCIAMENTO = 'CREDENCIAMENTO';
const semCredenciamento = (query) => query.or(`observacao.is.null,observacao.neq.${MARCADOR_CREDENCIAMENTO}`);

// Evento com o mesmo cache de 15 s do requireEvent (antes: 2 consultas a `eventos` por acesso)
const buscarEventoCache = async (evento_id) => {
    const { buscarEvento } = require('../../../middleware/eventMiddleware');
    const { evento } = await buscarEvento(evento_id);
    return evento;
};

const STATS_FRESCO_MS = 10000;
const STATS_VELHO_MAX_MS = 5 * 60 * 1000;
const statsValidacao = new Map(); // evento_id → { valor, em, atualizando }

/** Último check-in/checkout da pessoa (na área). Usado pelo toggle e pelo anti-passback. */
const buscarUltimoLog = async (pessoa_id, evento_id, area_id) => {
    let query = supabase
        .from('logs_acesso')
        .select('tipo, created_at')
        .eq('pessoa_id', pessoa_id)
        .eq('evento_id', evento_id)
        .in('tipo', ['checkin', 'checkout'])
        .order('created_at', { ascending: false })
        .limit(1);
    if (area_id) query = query.eq('area_id', area_id);
    // Entrega de pulseira no credenciamento não é passagem em leitor
    query = semCredenciamento(query);
    const { data } = await query.maybeSingle();
    return data || null;
};

class ValidationService {
    async verificarFaseEvento(evento_id, pessoa, metodo = 'manual') {
        if (metodo === 'manual') return true;
        if (pessoa.status_acesso === 'checkin_feito') return true;

        const evento = await buscarEventoCache(evento_id);
        if (!evento) return true;

        const datasMontagem = evento.datas_montagem || [];
        const datasEvento = evento.datas_evento || [];
        const datasDesmontagem = evento.datas_desmontagem || [];

        // Se nenhuma data foi configurada no evento, libera acesso (sem restrição de fase)
        const nenhumaDatasConfigurada =
            datasMontagem.length === 0 &&
            datasEvento.length === 0 &&
            datasDesmontagem.length === 0;

        if (nenhumaDatasConfigurada) return true;

        const hojeLiteral = getHojeLocal();
        
        logger.debug({
            hojeLiteral,
            datasMontagem,
            datasEvento,
            datasDesmontagem,
            pessoa_fases: {
                montagem: pessoa.fase_montagem,
                showday: pessoa.fase_showday,
                desmontagem: pessoa.fase_desmontagem
            },
            pessoa_nome: pessoa.nome_completo || pessoa.nome
        }, '[FaseEvento] Diagnóstico de validação de fase');

        // Lógica Inclusiva: Identifica todas as fases que ocorrem hoje
        const ocorrendoHoje = {
            montagem: datasMontagem.includes(hojeLiteral),
            showday: datasEvento.includes(hojeLiteral),
            desmontagem: datasDesmontagem.includes(hojeLiteral)
        };

        // Se hoje não está em nenhuma das listas, mas o evento TEM datas, bloqueia por segurança
        if (!ocorrendoHoje.montagem && !ocorrendoHoje.showday && !ocorrendoHoje.desmontagem) {
            logger.warn({ hojeLiteral, datasMontagem, datasEvento, datasDesmontagem }, '[FaseEvento] Hoje não consta em nenhuma lista de datas do evento — BLOQUEADO');
            return false;
        }

        // Se hoje está em alguma fase, o usuário deve ter permissão para PELO MENOS UMA fase que ocorre hoje
        const permitidoMontagem = ocorrendoHoje.montagem && !!pessoa.fase_montagem;
        const permitidoShowday = ocorrendoHoje.showday && !!pessoa.fase_showday;
        const permitidoDesmontagem = ocorrendoHoje.desmontagem && !!pessoa.fase_desmontagem;

        const resultado = permitidoMontagem || permitidoShowday || permitidoDesmontagem;
        if (!resultado) {
            logger.warn({ ocorrendoHoje, permitidoMontagem, permitidoShowday, permitidoDesmontagem, pessoa_nome: pessoa.nome_completo || pessoa.nome }, '[FaseEvento] Pessoa não autorizada para a fase vigente — BLOQUEADO');
        }

        return resultado;
    }

    async getRealtimeStatsInternal(evento_id) {
        const hoje = getHojeLocal();
        // created_at é gravado em UTC: o dia local (America/Sao_Paulo) vai de 03:00Z a 02:59:59Z
        const { start: startOfDay, end: endOfDay } = getLimitesDiaLocalUTC(hoje);

        // Contagens exatas feitas no banco (head: true), todas em paralelo.
        // Antes: 6 consultas em sequência e os logs do dia trazidos para a memória —
        // e o PostgREST corta em 1000 linhas, o que zerava/errava os números em dias grandes.
        const contarLogs = (filtro) => {
            let q = supabase.from('logs_acesso').select('id', { count: 'exact', head: true })
                .eq('evento_id', evento_id).gte('created_at', startOfDay).lte('created_at', endOfDay);
            return filtro(q);
        };

        const [
            { count: countPresentes },
            { data: evento },
            { count: countCheckinsHoje },
            { count: countCheckoutsHoje },
            { count: countNegadosHoje },
            { count: countFiscalizacoesHoje },
            { data: areasData },
            { data: presentesNtoN },
            { data: quotasHoje }
        ] = await Promise.all([
            // Presentes = quem está com entrada registrada (mesmo estado usado pelo anti-passback;
            // o fechamento de turno zera no horario_reset)
            supabase.from('pessoas').select('id', { count: 'exact', head: true })
                .eq('evento_id', evento_id).eq('status_acesso', 'checkin_feito'),
            supabase.from('eventos').select('capacidade_total').eq('id', evento_id).single(),
            contarLogs(q => q.eq('tipo', 'checkin')),
            contarLogs(q => q.eq('tipo', 'checkout')),
            contarLogs(q => q.eq('tipo', 'negado')),
            contarLogs(q => q.eq('tipo', 'fiscalizacao')),
            supabase.from('evento_areas').select('id, nome_area').eq('evento_id', evento_id),
            buscarTodos(supabase
                .from('pessoa_evento_empresa')
                .select('id, empresa_id, empresas(nome), pessoas!inner(status_acesso)')
                .eq('evento_id', evento_id)
                .eq('status_aprovacao', 'aprovado')
                .eq('pessoas.status_acesso', 'checkin_feito')),
            supabase.from('quotas_diarias').select('empresa_id, quota').eq('evento_id', evento_id).eq('data', hoje)
        ]);

        // Passagens de hoje por área: 2 contagens por área, em paralelo
        let areasComStats = [];
        if (areasData && areasData.length > 0) {
            areasComStats = await Promise.all(areasData.map(async (a) => {
                const [{ count: total }, { count: negados }] = await Promise.all([
                    contarLogs(q => q.eq('area_id', a.id)),
                    contarLogs(q => q.eq('area_id', a.id).eq('tipo', 'negado'))
                ]);
                return {
                    id: a.id,
                    nome: a.nome_area,
                    nome_area: a.nome_area,
                    total_acessos_hoje: total || 0,
                    total_negados_hoje: negados || 0
                };
            }));
        }

        // Ocupação por empresa N:N
        const ocupacaoPorEmpresa = {};
        (presentesNtoN || []).forEach(vinculo => {
            const eid = vinculo.empresa_id;
            if (!ocupacaoPorEmpresa[eid]) {
                ocupacaoPorEmpresa[eid] = { id: eid, nome: vinculo.empresas?.nome || 'Desconhecida', total: 0, quota: 0 };
            }
            ocupacaoPorEmpresa[eid].total++;
        });

        if (quotasHoje && quotasHoje.length > 0) {
            const semNome = quotasHoje.map(q => q.empresa_id).filter(eid => !ocupacaoPorEmpresa[eid]);
            const nomes = {};
            if (semNome.length > 0) {
                const { data: emps } = await supabase.from('empresas').select('id, nome').in('id', semNome);
                (emps || []).forEach(e => { nomes[e.id] = e.nome; });
            }
            quotasHoje.forEach(q => {
                const eid = q.empresa_id;
                if (!ocupacaoPorEmpresa[eid]) {
                    ocupacaoPorEmpresa[eid] = { id: eid, nome: nomes[eid] || 'Empresa', total: 0, quota: q.quota };
                } else {
                    ocupacaoPorEmpresa[eid].quota = q.quota;
                }
            });
        }

        return {
            presentes: countPresentes || 0,
            capacidade: evento?.capacidade_total || 0,
            checkins_hoje: countCheckinsHoje || 0,
            checkouts_hoje: countCheckoutsHoje || 0,
            negados_hoje: countNegadosHoje || 0,
            fiscalizacoes_hoje: countFiscalizacoesHoje || 0,
            areas: areasComStats,
            empresas: Object.values(ocupacaoPorEmpresa)
        };
    }

    /**
     * @param {Object} ctx  opcional: recebe `ultimoLog` para o anti-passback reaproveitar
     *                     (era a mesma consulta feita duas vezes por acesso)
     */
    async determineSmartAccessType(pessoa_id, evento_id, requestedTipo = null, area_id = null, ctx = null) {
        // Se o tipo foi solicitado manualmente, respeita (ex: página de checkout força 'checkout')
        if (requestedTipo) return requestedTipo;

        // Uma única consulta: último log da área. Sem log hoje = primeiro acesso do dia = CHECK-IN;
        // com log hoje, alterna (toggle).
        const lastLog = await buscarUltimoLog(pessoa_id, evento_id, area_id);
        if (ctx) ctx.ultimoLog = lastLog;

        // O dia de operação começa no horário de reset do evento (o mesmo em que o fechamento de
        // turno roda), não à meia-noite: quem entrou às 22h e passa à 1h está saindo, não entrando de novo
        const evento = await buscarEventoCache(evento_id).catch(() => null);
        const start = ultimaOcorrenciaHorario(evento?.horario_reset || '00:00:00');
        const lastAt = lastLog ? new Date(/Z|[+-]\d{2}:\d{2}$/.test(lastLog.created_at) ? lastLog.created_at : `${lastLog.created_at}Z`) : null;
        if (!lastLog || lastAt < start) {
            logger.debug(`✨ [SmartAccess] Primeiro acesso do dia para ${pessoa_id} (area: ${area_id || 'global'}). Forçando CHECK-IN.`);
            return 'checkin';
        }
        return lastLog.tipo === 'checkout' ? 'checkin' : 'checkout';
    }

    /**
     * Estatísticas para checagem de lotação/cota (10+ contagens no banco).
     * Frescas por 10 s; depois disso devolve o valor anterior na hora e recalcula em
     * segundo plano — a pessoa na catraca não espera a recontagem.
     * Só a primeira passagem do evento (ou após 5 min parado) espera.
     */
    async _getStatsParaValidacao(evento_id) {
        const item = statsValidacao.get(evento_id);
        const idade = item?.valor ? Date.now() - item.em : Infinity;

        const atualizar = () => {
            const atual = statsValidacao.get(evento_id);
            if (atual?.atualizando) return atual.atualizando;
            const promessa = this.getRealtimeStatsInternal(evento_id)
                .then((valor) => {
                    statsValidacao.set(evento_id, { valor, em: Date.now(), atualizando: null });
                    return valor;
                })
                .catch((e) => {
                    const depois = statsValidacao.get(evento_id);
                    if (depois) depois.atualizando = null;
                    throw e;
                });
            statsValidacao.set(evento_id, { ...(atual || { valor: null, em: 0 }), atualizando: promessa });
            return promessa;
        };

        if (idade < STATS_FRESCO_MS) return item.valor;
        if (idade < STATS_VELHO_MAX_MS) {
            atualizar().catch((e) => logger.warn(`[Validação] Falha ao atualizar estatísticas: ${e.message}`));
            return item.valor;
        }
        return atualizar();
    }

    async getCheckinSettings(evento_id) {
        const cacheKey = `checkin_settings_${evento_id}`;
        const cached = cacheService.get(cacheKey);
        if (cached) return cached;

        const { data } = await supabase
            .from('system_settings')
            .select('*')
            .eq('id', 1)
            .single();

        const settings = data || {};
        cacheService.set(cacheKey, settings, 60000); // 60s
        return settings;
    }

    async validateAccessRules(evento_id, pessoa, tipo, metodo, timestamp, confianca, area_id = null, ctx = null) {
        // Operações manuais (admin web), pulseira e leitor de código de barras = decisão humana do operador
        const isHumanOperator = metodo === 'pulseira' || metodo === 'manual' || metodo === 'barcode';

        // Liberação manual do operador (documentação pendente) vale até o checkout ou o reset do evento
        const liberadaManualmente = !!(pessoa.liberacao_manual_ate && new Date(pessoa.liberacao_manual_ate) > new Date());

        // Permitir bypass se for operação humana ou liberação manual vigente; caso contrário bloquear pendentes
        if (pessoa.status_acesso === 'pendente' && !isHumanOperator && !liberadaManualmente) {
            throw this._buildError('Cadastro Incompleto (Pendente)');
        }
        if (pessoa.status_acesso === 'bloqueado' && !isHumanOperator) {
            throw this._buildError('Pessoa Bloqueada');
        }
        if (pessoa.status_acesso === 'recusado' && !isHumanOperator && !liberadaManualmente) {
            throw this._buildError('Cadastro Recusado');
        }

        // Consultas independentes de uma vez: evento e configurações (em cache) e, na entrada,
        // estatísticas de lotação e vínculos de empresa para a cota (antes: em sequência)
        const ehEntrada = tipo === 'checkin';
        const [evento, s, statsEntrada, vinculosEntrada] = await Promise.all([
            buscarEventoCache(evento_id),
            this.getCheckinSettings(evento_id),
            ehEntrada ? this._getStatsParaValidacao(evento_id) : null,
            ehEntrada
                ? supabase.from('pessoa_evento_empresa').select('empresa_id')
                    .eq('pessoa_id', pessoa.id).eq('evento_id', evento_id).eq('status_aprovacao', 'aprovado')
                : { data: null }
        ]);

        const isFacial = metodo === 'facial' || metodo === 'face';

        // Cooldown: configurável para facial, 15 min por padrão para os demais métodos
        const cooldownFacial = s.checkin_cooldown_min ?? 15;
        const cooldownPulseira = s.pulseira_cooldown_min ?? 15;
        let cooldown = isFacial ? cooldownFacial : cooldownPulseira;
        if (isHumanOperator || metodo === 'pulseira' || metodo === 'manual' || metodo === 'face-rfid' || metodo === 'barcode') {
            cooldown = 0;
        }

        // Confiança: apenas para facial
        const targetConfidence = evento?.min_face_score ?? s.biometric_confidence ?? 75;

        const blockDays = s.block_unauthorized_days ?? true;
        const allowOffhour = s.allow_offhour_checkin ?? false;

        // 0. Validação de ÁREA específica (Zonamento de Segurança)
        if (area_id && tipo === 'checkin') {
            // Se a pessoa estiver tentando acessar área restrita sem ter passado pelo credenciamento/portaria
            if (pessoa.status_acesso === 'pendente' && !isHumanOperator && !liberadaManualmente) {
                throw this._buildError('Credenciamento Pendente: Dirija-se à Portaria Principal');
            }
            if (pessoa.status_documentos === 'reprovado' && !isHumanOperator && !liberadaManualmente) {
                throw this._buildError('Acesso Bloqueado: Documentação Reprovada');
            }

            // 1. Cache de áreas gravado na própria pessoa (credenciamento) — sem consulta
            const cachePermit = Array.isArray(pessoa.areas_autorizadas) && pessoa.areas_autorizadas.includes(area_id);

            // 2. Autorização individual e da pulseira (coluna real: pulseira_id), em paralelo
            let pessoaPermit = null;
            let pulseiraPermit = null;
            if (!cachePermit && !isHumanOperator) {
                const [direta, daPulseira] = await Promise.all([
                    supabase.from('pessoa_areas_acesso').select('id')
                        .eq('pessoa_id', pessoa.id).eq('area_id', area_id).limit(1).maybeSingle(),
                    pessoa.tipo_pulseira_id
                        ? supabase.from('pulseira_areas_permitidas').select('area_id')
                            .eq('pulseira_id', pessoa.tipo_pulseira_id).eq('area_id', area_id).limit(1).maybeSingle()
                        : Promise.resolve({ data: null })
                ]);
                pessoaPermit = direta.data;
                pulseiraPermit = daPulseira.data;
            }

            if (!pessoaPermit && !pulseiraPermit && !cachePermit && !isHumanOperator) {
                throw this._buildError('Acesso Negado: Área Restrita Não Autorizada');
            }
        }

        // 1. Validação de Fase do Evento
        // Operação humana (manual/pulseira/barcode) sempre bypassa fase — o operador decide.
        // Facial/QRCode automático respeita allowOffhour.
        const skipPhaseCheck = isHumanOperator || (allowOffhour && !isFacial);

        if (tipo === 'checkin' && !skipPhaseCheck) {
            const fasePermitida = await this.verificarFaseEvento(evento_id, pessoa, metodo);
            if (!fasePermitida) throw this._buildError('Fase do evento não permitida para este perfil');
        }

        // 2. Validação de Dia (Prioriza dias_acesso; dias_trabalho é legado)
        const hojeLiteral = getHojeLocal();
        const diasAcesso = Array.isArray(pessoa.dias_acesso) && pessoa.dias_acesso.length > 0 ? pessoa.dias_acesso : null;
        const diasTrabalho = Array.isArray(pessoa.dias_trabalho) && pessoa.dias_trabalho.length > 0 ? pessoa.dias_trabalho : null;
        const diasPermitidos = diasAcesso || diasTrabalho;

        if (diasPermitidos && !isHumanOperator) {
            if (!diasPermitidos.includes(hojeLiteral)) {
                throw this._buildError(`Acesso não autorizado para esta data (${hojeLiteral})`);
            }
        }

        // 3. Validação de Empresa/Bloqueio
        const empresaBloqueada = pessoa.empresas && pessoa.empresas.ativo === false;
        if (pessoa.bloqueado || empresaBloqueada) {
            throw this._buildError(pessoa.bloqueado ? (pessoa.motivo_bloqueio || 'Pessoa Bloqueada') : 'Empresa Bloqueada');
        }

        // 4. Capacidade
        let quotaBypassed = false;
        if (tipo === 'checkin') {
            const stats = statsEntrada;
            if (stats.presentes >= stats.capacidade && stats.capacidade > 0) {
                // Operação humana (pulseira/manual) pode ultrapassar cota — operador decide
                if (isHumanOperator) {
                    logger.warn(`⚠️ [BYPASS] Cota excedida, liberada via ${metodo}`);
                    quotaBypassed = true;
                } else {
                    throw this._buildError('Capacidade máxima do evento atingida');
                }
            }

            // Cota por empresa (vinculo aprovado em pessoa_evento_empresa)
            const vinculos = vinculosEntrada.data;

            if (vinculos && vinculos.length > 0) {
                let hasAvailableQuota = false;
                let companyViolations = [];
                for (const vinculo of vinculos) {
                    const empresaCota = stats.empresas.find(e => e.id === vinculo.empresa_id);
                    if (!empresaCota || empresaCota.quota === 0) {
                        hasAvailableQuota = true; break;
                    } else if (empresaCota.total < empresaCota.quota) {
                        hasAvailableQuota = true; break;
                    } else {
                        companyViolations.push(empresaCota.nome);
                    }
                }
                if (!hasAvailableQuota) throw this._buildError(`Cota esgotada: ${companyViolations.join(', ')}`);
            }
        }

        // Validar confiança biométrica
        if (isFacial && confianca !== null && parseFloat(confianca) < targetConfidence) {
            throw this._buildError(`Baixa confiança biométrica: ${confianca}% (Piso: ${targetConfidence}%)`);
        }

        // 5. Anti-passback (cooldown por área)
        if ((tipo === 'checkin' || tipo === 'checkout') && cooldown > 0) {
            await this.validateAntiPassback(evento_id, pessoa.id, tipo, metodo, cooldown, area_id, timestamp,
                ctx && 'ultimoLog' in ctx ? ctx.ultimoLog : undefined);
        }

        return { quotaBypassed, cooldown, targetConfidence };
    }

    /**
     * Validar anti-passback (evitar check-in/checkout duplo rápido)
     */
    async validateAntiPassback(evento_id, pessoa_id, tipo, metodo, cooldownMinutos, area_id = null, timestamp = null, ultimoLog = undefined) {
        if (cooldownMinutos <= 0) return true;

        // Anti-passback por área: cooldown é por área, não global.
        // `ultimoLog` vem do determineSmartAccessType da mesma requisição, quando houve.
        const lastLog = ultimoLog !== undefined ? ultimoLog : await buscarUltimoLog(pessoa_id, evento_id, area_id);

        if (!lastLog) return true;

        let lastTimeStr = lastLog.created_at;
        if (!lastTimeStr.endsWith('Z') && !lastTimeStr.includes('+') && !lastTimeStr.match(/-\d{2}:\d{2}$/)) {
            lastTimeStr += 'Z';
        }
        
        const lastTime = new Date(lastTimeStr);
        const now = timestamp ? new Date(timestamp) : new Date();
        const diffMins = (now - lastTime) / 60000;

        if (diffMins >= 0 && diffMins < cooldownMinutos && lastLog.tipo === tipo) {
            const error = new Error(`Anti-Passback: Aguarde ${Math.ceil(cooldownMinutos - diffMins)} min.`);
            error.status = 403;
            error.is_passback_cooldown = true;
            throw error;
        }

        // Acesso duplicado recusado: mesmo tipo no mesmo dia, mesmo após o cooldown
        const formatadorDia = new Intl.DateTimeFormat('en-CA', {
            timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const diaLocal = formatadorDia.format(lastTime);
        const diaAcesso = formatadorDia.format(now);
        if (diffMins >= 0 && lastLog.tipo === tipo && diaLocal === diaAcesso) {
            const error = new Error('Anti-Passback: Acesso duplicado recusado');
            error.status = 403;
            error.is_passback_double = true;
            throw error;
        }

        return true;
    }

    _buildError(message) {
        const error = new Error(message);
        error.status = 403;
        return error;
    }
}

module.exports = new ValidationService();
module.exports.MARCADOR_CREDENCIAMENTO = MARCADOR_CREDENCIAMENTO;
