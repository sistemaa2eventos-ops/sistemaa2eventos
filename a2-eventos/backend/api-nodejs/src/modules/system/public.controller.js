const { supabase, uploadImage } = require('../../config/supabase');
const logger = require('../../services/logger');
const qrGenerator = require('../../utils/qrGenerator');
const emailService = require('../../services/emailService');
const cacheService = require('../../services/cacheService');

class PublicController {
    /**
     * Obter dados da empresa pelo token (Publico)
     */
    async getCompanyByToken(req, res) {
        try {
            const { token } = req.params;
            
            const { data: empresa, error } = await supabase
                .from('empresas')
                .select(`
                    id, nome, datas_presenca, max_colaboradores, registration_token_expires_at, evento_id,
                    eventos (
                        nome, logo_url, campos_obrigatorios, politica_privacidade_url, datas_montagem, datas_evento, datas_desmontagem
                    )
                `)
                .eq('registration_token', token)
                .single();

            if (error || !empresa) {
                logger.error({ err: error, token }, `[PortalPublico] Falha ao localizar empresa por token: ${token}`);
                return res.status(404).json({ error: 'Link de cadastro inválido ou inexistente. Gere um novo convite no painel admin.' });
            }

            console.log(`[PortalPublico] ✅ Empresa identificada: ${empresa.nome} para o evento ${empresa.eventos?.nome}`);

            const evento = empresa.eventos;

            // Validar expiração
            if (empresa.registration_token_expires_at && new Date(empresa.registration_token_expires_at) < new Date()) {
                return res.status(403).json({ error: 'Este link de registro expirou. Solicite um novo convite ao administrador do evento.' });
            }

            // --- ⚡ PERFORMANCE: Otimização de Contagem (Inscritos) ---
            const { count: totalPessoas } = await supabase
                .from('pessoas')
                .select('id', { count: 'exact', head: true })
                .eq('empresa_id', empresa.id);

            // Verificar se ainda há vagas
            const vagas = empresa.max_colaboradores > 0
                ? empresa.max_colaboradores - (totalPessoas || 0)
                : Infinity;

            // Montar array consolidados das datas do evento, caso a empresa não tenha datas fixas
            const eventDates = evento ? [
                ...(evento.datas_montagem || []),
                ...(evento.datas_evento || []),
                ...(evento.datas_desmontagem || [])
            ] : [];

            // Remover datas duplicadas do evento, e ordenar
            const allEventDates = [...new Set(eventDates)].sort();

            const branding = evento ? {
                evento_nome: evento.nome,
                logo_url: evento.logo_url || null,
                politica_url: evento.politica_privacidade_url || null
            } : null;

            const responseData = {
                success: true,
                company: {
                    id: empresa.id,
                    nome: empresa.nome,
                    vagas: vagas,
                    datas_disponiveis: (empresa.datas_presenca && empresa.datas_presenca.length > 0) 
                        ? empresa.datas_presenca 
                        : allEventDates
                },
                branding,
                requiredFields: evento?.campos_obrigatorios || null
            };

            cacheService.set(`company_${token}`, responseData);
            res.json(responseData);

        } catch (error) {
            logger.error('Erro em getCompanyByToken:', error);
            res.status(500).json({ error: 'Erro ao buscar dados da empresa' });
        }
    }

