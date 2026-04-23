/**
 * Modelo de Dispositivo de Acesso
 * Representa uma catraca, câmera, terminal facial ou impressora
 *
 * Projetado para cenários de alta carga (10.000+ acessos simultâneos):
 *  - Heartbeat timeout configurável por tipo de dispositivo
 *  - Validação rigorosa de IP e porta por protocolo
 *  - Serialização leve (sem cópias desnecessárias no hot path)
 */
class Dispositivo {
    constructor(data = {}) {
        this.id = data.id || null;
        this.evento_id = data.evento_id || null;
        this.nome = data.nome || '';
        this.tipo = data.tipo || 'terminal_facial';
        this.marca = data.marca || '';
        this.modelo = data.modelo || '';
        this.ip_address = data.ip_address || '';
        this.rtsp_url = data.rtsp_url || '';
        this.porta = data.porta ?? Dispositivo.DEFAULT_PORT[data.tipo] ?? 80;
        this.status = data.status || 'offline';
        this.status_online = data.status_online || 'offline';
        this.config = data.config || {};
        this.ultimo_heartbeat = data.ultimo_heartbeat || null;
        this.ultimo_ping = data.ultimo_ping || null;
        this.user_device = data.user_device || '';
        this.modo = data.modo || 'ambos';
        this.area_nome = data.area_nome || '';
        this.offline_mode = data.offline_mode || 'fail_closed';
        this.control_token = data.control_token || null;
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
    }

    // Tipos de dispositivo válidos (alinhado com frontend e controllers)
    static get TIPOS() {
        return ['terminal_facial', 'camera', 'catraca', 'impressora'];
    }

    // Portas padrão por tipo de dispositivo
    static get DEFAULT_PORT() {
        return {
            terminal_facial: 80,
            camera: 554,      // RTSP
            catraca: 80,
            impressora: 9100   // RAW print
        };
    }

    // Timeout de heartbeat em segundos por tipo (catracas e terminais precisam de resposta rápida)
    static get HEARTBEAT_TIMEOUT() {
        return {
            terminal_facial: 45,  // 45s — alta frequência em evento ao vivo
            camera: 120,          // 2min — câmeras são mais tolerantes
            catraca: 30,          // 30s — acesso físico é crítico
            impressora: 300       // 5min — baixa prioridade
        };
    }

    // Validar tipo
    isValidTipo() {
        return Dispositivo.TIPOS.includes(this.tipo);
    }

    // Validar IP (IPv4)
    isValidIP() {
        if (!this.ip_address) return true;

        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipPattern.test(this.ip_address)) return false;

        const parts = this.ip_address.split('.');
        return parts.every(part => {
            const num = parseInt(part, 10);
            return num >= 0 && num <= 255;
        });
    }

    // Validar porta
    isValidPort() {
        const p = Number(this.porta);
        return Number.isInteger(p) && p >= 1 && p <= 65535;
    }

    // Verificar se está online (com timeout dinâmico por tipo de dispositivo)
    isOnline() {
        const heartbeat = this.ultimo_heartbeat || this.ultimo_ping;
        if (!heartbeat) return false;

        const agora = Date.now();
        const diff = (agora - new Date(heartbeat).getTime()) / 1000;
        const timeout = Dispositivo.HEARTBEAT_TIMEOUT[this.tipo] || 60;
        return diff < timeout;
    }

    // Obter status atualizado (prioriza status_online do banco, fallback para cálculo)
    getStatusAtual() {
        if (this.status_online === 'online') return 'online';
        if (this.status === 'offline' && this.status_online === 'offline') return 'offline';
        return this.isOnline() ? 'online' : 'offline';
    }

    // Obter URL completa para acesso HTTP
    getBaseURL() {
        if (!this.ip_address) return null;
        return `http://${this.ip_address}:${this.porta}`;
    }

    // Obter URL do stream RTSP (porta correta por tipo)
    getStreamURL() {
        if (this.rtsp_url) return this.rtsp_url;
        if (!this.ip_address) return null;

        if (this.tipo === 'terminal_facial' || this.tipo === 'camera') {
            const rtspPort = this.tipo === 'camera' ? (this.porta || 554) : 554;
            return `rtsp://${this.ip_address}:${rtspPort}/stream`;
        }
        return null;
    }

    // Converter para JSON (hot path — mantido leve para serialização em massa)
    toJSON() {
        return {
            id: this.id,
            evento_id: this.evento_id,
            nome: this.nome,
            tipo: this.tipo,
            marca: this.marca,
            modelo: this.modelo,
            ip_address: this.ip_address,
            rtsp_url: this.getStreamURL(),
            porta: this.porta,
            status: this.getStatusAtual(),
            status_online: this.status_online,
            config: this.config,
            modo: this.modo,
            area_nome: this.area_nome,
            offline_mode: this.offline_mode,
            ultimo_heartbeat: this.ultimo_heartbeat,
            ultimo_ping: this.ultimo_ping,
            is_online: this.isOnline(),
            base_url: this.getBaseURL(),
            control_token: this.control_token,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    // Validação completa antes de persistir
    validate() {
        const errors = [];
        if (!this.nome) errors.push('Nome é obrigatório');
        if (!this.isValidTipo()) errors.push(`Tipo inválido: ${this.tipo}. Permitidos: ${Dispositivo.TIPOS.join(', ')}`);
        if (this.ip_address && !this.isValidIP()) errors.push(`IP inválido: ${this.ip_address}`);
        if (this.porta && !this.isValidPort()) errors.push(`Porta inválida: ${this.porta}`);
        return { valid: errors.length === 0, errors };
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
            marca: row.marca,
            modelo: row.modelo,
            ip_address: row.ip_address,
            rtsp_url: row.rtsp_url,
            porta: row.porta,
            status: row.status,
            status_online: row.status_online,
            config: config,
            modo: row.modo,
            area_nome: row.area_nome,
            offline_mode: row.offline_mode,
            control_token: row.control_token,
            ultimo_heartbeat: row.ultimo_heartbeat,
            ultimo_ping: row.ultimo_ping,
            user_device: row.user_device,
            created_at: row.created_at,
            updated_at: row.updated_at
        });
    }
}

module.exports = Dispositivo;
