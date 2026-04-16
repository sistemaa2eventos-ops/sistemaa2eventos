const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../services/logger');
const { requireAuth } = require('../auth');
const Excel = require('exceljs');

router.get('/daily/:evento_id', requireAuth, async (req, res) => {
    try {
        const { evento_id } = req.params;
        const { date } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        const { data: evento } = await supabaseAdmin
            .from('events')
            .select('*')
            .eq('id', evento_id)
            .single();

        if (!evento) {
            return res.status(404).json({ error: 'Evento não encontrado' });
        }

        const resetHour = evento.config?.reset_hour || 6;
        const startDate = new Date(targetDate);
        startDate.setHours(resetHour, 0, 0, 0);
        
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);

        const { data: checkins } = await supabaseAdmin
            .from('checkins')
            .select('*, pessoas(nome, cpf, funcao, empresa_id, empresas(nome), bracelet_number)')
            .gte('timestamp', startDate.toISOString())
            .lt('timestamp', endDate.toISOString())
            .eq('evento_id', evento_id)
            .order('timestamp', { ascending: true });

        const workbook = new Excel.Workbook();
        workbook.creator = 'A2 Eventos NZT';
        workbook.created = new Date();

        const summarySheet = workbook.addWorksheet('Resumo');
        summarySheet.columns = [
            { header: 'Data', key: 'date', width: 15 },
            { header: 'Total Check-ins', key: 'total_checkins', width: 15 },
            { header: 'Total Check-outs', key: 'total_checkouts', width: 15 },
            { header: 'Pessoas no Evento', key: 'presentes', width: 15 }
        ];

        const checkinsCount = checkins.filter(c => c.type === 'checkin').length;
        const checkoutsCount = checkins.filter(c => c.type === 'checkout').length;
        
        summarySheet.addRow({
            date: targetDate,
            total_checkins: checkinsCount,
            total_checkouts: checkoutsCount,
            presentes: checkinsCount - checkoutsCount
        });

        const pessoasMap = new Map();
        
        checkins.forEach(log => {
            if (!log.pessoas) return;
            
            const pid = log.pessoas.id;
            if (!pessoasMap.has(pid)) {
                pessoasMap.set(pid, {
                    nome: log.pessoas.nome,
                    cpf: log.pessoas.cpf,
                    funcao: log.pessoas.funcao,
                    empresa: log.pessoas.empresas?.nome || '',
                    bracelet: log.pessoas.bracelet_number || '',
                    checkins: [],
                    checkouts: []
                });
            }
            
            if (log.type === 'checkin') {
                pessoasMap.get(pid).checkins.push(new Date(log.timestamp));
            } else {
                pessoasMap.get(pid).checkouts.push(new Date(log.timestamp));
            }
        });

        const companyGroups = new Map();
        
        Array.from(pessoasMap.values()).forEach(p => {
            const empresa = p.empresa || 'Sem Empresa';
            if (!companyGroups.has(empresa)) {
                companyGroups.set(empresa, []);
            }
            companyGroups.get(empresa).push(p);
        });

        companyGroups.forEach((pessoas, empresaNome) => {
            const sheet = workbook.addWorksheet(empresaNome.substring(0, 31));
            sheet.columns = [
                { header: 'Nome', key: 'nome', width: 25 },
                { header: 'CPF', key: 'cpf', width: 15 },
                { header: 'Função', key: 'funcao', width: 20 },
                { header: 'Pulseira', key: 'bracelet', width: 10 },
                { header: 'Primeiro Entry', key: 'first_entry', width: 18 },
                { header: 'Último Exit', key: 'last_exit', width: 18 },
                { header: 'Horas Trabalhadas', key: 'horas', width: 15 },
                { header: 'Área', key: 'area', width: 15 }
            ];

            pessoas.forEach(p => {
                const firstEntry = p.checkins.length > 0 ? 
                    p.checkins.sort((a,b) => a - b)[0] : null;
                const lastExit = p.checkouts.length > 0 ?
                    p.checkouts.sort((a,b) => b - a)[0] : null;

                let horas = 0;
                if (firstEntry && lastExit) {
                    horas = (lastExit - firstEntry) / (1000 * 60 * 60);
                }

                sheet.addRow({
                    nome: p.nome,
                    cpf: p.cpf,
                    funcao: p.funcao || '',
                    bracelet: p.bracelet,
                    first_entry: firstEntry ? firstEntry.toLocaleTimeString('pt-BR') : '-',
                    last_exit: lastExit ? lastExit.toLocaleTimeString('pt-BR') : '-',
                    horas: horas > 0 ? horas.toFixed(2) + 'h' : '-',
                    area: 'Entrada Principal'
                });
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_${targetDate}.xlsx`);
        
        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        logger.error('Erro ao gerar relatório:', err);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
});

router.get('/summary/:evento_id', requireAuth, async (req, res) => {
    try {
        const { evento_id } = req.params;

        const { count: totalPessoas } = await supabaseAdmin
            .from('pessoas')
            .select('id', { count: 'exact', head: true })
            .eq('evento_id', evento_id);

        const { count: totalEmpresas } = await supabaseAdmin
            .from('empresas')
            .select('id', { count: 'exact', head: true })
            .eq('evento_id', evento_id);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { count: checkinsHoje } = await supabaseAdmin
            .from('checkins')
            .select('id', { count: 'exact', head: true })
            .eq('evento_id', evento_id)
            .eq('type', 'checkin')
            .gte('timestamp', today.toISOString());

        const { count: veiculos } = await supabaseAdmin
            .from('veiculos')
            .select('id', { count: 'exact', head: true })
            .eq('evento_id', evento_id);

        const { data: statusCounts } = await supabaseAdmin
            .from('pessoas')
            .select('status_acesso', { count: 'exact', head: true })
            .eq('evento_id', evento_id);

        res.json({
            success: true,
            summary: {
                total_pessoas: totalPessoas || 0,
                total_empresas: totalEmpresas || 0,
                checkins_hoje: checkinsHoje || 0,
                total_veiculos: veiculos || 0
            }
        });
    } catch (err) {
        logger.error('Erro ao buscar resumo:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;