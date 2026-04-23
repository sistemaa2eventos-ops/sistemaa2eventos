#!/usr/bin/env node

require('dotenv').config();
const { getConnection } = require('../config/database');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function resetDatabase() {
    console.log('\n⚠️  ========================================');
    console.log('⚠️  RESET DO BANCO DE DADOS');
    console.log('⚠️  ========================================\n');
    console.log('Esta operação irá:');
    console.log('   - Apagar TODOS os dados');
    console.log('   - Recriar as tabelas');
    console.log('   - Inserir dados iniciais');
    console.log('   - Recriar procedures e triggers\n');

    rl.question('Digite "RESET" para confirmar: ', async (answer) => {
        if (answer !== 'RESET') {
            console.log('\n❌ Operação cancelada.\n');
            rl.close();
            return;
        }

        try {
            const connection = await getConnection();

            console.log('\n🔄 Apagando dados existentes...');

            await connection.request().query('DELETE FROM sync_retry_queue');
            await connection.request().query('DELETE FROM logs_acesso');
            await connection.request().query('DELETE FROM pessoas');
            await connection.request().query('DELETE FROM empresas');
            await connection.request().query('DELETE FROM dispositivos_acesso');
            await connection.request().query('DELETE FROM eventos');

            console.log('✅ Dados apagados');

            console.log('\n🔄 Recriando dados iniciais...');

            // Criar evento
            const eventoId = '123e4567-e89b-12d3-a456-426614174000';
            await connection.request()
                .input('id', eventoId)
                .input('nome', 'Evento Teste A2')
                .input('slug', 'evento-teste-a2')
                .input('local', 'São Paulo - Expo Center')
                .input('config', '{"checkin_mode": ["qrcode", "face", "manual"], "fast_track": true}')
                .query(`
                    INSERT INTO eventos (id, nome, slug, local, data_inicio, data_fim, config)
                    VALUES (@id, @nome, @slug, @local, GETDATE(), DATEADD(day, 5, GETDATE()), @config)
                `);

            // Criar admin
            await connection.request()
                .input('id', '11111111-1111-1111-1111-111111111111')
                .input('evento_id', eventoId)
                .input('nome', 'Administrador Sistema')
                .input('nivel', 'admin')
                .query(`
                    INSERT INTO perfis (id, evento_id, nome_completo, nivel_acesso, ativo)
                    VALUES (@id, @evento_id, @nome, @nivel, 1)
                `);

            // Criar empresa
            const empresaId = await connection.request()
                .input('evento_id', eventoId)
                .input('nome', 'Tech Solutions')
                .input('cnpj', '12345678000199')
                .input('created_by', '11111111-1111-1111-1111-111111111111')
                .query(`
                    INSERT INTO empresas (id, evento_id, nome, cnpj, created_by)
                    VALUES (NEWID(), @evento_id, @nome, @cnpj, @created_by);
                    SELECT SCOPE_IDENTITY() as id;
                `);

            // Criar pessoa
            await connection.request()
                .input('evento_id', eventoId)
                .input('empresa_id', empresaId.recordset[0]?.id || null)
                .input('nome', 'João Silva')
                .input('cpf', '12345678900')
                .input('funcao', 'Técnico')
                .input('qr_code', `A2E:TESTE:${Date.now()}`)
                .input('created_by', '11111111-1111-1111-1111-111111111111')
                .query(`
                    INSERT INTO pessoas (id, evento_id, empresa_id, nome, cpf, funcao, qr_code, created_by)
                 VALUES (NEWID(), @evento_id, @empresa_id, @nome, @cpf, @funcao, @qr_code, @created_by)
                `);

            console.log('✅ Dados iniciais criados');
            console.log('\n🚀 RESET CONCLUÍDO COM SUCESSO!\n');

        } catch (error) {
            console.error('\n❌ ERRO NO RESET:', error.message);
        } finally {
            rl.close();
        }
    });
}

resetDatabase();