import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import api from './api';

const ehFalhaConexao = (error) => {
    if (!error?.response || error.code === 'ECONNABORTED' || error.message === 'Network Error') return true;
    return [0, 502, 503, 504].includes(error.response.status);
};

/**
 * Comprime imagens capturadas em campo via Canvas API antes de enviar ou salvar offline.
 */
export async function comprimirImagemCliente(arquivo, maxLargura = 1280, qualidade = 0.78) {
    if (!arquivo) return null;
    if (typeof arquivo === 'string') return arquivo;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));
        reader.onload = (ev) => {
            const img = new Image();
            img.onerror = () => resolve(ev.target.result);
            img.onload = () => {
                const escala = img.width > maxLargura ? maxLargura / img.width : 1;
                const largura = Math.round(img.width * escala);
                const altura = Math.round(img.height * escala);
                const canvas = document.createElement('canvas');
                canvas.width = largura;
                canvas.height = altura;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, largura, altura);
                resolve(canvas.toDataURL('image/jpeg', qualidade));
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(arquivo);
    });
}

class ProducaoSyncService {
    async salvarCacheResumo(eventoId, resumo) {
        if (!eventoId || !resumo) return;
        try {
            await db.producaoCache.put({
                evento_id: eventoId,
                resumo,
                atualizado_em: new Date().toISOString()
            });
        } catch {
            // Ignora falha de quota em modo privado
        }
    }

    async lerCacheResumo(eventoId) {
        if (!eventoId) return null;
        try {
            const reg = await db.producaoCache.get(eventoId);
            return reg?.resumo || null;
        } catch {
            return null;
        }
    }

    async contarPendentes(eventoId) {
        try {
            if (eventoId) {
                return await db.producaoFilaOffline.where('evento_id').equals(eventoId).count();
            }
            return await db.producaoFilaOffline.count();
        } catch {
            return 0;
        }
    }

    async enfileirar(eventoId, acao, payload) {
        const syncId = payload?.sync_id || uuidv4();
        await db.producaoFilaOffline.add({
            sync_id: syncId,
            evento_id: eventoId,
            acao,
            payload: { ...payload, sync_id: syncId },
            criado_em: new Date().toISOString(),
            status: 'pendente'
        });
        window.dispatchEvent(new CustomEvent('producao-offline-alterada'));
        return { status: 'offline', sync_id: syncId };
    }

    async enviarComSuporteOffline(eventoId, endpoint, acao, payload, headers = {}, httpClient = api) {
        const syncId = payload?.sync_id || uuidv4();
        const body = { ...payload, sync_id: syncId };

        if (!navigator.onLine) {
            return this.enfileirar(eventoId, acao, body);
        }

        try {
            const client = httpClient || api;
            const res = await client.post(endpoint, body, {
                headers,
                timeout: 7000,
                hideDefaultError: true
            });
            return {
                status: 'sincronizado',
                data: res.data?.data || res.data
            };
        } catch (error) {
            if (ehFalhaConexao(error)) {
                return this.enfileirar(eventoId, acao, body);
            }
            throw error;
        }
    }

    async definirAcessoProdutor(eventoId, produtorId, payload, headers = {}, httpClient = api) {
        const client = httpClient || api;
        const res = await client.post(
            `/producao/produtores/${produtorId}/definir-acesso`,
            { ...payload, evento_id: eventoId },
            { headers }
        );
        return res.data?.data || res.data;
    }

    async sincronizarFila(eventoId, headers = {}, httpClient = api) {
        if (!navigator.onLine || !eventoId) return { sincronizados: 0 };
        const itens = await db.producaoFilaOffline.where('evento_id').equals(eventoId).toArray();
        if (!itens.length) return { sincronizados: 0 };

        const client = httpClient || api;
        const res = await client.post('/producao/sync-offline', { itens }, { headers, timeout: 15000 });
        const resultados = res.data?.data?.resultados || [];
        const idsOk = new Set(resultados.filter((r) => r.ok).map((r) => r.sync_id));

        for (const item of itens) {
            if (idsOk.has(item.sync_id)) {
                await db.producaoFilaOffline.delete(item.id);
            }
        }
        window.dispatchEvent(new CustomEvent('producao-offline-alterada'));
        return { sincronizados: idsOk.size };
    }
}

const producaoSyncService = new ProducaoSyncService();
export default producaoSyncService;