    /**
     * Obter a lista de colaboradores associados à empresa do token (Publico, ofuscado)
     */
    async getCompanyEmployeesByToken(req, res) {
        try {
            const { token } = req.params;
            
            // Encontrar empresa vinculada ao token público
            const { data: empresa, error: empresaError } = await supabase
                .from('empresas')
                .select('id, evento_id')
                .eq('registration_token', token)
                .single();

            if (empresaError || !empresa) {
                logger.warn(`🛑 Token 404 em getCompanyEmployeesByToken: ${token}`);
                return res.status(404).json({ error: 'Link corporativo inválido.' });
            }

            // Selecionar os colaboradores — usa select('*') para resiliência de schema
            const { data: rawEmployees, error: empError } = await supabase
                .from('pessoas')
                .select('*')
                .eq('empresa_id', empresa.id)
                .order('created_at', { ascending: false });

            if (empError) {
                logger.error('Supabase error in getCompanyEmployeesByToken:', JSON.stringify(empError));
                return res.status(500).json({ error: 'Erro ao buscar lista de credenciados', detail: empError.message, code: empError.code });
            }

            const employees = (rawEmployees || []).map(emp => ({
                id: emp.id,
                nome: emp.nome_completo || emp.nome || 'Sem nome',
                funcao: emp.funcao,
                status_acesso: emp.status_acesso
            }));

            return res.json({ success: true, employees });

        } catch (error) {
            logger.error('Erro em getCompanyEmployeesByToken:', error);
            res.status(500).json({ error: 'Erro ao buscar lista de credenciados', detail: error.message });
        }
    }

    /**
     * Obter dados de um colaborador pelo token de convite (Publico)
     */
    async getPersonByToken(req, res) {

        try {
            const { token } = req.params;

            const { data: pessoa, error } = await supabase
                .from('pessoas')
                .select(`
                    id, nome, cpf, email, funcao, registration_token_expires_at, evento_id, empresa_id,
                    eventos (
                        nome, cor_primaria, cor_secundaria, logo_url, banner_url, campos_obrigatorios, politica_privacidade_url
                    ),
                    empresas ( nome )
                `)
                .eq('registration_token', token)
                .single();

            if (error || !pessoa) {
                return res.status(404).json({ error: 'Convite individual inválido ou expirado.' });
            }

            // Validar expiração
            if (pessoa.registration_token_expires_at && new Date(pessoa.registration_token_expires_at) < new Date()) {
                return res.status(403).json({ error: 'Este link de convite expirou. Solicite um novo à sua empresa.' });
            }

            const evento = pessoa.eventos;
            const branding = evento ? {
                evento_nome: evento.nome,
                cor_primaria: evento.cor_primaria || null,
                cor_secundaria: evento.cor_secundaria || null,
                logo_url: evento.logo_url || null,
                banner_url: evento.banner_url || null,
                politica_url: evento.politica_privacidade_url || null
            } : null;

            res.json({
                success: true,
                isPreRegistered: true,
                pessoa: {
                    id: pessoa.id,
                    nome: pessoa.nome,
                    cpf: pessoa.cpf,
                    email: pessoa.email,
                    funcao: pessoa.funcao,
                    empresa_nome: pessoa.empresas?.nome
                },
                branding,
                requiredFields: evento?.campos_obrigatorios || null
            });
        } catch (error) {
            logger.error('Erro em getPersonByToken:', error);
            res.status(500).json({ error: 'Erro ao validar convite individual' });
        }
    }

