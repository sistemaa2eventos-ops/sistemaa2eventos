const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function seed() {
    console.log('🚀 Iniciando Data Seeding Nexus (Modo Seguro)...');

    try {
        // 1. Criar ou Obter Evento
        let { data: evento } = await supabase
            .from('eventos')
            .select('*')
            .eq('nome', 'EXPO NEXUS 2026')
            .single();

        if (!evento) {
            const { data: newEv, error: evError } = await supabase
                .from('eventos')
                .insert({
                    nome: 'EXPO NEXUS 2026',
                    slug: 'expo-nexus-2026',
                    local: 'SÃO PAULO EXPO - PAVILHÃO NEXUS',
                    data_inicio: '2026-06-20T08:00:00',
                    data_fim: '2026-06-25T22:00:00',
                    status: 'ativo'
                })
                .select()
                .single();
            if (evError) throw evError;
            evento = newEv;
            console.log(`✅ Evento Criado: ${evento.nome}`);
        } else {
            console.log(`ℹ️ Evento já existe: ${evento.nome}`);
        }

        // 2. Criar Empresas
        const empresaNames = ['Nexus Tech Industries', 'Cyber Services Global'];
        const emps = [];

        for (const name of empresaNames) {
            let { data: emp } = await supabase
                .from('empresas')
                .select('*')
                .eq('nome', name)
                .single();

            if (!emp) {
                const { data: newEmp, error: empError } = await supabase
                    .from('empresas')
                    .insert({
                        nome: name,
                        cnpj: name === 'Nexus Tech Industries' ? '11.222.333/0001-44' : '55.666.777/0001-88',
                        evento_id: evento.id
                    })
                    .select()
                    .single();
                if (empError) throw empError;
                emp = newEmp;
                console.log(`✅ Empresa Criada: ${name}`);
            } else {
                console.log(`ℹ️ Empresa já existe: ${name}`);
            }
            emps.push(emp);
        }

        // 3. Criar Funcionários (apenas se não houver muitos)
        // 3. Criar Pessoas (apenas se não houver muitos)
        const { count } = await supabase
            .from('pessoas')
            .select('*', { count: 'exact', head: true })
            .eq('evento_id', evento.id);

        if (count < 5) {
            const pessoas = [];
            emps.forEach((emp, eIdx) => {
                for (let i = 1; i <= 3; i++) {
                    pessoas.push({
                        nome: `Operacional ${eIdx === 0 ? 'Alpha' : 'Beta'} ${i}`,
                        cpf: `000.000.00${eIdx}${i}-${eIdx}${i}`,
                        empresa_id: emp.id,
                        evento_id: evento.id,
                        qr_code: `NEXUS-TEST-${emp.id.substring(0, 4)}-${i}`,
                        status: 'ativo'
                    });
                }
            });

            const { error: fErr } = await supabase
                .from('pessoas')
                .insert(pessoas);

            if (fErr) throw fErr;
            console.log(`✅ ${pessoas.length} Pessoas Inseridas`);
        } else {
            console.log(`ℹ️ Base de pessoas já populada (${count})`);
        }

        // 4. Vincular usuários
        const { data: users } = await supabase.auth.admin.listUsers();
        const testEmails = ['admin@a2eventos.com.br', 'supervisor@a2eventos.com.br', 'operador@a2eventos.com.br'];

        for (const u of users.users) {
            if (testEmails.includes(u.email)) {
                await supabase.from('perfis').update({ evento_id: evento.id }).eq('id', u.id);
                console.log(`🔗 Usuário ${u.email} vinculado ao EXPO NEXUS`);
            }
        }

        console.log('\n✨ AMBIENTE PRONTO PARA OPERAÇÃO!');

    } catch (err) {
        console.error('❌ ERRO:', err.message);
    }
}

seed();
