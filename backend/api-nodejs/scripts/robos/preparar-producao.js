/**
 * Cria (ou reaproveita) o ambiente dos robôs: "Evento de Teste (robôs)", empresa, usuário
 * supervisor preso a esse evento e dois leitores fictícios (127.0.0.1, tipo robo_teste:
 * o health check e a sincronização de faces ignoram).
 * Roda DENTRO do container da API: docker exec -i -e ROBO_SENHA=... a2_eventos_api node - < preparar-producao.js
 * Com APAGAR=1, remove tudo o que foi criado (logs, pessoas, leitores, empresa, evento, usuário).
 */
const { supabase } = require('/app/src/config/supabase');
const EMAIL = 'robo.teste@nzt.app.br';
const SLUG = 'evento-teste-robos';

(async () => {
    const { data: ev0 } = await supabase.from('eventos').select('id').eq('slug', SLUG).maybeSingle();

    if (process.env.APAGAR === '1') {
        if (ev0) {
            for (const t of ['logs_acesso', 'pulseira_vinculos', 'pessoa_evento_empresa', 'pessoa_areas_acesso', 'terminal_sync_queue', 'dispositivo_sync_log', 'notificacoes', 'quotas_diarias', 'sessoes_operador']) {
                const { error } = await supabase.from(t).delete().eq('evento_id', ev0.id);
                if (error) console.log('aviso', t, error.message);
            }
            for (const t of ['pessoas', 'dispositivos_acesso', 'empresas', 'evento_areas']) {
                const { error } = await supabase.from(t).delete().eq('evento_id', ev0.id);
                if (error) console.log('aviso', t, error.message);
            }
            const { error } = await supabase.from('eventos').delete().eq('id', ev0.id);
            console.log('evento apagado', error ? error.message : 'ok');
        }
        const { data: us } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const u = us?.users?.find(x => x.email === EMAIL);
        if (u) {
            await supabase.from('perfis').delete().eq('id', u.id);
            await supabase.auth.admin.deleteUser(u.id);
            console.log('usuário apagado');
        }
        process.exit(0);
    }

    let eventoId = ev0?.id;
    if (!eventoId) {
        const { data, error } = await supabase.from('eventos').insert({
            nome: 'Evento de Teste (robôs)', slug: SLUG, status: 'ativo', capacidade_total: 5000,
            descricao: 'Criado pelos robôs de teste. Pode ser apagado com APAGAR=1.'
        }).select('id').single();
        if (error) throw error;
        eventoId = data.id;
    }

    let { data: emp } = await supabase.from('empresas').select('id').eq('evento_id', eventoId).limit(1).maybeSingle();
    if (!emp) {
        ({ data: emp } = await supabase.from('empresas').insert({ evento_id: eventoId, nome: 'Empresa Robô', ativo: true }).select('id').single());
    }

    const leitores = {};
    for (const [chave, nome, modo] of [['acesso', 'Robô - Leitor de acesso', 'ambos'], ['credenciamento', 'Robô - Leitor de credenciamento', 'credenciamento']]) {
        let { data: d } = await supabase.from('dispositivos_acesso').select('id, control_token').eq('evento_id', eventoId).eq('nome', nome).maybeSingle();
        if (!d) {
            ({ data: d } = await supabase.from('dispositivos_acesso').insert({
                evento_id: eventoId, nome, tipo: 'robo_teste', marca: 'intelbras', modelo: 'simulado',
                ip_address: '127.0.0.1', porta: 9, modo
            }).select('id, control_token').single());
        }
        leitores[chave] = d.control_token;
    }

    const { data: us } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    let user = us?.users?.find(x => x.email === EMAIL);
    if (!user) {
        const { data, error } = await supabase.auth.admin.createUser({ email: EMAIL, password: process.env.ROBO_SENHA, email_confirm: true });
        if (error) throw error;
        user = data.user;
    } else if (process.env.ROBO_SENHA) {
        await supabase.auth.admin.updateUserById(user.id, { password: process.env.ROBO_SENHA });
    }
    // O RLS do banco lê o papel e o evento do token (app_metadata), não da tabela perfis
    await supabase.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, role: 'admin_master', nivel_acesso: 'admin_master', evento_id: eventoId } });
    const todas = { checkin: true, pessoas: true, checkout: true, empresas: true, dashboard: true, relatorios: true, monitoramento: true, auditoria_documentos: true };
    const { error: pErr } = await supabase.from('perfis').upsert({
        id: user.id, email: EMAIL, nome_completo: 'Robô de Teste', nivel_acesso: 'admin_master',
        evento_id: eventoId, status: 'ativo', status_aprovacao: 'aprovado', ativo: true, permissions: todas
    });
    if (pErr) throw pErr;

    console.log(`ROBO_EMAIL=${EMAIL}`);
    console.log(`ROBO_EVENTO_ID=${eventoId}`);
    console.log(`ROBO_EMPRESA_ID=${emp.id}`);
    console.log(`ROBO_TOKEN_ACESSO=${leitores.acesso}`);
    console.log(`ROBO_TOKEN_CREDENCIAMENTO=${leitores.credenciamento}`);
    process.exit(0);
})().catch(e => { console.error('ERRO', e.message || e); process.exit(1); });
