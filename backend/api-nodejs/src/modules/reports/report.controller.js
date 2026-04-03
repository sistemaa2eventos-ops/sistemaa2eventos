const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

class ReportController {
    /**
     * Relatório Diário de Acessos
     * Agrupado por empresa e horário
     */
    async dailyReport(req, res) {
        try {
            const { data_inicio, data_fim, empresa_id } = req.query;
            const evento_id = req.event.id;

            let query = supabase
                .from('logs_acesso')
                .select(`
                    id,
                    tipo,
                    metodo,
                    dispositivo_id,
                    confianca,
                    observacao,
                    created_at,
                    pessoas!pessoa_id (
                        nome,
                        cpf,
                        empresas (
                            nome
                        )
                    )
                `)
                .eq('evento_id', evento_id)
                .order('created_at', { ascending: false }); // Changed to descending for "recent" view

            if (data_inicio) query = query.gte('created_at', data_inicio);
            if (data_fim) query = query.lte('created_at', data_fim);
            if (empresa_id) query = query.eq('pessoas.empresa_id', empresa_id);

            const { data, error } = await query;

            if (error) throw error;

            // Processar dados para exibição
            const report = data.map(log => ({
                id: log.id,
                tipo: log.tipo,
                metodo: log.metodo,
                dispositivo_id: log.dispositivo_id,
                confianca: log.confianca,
                observacao: log.observacao,
                horario: log.created_at,
                pessoa: log.pessoas?.nome,
                cpf: log.pessoas?.cpf,
                empresa: log.pessoas?.empresas?.nome
            }));

            res.json({
                success: true,
                evento_id,
                total: report.length,
                data: report
            });

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

            const { data, error } = await supabase
                .from('pessoas')
                .select('status_acesso, empresa_id, empresas(nome)')
                .eq('evento_id', evento_id);

            if (error) throw error;

            const summary = data.reduce((acc, curr) => {
                const empresaNome = curr.empresas?.nome || 'Sem Empresa';
                if (!acc[empresaNome]) {
                    acc[empresaNome] = { total: 0, presentes: 0, ausentes: 0 };
                }
                acc[empresaNome].total++;
                if (curr.status_acesso === 'checkin') acc[empresaNome].presentes++;
                else acc[empresaNome].ausentes++;
                return acc;
            }, {});

            res.json({ success: true, summary });
        } catch (error) {
            logger.error('Erro no resumo por empresa:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }
    /**
     * Ranking de Engajamento (Gamificação)
    */
    async getRanking(req, res) {
        try {
            const evento_id = req.event.id;
            const { getConnection } = require('../../config/database');
            const conn = await getConnection();

            // 1. Obter pesos da gamificação do banco SQL Server
            const settingsResult = await conn.request().query('SELECT TOP 1 gamification_enabled, gamification_points_scan, gamification_points_earlybird, gamification_points_checkin FROM system_settings WHERE id = 1');
            const settings = settingsResult.recordset[0] || {
                gamification_enabled: 0,
                gamification_points_scan: 15,
                gamification_points_earlybird: 50,
                gamification_points_checkin: 10
            };

            if (!settings.gamification_enabled) {
                return res.json({ success: true, enabled: false, data: [] });
            }

            // 2. Obter todos os logs de acesso do evento via Supabase
            const { data: logs, error: logsError } = await supabase
                .from('logs_acesso')
                .select('pessoa_id, tipo, criado_por_admin, created_at, pessoas(nome, foto_url, empresas(nome))')
                .eq('evento_id', evento_id)
                .not('pessoa_id', 'is', null);

            if (logsError) throw logsError;

            // 3. Calcular Score por Pessoa
            const scores = {};

            logs.forEach(log => {
                const pid = log.pessoa_id;
                if (!scores[pid]) {
                    scores[pid] = {
                        id: pid,
                        nome: log.pessoas?.nome || 'Visitante',
                        empresa: log.pessoas?.empresas?.nome || 'S/ Empresa',
                        foto: log.pessoas?.foto_url,
                        score: 0,
                        atividades: 0
                    };
                }

                scores[pid].atividades++;

                // Lógica de Pontuação
                if (log.tipo === 'checkin') {
                    scores[pid].score += settings.gamification_points_checkin;
                }

                // Se o log indica um scan de estande (metodo manual ou flag específica?)
                // Atualmente o sistema usa logs de acesso genéricos. 
                // Vamos simular: se o log não for admin-triggered e for checkin, ganha pontos de scan se for em áreas específicas? 
                // Por hora, simplificaremos: acessos normais = pontos de checkin.
            });

            // 4. Ordenar e retornar Top 10
            const ranking = Object.values(scores)
                .sort((a, b) => b.score - a.score)
                .slice(0, 10);

            res.json({
                success: true,
                enabled: true,
                data: ranking
            });

        } catch (error) {
            logger.error('Erro ao gerar ranking:', error);
            res.status(500).json({ error: 'Erro ao calcular gamificação' });
        }
    }
}

module.exports = new ReportController();
