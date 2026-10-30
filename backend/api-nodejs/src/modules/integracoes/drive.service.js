const jwt = require('jsonwebtoken');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

/**
 * Cópia dos documentos para o Google Drive de uma conta Gmail conectada no painel (OAuth).
 * Escopo drive.file: o sistema só enxerga o que ele mesmo criou (a pasta "NZT - Documentos"
 * e o que está dentro dela) — nada mais do Drive da conta, e sem verificação do Google.
 * Pastas: Evento / Empresa / "NOME - CPF" / arquivo; documentos da empresa em
 * Evento / Empresa / "Documentos da empresa".
 */
const ESCOPOS = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'];
const PASTA_RAIZ = 'NZT - Documentos';
const MIME_PASTA = 'application/vnd.google-apps.folder';

const cfg = () => ({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `${(process.env.PUBLIC_API_URL || 'https://api.nzt.app.br').replace(/\/$/, '')}/api/drive/callback`,
    painelUrl: (process.env.PAINEL_URL || 'https://painel.nzt.app.br').replace(/\/$/, '')
});

const limparNome = (t) => String(t || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Sem nome';
const cpfFormatado = (cpf) => {
    const d = String(cpf || '').replace(/\D/g, '');
    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (cpf || '');
};
const escaparQuery = (t) => String(t).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** "…/storage/v1/object/public/<bucket>/<caminho>" → { bucket, caminho } (vale para bucket privado também) */
const localNoStorage = (url) => {
    const m = String(url || '').match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/);
    return m ? { bucket: m[1], caminho: decodeURIComponent(m[2]) } : null;
};

class DriveService {
    constructor() {
        this.token = null;           // { valor, expira }
        this.pastas = new Map();     // "paiId/nome" → id
        this.fila = Promise.resolve();
        this.progresso = null;       // copiar tudo: { evento_id, total, feitos, erros, rodando, inicio }
    }

    configurado() {
        const c = cfg();
        return !!(c.clientId && c.clientSecret);
    }

    // ---------- Conexão (OAuth) ----------

