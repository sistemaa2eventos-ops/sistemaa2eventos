const ExcelJS = require('exceljs');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const qrGenerator = require('../../utils/qrGenerator');

class ExcelController {
    /**
     * Gera template Excel para importação (Empresa + Funcionários)
     */
    async downloadTemplate(req, res) {
        try {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Colaboradores');

            sheet.columns = [
                { header: 'nome *',   key: 'nome',   width: 35 },
                { header: 'cpf *',             key: 'cpf',             width: 18 },
                { header: 'data_nascimento *', key: 'data_nascimento', width: 18 },
                { header: 'nome_mae *',        key: 'nome_mae',        width: 35 },
                { header: 'cargo',             key: 'cargo',           width: 25 },
                { header: 'email',             key: 'email',           width: 30 },
                { header: 'telefone',          key: 'telefone',        width: 18 },
                { header: 'cnpj_empresa',      key: 'cnpj_empresa',    width: 20 },
            ];

            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } };
            sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

            sheet.addRow({
                nome: 'João da Silva',
                cpf: '000.000.000-00',
                data_nascimento: '1990-01-15',
                nome_mae: 'Maria da Silva',
                cargo: 'Técnico',
                email: 'joao@empresa.com',
                telefone: '11999999999',
                cnpj_empresa: '00.000.000/0001-00'
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=template_importacao.xlsx');

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            logger.error('Erro ao gerar template:', error);
            res.status(500).json({ error: 'Erro ao gerar template' });
        }
    }

    /**
     * Importa empresas e funcionários de arquivo Excel
     */
    async importEmployees(req, res) {
        try {
            const { eventoId } = req.body;
            if (!req.file || !eventoId) {
                return res.status(400).json({ error: 'Arquivo e eventoId são obrigatórios' });
            }

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(req.file.buffer);
            const worksheet = workbook.getWorksheet(1);

            let importedCount = 0;
            let errors = [];

            const companyCache = new Map();
            const rows = [];
            worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                if (rowNumber === 1) return;
                rows.push({ row, rowNumber });
            });

            for (const { row, rowNumber } of rows) {
                try {
                    const emp_nome = row.getCell(1).value;
                    const emp_cnpj = String(row.getCell(2).value || '').replace(/[^\d]/g, '');
                    const emp_email = row.getCell(3).value;
                    const emp_resp = row.getCell(4).value;

                    const nomeRaw = row.getCell(5).value;
                    const cpfRaw = String(row.getCell(6).value || '').replace(/[^\d]/g, '');
                    const nome_mae_raw = row.getCell(7).value;
                    const data_nasc_raw = row.getCell(8).value;
                    const funcaoRaw = row.getCell(9).value;

                    const nome = nomeRaw ? String(nomeRaw).toUpperCase().trim().replace(/\s+/g, ' ') : null;
                    const nome_mae = nome_mae_raw ? String(nome_mae_raw).toUpperCase().trim().replace(/\s+/g, ' ') : null;
                    const funcao = funcaoRaw ? String(funcaoRaw).toUpperCase().trim() : 'OPERACIONAL';
                    const cpf = cpfRaw;

                    if (!emp_nome || !nome || !cpf || cpf.length !== 11 || !this.validateCPF(cpf)) {
                        errors.push(`Linha ${rowNumber}: Nome da Empresa, Nome do Colaborador e CPF válido são obrigatórios. CPF informado: ${cpfRaw}`);
                        continue;
                    }

                    let empresaId;
                    const cacheKey = `${emp_nome}_${emp_cnpj}`;

                    if (companyCache.has(cacheKey)) {
                        empresaId = companyCache.get(cacheKey);
                    } else {
                        let query = supabase.from('empresas').select('id').eq('evento_id', eventoId).eq('nome', emp_nome);
                        if (emp_cnpj) query = query.or(`cnpj.eq.${emp_cnpj}`);

                        const { data: existingEmp, error: findError } = await query.maybeSingle();

                        if (findError) throw findError;

                        if (existingEmp) {
                            empresaId = existingEmp.id;
                        } else {
                            const { data: newEmp, error: createError } = await supabase.from('empresas').insert([{
                                nome: emp_nome,
                                cnpj: emp_cnpj || null,
                                email: emp_email || null,
                                responsavel: emp_resp || null,
                                evento_id: eventoId,
                                max_colaboradores: 0
                            }]).select('id').single();

                            if (createError) throw createError;
                            empresaId = newEmp.id;
                        }
                        companyCache.set(cacheKey, empresaId);
                    }

                    const { code } = await qrGenerator.generate(cpf);

                    const { error: funcError } = await supabase.from('pessoas').upsert({
                        nome: nome,
                        cpf,
                        nome_mae: nome_mae || 'Pendente Análise',
                        data_nascimento: data_nasc_raw ? new Date(data_nasc_raw).toISOString().split('T')[0] : null,
                        funcao: funcao || 'OPERACIONAL',
                        empresa_id: empresaId,
                        evento_id: eventoId,
                        status_acesso: 'pendente',
                        origem_cadastro: 'importacao',
                        qr_code: code
                    }, { onConflict: 'cpf, evento_id' });

                    if (funcError) throw funcError;
                    importedCount++;

                } catch (e) {
                    errors.push(`Linha ${rowNumber}: Erro inesperado - ${e.message}`);
                }
            }

