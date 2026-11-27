/**
 * Correções da revisão de segurança de 23/11/2026:
 *  - empresas: toda operação por id fica no evento da requisição (antes o cliente de serviço alcançava
 *    empresas de qualquer evento); termo de busca não altera o filtro .or()
 *  - usuários: admin não altera conta de Admin Master; quem não é admin e não tem evento só vê o próprio perfil
 *  - fechamento manual de turno: sempre de um evento (antes, sem evento, fechava TODOS os eventos ativos)
 *  - LPR e Hikvision: exigem o token do dispositivo; número do Hikvision não altera o filtro .or()
 *  - relatório de sessão do operador: identidade, papel e evento vêm da sessão, não do corpo
 *  - módulo desligado em Usuários → Permissões bloqueia as escritas de empresa e o cadastro de pessoa
 */

// ---------- banco simulado ----------
const mockDb = {};
const mockLog = { ors: [], updates: [], deletes: [], inserts: [] };

function mockFrom(tabela) {
    const filtros = [];
    let op = 'select';
    let payload = null;
    const q = {};
    for (const m of ['select', 'order', 'gte', 'lte', 'gt', 'lt', 'neq', 'is', 'not', 'range', 'ilike', 'in', 'limit']) q[m] = () => q;
    q.eq = (c, v) => { filtros.push([c, v]); return q; };
    q.or = (s) => { mockLog.ors.push({ tabela, filtro: s }); return q; };
    q.update = (p) => { op = 'update'; payload = p; return q; };
    q.delete = () => { op = 'delete'; return q; };
    q.insert = (linhas) => { mockLog.inserts.push({ tabela, linhas }); op = 'insert'; return q; };
    const casar = () => (mockDb[tabela] || []).filter(l => filtros.every(([c, v]) => l[c] === v));
    const executar = () => {
        const linhas = casar();
        if (op === 'update') {
            linhas.forEach(l => Object.assign(l, payload));
            mockLog.updates.push({ tabela, filtros: [...filtros], afetadas: linhas.length });
        }
        if (op === 'delete') {
            mockDb[tabela] = (mockDb[tabela] || []).filter(l => !linhas.includes(l));
            mockLog.deletes.push({ tabela, filtros: [...filtros], afetadas: linhas.length });
        }
        if (op === 'insert') return [];
        return linhas;
    };
    q.single = async () => ({ data: executar()[0] || null, error: null });
    q.maybeSingle = q.single;
    q.then = (ok, ko) => Promise.resolve({ data: executar(), error: null, count: 0 }).then(ok, ko);
    return q;
}

jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => ({
    supabase: { from: (t) => mockFrom(t), auth: { admin: { updateUserById: jest.fn(async () => ({})) } } },
    supabasePublic: { from: (t) => mockFrom(t) }
}));
jest.mock('../src/modules/entities/documentoRequisitos.service', () => ({ normalizarFuncao: (f) => f }));
jest.mock('../src/services/emailService', () => ({ sendCompanyInvite: jest.fn(async () => true) }));
jest.mock('../src/services/websocketService', () => ({ emit: jest.fn(), emitToOperador: jest.fn() }));
jest.mock('../src/modules/reports/report.controller', () => ({}));
jest.mock('../src/modules/checkin/checkin.service', () => ({ registrarAcesso: jest.fn(async () => ({ success: true })) }));
jest.mock('../src/modules/entities/veiculo.service', () => ({}));

const empresaController = require('../src/modules/entities/empresa.controller');
const authController = require('../src/modules/auth/auth.controller');
const cronController = require('../src/modules/events/cron.controller');
const veiculoController = require('../src/modules/entities/veiculo.controller');
const hikvisionController = require('../src/modules/devices/hikvision.controller');
const auditController = require('../src/modules/audit/audit.controller');
const checkinService = require('../src/modules/checkin/checkin.service');
const { bloquearSeModuloDesligado, exigirAlgumModulo } = require('../src/middleware/moduloDesligado');

const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.corpo = b; return res; };
    res.send = (b) => { res.corpo = b; return res; };
    return res;
};

beforeEach(() => {
    for (const k of Object.keys(mockDb)) delete mockDb[k];
    mockLog.ors.length = 0; mockLog.updates.length = 0; mockLog.deletes.length = 0; mockLog.inserts.length = 0;
    mockDb.empresas = [
        { id: 'emp-A', evento_id: 'ev-A', nome: 'Empresa A' },
        { id: 'emp-B', evento_id: 'ev-B', nome: 'Empresa B' }
    ];
});