    urlAutorizacao(usuarioId) {
        const c = cfg();
        const state = jwt.sign({ u: usuarioId, p: 'drive' }, process.env.JWT_SECRET, { expiresIn: '15m' });
        const q = new URLSearchParams({
            client_id: c.clientId, redirect_uri: c.redirectUri, response_type: 'code',
            scope: ESCOPOS.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    }

    /** Callback do Google: troca o código pelo refresh_token e guarda a conexão. */
    async concluirConexao(code, state) {
        const dados = jwt.verify(state, process.env.JWT_SECRET);
        if (dados?.p !== 'drive') throw new Error('Estado inválido');
        const c = cfg();
        const resp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, grant_type: 'authorization_code' })
        });
        const tok = await resp.json();
        if (!resp.ok || !tok.refresh_token) throw new Error(tok.error_description || tok.error || 'O Google não devolveu a autorização. Tente conectar de novo.');
        const email = tok.id_token ? JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString()).email : null;

        const { error } = await supabase.from('drive_conexao').upsert({
            id: 1, email: email || 'conta Google', refresh_token: tok.refresh_token, pasta_raiz_id: null,
            conectado_por: dados.u || null, conectado_em: new Date().toISOString(), ultimo_erro: null, ultimo_erro_em: null
        });
        if (error) throw error;
        this.token = { valor: tok.access_token, expira: Date.now() + (tok.expires_in - 60) * 1000 };
        this.pastas.clear();
        await this.garantirRaiz();
        logger.info(`[Drive] Conectado à conta ${email}`);
        return email;
    }

    async desconectar() {
        const { data: con } = await supabase.from('drive_conexao').select('refresh_token').eq('id', 1).maybeSingle();
        if (con?.refresh_token) {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(con.refresh_token)}`, { method: 'POST' }).catch(() => {});
        }
        await supabase.from('drive_conexao').delete().eq('id', 1);
        this.token = null;
        this.pastas.clear();
    }

    async conexao() {
        const { data, error } = await supabase.from('drive_conexao').select('*').eq('id', 1).maybeSingle();
        if (error) {
            if (/drive_conexao/.test(error.message)) return null; // migração ainda não aplicada
            throw error;
        }
        return data;
    }

    async registrarErroConexao(msg) {
        await supabase.from('drive_conexao').update({ ultimo_erro: msg, ultimo_erro_em: new Date().toISOString() }).eq('id', 1);
    }

    async accessToken() {
        if (this.token && this.token.expira > Date.now()) return this.token.valor;
        const con = await this.conexao();
        if (!con) throw new Error('Google Drive não conectado');
        const c = cfg();
        const resp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: con.refresh_token, grant_type: 'refresh_token' })
        });
        const tok = await resp.json();
        if (!resp.ok) {
            const msg = tok.error === 'invalid_grant'
                ? 'A autorização do Google expirou ou foi revogada. Clique em "Conectar Google Drive" de novo.'
                : (tok.error_description || tok.error || 'Falha ao renovar o acesso ao Google');
            await this.registrarErroConexao(msg);
            throw new Error(msg);
        }
        this.token = { valor: tok.access_token, expira: Date.now() + (tok.expires_in - 60) * 1000 };
        return this.token.valor;
    }

    async api(metodo, url, { json, corpo, headers = {} } = {}) {
        const token = await this.accessToken();
        const resp = await fetch(url, {
            method: metodo,
            headers: { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
            body: json ? JSON.stringify(json) : corpo
        });
        const texto = await resp.text();
        const dados = texto ? JSON.parse(texto) : {};
        if (!resp.ok) throw new Error(dados?.error?.message || `Google Drive respondeu ${resp.status}`);
        return dados;
    }

    // ---------- Pastas ----------

    async garantirRaiz() {
        const con = await this.conexao();
        if (!con) throw new Error('Google Drive não conectado');
        if (con.pasta_raiz_id) {
            try {
                const f = await this.api('GET', `https://www.googleapis.com/drive/v3/files/${con.pasta_raiz_id}?fields=id,trashed`);
                if (!f.trashed) return con.pasta_raiz_id;
            } catch (_) { /* apagada ou sem acesso: cria outra */ }
        }
        const nova = await this.api('POST', 'https://www.googleapis.com/drive/v3/files?fields=id', { json: { name: PASTA_RAIZ, mimeType: MIME_PASTA } });
        await supabase.from('drive_conexao').update({ pasta_raiz_id: nova.id }).eq('id', 1);
        this.pastas.clear();
        return nova.id;
    }

    async pasta(nome, paiId) {
        const chave = `${paiId}/${nome}`;
        if (this.pastas.has(chave)) return this.pastas.get(chave);
        const q = `name = '${escaparQuery(nome)}' and '${paiId}' in parents and mimeType = '${MIME_PASTA}' and trashed = false`;
        const lista = await this.api('GET', `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
        const id = lista.files?.[0]?.id
            || (await this.api('POST', 'https://www.googleapis.com/drive/v3/files?fields=id', { json: { name: nome, mimeType: MIME_PASTA, parents: [paiId] } })).id;
        this.pastas.set(chave, id);
        return id;
    }

    // ---------- Cópia ----------

    /** Dados do documento e o caminho de pastas no Drive. */
    async _montar(origem, documentoId) {
        if (origem === 'pessoa') {
            const { data: doc, error } = await supabase.from('pessoa_documentos').select('id, titulo, url_arquivo, data_validade, pessoa_id').eq('id', documentoId).maybeSingle();
            if (error || !doc) throw new Error('Documento não encontrado');
            const { data: p } = await supabase.from('pessoas').select('nome_completo, cpf, evento_id, empresas(nome), eventos(nome)').eq('id', doc.pessoa_id).maybeSingle();
            if (!p) throw new Error('Pessoa do documento não encontrada');
            return {
                doc, evento_id: p.evento_id,
                pastas: [p.eventos?.nome || 'Evento', p.empresas?.nome || 'Sem empresa', `${p.nome_completo} - ${cpfFormatado(p.cpf)}`]
            };
        }
        const { data: doc, error } = await supabase.from('empresa_documentos').select('id, titulo, url_arquivo, data_validade, empresa_id').eq('id', documentoId).maybeSingle();
        if (error || !doc) throw new Error('Documento não encontrado');
        const { data: e } = await supabase.from('empresas').select('nome, evento_id, eventos(nome)').eq('id', doc.empresa_id).maybeSingle();
        if (!e) throw new Error('Empresa do documento não encontrada');
        return { doc, evento_id: e.evento_id, pastas: [e.eventos?.nome || 'Evento', e.nome, 'Documentos da empresa'] };
    }

    async copiar(origem, documentoId) {
        const { data: ja } = await supabase.from('drive_copias').select('status, tentativas').eq('origem', origem).eq('documento_id', documentoId).maybeSingle();
        if (ja?.status === 'copiado') return { ja_copiado: true };

        let evento_id = null;
        try {
            const m = await this._montar(origem, documentoId);
            evento_id = m.evento_id;
            const local = localNoStorage(m.doc.url_arquivo);
            if (!local) throw new Error('Endereço do arquivo não reconhecido');
            const { data: blob, error: dlErr } = await supabase.storage.from(local.bucket).download(local.caminho);
            if (dlErr || !blob) throw new Error(`Arquivo não encontrado no armazenamento (${dlErr?.message || 'vazio'})`);
            const conteudo = Buffer.from(await blob.arrayBuffer());

            let pai = await this.garantirRaiz();
            for (const nome of m.pastas) pai = await this.pasta(limparNome(nome), pai);

            const ext = (local.caminho.split('.').pop() || 'pdf').toLowerCase().slice(0, 5);
            const validade = m.doc.data_validade ? ` (válido até ${m.doc.data_validade.split('-').reverse().join('-')})` : '';
            const nomeArquivo = `${limparNome(m.doc.titulo)}${validade}.${ext}`;
            const mime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';

            const limite = `nzt${Date.now()}`;
            const corpo = Buffer.concat([
                Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nomeArquivo, parents: [pai] })}\r\n--${limite}\r\nContent-Type: ${mime}\r\n\r\n`),
                conteudo,
                Buffer.from(`\r\n--${limite}--`)
            ]);
            const criado = await this.api('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
                corpo, headers: { 'Content-Type': `multipart/related; boundary=${limite}` }
            });

            await supabase.from('drive_copias').upsert({
                origem, documento_id: documentoId, evento_id, drive_file_id: criado.id, status: 'copiado',
                erro: null, tentativas: (ja?.tentativas || 0) + 1, copiado_em: new Date().toISOString()
            }, { onConflict: 'origem,documento_id' });
            return { drive_file_id: criado.id };
        } catch (err) {
            await supabase.from('drive_copias').upsert({
                origem, documento_id: documentoId, evento_id, status: 'erro',
                erro: String(err.message || err).slice(0, 500), tentativas: (ja?.tentativas || 0) + 1
            }, { onConflict: 'origem,documento_id' });
            throw err;
        }
    }

    /**
     * Copia em segundo plano assim que o documento é gravado (um por vez, para não
     * estourar a cota do Google). Sem Drive conectado não faz nada; falha nunca chega a quem enviou.
     */
    copiarEmSegundoPlano(origem, documentoIds) {
        const ids = (Array.isArray(documentoIds) ? documentoIds : [documentoIds]).filter(Boolean);
        if (!ids.length || !this.configurado()) return;
        this.fila = this.fila.then(async () => {
            if (!(await this.conexao().catch(() => null))) return;
            for (const id of ids) {
                await this.copiar(origem, id).catch(e => logger.warn(`[Drive] Documento ${origem}/${id} não copiado: ${e.message}`));
            }
        });
    }

    /** Copia todos os documentos do evento que ainda não estão no Drive (inclui os que falharam). */
    async copiarTudo(eventoId) {
        if (this.progresso?.rodando) return this.progresso;
        if (!(await this.conexao())) throw new Error('Conecte o Google Drive primeiro.');

        const [pesRes, empRes, copRes] = await Promise.all([
            supabase.from('pessoas').select('id').eq('evento_id', eventoId),
            supabase.from('empresas').select('id').eq('evento_id', eventoId),
            supabase.from('drive_copias').select('origem, documento_id').eq('status', 'copiado').eq('evento_id', eventoId)
        ]);
        const copiados = new Set((copRes.data || []).map(c => `${c.origem}:${c.documento_id}`));
        const itens = [];
        const juntar = async (tabela, coluna, ids, origem) => {
            for (let i = 0; i < ids.length; i += 200) {
                const { data } = await supabase.from(tabela).select('id').in(coluna, ids.slice(i, i + 200));
                for (const d of data || []) if (!copiados.has(`${origem}:${d.id}`)) itens.push({ origem, id: d.id });
            }
        };
        await juntar('pessoa_documentos', 'pessoa_id', (pesRes.data || []).map(p => p.id), 'pessoa');
        await juntar('empresa_documentos', 'empresa_id', (empRes.data || []).map(e => e.id), 'empresa');

        this.progresso = { evento_id: eventoId, total: itens.length, feitos: 0, erros: 0, rodando: true, inicio: new Date().toISOString() };
        (async () => {
            for (const item of itens) {
                try { await this.copiar(item.origem, item.id); } catch (_) { this.progresso.erros++; }
                this.progresso.feitos++;
            }
            this.progresso.rodando = false;
            logger.info(`[Drive] Cópia do evento ${eventoId}: ${this.progresso.feitos - this.progresso.erros} copiados, ${this.progresso.erros} com erro`);
        })();
        return this.progresso;
    }

    async status(eventoId) {
        const con = await this.conexao();
        let contagem = { copiado: 0, erro: 0 };
        let erros = [];
        if (con && eventoId) {
            const { data } = await supabase.from('drive_copias').select('status, erro, origem, documento_id').eq('evento_id', eventoId);
            for (const c of data || []) contagem[c.status] = (contagem[c.status] || 0) + 1;
            erros = (data || []).filter(c => c.status === 'erro').slice(0, 5).map(c => c.erro);
        }
        return {
            configurado: this.configurado(),
            conectado: !!con,
            email: con?.email || null,
            conectado_em: con?.conectado_em || null,
            pasta_url: con?.pasta_raiz_id ? `https://drive.google.com/drive/folders/${con.pasta_raiz_id}` : null,
            ultimo_erro: con?.ultimo_erro || null,
            copias: contagem,
            erros_recentes: erros,
            progresso: this.progresso?.evento_id === eventoId ? this.progresso : null
        };
    }
}

module.exports = new DriveService();
module.exports.localNoStorage = localNoStorage;
module.exports.limparNome = limparNome;
