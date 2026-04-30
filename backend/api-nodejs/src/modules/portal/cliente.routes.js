const express = require('express');
const router = express.Router();
const { supabase, uploadImage } = require('../../config/supabase');
const { authenticate } = require('../../middleware/auth');
const logger = require('../../services/logger');
const syncService = require('../devices/sync.service');
const multer = require('multer');

// Configuração do Multer (Armazenamento em memória para repassar ao Supabase)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (allowedMimeTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Tipo de arquivo não suportado. Apenas PDF, JPG e PNG.'));
    }
});

router.use(authenticate);

// Validação extra: Apenas clientes
const roleGuard = (req, res, next) => {
    if (req.user.role !== 'cliente') {
        return res.status(403).json({ error: 'Acesso negado. Portal exclusivo B2C.' });
    }
    next();
};
router.use(roleGuard);

/**
 * 🎫 GET /api/portal/cliente/meu-ticket
 * Recupera os dados exclusivos daquela pessoa atrelada ao Ticket baseada na sua Auth
 */
router.get('/meu-ticket', async (req, res) => {
    try {
        const pessoaId = req.user.id; // Login do cliente é atrelado à tabela pessoas

        const { data: pessoa, error } = await supabase
            .from('pessoas')
            .select(`
                id,
                nome_completo,
                nome_credencial,
                qrcode,
                foto_url,
                pagamento_validado,
                eventos (nome, local, data_inicio, data_fim)
            `)
            .eq('id', pessoaId)
            .single();

        if (error) throw error;

        // Regra de Negócio: Se pagamento pendente, não retorna o QRCode
        if (!pessoa.pagamento_validado) {
            pessoa.qrcode = null;
        }

        res.json({ success: true, ticket: pessoa });
    } catch (error) {
        logger.error('Portal Cliente: Erro fetch ticket:', error);
        res.status(500).json({ error: 'Falha ao buscar ticket digital.' });
    }
});

/**
 * 📸 POST /api/portal/cliente/selfie
 * Recebe a Base64 da WebCam HTML5, salva no Supabase Storage e manda pra Catraca
 */
router.post('/selfie', async (req, res) => {
    try {
        const pessoaId = req.user.id;
        let { fotoBase64 } = req.body;

        if (!fotoBase64) {
            return res.status(400).json({ error: 'Nenhuma foto enviada.' });
        }

        // Limpa o base64 (remove cabeçalho "data:image/jpeg;base64,") se existir
        if (fotoBase64.includes(';base64,')) {
            fotoBase64 = fotoBase64.split(';base64,').pop();
        }

        const buffer = Buffer.from(fotoBase64, 'base64');
        const filename = `${pessoaId}_${Date.now()}.jpg`;
        const path = `biometria/${filename}`;

        logger.info(`📸 B2C: Upload de Face recebido para pessoa ${pessoaId}. Tamanho: ${buffer.length} bytes`);

        // Upload to Supabase Storage
        const uploadResult = await uploadImage('fotos', path, buffer, 'image/jpeg');

        if (!uploadResult) {
            throw new Error('Falha ao gravar biometria facial no Storage.');
        }

        const fotoUrl = uploadResult.url;

        // Atualiza a tabela Pessoas com a nova foto
        const { error: updateError } = await supabase
            .from('pessoas')
            .update({
                foto_url: fotoUrl,
                status_acesso: 'pendente' // Pendente de re-análise se for o caso, mas a foto atualizou
            })
            .eq('id', pessoaId);

        if (updateError) throw updateError;

        // High Performance: Aciona o Edge AI Microservice de graça para propagar a foto nas catracas Intelbras/Hikvision
        logger.info(`🔄 Disparando auto-enrollment nas catracas para nova selfie [${pessoaId}]`);
        syncService.syncUserToAllDevices(pessoaId).catch((err) => {
            logger.error(`O auto-enrollment falhou para [${pessoaId}] via B2C, mas a imagem foi salva no Supabase. Detalhes:`, err);
        });

        res.json({ success: true, message: 'Selfie cadastrada com sucesso!', fotoUrl });
    } catch (error) {
        logger.error('Portal Cliente: Erro upload selfie:', error);
        res.status(500).json({ error: 'Falha ao processar biometria facial.' });
    }
});

/**
 * 📎 POST /api/portal/cliente/documento
 * Upload de comprovantes de meia-entrada, PCD ou termos (B2C)
 */
router.post('/documento', upload.single('arquivo'), async (req, res) => {
    try {
        const pessoaId = req.user.id;
        const file = req.file;
        const { titulo, tipo_doc } = req.body;

        if (!file) return res.status(400).json({ error: 'Arquivo não fornecido.' });
        if (!titulo || !tipo_doc) return res.status(400).json({ error: 'Título e Tipo são obrigatórios.' });

        const ext = file.originalname.split('.').pop();
        const path = `documentos/pessoa_${pessoaId}_${Date.now()}.${ext}`;

        // Faz o upload do arquivo para o Storage
        const uploadResult = await uploadImage('docs', path, file.buffer, file.mimetype);

        if (!uploadResult) {
            throw new Error('Falha no upload para o Storage de Documentos.');
        }

        // Tenta buscar as categorias de documento na tabela ou insere direto
        // O padrão das NRs de Funcionários é na mesma tabela `pessoa_documentos`, mudando o `tipo_doc`
        const { data, error } = await supabase
            .from('pessoa_documentos')
            .insert([{
                pessoa_id: pessoaId,
                titulo: titulo,
                tipo_doc: tipo_doc, // 'meia_entrada', 'pcd', 'termo_responsabilidade'
                url_arquivo: uploadResult.publicUrl,
                status: 'pendente',
                criado_por_user_id: pessoaId // Auditor do Upload
            }])
            .select()
            .single();

        if (error) throw error;

        logger.info(`📎 B2C: Pessoa ${pessoaId} anexou o documento: ${titulo}`);

        res.status(201).json({
            success: true,
            message: 'Documento enviado com sucesso. Aguardando auditoria do evento.',
            documento: data
        });

    } catch (error) {
        logger.error('Portal Cliente: Erro upload documento:', error);
        res.status(500).json({ error: 'Falha interna ao processar anexo.' });
    }
});

