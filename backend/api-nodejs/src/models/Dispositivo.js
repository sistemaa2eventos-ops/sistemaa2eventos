/**
 * Modelo de Dispositivo de Acesso
 * Representa uma catraca, câmera ou terminal
 */
class Dispositivo {
    constructor(data = {}) {
        this.id = data.id || null;
        this.evento_id = data.evento_id || null;
        this.nome = data.nome || '';
        this.tipo = data.tipo || 'catraca';
        this.modelo = data.modelo || '';
        this.ip_address = data.ip_address || '';
        this.rtsp_url = data.rtsp_url || '';
        this.porta = data.porta || 80;
        this.status = data.status || 'offline';
        this.config = data.config || {};
        this.ultimo_heartbeat = data.ultimo_heartbeat || null;
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
    }

    // Tipos de dispositivo válidos
    static get TIPOS() {
        return ['catraca', 'terminal_facial', 'totem'];
    }

    // Validar IP
    isValidIP() {
        if (!this.ip_address) return true;

        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipPattern.test(this.ip_address)) return false;

        const parts = this.ip_address.split('.');
        return parts.every(part => parseInt(part) >= 0 && parseInt(part) <= 255);
    }

    // Verificar se está online
    isOnline() {
        if (!this.ultimo_heartbeat) return false;

        const agora = new Date();
        const diff = (agora - new Date(this.ultimo_heartbeat)) / 1000; // segundos
        return diff < 60; // online se heartbeat nos últimos 60 segundos
    }

    // Obter status atualizado
    getStatusAtual() {
        if (this.status === 'offline') return 'offline';
        return this.isOnline() ? 'online' : 'offline';
    }

    // Obter URL completa para acesso
    getBaseURL() {
        if (!this.ip_address) return null;
        return `http://${this.ip_address}:${this.porta}`;
    }

    // Obter URL do stream RTSP
    getStreamURL() {
        if (this.rtsp_url) return this.rtsp_url;
        if (this.ip_address && this.tipo === 'terminal_facial') {
            return `rtsp://${this.ip_address}:${this.porta || 554}/stream`;
        }
        return null;
    }

    // Converter para JSON
    toJSON() {
        return {
            id: this.id,
            evento_id: this.evento_id,
            nome: this.nome,
            tipo: this.tipo,
            modelo: this.modelo,
            ip_address: this.ip_address,
            rtsp_url: this.getStreamURL(),
            porta: this.porta,
            status: this.getStatusAtual(),
            status_original: this.status,
            config: this.config,
            ultimo_heartbeat: this.ultimo_heartbeat,
            is_online: this.isOnline(),
            base_url: this.getBaseURL(),
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    // Criar a partir do banco
    static fromDatabase(row) {
        if (!row) return null;

        let config = row.config;
        if (typeof config === 'string') {
            try {
                config = JSON.parse(config);
            } catch {
                config = {};
            }
        }

        return new Dispositivo({
            id: row.id,
            evento_id: row.evento_id,
            nome: row.nome,
            tipo: row.tipo,
            modelo: row.modelo,
            ip_address: row.ip_address,
            rtsp_url: row.rtsp_url,
            porta: row.porta,
            status: row.status,
            config: config,
            ultimo_heartbeat: row.ultimo_heartbeat,
            created_at: row.created_at,
            updated_at: row.updated_at
        });
    }
}

module.exports = Dispositivo;