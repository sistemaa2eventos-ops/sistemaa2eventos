/**
 * Rotas LGPD:
 *  - POST /forget-me não anonimiza: se os dados conferem, manda e-mail com link (token de 30 min);
 *    a resposta é sempre a mesma, conferindo ou não;
 *  - POST /forget-me/confirmar valida o token e anonimiza; token inválido, expirado ou já usado → 400;
 *  - POST /anonymize/:id só para pessoa de evento permitido a quem chama (admin passa).
 */
const mockDb = { usuario: null, pessoas: [] };

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('express-rate-limit', () => () => (_req, _res, next) => next());
jest.mock('../src/middleware/auth', () => ({
    authenticate: (req, _res, next) => { req.user = mockDb.usuario; next(); },
    checkPermission: () => (_req, _res, next) => next(),
    extractRole: (u) => u?.role
}));
jest.mock('../src/services/emailService', () => ({
    sendForgetMeRequest: jest.fn(async () => {}),
    sendForgetMeConfirmation: jest.fn(async () => {}),
    sendDataPortability: jest.fn(async () => {})
}));
jest.mock('../src/modules/system/lgpd.service', () => ({
    anonymizePerson: jest.fn(async (id) => {
        const p = mockDb.pessoas.find(x => x.id === id);
        if (p) p.email = null; // como a anonimização real
        return { success: true, pessoa_id: id };
    }),
    exportUserData: jest.fn(async () => ({}))
}));
jest.mock('../src/config/supabase', () => {
    const consulta = () => {
        const filtros = [];
        const q = {
            select: () => q,
            eq: (c, v) => { filtros.push(['eq', c, v]); return q; },
            in: (c, v) => { filtros.push(['in', c, v]); return q; },
            limit: () => q
        };
        const linhas = () => mockDb.pessoas.filter(p => filtros.every(([op, c, v]) => (op === 'eq' ? p[c] === v : v.includes(p[c]))));
        q.maybeSingle = async () => ({ data: linhas()[0] || null, error: null });
        q.single = q.maybeSingle;
        q.then = (ok) => ok({ data: linhas(), error: null });
        return q;
    };
    return { supabase: { from: consulta } };
});

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const emailService = require('../src/services/emailService');
const lgpdService = require('../src/modules/system/lgpd.service');
const lgpdRoutes = require('../src/modules/system/lgpd.routes');

const app = express();
app.use(express.json());
app.use('/api/lgpd', lgpdRoutes);

const PID = '11111111-2222-3333-4444-555555555555';
const MSG = 'Se os dados conferirem, enviaremos um e-mail de confirmação.';
const SEGREDO = process.env.JWT_SECRET; // jest.setup

beforeEach(() => {
    mockDb.pessoas = [{ id: PID, nome_completo: 'Fulana', email: 'fulana@exemplo.com', cpf: '529.982.247-25', evento_id: 'ev1' }];
    emailService.sendForgetMeRequest.mockClear();
    emailService.sendForgetMeConfirmation.mockClear();
    lgpdService.anonymizePerson.mockClear();
    delete process.env.PUBLIC_PORTAL_URL;
});

describe('POST /api/lgpd/forget-me (pedido)', () => {
    it('dados conferem: envia o link ao e-mail gravado e NÃO anonimiza', async () => {
        const r = await request(app).post('/api/lgpd/forget-me')
            .send({ cpf: '52998224725', email: ' FULANA@exemplo.com ', evento_id: 'ev1' });
        expect(r.status).toBe(200);
        expect(r.body.message).toBe(MSG);
        expect(lgpdService.anonymizePerson).not.toHaveBeenCalled();

        expect(emailService.sendForgetMeRequest).toHaveBeenCalledTimes(1);
        const [para, nome, link] = emailService.sendForgetMeRequest.mock.calls[0];
        expect(para).toBe('fulana@exemplo.com');
        expect(nome).toBe('Fulana');
        expect(link.startsWith('https://cadastro.nzt.app.br/privacy/confirmar?token=')).toBe(true);

        const token = decodeURIComponent(link.split('token=')[1]);
        const dados = jwt.verify(token, SEGREDO);
        expect(dados).toMatchObject({ p: PID, a: 'forget' });
        expect(dados.exp - dados.iat).toBe(30 * 60);
    });

    it('usa PUBLIC_PORTAL_URL quando configurada', async () => {
        process.env.PUBLIC_PORTAL_URL = 'https://portal.exemplo.com/';
        await request(app).post('/api/lgpd/forget-me').send({ cpf: '52998224725', email: 'fulana@exemplo.com', evento_id: 'ev1' });
        expect(emailService.sendForgetMeRequest.mock.calls[0][2].startsWith('https://portal.exemplo.com/privacy/confirmar?token=')).toBe(true);
    });

    it('dados não conferem: mesma resposta 200, sem e-mail', async () => {
        for (const corpo of [
            { cpf: '52998224725', email: 'outro@exemplo.com', evento_id: 'ev1' },
            { cpf: '11111111111', email: 'fulana@exemplo.com', evento_id: 'ev1' },
            { cpf: '52998224725', email: 'fulana@exemplo.com', evento_id: 'ev2' }
        ]) {
            const r = await request(app).post('/api/lgpd/forget-me').send(corpo);
            expect(r.status).toBe(200);
            expect(r.body.message).toBe(MSG);
        }
        expect(emailService.sendForgetMeRequest).not.toHaveBeenCalled();
    });
});

