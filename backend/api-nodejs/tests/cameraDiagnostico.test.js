'use strict';

/**
 * "Diagnosticar" da câmera: aponta o problema certo (rede, porta, senha/caminho, retransmissor, IA,
 * gravação) e nunca mostra a senha da câmera.
 */

jest.mock('../src/services/agentService', () => ({ agents: new Map(), findAgentForEvent: () => null }));

const { diagnosticarCamera, enderecoDaUrl, ehWebcam } = require('../src/modules/system/cameraDiagnostico.service');

const cam = (extra = {}) => ({
    id: 'c1', evento_id: 'E1', nome: 'Portaria', status: 'online', protocolo: 'rtsp',
    stream_url: 'rtsp://admin:Segredo123@192.168.1.64:554/cam/realmonitor?channel=1&subtype=0',
    ia_ativa: false, gravacao_modo: 'desligada', ...extra
});

function deps({ rede, snapshot, recursos = { video_local: true, ffmpeg: true }, motor, gravacao } = {}) {
    return {
        rota: { tipo: 'agente', agentId: 'A1' },
        rtsp: true,
        videoLocal: !!recursos.video_local,
        agentService: {
            recursos: () => recursos,
            sendCommand: async (_id, cmd, payload) => {
                if (cmd === 'snapshot_local') return snapshot ? snapshot(payload) : { base64: 'A'.repeat(4000) };
                if (cmd === 'gravacao_status') return gravacao;
                throw new Error(`inesperado ${cmd}`);
            }
        },
        chamarIa: async (_rota, caminho) => {
            if (caminho === '/api/engine/status') { if (motor instanceof Error) throw motor; return { data: motor }; }
            return { data: { online: true } };
        },
        buscarImagemHttp: async () => ({ data: Buffer.alloc(2048) }),
        redeTeste: { testar: async () => rede || { resolvido: true, ping: { ok: true, ms: 1 }, portas: [{ porta: 554, aberta: true, ms: 5 }, { porta: 80, aberta: true, ms: 4 }] } }
    };
}

const porChave = (r) => Object.fromEntries(r.itens.map(i => [i.chave, i]));

test('lê host e porta da URL sem expor a senha', () => {
    expect(enderecoDaUrl('rtsp://admin:x@10.0.0.5/live')).toEqual({ host: '10.0.0.5', porta: 554, protocolo: 'rtsp', temUsuario: true });
    expect(enderecoDaUrl('http://10.0.0.5:8080/snap.jpg').porta).toBe(8080);
    expect(enderecoDaUrl('lixo')).toBeNull();
    expect(ehWebcam('webcam:1')).toBe(true);
    expect(ehWebcam('rtsp://u:p@127.0.0.1:8554/live')).toBe(true);
    expect(ehWebcam('rtsp://10.0.0.5/live')).toBe(false);
});

test('tudo certo', async () => {
    const r = await diagnosticarCamera(cam(), deps());
    expect(r.resumo).toBe('Tudo certo');
    expect(JSON.stringify(r)).not.toContain('Segredo123');
    expect(porChave(r).cadastro.detalhe).toBe('RTSP 192.168.1.64:554');
});

test('câmera fora da rede: erro de rede e a imagem pede para corrigir a rede primeiro', async () => {
    const r = await diagnosticarCamera(cam(), deps({
        rede: { resolvido: true, ping: { ok: false }, portas: [{ porta: 554, aberta: false, erro: 'sem resposta' }, { porta: 80, aberta: false, erro: 'sem resposta' }] },
        snapshot: () => { throw new Error('Câmera sem imagem (HTTP 500)'); }
    }));
    const i = porChave(r);
    expect(i.rede.estado).toBe('erro');
    expect(i.rede.detalhe).toContain('não responde');
    expect(i.imagem.como_corrigir).toContain('rede');
});

test('responde ao ping mas a porta do vídeo está fechada', async () => {
    const r = await diagnosticarCamera(cam(), deps({
        rede: { resolvido: true, ping: { ok: true, ms: 1 }, portas: [{ porta: 554, aberta: false, erro: 'recusada' }, { porta: 80, aberta: true, ms: 3 }] },
        snapshot: () => { throw new Error('Câmera sem imagem (HTTP 500)'); }
    }));
    expect(porChave(r).rede.detalhe).toContain('porta 554 do vídeo está fechada');
});

