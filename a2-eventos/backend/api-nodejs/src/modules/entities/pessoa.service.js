const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const qrGenerator = require('../../utils/qrGenerator');
const syncService = require('../devices/sync.service');
const { v4: uuidv4 } = require('uuid');
const emailService = require('../../services/emailService');


class PessoaService {

    /**
     * Sanitiza dados PII para consistência e segurança.
     * - Nomes: MAIÚSCULAS, sem espaços duplos, trimmed
     * - Emails: minúsculas, trimmed
     * - CPF: somente dígitos
     */
    sanitizePII(data) {
        const sanitized = { ...data };

        // Normalizar nomes para MAIÚSCULAS (crachás, dashboards)
        if (sanitized.nome_completo) {
            sanitized.nome_completo = sanitized.nome_completo.trim().replace(/\s+/g, ' ').toUpperCase();
        } else if (sanitized.nome) {
            // Fallback para quando o frontend envia 'nome'
            sanitized.nome_completo = sanitized.nome.trim().replace(/\s+/g, ' ').toUpperCase();
        }
        if (sanitized.nome_credencial) {
            sanitized.nome_credencial = sanitized.nome_credencial.trim().replace(/\s+/g, ' ').toUpperCase();
        }

        // Email sempre em lowercase
        if (sanitized.email) {
            sanitized.email = sanitized.email.trim().toLowerCase();
        }

        // CPF: somente dígitos
        if (sanitized.cpf) {
            sanitized.cpf = sanitized.cpf.replace(/[^\d]/g, '');
        }

        // Função/Cargo: capitalizada
        if (sanitized.funcao) {
            sanitized.funcao = sanitized.funcao.trim().replace(/\s+/g, ' ').toUpperCase();
        }

        return sanitized;
    }

    /**
     * Lista pessoas de um evento específico usando View Otimizada e Paginação.
     */
    async listByEvent(supabaseClient, eventoId, filters = {}) {
        const { page = 1, limit = 50, busca, empresa_id, since } = filters;
        const offset = (page - 1) * limit;

        // Usamos a View para trazer tudo em um único JOIN (O(1) no db)
        let query = supabaseClient
            .from('view_pessoas_listagem')
            .select('*', { count: 'exact' })
            .eq('evento_id', eventoId)
            .order('nome', { ascending: true });

        // Se houver paginação e busca, aplicamos range. 
        // OBS: Para Sync Mobile (delta), geralmente pullamos tudo que mudou, 
        // mas limitamos pra evitar estouro de memória no app.
        if (!since) {
            query = query.range(offset, offset + limit - 1);
        }

        // Filtros Adicionais
        if (filters.status) {
            query = query.eq('status_acesso', filters.status.toLowerCase());
        }
        if (busca) {
            query = query.or(`nome.ilike.%${busca}%,cpf.ilike.%${busca}%,email.ilike.%${busca}%`);
        }
        if (empresa_id) {
            query = query.eq('empresa_id', empresa_id);
        }
        if (since) {
             query = query.or(`updated_at.gte.${since},pivot_updated_at.gte.${since}`);
        }

        let { data, count, error } = await query;
        
        // --- FALLBACK ESTRATÉGICO: Se a View falhar, tentamos a tabela base ---
        if (error) {
            logger.error(`[PessoaService.listByEvent] View falhou (provável schema drift), tentando fallback para tabela 'pessoas':`, error);
            
            let fallbackQuery = supabaseClient
                .from('pessoas')
                .select('id, nome_completo, cpf, email, status_acesso, created_at, empresa_id', { count: 'exact' })
                .eq('evento_id', eventoId)
                .order('nome_completo', { ascending: true });

            if (!since) {
                fallbackQuery = fallbackQuery.range(offset, offset + limit - 1);
            }
            if (filters.status) {
                fallbackQuery = fallbackQuery.eq('status_acesso', filters.status.toLowerCase());
            }
            if (busca) {
                fallbackQuery = fallbackQuery.or(`nome_completo.ilike.%${busca}%,cpf.ilike.%${busca}%,email.ilike.%${busca}%`);
            }

            const fb = await fallbackQuery;
            if (fb.error) {
                logger.error(`[PessoaService.listByEvent] Fallback também falhou:`, fb.error);
                throw fb.error;
            }
            
            data = fb.data?.map(p => ({ ...p, nome: p.nome_completo })) || [];
            count = fb.count;
            error = null;
        }

        return {
            data: data || [],
            total: count || 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil((count || 0) / limit)
        };
    }