            res.json({
                success: true,
                message: `Importação concluída: ${importedCount} registros processados.`,
                errors: errors.length > 0 ? errors : null
            });

        } catch (error) {
            logger.error('Erro na importação Excel:', error);
            res.status(500).json({ error: 'Falha crítica ao processar arquivo' });
        }
    }

    async exportEmployees(req, res) {
        try {
            const { eventoId } = req.query;
            if (!eventoId) {
                return res.status(400).json({ error: 'eventoId é obrigatório para exportação.' });
            }

            const { data: pessoas, error } = await supabase
                .from('pessoas')
                .select('nome, cpf, nome_mae, data_nascimento, funcao, status_acesso, empresas(nome)')
                .eq('evento_id', eventoId)
                .order('nome');

            if (error) throw error;

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Relatório de Participantes');

            worksheet.columns = [
                { header: 'NOME COMPLETO', key: 'nome', width: 40 },
                { header: 'CPF / ID', key: 'cpf', width: 20 },
                { header: 'MÃE', key: 'nome_mae', width: 35 },
                { header: 'DATA NASCIMENTO', key: 'data_nascimento', width: 20 },
                { header: 'FUNÇÃO / CARGO', key: 'funcao', width: 25 },
                { header: 'EMPRESA ÂNCORA', key: 'empresa', width: 30 },
                { header: 'STATUS ACESSO', key: 'status', width: 20 },
            ];

            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00D4FF' } };

            pessoas.forEach(f => {
                worksheet.addRow({
                    nome: f.nome?.toUpperCase(),
                    cpf: f.cpf,
                    nome_mae: f.nome_mae?.toUpperCase(),
                    data_nascimento: f.data_nascimento ? new Date(f.data_nascimento).toLocaleDateString() : 'N/D',
                    funcao: f.funcao || 'N/D',
                    empresa: f.empresas?.nome || 'SEM EMPRESA',
                    status: f.status_acesso?.toUpperCase() || 'ATIVO'
                });
            });

            const fileName = `Nexus_Export_Evento_${eventoId}_${Date.now()}.xlsx`;

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            logger.error('Erro na exportação Excel:', error);
            res.status(500).json({ error: 'Falha ao gerar arquivo Excel.' });
        }
    }

    validateCPF(cpf) {
        if (!cpf || cpf.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(cpf)) return false;

        let soma = 0;
        for (let i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i)) * (10 - i);
        let resto = 11 - (soma % 11);
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.charAt(9))) return false;

        soma = 0;
        for (let i = 0; i < 10; i++) soma += parseInt(cpf.charAt(i)) * (11 - i);
        resto = 11 - (soma % 11);
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.charAt(10))) return false;

        return true;
    }

    async exportPessoas(req, res) {
        try {
            const { evento_id } = req.query;
            if (!evento_id) return res.status(400).json({ error: 'evento_id não informado' });

            const { data, error } = await supabase
                .from('view_pessoas_listagem')
                .select('nome, cpf, funcao, empresa_nome, status_acesso, created_at')
                .eq('evento_id', evento_id)
                .order('nome');

            if (error) return res.status(500).json({ error: 'Erro ao buscar dados.' });

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Pessoas');

            sheet.columns = [
                { header: 'Nome Completo', key: 'nome', width: 35 },
                { header: 'CPF',          key: 'cpf',            width: 18 },
                { header: 'Cargo',        key: 'funcao',           width: 25 },
                { header: 'Empresa',      key: 'empresa_nome',    width: 30 },
                { header: 'Status',       key: 'status_acesso',          width: 20 },
                { header: 'Cadastrado em',key: 'created_at',      width: 22 },
            ];

            sheet.getRow(1).font = { bold: true };
            data.forEach(row => sheet.addRow(row));

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=pessoas_${evento_id}.xlsx`);

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            logger.error('Erro ao exportar pessoas:', error);
            res.status(500).json({ error: 'Falha ao exportar relatorio de pessoas.' });
        }
    }

    // --- NOVOS RELATÓRIOS ---

    async gerarRelatorioDiario(evento_id, data) {
        try {
            const { data: empresas } = await supabase.from('empresas').select('id, nome').eq('evento_id', evento_id);
            const workbook = new ExcelJS.Workbook();

            for (const empresa of (empresas || [])) {
                const sheet = workbook.addWorksheet(empresa.nome.substring(0, 31));
                sheet.mergeCells('A1:H1');
                sheet.getCell('A1').value = empresa.nome;
                sheet.getCell('A1').font = { bold: true, size: 14 };

                sheet.getRow(2).values = ['Nome', 'CPF', 'Função', 'Nº Pulseira', 'Entradas', 'Saídas', 'Horas Trabalhadas'];
                sheet.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
                sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } };

                const { data: pessoas } = await supabase.from('pessoas').select('id, nome, cpf, funcao, numero_pulseira').eq('empresa_id', empresa.id).eq('evento_id', evento_id).order('nome');

                for (const pessoa of (pessoas || [])) {
                    const inicio = `${data}T00:00:00`;
                    const fim = `${data}T23:59:59`;
                    const { data: logs } = await supabase.from('logs_acesso').select('tipo, created_at').eq('pessoa_id', pessoa.id).gte('created_at', inicio).lte('created_at', fim).order('created_at', { ascending: true });

                    const entradasLogs = (logs || []).filter(l => l.tipo === 'checkin' || l.tipo === 'entrada');
                    const saidasLogs = (logs || []).filter(l => l.tipo === 'checkout' || l.tipo === 'saida');

                    const entradasFmt = entradasLogs.map(l => new Date(l.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
                    const saidasFmt = saidasLogs.map(l => new Date(l.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

                    let totalMinutos = 0;
                    const detalhes = [];
                    const pares = Math.min(entradasLogs.length, saidasLogs.length);

                    for (let i = 0; i < pares; i++) {
                        const min = Math.round((new Date(saidasLogs[i].created_at) - new Date(entradasLogs[i].created_at)) / 60000);
                        totalMinutos += min;
                        detalhes.push(`${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`);
                    }

                    const horasFmt = detalhes.length > 0 ? (detalhes.length > 1 ? `${detalhes.join(' + ')} = ${Math.floor(totalMinutos / 60)}h${String(totalMinutos % 60).padStart(2, '0')}` : detalhes[0]) : '—';

                    const row = sheet.addRow([pessoa.nome, pessoa.cpf, pessoa.funcao || '—', pessoa.numero_pulseira || '—', entradasFmt.join(' / ') || '—', saidasFmt.join(' / ') || '—', horasFmt]);
                    row.alignment = { wrapText: true, vertical: 'top' };
                }
                sheet.columns = [{ width: 35 }, { width: 16 }, { width: 25 }, { width: 14 }, { width: 22 }, { width: 22 }, { width: 28 }];
            }
            return workbook;
        } catch (error) {
            logger.error('Erro em gerarRelatorioDiario:', error);
            throw error;
        }
    }

    async relatorioDiarioManual(req, res) {
        try {
            const { evento_id, data } = req.query;
            const hoje = data || new Date().toISOString().split('T')[0];
            const workbook = await this.gerarRelatorioDiario(evento_id, hoje);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=relatorio_diario_${hoje}.xlsx`);
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            logger.error('Erro no download manual do relatório diário:', error);
            res.status(500).json({ error: 'Erro ao gerar planilha.' });
        }
    }

    toCSV(rows, columns) {
        const header = columns.map(c => c.header).join(',');
        const lines = rows.map(row => columns.map(c => `"${row[c.key] || ''}"`).join(','));
        return [header, ...lines].join('\n');
    }

    async _exportGeneric(req, res, reportName, fetchFunc, columns, format) {
        try {
            const data = await fetchFunc(req);
            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename=${reportName}.csv`);
                return res.send('\uFEFF' + this.toCSV(data, columns));
            }
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet(reportName.substring(0, 31));
            sheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width || 20 }));
            sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } };
            data.forEach(r => sheet.addRow(r));
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${reportName}.xlsx`);
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            logger.error(`Erro ao exportar ${reportName}:`, error);
            res.status(500).json({ error: 'Erro exportação' });
        }
    }

    async exportPorArea(req, res) {
        const reportController = require('./report.controller');
        const columns = [{ header: 'Área', key: 'area', width: 30 }, { header: 'Entradas', key: 'entradas' }, { header: 'Saídas', key: 'saidas' }, { header: 'Pico de Fluxo', key: 'pico' }];
        const fetchFunc = async (req) => {
            const mockRes = { json: (d) => d };
            const result = await reportController.porArea(req, mockRes);
            return result.data;
        };
        await this._exportGeneric(req, res, 'Relatorio_Por_Area', fetchFunc, columns, req.query.format);
    }

    async exportPorEmpresa(req, res) {
        const reportController = require('./report.controller');
        const columns = [{ header: 'Empresa', key: 'empresa', width: 30 }, { header: 'Pessoas', key: 'pessoas' }, { header: 'Entradas', key: 'entradas' }, { header: 'Saídas', key: 'saidas' }, { header: 'Bloqueados', key: 'bloqueados' }, { header: 'Expulsos', key: 'expulsos' }];
        const fetchFunc = async (req) => {
            const mockRes = { json: (d) => d };
            const result = await reportController.porEmpresa(req, mockRes);
            return result.data;
        };
        await this._exportGeneric(req, res, 'Relatorio_Por_Empresa', fetchFunc, columns, req.query.format);
    }

    async exportPorLeitor(req, res) {
        const reportController = require('./report.controller');
        const columns = [{ header: 'Terminal', key: 'terminal', width: 30 }, { header: 'Localização', key: 'localizacao', width: 25 }, { header: 'Total Leituras', key: 'total' }, { header: 'Entradas', key: 'entradas' }, { header: 'Saídas', key: 'saidas' }, { header: 'Erros/Negados', key: 'erros' }];
        const fetchFunc = async (req) => {
            const mockRes = { json: (d) => d };
            const result = await reportController.porLeitor(req, mockRes);
            return result.data;
        };
        await this._exportGeneric(req, res, 'Relatorio_Por_Leitor', fetchFunc, columns, req.query.format);
    }

    async exportPorFuncao(req, res) {
        const reportController = require('./report.controller');
        const columns = [{ header: 'Função/Cargo', key: 'funcao', width: 30 }, { header: 'Total Pessoas', key: 'total' }, { header: 'Presentes', key: 'presentes' }, { header: 'Entradas Hoje', key: 'entradas_hoje' }, { header: 'Saídas Hoje', key: 'saidas_hoje' }];
        const fetchFunc = async (req) => {
            const mockRes = { json: (d) => d };
            const result = await reportController.porFuncao(req, mockRes);
            return result.data;
        };
        await this._exportGeneric(req, res, 'Relatorio_Por_Funcao', fetchFunc, columns, req.query.format);
    }

    async exportPorStatus(req, res) {
        const reportController = require('./report.controller');
        const columns = [{ header: 'Status', key: 'status', width: 30 }, { header: 'Quantidade', key: 'quantidade' }];
        const fetchFunc = async (req) => {
            const mockRes = { json: (d) => d };
            const result = await reportController.porStatus(req, mockRes);
            return result.data;
        };
        await this._exportGeneric(req, res, 'Relatorio_Por_Status', fetchFunc, columns, req.query.format);
    }

    // Aliases para compatibilidade com rotas antigas/específicas
    downloadTemplatePessoas = this.downloadTemplate;
    importPessoas = this.importEmployees;
}

module.exports = new ExcelController();
