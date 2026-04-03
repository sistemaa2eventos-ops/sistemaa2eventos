const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

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

console.log('🔌 Configurando cliente Supabase...');
console.log(`📌 URL: ${process.env.SUPABASE_URL}`);
console.log(`📌 Anon Key: ✅ carregada`);
console.log(`📌 Service Role: ✅ carregada`);

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
        console.log('🔄 Testando conexão com Supabase...');

        // Tenta uma consulta simples
        const { data, error } = await supabase
            .from('eventos')
            .select('count')
            .limit(1);

        if (error) {
            console.error('❌ ERRO AO CONECTAR COM SUPABASE:');
            console.error(error.message);

            if (error.message.includes('relation') || error.message.includes('does not exist')) {
                console.error('⚠️ As tabelas ainda não foram criadas no Supabase!');
                console.error('   Execute o script SQL no SQL Editor do Supabase primeiro.');
            }

            if (error.message.includes('JWT')) {
                console.error('⚠️ Problema com a chave de autenticação!');
                console.error('   Verifique se as chaves no .env estão corretas.');
            }
        } else {
            console.log('✅ Conectado ao Supabase com sucesso!');
            console.log('📊 Banco de dados respondendo normalmente.');
        }
    } catch (err) {
        console.error('❌ ERRO INESPERADO:', err.message);
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
        console.error('Erro no upload:', error);
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
        console.error('Erro ao deletar imagem:', error);
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
        console.error('Erro ao buscar pessoas com face:', error);
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
        console.error('Erro ao registrar log:', error);
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
        console.error('Erro ao atualizar status:', error);
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
        console.error('Erro ao buscar config do evento:', error);
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