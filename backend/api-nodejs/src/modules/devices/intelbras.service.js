const logger = require('../../services/logger');
const FormData = require('form-data');
const AccessDevice = require('./adapters/AccessDevice');
const { TIMEOUT_CONFIG } = require('../../config/timeouts');
const { getHwUserId } = require('./hwUserId');
const { getNowLocal } = require('../../utils/dateUtils');

const INSTANCIAS = new Map();

class IntelbrasService extends AccessDevice {
    constructor(config) {
        super(config);
        this.ip = config.ip_address || config.ip;
        this.port = config.porta || config.port || 80;
        this.user = config.user_device || config.user || config.usuario || process.env.INTELBRAS_DEFAULT_USER || 'admin';
        this.pass = config.password_device || config.password || config.senha || process.env.INTELBRAS_DEFAULT_PASS || 'admin123';
        this.baseUrl = `http://${this.ip}:${this.port}`;
        this.digestClient = null;
    }

    /**
     * Instância reaproveitada por leitor: mantém o cliente Digest (e o nonce),
     * evitando a ida extra do desafio 401 a cada acesso.
     */
    static paraDispositivo(config) {
        const chave = [config.id, config.ip_address || config.ip, config.porta || config.port,
            config.user_device || config.user || config.usuario, config.password_device || config.password || config.senha,
            config.agent_id].join('|');
        let inst = INSTANCIAS.get(chave);
        if (!inst) {
            if (INSTANCIAS.size > 200) INSTANCIAS.clear();
            inst = new IntelbrasService(config);
            INSTANCIAS.set(chave, inst);
        }
        return inst;
    }

    async getDigestClient() {
        if (!this.digestClient) {
            const DigestFetchLib = await import('digest-fetch');
            const DigestFetch = DigestFetchLib.default || DigestFetchLib;
            this.digestClient = new DigestFetch(this.user, this.pass);
        }
        return this.digestClient;
    }

    // Gerar URL RTSP
    getRTSPUrl() {
        return `rtsp://${this.user}:${this.pass}@${this.ip}:554/cam/realmonitor?channel=1&subtype=0`;
    }

    // Gerar URL de Snapshot
    getSnapshotUrl() {
        return `${this.baseUrl}/cgi-bin/snapshot.cgi`;
    }

