const axios = require('axios');
const { getPgConnection } = require('../../../config/pgEdge');
const logger = require('../../../services/logger');

class VectorService {
    constructor() {
        // Threshold para ArcFace (InsightFace). 
        // Em Cosseno ArcFace, distâncias < 0.6 são geralmente a mesma pessoa (maior confiança)
        this.SIMILARITY_THRESHOLD = 0.55;
    }

    /**
     * Orquestrador Híbrido:
     * 1. Consulta Cérebro Cego (Python ONNX Runtime) para extrair o array de 512 pontos dimensionais.
     * 2. Consulta Pâncreas C (PostgreSQL pgvector) para calcular similaridade cosseno super rápida nativa em RAM de Edge.
     */
    async identifyPersonByImage(imageBase64) {
        try {
            // Passo 1: Extração Stateless
            const pythonUrl = process.env.PYTHON_MICROSERVICE_URL || 'http://microservice-face:8000';
            const extractResponse = await axios.post(`${pythonUrl}/api/extract`, { image_base64: imageBase64 }, { timeout: 3000 });
            
            if (!extractResponse.data || !extractResponse.data.success) {
                logger.debug(`[VectorService] Nenhum rosto detectado na amostra submetida.`);
                return null;
            }

            const embedding = extractResponse.data.embedding; // float[512]
            const pgVectorStr = `[${embedding.join(',')}]`;

            // Passo 2: Busca Euclidiana N-Dimensional na Borda Edge
            const pool = await getPgConnection();

            // O operador <=> do PGVector computa Distância Cosseno. 
            // 0 = Cópia Perfeita, 2 = Completamente oposto.
            // Para exibição amigável, confiança = 1 - distância
            const result = await pool.query(`
                SELECT id, nome, status_acesso, 1 - (face_encoding <=> $1) as confidence
                FROM pessoas
                WHERE face_encoding IS NOT NULL
                ORDER BY face_encoding <=> $1 ASC
                LIMIT 1
            `, [pgVectorStr]);

            if (result.rows.length > 0) {
                const match = result.rows[0];
                
                if (match.confidence >= this.SIMILARITY_THRESHOLD) {
                    logger.success(`🎯 [HNSW] Face Vector Reconhecido: ${match.nome} (Score: ${(match.confidence*100).toFixed(1)}%)`);
                    
                    return { 
                        pessoa_id: match.id, 
                        nome: match.nome, 
                        confianca: match.confidence,
                        status_acesso: match.status_acesso
                    };
                } else {
                    logger.debug(`[VectorService] Face ignorada. Score de ${(match.confidence*100).toFixed(1)}% rejeitado por ser menor que o Threshold (55%). Acesso considerado Desconhecido.`);
                }
            }
            
            return null; // Ninguém bateu na base

        } catch (error) {
            logger.error(`❌ [VectorService] Falha generalizada no processamento vetorial: ${error.message}`);
            return null;
        }
    }
}

module.exports = new VectorService();
