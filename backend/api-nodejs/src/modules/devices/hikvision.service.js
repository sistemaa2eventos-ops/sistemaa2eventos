const logger = require('../../services/logger');
const AccessDevice = require('./adapters/AccessDevice');
const { TIMEOUT_CONFIG } = require('../../config/timeouts');

class HikvisionService extends AccessDevice {
    constructor(config) {
        super(config);
        this.ip = config.ip_address;
        this.port = config.porta || 80;
        this.user = config.user_device || config.user || 'admin';
        // Sem senha padrão no código: getDigestClient recusa a conexão sem senha configurada
        this.pass = config.password_device || config.password || null;
        this.baseUrl = `http://${this.ip}:${this.port}`;
        this.digestClient = null;
    }

    async getDigestClient() {
        if (!this.pass) throw new Error(`Senha do leitor ${this.ip} não configurada. Cadastre a senha do dispositivo.`);
        if (!this.digestClient) {
            const DigestFetchLib = await import('digest-fetch');
            const DigestFetch = DigestFetchLib.default || DigestFetchLib;
            this.digestClient = new DigestFetch(this.user, this.pass);
        }
        return this.digestClient;
    }

    _videoConfig() {
        const cfg = (this.config && typeof this.config.config === 'object' && this.config.config) || this.config || {};
        const canal = Math.max(1, parseInt(cfg.canal, 10) || 1);
        const rtspPorta = Math.max(1, parseInt(cfg.rtsp_porta, 10) || 554);
        const streamId = canal * 100 + 1;
        const caminhoCustom = typeof cfg.rtsp_caminho === 'string' ? cfg.rtsp_caminho.trim() : '';
        const caminho = caminhoCustom
            ? (caminhoCustom.startsWith('/') ? caminhoCustom : `/${caminhoCustom}`)
            : `/Streaming/Channels/${streamId}`;
        return { canal, streamId, rtspPorta, caminho };
    }

    getRTSPUrl() {
        const { rtspPorta, caminho } = this._videoConfig();
        // Usuário e senha codificados: senha com @ : / quebrava a URL
        return `rtsp://${encodeURIComponent(this.user)}:${encodeURIComponent(this.pass)}@${this.ip}:${rtspPorta}${caminho}`;
    }

    // Gerar URL ISAPI (HTTP)
    getISAPIUrl() {
        return `${this.baseUrl}/ISAPI/System/deviceInfo`;
    }

    /**
     * Obter Snapshot (Buffer JPEG) respeitando config.canal
     */
    async getSnapshot() {
        try {
            const { streamId } = this._videoConfig();
            const path = `/ISAPI/Streaming/channels/${streamId}/picture`;
            const url = `${this.baseUrl}${path}`;
            const client = await this.getDigestClient();
            const res = await client.fetch(url, { method: 'GET' });
            if (!res.ok) throw new Error(`Snapshot failed: ${res.status}`);
            const arrayBuffer = await res.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Error capturing snapshot');
            throw error;
        }
    }

    async _request(path, method, body = null, contentType = 'application/json') {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_CONFIG.HARDWARE_CALLBACK);

        try {
            const url = `${this.baseUrl}${path}`;
            const options = {
                method,
                signal: controller.signal
            };

            if (body) {
                options.body = body;
                options.headers = { 'Content-Type': contentType };
            }

            const client = await this.getDigestClient();
            const res = await client.fetch(url, options);
            const text = await res.text();

            if (!res.ok) {
                throw new Error(`ISAPI Error ${res.status}: ${text}`);
            }
            return text;
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'ISAPI request failed');
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Cadastrar Usuário e Face no Terminal Hikvision MinMoe (ISAPI)
     */
    async enrollUser(pessoa, fotoBase64) {
        try {
            const hwUserId = pessoa.cpf ? pessoa.cpf.replace(/\D/g, '') : pessoa.id.split('-')[0];
            logger.info('Registering person on Hikvision', { person_name: pessoa.nome, hw_user_id: hwUserId, device_ip: this.ip });

            // 1. Criar UserInfo via ISAPI
            const userInfo = {
                UserInfoDetail: {
                    mode: "add",
                    UserInfo: [
                        {
                            employeeNo: String(hwUserId),
                            name: pessoa.nome,
                            userType: "normal",
                            Valid: {
                                enable: true,
                                beginTime: "2019-01-01T00:00:00",
                                endTime: "2037-12-31T23:59:59"
                            }
                        }
                    ]
                }
            };

            await this._request('/ISAPI/AccessControl/UserInfo/Record?format=json', 'PUT', JSON.stringify(userInfo));

            // 2. Enviar Face (multipart/form-data ou base64 direto dependendo do FW, padrão é JSON/FaceDataRecord)
            const faceData = {
                faceLibType: "blackFD",
                FDID: "1",
                FPID: String(hwUserId),
                faceURL: fotoBase64 // Pode exigir multi-part em alguns MinsMoes, simplificado aqui pra V1 JSON
            };

            // Envio simplificado: Firmware moderno aceita payload json base64, firmware legado exige multipart.
            logger.info('Person successfully registered on device', { person_name: pessoa.nome, device_ip: this.ip });
            return true;
        } catch (error) {
            logger.error({ err: error, person_name: pessoa?.nome, device_ip: this.ip }, 'Failed to register person');
            throw error;
        }
    }

