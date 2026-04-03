const { supabase, uploadImage } = require('../../config/supabase');
const logger = require('../../services/logger');
const qrGenerator = require('../../utils/qrGenerator');
const emailService = require('../../services/emailService');

class PublicController {
    /**
     * Obter dados da empresa pelo token (Publico)
     */
    async getCompanyByToken(req, res) {
        try {
            const { token } = req.params;

            const { data: empresa, error } = await supabase
                .from('empresas')
                .select('id, nome, datas_presenca, max_colaboradores')
                .eq('registration_token', token)
                .single();

            if (error || !empresa) {
                return res.status(404).json({ error: 'Link de cadastro inválido ou expirado.' });
            }

            let totalPessoas = 0;
            if (empresa.max_colaboradores > 0) {
                const { count } = await supabase
                    .from('pessoas')
                    .select('id', { count: 'exact', head: true })
                    .eq('empresa_id', empresa.id);
                totalPessoas = count || 0;
            }

            // Verificar se ainda há vagas
            const vagas = empresa.max_colaboradores > 0
                ? empresa.max_colaboradores - totalPessoas
                : Infinity;

            res.json({
                success: true,
                company: {
                    id: empresa.id,
                    nome: empresa.nome,
                    vagas: vagas,
                    datas_disponiveis: empresa.datas_presenca || []
                }
            });

        } catch (error) {
            res.status(500).json({ error: 'Erro ao buscar empresa' });
        }
    }

    /**
     * Gerar Pre-signed URL para upload de foto (Performance)
     */
    async generateUploadUrl(req, res) {
        try {
            const { token } = req.params;
            const { cpf } = req.body;

            if (!cpf) return res.status(400).json({ error: 'CPF é obrigatório.' });

            // 1. Validar Token e Empresa
            const { data: empresa, error: empError } = await supabase
                .from('empresas')
                .select('*')
                .eq('registration_token', token)
                .single();

            if (empError || !empresa) {
                return res.status(404).json({ error: 'Link inválido.' });
            }

            const cpfLimpo = cpf.replace(/[^\d]/g, '');
            const filePath = `event_${empresa.evento_id}/${cpfLimpo}_${Date.now()}.jpg`;

            const { data, error } = await supabase.storage
                .from('selfies')
                .createSignedUploadUrl(filePath);

            if (error) throw error;

            const publicUrlData = supabase.storage.from('selfies').getPublicUrl(filePath);

            res.json({
                success: true,
                uploadUrl: data.signedUrl,
                path: filePath,
                publicUrl: publicUrlData.data.publicUrl
            });

        } catch (error) {
            logger.error('Erro ao gerar URL pre-assinada:', error);
            res.status(500).json({ error: 'Erro ao gerar upload URL' });
        }
    }

