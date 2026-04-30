const { supabase } = require('../config/supabase');

async function setupStorage() {
    console.log('📦 Iniciando configuração do Storage...');

    // Buckets necessários
    const buckets = [
        { name: 'avatars', public: true },
        { name: 'selfies', public: true },
        { name: 'documentos', public: false },
        { name: 'documentos_operacionais', public: false }
    ];

    for (const b of buckets) {
        try {
            const { data, error } = await supabase.storage.createBucket(b.name, {
                public: b.public,
                fileSizeLimit: 5242880, // 5MB
                allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
            });

            if (error) {
                if (error.message.includes('already exists')) {
                    console.log(`✅ Bucket '${b.name}' já existe.`);
                } else {
                    console.error(`❌ Erro ao criar bucket '${b.name}':`, error.message);
                }
            } else {
                console.log(`✨ Bucket '${b.name}' criado com sucesso!`);
            }
        } catch (err) {
            console.error(`💥 Falha crítica no bucket ${b.name}:`, err.message);
        }
    }

    console.log('🚀 Configuração de Storage finalizada.');
}

setupStorage();
