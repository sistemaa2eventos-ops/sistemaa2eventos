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
    
    /** Aciona o rele 1 para abrir a porta */
    async openDoor() { throw new Error('Método openDoor() precisa ser implementado.'); }

    /** Lista ids salvos localmente (Pode retornar null se não suportado) */
    async listUsers(userIds = []) { return null; }

    /** Configura os webhooks de evento do hardware apontando pro servidor */
    async configureEventPush(serverIp, serverPort) { return true; }
}

module.exports = AccessDevice;
