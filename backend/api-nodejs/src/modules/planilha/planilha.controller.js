const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const auditService = require('../../services/audit.service');
const planilhaService = require('./planilha.service');
const { CAMPOS } = require('./planilhaModelo');

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Nome de arquivo seguro ("GYN Eventos / SP" → "GYN_Eventos_SP"). */
const nomeArquivo = (s) => String(s || 'empresa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'empresa';

const responderErro = (res, error, padrao) => {
    if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
    logger.error(`[Planilha] ${padrao}:`, error);
    return res.status(500).json({ error: padrao });
};

const enviarPlanilha = async (res, workbook, arquivo) => {
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
    await workbook.xlsx.write(res);
    res.end();
};

class PlanilhaController {
    /** Modelo da planilha do evento + catálogo de campos (tela de configuração). */
    async obterModelo(req, res) {
        try {
            const { modelo } = await planilhaService.obterModelo(req.event.id);
            const campos = Object.entries(CAMPOS).map(([campo, def]) => ({ campo, rotulo: def.rotulo, tipo: def.tipo, fixo: !!def.fixo }));
            res.json({ success: true, data: { modelo, campos } });
        } catch (error) {
            responderErro(res, error, 'Erro ao carregar o modelo da planilha.');
        }
    }

    async salvarModelo(req, res) {
        try {
            const modelo = await planilhaService.salvarModelo(req.event.id, req.body || {});
            await auditService.logEntity(req, 'UPDATE_SPREADSHEET_TEMPLATE', 'EVENTO', req.event.id, { colunas: modelo.colunas.map(c => c.campo) });
            res.json({ success: true, data: { modelo } });
        } catch (error) {
            responderErro(res, error, 'Erro ao salvar o modelo da planilha.');
        }
    }

    /** Planilha em branco (com o nome da empresa no cabeçalho quando ?empresa_id=). */
    async baixarModelo(req, res) {
        try {
            const empresaId = req.query.empresa_id || null;
            const wb = await planilhaService.modeloEmBranco(req.event.id, empresaId);
            await enviarPlanilha(res, wb, 'Modelo_participantes.xlsx');
        } catch (error) {
            responderErro(res, error, 'Erro ao gerar o modelo da planilha.');
        }
    }

    async exportarEmpresa(req, res) {
        try {
            const { workbook, empresa } = await planilhaService.exportar(req.event.id, req.params.empresaId);
            // Planilha com CPF e dados pessoais: fica registrado quem baixou (LGPD)
            await auditService.logEntity(req, 'EXPORT_COMPANY_PARTICIPANTS', 'EMPRESA', empresa.id, { empresa: empresa.nome });
            await enviarPlanilha(res, workbook, `Participantes_${nomeArquivo(empresa.nome)}.xlsx`);
        } catch (error) {
            responderErro(res, error, 'Erro ao exportar a planilha da empresa.');
        }
    }

    async importarEmpresa(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: 'Envie o arquivo .xlsx da planilha.' });
            const resultado = await planilhaService.importar({
                eventoId: req.event.id,
                empresaId: req.params.empresaId,
                buffer: req.file.buffer,
                usuarioId: req.user?.id
            });
            await auditService.logEntity(req, 'IMPORT_COMPANY_PARTICIPANTS', 'EMPRESA', req.params.empresaId, {
                criados: resultado.criados, atualizados: resultado.atualizados, erros: resultado.erros.length
            });
            res.json({ success: true, data: resultado });
        } catch (error) {
            responderErro(res, error, 'Erro ao importar a planilha.');
        }
    }

    /**
     * Link público da empresa: o participante digita o CPF e recebe o que a empresa já mandou
     * na planilha (só pré-cadastro desta empresa ainda não concluído).
     */
    async preCadastroPublico(req, res) {
        try {
            const { data: empresa, error } = await supabase.from('empresas')
                .select('id, evento_id, registration_token_expires_at')
                .eq('registration_token', req.params.token).maybeSingle();
            if (error) throw error;
            if (!empresa) return res.status(404).json({ error: 'Link de cadastro inválido ou inexistente.' });
            if (empresa.registration_token_expires_at && new Date(empresa.registration_token_expires_at) < new Date()) {
                return res.status(403).json({ error: 'Este link de cadastro expirou.' });
            }
            const dados = await planilhaService.buscarPreCadastro({
                eventoId: empresa.evento_id, empresaId: empresa.id, cpf: req.body?.cpf
            });
            res.json({ success: true, encontrado: !!dados, dados: dados || null });
        } catch (error) {
            responderErro(res, error, 'Erro ao consultar o pré-cadastro.');
        }
    }
}

module.exports = new PlanilhaController();