    /**
     * Gerar URL assinada para upload direto (Frontend -> Storage)
     */
    async generateUploadUrl(req, res) {
        try {
            const { token } = req.params;
            const { cpf, bucket = 'selfies' } = req.body;

            if (!cpf) return res.status(400).json({ error: 'CPF é obrigatório para gerar URL.' });

            // 1. Validar Token (Pode ser de empresa ou convite individual)
            const { data: empresaContext } = await supabase
                .from('empresas')
                .select('id, evento_id')
                .eq('registration_token', token)
                .single();

            let eventoId = empresaContext?.evento_id;

            if (!empresaContext) {
                const { data: pessoaContext } = await supabase
                    .from('pessoas')
                    .select('id, evento_id')
                    .eq('registration_token', token)
                    .single();
                
                if (!pessoaContext) {
                    return res.status(404).json({ error: 'Link de registro inválido para upload.' });
                }
                eventoId = pessoaContext.evento_id;
            }

            const cleanCpf = cpf.replace(/\D/g, '');
            const fileName = `${cleanCpf}_${Date.now()}.jpg`;
            const path = `event_${eventoId}/${bucket}/${fileName}`;

            const { data, error } = await supabase
                .storage
                .from(bucket)
                .createSignedUploadUrl(path);

            if (error) throw error;

            // 4. Gerar URL pública para leitura posterior
            const { data: publicData } = supabase
                .storage
                .from(bucket)
                .getPublicUrl(path);

            res.json({
                success: true,
                uploadUrl: data.signedUrl,
                publicUrl: publicData.publicUrl,
                path: path,
                token: data.token
            });

        } catch (error) {
            logger.error('Erro em generateUploadUrl:', error);
            res.status(500).json({ error: 'Erro ao gerar URL de upload.' });
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
                foto_url,
                foto_base64,
                documentos,
                aceite_lgpd,
                tipo_pessoa,
                fases_acesso,
                documento_foto,
                trabalho_area_tecnica,
                trabalho_altura
            } = req.body;

            // Validar aceite LGPD - aceitar como boolean ou string 'true'
            const aceiteValido = aceite_lgpd === true || aceite_lgpd === 'true' || aceite_lgpd === 1 || aceite_lgpd === '1';
            if (!aceiteValido) {
                console.log(`[DEBUG] aceite_lgpd recebido: "${aceite_lgpd}" (tipo: ${typeof aceite_lgpd})`);
                return res.status(400).json({ error: 'O aceite dos termos de privacidade (LGPD) é obrigatório.' });
            }

            // Remove validação de email - campo não é mais obrigatório no formulário público
            // O email de confirmação será enviado para o email da empresa cadastrada

            // 1. Identificar Contexto do Token (Empresa ou Pessoa?)
            let context = null;
            let targetId = null; 
            let activeContext = null;

            console.log(`[DEBUG] Tentando registrar com token: "${token}"`);

            // Tenta Pessoa Primeiro (Convite Direto)
            const { data: pessoaContext } = await supabase
                .from('pessoas')
                .select('id, evento_id, empresa_id, registration_token_expires_at')
                .eq('registration_token', token)
                .single();

            if (pessoaContext) {
                console.log(`[DEBUG] Token encontrado na tabela PESSOAS. ID: ${pessoaContext.id}`);
                context = 'PESSOA';
                targetId = pessoaContext.id;
                activeContext = pessoaContext;
            } else {
                // Tenta Empresa (Ficha Limpa)
                const { data: empresaContext } = await supabase
                    .from('empresas')
                    .select('id, evento_id, registration_token_expires_at, max_colaboradores')
                    .eq('registration_token', token)
                    .single();
                
                if (empresaContext) {
                    console.log(`[DEBUG] Token encontrado na tabela EMPRESAS. ID: ${empresaContext.id}`);
                    context = 'EMPRESA';
                    targetId = empresaContext.id;
                    activeContext = empresaContext;
                }
            }

            if (!context || !activeContext) {
                console.warn(`[WARN] Token não encontrado em nenhuma tabela: "${token}"`);
                // Debug: verificar se existe algum token similar
                const { data: allEmpresas } = await supabase
                    .from('empresas')
                    .select('id, nome, registration_token')
                    .limit(5);
                
                const { data: allPessoas } = await supabase
                    .from('pessoas')
                    .select('id, nome, registration_token')
                    .not('registration_token', 'is', null)
                    .limit(5);
                
                console.log(`[DEBUG] Empresas com tokens:`, JSON.stringify(allEmpresas));
                console.log(`[DEBUG] Pessoas com tokens:`, JSON.stringify(allPessoas));
                return res.status(404).json({ error: 'Link de registro inválido ou expirado.' });
            }

            // Validar expiração
            if (activeContext.registration_token_expires_at && new Date(activeContext.registration_token_expires_at) < new Date()) {
                console.warn(`[WARN] Token expirado: ${activeContext.registration_token_expires_at}`);
                return res.status(403).json({ error: 'O link de registro expirou.' });
            }

            const eventoId = activeContext.evento_id;
            const empresaId = context === 'PESSOA' ? activeContext.empresa_id : activeContext.id;

            // 2. Validar CPF e Duplicidade (Apenas se for novo registro)
            const cpfLimpo = cpf.replace(/[^\d]/g, '');
            if (context === 'EMPRESA') {
                const { data: existe } = await supabase
                    .from('pessoas')
                    .select('id')
                    .eq('cpf', cpfLimpo)
                    .eq('evento_id', eventoId)
                    .single();

                if (existe) return res.status(400).json({ error: 'Este CPF já está cadastrado.' });

                // Verificar Limite
                if (activeContext.max_colaboradores > 0) {
                    const { count } = await supabase
                        .from('pessoas')
                        .select('id', { count: 'exact', head: true })
                        .eq('empresa_id', empresaId);

                    if ((count || 0) >= activeContext.max_colaboradores) {
                        return res.status(403).json({ error: 'Limite de vagas atingido.' });
                    }
                }
            }

            // 3. Upload de Foto
            let finalFotoUrl = foto_url || '';
            if (!finalFotoUrl && foto_base64) {
                const buffer = Buffer.from(foto_base64.split(',')[1], 'base64');
                const uploadResult = await uploadImage('selfies', `event_${eventoId}/${cpfLimpo}_${Date.now()}.jpg`, buffer, 'image/jpeg');
                if (uploadResult.success) finalFotoUrl = uploadResult.url;
            }

            // 4. Upload de Documentos
            let documentosSalvos = [];
            if (documentos && Array.isArray(documentos)) {
                for (const doc of documentos) {
                    if (doc.base64) {
                        const buffer = Buffer.from(doc.base64.split(',')[1], 'base64');
                        const ext = doc.name.split('.').pop().toLowerCase();
                        const path = `event_${eventoId}/docs/${cpfLimpo}_${Date.now()}_${doc.name.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;
                        const upload = await uploadImage('documentos', path, buffer, ext === 'pdf' ? 'application/pdf' : 'image/jpeg');
                        if (upload.success) {
                            documentosSalvos.push({
                                nome_arquivo: doc.name,
                                caminho_arquivo: upload.url,
                                tipo_documento: 'OUTROS',
                                status_auditoria: 'pendente'
                            });
                        }
                    }
                }
            }
            // 4.5 Verificar se CPF já existe antes de inserir (Para evitar 500 de UNIQUE constraint)
            const { data: cpfExistente } = await supabase
                .from('pessoas')
                .select('id')
                .eq('evento_id', eventoId)
                .eq('cpf', cpfLimpo)
                .maybeSingle();

            if (cpfExistente && context === 'EMPRESA') {
                console.warn(`[WARN] CPF já cadastrado: ${cpfLimpo}`);
                return res.status(409).json({ error: 'Este CPF já está cadastrado para este evento.' });
            }

            // 5. Descobrir schema real da tabela pessoas (nome vs nome_completo)
            //    Faz um select rápido para ver quais colunas existem
            const { data: schemaSample } = await supabase
                .from('pessoas')
                .select('*')
                .limit(1);

            const sampleKeys = schemaSample && schemaSample.length > 0 ? Object.keys(schemaSample[0]) : [];
            const hasNomeCompleto = sampleKeys.includes('nome_completo');
            const nameField = hasNomeCompleto ? 'nome_completo' : 'nome';
            logger.info(`[Schema] Tabela pessoas usa campo: ${nameField} (colunas: ${sampleKeys.slice(0, 10).join(', ')}...)`);

            // Salvar / Atualizar Pessoa (QR code NÃO é gerado aqui - apenas após aprovação)
            const rawPersonaData = {
                [nameField]: nome,
                cpf: cpfLimpo,
                email: email || null,
                nome_mae: nome_mae || null,
                data_nascimento: data_nascimento || null,
                funcao: funcao || null,
                foto_url: finalFotoUrl || null,
                documento_foto: documento_foto || null,
                qr_code: null,
                status_acesso: 'pendente',
                origem_cadastro: 'externo',
                tipo_pessoa: tipo_pessoa || 'colaborador',
                fases_acesso: fases_acesso || [],
                dias_acesso: dias_trabalho || [],
                dias_trabalho: dias_trabalho || [],
                trabalha_area_tecnica: trabalho_area_tecnica || false,
                trabalha_altura: trabalho_altura || false,
                aceite_lgpd: true,
                data_aceite_lgpd: new Date(),
                registration_token: null,
                registration_token_expires_at: null
            };

            // Filtrar apenas campos que existem na tabela (evita 400 por coluna inexistente)
            const personaData = {};
            const ignoredFields = [];
            for (const [key, value] of Object.entries(rawPersonaData)) {
                if (sampleKeys.length === 0 || sampleKeys.includes(key)) {
                    personaData[key] = value;
                } else {
                    ignoredFields.push(key);
                }
            }
            if (ignoredFields.length > 0) {
                logger.info(`[Schema] Campos ignorados (não existem na tabela): ${ignoredFields.join(', ')}`);
            }

            let finalPessoaId = null;

            if (context === 'PESSOA') {
                const { error: updErr } = await supabase
                    .from('pessoas')
                    .update(personaData)
                    .eq('id', targetId);
                if (updErr) throw updErr;
                finalPessoaId = targetId;
            } else {
                const { data: newPessoa, error: insErr } = await supabase
                    .from('pessoas')
                    .insert([{ ...personaData, evento_id: eventoId, empresa_id: empresaId }])
                    .select('id')
                    .single();
                
                if (insErr) {
                    logger.error('Erro ao inserir nova pessoa:', JSON.stringify(insErr));
                    return res.status(400).json({
                        error: insErr.code === '23505' ? 'Este CPF já está cadastrado.' : 'Erro ao criar registro de colaborador.',
                        detail: insErr.message,
                        code: insErr.code
                    });
                }
                
                if (!newPessoa) throw new Error('Falha ao obter ID da nova pessoa');
                finalPessoaId = newPessoa.id;
            }

            // 6. Vincular Documentos
            if (documentosSalvos.length > 0) {
                await supabase.from('pessoa_documentos').insert(
                    documentosSalvos.map(d => ({ ...d, pessoa_id: finalPessoaId, evento_id: eventoId }))
                );
            }

            // 7. Registro LGPD (não bloqueia o cadastro se falhar)
            try {
                const lgpdService = require('./lgpd.service');
                await lgpdService.recordConsent(finalPessoaId, eventoId, {
                    ip: req.ip,
                    userAgent: req.headers['user-agent']
                });
            } catch (lgpdErr) {
                logger.warn(`[LGPD] Falha ao registrar consentimento (não bloqueante): ${lgpdErr.message}`);
            }

            logger.info(`✅ Cadastro concluído via token (${context}): ${nome}`);

            // Enviar email de confirmação para a empresa (não para o colaborador)
            try {
                const { data: empresaData } = await supabase
                    .from('empresas')
                    .select('email, nome')
                    .eq('id', empresaId)
                    .single();
                
                if (empresaData?.email) {
                    await emailService.sendEmployeeInvite(
                        empresaData.email,
                        nome,
                        empresaData.nome,
                        `${process.env.PUBLIC_PORTAL_URL || 'http://localhost:3000'}`
                    ).catch(e => logger.warn('Erro ao enviar email de confirmação:', e.message));
                }
            } catch (emailErr) {
                logger.warn('Erro ao buscar email da empresa para notificação:', emailErr.message);
            }

            res.status(201).json({
                success: true,
                message: 'Cadastro concluído! A empresa foi notificada.',
                qr_code: null
            });

        } catch (error) {
            logger.error('Erro em registerEmployee (token):', error);
            res.status(500).json({ error: 'Erro interno ao processar cadastro.' });
        }
    }


    async validateInvite(req, res) {
        try {
            const { token } = req.params;
            const { data, error } = await supabase
                .from('empresas')
                .select('id, nome, evento_id, eventos(nome)')
                .eq('invite_token', token)
                .gt('invite_expires', new Date().toISOString())
                .single();

            if (error || !data) {
                return res.status(404).json({
                    error: 'Link inválido ou expirado.'
                });
            }
            res.json({ success: true, empresa: data });
        } catch (error) {
            logger.error('Erro em validateInvite:', error);
            res.status(500).json({ error: 'Erro ao validar convite' });
        }
    }

    async submitCadastro(req, res) {
        try {
            const { token, pessoa } = req.body;

            // Valida token
            const { data: empresa, error } = await supabase
                .from('empresas')
                .select('id, evento_id')
                .eq('invite_token', token)
                .gt('invite_expires', new Date().toISOString())
                .single();

            if (error || !empresa) {
                return res.status(403).json({ error: 'Link inválido ou expirado.' });
            }

            // --- 🛡️ Upload de Foto Base64 Integrado ---
            let finalFotoUrl = null;
            if (pessoa.foto_base64) {
                const cpfLimpo = pessoa.cpf.replace(/[^\d]/g, '');
                const buffer = Buffer.from(pessoa.foto_base64.split(',')[1], 'base64');
                const uploadResult = await uploadImage(
                    'selfies',
                    `event_${empresa.evento_id}/${cpfLimpo}_${Date.now()}.jpg`,
                    buffer,
                    'image/jpeg'
                );
                if (uploadResult.success) {
                    finalFotoUrl = uploadResult.url;
                }
            }

            const cleanPessoa = { ...pessoa };
            delete cleanPessoa.foto_base64; // Remove huge payload part
            if (finalFotoUrl) cleanPessoa.foto_url = finalFotoUrl;

            // --- 🛡️ Upload de Documentos Base64 Integrado ---
            let documentosSalvos = [];
            if (cleanPessoa.documentos && Array.isArray(cleanPessoa.documentos) && cleanPessoa.documentos.length > 0) {
                 const cpfLimpo = cleanPessoa.cpf.replace(/[^\d]/g, '');
                 for (const doc of cleanPessoa.documentos) {
                     if (doc.base64 && doc.name) {
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
                                 tipo_documento: 'OUTROS',
                                 status_auditoria: 'pendente'
                             });
                         }
                     }
                 }
            }
            delete cleanPessoa.documentos;

            // 5. Gerar QR Code (Safety check)
            const cpfLimpo2 = cleanPessoa.cpf.replace(/[^\d]/g, '');
            const qrData = await qrGenerator.generate(cpfLimpo2);
            cleanPessoa.qr_code = qrData.code;

            // Salva pessoa como pendente
            const { data: insertedPessoa, error: insertError } = await supabase
                .from('pessoas')
                .insert({
                    ...cleanPessoa,
                    empresa_id: empresa.id,
                    evento_id: empresa.evento_id,
                    status: 'PENDENTE',
                    status_acesso: 'pendente',
                    origem: 'portal_empresa',
                    origem_cadastro: 'externo',
                    created_at: new Date().toISOString()
                })
                .select('id')
                .single();

            if (insertError) {
                logger.error('Erro DB cadastro:', insertError);
                return res.status(500).json({ error: 'Erro ao salvar cadastro. CPFs não podem ser duplicados.' });
            }

            // Salvar Documentos na Tabela associativa
            if (documentosSalvos.length > 0 && insertedPessoa) {
                const docsToInsert = documentosSalvos.map(doc => ({
                    ...doc,
                    pessoa_id: insertedPessoa.id,
                    evento_id: empresa.evento_id
                }));
                await supabase.from('pessoa_documentos').insert(docsToInsert);
            }

            res.json({
                success: true,
                message: 'Cadastro enviado! Aguarde aprovação da equipe.'
            });

        } catch (error) {
            logger.error('Erro fatal em submitCadastro:', error);
            res.status(500).json({ error: 'Erro fatal interno no cadastro.' });
        }
    }
}

module.exports = new PublicController();
