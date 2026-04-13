const { supabase } = require('../../../config/supabase');
const logger = require('../../../services/logger');
const cacheService = require('../../../services/cacheService');
const { getHojeLocal } = require('../../../utils/dateUtils');

class ValidationService {
    async verificarFaseEvento(evento_id, pessoa, metodo = 'manual') {
        if (pessoa.status_acesso === 'checkin_feito') return true;

        const { data: evento } = await supabase.from('eventos').select('*').eq('id', evento_id).single();
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
        
        // Lógica Inclusiva: Identifica todas as fases que ocorrem hoje
        const ocorrendoHoje = {
            montagem: datasMontagem.includes(hojeLiteral),
            showday: datasEvento.includes(hojeLiteral),
            desmontagem: datasDesmontagem.includes(hojeLiteral)
        };

        // Se hoje não está em nenhuma das listas, mas o evento TEM datas, bloqueia por segurança
        if (!ocorrendoHoje.montagem && !ocorrendoHoje.showday && !ocorrendoHoje.desmontagem) {
            return false;
        }

        // Se hoje está em alguma fase, o usuário deve ter permissão para PELO MENOS UMA fase que ocorre hoje
        const permitidoMontagem = ocorrendoHoje.montagem && !!pessoa.fase_montagem;
        const permitidoShowday = ocorrendoHoje.showday && !!pessoa.fase_showday;
        const permitidoDesmontagem = ocorrendoHoje.desmontagem && !!pessoa.fase_desmontagem;

        return permitidoMontagem || permitidoShowday || permitidoDesmontagem;
    }

    async getRealtimeStatsInternal(evento_id) {
        const hoje = getHojeLocal();
        const { count: countPresentes } = await supabase
            .from('pessoas')
            .select('id', { count: 'exact', head: true })
            .eq('evento_id', evento_id)
            .eq('status_acesso', 'checkin_feito');

        const { data: presentesNtoN } = await supabase
            .from('pessoa_evento_empresa')
            .select('empresa_id, empresas(nome), pessoas!inner(status_acesso)')
            .eq('evento_id', evento_id)
            .eq('status_aprovacao', 'aprovado')
            .eq('pessoas.status_acesso', 'checkin_feito');

        const { data: quotasHoje } = await supabase
            .from('quotas_diarias')
            .select('empresa_id, quota')
            .eq('evento_id', evento_id)
            .eq('data', hoje);

        const { data: evento } = await supabase.from('eventos').select('capacidade_total').eq('id', evento_id).single();
        const ocupacaoPorEmpresa = {};

        if (presentesNtoN) {
            presentesNtoN.forEach(vinculo => {
                const eid = vinculo.empresa_id;
                if (!ocupacaoPorEmpresa[eid]) {
                    ocupacaoPorEmpresa[eid] = { id: eid, nome: vinculo.empresas?.nome || 'Desconhecida', total: 0, quota: 0 };
                }
                ocupacaoPorEmpresa[eid].total++;
            });
        }

        if (quotasHoje) {
            quotasHoje.forEach(q => {
                const eid = q.empresa_id;
                if (!ocupacaoPorEmpresa[eid]) {
                    ocupacaoPorEmpresa[eid] = { id: eid, nome: 'Empresa', total: 0, quota: q.quota };
                } else {
                    ocupacaoPorEmpresa[eid].quota = q.quota;
                }
            });
        }

        return {
            presentes: countPresentes || 0,
            capacidade: evento?.capacidade_total || 0,
            empresas: Object.values(ocupacaoPorEmpresa)
        };
    }

    async isFirstAccessOfDay(pessoa_id, evento_id) {
        const hoje = getHojeLocal();
        const start = `${hoje}T00:00:00.000Z`;
        const end = `${hoje}T23:59:59.999Z`;

        const { count, error } = await supabase
            .from('logs_acesso')
            .select('id', { count: 'exact', head: true })
            .eq('pessoa_id', pessoa_id)
            .eq('evento_id', evento_id)
            .gte('created_at', start)
            .lte('created_at', end);

        if (error) {
            logger.error(`Erro ao verificar primeiro acesso do dia para ${pessoa_id}:`, error);
            return false;
        }

        return count === 0;
    }

