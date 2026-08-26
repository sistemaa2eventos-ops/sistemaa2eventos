// ⏰ CRÍTICO: Definir timezone ANTES de qualquer outro código
process.env.TZ = 'America/Sao_Paulo';
require('dotenv').config();

const { supabase } = require('../config/supabase');
const axios = require('axios');
const logger = require('../services/logger');

const AI_API_URL = process.env.AI_API_URL || 'http://localhost:8000';

async function processEmbeddings() {
    logger.info('🤖 [AI-SYNC] Iniciando Batch Job de Geração de Embeddings Faciais...');

    try {
        // 1. Buscar pessoas que têm foto mas não têm o embedding
        // Ajuste o nome da coluna de foto conforme o seu banco (ex: foto_url, avatar_url, etc)
        const { data: pessoas, error } = await supabase
            .from('pessoas')
            .select('id, nome, foto_url')
            .not('foto_url', 'is', null)
            .is('face_encoding', null);

        if (error) throw error;

        if (!pessoas || pessoas.length === 0) {
            logger.info('✅ [AI-SYNC] O Banco de dados já está 100% vetorizado. Nenhuma pessoa pendente.');
            process.exit(0);
        }

        logger.info(`🔍 [AI-SYNC] Encontradas ${pessoas.length} pessoas sem embedding. Iniciando processamento...`);

        let successCount = 0;
        let failCount = 0;

        for (const pessoa of pessoas) {
            try {
                logger.info(`📸 Baixando foto de ${pessoa.nome || pessoa.id}...`);
                
                // Se foto_url for apenas o caminho do bucket, você precisa gerar a URL pública
                // Se já for HTTP, faça o download direto. Vamos assumir que é HTTP/HTTPS.
                let imageUrl = pessoa.foto_url;
                if (!imageUrl.startsWith('http')) {
                    const { data: publicUrlData } = supabase.storage.from('fotos').getPublicUrl(imageUrl);
                    imageUrl = publicUrlData.publicUrl;
                }

                const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                const base64Image = Buffer.from(imageResponse.data, 'binary').toString('base64');

                // 2. Chamar o Worker de IA
                const aiResponse = await axios.post(`${AI_API_URL}/api/extract`, {
                    image_base64: base64Image
                });

                if (aiResponse.data.success && aiResponse.data.embedding) {
                    // 3. Salvar no Supabase (pgvector)
                    // No pgvector, inserimos o array diretamente e ele cuida do cast
                    const { error: updateError } = await supabase
                        .from('pessoas')
                        .update({ face_encoding: `[${aiResponse.data.embedding.join(',')}]` })
                        .eq('id', pessoa.id);

                    if (updateError) throw updateError;
                    
                    logger.info(`✅ [AI-SYNC] Sucesso: VETOR-512 salvo para ${pessoa.nome || pessoa.id}`);
                    successCount++;
                } else {
                    logger.warn(`⚠️ [AI-SYNC] Falha ao extrair face de ${pessoa.nome || pessoa.id}: ${aiResponse.data.message || 'Sem face'}`);
                    failCount++;
                }
            } catch (err) {
                logger.error(`❌ [AI-SYNC] Erro no processamento de ${pessoa.nome || pessoa.id}: ${err.message}`);
                failCount++;
            }
        }

        logger.info(`🎉 [AI-SYNC] FINALIZADO! Sucessos: ${successCount} | Falhas: ${failCount}`);
        process.exit(0);
    } catch (globalErr) {
        logger.error(`🧨 [AI-SYNC] Erro fatal no Job: ${globalErr.message}`);
        process.exit(1);
    }
}

processEmbeddings();
