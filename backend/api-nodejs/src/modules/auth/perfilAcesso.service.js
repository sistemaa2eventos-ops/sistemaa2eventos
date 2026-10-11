const { supabase } = require('../../config/supabase');

/**
 * Perfis de Acesso: modelo de permissões por papel (hoje só existe o operador).
 *
 * - Um usuário novo nasce com as permissões do modelo do seu papel.
 * - A tela Usuários continua ajustando cada pessoa individualmente.
 * - "Aplicar a todos" sobrescreve os módulos de quem já tem aquele papel.
 *
 * Guardado em system_settings.config.perfis_acesso (sem tabela nova).
 */

// Mesmas chaves da tela Usuários (frontend/web-admin/src/hooks/useUsuarios.js → MODULOS)
const MODULOS = [
    'dashboard', 'checkin', 'checkout', 'fiscalizacao', 'monitoramento', 'pessoas',
    'empresas', 'relatorios', 'veiculos', 'auditoria_documentos', 'dispositivos'
];

// O banco só aceita admin_master e operador (perfis_nivel_acesso_check); admin_master vê tudo
const PERFIS = ['operador'];

// Sem modelo salvo: o mesmo padrão que o sistema já usava (só o Dashboard)
const MODELO_PADRAO = Object.fromEntries(MODULOS.map(m => [m, m === 'dashboard']));

function normalizarModulos(modulos = {}) {
    const out = {};
    for (const m of MODULOS) out[m] = modulos[m] === true;
    out.dashboard = true; // Dashboard é sempre liberado
    return out;
}

async function lerConfig() {
    const { data, error } = await supabase.from('system_settings').select('config').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data?.config || {};
}

async function listar() {
    const config = await lerConfig();
    const salvos = config.perfis_acesso || {};
    return PERFIS.map(perfil => ({
        nivel_acesso: perfil,
        modulos: normalizarModulos(salvos[perfil]?.modulos || MODELO_PADRAO),
        personalizado: !!salvos[perfil],
        atualizado_em: salvos[perfil]?.atualizado_em || null,
        atualizado_por: salvos[perfil]?.atualizado_por || null
    }));
}

async function obter(perfil) {
    return (await listar()).find(p => p.nivel_acesso === perfil) || null;
}

/** Módulos do modelo do papel (para criar usuário novo) */
async function modulosDoPerfil(perfil) {
    try {
        const item = await obter(perfil);
        return item ? item.modulos : { ...MODELO_PADRAO };
    } catch {
        return { ...MODELO_PADRAO };
    }
}

async function salvar(perfil, modulos, usuario) {
    if (!PERFIS.includes(perfil)) {
        const err = new Error(`Perfil inválido. Válidos: ${PERFIS.join(', ')}`);
        err.status = 400;
        throw err;
    }
    const config = await lerConfig();
    const perfisAcesso = { ...(config.perfis_acesso || {}) };
    perfisAcesso[perfil] = {
        modulos: normalizarModulos(modulos),
        atualizado_em: new Date().toISOString(),
        atualizado_por: usuario?.email || usuario?.id || null
    };
    const { error } = await supabase
        .from('system_settings')
        .update({ config: { ...config, perfis_acesso: perfisAcesso } })
        .eq('id', 1);
    if (error) throw error;
    return obter(perfil);
}

/**
 * Aplica o modelo a todos os usuários do papel. Só mexe nos módulos:
 * vínculo com eventos e permissões por evento de cada pessoa são preservados.
 */
async function aplicarATodos(perfil) {
    const modelo = await obter(perfil);
    if (!modelo) {
        const err = new Error('Perfil inválido.');
        err.status = 400;
        throw err;
    }
    const { data: usuarios, error } = await supabase
        .from('perfis')
        .select('id, permissions')
        .eq('nivel_acesso', perfil);
    if (error) throw error;

    let atualizados = 0;
    for (const u of usuarios || []) {
        const permissions = { ...(u.permissions || {}), ...modelo.modulos, dashboard: true };
        const { error: upErr } = await supabase
            .from('perfis')
            .update({ permissions, updated_at: new Date().toISOString() })
            .eq('id', u.id);
        if (!upErr) atualizados++;
    }
    return { atualizados, total: (usuarios || []).length };
}

module.exports = { MODULOS, PERFIS, listar, obter, salvar, aplicarATodos, modulosDoPerfil };