    async determineSmartAccessType(pessoa_id, evento_id, requestedTipo = null) {
        // Regra: Primeiro do dia é sempre CHECK-IN
        const isFirst = await this.isFirstAccessOfDay(pessoa_id, evento_id);
        if (isFirst) {
            logger.info(`✨ [SmartAccess] Primeiro acesso do dia para ${pessoa_id}. Forçando CHECK-IN.`);
            return 'checkin';
        }

        // Se o tipo foi solicitado manualmente, respeita
        if (requestedTipo) return requestedTipo;

        const { data: lastLog } = await supabase
            .from('logs_acesso')
            .select('tipo')
            .eq('pessoa_id', pessoa_id)
            .eq('evento_id', evento_id)
            .in('tipo', ['checkin', 'checkout'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!lastLog || lastLog.tipo === 'checkout') return 'checkin';
        return 'checkout';
    }

    async getCheckinSettings(evento_id) {
        const cacheKey = `checkin_settings_${evento_id}`;
        const cached = cacheService.get(cacheKey);
        if (cached) return cached;

        const { data } = await supabase
            .from('system_settings')
            .select('checkin_cooldown_min, biometric_confidence, allow_offhour_checkin, block_unauthorized_days')
            .eq('id', 1)
            .single();

        const settings = data || {};
        cacheService.set(cacheKey, settings, 60000); // 60s
        return settings;
    }

    async validateAccessRules(evento_id, pessoa, tipo, metodo, timestamp, confianca, area_id = null) {
        // Permitir bypass se for manual (dashboard), caso contrário bloquear pendentes
        if (pessoa.status_acesso === 'pendente' && metodo !== 'manual') {
            throw this._buildError('Cadastro Incompleto (Pendente)');
        }

        const s = await this.getCheckinSettings(evento_id);
        const cooldown = s.checkin_cooldown_min ?? 15;
        const targetConfidence = s.biometric_confidence ?? 75;
        const blockDays = s.block_unauthorized_days ?? true;
        const allowOffhour = s.allow_offhour_checkin ?? false;

        // 0. Validação de ÁREA específica (Zonamento)
        if (area_id && tipo === 'checkin') {
            const { data: hasPermit } = await supabase
                .from('pulseira_areas_permitidas')
                .select('id')
                .eq('tipo_pulseira_id', pessoa.tipo_pulseira_id)
                .eq('area_id', area_id)
                .limit(1)
                .single();

            if (!hasPermit) {
                throw this._buildError('Acesso Negado: Perfil não autorizado para esta área');
            }
        }

        if (tipo === 'checkin' && !allowOffhour) {
            const fasePermitida = await this.verificarFaseEvento(evento_id, pessoa, metodo);
            if (!fasePermitida) throw this._buildError('Fase do evento não permitida para este perfil');
        }

        const hojeLiteral = getHojeLocal();
        if (metodo !== 'manual' && blockDays && pessoa.dias_trabalho && pessoa.dias_trabalho.length > 0) {
            if (!pessoa.dias_trabalho.includes(hojeLiteral)) throw this._buildError(`Acesso não autorizado para esta data (${hojeLiteral})`);
        }

        const empresaBloqueada = pessoa.empresas && pessoa.empresas.ativo === false;
        if (pessoa.bloqueado || empresaBloqueada) {
            throw this._buildError(pessoa.bloqueado ? (pessoa.motivo_bloqueio || 'Pessoa Bloqueada') : 'Empresa Bloqueada');
        }

        if (tipo === 'checkin') {
            const stats = await this.getRealtimeStatsInternal(evento_id);
            if (stats.presentes >= stats.capacidade && stats.capacidade > 0) throw this._buildError('Capacidade máxima do evento atingida');

            const { data: vinculos } = await supabase
                .from('pessoa_evento_empresa').select('empresa_id')
                .eq('pessoa_id', pessoa.id).eq('evento_id', evento_id).eq('status_aprovacao', 'aprovado');

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

            if (metodo === 'face' && confianca !== null && parseFloat(confianca) < targetConfidence) {
                throw this._buildError(`Baixa confiança biométrica: ${confianca}% (Piso: ${targetConfidence}%)`);
            }
        }

        // 3. Anti-Passback
        if (tipo === 'checkin' || tipo === 'checkout') {
            const apCooldown = cooldown; // minutos dinâmicos
            if (metodo !== 'manual' && metodo !== 'face-rfid') {
                const { data: lastLog } = await supabase
                    .from('logs_acesso')
                    .select('created_at, tipo')
                    .eq('pessoa_id', pessoa.id)
                    .eq('evento_id', evento_id)
                    .in('tipo', ['checkin', 'checkout'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (lastLog) {
                    let lastTimeStr = lastLog.created_at;
                    if (!lastTimeStr.endsWith('Z') && !lastTimeStr.includes('+') && !lastTimeStr.match(/-\d{2}:\d{2}$/)) lastTimeStr += 'Z';
                    const lastTime = new Date(lastTimeStr);
                    const diffMins = (timestamp - lastTime) / 60000;

                    if (diffMins >= 0 && apCooldown > 0 && diffMins < apCooldown && lastLog.tipo === tipo) {
                        const err = this._buildError(`Anti-Passback: Aguarde ${Math.ceil(apCooldown - diffMins)} min.`);
                        err.is_passback_cooldown = true;
                        throw err;
                    }
                }
            }
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
