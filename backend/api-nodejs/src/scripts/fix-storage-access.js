const { supabase } = require('../config/supabase');

async function fixStorageAccessibility() {
    console.log('📦 Ajustando acessibilidade do Storage...');

    // Buckets que devem ser públicos para visualização direta via URL
    const publicBuckets = ['avatars', 'selfies'];

    for (const bucketName of publicBuckets) {
        try {
            console.log(`🔄 Atualizando bucket '${bucketName}' para público...`);
            const { data, error } = await supabase.storage.updateBucket(bucketName, {
                public: true
            });

            if (error) {
                console.error(`❌ Erro ao atualizar bucket '${bucketName}':`, error.message);
            } else {
                console.log(`✅ Bucket '${bucketName}' agora é PÚBLICO.`);
            }
        } catch (err) {
            console.error(`💥 Falha ao ajustar bucket ${bucketName}:`, err.message);
        }
    }

    console.log('🚀 Ajuste de Storage finalizado.');
}

fixStorageAccessibility();
