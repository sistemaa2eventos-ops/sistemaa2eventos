const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const { limiteFiltro } = require('../../utils/dateUtils');
const { buscarTodos, buscarPorIdsEmLotes } = require('../../utils/buscarTodos');

// logs_acesso.created_at é UTC gravado sem fuso
const instante = (ts) => (ts ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`) : NaN);

const STATUS = {
    em_uso: 'Em uso',
    devolvida: 'Devolvida',
    perdida: 'Perdida',
    substituida: 'Trocada',
    desvinculada: 'Desvinculada'
};
const MOTIVOS_MANUAIS = ['devolvida', 'perdida'];

const tabelaAusente = (error) => error && (error.code === 'PGRST205' || error.code === '42P01' || /pulseira_vinculos/.test(error.message || ''));

/**
 * Histórico de pulseiras: cada vínculo pessoa ↔ pulseira com início e fim.
 * Os vínculos são gravados pelo trigger em pessoas.numero_pulseira (migration
 * 20261030_historico_pulseiras.sql); devolução e perda são marcadas aqui.
 */
class PulseiraService {
    /**
     * Vínculos que estiveram ativos no período, com os acessos feitos com cada pulseira.
     * @returns {{ disponivel, linhas, resumo, alertas }}
     */
    async historico(eventoId, { data_inicio, data_fim, empresa_id, busca } = {}) {
        const inicio = limiteFiltro(data_inicio);
        const fim = limiteFiltro(data_fim, true);

        let q = supabase.from('pulseira_vinculos')
            .select('id, pessoa_id, numero_pulseira, tipo_pulseira_id, entregue_em, entregue_por, encerrado_em, encerrado_por, motivo_encerramento, observacao, origem, pessoas!inner(id, nome_completo, cpf, funcao, empresa_id)')
            .eq('evento_id', eventoId)
            .order('entregue_em', { ascending: false });
        // esteve ativo em algum momento do período
        if (fim) q = q.lte('entregue_em', fim);
        if (inicio) q = q.or(`encerrado_em.is.null,encerrado_em.gte.${inicio}`);
        if (empresa_id) q = q.eq('pessoas.empresa_id', empresa_id);

        const { data: vinculos, error } = await buscarTodos(q);
        if (tabelaAusente(error)) return { disponivel: false, linhas: [], resumo: null, alertas: [] };
        if (error) throw error;

        const termo = String(busca || '').trim().toLowerCase();
        const lista = termo
            ? vinculos.filter(v => v.numero_pulseira.toLowerCase().includes(termo)
                || (v.pessoas?.nome_completo || '').toLowerCase().includes(termo)
                || (v.pessoas?.cpf || '').replace(/\D/g, '').includes(termo.replace(/\D/g, '') || '§'))
            : vinculos;

        const pessoaIds = [...new Set(lista.map(v => v.pessoa_id))];
        const empIds = [...new Set(lista.map(v => v.pessoas?.empresa_id).filter(Boolean))];
        const tipoIds = [...new Set(lista.map(v => v.tipo_pulseira_id).filter(Boolean))];
        const usuarioIds = [...new Set(lista.flatMap(v => [v.entregue_por, v.encerrado_por]).filter(Boolean))];

        const [empresas, tipos, usuarios, logs, abertos] = await Promise.all([
            empIds.length ? supabase.from('empresas').select('id, nome').in('id', empIds).then(r => r.data || []) : [],
            tipoIds.length ? supabase.from('evento_tipos_pulseira').select('id, nome_tipo, cor_hex').in('id', tipoIds).then(r => r.data || []) : [],
            usuarioIds.length ? supabase.from('perfis').select('id, nome_completo').in('id', usuarioIds).then(r => r.data || [], () => []) : [],
            this._acessos(eventoId, pessoaIds, lista),
            // duplicidade olha o evento todo, não só o período
            buscarTodos(supabase.from('pulseira_vinculos').select('pessoa_id, numero_pulseira').eq('evento_id', eventoId).is('encerrado_em', null))
                .then(r => r.data || [])
        ]);
        const empMap = Object.fromEntries(empresas.map(e => [e.id, e.nome]));
        const tipoMap = Object.fromEntries(tipos.map(t => [t.id, t]));
        const usuarioMap = Object.fromEntries(usuarios.map(u => [u.id, u.nome_completo]));

        const donosAbertos = {};
        abertos.forEach(a => { (donosAbertos[a.numero_pulseira] || (donosAbertos[a.numero_pulseira] = new Set())).add(a.pessoa_id); });
        const vinculosPorPessoa = {};
        vinculos.forEach(v => { vinculosPorPessoa[v.pessoa_id] = (vinculosPorPessoa[v.pessoa_id] || 0) + 1; });

        const agora = Date.now();
        const linhas = lista.map(v => {
            const ini = Date.parse(v.entregue_em);
            const fimMs = v.encerrado_em ? Date.parse(v.encerrado_em) : agora;
            const usos = (logs[v.pessoa_id] || []).filter(l => l.numero === v.numero_pulseira && l.ms >= ini - 60000 && l.ms <= fimMs);
            const status = v.encerrado_em ? v.motivo_encerramento : 'em_uso';
            const duplicada = !v.encerrado_em && (donosAbertos[v.numero_pulseira]?.size || 0) > 1;
            const tipo = tipoMap[v.tipo_pulseira_id];
            return {
                id: v.id,
                pessoa_id: v.pessoa_id,
                numero_pulseira: v.numero_pulseira,
                tipo: tipo?.nome_tipo || null,
                cor: tipo?.cor_hex || null,
                colaborador: v.pessoas?.nome_completo || 'Sem Nome',
                cpf: v.pessoas?.cpf || '',
                funcao: v.pessoas?.funcao || '—',
                empresa: empMap[v.pessoas?.empresa_id] || 'Sem Empresa',
                entregue_em: v.entregue_em,
                entregue_por: usuarioMap[v.entregue_por] || null,
                encerrado_em: v.encerrado_em,
                encerrado_por: usuarioMap[v.encerrado_por] || null,
                status,
                status_texto: STATUS[status] || status,
                minutos_em_uso: Math.max(0, Math.round((fimMs - ini) / 60000)),
                acessos: usos.length,
                primeiro_uso: usos.length ? new Date(usos[0].ms).toISOString() : null,
                ultimo_uso: usos.length ? new Date(usos[usos.length - 1].ms).toISOString() : null,
                trocas_da_pessoa: Math.max(0, (vinculosPorPessoa[v.pessoa_id] || 1) - 1),
                duplicada,
                historico: v.origem === 'historico',
                observacao: [
                    duplicada ? 'Mesmo número em uso por outra pessoa' : null,
                    v.origem === 'historico' ? 'Reconstruído dos acessos (horário aproximado)' : null,
                    v.observacao
                ].filter(Boolean).join(' • ')
            };
        });

        const contar = (st) => linhas.filter(l => l.status === st).length;
        const resumo = {
            entregues: linhas.length,
            pessoas: pessoaIds.length,
            em_uso: contar('em_uso'),
            devolvidas: contar('devolvida'),
            perdidas: contar('perdida'),
            trocadas: contar('substituida'),
            desvinculadas: contar('desvinculada'),
            sem_uso: linhas.filter(l => l.acessos === 0 && !l.historico).length,
            duplicadas: new Set(linhas.filter(l => l.duplicada).map(l => l.numero_pulseira)).size,
            pessoas_com_troca: new Set(linhas.filter(l => l.trocas_da_pessoa > 0).map(l => l.pessoa_id)).size
        };

        const alertas = [];
        if (resumo.duplicadas > 0) {
            const nums = [...new Set(linhas.filter(l => l.duplicada).map(l => l.numero_pulseira))];
            alertas.push({ nivel: 'error', texto: `${resumo.duplicadas} pulseira(s) com o mesmo número em uso por mais de uma pessoa: ${nums.slice(0, 5).join(', ')}${nums.length > 5 ? '...' : ''}.` });
        }
        if (resumo.perdidas > 0) alertas.push({ nivel: 'warning', texto: `${resumo.perdidas} pulseira(s) perdida(s) no período: o número foi retirado da pessoa e não abre mais acesso.` });
        const muitasTrocas = Object.entries(vinculosPorPessoa).filter(([id, n]) => n >= 3 && pessoaIds.includes(id)).length;
        if (muitasTrocas > 0) alertas.push({ nivel: 'warning', texto: `${muitasTrocas} pessoa(s) receberam 3 ou mais pulseiras no período.` });

        return { disponivel: true, linhas, resumo, alertas };
    }

    /** Acessos (entrada/saída) das pessoas no intervalo dos vínculos, por pessoa e em ordem */
    async _acessos(eventoId, pessoaIds, vinculos) {
        if (pessoaIds.length === 0) return {};
        const ini = Math.min(...vinculos.map(v => Date.parse(v.entregue_em))) - 60000;
        const temAberto = vinculos.some(v => !v.encerrado_em);
        const fim = temAberto ? null : Math.max(...vinculos.map(v => Date.parse(v.encerrado_em)));
        const { data, error } = await buscarPorIdsEmLotes(pessoaIds, (lote) => {
            let q = supabase.from('logs_acesso')
                .select('pessoa_id, numero_pulseira, created_at')
                .eq('evento_id', eventoId)
                .in('pessoa_id', lote)
                .in('tipo', ['checkin', 'checkout', 'entrada', 'saida'])
                .not('numero_pulseira', 'is', null)
                .gte('created_at', new Date(ini).toISOString())
                .order('created_at', { ascending: true });
            if (fim) q = q.lte('created_at', new Date(fim).toISOString());
            return buscarTodos(q); // um lote de pessoas pode passar de 1000 acessos
        });
        if (error) {
            logger.warn(`[Pulseiras] Acessos não carregados: ${error.message}`);
            return {};
        }
        const porPessoa = {};
        (data || []).forEach(l => {
            (porPessoa[l.pessoa_id] || (porPessoa[l.pessoa_id] = [])).push({ numero: String(l.numero_pulseira).trim(), ms: instante(l.created_at) });
        });
        Object.values(porPessoa).forEach(a => a.sort((x, y) => x.ms - y.ms));
        return porPessoa;
    }

    /**
     * Devolução ou perda: encerra a pulseira em uso e tira o número da pessoa
     * (perdida não abre mais acesso; a pessoa recebe outra no credenciamento).
     */
    async encerrar(eventoId, pessoaId, { motivo, observacao } = {}, usuarioId = null) {
        if (!MOTIVOS_MANUAIS.includes(motivo)) throw Object.assign(new Error('Motivo inválido: use devolvida ou perdida.'), { status: 400 });

        const { data: aberto, error } = await supabase.from('pulseira_vinculos')
            .select('id, numero_pulseira')
            .eq('evento_id', eventoId)
            .eq('pessoa_id', pessoaId)
            .is('encerrado_em', null)
            .maybeSingle();
        if (tabelaAusente(error)) throw Object.assign(new Error('Histórico de pulseiras ainda não criado: rode a migration 20261030_historico_pulseiras.sql.'), { status: 400 });
        if (error) throw error;
        if (!aberto) throw Object.assign(new Error('Esta pessoa não tem pulseira em uso.'), { status: 404 });

        // fecha antes de limpar a pessoa: o trigger não acha vínculo aberto e não grava "desvinculada"
        const { error: upErr } = await supabase.from('pulseira_vinculos')
            .update({ encerrado_em: new Date().toISOString(), motivo_encerramento: motivo, encerrado_por: usuarioId, observacao: String(observacao || '').trim() || null })
            .eq('id', aberto.id);
        if (upErr) throw upErr;

        const { error: pErr } = await supabase.from('pessoas')
            .update({ numero_pulseira: null, updated_at: new Date().toISOString() })
            .eq('id', pessoaId)
            .eq('evento_id', eventoId)
            .eq('numero_pulseira', aberto.numero_pulseira);
        if (pErr) throw pErr;
        return { id: aberto.id, numero_pulseira: aberto.numero_pulseira, motivo };
    }

    /** Quem entregou: o trigger não sabe o operador, o credenciamento completa (sem bloquear) */
    registrarEntrega(pessoaId, usuarioId) {
        if (!pessoaId || !usuarioId) return;
        supabase.from('pulseira_vinculos')
            .update({ entregue_por: usuarioId })
            .eq('pessoa_id', pessoaId)
            .is('encerrado_em', null)
            .is('entregue_por', null)
            .then(({ error }) => {
                if (error && !tabelaAusente(error)) logger.warn(`[Pulseiras] Operador da entrega não registrado: ${error.message}`);
            }, () => {});
    }
}

module.exports = new PulseiraService();
module.exports.STATUS = STATUS;