    /**
     * Busca pessoas com filtros por nome, CPF ou empresa
     */
    async searchPessoas(supabaseClient, eventoId, queryText, empresaId, statusParam = null) {
        // Passo 1: Buscar vínculos pivot aplicando filtro de empresa_id diretamente na pivot se houver
        let pivotQuery = supabaseClient.from('pessoa_evento_empresa').select('*').eq('evento_id', eventoId);
        if (empresaId) pivotQuery = pivotQuery.eq('empresa_id', empresaId);

        const { data: pivots, error: pError } = await pivotQuery;
        if (pError) throw pError;
        if (!pivots || pivots.length === 0) return [];

        // Passo 2: Buscar pessoas com filtro de texto (ou todas do pivot se sem filtro)
        const pIds = [...new Set(pivots.map(p => p.pessoa_id))];
        let pesQuery = supabaseClient.from('pessoas')
            .select('id, nome_completo, nome_credencial, cpf, funcao, status_acesso, foto_url, qr_code, ativo, created_at')
            .in('id', pIds);

        if (queryText) {
            pesQuery = pesQuery.or(`nome_completo.ilike.%${queryText}%,cpf.ilike.%${queryText}%,funcao.ilike.%${queryText}%`);
        }

        if (statusParam) {
            pesQuery = pesQuery.eq('status_acesso', statusParam.toLowerCase());
        }

        const { data: pessoas, error: pesErr } = await pesQuery.limit(100);
        if (pesErr) throw pesErr;

        // Passo 3: Unificar com empresas
        const eIds = [...new Set(pivots.map(p => p.empresa_id))];
        const { data: empData } = await supabaseClient.from('empresas').select('id, nome').in('id', eIds);
        const empMap = (empData || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
        const pesMap = (pessoas || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {});

        return pivots.map(p => {
            const pessoa = pesMap[p.pessoa_id];
            if (!pessoa) return null;
            return {
                ...pessoa,
                nome: pessoa.nome_completo, // Compatibilidade com frontend
                status: pessoa.status_acesso,
                empresas: empMap[p.empresa_id] || { nome: 'Sem Empresa' },
                vinculo_id: p.id,
                status_pivot: p.status_aprovacao
            };
        }).filter(p => p !== null);
    }

    /**
     * Cria uma nova pessoa, gera QR Code, valida limites da empresa e insere pivot
     */
    async createPessoa(supabaseClient, pessoaData, originUser = null) {
        // --- SANITIZAÇÃO PII (Hardening) ---
        const sanitized = this.sanitizePII(pessoaData);
        
        // 🛡️ Descartamos explicitamente 'empresa_direta_id' (campo órfão do frontend sem coluna no DB)
        // para evitar o erro de schema cache (PGRST204) na hora do spread.
        const { 
            empresa_id, 
            cpf, 
            nome_credencial, 
            nome_completo, 
            parecer_documentos,
            empresa_direta_id, 
            ...otherData 
        } = sanitized;

        // 🛡️ WHITELIST: filtrar campos extras vindos do frontend
        const ALLOWED_INSERT = new Set([
            'email', 'funcao', 'tipo_pessoa', 'nome_mae', 'data_nascimento',
            'telefone', 'documento', 'dias_trabalho', 'dias_acesso', 'foto_url', 'face_encoding',
            'numero_pulseira', 'tipo_fluxo', 'fase_montagem', 'fase_showday',
            'fase_desmontagem', 'observacao', 'nome_credencial', 'passaporte',
            'trabalho_area_tecnica', 'trabalho_altura', 'pagamento_validado',
            'aceite_lgpd', 'parecer_documentos'
        ]);
        const safeOtherData = Object.fromEntries(
            Object.entries(otherData).filter(([key]) => ALLOWED_INSERT.has(key))
        );

        if (!nome_completo || !empresa_id) {
            throw new Error('Nome Completo e Empresa são obrigatórios.');
        }

        const cpfLimpo = cpf || null;

        // 1. Verificar limite da empresa e evento
        const { data: empresa, error: empError } = await supabaseClient
            .from('empresas')
            .select('max_colaboradores, evento_id')
            .eq('id', empresa_id)
            .single();

        if (empError) throw empError;

        const { count, error: countError } = await supabaseClient
            .from('pessoa_evento_empresa')
            .select('*', { count: 'exact', head: true })
            .eq('empresa_id', empresa_id)
            .eq('evento_id', empresa.evento_id);

        if (countError) throw countError;

        if (empresa.max_colaboradores > 0 && (count || 0) >= empresa.max_colaboradores) {
            throw new Error(`Limite de participantes atingido para esta empresa (${empresa.max_colaboradores}).`);
        }

        // 1.1 Validar Cotas Diárias (Se houver dias_trabalho no payload)
        const diasTrabalho = otherData.dias_trabalho || [];
        if (diasTrabalho.length > 0) {
            // Buscar todas as quotas da empresa para este evento
            const { data: quotasAtivas } = await supabaseClient
                .from('quotas_diarias')
                .select('*')
                .eq('empresa_id', empresa_id)
                .eq('evento_id', empresa.evento_id);

            if (quotasAtivas && quotasAtivas.length > 0) {
                for (const dia of diasTrabalho) {
                    const quotaDia = quotasAtivas.find(q => q.data === dia);
                    if (quotaDia && quotaDia.quota > 0) {
                        // Contar pessoas já cadastradas para este dia específico
                        // Usamos a sintaxe de filtro JSON do Supabase/Postgres
                        const { count: countDia, error: countDiaErr } = await supabaseClient
                            .from('pessoas')
                            .select('*', { count: 'exact', head: true })
                            .eq('empresa_id', empresa_id)
                            .eq('evento_id', empresa.evento_id)
                            .contains('dias_trabalho', [dia]);

                        if (countDiaErr) throw countDiaErr;

                        if ((countDia || 0) >= quotaDia.quota) {
                            throw new Error(`Cota diária excedida para o dia ${dia}. Limite: ${quotaDia.quota}. Já cadastrados: ${countDia}`);
                        }
                    }
                }
            }
        }

        // 2. QR Code NÃO é gerado aqui - apenas após aprovação
        // O QR Code será gerado no endpoint POST /:id/approve
        let qrCode = null;

        // 3. Determinar Status Inicial e Geração de Token de Convite
        const origenCadastroStr = originUser ? 'interno' : 'externo';
        let statusAcesso = 'pendente'; 
        let registrationToken = null;
        let registrationTokenExpiresAt = null;

        if (origenCadastroStr === 'interno') {
            if (parecer_documentos === 'completo') {
                statusAcesso = 'autorizado';
            } else if (parecer_documentos === 'incorreto') {
                statusAcesso = 'recusado';
            }

            // Se for Cadastro via Empresa, geramos o token de convite para complementação
            if (originUser && originUser.nivel_acesso === 'empresa' && sanitized.email) {
                registrationToken = uuidv4();
                registrationTokenExpiresAt = new Date();
                registrationTokenExpiresAt.setDate(registrationTokenExpiresAt.getDate() + 7); // 7 dias
                statusAcesso = 'pendente'; // Força pendente para convites
            }
        }

        // 4. Inserção na Tabela Pessoas (sem QR Code - será gerado após aprovação)
        const { data: newPessoa, error: insertError } = await supabaseClient
            .from('pessoas')
            .insert([{
                ...safeOtherData,
                nome_completo: nome_completo,
                nome_credencial: nome_credencial || nome_completo,
                cpf: cpfLimpo,
                empresa_id,
                evento_id: empresa.evento_id,
                qr_code: qrCode,  // null inicialmente - gerado após aprovação
                status_acesso: statusAcesso,
                origem_cadastro: origenCadastroStr,
                registration_token: registrationToken,
                registration_token_expires_at: registrationTokenExpiresAt,
                created_by: originUser?.id
            }])
            .select()
            .single();

        if (insertError) throw insertError;

        // 5. Inserção na Pivot Table N:N
        const { error: pivotErr } = await supabaseClient.from('pessoa_evento_empresa').insert([{
            pessoa_id: newPessoa.id,
            empresa_id: empresa_id,
            evento_id: empresa.evento_id,
            status_aprovacao: originUser ? 'aprovado' : 'pendente',
            cargo_funcao: otherData.funcao || 'Participante'
        }]);

        if (pivotErr) {
            logger.error('Erro ao salvar vinculo Pivot de pessoa', pivotErr);
        }

        // 6. Disparar E-mail de Convite se houver token
        if (registrationToken && sanitized.email) {
            const { data: empresaData } = await supabaseClient
                .from('empresas')
                .select('nome')
                .eq('id', empresa_id)
                .single();
            
            const portalUrl = process.env.PUBLIC_PORTAL_URL || 'http://localhost:3000';
            const inviteLink = `${portalUrl}/register/${registrationToken}`;
            
            emailService.sendEmployeeInvite(
                sanitized.email,
                nome_completo,
                empresaData?.nome || 'Sua Empresa',
                inviteLink
            ).catch(err => logger.error('Falha ao enviar e-mail de convite na criação:', err));
        }

        return {
            pessoa: newPessoa,
            message: 'Pessoa criada. Aguarde aprovação para gerar QR Code.'
        };
    }

    /**
     * Alterna o estado de bloqueio de uma pessoa e sincroniza com terminais
     */
    async toggleBlock(supabaseClient, id, isBlocking, motivo, operatorId, tenantId) {
        if (isBlocking && !motivo) {
            throw new Error('Justificativa de bloqueio é obrigatória.');
        }

        const updateData = {
            bloqueado: !!isBlocking,
            motivo_bloqueio: motivo || null,
            status_acesso: isBlocking ? 'bloqueado' : 'verificacao',
            updated_at: new Date()
        };

        const { data, error } = await supabaseClient
            .from('pessoas')
            .update(updateData)
            .eq('id', id)
            .eq('evento_id', tenantId)
            .select()
            .single();

        if (error) throw error;

        logger.info(`🚫 Pessoa [${id}] ${isBlocking ? 'BLOQUEADA' : 'DESBLOQUEADA'} por ${operatorId}. Motivo: ${motivo}`);

        // Sincronização Assíncrona com Hardware
        if (isBlocking) {
            syncService.deleteUserFromAllDevices(id, data.evento_id)
                .catch(e => logger.error(`[AutoDelete] Erro no Bloqueio via Service:`, e));
        } else if (data.foto_url) {
            syncService.syncUserToAllDevices(data)
                .catch(e => logger.error(`[AutoDelete] Erro Re-sync via Service:`, e));
        }

        return data;
    }

    async getById(supabaseClient, id, tenantId) {
        const { data: pessoa, error } = await supabaseClient
            .from('pessoas')
            .select('*')
            .eq('id', id)
            .eq('evento_id', tenantId)
            .single();

        if (error || !pessoa) throw new Error('Pessoa não encontrada ou acesso negado.');

        // Buscar empresa separadamente
        const { data: empresa } = await supabaseClient
            .from('empresas')
            .select('nome')
            .eq('id', pessoa.empresa_id)
            .single();

        return { ...pessoa, empresas: empresa || { nome: 'Sem Empresa' } };
    }

    async update(supabaseClient, id, updateData, tenantId) {
        // --- SANITIZAÇÃO PII ---
        const sanitizedData = this.sanitizePII(updateData);

        // 🛡️ WHITELIST: Apenas colunas que existem na tabela pessoas.
        // O frontend envia o objeto completo da view (com joins como empresa_nome,
        // empresas, etc). Filtramos aqui para evitar erro PGRST204.
        const ALLOWED_COLUMNS = new Set([
            'nome_completo', 'cpf', 'email', 'funcao', 'tipo_pessoa',
            'nome_mae', 'data_nascimento', 'telefone', 'documento',
            'dias_trabalho', 'dias_acesso', 'foto_url', 'face_encoding', 'qr_code',
            'numero_pulseira', 'tipo_fluxo', 'fase_montagem',
            'fase_showday', 'fase_desmontagem', 'bloqueado',
            'motivo_bloqueio', 'observacao', 'ativo', 'nome_credencial',
            'passaporte', 'trabalho_area_tecnica', 'trabalho_altura',
            'pagamento_validado', 'aceite_lgpd', 'parecer_documentos'
            // Campos imunes a update rápido (gerenciados pelo sistema):
            // id, evento_id, empresa_id, status_acesso, origem_cadastro,
            // created_by, created_at, updated_at, atualizado_em
        ]);

        const safeData = Object.fromEntries(
            Object.entries(sanitizedData).filter(([key]) => ALLOWED_COLUMNS.has(key))
        );

        if (Object.keys(safeData).length === 0) {
            throw new Error('Nenhum campo válido para atualizar.');
        }

        const { data, error } = await supabaseClient
            .from('pessoas')
            .update({ ...safeData, atualizado_em: new Date() })
            .eq('id', id)
            .eq('evento_id', tenantId)
            .select()
            .single();

        if (error) throw error;

        // Sincronizar com hardwares caso dados biométricos tenham mudado
        if (safeData.foto_url || safeData.cpf || safeData.nome_completo) {
            syncService.syncUserToAllDevices(data)
                .catch(e => logger.error(`[AutoSync] Erro Re-sync via Service após update:`, e));
        }

        return data;
    }

    async delete(supabaseClient, id, tenantId) {
        const { deleteImage } = require('../../config/supabase');

        // 1. Buscar dados necessários para cleanup ANTES de deletar
        const { data: pessoa, error: getErr } = await supabaseClient
            .from('pessoas')
            .select('evento_id, foto_url, face_encoding')
            .eq('id', id)
            .eq('evento_id', tenantId)
            .single();
        if (getErr) throw new Error('Pessoa não encontrada ou você não tem permissão para removê-la.');

        // 1.1 Limpeza de Documentos (PDF/Arquivos) no Storage
        try {
            const { data: docs } = await supabaseClient
                .from('pessoa_documentos')
                .select('url_arquivo')
                .eq('pessoa_id', id);

            if (docs && docs.length > 0) {
                for (const doc of docs) {
                    if (doc.url_arquivo) {
                        const urlParts = doc.url_arquivo.split('/storage/v1/object/public/');
                        if (urlParts.length === 2) {
                            const fullPath = urlParts[1];
                            const bucket = fullPath.split('/')[0];
                            const path = fullPath.substring(bucket.length + 1);
                            await deleteImage(bucket, path);
                        }
                    }
                }
                // Limpar registros do DB
                await supabaseClient.from('pessoa_documentos').delete().eq('pessoa_id', id);
                logger.info(`🗑️ Documents associated with person ${id} removed from Storage and DB`);
            }
        } catch (docErr) {
            logger.error(`[LGPD] Error cleaning documents for person ${id}:`, docErr);
        }

        // 2. LGPD: Apagar foto biométrica do Supabase Storage
        if (pessoa.foto_url) {
            try {
                // Extrair o path relativo do Storage a partir da URL pública
                const urlParts = pessoa.foto_url.split('/storage/v1/object/public/');
                if (urlParts.length === 2) {
                    const fullPath = urlParts[1]; // ex: "selfies/event_xxx/cpf_123.jpg"
                    const bucket = fullPath.split('/')[0];
                    const path = fullPath.substring(bucket.length + 1);
                    await deleteImage(bucket, path);
                    logger.info(`🗑️ [LGPD] Foto biométrica removida do Storage para pessoa ${id}`);
                }
            } catch (storageErr) {
                logger.error(`[LGPD] Falha ao remover foto do Storage para ${id}:`, storageErr);
                // Continua a deleção mesmo se o Storage falhar
            }
        }

        // 3. Deletar pivot N:N primeiro (integridade referencial)
        await supabaseClient.from('pessoa_evento_empresa').delete().eq('pessoa_id', id);

        // 4. Deletar registro principal
        const { error } = await supabaseClient.from('pessoas').delete().eq('id', id);
        if (error) throw error;

        // 5. Cleanup nos terminais de hardware (Intelbras/Hikvision)
        syncService.deleteUserFromAllDevices(id, pessoa.evento_id)
            .catch(e => logger.error(`[DeleteService] Falha ao remover do terminal:`, e));

        logger.info(`🗑️ [LGPD] Pessoa ${id} completamente removida (DB + Storage + Terminais)`);
        return true;
    }

    /**
     * Recupera ou Gera um QR Code para o participante APROVADO
     * QR Code só é gerado para pessoas com status_aprovacao = 'aprovado'
     */
    async generateQRCode(supabaseClient, id, tenantId) {
        // Buscar pessoa com status da pivot
        const { data: pessoa, error } = await supabaseClient
            .from('pessoas')
            .select('id, cpf, qr_code, evento_id, status_acesso')
            .eq('id', id)
            .eq('evento_id', tenantId)
            .single();

        if (error || !pessoa) throw new Error('Pessoa não encontrada ou acesso negado.');

        // Verificar aprovação via pivot table
        const { data: pivot, error: pivotError } = await supabaseClient
            .from('pessoa_evento_empresa')
            .select('status_aprovacao')
            .eq('pessoa_id', id)
            .eq('evento_id', tenantId)
            .in('status_aprovacao', ['aprovado', 'pendente'])
            .limit(1)
            .single();

        if (pivotError || !pivot) {
            throw new Error('Pessoa não vinculada a este evento.');
        }

        // QR Code só para aprovados
        if (pivot.status_aprovacao !== 'aprovado') {
            throw new Error('Pessoa pendente de aprovação. Aguarde a confirmação.');
        }

        // Se já tem um código, retorna. Se não tem, gera novo.
        const qrSource = pessoa.qr_code || pessoa.cpf || pessoa.id;
        const qrData = await qrGenerator.generate(qrSource);

        // Se a pessoa não tinha qr_code, salva o novo código gerado
        if (!pessoa.qr_code) {
            await supabaseClient.from('pessoas').update({ qr_code: qrData.code }).eq('id', id);
        }

        return qrData;
    }
}

module.exports = new PessoaService();