test('porta abre mas não vem imagem: aponta senha/caminho e o modelo', async () => {
    const r = await diagnosticarCamera(cam(), deps({ snapshot: () => { throw new Error('Câmera sem imagem (HTTP 500)'); } }));
    const i = porChave(r);
    expect(i.imagem.estado).toBe('erro');
    expect(i.imagem.como_corrigir).toContain('Modelos de câmera');
    expect(i.miniatura).toBeUndefined();
});

test('sem retransmissor e sem PC do evento', async () => {
    const d = deps({ recursos: {} });
    let r = await diagnosticarCamera(cam(), d);
    expect(porChave(r).retransmissor.estado).toBe('alerta');
    r = await diagnosticarCamera(cam(), { ...d, rota: null });
    expect(porChave(r).agente.estado).toBe('erro');
    expect(porChave(r).rede).toBeUndefined();
});

test('IA ligada: câmera fora do motor, sem rostos do evento e ok', async () => {
    let r = await diagnosticarCamera(cam({ ia_ativa: true }), deps({ motor: { cameras: [] } }));
    expect(porChave(r).ia.estado).toBe('alerta');
    r = await diagnosticarCamera(cam({ ia_ativa: true }), deps({ motor: { cameras: [{ camera_id: 'c1', conectada: true, video_fps: 10 }], rostos_por_evento: { E1: 0 } } }));
    expect(porChave(r).ia.detalhe).toContain('nenhum rosto');
    r = await diagnosticarCamera(cam({ ia_ativa: true }), deps({ motor: { cameras: [{ camera_id: 'c1', conectada: true, video_fps: 10, ia_analisando: false }], rostos_por_evento: { E1: 40 } } }));
    expect(porChave(r).ia.estado).toBe('ok');
    r = await diagnosticarCamera(cam({ ia_ativa: true }), deps({ motor: Object.assign(new Error('x'), { iaOffline: true }) }));
    expect(porChave(r).ia.detalhe).toContain('desligado');
});

test('gravação contínua parada e com erro', async () => {
    let r = await diagnosticarCamera(cam({ gravacao_modo: 'continua' }), deps({ gravacao: { ativa: true, livre_bytes: 500 * 1024 ** 3, cameras: [{ id: 'c1', gravando: false }] } }));
    expect(porChave(r).gravacao.estado).toBe('alerta');
    r = await diagnosticarCamera(cam({ gravacao_modo: 'alertas' }), deps({ gravacao: { ativa: true, cameras: [{ id: 'c1', erro: 'disco cheio' }] } }));
    expect(porChave(r).gravacao.estado).toBe('erro');
});

test('webcam: não testa a rede', async () => {
    const r = await diagnosticarCamera(cam({ stream_url: 'webcam' }), deps());
    expect(porChave(r).rede).toBeUndefined();
    expect(porChave(r).cadastro.detalhe).toContain('Webcam');
});

describe('teste de rede', () => {
    const rede = require('../src/modules/devices/redeTeste.service');

    test('valida endereço e portas', () => {
        expect(rede.normalizar('http://192.168.1.64/x', '554, 80')).toEqual({ host: '192.168.1.64', portas: [554, 80] });
        expect(() => rede.normalizar('1.2.3.4; rm -rf /', [])).toThrow();
        expect(() => rede.normalizar('-n 1 x', [])).toThrow();
        expect(() => rede.normalizar('1.2.3.4', [70000])).toThrow();
        expect(() => rede.normalizar('1.2.3.4', Array.from({ length: 11 }, (_, i) => i + 1))).toThrow();
    });

    test('porta aberta e fechada nesta máquina', async () => {
        const net = require('net');
        const srv = net.createServer().listen(0, '127.0.0.1');
        await new Promise(r => srv.once('listening', r));
        const aberta = srv.address().port;
        const r = await rede.testarAqui('127.0.0.1', [aberta, 1], 1500);
        srv.close();
        expect(r.portas.find(p => p.porta === aberta).aberta).toBe(true);
        expect(r.portas.find(p => p.porta === 1).aberta).toBe(false);
    }, 10000);
});
