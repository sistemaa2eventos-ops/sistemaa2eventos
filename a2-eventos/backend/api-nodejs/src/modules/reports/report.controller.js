const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const pdfService = require('../../services/pdf.service');

class ReportController {
    /**
     * Relatório Diário de Acessos
     * Agrupado por empresa e horário
     */
    async dailyReport(req, res) {
        try {
            const { data_inicio, data_fim, empresa_id, page = 1, limit = 50 } = req.query;
            const evento_id = req.event.id;
            const from = (parseInt(page) - 1) * parseInt(limit);

            // Passo 1: Buscar logs de acesso brutos
            let query = supabase
                .from('logs_acesso')
                .select('id, tipo, metodo, dispositivo_id, confianca, observacao, created_at, pessoa_id, pessoas!inner(id, nome_completo, cpf, empresa_id)', { count: 'exact' })
                .eq('evento_id', evento_id);

            if (data_inicio) query = query.gte('created_at', data_inicio);
            if (data_fim) query = query.lte('created_at', data_fim);
            if (empresa_id) query = query.eq('pessoas.empresa_id', empresa_id);

            const { data: logs, count, error } = await query
                .order('created_at', { ascending: false })
                .range(from, from + parseInt(limit) - 1);

            if (error) throw error;

            // Passo 2: Buscar IDs de empresas para unificação (já temos os dados das pessoas no select original)
            const empIds = [...new Set((logs || []).map(l => l.pessoas?.empresa_id).filter(id => id))];
            const { data: empresasData } = empIds.length > 0
                ? await supabase.from('empresas').select('id, nome').in('id', empIds)
                : { data: [] };

            const empMap = (empresasData || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});

            // Passo 3: Formatar resposta
            const report = (logs || []).map(log => ({
                id: log.id,
                tipo: log.tipo,
                metodo: log.metodo,
                dispositivo_id: log.dispositivo_id,
                confianca: log.confianca,
                observacao: log.observacao,
                horario: log.created_at,
                pessoa: log.pessoas?.nome_completo || 'Desconhecido',
                cpf: log.pessoas?.cpf,
                empresa: empMap[log.pessoas?.empresa_id]?.nome || 'Sem Empresa'
            }));

            res.json({ success: true, total: count || 0, data: report });
        } catch (error) {
            logger.error('Erro ao gerar relatório diário:', error);
            res.status(500).json({ error: 'Erro ao processar relatório' });
        }
    }

    /**
     * Estatísticas Consolidadas por Empresa
     */
    async companySummary(req, res) {
        try {
            const evento_id = req.event.id;

            const { data: pessoas, error } = await supabase
                .from('pessoas')
                .select('status_acesso, empresa_id')
                .eq('evento_id', evento_id);

            if (error) throw error;

            const empIds = [...new Set(pessoas.map(p => p.empresa_id).filter(id => id))];
            const { data: empresasData } = empIds.length > 0
                ? await supabase.from('empresas').select('id, nome').in('id', empIds)
                : { data: [] };

            const empMap = (empresasData || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});

            const summary = pessoas.reduce((acc, curr) => {
                const empresaNome = empMap[curr.empresa_id]?.nome || 'Sem Empresa';
                if (!acc[empresaNome]) {
                    acc[empresaNome] = { total: 0, presentes: 0, ausentes: 0 };
                }
                acc[empresaNome].total++;
                if (curr.status_acesso === 'checkin_feito' || curr.status_acesso === 'entrada') acc[empresaNome].presentes++;
                else acc[empresaNome].ausentes++;
                return acc;
            }, {});

            res.json({ success: true, summary });
        } catch (error) {
            logger.error('Erro no resumo por empresa:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    async porArea(req, res) {
        try {
            const { data_inicio, data_fim } = req.query;
            const evento_id = req.event.id;

            let query = supabase.from('logs_acesso').select('area_id, tipo, created_at').eq('evento_id', evento_id);
            if (data_inicio) query = query.gte('created_at', data_inicio);
            if (data_fim) query = query.lte('created_at', data_fim);

            const { data: logs, error } = await query;
            if (error) throw error;

            const { data: areas } = await supabase.from('areas_acesso').select('id, nome').eq('evento_id', evento_id);
            const areaMap = (areas || []).reduce((acc, a) => { acc[a.id] = a.nome; return acc; }, {});

            const stats = {};
            logs.forEach(log => {
                const areaNome = areaMap[log.area_id] || 'Área Padrão';
                if (!stats[areaNome]) stats[areaNome] = { area: areaNome, entradas: 0, saidas: 0, picos: {} };
                
                if (log.tipo === 'checkin' || log.tipo === 'entrada') stats[areaNome].entradas++;
                if (log.tipo === 'checkout' || log.tipo === 'saida') stats[areaNome].saidas++;
                
                const hora = new Date(log.created_at).getHours();
                stats[areaNome].picos[hora] = (stats[areaNome].picos[hora] || 0) + 1;
            });

            const data = Object.values(stats).map(s => {
                const picoHora = Object.entries(s.picos).sort((a,b) => b[1] - a[1])[0];
                return {
                    area: s.area,
                    entradas: s.entradas,
                    saidas: s.saidas,
                    pico: picoHora ? `${picoHora[0]}:00` : '—'
                };
            });

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro no relatório por área:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    async porEmpresa(req, res) {
        try {
            const { data_inicio, data_fim } = req.query;
            const evento_id = req.event.id;

            let query = supabase.from('logs_acesso').select('tipo, pessoas!inner(empresa_id, empresas(nome))').eq('evento_id', evento_id);
            if (data_inicio) query = query.gte('created_at', data_inicio);
            if (data_fim) query = query.lte('created_at', data_fim);

            const { data: logs, error } = await query;
            if (error) throw error;

            const { data: pessoasCount } = await supabase.from('pessoas').select('empresa_id, status_acesso').eq('evento_id', evento_id);

            const stats = {};
            logs.forEach(log => {
                const empNome = log.pessoas?.empresas?.nome || 'Sem Empresa';
                if (!stats[empNome]) stats[empNome] = { empresa: empNome, pessoas: 0, entradas: 0, saidas: 0, bloqueados: 0, expulsos: 0 };
                if (log.tipo === 'checkin' || log.tipo === 'entrada') stats[empNome].entradas++;
                if (log.tipo === 'checkout' || log.tipo === 'saida') stats[empNome].saidas++;
            });

            pessoasCount.forEach(p => {
                // Aqui precisaríamos do nome da empresa para as pessoas que não tiveram logs no período.
                // Para simplificar e manter performance, focamos em quem teve logs ou usamos o summary anterior.
            });

            res.json({ success: true, data: Object.values(stats) });
        } catch (error) {
            logger.error('Erro no relatório por empresa:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    async porLeitor(req, res) {
        try {
            const { data_inicio, data_fim } = req.query;
            const evento_id = req.event.id;

            let query = supabase.from('logs_acesso').select('dispositivo_id, tipo, observacao').eq('evento_id', evento_id);
            if (data_inicio) query = query.gte('created_at', data_inicio);
            if (data_fim) query = query.lte('created_at', data_fim);

            const { data: logs, error } = await query;
            if (error) throw error;

            const { data: dispositivos } = await supabase.from('dispositivos').select('id, nome, localizacao').eq('evento_id', evento_id);
            const dispMap = (dispositivos || []).reduce((acc, d) => { acc[d.id] = d; return acc; }, {});

            const stats = {};
            logs.forEach(log => {
                const disp = dispMap[log.dispositivo_id] || { nome: 'Terminal Desconhecido', localizacao: '—' };
                const key = log.dispositivo_id || 'unknown';
                if (!stats[key]) stats[key] = { terminal: disp.nome, localizacao: disp.localizacao, total: 0, entradas: 0, saidas: 0, erros: 0 };
                
                stats[key].total++;
                if (log.tipo === 'checkin' || log.tipo === 'entrada') stats[key].entradas++;
                else if (log.tipo === 'checkout' || log.tipo === 'saida') stats[key].saidas++;
                
                if (log.observacao?.toLowerCase().includes('erro') || log.observacao?.toLowerCase().includes('negado')) stats[key].erros++;
            });

            res.json({ success: true, data: Object.values(stats) });
        } catch (error) {
            logger.error('Erro no relatório por leitor:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    async porFuncao(req, res) {
        try {
            const evento_id = req.event.id;
            const { data_inicio, data_fim } = req.query;

            const { data: pessoas, error } = await supabase
                .from('pessoas')
                .select('funcao, status_acesso')
                .eq('evento_id', evento_id);

            if (error) throw error;

            const stats = {};
            pessoas.forEach(p => {
                const func = p.funcao || 'NÃO DEFINIDO';
                if (!stats[func]) stats[func] = { funcao: func, total: 0, presentes: 0, entradas_hoje: 0, saidas_hoje: 0 };
                stats[func].total++;
                if (p.status_acesso === 'checkin_feito' || p.status_acesso === 'entrada') stats[func].presentes++;
            });

            // Buscar logs de hoje para as colunas extras
            const hoje = new Date().toISOString().split('T')[0];
            const { data: logsHoje } = await supabase
                .from('logs_acesso')
                .select('tipo, pessoas!inner(funcao)')
                .eq('evento_id', evento_id)
                .gte('created_at', `${hoje}T00:00:00`);

            (logsHoje || []).forEach(log => {
                const func = log.pessoas?.funcao || 'NÃO DEFINIDO';
                if (stats[func]) {
                    if (log.tipo === 'checkin' || log.tipo === 'entrada') stats[func].entradas_hoje++;
                    if (log.tipo === 'checkout' || log.tipo === 'saida') stats[func].saidas_hoje++;
                }
            });

            res.json({ success: true, data: Object.values(stats) });
        } catch (error) {
            logger.error('Erro no relatório por função:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    async porStatus(req, res) {
        try {
            const evento_id = req.event.id;
            const { data: counts, error } = await supabase.rpc('count_pessoas_by_status', { ev_id: evento_id });
            
            // Fallback se a RPC não existir
            if (error) {
                const { data: pessoas } = await supabase.from('pessoas').select('status_acesso').eq('evento_id', evento_id);
                const stats = (pessoas || []).reduce((acc, p) => {
                    const s = p.status_acesso || 'pendente';
                    acc[s] = (acc[s] || 0) + 1;
                    return acc;
                }, {});
                const data = Object.entries(stats).map(([status, qtd]) => ({ status, quantidade: qtd }));
                return res.json({ success: true, data });
            }

            res.json({ success: true, data: counts });
        } catch (error) {
            logger.error('Erro no relatório por status:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    /**
     * Ranking de Engajamento (Gamificação)
    */
    async getRanking(req, res) {
        try {
            const evento_id = req.event.id;
            
            const { data: settingsData } = await supabase
                .from('system_settings')
                .select('gamification_enabled, gamification_points_scan, gamification_points_earlybird, gamification_points_checkin')
                .eq('id', 1)
                .maybeSingle();

            const settings = settingsData || {
                gamification_enabled: false,
                gamification_points_checkin: 10
            };

            if (!settings.gamification_enabled) return res.json({ success: true, enabled: false, data: [] });

            // 1. Logs
            const { data: logs, error: logsError } = await supabase
                .from('logs_acesso')
                .select('pessoa_id, tipo, created_at')
                .eq('evento_id', evento_id)
                .not('pessoa_id', 'is', null);

            if (logsError) throw logsError;

            // 2. Unificação de Pessoas em Memória
            const pIds = [...new Set(logs.map(l => l.pessoa_id))];
            const { data: pData } = await supabase.from('pessoas').select('id, nome_completo, foto_url, empresa_id').in('id', pIds);
            const pMap = (pData || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {});

            // 3. Unificação de Empresas em Memória
            const eIds = [...new Set((pData || []).map(p => p.empresa_id).filter(id => id))];
            const { data: eData } = await supabase.from('empresas').select('id, nome').in('id', eIds);
            const eMap = (eData || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});

            const scores = {};
            logs.forEach(log => {
                const pid = log.pessoa_id;
                const pessoa = pMap[pid];
                if (!pessoa) return;

                if (!scores[pid]) {
                    scores[pid] = {
                        id: pid,
                        nome: pessoa.nome_completo,
                        empresa: eMap[pessoa.empresa_id]?.nome || 'S/ Empresa',
                        foto: pessoa.foto_url,
                        score: 0,
                        atividades: 0
                    };
                }

                scores[pid].atividades++;
                if (log.tipo === 'checkin') scores[pid].score += settings.gamification_points_checkin;
            });

            const ranking = Object.values(scores).sort((a, b) => b.score - a.score).slice(0, 10);
            res.json({ success: true, enabled: true, data: ranking });
        } catch (error) {
            logger.error('Erro ao gerar ranking:', error);
            res.status(500).json({ error: 'Erro ao calcular gamificação' });
        }
    }

    /**
     * Download de Lista de Presença em PDF
     */
    async attendancePDF(req, res) {
        try {
            const evento_id = req.event.id;
            const evento_nome = req.event.nome;
            const { empresa_id } = req.query;

            // 1. Pessoas
            let query = supabase.from('pessoas').select('nome_completo, cpf, empresa_id').eq('evento_id', evento_id).order('nome_completo');
            if (empresa_id) query = query.eq('empresa_id', empresa_id);
            const { data: pessoas, error } = await query;
            if (error) throw error;

            // 2. Empresas para unificação
            const empIds = [...new Set(pessoas.map(p => p.empresa_id).filter(id => id))];
            const { data: eData } = await supabase.from('empresas').select('id, nome').in('id', empIds);
            const eMap = (eData || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});

            const finalPessoas = pessoas.map(p => ({
                ...p,
                nome: p.nome_completo, // Para compatibilidade com PDF service
                empresas: { nome: eMap[p.empresa_id]?.nome || 'Sem Empresa' }
            }));

            const pdfBuffer = await pdfService.generateAttendanceList({ nome: evento_nome }, finalPessoas);
            res.setHeader('Content-Type', 'application/pdf');
            res.send(pdfBuffer);
        } catch (error) {
            logger.error('Erro ao gerar PDF de presença:', error);
            res.status(500).json({ error: 'Falha ao gerar relatório PDF.' });
        }
    }
}

module.exports = new ReportController();
