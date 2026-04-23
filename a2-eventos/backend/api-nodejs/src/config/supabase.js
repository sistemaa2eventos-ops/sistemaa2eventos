const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const logger = require('../services/logger');

// Validação de ambiente - VERIFICA SE AS CHAVES EXISTEM
if (!process.env.SUPABASE_URL) {
    throw new Error('❌ SUPABASE_URL não definida no arquivo .env');
}

if (!process.env.SUPABASE_ANON_KEY) {
    throw new Error('❌ SUPABASE_ANON_KEY não definida no arquivo .env');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('❌ SUPABASE_SERVICE_ROLE_KEY não definida no arquivo .env');
}

logger.info('🔌 Configurando cliente Supabase...');
logger.info(`📌 URL: ${process.env.SUPABASE_URL}`);
logger.info('📌 Anon Key: ✅ carregada');
logger.info('📌 Service Role: ✅ carregada');

// ============================================
// CLIENTE 1: Com service_role (para backend)
// TEM ACESSO TOTAL - USAR COM CUIDADO!
// ============================================
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        },
        db: {
            schema: 'public'
        }
    }
);

// ============================================
// CLIENTE 2: Com anon key (para operações públicas)
// Respeita as políticas RLS
// ============================================
const supabasePublic = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true
        }
    }
);

// Testar conexão imediatamente
(async () => {
    try {
        logger.info('🔄 Testando conexão com Supabase...');

        const { count, error } = await supabase
            .from('eventos')
            .select('*', { count: 'exact', head: true });

        if (error) {
            logger.error({ err: error }, '❌ ERRO AO CONECTAR COM SUPABASE');

            if (error.message.includes('relation') || error.message.includes('does not exist')) {
                logger.warn('⚠️ As tabelas ainda não foram criadas no Supabase! Execute o script SQL primeiro.');
            }

            if (error.message.includes('JWT')) {
                logger.warn('⚠️ Problema com a chave de autenticação! Verifique o .env.');
            }
        } else {
            logger.info('✅ Conectado ao Supabase com sucesso!');
        }
    } catch (err) {
        logger.error({ err }, '❌ ERRO INESPERADO na conexão Supabase');
    }
})();

// ============================================
// FUNÇÕES ÚTEIS PARA O SUPABASE
// ============================================

/**
 * Upload de imagem para o Storage
 */
async function uploadImage(bucket, path, fileBuffer, contentType) {
    try {
        const { data, error } = await supabase
            .storage
            .from(bucket)
            .upload(path, fileBuffer, {
                contentType,
                upsert: true
            });

        if (error) throw error;

        // Gerar URL pública
        const { data: urlData } = supabase
            .storage
            .from(bucket)
            .getPublicUrl(path);

        return {
            success: true,
            path: data.path,
            url: urlData.publicUrl
        };
    } catch (error) {
        logger.error({ err: error }, 'Erro no upload');
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Deletar imagem do Storage
 */
async function deleteImage(bucket, path) {
    try {
        const { error } = await supabase
            .storage
            .from(bucket)
            .remove([path]);

        if (error) throw error;

        return { success: true };
    } catch (error) {
        logger.error({ err: error }, 'Erro ao deletar imagem');
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Buscar pessoas com face encoding
 */
async function getPessoasComFace(eventoId = null) {
    let query = supabase
        .from('pessoas')
        .select('id, nome, face_encoding, foto_url')
        .not('face_encoding', 'is', null);

    if (eventoId) {
        query = query.eq('evento_id', eventoId);
    }

    const { data, error } = await query;

    if (error) {
        logger.error({ err: error }, 'Erro ao buscar pessoas com face');
        return [];
    }

    return data;
}

/**
 * Registrar log de acesso
 */
async function registrarLog(logData) {
    const { data, error } = await supabase
        .from('logs_acesso')
        .insert([logData])
        .select();

    if (error) {
        logger.error({ err: error }, 'Erro ao registrar log');
        return null;
    }

    return data[0];
}

/**
 * Atualizar status da pessoa
 */
async function atualizarStatusPessoa(pessoaId, status) {
    const { data, error } = await supabase
        .from('pessoas')
        .update({
            status_acesso: status,
            updated_at: new Date()
        })
        .eq('id', pessoaId)
        .select();

    if (error) {
        logger.error({ err: error }, 'Erro ao atualizar status');
        return null;
    }

    return data[0];
}

/**
 * Buscar configurações do evento
 */
async function getEventoConfig(eventoId) {
    const { data, error } = await supabase
        .from('eventos')
        .select('config')
        .eq('id', eventoId)
        .single();

    if (error) {
        logger.error({ err: error }, 'Erro ao buscar config do evento');
        return null;
    }

    return data?.config || {};
}

/**
 * Cria um cliente Supabase exclusivo usando o token JWT do usuário, 
 * permitindo que as políticas de RLS (Row Level Security) sejam aplicadas.
 */
function createClientForUser(token) {
    if (!token) return supabasePublic;

    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            },
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        }
    );
}

// Exportar tudo
module.exports = {
    supabase,
    supabasePublic,
    uploadImage,
    deleteImage,
    getPessoasComFace,
    registrarLog,
    atualizarStatusPessoa,
    getEventoConfig,
    createClientForUser
};