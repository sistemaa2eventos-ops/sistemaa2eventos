const logger = require('../../services/logger');
const FormData = require('form-data');
const AccessDevice = require('./adapters/AccessDevice');
const { TIMEOUT_CONFIG } = require('../../config/timeouts');

class IntelbrasService extends AccessDevice {
    constructor(config) {
        super(config);
        this.ip = config.ip_address;
        this.port = config.porta || 80;
        this.user = config.user_device || config.user || process.env.INTELBRAS_DEFAULT_USER || 'admin';
        this.pass = config.password_device || config.password || process.env.INTELBRAS_DEFAULT_PASS || 'admin123';
        this.baseUrl = `http://${this.ip}:${this.port}`;
        this.digestClient = null;
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
     * Obter Snapshot (Buffer JPEG)
     */
    async getSnapshot() {
        try {
            const url = this.getSnapshotUrl();
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

    /**
     * Faz uma requisição GET autenticada com Digest Auth
     */
    async _get(path, params = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_CONFIG.DEVICE_CONNECTION);

        try {
            const queryString = new URLSearchParams(params).toString();
            const url = `${this.baseUrl}${path}?${queryString}`;
            logger.debug('Intelbras GET request', { device_ip: this.ip, path, user: this.user });

            const client = await this.getDigestClient();
            const res = await client.fetch(url, {
                method: 'GET',
                signal: controller.signal
            });

            const text = await res.text();
            if (!res.ok) {
                logger.error({ device_ip: this.ip, status: res.status }, 'Intelbras GET failed');
                throw new Error(`Request failed with status code ${res.status}: ${text}`);
            }
            return text;
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.error({ device_ip: this.ip, path }, 'Intelbras GET timeout');
                throw new Error('Dispositivo indisponível (Timeout)');
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Faz uma requisição POST autenticada com Digest Auth
     */
    async _post(path, params = {}, body, contentType = 'application/octet-stream') {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_CONFIG.HARDWARE_CALLBACK);

        try {
            const queryString = new URLSearchParams(params).toString();
            const url = `${this.baseUrl}${path}${queryString ? '?' + queryString : ''}`;
            logger.debug('Intelbras POST request', { device_ip: this.ip, path, content_type: contentType });

            const client = await this.getDigestClient();
            const res = await client.fetch(url, {
                method: 'POST',
                body: body,
                headers: { 'Content-Type': contentType },
                signal: controller.signal
            });

            const text = await res.text();
            if (!res.ok) {
                logger.error({ device_ip: this.ip, status: res.status }, 'Intelbras POST failed');
                throw new Error(`Request failed with status code ${res.status}: ${text}`);
            }
            return text;
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.error({ device_ip: this.ip, path }, 'Intelbras POST timeout');
                throw new Error('Dispositivo indisponível ou rede lenta (Timeout)');
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Faz uma requisição POST com payload JSON
     */
    async _postJson(path, params = {}, data) {
        return this._post(path, params, JSON.stringify(data), 'application/json');
    }

    /**
     * Cadastrar Usuário e Face no Terminal Intelbras
     * @param {Object} pessoa Dados do funcionário
     * @param {String} fotoBase64 Foto em base64 (com ou sem prefixo data:image)
     */
    async enrollUser(pessoa, fotoBase64) {
        try {
            if (!pessoa || (!pessoa.cpf && !pessoa.id)) {
                throw new Error('Dados inválidos para cadastro no terminal: pessoa.id e pessoa.cpf ausentes.');
            }

            const safeName = (pessoa.nome_completo || pessoa.nome || 'SEM NOME').trim().substring(0, 31);

            const hwUserId = pessoa.cpf 
                ? pessoa.cpf.replace(/\D/g, '') 
                : (pessoa.id ? pessoa.id.split('-')[0] : 'unknown');

            // Validação de Payload de Foto
            if (fotoBase64) {
                const sizeInBytes = (fotoBase64.length * 3) / 4;
                if (sizeInBytes > 200000) { // > 200KB
                    logger.warn('Large photo may fail on terminal', { person_name: safeName, size_kb: Math.round(sizeInBytes/1024) });
                }
            } else {
                logger.warn('Registration attempt without photo', { person_name: safeName });
            }

            logger.info('Registering person on Intelbras (V2)', { person_name: safeName, hw_user_id: hwUserId, device_ip: this.ip });

            // 1. Criar/Atualizar Usuário (payload mínimo compatível com SS 5541)
            const userData = {
                UserList: [{
                    UserID: String(hwUserId),
                    UserName: safeName,
                    UserType: 'Normal',
                    AuthorizeTimePeriodList: [{ Index: 0, Enable: true }],
                    Valid: {
                        Enable: true,
                        BeginTime: '2000-01-01 00:00:00',
                        EndTime: '2037-12-31 23:59:59'
                    }
                }]
            };

            const addUserResponse = await this._postJson('/cgi-bin/AccessUser.cgi', { action: 'insertMulti' }, userData);
            logger.info('User registered on device', { device_ip: this.ip });

            // 2. Enviar Face via FaceInfoManager.cgi com upsert automático
            const base64Clean = fotoBase64.replace(/^data:image\/\w+;base64,/, '');
            const faceData = {
                UserID: String(hwUserId),
                Info: {
                    UserName: safeName,
                    PhotoData: [base64Clean]
                }
            };

            try {
                const addFaceResponse = await this._postJson('/cgi-bin/FaceInfoManager.cgi', { action: 'add' }, faceData);
                logger.info('Face registered on device', { device_ip: this.ip });

            } catch (faceError) {
                // FaceInfoManager não tem endpoint de update/remove funcional neste firmware.
                // Estratégia: deletar o usuário completo via AccessUser (remove face automaticamente)
                // e depois re-adicionar usuário + face.
                if (faceError.message && faceError.message.includes('PhotoExist')) {
                    logger.warn('Face already registered, recreating user', { person_name: safeName, hw_user_id: hwUserId, device_ip: this.ip });

                    // 1. Deletar usuário inteiro (AccessUser.cgi remove também a face)
                    try {
                        const delUserResponse = await this._get('/cgi-bin/AccessUser.cgi', {
                            action: 'removeMulti',
                            'UserIDList[0]': String(hwUserId)
                        });
                        logger.info('User removed successfully', { hw_user_id: hwUserId, device_ip: this.ip });
                    } catch (delErr) {
                        logger.warn('Failed to remove existing user', { hw_user_id: hwUserId, device_ip: this.ip, error_reason: delErr.message });
                    }

                    // Aguarda o dispositivo processar
                    await new Promise(r => setTimeout(r, 800));

                    // 2. Re-criar o usuário
                    try {
                        const reAddUserResponse = await this._postJson('/cgi-bin/AccessUser.cgi', { action: 'insertMulti' }, userData);
                        logger.info('User recreated successfully', { hw_user_id: hwUserId, device_ip: this.ip });
                    } catch (reUserErr) {
                        logger.warn('Failed to recreate user', { hw_user_id: hwUserId, device_ip: this.ip, error_reason: reUserErr.message });
                    }

                    await new Promise(r => setTimeout(r, 300));

                    // 3. Re-adicionar a face
                    const retryFaceResponse = await this._postJson('/cgi-bin/FaceInfoManager.cgi', { action: 'add' }, faceData);
                    logger.info('Face re-registered successfully', { hw_user_id: hwUserId, device_ip: this.ip });

                } else {
                    throw faceError;
                }
            }

            logger.info('Person successfully registered on device', { person_name: safeName, device_ip: this.ip });
            return true;

        } catch (error) {
            const safeName = (pessoa?.nome_completo || pessoa?.nome || 'SEM NOME');
            const errorMsg = error.message || 'Erro de comunicação desconhecido';
            logger.error({ device_ip: this.ip, person_name: safeName }, 'Error registering person');
            throw error;
        }
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
            logger.info('Displaying message on device', { device_ip: this.ip, message: text, duration_seconds: duration });

            // Dahua/Intelbras VSP (Video Station Protocol)
            // Muitos leitores Bio T aceitam overlay de texto via Log/Eventos
            // ou via este comando de ConfigManager se configurado
            const params = {
                action: 'setConfig',
                'VideoWidget[0].CustomText[0].Text': text,
                'VideoWidget[0].CustomText[0].Enable': 'true'
            };

            await this._get('/cgi-bin/configManager.cgi', params);

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

    // Comando para abrir porta (Pulso)
    async openDoor() {
        try {
            await this._get('/cgi-bin/accessControl.cgi', {
                action: 'openDoor',
                Channel: 1
            });
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