describe('Empresas: operações por id limitadas ao evento da requisição', () => {
    const req = (id, extra = {}) => ({ params: { id }, event: { id: 'ev-A' }, body: {}, query: {}, user: { id: 'u1' }, ...extra });

    it('não lê empresa de outro evento', async () => {
        const res = resposta();
        await empresaController.getById(req('emp-B'), res);
        expect(res.statusCode).toBe(404);
        const ok = resposta();
        await empresaController.getById(req('emp-A'), ok);
        expect(ok.corpo.data.nome).toBe('Empresa A');
    });

    it('não altera empresa de outro evento', async () => {
        const res = resposta();
        await empresaController.update(req('emp-B', { body: { nome: 'Invadida' } }), res);
        expect(res.statusCode).toBe(404);
        expect(mockDb.empresas.find(e => e.id === 'emp-B').nome).toBe('Empresa B');
    });

    it('não exclui empresa de outro evento', async () => {
        const res = resposta();
        await empresaController.delete(req('emp-B'), res);
        expect(res.statusCode).toBe(404);
        expect(mockDb.empresas.some(e => e.id === 'emp-B')).toBe(true);
    });

    it('não gera novo link nem envia convite de empresa de outro evento', async () => {
        const r1 = resposta();
        await empresaController.refreshToken(req('emp-B'), r1);
        expect(r1.statusCode).toBe(404);
        const r2 = resposta();
        await empresaController.sendInviteEmail(req('emp-B', { body: { email: 'x@y.com' } }), r2);
        expect(r2.statusCode).toBe(404);
    });

    it('criação usa só o evento da requisição (corpo e cabeçalho não escolhem outro)', async () => {
        const res = resposta();
        await empresaController.create(req(undefined, {
            body: { nome: 'Nova', evento_id: 'ev-B' }, headers: { 'x-evento-id': 'ev-B' }
        }), res);
        const inserida = mockLog.inserts.find(i => i.tabela === 'empresas').linhas[0];
        expect(inserida.evento_id).toBe('ev-A');
    });

    it('termo de busca não muda o filtro .or()', async () => {
        await empresaController.search({ query: { q: 'x,id.eq.1)' }, event: { id: 'ev-A' } }, resposta());
        const filtro = mockLog.ors.find(o => o.tabela === 'empresas').filtro;
        expect(filtro.split(',')).toHaveLength(2);
        expect(filtro).not.toMatch(/\)/);
    });
});

describe('Usuários', () => {
    it('admin não altera a conta de um Admin Master', async () => {
        mockDb.perfis = [{ id: 'master-1', nivel_acesso: 'admin_master', evento_id: null }];
        const res = resposta();
        await authController.updateUserRole({
            params: { userId: 'master-1' }, body: { nivel_acesso: 'operador' }, user: { id: 'adm', nivel_acesso: 'admin' }
        }, res);
        expect(res.statusCode).toBe(403);
        expect(mockDb.perfis[0].nivel_acesso).toBe('admin_master');
    });

    it('Admin Master continua podendo alterar outro usuário', async () => {
        mockDb.perfis = [{ id: 'op-1', nivel_acesso: 'operador', evento_id: 'ev-A' }];
        const res = resposta();
        await authController.updateUserRole({
            params: { userId: 'op-1' }, body: { nivel_acesso: 'supervisor' }, user: { id: 'm', nivel_acesso: 'admin_master' }
        }, res);
        expect(res.statusCode).toBe(200);
        expect(mockDb.perfis[0].nivel_acesso).toBe('supervisor');
    });

    it('quem não é admin e não tem evento só vê o próprio perfil', async () => {
        mockDb.perfis = [
            { id: 'sup-1', nivel_acesso: 'supervisor', evento_id: null },
            { id: 'outro', nivel_acesso: 'operador', evento_id: 'ev-B', email: 'outro@x.com' }
        ];
        const res = resposta();
        await authController.listUsers({ query: {}, user: { id: 'sup-1', nivel_acesso: 'supervisor', evento_id: null } }, res);
        const ids = JSON.stringify(res.corpo);
        expect(ids).toContain('sup-1');
        expect(ids).not.toContain('outro@x.com');
    });
});

describe('Fechamento manual de turno', () => {
    let espiao;
    beforeEach(() => { espiao = jest.spyOn(cronController, 'resetTurnos').mockResolvedValue(); });
    afterEach(() => espiao.mockRestore());

    it('sem evento não fecha nada (antes fechava todos os eventos ativos)', async () => {
        const res = resposta();
        await cronController.manualTrigger({ params: {}, body: {} }, res);
        expect(res.statusCode).toBe(400);
        expect(espiao).not.toHaveBeenCalled();
    });

    it('com o evento da URL fecha só ele', async () => {
        const id = '11111111-2222-3333-4444-555555555555';
        mockDb.eventos = [{ id }];
        const res = resposta();
        await cronController.manualTrigger({ params: { id }, body: {} }, res);
        expect(res.statusCode).toBe(200);
        expect(espiao).toHaveBeenCalledWith(id, { arquivar: false });
    });
});

