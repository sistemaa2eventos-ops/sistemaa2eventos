/**
 * SIMULAÇÃO DE AUDITORIA (B-02) - Rollback de Hardware
 * 
 * Este script simula o fluxo completo de um check-in seguido de uma falha crítica de hardware 
 * (ex: timeout de rede com a catraca) para validar se o sistema reverte corretamente 
 * o status da pessoa no banco de dados.
 */

const { supabase } = require('../src/config/supabase');
const checkinService = require('../src/modules/checkin/checkin.service');
const logger = require('../src/services/logger');

async function testRollback() {
    console.log('--- 🧪 INICIANDO TESTE DE ROLLBACK (B-02) ---');

    try {
        // 1. Setup: Pega uma pessoa de teste
        let { data: pessoas, error: err1 } = await supabase
            .from('pessoas')
            .select('*')
            .eq('status_acesso', 'checkout')
            .limit(1);

        let pessoa = pessoas && pessoas[0];

        if (!pessoa) {
             console.log('ℹ️ Nenhuma pessoa em "checkout" encontrada. Buscando qualquer pessoa...');
             const { data: qPessoas, error: err2 } = await supabase
                .from('pessoas')
                .select('*')
                .limit(1);
             
             pessoa = qPessoas && qPessoas[0];
             
             if (pessoa) {
                 console.log(`♻️ Resetando status de ${pessoa.nome} para "checkout" para iniciar o teste...`);
                 await supabase.from('pessoas').update({ status_acesso: 'checkout' }).eq('id', pessoa.id);
                 pessoa.status_acesso = 'checkout';
             } else {
                 console.log('✨ Tabela de pessoas vazia. Criando usuário temporário para teste...');
                 const { data: newPessoa, error: createErr } = await supabase
                    .from('pessoas')
                    .insert([{
                        nome: 'USUÁRIO TESTE AUDITORIA',
                        cpf: '00000000000',
                        status_acesso: 'checkout',
                        evento_id: (await supabase.from('eventos').select('id').limit(1).single()).data?.id
                    }])
                    .select()
                    .single();
                 
                 if (createErr) {
                     console.error('❌ Não foi possível criar usuário de teste:', createErr.message);
                     return;
                 }
                 pessoa = newPessoa;
             }
        }

        console.log(`👤 Participante Selecionado: ${pessoa.nome} (ID: ${pessoa.id})`);
        console.log(`📍 Status Inicial: ${pessoa.status_acesso}`);

        // 2. Simular Registro de Acesso (Fase 1: Banco de Dados OK)
        console.log('\n⏳ Passo 1: Registrando acesso no banco...');
        // Simulando o que o Controller faz
        const result = await checkinService.registrarAcesso(supabase, {
            pessoa_id: pessoa.id,
            pessoa: pessoa,
            evento_id: pessoa.evento_id,
            tipo: 'checkin',
            metodo: 'face',
            dispositivo_id: 'TEST_DRIVER_SIMULATOR',
            confianca: 99
        });

        if (result.action !== 'allow') {
            console.error('❌ Falha ao autorizar acesso inicial:', result.error);
            return;
        }

        const logId = result.details.id;
        console.log(`✅ Registro no banco realizado. Log ID: ${logId}`);

        // 3. Simular Falha de Hardware (Fase 2: Driver THROW Error)
        console.log('\n🔌 Passo 2: Simulando falha de hardware (Timeout)...');
        
        try {
            // Aqui simulamos o erro que aconteceria no intelbras.controller.js
            throw new Error('ETimedout: Connection timed out after 5000ms');
        } catch (hwError) {
            console.log(`⚠️ Erro de hardware detectado: ${hwError.message}`);
            
            // Inicia o Rollback conforme implementado nos controllers
            console.log('♻️ Iniciando ROLLBACK...');
            await checkinService.reverterAcesso(supabase, {
                pessoa_id: pessoa.id,
                log_id: logId,
                motivo: `SIMULAÇÃO DE TESTE B-02: ${hwError.message}`
            });
        }

        // 4. Verificação Final (Assertion)
        console.log('\n🔍 Passo 3: Verificando integridade dos dados após rollback...');
        
        const { data: pessoaVerificada } = await supabase
            .from('pessoas')
            .select('status_acesso')
            .eq('id', pessoa.id)
            .single();

        const { data: logVerificado } = await supabase
            .from('logs_acesso')
            .select('tipo, observacao')
            .eq('id', logId)
            .single();

        if (pessoaVerificada.status_acesso === 'checkout') {
            console.log('✅ SUCESSO: O status da pessoa foi revertido para "checkout".');
        } else {
            console.log(`❌ FALHA: O status da pessoa permanece como "${pessoaVerificada.status_acesso}".`);
        }

        if (logVerificado.tipo === 'erro_hardware') {
            console.log('✅ SUCESSO: O log de acesso foi marcado como "erro_hardware".');
        } else {
            console.log(`❌ FALHA: O log de acesso está como "${logVerificado.tipo}".`);
        }

    } catch (error) {
        console.error('💥 Erro inesperado durante o teste:', error.message);
    } finally {
        console.log('\n--- 🏁 FIM DO TESTE ---');
    }
}

testRollback();
