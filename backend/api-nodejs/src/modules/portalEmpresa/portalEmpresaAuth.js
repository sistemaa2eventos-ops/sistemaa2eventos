'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { supabase } = require('../../config/supabase');
const { gerarHashSenha, verificarSenha } = require('../producao/producaoPortalAuth');

/**
 * Autenticação do portal da empresa (empresa.nzt.app.br).
 * Login: e-mail do responsável + chave de acesso gerada no painel. O token tem escopo próprio e é
 * assinado com um segredo derivado só para este portal: o painel NZT nunca aceita esse token.
 */

const ESCOPO = 'portal_empresa';
const VALIDADE_TOKEN = '12h';
// Sem letras/números que se confundem (O/0, I/1/L)
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Segredo próprio do portal. Não há fallback para JWT_SECRET nem para o segredo do Supabase: um vazamento
 * do portal não expõe o painel, e o contrário também não.
 */
function segredoBase() {
    const base = process.env.PORTAL_EMPRESA_SEGREDO;
    if (!base || base.length < 32) {
        throw new Error('PORTAL_EMPRESA_SEGREDO ausente ou curto no .env (mínimo 32 caracteres) — o portal da empresa fica indisponível.');
    }
    return base;
}

/** Chave derivada para um uso (assinatura do token ou cifra da chave de acesso). */
const derivar = (uso) => crypto.createHash('sha256').update(`nzt:portal_empresa:${uso}:${segredoBase()}`).digest();

/** Chave de acesso legível: XXXX-XXXX-XXXX (31^12 ≈ 59 bits de entropia, sorteio uniforme). */
function gerarChave() {
    const letras = Array.from({ length: 12 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');
    return `${letras.slice(0, 4)}-${letras.slice(4, 8)}-${letras.slice(8, 12)}`;
}

/** Normaliza o que a pessoa digitou ("abcd efgh-ijkl" → "ABCD-EFGH-IJKL"). */
function normalizarChave(chave) {
    const s = String(chave || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : s;
}

/** Cifra a chave para o painel poder mostrar/enviar depois (AES-256-GCM). */
function cifrarChave(chave) {
    const iv = crypto.randomBytes(12);
    const cifra = crypto.createCipheriv('aes-256-gcm', derivar('cifra'), iv);
    const conteudo = Buffer.concat([cifra.update(chave, 'utf8'), cifra.final()]);
    return `v1:${iv.toString('base64')}:${cifra.getAuthTag().toString('base64')}:${conteudo.toString('base64')}`;
}

function decifrarChave(texto) {
    const partes = String(texto || '').split(':');
    if (partes.length !== 4 || partes[0] !== 'v1') return null;
    try {
        const decifra = crypto.createDecipheriv('aes-256-gcm', derivar('cifra'), Buffer.from(partes[1], 'base64'));
        decifra.setAuthTag(Buffer.from(partes[2], 'base64'));
        return Buffer.concat([decifra.update(Buffer.from(partes[3], 'base64')), decifra.final()]).toString('utf8');
    } catch {
        return null;
    }
}

/** Registro para gravar em empresas ao gerar uma chave nova. */
function novaChave() {
    const chave = gerarChave();
    return {
        chave,
        colunas: {
            portal_chave_hash: gerarHashSenha(chave),
            portal_chave_cifrada: cifrarChave(chave),
            portal_chave_gerada_em: new Date().toISOString()
        }
    };
}

const conferirChave = (chave, hash) => verificarSenha(normalizarChave(chave), hash);

/** Token do portal. `versao` = quando a chave foi gerada: chave nova derruba as sessões antigas. */
function assinarToken(empresa) {
    return jwt.sign(
        { escopo: ESCOPO, empresa_id: empresa.id, evento_id: empresa.evento_id, versao: empresa.portal_chave_gerada_em },
        derivar('jwt'),
        { expiresIn: VALIDADE_TOKEN, subject: String(empresa.id) }
    );
}

function verificarToken(token) {
    try {
        const d = jwt.verify(token, derivar('jwt'));
        return d?.escopo === ESCOPO && d.empresa_id && d.evento_id ? d : null;
    } catch {
        return null;
    }
}

/**
 * Middleware: toda rota do portal só enxerga a empresa do token.
 * Confere no banco se a empresa continua ativa e se a chave não foi trocada.
 */
async function autenticarEmpresa(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const dados = verificarToken(token);
    if (!dados) return res.status(401).json({ error: 'Sessão expirada. Entre de novo com o e-mail e a chave de acesso.' });

    try {
        const { data: empresa, error } = await supabase.from('empresas')
            .select('id, evento_id, nome, ativo, portal_chave_gerada_em')
            .eq('id', dados.empresa_id).maybeSingle();
        if (error) throw error;
        const chaveTrocada = !empresa?.portal_chave_gerada_em
            || new Date(empresa.portal_chave_gerada_em).getTime() !== new Date(dados.versao).getTime();
        if (!empresa || empresa.evento_id !== dados.evento_id || chaveTrocada) {
            return res.status(401).json({ error: 'Acesso encerrado. Peça a chave de acesso atual à organização do evento.' });
        }
        if (empresa.ativo === false) {
            return res.status(403).json({ error: 'Empresa desativada neste evento. Fale com a organização.' });
        }
        req.empresaPortal = { id: empresa.id, evento_id: empresa.evento_id, nome: empresa.nome };
        return next();
    } catch (err) {
        return next(err);
    }
}

module.exports = {
    ESCOPO,
    gerarChave,
    normalizarChave,
    cifrarChave,
    decifrarChave,
    novaChave,
    conferirChave,
    assinarToken,
    verificarToken,
    autenticarEmpresa
};