/**
 * 🔄 POST /api/portal/cliente/transferir
 * Emissor: Gera o Hash (Token OTP) de transferência segura e bloqueia seu próprio ticket
 */
router.post('/transferir', async (req, res) => {
    try {
        const pessoaId = req.user.id;

        // Verifica se a pessoa possui um ticket valido
        const { data: pessoa, error: pessoaErr } = await supabase
            .from('pessoas')
            .select('evento_id, pagamento_validado, status_ingresso')
            .eq('id', pessoaId)
            .single();

        if (pessoaErr) throw pessoaErr;

        if (!pessoa.pagamento_validado || pessoa.status_ingresso === 'transferido') {
            return res.status(400).json({ error: 'Ingresso indisponível para transferência.' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');

        // Expira em 1 hora
        const expiraEm = new Date();
        expiraEm.setHours(expiraEm.getHours() + 1);

        // Gera registro na tabela de Transferências
        const { error: transferErr } = await supabase
            .from('transferencias_ingresso')
            .insert([{
                pessoa_origem_id: pessoaId,
                evento_id: pessoa.evento_id,
                token: token,
                status: 'pendente',
                expira_em: expiraEm.toISOString()
            }]);

        if (transferErr) throw transferErr;

        // Suspende o ingresso origem temporariamente
        await supabase
            .from('pessoas')
            .update({ status_ingresso: 'transferencia_pendente' })
            .eq('id', pessoaId);

        logger.info(`🔄 B2C: Pessoa ${pessoaId} iniciou transferência do ingresso.`);

        res.json({
            success: true,
            message: 'Link de transferência gerado com sucesso. Válido por 1 hora.',
            link: `/aceitar-transferencia?token=${token}`
        });

    } catch (error) {
        logger.error('Portal Cliente: Erro ao gerar transferência:', error);
        res.status(500).json({ error: 'Falha ao processar solicitação de transferência.' });
    }
});

/**
 * ✅ POST /api/portal/cliente/aceitar-transferencia
 * Recebedor: Lê o Hash, valida expiração, assume privilégios e destrói o titular antigo.
 */
router.post('/aceitar-transferencia', async (req, res) => {
    try {
        const pessoaDestinoId = req.user.id;
        const { token } = req.body;

        if (!token) return res.status(400).json({ error: 'Token de transferência não fornecido.' });

        // 1. Busca a transferência e valida
        const { data: transfer, error: transferErr } = await supabase
            .from('transferencias_ingresso')
            .select('*')
            .eq('token', token)
            .single();

        if (transferErr || !transfer) {
            return res.status(404).json({ error: 'Transferência não encontrada ou inválida.' });
        }

        if (transfer.status !== 'pendente') {
            return res.status(400).json({ error: `Esta transferência já está ${transfer.status}.` });
        }

        if (new Date(transfer.expira_em) < new Date()) {
            await supabase.from('transferencias_ingresso').update({ status: 'expirada' }).eq('id', transfer.id);
            return res.status(400).json({ error: 'O link de transferência expirou.' });
        }

        if (transfer.pessoa_origem_id === pessoaDestinoId) {
            return res.status(400).json({ error: 'Você não pode transferir para si mesmo.' });
        }

        // 2. Transfere os Direitos (Transação/Assincronia Lógica)
        // Destino ganha Evento e Pagamento. Foto fica nula pra forçar selfie anti-cambista.
        const { error: destErr } = await supabase
            .from('pessoas')
            .update({
                evento_id: transfer.evento_id,
                pagamento_validado: true,
                status_ingresso: 'ativo',
                foto_url: null, // Wipe bio -> forces new Selfie step!
                qr_code: null,  // Will be regenerated
                face_encoding: null
            })
            .eq('id', pessoaDestinoId);

        if (destErr) throw destErr;

        // 3. Origem perde os Direitos e tem cache biométrico apagado
        const { error: origErr } = await supabase
            .from('pessoas')
            .update({
                pagamento_validado: false,
                status_ingresso: 'transferido',
                evento_id: null,
                qrcode: null,
                foto_url: null,
                face_encoding: null,
                status_acesso: 'expulso'
            })
            .eq('id', transfer.pessoa_origem_id);

        if (origErr) {
            logger.warn(`B2C Transfer: O ingresso origem de ${transfer.pessoa_origem_id} falhou ao resetar, mas o destino foi feito.`);
        } else {
            // Deleta a biometria antiga dos terminais Intelbras em tempo real 
            syncService.syncUserToAllDevices(transfer.pessoa_origem_id).catch(() => { });
        }

        // 4. Marca transferência como Concluída
        await supabase
            .from('transferencias_ingresso')
            .update({
                status: 'concluida',
                pessoa_destino_id: pessoaDestinoId,
                completed_at: new Date().toISOString()
            })
            .eq('id', transfer.id);

        logger.info(`✅ B2C: Ingresso ${transfer.id} transferido de [${transfer.pessoa_origem_id}] para [${pessoaDestinoId}]`);

        res.json({ success: true, message: 'Transferência concluída! Ingresso agora é seu.' });

    } catch (error) {
        logger.error('Portal Cliente: Erro no aceite de transferência:', error);
        res.status(500).json({ error: 'Falha interna ao assumir o ingresso.' });
    }
});

module.exports = router;
