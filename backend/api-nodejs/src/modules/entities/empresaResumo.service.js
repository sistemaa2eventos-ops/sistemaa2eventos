const { supabase } = require('../../config/supabase');
const { buscarTodos } = require('../../utils/buscarTodos');
const { getLimitesDiaLocalUTC } = require('../../utils/dateUtils');
const { assinarLinhas, BUCKETS_FOTO } = require('../../services/storageSeguro');
const requisitos = require('./documentoRequisitos.service');
const documentoService = require('./documento.service');

const TAMANHO_LOTE = 200;

/**
 * Participantes de uma empresa no evento, com o movimento do dia (check-in, check-out, expulsão)
 * e a situação documental de cada um. Usado no botão "Participantes" da tela de empresas.
 */
class EmpresaResumoService {
    async resumoParticipantes(eventoId, empresaId) {
        const pessoasRes = await buscarTodos(
            supabase.from('pessoas')
                .select('id, nome_completo, funcao, numero_pulseira, status_acesso, bloqueado, origem_cadastro, aceite_lgpd, foto_url, created_at')
                .eq('evento_id', eventoId)
                .eq('empresa_id', empresaId)
                .order('nome_completo')
        );
        if (pessoasRes.error) throw pessoasRes.error;
        const pessoas = pessoasRes.data || [];
        const ids = pessoas.map(p => p.id);

        // Movimento de hoje (dia do evento, no fuso local)
        const { start, end } = getLimitesDiaLocalUTC();
        const logsHoje = [];
        const docsPorPessoa = {};
        const config = await requisitos.getConfig(eventoId);
        for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
            const lote = ids.slice(i, i + TAMANHO_LOTE);
            const logs = await buscarTodos(
                supabase.from('logs_acesso').select('pessoa_id, tipo, created_at')
                    .eq('evento_id', eventoId)
                    .in('pessoa_id', lote)
                    .in('tipo', ['checkin', 'checkout', 'expulsao'])
                    .gte('created_at', start).lte('created_at', end)
                    .order('created_at', { ascending: true })
            );
            if (logs.error) throw logs.error;
            logsHoje.push(...(logs.data || []));

            const docs = await buscarTodos(
                supabase.from('pessoa_documentos').select('*').in('pessoa_id', lote)
            );
            if (docs.error) throw docs.error;
            for (const d of docs.data || []) (docsPorPessoa[d.pessoa_id] = docsPorPessoa[d.pessoa_id] || []).push(d);
        }

        // Primeiro check-in, último check-out e expulsões do dia por pessoa
        const movimento = new Map();
        for (const l of logsHoje) {
            const m = movimento.get(l.pessoa_id) || { checkins: 0, checkouts: 0, expulsoes: 0, checkin_em: null, checkout_em: null };
            if (l.tipo === 'checkin') { m.checkins++; if (!m.checkin_em) m.checkin_em = l.created_at; }
            if (l.tipo === 'checkout') { m.checkouts++; m.checkout_em = l.created_at; }
            if (l.tipo === 'expulsao') m.expulsoes++;
            movimento.set(l.pessoa_id, m);
        }

        const linhas = pessoas.map(p => {
            const m = movimento.get(p.id) || { checkins: 0, checkouts: 0, expulsoes: 0, checkin_em: null, checkout_em: null };
            const avaliacao = requisitos.avaliar(config, p, docsPorPessoa[p.id] || []);
            const dentro = p.status_acesso === 'checkin_feito';
            const expulso = p.status_acesso === 'expulso';
            return {
                id: p.id,
                nome_completo: p.nome_completo,
                funcao: p.funcao || null,
                numero_pulseira: p.numero_pulseira || null,
                status_acesso: p.status_acesso,
                checkin_em: m.checkin_em,
                checkout_em: m.checkout_em,
                checkins_hoje: m.checkins,
                checkouts_hoje: m.checkouts,
                expulsoes_hoje: m.expulsoes,
                dentro,
                expulso,
                bloqueado: !!p.bloqueado,
                tem_foto: !!p.foto_url,
                foto_url: p.foto_url || null,
                cadastro_concluido: p.aceite_lgpd === true || p.origem_cadastro !== 'externo',
                situacao_documental: avaliacao.status_documentos,
                pendente: avaliacao.status_documentos !== 'aprovado',
                obrigatorios: documentoService._obrigatoriosComSituacao(avaliacao)
            };
        });

        await assinarLinhas(linhas, { campo: 'foto_url', buckets: BUCKETS_FOTO });

        const resumo = {
            cadastrados: linhas.length,
            com_pulseira: linhas.filter(l => l.numero_pulseira).length,
            checkins_hoje: linhas.filter(l => l.checkins_hoje > 0).length,
            checkouts_hoje: linhas.reduce((soma, l) => soma + l.checkouts_hoje, 0),
            dentro: linhas.filter(l => l.dentro).length,
            expulsos: linhas.filter(l => l.expulso).length,
            expulsoes_hoje: [...movimento.values()].reduce((soma, m) => soma + m.expulsoes, 0),
            pendentes_documentos: linhas.filter(l => l.pendente).length,
            bloqueados: linhas.filter(l => l.bloqueado).length
        };

        return { resumo, participantes: linhas };
    }
}

module.exports = new EmpresaResumoService();
