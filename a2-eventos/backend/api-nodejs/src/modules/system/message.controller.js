const messageService = require('./message.service');
const logger = require('../../services/logger');

class MessageController {
    /**
     * Lista todos os templates para edição no evento
     */
    async index(req, res) {
        try {
            const _s = (v) => (v && v !== 'undefined' && v !== 'null') ? v : null;
            const eventoId = _s(req.event?.id) || _s(req.headers['x-evento-id']) || _s(req.query.evento_id);
            if (!eventoId) return res.status(400).json({ error: 'Evento ID obrigatório' });

            const templates = await messageService.listAvailableTemplates(eventoId);
            res.json({ success: true, data: templates });
        } catch (error) {
            logger.error('Erro ao listar templates:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }

    /**
     * Salva uma personalização de template
     */
    async store(req, res) {
        try {
            const { slug, canal, titulo, conteudo, evento_id } = req.body;
            if (!evento_id) return res.status(400).json({ error: 'Evento ID obrigatório' });

            const data = await messageService.saveTemplate({
                slug, canal, titulo, conteudo, evento_id
            });

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao salvar template:', error);
            res.status(500).json({ error: 'Erro interno ao salvar template' });
        }
    }

    /**
     * Renderiza um template para preview (Simulação)
     */
    async preview(req, res) {
        try {
            const { slug, canal, evento_id, variables } = req.body;
            const template = await messageService.getTemplate(slug, canal, evento_id);
            
            if (!template) return res.status(404).json({ error: 'Template não encontrado' });

            const rendered = messageService.render(template.conteudo, variables || {});
            res.json({ success: true, rendered, titulo: template.titulo });
        } catch (error) {
            logger.error('Erro no preview:', error);
            res.status(500).json({ error: 'Erro ao gerar preview' });
        }
    }
}

module.exports = new MessageController();
