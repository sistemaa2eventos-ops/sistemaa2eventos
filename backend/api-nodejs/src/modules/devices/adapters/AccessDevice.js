/**
 * Interface abstrata para dispositivos de acesso (Catracas, Terminais Faciais)
 * Pattern: Ports and Adapters
 */
class AccessDevice {
    constructor(config) {
        if (new.target === AccessDevice) {
            throw new TypeError("Não é possível instanciar classe abstrata AccessDevice direamente.");
        }
        this.config = config;
        this.ip = config.ip_address;
        this.porta = config.porta || 80;
    }

    /** Obtém buffer jpeg da câmera */
    async getSnapshot() { throw new Error('Método getSnapshot() precisa ser implementado.'); }
    
    /** Cadastra ou atualiza pessoa no hardware */
    async enrollUser(pessoa, fotoBase64) { throw new Error('Método enrollUser() precisa ser implementado.'); }
    
    /** Remove pessoa do hardware */
    async deleteUser(userId) { throw new Error('Método deleteUser() precisa ser implementado.'); }

    /**
     * Suspende a pessoa no hardware: o rosto continua cadastrado, mas o leitor nega (validade vencida).
     * Usado para bloqueado/expulso, que pode ser desbloqueado a qualquer momento com motivo.
     * Equipamento sem suporte: o sistema remove a pessoa do leitor (mais seguro).
     */
    async suspendUser(pessoa) { throw new Error('Método suspendUser() não suportado por este equipamento.'); }
    
    /** Aciona o rele 1 para abrir a porta */
    async openDoor() { throw new Error('Método openDoor() precisa ser implementado.'); }

    /** Lista ids salvos localmente (Pode retornar null se não suportado) */
    async listUsers(userIds = []) { return null; }

    /** Configura os webhooks de evento do hardware apontando pro servidor */
    async configureEventPush(serverIp, serverPort) { return true; }
}

module.exports = AccessDevice;
