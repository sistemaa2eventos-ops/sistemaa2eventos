const { getConnection } = require('../config/database');

async function fixTableNames() {
    let connection;
    try {
        connection = await getConnection();

        console.log('📋 Verificando tabelas no SQL Server...');

        // Verificar se 'funcionarios' existe e 'pessoas' não
        const result = await connection.request().query(`
            SELECT name FROM sys.tables WHERE name IN ('pessoas', 'funcionarios')
        `);

        const tables = result.recordset.map(r => r.name);
        console.log('Tabelas encontradas:', tables);

        if (tables.includes('funcionarios') && !tables.includes('pessoas')) {
            console.log('🔄 Renomeando tabela "funcionarios" para "pessoas"...');
            await connection.request().query(`
                EXEC sp_rename 'funcionarios', 'pessoas';
            `);
            console.log('✅ Tabela renomeada com sucesso!');
        } else if (tables.includes('pessoas')) {
            console.log('✅ Tabela "pessoas" já existe.');
        } else {
            console.log('❌ Nenhuma das tabelas foi encontrada.');
        }

        // Também garantir colunas necessárias
        console.log('🛡️ Garantindo colunas de sincronização...');
        await connection.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name = 'sincronizado_supabase' AND object_id = OBJECT_ID('pessoas'))
            BEGIN
                ALTER TABLE pessoas ADD sincronizado_supabase BIT DEFAULT 0;
                PRINT '✅ Coluna sincronizado_supabase adicionada';
            END
        `);

    } catch (error) {
        console.error('❌ Erro ao ajustar tabelas:', error.message);
    } finally {
        process.exit();
    }
}

fixTableNames();