    /**
     * Transporte único para o CGI do terminal.
     * - Terminal com agent_id: a chamada vai pelo agente local (servidor na nuvem,
     *   leitor na rede privada do evento).
     * - Sem agente, ou com o agente conectado a outro servidor (ex.: API local do evento enquanto
     *   o agente atende a nuvem): conexão direta com Digest Auth (servidor na mesma rede).
     * @returns {Promise<{ status: number, ok: boolean, text: string, buffer: Buffer|null }>}
     */
    async _request(method, path, params = {}, body = null, contentType = null, { binary = false, timeoutMs = TIMEOUT_CONFIG.DEVICE_CONNECTION } = {}) {
        const queryString = new URLSearchParams(params).toString();
        const fullPath = `${path}${queryString ? '?' + queryString : ''}`;
        // Na nuvem o leitor só é alcançável pelo agente. No servidor local do evento (PYTHON_MICROSERVICE_URL
        // definida, ver camera.controller) a conexão direta funciona mesmo com o agente atendendo a nuvem.
        const agentService = this.config?.agent_id ? require('../../services/agentService') : null;
        const viaAgente = agentService && (agentService.agents.has(this.config.agent_id) || !process.env.PYTHON_MICROSERVICE_URL);

        if (viaAgente) {
            const r = await agentService.sendCommand(this.config.agent_id, 'cgi', {
                deviceId: this.config.id,
                config: { ip: this.ip, port: this.port, user: this.user, password: this.pass },
                method, path: fullPath, body, contentType, binary, timeoutMs
            });
            return {
                status: r.status,
                ok: !!r.ok,
                text: r.text || '',
                buffer: r.base64 ? Buffer.from(r.base64, 'base64') : null
            };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const client = await this.getDigestClient();
            const res = await client.fetch(`${this.baseUrl}${fullPath}`, {
                method,
                ...(body !== null && body !== undefined ? { body } : {}),
                ...(contentType ? { headers: { 'Content-Type': contentType } } : {}),
                signal: controller.signal
            });
            if (binary) {
                const buffer = Buffer.from(await res.arrayBuffer());
                return { status: res.status, ok: res.ok, text: '', buffer };
            }
            return { status: res.status, ok: res.ok, text: await res.text(), buffer: null };
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.error({ device_ip: this.ip, path }, `Intelbras ${method} timeout`);
                throw new Error('Dispositivo indisponível ou rede lenta (Timeout)');
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Obter Snapshot (Buffer JPEG)
     */
    async getSnapshot() {
        try {
            const r = await this._request('GET', '/cgi-bin/snapshot.cgi', {}, null, null, { binary: true });
            if (!r.ok) throw new Error(`Snapshot failed: ${r.status}`);
            return r.buffer;
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Error capturing snapshot');
            throw error;
        }
    }

    /**
     * Faz uma requisição GET autenticada com Digest Auth
     */
    async _get(path, params = {}, { timeoutMs = TIMEOUT_CONFIG.DEVICE_CONNECTION } = {}) {
        logger.debug('Intelbras GET request', { device_ip: this.ip, path, user: this.user, via_agente: !!this.config?.agent_id });
        const r = await this._request('GET', path, params, null, null, { timeoutMs });
        if (!r.ok) {
            // 400 é a resposta normal do firmware para "não encontrado" (ex.: _userExists)
            const log = r.status === 400 ? logger.debug : logger.error;
            log({ device_ip: this.ip, status: r.status, path }, 'Intelbras GET failed');
            throw new Error(`Request failed with status code ${r.status}: ${r.text}`);
        }
        return r.text;
    }

    /**
     * Faz uma requisição POST autenticada com Digest Auth
     */
    async _post(path, params = {}, body, contentType = 'application/octet-stream') {
        logger.debug('Intelbras POST request', { device_ip: this.ip, path, content_type: contentType, via_agente: !!this.config?.agent_id });
        const r = await this._request('POST', path, params, body, contentType, { timeoutMs: TIMEOUT_CONFIG.HARDWARE_CALLBACK });
        if (!r.ok) {
            logger.error({ device_ip: this.ip, status: r.status, path }, 'Intelbras POST failed');
            throw new Error(`Request failed with status code ${r.status}: ${r.text}`);
        }
        return r.text;
    }

    /**
     * Faz uma requisição POST com payload JSON
     */
    async _postJson(path, params = {}, data) {
        return this._post(path, params, JSON.stringify(data), 'application/json');
    }

    /**
     * Verifica se um UserID existe no terminal.
     * O firmware responde 200 + "Users[0]..." quando existe e 400 quando não existe.
     */
    async _userExists(hwUserId) {
        try {
            const text = await this._get('/cgi-bin/AccessUser.cgi', { action: 'list', 'UserIDList[0]': String(hwUserId) });
            return /Users\[0\]\./.test(text) || /"UserID"\s*:\s*"/.test(text);
        } catch (err) {
            if (/status code 400/.test(err.message)) return false;
            throw err;
        }
    }

    async _faceExists(hwUserId) {
        try {
            const text = await this._get('/cgi-bin/AccessFace.cgi', { action: 'list', 'UserIDList[0]': String(hwUserId) });
            return /FaceDataList\[0\]\./.test(text);
        } catch (err) {
            if (/status code 400/.test(err.message)) return false;
            throw err;
        }
    }

    /**
     * Cadastrar/atualizar Usuário e Face no Terminal Intelbras (idempotente).
     * - Usuário existente → updateMulti (não apaga, não fica "fora do ar").
     * - Face existente → tenta atualizar a foto; se o firmware não aceitar, mantém a atual.
     * @param {Object} pessoa Dados da pessoa
     * @param {String} fotoBase64 Foto em base64 (com ou sem prefixo data:image)
     */
    async enrollUser(pessoa, fotoBase64) {
        const safeName = (pessoa?.nome_completo || pessoa?.nome || 'SEM NOME').trim().substring(0, 31);
        try {
            const hwUserId = getHwUserId(pessoa);
            if (!hwUserId) {
                throw new Error('Dados inválidos para cadastro no terminal: pessoa.id e pessoa.cpf ausentes.');
            }

            if (!fotoBase64) {
                logger.warn('Registration attempt without photo', { person_name: safeName, device_ip: this.ip });
            } else if ((fotoBase64.length * 3) / 4 > 200000) {
                logger.warn('Large photo may fail on terminal', { person_name: safeName, size_kb: Math.round((fotoBase64.length * 3) / 4 / 1024) });
            }

            logger.info('Registering person on Intelbras (V2)', { person_name: safeName, hw_user_id: hwUserId, device_ip: this.ip });

            // 1. Usuário com permissão de portas e validade
            const userData = {
                UserList: [{
                    UserID: String(hwUserId),
                    UserName: safeName,
                    UserType: 0,
                    Authority: 0, // 0 = Usuário comum (1 = Admin no firmware Intelbras)
                    Doors: [0, 1], // Porta 1 e Porta 2 liberadas
                    TimeSections: [255, 255], // 255 = Período 24h irrestrito (um por porta)
                    // Firmware novo (ex.: SS 5541 MF W 3.x) usa a permissão por porta abaixo;
                    // sem ela o terminal nega localmente (ErrorCode 18) mesmo com o servidor liberando.
                    // Firmware antigo ignora o campo.
                    MultiTimeSections: [
                        { Door: 0, TimeSections: [255] },
                        { Door: 1, TimeSections: [255] }
                    ],
                    ValidFrom: '2020-01-01 00:00:00',
                    ValidTo: '2037-12-31 23:59:59'
                }]
            };

            const userExists = await this._userExists(hwUserId);
            await this._postJson('/cgi-bin/AccessUser.cgi', { action: userExists ? 'updateMulti' : 'insertMulti' }, userData);
            logger.info(userExists ? 'User updated on device' : 'User registered on device with door permissions', { device_ip: this.ip, hw_user_id: hwUserId });

            if (!fotoBase64) return false; // usuário existe, mas sem face não há reconhecimento

            // 2. Face
            const base64Clean = fotoBase64.replace(/^data:image\/\w+;base64,/, '');

            if (await this._faceExists(hwUserId)) {
                try {
                    await this._postJson('/cgi-bin/AccessFace.cgi', { action: 'updateMulti' }, {
                        FaceList: [{ UserID: String(hwUserId), PhotoData: [base64Clean] }]
                    });
                    logger.info('Face updated on device', { hw_user_id: hwUserId, device_ip: this.ip });
                } catch (updErr) {
                    // Face atual continua válida: não apagar o usuário
                    logger.warn('Face already on device; update not accepted, keeping current face', {
                        hw_user_id: hwUserId, device_ip: this.ip, error_reason: updErr.message
                    });
                }
            } else {
                try {
                    await this._postJson('/cgi-bin/FaceInfoManager.cgi', { action: 'add' }, {
                        UserID: String(hwUserId),
                        Info: { UserName: safeName, PhotoData: [base64Clean] }
                    });
                } catch (addErr) {
                    // Firmwares mais novos usam AccessFace.cgi
                    logger.warn('FaceInfoManager add failed, trying AccessFace insertMulti', {
                        hw_user_id: hwUserId, device_ip: this.ip, error_reason: addErr.message
                    });
                    await this._postJson('/cgi-bin/AccessFace.cgi', { action: 'insertMulti' }, {
                        FaceList: [{ UserID: String(hwUserId), PhotoData: [base64Clean] }]
                    });
                }
                logger.info('Face registered on device', { hw_user_id: hwUserId, device_ip: this.ip });
            }

            logger.info('Person successfully registered on device', { person_name: safeName, device_ip: this.ip });
            return true;

        } catch (error) {
            logger.error('Error registering person', { device_ip: this.ip, person_name: safeName, error_reason: error.message });
            throw error;
        }
    }

    /**
     * Remove TODOS os usuários e faces do terminal (reset antes de ressincronizar).
     */
    async clearAllFaces() {
        await this._get('/cgi-bin/AccessUser.cgi', { action: 'removeAll' });
        try {
            await this._get('/cgi-bin/AccessFace.cgi', { action: 'removeAll' });
        } catch (err) {
            // Em alguns firmwares remover os usuários já remove as faces
            logger.warn('AccessFace removeAll not accepted', { device_ip: this.ip, error_reason: err.message });
        }
        logger.info('All users and faces removed from device', { device_ip: this.ip });
        return true;
    }

    /**
     * Quantidade de usuários cadastrados no terminal.
     */
    async countUsers() {
        const text = await this._get('/cgi-bin/recordFinder.cgi', { action: 'getQuerySize', name: 'AccessControlCard' });
        const match = text.match(/count=(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    /**
     * Remover Usuário do Terminal
     */
    async deleteUser(userId) {
        try {
            // No V2, a remoção de usuários é via GET com UserIDList
            const response = await this._get('/cgi-bin/AccessUser.cgi', {
                action: 'removeMulti',
                'UserIDList[0]': String(userId)
            });
            logger.info('User removed from device', { hw_user_id: userId, device_ip: this.ip });
            return true;
        } catch (error) {
            logger.error({ err: error, hw_user_id: userId, device_ip: this.ip }, 'Failed to remove user');
            return false;
        }
    }

    /**
     * Listar Usuários do Terminal (para depuração de schema)
     */
    async listUsers(userIds = []) {
        try {
            const params = { action: 'list' };
            if (userIds.length > 0) {
                userIds.forEach((id, index) => {
                    params[`UserIDList[${index}]`] = String(id);
                });
            }
            const response = await this._get('/cgi-bin/AccessUser.cgi', params);
            logger.info('Users listed from device', { device_ip: this.ip, user_count: userIds.length });
            return response;
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Failed to list users');
            return null;
        }
    }

    /**
     * Exibir mensagem no display do leitor facial (Se suportado pela OSD)
     * @param {String} text Mensagem (Máx 32 caracteres sugeridos)
     * @param {Number} duration Segundos para exibição (0 = permanente até próximo evento)
     */
    async displayMessage(text, duration = 3) {
        try {
            logger.debug('Displaying message on device', { device_ip: this.ip, message: text, duration_seconds: duration });

            // Dahua/Intelbras VSP (Video Station Protocol)
            // Muitos leitores Bio T aceitam overlay de texto via Log/Eventos
            // ou via este comando de ConfigManager se configurado
            const params = {
                action: 'setConfig',
                'VideoWidget[0].CustomText[0].Text': text,
                'VideoWidget[0].CustomText[0].Enable': 'true'
            };

            // Mensagem é cosmética: não pode segurar o fluxo do acesso por 15 s
            await this._get('/cgi-bin/configManager.cgi', params, { timeoutMs: TIMEOUT_CONFIG.DEVICE_FEEDBACK });

            // Se duracao > 0, agenda a limpeza
            if (duration > 0) {
                setTimeout(async () => {
                    try {
                        await this._get('/cgi-bin/configManager.cgi', {
                            action: 'setConfig',
                            'VideoWidget[0].CustomText[0].Enable': 'false'
                        });
                    } catch (e) {}
                }, duration * 1000);
            }
            return true;
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Failed to display message on device');
            return false;
        }
    }

    /**
     * Feedback Sonoro (Bip)
     */
    async playSound(type = 'success') {
        try {
            // Alguns modelos aceitam trigger de áudio específico
            // 1: Sucesso, 2: Falha
            const channel = type === 'success' ? 1 : 2;
            // Commando genérico para trigger de buzzer se disponível via CGI
            // No Bio T, o próprio evento AccessControl gera som, mas podemos forçar
            logger.debug('Playing sound on device', { device_ip: this.ip, sound_type: type });
            return true;
        } catch (error) {
            return false;
        }
    }

    // Sincroniza o relógio do terminal com a hora do servidor/PC
    async syncDeviceTime() {
        try {
            // Hora local do evento (America/Sao_Paulo), independente do fuso do servidor
            const timeStr = getNowLocal().replace('T', ' ');
            await this._get('/cgi-bin/global.cgi', {
                action: 'setCurrentTime',
                time: timeStr
            });
            logger.info(`⏰ [Intelbras] Relógio sincronizado com o PC: ${timeStr} (${this.ip})`);
            return true;
        } catch (error) {
            logger.warn(`⚠️ [Intelbras] Falha ao sincronizar relógio em ${this.ip}: ${error.message}`);
            return false;
        }
    }

    /**
     * Liga o NTP (fuso de Brasília) e acerta a hora agora.
     * TimeZone=22 é GMT-03:00 (Brasília) na tabela de fusos Intelbras/Dahua.
     */
    async configureClock(ntpServer = process.env.DEVICE_NTP_SERVER || 'pool.ntp.br') {
        try {
            await this._get('/cgi-bin/configManager.cgi', {
                action: 'setConfig',
                'NTP.Enable': 'true',
                'NTP.Address': ntpServer,
                'NTP.Port': '123',
                'NTP.TimeZone': '22',
                'NTP.UpdatePeriod': '10'
            });
            logger.info('NTP configured on device', { device_ip: this.ip, ntp_server: ntpServer });
        } catch (error) {
            logger.warn('Failed to configure NTP on device', { device_ip: this.ip, error_reason: error.message });
        }
        return this.syncDeviceTime();
    }

    // Comando para abrir porta (Pulso)
    async openDoor() {
        try {
            await this._get('/cgi-bin/accessControl.cgi', {
                action: 'openDoor',
                Channel: 1
            }, { timeoutMs: TIMEOUT_CONFIG.DEVICE_FEEDBACK });
            return true;
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Failed to open door');
            return false;
        }
    }

    // Comando para manter porta aberta (Acesso Livre)
    async unlockDoor() {
        try {
            await this._get('/cgi-bin/accessControl.cgi', {
                action: 'unlockDoor',
                Channel: 1
            });
            logger.info('Door unlocked', { device_ip: this.ip, action: 'unlock' });
            return true;
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Failed to unlock door');
            return false;
        }
    }

    // Comando para travar porta (Bloqueio Total)
    async lockDoor() {
        try {
            await this._get('/cgi-bin/accessControl.cgi', {
                action: 'lockDoor',
                Channel: 1
            });
            logger.info('Door locked', { device_ip: this.ip, action: 'lock' });
            return true;
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Failed to lock door');
            return false;
        }
    }

    // Comando para voltar ao estado normal (Porta fechada, abre por validação)
    async closeDoor() {
        try {
            await this._get('/cgi-bin/accessControl.cgi', {
                action: 'closeDoor',
                Channel: 1
            });
            logger.info('Door closed to normal state', { device_ip: this.ip, action: 'close' });
            return true;
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Failed to close door');
            return false;
        }
    }

    /**
     * Configurar HTTP Push de Eventos (V2/V3)
     * Configura o dispositivo para enviar eventos para o servidor
     */
    /**
     * Configura o dispositivo em MODO ONLINE.
     *
     * No modo online o dispositivo detecta a face e pergunta ao servidor
     * se pode liberar. O servidor responde {"auth":"true"/"false"} e o
     * dispositivo controla o relé sozinho — sem necessidade de conexão reversa.
     *
     * Baseado nos parâmetros reais da API Intelbras (config_online_mode):
     *   PictureHttpUpload.*        → endpoint que recebe o evento com foto
     *   Intelbras_ModeCfg.*        → modo online + keepalive
     */
    async configureOnlineMode(serverIp, serverPort = 3001, options = {}) {
        try {
            logger.info('Configuring online mode', { device_ip: this.ip, server_ip: serverIp, server_port: serverPort });

            const token = this.config?.control_token || '';
            const qs    = token ? `?token=${token}` : '';

            const onlinePath   = `/api/intelbras/online${qs}`;
            const keepalivePath = `/api/intelbras/keepalive${qs}`;

            const useHttps = typeof options.useHttps === 'boolean'
                ? options.useHttps
                : Number(serverPort) === 443;

            // 1. Configurar endpoint de eventos com foto (PictureHttpUpload)
            const paramsUpload = {
                action: 'setConfig',
                'PictureHttpUpload.Enable': 'true',
                'PictureHttpUpload.UploadServerList[0].Address': serverIp,
                'PictureHttpUpload.UploadServerList[0].Port': serverPort,
                'PictureHttpUpload.UploadServerList[0].HttpsEnable': useHttps ? 'true' : 'false',
                'PictureHttpUpload.UploadServerList[0].Uploadpath': onlinePath
            };
            const r1 = await this._get('/cgi-bin/configManager.cgi', paramsUpload);
            logger.info('Picture upload configured', { device_ip: this.ip, endpoint: 'PictureHttpUpload' });

            // 2. Configurar modo online + keepalive (Intelbras_ModeCfg)
            const paramsMode = {
                action: 'setConfig',
                'Intelbras_ModeCfg.DeviceMode': '1',               // 0=offline, 1=online
                'Intelbras_ModeCfg.KeepAlive.Enable': 'true',
                'Intelbras_ModeCfg.KeepAlive.Interval': '30',
                'Intelbras_ModeCfg.KeepAlive.Path': keepalivePath,
                'Intelbras_ModeCfg.KeepAlive.TimeOut': '5',
                'Intelbras_ModeCfg.RemoteCheckTimeout': '10'
            };
            const r2 = await this._get('/cgi-bin/configManager.cgi', paramsMode);
            logger.info('Mode configuration applied', { device_ip: this.ip, mode: 'online', keepalive_enabled: true });

            // 3. Relógio: validade dos usuários e horário dos eventos dependem dele
            await this.configureClock();

            return r1.includes('OK') && r2.includes('OK');
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Failed to configure online mode');
            return false;
        }
    }

    /**
     * Configura o dispositivo em MODO PUSH/EVENTO (legado).
     * O dispositivo reconhece localmente e apenas notifica o servidor.
     * Mantido para compatibilidade.
     */
    async configureEventPush(serverIp, serverPort = 3001) {
        try {
            logger.info('Configuring event push mode', { device_ip: this.ip, server_ip: serverIp, server_port: serverPort });

            const pushUrl = this.config?.control_token
                ? `/api/intelbras/events?token=${this.config.control_token}`
                : '/api/intelbras/events';

            const params = {
                action: 'setConfig',
                'HTTPClient.Server[0].Address': serverIp,
                'HTTPClient.Server[0].Port': serverPort,
                'HTTPClient.Server[0].RegisterUrl': pushUrl,
                'HTTPClient.Server[0].EventsUrl': pushUrl,
                'HTTPClient.Server[0].Enable': 'true',
                'HTTPClient.Server[0].Interval': 30,
                'HTTPClient.Enable': 'true'
            };

            const response = await this._get('/cgi-bin/configManager.cgi', params);
            logger.info('Event push configuration applied', { device_ip: this.ip, mode: 'push' });
            return response.includes('OK');
        } catch (error) {
            logger.error({ err: error, device_ip: this.ip }, 'Failed to configure event push');
            return false;
        }
    }
}

module.exports = IntelbrasService;
