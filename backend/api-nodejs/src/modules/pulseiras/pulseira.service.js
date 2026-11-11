const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const { limiteFiltro } = require('../../utils/dateUtils');
const { buscarTodos, buscarPorIdsEmLotes } = require('../../utils/buscarTodos');
const { buscarLotesDaFaixa, escolherLote } = require('./loteSelecao');

// logs_acesso.created_at é UTC gravado sem fuso
const instante = (ts) => (ts ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`) : NaN);

const STATUS = {
    em_uso: 'Em uso',
    devolvida: 'Devolvida',
    perdida: 'Perdida',
    substituida: 'Trocada',
    desvinculada: 'Desvinculada',
    anulada: 'Anulada (lançamento errado)'
};
const MOTIVOS_MANUAIS = ['devolvida', 'perdida'];
// Trocada ou perdida: o número não volta a ser entregue no mesmo lote do evento.
// Devolvida e desvinculada podem ser reentregues.
const MOTIVOS_BLOQUEIO = ['substituida', 'perdida'];

const tabelaAusente = (error) => error && (error.code === 'PGRST205' || error.code === '42P01' || /pulseira_vinculos|pessoa_empresa_historico/.test(error.message || ''));

const MIGRATION_CORRECAO = '20261112c_pulseira_correcao_empresa.sql';

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
            .select('id, pessoa_id, numero_pulseira, tipo_pulseira_id, empresa_id, entregue_em, entregue_por, encerrado_em, encerrado_por, motivo_encerramento, observacao, origem, pessoas!inner(id, nome_completo, cpf, funcao, empresa_id)')
            .eq('evento_id', eventoId)
            .order('entregue_em', { ascending: false });
        // esteve ativo em algum momento do período
        if (fim) q = q.lte('entregue_em', fim);
        if (inicio) q = q.or(`encerrado_em.is.null,encerrado_em.gte.${inicio}`);
        // empresa do vínculo (snapshot da entrega): quem trocou de empresa aparece em cada uma
        if (empresa_id) q = q.eq('empresa_id', empresa_id);

        const { data: vinculos, error } = await buscarTodos(q);
        if (tabelaAusente(error)) return { disponivel: false, linhas: [], resumo: null, alertas: [], trocas_empresa: [] };
        if (error) throw error;

        const termo = String(busca || '').trim().toLowerCase();
        const lista = termo
            ? vinculos.filter(v => v.numero_pulseira.toLowerCase().includes(termo)
                || (v.pessoas?.nome_completo || '').toLowerCase().includes(termo)
                || (v.pessoas?.cpf || '').replace(/\D/g, '').includes(termo.replace(/\D/g, '') || '§'))
            : vinculos;

        const pessoaIds = [...new Set(lista.map(v => v.pessoa_id))];
        const empIds = [...new Set(lista.map(v => v.empresa_id || v.pessoas?.empresa_id).filter(Boolean))];
        const tipoIds = [...new Set(lista.map(v => v.tipo_pulseira_id).filter(Boolean))];
        const usuarioIds = [...new Set(lista.flatMap(v => [v.entregue_por, v.encerrado_por]).filter(Boolean))];

        const [empresas, tipos, usuarios, logs, abertos, trocas, ultimosEncerrados] = await Promise.all([
            empIds.length ? supabase.from('empresas').select('id, nome').in('id', empIds).then(r => r.data || []) : [],
            tipoIds.length ? supabase.from('evento_tipos_pulseira').select('id, nome_tipo, cor_hex').in('id', tipoIds).then(r => r.data || []) : [],
            usuarioIds.length ? supabase.from('perfis').select('id, nome_completo').in('id', usuarioIds).then(r => r.data || [], () => []) : [],
            this._acessos(eventoId, pessoaIds, lista),
            // duplicidade olha o evento todo, não só o período
            buscarTodos(supabase.from('pulseira_vinculos').select('pessoa_id, numero_pulseira').eq('evento_id', eventoId).is('encerrado_em', null))
                .then(r => r.data || []),
            this._trocasEmpresa(eventoId, inicio, fim, empresa_id),
            this._ultimosEncerrados(eventoId, pessoaIds)
        ]);
        const empMap = Object.fromEntries(empresas.map(e => [e.id, e.nome]));
        const tipoMap = Object.fromEntries(tipos.map(t => [t.id, t]));
        const usuarioMap = Object.fromEntries(usuarios.map(u => [u.id, u.nome_completo]));

        // com pulseira em uso, desfazer a marcação anterior seria anular a atual: a RPC não faz isso
        const pessoasComAberto = new Set(abertos.map(a => a.pessoa_id));
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
                empresa: empMap[v.empresa_id || v.pessoas?.empresa_id] || 'Sem Empresa',
                empresa_id: v.empresa_id || v.pessoas?.empresa_id || null,
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
                // só a última marcação de perdida/devolvida da pessoa pode ser desfeita (mesma regra da RPC)
                pode_desfazer: (status === 'perdida' || status === 'devolvida')
                    && ultimosEncerrados.has(v.id) && !pessoasComAberto.has(v.pessoa_id),
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
            // anulada é lançamento errado: não conta como entrega real
            entregues: linhas.filter(l => l.status !== 'anulada').length,
            pessoas: pessoaIds.length,
            em_uso: contar('em_uso'),
            devolvidas: contar('devolvida'),
            perdidas: contar('perdida'),
            trocadas: contar('substituida'),
            desvinculadas: contar('desvinculada'),
            anuladas: contar('anulada'),
            trocas_empresa: trocas.length,
            sem_uso: linhas.filter(l => l.acessos === 0 && !l.historico && l.status !== 'anulada').length,
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
        if (resumo.anuladas > 0) alertas.push({ nivel: 'info', texto: `${resumo.anuladas} lançamento(s) anulado(s) por erro do operador: não contam como entrega e não bloqueiam o número.` });
        if (trocas.length > 0) alertas.push({ nivel: 'info', texto: `${trocas.length} troca(s) de empresa no período: as horas de cada empresa ficam separadas nos relatórios.` });

        return { disponivel: true, linhas, resumo, alertas, trocas_empresa: trocas };
    }

    /** Ids dos vínculos encerrados mais recentes de cada pessoa (o que a RPC de anulação desfaz) */
    async _ultimosEncerrados(eventoId, pessoaIds) {
        if (pessoaIds.length === 0) return new Set();
        const { data, error } = await buscarPorIdsEmLotes(pessoaIds, (lote) => buscarTodos(
            supabase.from('pulseira_vinculos')
                .select('id, pessoa_id, encerrado_em, entregue_em')
                .eq('evento_id', eventoId)
                .not('encerrado_em', 'is', null)
                .in('pessoa_id', lote)
        ));
        if (error) {
            logger.warn(`[Pulseiras] Desfazer marcação indisponível: ${error.message}`);
            return new Set();
        }
        const melhor = {};
        (data || []).forEach(v => {
            const a = melhor[v.pessoa_id];
            const fimV = Date.parse(v.encerrado_em), fimA = a ? Date.parse(a.encerrado_em) : -Infinity;
            const entV = Date.parse(v.entregue_em), entA = a ? Date.parse(a.entregue_em) : -Infinity;
            if (!a || fimV > fimA || (fimV === fimA && entV > entA)) melhor[v.pessoa_id] = v;
        });
        return new Set(Object.values(melhor).map(v => v.id));
    }

    /**
     * Trocas de empresa no período: a pessoa saiu de uma empresa (de) e entrou em outra (para).
     * Cada troca é a fronteira entre dois períodos do histórico da pessoa.
     */
    async _trocasEmpresa(eventoId, inicio, fim, empresaId = null) {
        const { data: segmentos, error } = await buscarTodos(
            supabase.from('pessoa_empresa_historico')
                .select('pessoa_id, empresa_id, inicio, fim, pessoas!inner(nome_completo, cpf)')
                .eq('evento_id', eventoId)
        );
        if (tabelaAusente(error)) return [];
        if (error) throw error;

        const iniMs = inicio ? Date.parse(inicio) : -Infinity;
        const fimMs = fim ? Date.parse(fim) : Infinity;
        const porPessoa = {};
        (segmentos || []).forEach(s => { (porPessoa[s.pessoa_id] || (porPessoa[s.pessoa_id] = [])).push(s); });

        const brutas = [];
        Object.values(porPessoa).forEach(lista => {
            lista.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
            for (let i = 0; i < lista.length - 1; i++) {
                const antes = lista[i];
                const depois = lista[i + 1];
                if (!antes.fim || antes.empresa_id === depois.empresa_id) continue;
                const quando = Date.parse(antes.fim);
                if (quando < iniMs || quando > fimMs) continue;
                if (empresaId && antes.empresa_id !== empresaId && depois.empresa_id !== empresaId) continue;
                brutas.push({
                    pessoa_id: antes.pessoa_id,
                    colaborador: antes.pessoas?.nome_completo || 'Sem Nome',
                    cpf: antes.pessoas?.cpf || '',
                    de_id: antes.empresa_id,
                    para_id: depois.empresa_id,
                    em: antes.fim
                });
            }
        });

        const ids = [...new Set(brutas.flatMap(t => [t.de_id, t.para_id]).filter(Boolean))];
        const { data: emps } = ids.length
            ? await supabase.from('empresas').select('id, nome').in('id', ids)
            : { data: [] };
        const nomes = Object.fromEntries((emps || []).map(e => [e.id, e.nome]));

        return brutas
            .map(t => ({ ...t, de: nomes[t.de_id] || 'Sem Empresa', para: nomes[t.para_id] || 'Sem Empresa' }))
            .sort((a, b) => Date.parse(b.em) - Date.parse(a.em));
    }

    /**
     * Desfaz o último lançamento errado do operador (RPC anular_ultimo_lancamento_pulseira):
     *  - pulseira em uso errada → anula; se foi troca, a anterior volta (com a mesma hora de entrada)
     *  - marcação de perdida/devolvida por engano → desfaz e reabre a pulseira
     * Tudo numa transação no banco. Funciona horas depois da entrega, desde que o número não
     * esteja com outra pessoa no evento.
     */
    async anularUltimo(eventoId, pessoaId, { observacao } = {}, usuarioId = null) {
        const { data, error } = await supabase.rpc('anular_ultimo_lancamento_pulseira', {
            p_evento_id: eventoId,
            p_pessoa_id: pessoaId,
            p_usuario: usuarioId,
            p_observacao: String(observacao || '').trim() || null
        });
        if (error) {
            if (error.code === 'PGRST202' || error.code === '42883' || tabelaAusente(error)) {
                throw Object.assign(new Error(`Correção de pulseira ainda não criada: rode a migration ${MIGRATION_CORRECAO} antes de usar.`), { status: 400 });
            }
            if (error.code === 'P0002') throw Object.assign(new Error(error.message), { status: 404 });
            if (error.code === 'P0003') throw Object.assign(new Error(error.message), { status: 409 });
            throw error;
        }
        return data;
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

    /**
     * Número trocado ou perdido no mesmo lote (tipo de pulseira) do evento. Usa o cliente de serviço:
     * a tabela não tem política de RLS para o cliente do operador.
     * @returns {{ motivo: string }|null} o motivo do bloqueio, ou null se o número está livre
     */
    async numeroBloqueado(eventoId, numero, tipoPulseiraId = null) {
        const numeroLimpo = String(numero || '').trim();
        if (!eventoId || !numeroLimpo) return null;

        let q = supabase.from('pulseira_vinculos')
            .select('motivo_encerramento')
            .eq('evento_id', eventoId)
            .eq('numero_pulseira', numeroLimpo)
            .in('motivo_encerramento', MOTIVOS_BLOQUEIO)
            .limit(1);
        q = tipoPulseiraId ? q.eq('tipo_pulseira_id', tipoPulseiraId) : q.is('tipo_pulseira_id', null);

        const { data, error } = await q;
        if (tabelaAusente(error)) return null; // sem a migration, a checagem fica desligada (como antes)
        if (error) throw error;
        return data?.[0] ? { motivo: data[0].motivo_encerramento } : null;
    }

    /**
     * Correção feita na tela de check-in: o número digitado errado é anulado (não conta como entrega)
     * e a pessoa recebe o número certo, sem registrar entrada. Mesmas regras de lote e duplicidade da entrega.
     */
    async corrigirNumero(eventoId, pessoaId, numeroDigitado, usuarioId = null, observacao = null) {
        const texto = String(numeroDigitado ?? '').trim();
        if (!/^\d+$/.test(texto) || parseInt(texto, 10) <= 0) throw Object.assign(new Error('Número de pulseira inválido.'), { status: 400 });
        const numero = String(parseInt(texto, 10));

        const { data: pessoa, error: pErr } = await supabase.from('pessoas')
            .select('id, nome_completo, numero_pulseira')
            .eq('id', pessoaId)
            .eq('evento_id', eventoId)
            .maybeSingle();
        if (pErr) throw pErr;
        if (!pessoa) throw Object.assign(new Error('Pessoa não encontrada neste evento.'), { status: 404 });
        if (pessoa.numero_pulseira === numero) throw Object.assign(new Error('Esta pessoa já está com essa pulseira.'), { status: 400 });

        const candidatos = await buscarLotesDaFaixa(supabase, eventoId, parseInt(numero, 10));
        const escolha = await escolherLote(candidatos, eventoId);
        if (escolha.bloqueado) throw Object.assign(new Error(escolha.motivo), { status: 403 });
        if (!escolha.lote) throw Object.assign(new Error('Este número não está em nenhum lote de pulseira do evento.'), { status: 400 });

        const { data: outra, error: oErr } = await supabase.from('pessoas')
            .select('nome_completo')
            .eq('evento_id', eventoId)
            .eq('numero_pulseira', numero)
            .neq('id', pessoaId)
            .limit(1);
        if (oErr) throw oErr;
        if (outra?.length) throw Object.assign(new Error(`Pulseira ${numero} já está com ${outra[0].nome_completo}.`), { status: 409 });

        const bloqueio = await this.numeroBloqueado(eventoId, numero, escolha.lote.id);
        if (bloqueio) throw Object.assign(new Error(`Pulseira ${numero} não pode ser entregue de novo neste lote (${STATUS[bloqueio.motivo] || bloqueio.motivo}).`), { status: 409 });

        // desfaz o número errado (o histórico guarda como anulado); depois grava o certo
        let anulado = false;
        if (pessoa.numero_pulseira) {
            await this.anularUltimo(eventoId, pessoaId, { observacao: observacao || 'Correção de número no check-in' }, usuarioId);
            anulado = true;
        }

        const { error: uErr } = await supabase.from('pessoas')
            .update({ numero_pulseira: numero, tipo_pulseira_id: escolha.lote.id, updated_at: new Date().toISOString() })
            .eq('id', pessoaId)
            .eq('evento_id', eventoId);
        if (uErr) {
            throw Object.assign(new Error(anulado
                ? 'O número errado foi desfeito, mas o número certo não foi gravado. Entregue a pulseira de novo.'
                : uErr.message), { status: 500 });
        }
        this.registrarEntrega(pessoaId, usuarioId);

        return { numero_pulseira: numero, tipo: escolha.lote.nome_tipo, numero_anulado: anulado ? pessoa.numero_pulseira : null };
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