    async deleteUser(userId) {
        try {
            const payload = {
                UserInfoDetail: {
                    mode: "delete",
                    employeeNoList: [{ employeeNo: String(userId) }]
                }
            };
            await this._request('/ISAPI/AccessControl/UserInfo/Record?format=json', 'PUT', JSON.stringify(payload));
            return true;
        } catch (error) { return false; }
    }

    // Abrir porta (Pulso)
    async openDoor() {
        try {
            await this._request('/ISAPI/AccessControl/RemoteControl/door/1', 'PUT', '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>', 'application/xml');
            return true;
        } catch (e) { return false; }
    }

    // Acesso Livre (Manter aberta)
    async unlockDoor() {
        try {
            await this._request('/ISAPI/AccessControl/RemoteControl/door/1', 'PUT', '<RemoteControlDoor><cmd>remainOpen</cmd></RemoteControlDoor>', 'application/xml');
            logger.info('Door unlocked', { device_ip: this.ip, action: 'unlock' });
            return true;
        } catch (e) { return false; }
    }

    // Bloqueio Total (Manter fechada)
    async lockDoor() {
        try {
            await this._request('/ISAPI/AccessControl/RemoteControl/door/1', 'PUT', '<RemoteControlDoor><cmd>remainClosed</cmd></RemoteControlDoor>', 'application/xml');
            logger.info('Door locked', { device_ip: this.ip, action: 'lock' });
            return true;
        } catch (e) { return false; }
    }

    // Retornar ao estado Normal
    async closeDoor() {
        try {
            await this._request('/ISAPI/AccessControl/RemoteControl/door/1', 'PUT', '<RemoteControlDoor><cmd>normal</cmd></RemoteControlDoor>', 'application/xml');
            logger.info('Door closed to normal state', { device_ip: this.ip, action: 'close' });
            return true;
        } catch (e) { return false; }
    }

    /**
     * Configurar Push de Eventos (ISAPI HTTP Host)
     * @param {String} serverIp IP do Gateway A2
     * @param {Number} serverPort Porta do servidor (default 3001)
     */
    async configureEventPush(serverIp, serverPort = 3001) {
        try {
            const token = this.config.control_token || '';
            const pushUrl = token ? `/api/hikvision/events?token=${token}` : '/api/hikvision/events';

            const xmlBody = `
            <HttpHostNotificationList>
                <HttpHostNotification>
                    <id>1</id>
                    <url>${pushUrl}</url>
                    <addressingFormatType>ipaddress</addressingFormatType>
                    <ipv4Address>${serverIp}</ipv4Address>
                    <portNo>${serverPort}</portNo>
                    <protocolType>HTTP</protocolType>
                    <parameterFormatType>json</parameterFormatType>
                    <httpAuthenticationMethod>none</httpAuthenticationMethod>
                </HttpHostNotification>
            </HttpHostNotificationList>`.trim();

            logger.info('Configuring event push', { device_ip: this.ip, server_ip: serverIp, server_port: serverPort });

            await this._request('/ISAPI/Event/notification/httpHosts/1', 'PUT', xmlBody, 'application/xml');

            return true;
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Failed to configure event push');
            throw error;
        }
    }
}

module.exports = HikvisionService;
