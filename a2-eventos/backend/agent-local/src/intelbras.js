'use strict';

/**
 * Cliente HTTP para comunicação direta com dispositivos Intelbras
 * Versão simplificada para o agente local
 */
class IntelbrasLocal {
    constructor({ ip, port = 80, user = 'admin', password = 'admin123' }) {
        this.ip = ip;
        this.port = port;
        this.user = user;
        this.password = password;
        this.baseUrl = `http://${ip}:${port}`;
    }

    async getDigestClient() {
        const DigestFetchLib = await import('digest-fetch');
        const DigestFetch = DigestFetchLib.default || DigestFetchLib;
        return new DigestFetch(this.user, this.password);
    }

    async _get(path, params = {}, timeoutMs = 8000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const qs = new URLSearchParams(params).toString();
            const url = `${this.baseUrl}${path}${qs ? '?' + qs : ''}`;
            const client = await this.getDigestClient();
            const res = await client.fetch(url, { method: 'GET', signal: controller.signal });
            const text = await res.text();
            if (!res.ok) throw new Error(`GET ${path} falhou: ${res.status} - ${text}`);
            return text;
        } catch (err) {
            if (err.name === 'AbortError') throw new Error(`Timeout GET ${path}`);
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    async _postJson(path, params = {}, data, timeoutMs = 10000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const qs = new URLSearchParams(params).toString();
            const url = `${this.baseUrl}${path}${qs ? '?' + qs : ''}`;
            const client = await this.getDigestClient();
            const res = await client.fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                signal: controller.signal
            });
            const text = await res.text();
            if (!res.ok) throw new Error(`POST ${path} falhou: ${res.status} - ${text}`);
            return text;
        } catch (err) {
            if (err.name === 'AbortError') throw new Error(`Timeout POST ${path}`);
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    async _postForm(path, formData, timeoutMs = 15000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const url = `${this.baseUrl}${path}`;
            const client = await this.getDigestClient();
            const res = await client.fetch(url, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });
            const text = await res.text();
            if (!res.ok) throw new Error(`POST form ${path} falhou: ${res.status} - ${text}`);
            return text;
        } catch (err) {
            if (err.name === 'AbortError') throw new Error(`Timeout POST form ${path}`);
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Teste de conectividade
     */
    async ping() {
        try {
            await this._get('/cgi-bin/AccessUser.cgi', { action: 'getCount' }, 5000);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    /**
     * Cadastrar usuário + face no dispositivo
     */
    async enrollUser(pessoa, fotoBase64) {
        const hwUserId = pessoa.cpf
            ? pessoa.cpf.replace(/\D/g, '')
            : (pessoa.id ? pessoa.id.split('-')[0] : 'unknown');

        const nome = pessoa.nome_completo || pessoa.nome || 'SEM NOME';

        // 1. Cadastrar usuário
        const userData = {
            UserList: [{
                UserID: hwUserId,
                UserName: nome.substring(0, 31),
                UserType: 'Normal',
                AuthorizeTimePeriodList: [{ Index: 0, Enable: true }],
                Valid: { Enable: true, BeginTime: '2000-01-01 00:00:00', EndTime: '2037-12-31 23:59:59' }
            }]
        };

        const addResp = await this._postJson('/cgi-bin/AccessUser.cgi', { action: 'insertMulti' }, userData);
        const parsed = Object.fromEntries(addResp.split('\r\n').filter(Boolean).map(l => {
            const [k, ...v] = l.split('=');
            return [k?.trim(), v.join('=')?.trim()];
        }));

        if (parsed.Result !== 'OK' && !addResp.includes('Result=OK')) {
            const alreadyExists = addResp.includes('UserAlreadyExists') || addResp.includes('6');
            if (!alreadyExists) throw new Error(`Falha ao cadastrar usuário: ${addResp.substring(0, 100)}`);
        }

        // 2. Cadastrar face (se foto fornecida)
        if (fotoBase64) {
            const base64Data = fotoBase64.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');

            const FormData = require('form-data');
            const form = new FormData();
            form.append('UserID', hwUserId);
            form.append('Index', '0');
            form.append('PhotoData', imgBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });

            await this._postForm('/cgi-bin/FaceInfoManager.cgi?action=add', form, 20000);
        }

        return { success: true, hwUserId, nome };
    }

    /**
     * Remover usuário do dispositivo
     */
    async deleteUser(hwUserId) {
        const data = { UserIDList: [{ UserID: hwUserId }] };
        await this._postJson('/cgi-bin/AccessUser.cgi', { action: 'removeMulti' }, data);
        return { success: true };
    }

    /**
     * Abrir porta/relé
     */
    async openDoor(doorIndex = 1) {
        await this._get('/cgi-bin/AccessControl.cgi', {
            action: 'openDoor',
            DoorIndex: doorIndex,
            Type: 'Remote'
        });
        return { success: true };
    }

    /**
     * Tirar snapshot
     */
    async getSnapshot() {
        const client = await this.getDigestClient();
        const url = `${this.baseUrl}/cgi-bin/snapshot.cgi`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await client.fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`Snapshot falhou: ${res.status}`);
            const buf = await res.arrayBuffer();
            return Buffer.from(buf).toString('base64');
        } catch (err) {
            if (err.name === 'AbortError') throw new Error('Timeout snapshot');
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }
}

module.exports = IntelbrasLocal;