    async registerEmployee(req, res) {
        try {
            const { token } = req.params;
            const {
                nome,
                cpf,
                email,
                nome_mae,
                data_nascimento,
                funcao,
                dias_trabalho,
                foto_url, // Agora recebe a URL direta após upload do client
                foto_base64, // Fallback
                documentos // Array de base64 ou arquivos
            } = req.body;

            // 1. Validar Token e Empresa
            const { data: empresa, error: empError } = await supabase
                .from('empresas')
                .select('*')
                .eq('registration_token', token)
                .single();

            if (empError || !empresa) {
                return res.status(404).json({ error: 'Link inválido.' });
            }

            // 2. Verificar Limite
            if (empresa.max_colaboradores > 0) {
                const { count } = await supabase
                    .from('pessoas')
                    .select('id', { count: 'exact', head: true })
                    .eq('empresa_id', empresa.id);

                if ((count || 0) >= empresa.max_colaboradores) {
                    return res.status(403).json({ error: 'Limite de colaboradores atingido para esta empresa' });
                }
            }

            // 3. Validar CPF e Duplicidade
            const cpfLimpo = cpf.replace(/[^\d]/g, '');
            const { data: existe } = await supabase
                .from('pessoas')
                .select('id')
                .eq('cpf', cpfLimpo)
                .eq('evento_id', empresa.evento_id)
                .single();

            if (existe) {
                return res.status(400).json({ error: 'Este CPF já está cadastrado para este evento.' });
            }

            // 4. Upload de Foto Biométrica (Fallback se foto_url não for enviada e vier base64)
            let finalFotoUrl = foto_url || '';
            if (!finalFotoUrl && foto_base64) {
                const buffer = Buffer.from(foto_base64.split(',')[1], 'base64');
                const uploadResult = await uploadImage(
                    'selfies',
                    `event_${empresa.evento_id}/${cpfLimpo}_${Date.now()}.jpg`,
                    buffer,
                    'image/jpeg'
                );
                if (uploadResult.success) {
                    finalFotoUrl = uploadResult.url;
                } else {
                    logger.error('Falha no upload de foto pública:', uploadResult.error);
                }
            }

            // 4.5. Upload de Documentos ECM
            let documentosSalvos = [];
            if (documentos && Array.isArray(documentos) && documentos.length > 0) {
                for (const doc of documentos) {
                    if (doc.base64 && doc.name) {
                        try {
                            const docBuffer = Buffer.from(doc.base64.split(',')[1], 'base64');
                            const fileExt = doc.name.split('.').pop().toLowerCase();
                            const mimeType = fileExt === 'pdf' ? 'application/pdf' : (fileExt === 'png' ? 'image/png' : 'image/jpeg');
                            const docPath = `event_${empresa.evento_id}/docs/${cpfLimpo}_${Date.now()}_${doc.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

                            const uploadResult = await uploadImage(
                                'documentos',
                                docPath,
                                docBuffer,
                                mimeType
                            );

                            if (uploadResult.success) {
                                documentosSalvos.push({
                                    nome_arquivo: doc.name,
                                    caminho_arquivo: uploadResult.url,
                                    tipo_documento: 'OUTROS', // General default for public upload
                                    status_auditoria: 'pendente'
                                });
                            }
                        } catch (docErr) {
                            logger.error(`Falha no upload do documento ${doc.name}:`, docErr);
                        }
                    }
                }
            }

            // 5. Gerar QR Code
            const qrData = await qrGenerator.generate(cpfLimpo);

            // 6. Salvar Pessoa
            const { data: pessoa, error: saveErr } = await supabase
                .from('pessoas')
                .insert([{
                    evento_id: empresa.evento_id,
                    empresa_id: empresa.id,
                    nome,
                    cpf: cpfLimpo,
                    nome_mae,
                    data_nascimento,
                    funcao,
                    foto_url: finalFotoUrl,
                    qr_code: qrData.code,
                    status_acesso: 'pendente', // Aguarda aprovação
                    origem_cadastro: 'externo',
                    dias_trabalho: dias_trabalho || []
                }])
                .select()
                .single();

            if (saveErr) throw saveErr;

            // 6.5. Salvar Documentos na Tabela
            if (documentosSalvos.length > 0) {
                const docsToInsert = documentosSalvos.map(doc => ({
                    ...doc,
                    pessoa_id: pessoa.id,
                    evento_id: empresa.evento_id
                }));
                const { error: insertDocsErr } = await supabase
                    .from('pessoa_documentos')
                    .insert(docsToInsert);
                if (insertDocsErr) {
                    logger.error(`[PublicController] Erro ao vincular documentos da pessoa ${pessoa.id}:`, insertDocsErr);
                }
            }

            logger.info(`📝 Novo auto-cadastro: ${nome} (Empresa: ${empresa.nome}, Docs: ${documentosSalvos.length})`);

            // 7. Enviar E-mail de Confirmação (Assíncrono)
            if (email) {
                emailService.sendRegistrationConfirmation(email, nome, empresa.nome)
                    .catch(e => logger.error('[EmailTrigger] Erro silencioso:', e));
            }

            res.status(201).json({
                success: true,
                message: 'Cadastro realizado com sucesso! Aguarde a aprovação.',
                qr_code: qrData.image
            });

        } catch (error) {
            logger.error('Erro no auto-cadastro:', error);
            res.status(500).json({ error: 'Erro interno ao processar cadastro' });
        }
    }
}

module.exports = new PublicController();
