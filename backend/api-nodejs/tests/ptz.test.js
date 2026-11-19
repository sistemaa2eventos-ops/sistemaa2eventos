'use strict';

/**
 * Giro (PTZ) ONVIF: mensagens, leitura das respostas e o fluxo de conexão/ação, com a câmera simulada.
 * Não usa câmera nem rede: a resposta de cada URL vem de um mapa.
 */
const crypto = require('crypto');
const onvif = require('../src/services/onvif');
const ptz = require('../src/modules/system/ptz.service');

const RESP_SERVICOS = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><tds:GetServicesResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
<tds:Service><tds:Namespace>http://www.onvif.org/ver10/media/wsdl</tds:Namespace><tds:XAddr>http://10.9.9.9:2020/onvif/media_service</tds:XAddr></tds:Service>
<tds:Service><tds:Namespace>http://www.onvif.org/ver20/ptz/wsdl</tds:Namespace><tds:XAddr>http://10.9.9.9:2020/onvif/ptz_service</tds:XAddr></tds:Service>
</tds:GetServicesResponse></s:Body></s:Envelope>`;
const RESP_PERFIS = `<s:Envelope><s:Body><trt:GetProfilesResponse xmlns:trt="x"><trt:Profiles token="Profile_1" fixed="true"><tt:Name>mainStream</tt:Name></trt:Profiles><trt:Profiles token="Profile_2"/></trt:GetProfilesResponse></s:Body></s:Envelope>`;
const RESP_PRESETS = `<s:Envelope><s:Body><tptz:GetPresetsResponse xmlns:tptz="x"><tptz:Preset token="1"><tt:Name>Portaria</tt:Name></tptz:Preset><tptz:Preset token="2"><tt:Name>Bar</tt:Name></tptz:Preset></tptz:GetPresetsResponse></s:Body></s:Envelope>`;
const RESP_FAULT_SENHA = `<s:Envelope><s:Body><s:Fault><s:Code><s:Value>s:Sender</s:Value></s:Code><s:Reason><s:Text xml:lang="en">Sender not Authorized</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>`;
const RESP_FAULT_ARG = `<s:Envelope><s:Body><s:Fault><s:Code><s:Value>s:Sender</s:Value></s:Code><s:Reason><s:Text xml:lang="en">Invalid argument</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>`;
const RESP_OK = `<s:Envelope><s:Body><tptz:ContinuousMoveResponse xmlns:tptz="x"/></s:Body></s:Envelope>`;

const cam = (extra = {}) => ({ id: 'c1', ip_address: '10.9.9.9', ptz_porta: 2020, usuario: 'op', senha: 'segredo', ptz_ativo: true, ...extra });

/** Câmera falsa: devolve a resposta pela URL e registra tudo o que foi enviado */
function camera(respostas = {}) {
    const enviados = [];
    const enviar = async (url, xml) => {
        enviados.push({ url, xml });
        for (const [trecho, resp] of Object.entries(respostas)) if (url.includes(trecho)) return typeof resp === 'function' ? resp(xml) : resp;
        return RESP_OK;
    };
    return { enviar, enviados };
}
const padrao = { '/device_service': RESP_SERVICOS, '/media_service': RESP_PERFIS, '/ptz_service': RESP_OK };

beforeEach(() => ptz._conexoes.clear());

describe('mensagens ONVIF', () => {
    test('digest da senha segue o padrão (SHA1 de nonce + data + senha, em base64)', () => {
        const nonce = Buffer.from('0123456789abcdef');
        const agora = new Date('2026-11-19T20:00:00.000Z');
        const esperado = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(agora.toISOString()), Buffer.from('segredo')])).digest('base64');
        const cab = onvif.cabecalhoSeguranca('op', 'segredo', { agora, nonce });
        expect(cab).toContain(`>${esperado}</Password>`);
        expect(cab).toContain('<Username>op</Username>');
        expect(cab).not.toContain('segredo');
    });

    test('envelope só leva o cabeçalho de segurança quando há usuário', () => {
        expect(onvif.envelope('<x/>', { usuario: 'a', senha: 'b' })).toContain('<Security');
        expect(onvif.envelope('<x/>', {})).not.toContain('<Security');
    });

    test('movimento: velocidade limitada a -1..1, com tempo limite na câmera', () => {
        const xml = onvif.msgMover('Profile_1', { pan: 3, tilt: -0.5, zoom: 0 });
        expect(xml).toContain('<tt:PanTilt x="1.000" y="-0.500"/>');
        expect(xml).toContain('<tptz:Timeout>PT1S</tptz:Timeout>');
        expect(xml).toContain('<tptz:ProfileToken>Profile_1</tptz:ProfileToken>');
    });

    test('token do perfil é escapado (nada de XML injetado)', () => {
        expect(onvif.msgIrPreset('a<b', '1')).toContain('a&lt;b');
    });

    test('lê serviços, perfil, posições e falhas das respostas', () => {
        const s = onvif.extrairServicos(RESP_SERVICOS);
        expect(s.ptz).toBe('http://10.9.9.9:2020/onvif/ptz_service');
        expect(s.midia).toBe('http://10.9.9.9:2020/onvif/media_service');
        expect(onvif.extrairTokenPerfil(RESP_PERFIS)).toBe('Profile_1');
        expect(onvif.extrairPresets(RESP_PRESETS)).toEqual([{ token: '1', nome: 'Portaria' }, { token: '2', nome: 'Bar' }]);
        expect(onvif.falha(RESP_FAULT_SENHA).motivo).toContain('not Authorized');
        expect(onvif.falha(RESP_OK)).toBeNull();
    });
});

describe('fluxo com a câmera', () => {
    test('conecta uma vez (endereço e perfil), depois só envia a ação', async () => {
        const c = camera(padrao);
        await ptz.executar(cam(), c.enviar, { acao: 'mover', pan: 0.5 });
        await ptz.executar(cam(), c.enviar, { acao: 'parar' });
        const device = c.enviados.filter(e => e.url.endsWith('/onvif/device_service'));
        expect(device).toHaveLength(1);
        // Endereço sempre pelo IP e porta cadastrados, mesmo que a câmera informe outro
        expect(c.enviados[0].url).toBe('http://10.9.9.9:2020/onvif/device_service');
        const mov = c.enviados.find(e => e.xml.includes('ContinuousMove'));
        expect(mov.url).toBe('http://10.9.9.9:2020/onvif/ptz_service');
        expect(mov.xml).toContain('<tptz:ProfileToken>Profile_1</tptz:ProfileToken>');
        expect(mov.xml).toContain('<s:Header>'); // com a senha da câmera
    });

    test('senha recusada: 401 com mensagem clara', async () => {
        const c = camera({ '/device_service': RESP_FAULT_SENHA });
        await expect(ptz.executar(cam(), c.enviar, { acao: 'parar' })).rejects.toMatchObject({ status: 401 });
    });

    test('comando recusado pela câmera: 422 com o motivo', async () => {
        const c = camera({ ...padrao, '/ptz_service': RESP_FAULT_ARG });
        await expect(ptz.executar(cam(), c.enviar, { acao: 'mover', pan: 1 })).rejects.toMatchObject({ status: 422 });
    });

    test('câmera sem o serviço de giro: 422 explicando o ONVIF', async () => {
        const semPtz = RESP_SERVICOS.replace(/ptz\/wsdl/, 'outro/wsdl');
        const c = camera({ '/device_service': semPtz, '/media_service': RESP_PERFIS });
        await expect(ptz.executar(cam(), c.enviar, { acao: 'parar' })).rejects.toMatchObject({ status: 422, message: expect.stringContaining('ONVIF PTZ') });
    });

    test('lista posições e grava uma nova', async () => {
        const c = camera({ ...padrao, '/ptz_service': (xml) => (xml.includes('GetPresets') ? RESP_PRESETS : '<s:Envelope><s:Body><tptz:SetPresetResponse xmlns:tptz="x"><tptz:PresetToken>7</tptz:PresetToken></tptz:SetPresetResponse></s:Body></s:Envelope>') });
        const r = await ptz.executar(cam(), c.enviar, { acao: 'listar' });
        expect(r.presets).toHaveLength(2);
        const g = await ptz.executar(cam(), c.enviar, { acao: 'gravar', nome: 'Palco' });
        expect(g.token).toBe('7');
    });

    test('ação desconhecida é recusada com 400', async () => {
        const c = camera(padrao);
        await expect(ptz.executar(cam(), c.enviar, { acao: 'apagar' })).rejects.toMatchObject({ status: 400 });
    });
});
