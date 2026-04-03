const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const qrGenerator = require('../../utils/qrGenerator');
const syncService = require('../devices/sync.service');
const { v4: uuidv4 } = require('uuid');

class PessoaController {
    async list(req, res) {
        try {
            // Apenas pessoas do evento do usuário logado
            const eventoId = req.event.id;
            const supabaseClient = req.supabase || supabase;

            // Atualização de Arquitetura (M:N) - Ler a partir da Pivot N:N (pessoa_evento_empresa)
            const { data: pivots, error } = await supabaseClient
                .from('pessoa_evento_empresa')
                .select('*, pessoas(*), empresas(nome)')
                .eq('evento_id', eventoId);

            if (error) throw error;

            // Achatamento do Payload para manter compatibilidade reversa com o frontend (Web-Admin)
            const data = pivots.map(p => ({
                ...p.pessoas,
                empresas: p.empresas,
                vinculo_id: p.id,
                status_pivot: p.status_aprovacao
            }));

            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async search(req, res) {
        try {
            const { q, empresa_id } = req.query;
            const evId = req.event.id;
            const supabaseClient = req.supabase || supabase;

            let query = supabaseClient.from('pessoa_evento_empresa')
                .select('*, pessoas!inner(*), empresas(nome)')
                .eq('evento_id', evId);

            if (q) {
                query = query.or(`nome.ilike.%${q}%,cpf.ilike.%${q}%`, { foreignTable: 'pessoas' });
            }

            if (empresa_id) {
                query = query.eq('empresa_id', empresa_id);
            }

            const { data: pivots, error } = await query.limit(50);
            if (error) throw error;

            const data = pivots.map(p => ({
                ...p.pessoas,
                status: p.pessoas?.status_acesso, // Compatibilidade com Checkin.jsx
                empresas: p.empresas,
                vinculo_id: p.id,
                status_pivot: p.status_aprovacao
            }));

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro na busca de pessoas:', error);
            res.status(500).json({ error: 'Erro interno ao realizar busca' });
        }
    }

    async generateUploadUrl(req, res) {
        try {
            const eventoId = req.event.id;
            const cpfBody = req.body.cpf;
            const supabaseClient = req.supabase || supabase;

            if (!cpfBody) return res.status(400).json({ error: 'CPF é obrigatório para upload de foto.' });

            const cpfLimpo = cpfBody.replace(/[^\d]/g, '');
            const filePath = `event_${eventoId}/${cpfLimpo}_${Date.now()}.jpg`;

            const { data, error } = await supabaseClient.storage
                .from('selfies')
                .createSignedUploadUrl(filePath);

            if (error) throw error;

            const publicUrlData = supabaseClient.storage.from('selfies').getPublicUrl(filePath);

            res.json({
                success: true,
                uploadUrl: data.signedUrl,
                path: filePath,
                publicUrl: publicUrlData.data.publicUrl
            });
        } catch (error) {
            logger.error('Erro ao gerar URL pre-assinada (Admin):', error);
            res.status(500).json({ error: 'Erro ao gerar upload URL' });
        }
    }

    async create(req, res) {
        try {
            const supabaseClient = req.supabase || supabase;
            const {
                nome,
                cpf,
                nome_mae,
                data_nascimento,
                funcao,
                empresa_id,
                dias_trabalho,
                foto_url,
                tipo_fluxo,
                numero_pulseira,
                fase_montagem,
                fase_showday,
                fase_desmontagem,
                observacao
            } = req.body;

            // Validação de campos obrigatórios (MÍNIMA)
            if (!nome || !empresa_id) {
                return res.status(400).json({
                    error: 'Nome e Empresa são obrigatórios para iniciar o cadastro.'
                });
            }

            const cpfLimpo = cpf ? cpf.replace(/[^\d]/g, '') : null;

            // 1. Verificar limite da empresa e evento
            const { data: empresa, error: empError } = await supabaseClient
                .from('empresas')
                .select('max_colaboradores, evento_id')
                .eq('id', empresa_id)
                .single();

            if (empError) throw empError;

            // Contagem real de pessoas ativas da empresa
            const { count, error: countError } = await supabaseClient
                .from('pessoas')
                .select('*', { count: 'exact', head: true })
                .eq('empresa_id', empresa_id)
                .eq('ativo', true);

            if (countError) throw countError;

            if (empresa.max_colaboradores > 0 && (count || 0) >= empresa.max_colaboradores) {
                return res.status(403).json({
                    error: `Limite de participantes atingido para esta empresa (${empresa.max_colaboradores}).`
                });
            }

            // Geração de QR Code (apenas se tiver CPF, ou gera um random se não tiver?)
            // O sistema usa CPF para QR Code. Se não tiver CPF, gera um UUID.
            const qrSource = cpfLimpo || uuidv4();
            const qrData = await qrGenerator.generate(qrSource);

            // LÓGICA DE STATUS GUIADA POR REGRAS
            // Se falta FOTO ou CPF, fica pendente.
            const origenCadastro = req.user ? 'interno' : 'externo';

            // Determinar o status inicial
            let statusAcesso = 'pendente'; // Padrão se for empresa (externo)

            if (origenCadastro === 'interno') {
                const parecer = req.body.parecer_documentos;
                if (parecer === 'completo') {
                    statusAcesso = 'autorizado';
                } else if (parecer === 'incorreto') {
                    statusAcesso = 'recusado';
                } else {
                    statusAcesso = 'pendente';
                }
            }

            const { data, error } = await supabaseClient
                .from('pessoas')
                .insert([{
                    nome,
                    cpf: cpfLimpo,
                    funcao: funcao || 'Participante',
                    empresa_id,
                    tipo_pessoa: req.body.tipo_pessoa || 'colaborador',
                    evento_id: empresa.evento_id,
                    nome_mae: nome_mae || '',
                    data_nascimento: data_nascimento || null,
                    dias_trabalho: dias_trabalho || [],
                    foto_url: foto_url || '',
                    tipo_fluxo: tipo_fluxo || 'checkin_checkout',
                    qr_code: qrData.code,
                    numero_pulseira: numero_pulseira || '',
                    status_acesso: statusAcesso,
                    origem_cadastro: origenCadastro,
                    fase_montagem: !!fase_montagem,
                    fase_showday: !!fase_showday,
                    fase_desmontagem: !!fase_desmontagem,
                    observacao: observacao || '',
                    created_by: req.user?.id
                }])
                .select();

            if (error) throw error;

            // ----------------------------------------------------
            // DB ARCHITECTURE UPDATE: N:N Pivot Insert
            // ----------------------------------------------------
            const { error: pivotErr } = await supabaseClient.from('pessoa_evento_empresa').insert([{
                pessoa_id: data[0].id,
                empresa_id: empresa_id,
                evento_id: empresa.evento_id,
                status_aprovacao: 'aprovado', // Internally created, already approved
                cargo_funcao: funcao || 'Participante'
            }]);

            if (pivotErr) {
                logger.error('Erro ao salvar vinculo Pivot de pessoa', pivotErr);
            }

            res.status(201).json({
                success: true,
                data: data[0],
                qr_code: qrData.image
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async toggleBlock(req, res) {
        try {
            const { id } = req.params;
            const { bloqueado, motivo_bloqueio } = req.body;
            const supabaseClient = req.supabase || supabase;

            if (bloqueado && !motivo_bloqueio) {
                return res.status(400).json({ error: 'Justificativa de bloqueio é obrigatória.' });
            }

            const updateData = {
                bloqueado: !!bloqueado,
                motivo_bloqueio: motivo_bloqueio || null,
                status_acesso: bloqueado ? 'bloqueado' : 'verificacao', // Retorna para verificação ao desbloquear? Ou talvez para o estado anterior?
                // Vamos manter simples: se desbloquear, volta para verificação para ser reavaliado ou autorizado.
                updated_at: new Date()
            };

            const { data, error } = await supabaseClient
                .from('pessoas')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            logger.info(`🚫 Pessoa [${id}] ${bloqueado ? 'BLOQUEADA' : 'DESBLOQUEADA'} por ${req.user.id}. Motivo: ${motivo_bloqueio}`);

            // --- AUTO DELETE DO TERMINAL ---
            if (bloqueado) {
                // Se foi bloqueado, apaga do terminal imediatamente
                syncService.deleteUserFromAllDevices(id, data.evento_id)
                    .then(res => logger.info(`[AutoDelete] Resultado Bloqueio: ${JSON.stringify(res)}`))
                    .catch(e => logger.error(`[AutoDelete] Erro no Bloqueio:`, e));
            } else if (data.foto_url) {
                // Se foi desbloqueado, e tem foto base64, re-sincroniza.
                // Como não temos a Base64 completa no toggleBlock, ele será pego da URL se puder no syncUserToAllDevices
                // Porém o ideal seria mandar o Base64. De qualquer forma, emitimos o sync:
                syncService.syncUserToAllDevices(data)
                    .then(res => logger.info(`[AutoDelete] Re-sync Desbloqueio: ${JSON.stringify(res)}`))
                    .catch(e => logger.error(`[AutoDelete] Erro Re-sync:`, e));
            }

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao alternar bloqueio:', error);
            res.status(500).json({ error: 'Erro ao processar bloqueio.' });
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const { data, error } = await supabaseClient
                .from('pessoas')
                .select('*, empresas(nome)')
                .eq('id', id)
                .single();
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            const supabaseClient = req.supabase || supabase;
            const { data, error } = await supabaseClient
                .from('pessoas')
                .update(updates)
                .eq('id', id)
                .select();
            if (error) throw error;

            // --- AUTO SYNC (User Request Task 900) ---
            // Se foi uma atualização de FOTO ou NOME ou STATUS, ressincronizar
            if (data[0] && (updates.foto_url || updates.nome || updates.status_acesso)) {
                // Se o status for "autorizado" ou "checkin_feito" (ativo no sistema)
                const isAtivo = ['autorizado', 'checkin_feito', 'checkout_feito'].includes(data[0].status_acesso);
                if (isAtivo) {
                    let fotoParaSync = updates.foto_url;

                    if (!fotoParaSync || !fotoParaSync.startsWith('data:image')) {
                        // Se não temos a foto em base64 neste request, tentamos resincronizar apenas o status.
                        // O AutoSync em syncUserToAllDevices agora sabe baixar a foto da URL.
                        const pessoaSync = { ...data[0], foto_base64_internal: fotoParaSync };
                        syncService.syncUserToAllDevices(pessoaSync)
                            .then(res => logger.info(`[AutoSync] Resultado Update: ${JSON.stringify(res)}`))
                            .catch(e => logger.error(`[AutoSync] Erro Update:`, e));
                    } else {
                        const pessoaSync = { ...data[0], foto_base64_internal: fotoParaSync };
                        syncService.syncUserToAllDevices(pessoaSync)
                            .then(res => logger.info(`[AutoSync] Resultado Update: ${JSON.stringify(res)}`))
                            .catch(e => logger.error(`[AutoSync] Erro Update:`, e));
                    }
                } else {
                    // Status inativo/bloqueado: Apaga explicitamente das catracas pra porta não abrir.
                    logger.warn(`[AutoDelete] Status de ${data[0].nome} mudou para ${data[0].status_acesso}. Apagando do terminal.`);
                    syncService.deleteUserFromAllDevices(data[0].id, data[0].evento_id)
                        .then(res => logger.info(`[AutoDelete] Resultado Update: ${JSON.stringify(res)}`))
                        .catch(e => logger.error(`[AutoDelete] Erro Update:`, e));
                }
            }

            res.json({ success: true, data: data[0] });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const { error } = await supabaseClient
                .from('pessoas')
                .delete()
                .eq('id', id);
            if (error) throw error;
            res.json({ success: true, message: 'Pessoa deletada com sucesso' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async generateQRCode(req, res) {
        try {
            const { id } = req.params;
            const supabaseClient = req.supabase || supabase;
            const { data: pessoa, error } = await supabaseClient
                .from('pessoas')
                .select('cpf, nome')
                .eq('id', id)
                .single();
            if (error) throw error;

            const qrData = await qrGenerator.generate(pessoa.cpf);
            res.json({
                success: true,
                qr_code: qrData.image,
                code: qrData.code,
                pessoa: pessoa.nome
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new PessoaController();
