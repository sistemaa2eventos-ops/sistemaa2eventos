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
            const worksheet = workbook.addWorksheet('Importar Dados Nexus');

            worksheet.columns = [
                // Dados da Empresa
                { header: 'NOME DA EMPRESA', key: 'empresa_nome', width: 25 },
                { header: 'CNPJ DA EMPRESA', key: 'empresa_cnpj', width: 20 },
                { header: 'EMAIL RESPONSAVEL', key: 'empresa_email', width: 25 },
                { header: 'NOME RESPONSAVEL', key: 'empresa_responsavel', width: 20 },

                // Dados do Colaborador
                { header: 'NOME DO COLABORADOR', key: 'nome', width: 30 },
                { header: 'CPF (Somente números)', key: 'cpf', width: 20 },
                { header: 'NOME DA MÃE', key: 'nome_mae', width: 30 },
                { header: 'NASCIMENTO (DD/MM/AAAA)', key: 'data_nascimento', width: 25 },
                { header: 'FUNCAO', key: 'funcao', width: 20 },
            ];

            // Estilizar cabeçalho
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

            // Colorir seções do cabeçalho
            headerRow.eachCell((cell, colNumber) => {
                if (colNumber <= 4) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3366FF' } }; // Azul para Empresa
                } else {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FF88' } }; // Verde para Colaborador
                }
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=Nexus_Multi_Import_Template.xlsx');

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

            // Cache de empresas já vistas neste arquivo para evitar queries repetidas
            const companyCache = new Map();

            const rows = [];
            worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                if (rowNumber === 1) return;
                rows.push({ row, rowNumber });
            });

            for (const { row, rowNumber } of rows) {
                try {
                    // 1. Extrair Dados da Empresa
                    const emp_nome = row.getCell(1).value;
                    const emp_cnpj = String(row.getCell(2).value || '').replace(/[^\d]/g, '');
                    const emp_email = row.getCell(3).value;
                    const emp_resp = row.getCell(4).value;

                    // 2. Extrair Dados do Colaborador
                    const nome = row.getCell(5).value;
                    const cpf = String(row.getCell(6).value || '').replace(/[^\d]/g, '');
                    const nome_mae = row.getCell(7).value;
                    const data_nasc_raw = row.getCell(8).value;
                    const funcao = row.getCell(9).value;

                    if (!emp_nome || !nome || !cpf || cpf.length !== 11) {
                        errors.push(`Linha ${rowNumber}: Nome da Empresa, Nome do Colaborador e CPF válido são obrigatórios.`);
                        continue;
                    }

                    // 3. Resolver Empresa
                    let empresaId;
                    const cacheKey = `${emp_nome}_${emp_cnpj}`;

                    if (companyCache.has(cacheKey)) {
                        empresaId = companyCache.get(cacheKey);
                    } else {
                        // Buscar ou criar empresa
                        let query = supabase.from('empresas').select('id').eq('evento_id', eventoId).eq('nome', emp_nome);
                        if (emp_cnpj) query = query.or(`cnpj.eq.${emp_cnpj}`);

                        const { data: existingEmp, error: findError } = await query.maybeSingle();

                        if (findError) throw findError;

                        if (existingEmp) {
                            empresaId = existingEmp.id;
                        } else {
                            // Criar nova empresa
                            const { data: newEmp, error: createError } = await supabase.from('empresas').insert([{
                                nome: emp_nome,
                                cnpj: emp_cnpj || null,
                                email: emp_email || null,
                                responsavel: emp_resp || null,
                                evento_id: eventoId,
                                max_colaboradores: 0 // Ilimitado por padrão na importação
                            }]).select('id').single();

                            if (createError) throw createError;
                            empresaId = newEmp.id;
                        }
                        companyCache.set(cacheKey, empresaId);
                    }

                    // 4. Inserir Colaborador (Status PENDENTE para análise)
                    const { code } = await qrGenerator.generate(cpf);

                    const { error: funcError } = await supabase.from('pessoas').upsert({
                        nome,
                        cpf,
                        nome_mae: nome_mae || 'Pendente Análise',
                        data_nascimento: data_nasc_raw ? new Date(data_nasc_raw).toISOString().split('T')[0] : null,
                        funcao: funcao || 'OPERACIONAL',
                        empresa_id: empresaId,
                        evento_id: eventoId,
                        status_acesso: 'pendente', // Manda para análise manual
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

    /**
     * Exporta dados para Excel
     */
    async exportEmployees(req, res) {
        try {
            const { eventoId } = req.query;
            const { data: pessoas, error } = await supabase
                .from('pessoas')
                .select('nome, cpf, nome_mae, data_nascimento, funcao, empresas(nome)')
                .eq('evento_id', eventoId);

            if (error) throw error;

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Relatório Nexus');

            worksheet.columns = [
                { header: 'NOME', key: 'nome', width: 30 },
                { header: 'CPF', key: 'cpf', width: 20 },
                { header: 'MÃE', key: 'nome_mae', width: 30 },
                { header: 'NASCIMENTO', key: 'data_nascimento', width: 15 },
                { header: 'FUNÇÃO', key: 'funcao', width: 20 },
                { header: 'EMPRESA', key: 'empresa', width: 25 },
            ];

            pessoas.forEach(f => {
                worksheet.addRow({
                    nome: f.nome,
                    cpf: f.cpf,
                    nome_mae: f.nome_mae,
                    data_nascimento: f.data_nascimento,
                    funcao: f.funcao,
                    empresa: f.empresas?.nome || 'N/A'
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Nexus_Export_${Date.now()}.xlsx`);

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new ExcelController();
