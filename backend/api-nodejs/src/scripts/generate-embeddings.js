// ⏰ CRÍTICO: Definir timezone ANTES de qualquer outro código
process.env.TZ = 'America/Sao_Paulo';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { supabase } = require('../config/supabase');
const axios = require('axios');
const logger = require('../services/logger');

const AI_API_URL = process.env.AI_API_URL || 'http://localhost:8000';

async function processEmbeddings() {
    logger.info('🤖 [AI-SYNC] Iniciando Batch Job de Geração de Embeddings Faciais...');

    try {
        // 1. Buscar pessoas que têm foto mas não têm o embedding
        const { data: pessoas, error } = await supabase
            .from('pessoas')
            .select('id, nome_completo, foto_url')
            .not('foto_url', 'is', null)
            .is('face_encoding', null);

        if (error) throw error;

        if (!pessoas || pessoas.length === 0) {
            logger.info('✅ [AI-SYNC] O Banco de dados já está 100% vetorizado. Nenhuma pessoa pendente.');
            return;
        }

        logger.info(`🔍 [AI-SYNC] Encontradas ${pessoas.length} pessoas sem embedding. Iniciando processamento...`);

        let successCount = 0;
        let failCount = 0;

        for (const pessoa of pessoas) {
            const nomePessoa = pessoa.nome_completo || pessoa.id;
            try {
                logger.info(`📸 Baixando foto de ${nomePessoa}...`);
                
                let imageUrl = pessoa.foto_url;
                if (!imageUrl.startsWith('http')) {
                    const { data: publicUrlData } = supabase.storage.from('selfies').getPublicUrl(imageUrl);
                    imageUrl = publicUrlData.publicUrl;
                }

                const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                const base64Image = Buffer.from(imageResponse.data, 'binary').toString('base64');

                // 2. Chamar o Worker de IA
                const aiResponse = await axios.post(`${AI_API_URL}/api/extract`, {
                    image_base64: base64Image,
                    skip_liveness: true
                });

                if (aiResponse.data.success && aiResponse.data.embedding) {
                    // 3. Salvar no Supabase (JSON array de 512 floats esperado pelo motor FAISS)
                    const { error: updateError } = await supabase
                        .from('pessoas')
                        .update({ face_encoding: aiResponse.data.embedding })
                        .eq('id', pessoa.id);

                    if (updateError) throw updateError;
                    
                    logger.info(`✅ [AI-SYNC] Sucesso: VETOR-512 salvo para ${nomePessoa}`);
                    successCount++;
                } else {
                    logger.warn(`⚠️ [AI-SYNC] Falha ao extrair face de ${nomePessoa}: ${aiResponse.data.message || 'Sem face'}`);
                    failCount++;
                }
            } catch (err) {
                logger.error(`❌ [AI-SYNC] Erro no processamento de ${nomePessoa}: ${err.message}`);
                failCount++;
            }
        }

        if (successCount > 0) {
            await axios.post(`${AI_API_URL}/api/reload-faces`).catch(() => {});
            logger.info('🔄 [AI-SYNC] Cache de biometrias do Motor de IA recarregado!');
        }

        logger.info(`🎉 [AI-SYNC] FINALIZADO! Sucessos: ${successCount} | Falhas: ${failCount}`);
    } catch (globalErr) {
        logger.error(`🧨 [AI-SYNC] Erro fatal no Job: ${globalErr.message}`);
        process.exitCode = 1;
    }
}

processEmbeddings();
