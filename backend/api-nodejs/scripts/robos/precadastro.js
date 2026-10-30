#!/usr/bin/env node
/**
 * Robô Pré-cadastro: o caminho de quem recebe o link da empresa, até passar no leitor.
 *   link abre → empresa aparece → envia cadastro com foto e documento → chega pendente
 *   → aprovação gera o vínculo e o QR → o leitor libera → reenvio, link errado e sem LGPD não quebram
 *
 * Uso: node scripts/robos/precadastro.js [--manter]
 * Precisa de ROBO_PORTAL_URL (padrão https://cadastro.nzt.app.br) além das variáveis dos outros robôs.
 */
const { cfg, exigir, chamar, login, gerarCpf, criarPlacar } = require('./comum');

const PORTAL = (process.env.ROBO_PORTAL_URL || 'https://cadastro.nzt.app.br').replace(/\/$/, '');
const manter = process.argv.includes('--manter');
// JPEG 1x1 e PDF mínimo: o servidor só guarda, não valida o conteúdo
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const PDF = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');

(async () => {
    exigir('email', 'senha', 'eventoId', 'empresaId', 'tokenAcesso');
    const p = criarPlacar('Robô Pré-cadastro (link da empresa)');
    const token = await login();

    const emp = await chamar('GET', `/api/empresas/${cfg.empresaId}`, { token });
    const regToken = emp.json?.data?.registration_token || emp.json?.registration_token;
    if (!p.ok(regToken, 'empresa tem link de pré-cadastro', emp)) return p.fim();

    const pagina = await chamar('GET', `/register/${regToken}`, { base: PORTAL, headers: { 'Content-Type': 'text/html', 'x-evento-id': '' } });
    p.ok(pagina.status === 200, `página do link abre (${PORTAL}/register/…)`, pagina);

    const empPub = await chamar('GET', `/api/public/company/${regToken}`, { headers: { 'x-evento-id': '' } });
    p.ok(empPub.status === 200 && JSON.stringify(empPub.json).includes('Empresa Robô'), 'portal mostra a empresa certa', empPub);

    const semLgpd = await chamar('POST', `/api/public/register/${regToken}`, { corpo: { nome: 'X', cpf: gerarCpf() }, headers: { 'x-evento-id': '' } });
    p.ok(semLgpd.status === 400, 'sem aceite LGPD → recusa com mensagem', semLgpd);

    const ruim = await chamar('POST', '/api/public/register/00000000-0000-4000-8000-000000000000', { corpo: { nome: 'X', cpf: gerarCpf(), aceite_lgpd: true }, headers: { 'x-evento-id': '' } });
    p.ok(ruim.status === 404, 'link inválido → 404 "link inválido ou expirado"', ruim);

    const cpf = gerarCpf();
    const nome = `ROBO PRECAD ${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const ficha = {
        nome, cpf, email: `${cpf}@robo.teste`, nome_mae: 'MAE DO ROBO', data_nascimento: '1990-05-10',
        funcao: 'Montador', dias_trabalho: [], aceite_lgpd: true, foto_base64: JPEG,
        documentos: [{ name: 'aso.pdf', base64: PDF, tipo: 'ASO' }]
    };
    const env = await chamar('POST', `/api/public/register/${regToken}`, { corpo: ficha, headers: { 'x-evento-id': '' } });
    p.ok(env.status === 200 || env.status === 201, 'envia cadastro com foto e documento', env);

    const busca = await chamar('GET', `/api/pessoas?busca=${encodeURIComponent(nome)}&limit=5`, { token });
    const lista = busca.json?.data?.data || busca.json?.data || [];
    const pessoa = (Array.isArray(lista) ? lista : []).find(x => (x.nome_completo || x.nome) === nome);
    if (!p.ok(pessoa, 'cadastro aparece no painel', busca)) return p.fim();
    console.log(`      (cpf ${cpf}, id ${pessoa.id})`);
    p.ok(pessoa.foto_url, 'foto chegou', busca);
    p.ok(['pendente', 'aguardando'].includes(pessoa.status_acesso) || pessoa.status_pivot === 'pendente', `chega pendente de aprovação (status ${pessoa.status_acesso}, vínculo ${pessoa.status_pivot})`);

    const antes = await chamar('POST', `/api/intelbras/online?token=${cfg.tokenAcesso}`, { base: cfg.leitor, corpo: { id: 1, Events: [{ Code: 'AccessControl', Data: { UserID: cpf, ErrorCode: 0 } }] }, headers: { 'x-evento-id': '' } });
    p.ok(antes.json?.auth === 'false', 'leitor nega antes da aprovação', antes);

    const apr = await chamar('POST', `/api/pessoas/${pessoa.id}/approve`, { token, corpo: {} });
    p.ok(apr.status === 200, 'aprova pelo painel', apr);

    const depois = await chamar('GET', `/api/pessoas?busca=${encodeURIComponent(nome)}&limit=5`, { token });
    const pd = (depois.json?.data?.data || depois.json?.data || []).find?.(x => x.id === pessoa.id);
    p.ok(pd?.status_pivot === 'aprovado', `vínculo com a empresa fica aprovado (${pd?.status_pivot})`, depois);
    p.ok(pd?.qr_code, 'QR code gerado na aprovação', depois);

    const passa = await chamar('POST', `/api/intelbras/online?token=${cfg.tokenAcesso}`, { base: cfg.leitor, corpo: { id: 2, Events: [{ Code: 'AccessControl', Data: { UserID: cpf, ErrorCode: 0 } }] }, headers: { 'x-evento-id': '' } });
    p.ok(passa.json?.auth === 'true', `leitor libera depois de aprovado ("${passa.json?.message}")`, passa);

    const dup = await chamar('POST', `/api/public/register/${regToken}`, { corpo: ficha, headers: { 'x-evento-id': '' } });
    p.ok(dup.status < 500, `reenviar o mesmo CPF não quebra (${dup.status}: ${(dup.json?.error || dup.json?.message || '').slice(0, 80)})`, dup);

    if (!manter) {
        const d = await chamar('DELETE', `/api/pessoas/${pessoa.id}`, { token });
        p.ok(d.status === 200, 'apaga o cadastro de teste', d);
    }
    p.fim();
})();
