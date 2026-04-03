const { supabase } = require('../../../config/supabase');
const logger = require('../../../services/logger');
const { getHojeLocal } = require('../../../utils/dateUtils');

class ValidationService {
    async verificarFaseEvento(evento_id, pessoa, metodo = 'manual') {
        if (metodo === 'manual') return true;
        if (pessoa.status_acesso === 'checkin_feito') return true;

        const { data: evento } = await supabase.from('eventos').select('*').eq('id', evento_id).single();
        if (!evento) return true;

        const hojeLiteral = getHojeLocal(); 
        const datasMontagem = evento.datas_montagem || [];
        if (datasMontagem.includes(hojeLiteral)) return !!pessoa.fase_montagem;

        const datasEvento = evento.datas_evento || [];
        if (datasEvento.includes(hojeLiteral)) return !!pessoa.fase_showday;

        const datasDesmontagem = evento.datas_desmontagem || [];
        if (datasDesmontagem.includes(hojeLiteral)) return !!pessoa.fase_desmontagem;

        return false;
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

    async validateAccessRules(evento_id, pessoa, tipo, metodo, timestamp, confianca) {
        if (pessoa.status_acesso === 'pendente') throw this._buildError('Cadastro Incompleto (Pendente)');

        if (tipo === 'checkin') {
            const fasePermitida = await this.verificarFaseEvento(evento_id, pessoa, metodo);
            if (!fasePermitida) throw this._buildError('Fase do evento não permitida para este perfil');
        }

        const hojeLiteral = getHojeLocal();
        if (metodo !== 'manual' && pessoa.dias_trabalho && pessoa.dias_trabalho.length > 0) {
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

            if (metodo === 'face' && confianca !== null && parseFloat(confianca) < 75.0) {
                throw this._buildError(`Baixa confiança biométrica: ${confianca}% (Piso: 75.0%)`);
            }
        }

        if (tipo === 'checkin' || tipo === 'checkout') {
            const apEnabled = true; const apCooldown = 15;
            if (apEnabled && metodo !== 'manual' && metodo !== 'face-rfid') {
                const { data: lastLog } = await supabase
                    .from('logs_acesso').select('created_at, tipo')
                    .eq('pessoa_id', pessoa.id).in('tipo', ['checkin', 'checkout']).order('created_at', { ascending: false }).limit(1).single();

                if (lastLog) {
                    let lastTimeStr = lastLog.created_at;
                    if (!lastTimeStr.endsWith('Z') && !lastTimeStr.includes('+') && !lastTimeStr.match(/-\d{2}:\d{2}$/)) lastTimeStr += 'Z';
                    const lastTime = new Date(lastTimeStr);
                    const diffMins = (timestamp - lastTime) / 60000;

                    if (diffMins >= 0 && apCooldown > 0 && diffMins < apCooldown) {
                        const err = this._buildError(`Anti-Passback: Aguarde ${Math.ceil(apCooldown - diffMins)} min.`);
                        err.is_passback_cooldown = true; throw err;
                    }
                    if (diffMins >= 0 && lastLog.tipo === tipo) {
                        const err = this._buildError(`Anti-Passback: Acesso duplicado recusado`);
                        err.is_passback_double = true; throw err;
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