describe('Dispositivos sem login (LPR e Hikvision)', () => {
    beforeEach(() => {
        mockDb.dispositivos_acesso = [{ id: 'd1', evento_id: 'ev-A', control_token: 'tok-certo', nome: 'Portão' }];
        mockDb.veiculos = [{ id: 'v1', placa: 'ABC1234', evento_id: 'ev-A', status: 'liberado' }];
    });

    it('LPR sem token responde 401 e não grava passagem', async () => {
        const res = resposta();
        await veiculoController.consultarPlacaLPR({ params: { placa: 'ABC1234' }, query: { evento_id: 'ev-A' }, headers: {}, ip: '1.2.3.4' }, res);
        expect(res.statusCode).toBe(401);
        expect(mockLog.inserts.some(i => i.tabela === 'logs_veiculos')).toBe(false);
    });

    it('LPR com token de outro evento responde 403', async () => {
        const res = resposta();
        await veiculoController.consultarPlacaLPR({ params: { placa: 'ABC1234' }, query: { evento_id: 'ev-B', token: 'tok-certo' }, headers: {}, ip: '1.2.3.4' }, res);
        expect(res.statusCode).toBe(403);
    });

    it('LPR com o token certo autoriza', async () => {
        const res = resposta();
        await veiculoController.consultarPlacaLPR({ params: { placa: 'ABC1234' }, query: { evento_id: 'ev-A', token: 'tok-certo' }, headers: {}, ip: '1.2.3.4' }, res);
        expect(res.corpo.autorizado).toBe(true);
    });

    it('Hikvision sem token é recusado', async () => {
        const res = resposta();
        await hikvisionController.handleEventPush({
            body: { AccessControllerEvent: { employeeNoString: '12345678900' } }, query: {}, headers: {}, ip: '::ffff:10.0.0.5'
        }, res);
        expect(res.statusCode).toBe(401);
        expect(checkinService.registrarAcesso).not.toHaveBeenCalled();
    });

    it('Hikvision: número com vírgula e parênteses não muda o filtro', async () => {
        await hikvisionController.handleEventPush({
            body: { AccessControllerEvent: { employeeNoString: '1,id.neq.0)' } }, query: { token: 'tok-certo' }, headers: {}, ip: '10.0.0.5'
        }, resposta());
        const filtro = mockLog.ors.find(o => o.tabela === 'pessoas').filtro;
        expect(filtro.split(',')).toHaveLength(2);
        expect(filtro).not.toMatch(/[()]/);
    });
});

describe('Relatório de sessão do operador', () => {
    it('usa o usuário autenticado, não o operador, papel e evento do corpo', async () => {
        const res = resposta();
        await auditController.registrarLogoutSessao({
            user: { id: 'op-real', nivel_acesso: 'operador', evento_id: 'ev-A', email: 'op@x.com' },
            body: { operador_id: 'outro-operador', nivel_acesso: 'admin_master', evento_id: 'ev-B', tempo_online_segundos: 60 }
        }, res);
        const gravado = mockLog.inserts.find(i => i.tabela === 'sessoes_login_operador');
        expect(gravado).toBeDefined();
        const linha = gravado.linhas[0];
        expect(linha.operador_id).toBe('op-real');
        expect(linha.nivel_acesso).toBe('operador');
        expect(linha.evento_id).toBe('ev-A');
    });
});

describe('Módulo desligado em Usuários → Permissões', () => {
    const usuario = (perms, nivel = 'operador') => ({ nivel_acesso: nivel, getEffectivePermissions: () => perms });
    const rodar = (user) => {
        const res = resposta();
        const next = jest.fn();
        bloquearSeModuloDesligado('empresas')({ user, event: { id: 'ev-A' } }, res, next);
        return { res, next };
    };

    it('bloqueia quando o módulo foi desligado', () => {
        const { res, next } = rodar(usuario({ empresas: false }));
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('segue quando o módulo está ligado ou sem configuração', () => {
        expect(rodar(usuario({ empresas: true })).next).toHaveBeenCalled();
        expect(rodar(usuario({})).next).toHaveBeenCalled();
    });

    it('admin não é afetado', () => {
        expect(rodar(usuario({ empresas: false }, 'admin')).next).toHaveBeenCalled();
    });
});

describe('Estatísticas em tempo real: exige um dos módulos que usam a rota', () => {
    const MODULOS = ['dashboard', 'monitoramento', 'checkin', 'checkout', 'fiscalizacao'];
    const rodar = (perms, nivel = 'operador') => {
        const res = resposta();
        const next = jest.fn();
        exigirAlgumModulo(MODULOS)({ user: { nivel_acesso: nivel, getEffectivePermissions: () => perms }, event: { id: 'ev-A' } }, res, next);
        return { res, next };
    };
    const todosDesligados = Object.fromEntries(MODULOS.map(m => [m, false]));

    it('bloqueia quem tem todos esses módulos desligados', () => {
        const { res, next } = rodar(todosDesligados);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('libera quem tem só o Dashboard ou só o Monitor', () => {
        expect(rodar({ ...todosDesligados, dashboard: true }).next).toHaveBeenCalled();
        expect(rodar({ ...todosDesligados, monitoramento: true }).next).toHaveBeenCalled();
    });

    it('módulo sem configuração não bloqueia; admin não é afetado', () => {
        expect(rodar({ checkin: false }).next).toHaveBeenCalled();
        expect(rodar(todosDesligados, 'admin').next).toHaveBeenCalled();
    });
});
