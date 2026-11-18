'use strict';

const saude = require('../src/services/saudeVideo');

test('registra o resumo do agente e marca como ao vivo', () => {
    saude.registrar('ag1', 'PC do evento', {
        motor: true, retransmissor: true,
        cameras: [{ nome: 'Webcam', camera_id: 'c1', fps: 18.2, conectada: true, reconexoes: 1, resolucao: '1280x720', ia_ms: 12, rostos: 1 }],
    });
    const r = saude.resumo().find(a => a.agente_id === 'ag1');
    expect(r.ok).toBe(true);
    expect(r.motor).toBe(true);
    expect(r.cameras[0]).toMatchObject({ nome: 'Webcam', fps: 18.2, conectada: true });
});

test('dado com número inválido vira zero e não derruba o resumo', () => {
    saude.registrar('ag2', 'PC 2', { cameras: [{ nome: 'X', fps: 'lixo', reconexoes: null }] });
    const c = saude.resumo().find(a => a.agente_id === 'ag2').cameras[0];
    expect(c.fps).toBe(0);
    expect(c.reconexoes).toBe(0);
});

test('limita o número de câmeras', () => {
    const muitas = Array.from({ length: 50 }, (_, i) => ({ nome: `c${i}`, fps: 1 }));
    saude.registrar('ag3', 'PC 3', { cameras: muitas });
    expect(saude.resumo().find(a => a.agente_id === 'ag3').cameras.length).toBe(32);
});

test('sem envio há mais que a validade, o agente sai do ar', () => {
    saude.registrar('ag4', 'PC 4', { cameras: [] });
    const agora = Date.now();
    const real = Date.now;
    Date.now = () => agora + saude.VALIDADE_MS + 1000;
    try {
        const r = saude.resumo().find(a => a.agente_id === 'ag4');
        expect(r.ok).toBe(false);
    } finally {
        Date.now = real;
    }
});
