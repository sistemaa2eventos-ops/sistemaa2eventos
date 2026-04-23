const { supabase } = require('./src/config/supabase');

async function seedRBAC() {
    console.log('--- 🛡️ SEMEANDO PERFIS E PERMISSÕES NO SUPABASE ---');

    const roles = [
        { nome: 'master', descricao: 'Soberania absoluta do sistema A2/NZT', is_system_role: true },
        { nome: 'admin', descricao: 'Dono de Agência/Cliente com todos eventos', is_system_role: true },
        { nome: 'supervisor', descricao: 'Líder operacional de evento', is_system_role: true },
        { nome: 'tecnico', descricao: 'Responsável técnico por dispositivos', is_system_role: true },
        { nome: 'analista', descricao: 'Analista de dados e relatórios', is_system_role: true },
        { nome: 'operador', descricao: 'Operador de terminal e recepção', is_system_role: true },
        { nome: 'monitor', descricao: 'Monitoramento passivo de acessos', is_system_role: true },
        { nome: 'portaria', descricao: 'Controle básico de entrada/saída', is_system_role: true },
        { nome: 'estacionamento', descricao: 'Controle de veículos e cancelas', is_system_role: true },
        { nome: 'cliente_tecnico', descricao: 'Responsável técnico do cliente final', is_system_role: true }
    ];

    for (const role of roles) {
        const { error } = await supabase.from('sys_roles').upsert(role, { onConflict: 'nome' });
        if (error) console.error(`❌ Erro Role ${role.nome}:`, error.message);
        else console.log(`✅ Role ${role.nome} OK`);
    }

    const perms = [
        { recurso: 'monitor', acao: 'visualizar', nome_humanizado: 'Ver Monitor', descricao: 'Telas tempo real' },
        { recurso: 'pessoas', acao: 'gerenciar', nome_humanizado: 'Gestão Pessoas', descricao: 'Cadastros' },
        { recurso: 'eventos', acao: 'configurar', nome_humanizado: 'Config Evento', descricao: 'Alterar dados' },
        { recurso: 'empresas', acao: 'gerenciar', nome_humanizado: 'Gestão Empresas', descricao: 'Parceiros' },
        { recurso: 'relatorios', acao: 'gerar', nome_humanizado: 'Ver Relatórios', descricao: 'Exports' },
        { recurso: 'financeiro', acao: 'visualizar', nome_humanizado: 'Ver Financeiro', descricao: 'Métricas' },
        { recurso: 'dispositivos', acao: 'operar', nome_humanizado: 'Operar Hardware', descricao: 'Catracas' },
        { recurso: 'configuracoes', acao: 'ajustar', nome_humanizado: 'Ajustar Sistema', descricao: 'Configs' }
    ];

    for (const perm of perms) {
        const { error } = await supabase.from('sys_permissions').upsert(perm, { onConflict: 'recurso,acao' });
        if (error) console.error(`❌ Erro Perm ${perm.recurso}:`, error.message);
        else console.log(`✅ Perm ${perm.recurso} OK`);
    }

    console.log('--- ✅ SEMENTE PLANTADA COM SUCESSO ---');
}

seedRBAC();