describe('POST /api/lgpd/portability', () => {
    const MSG_PORT = 'Se os dados conferirem, enviaremos seus dados para o e-mail cadastrado.';
    const espera = () => new Promise(ok => setImmediate(ok));

    it('dados conferem: 200 genérico e dados enviados ao e-mail gravado', async () => {
        const r = await request(app).post('/api/lgpd/portability').send({ cpf: '52998224725', email: 'FULANA@exemplo.com', evento_id: 'ev1' });
        expect(r.status).toBe(200);
        expect(r.body.message).toBe(MSG_PORT);
        await espera();
        expect(emailService.sendDataPortability).toHaveBeenCalledWith('fulana@exemplo.com', 'Fulana', {});
    });

    it('pessoa inexistente ou e-mail divergente: mesma resposta 200, sem 404 e sem envio', async () => {
        emailService.sendDataPortability.mockClear();
        for (const corpo of [
            { cpf: '52998224725', email: 'outro@exemplo.com', evento_id: 'ev1' },
            { cpf: '11111111111', email: 'fulana@exemplo.com', evento_id: 'ev1' }
        ]) {
            const r = await request(app).post('/api/lgpd/portability').send(corpo);
            expect(r.status).toBe(200);
            expect(r.body.message).toBe(MSG_PORT);
        }
        await espera();
        expect(emailService.sendDataPortability).not.toHaveBeenCalled();
    });
});

describe('POST /api/lgpd/forget-me/confirmar', () => {
    const tokenValido = () => jwt.sign({ p: PID, a: 'forget' }, SEGREDO, { expiresIn: '30m' });

    it('token válido: anonimiza e avisa no e-mail', async () => {
        const r = await request(app).post('/api/lgpd/forget-me/confirmar').send({ token: tokenValido() });
        expect(r.status).toBe(200);
        expect(lgpdService.anonymizePerson).toHaveBeenCalledWith(PID, 'SELF_REQUEST');
        expect(emailService.sendForgetMeConfirmation).toHaveBeenCalledWith('fulana@exemplo.com', 'Fulana');
    });

    it('segundo uso do mesmo token: 400 (pessoa já sem e-mail)', async () => {
        const token = tokenValido();
        expect((await request(app).post('/api/lgpd/forget-me/confirmar').send({ token })).status).toBe(200);
        expect((await request(app).post('/api/lgpd/forget-me/confirmar').send({ token })).status).toBe(400);
        expect(lgpdService.anonymizePerson).toHaveBeenCalledTimes(1);
    });

    it('token expirado, de outro propósito, de outro segredo ou ausente: 400', async () => {
        const expirado = jwt.sign({ p: PID, a: 'forget', exp: Math.floor(Date.now() / 1000) - 10 }, SEGREDO);
        const outroUso = jwt.sign({ p: PID, a: 'drive' }, SEGREDO, { expiresIn: '30m' });
        const outroSegredo = jwt.sign({ p: PID, a: 'forget' }, 'outro-segredo', { expiresIn: '30m' });
        for (const token of [expirado, outroUso, outroSegredo, 'lixo', undefined]) {
            expect((await request(app).post('/api/lgpd/forget-me/confirmar').send({ token })).status).toBe(400);
        }
        expect(lgpdService.anonymizePerson).not.toHaveBeenCalled();
    });
});

describe('POST /api/lgpd/anonymize/:pessoa_id (painel)', () => {
    it('operador sem o evento da pessoa entre os permitidos: 404, sem anonimizar', async () => {
        mockDb.usuario = { id: 'u1', role: 'operador', isAllowedEvent: (e) => e === 'ev2' };
        const r = await request(app).post(`/api/lgpd/anonymize/${PID}`);
        expect(r.status).toBe(404);
        expect(lgpdService.anonymizePerson).not.toHaveBeenCalled();
    });

    it('operador com o evento permitido: anonimiza', async () => {
        mockDb.usuario = { id: 'u1', role: 'operador', isAllowedEvent: (e) => e === 'ev1' };
        expect((await request(app).post(`/api/lgpd/anonymize/${PID}`)).status).toBe(200);
        expect(lgpdService.anonymizePerson).toHaveBeenCalledWith(PID, 'u1');
    });

    it('admin e admin_master passam sem filtro de evento; pessoa inexistente é 404', async () => {
        mockDb.usuario = { id: 'm', role: 'admin_master' };
        expect((await request(app).post(`/api/lgpd/anonymize/${PID}`)).status).toBe(200);
        mockDb.usuario = { id: 'a', role: 'admin' };
        expect((await request(app).post('/api/lgpd/anonymize/99999999-2222-3333-4444-555555555555')).status).toBe(404);
    });
});
