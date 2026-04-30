const logger = require('../../../services/logger');
const HikvisionAdapter = require('../hikvision.service');
const IntelbrasAdapter = require('../intelbras.service');

class DeviceFactory {
    /**
     * Instancia o adapter maduro correspondente à marca
     * @param {Object} config O registro do banco de dados (tabela dispositivos_acesso)
     * @returns {import('./AccessDevice')} Instância estritamente tipada
     */
    static getDevice(config) {
        if (!config || !config.ip_address) {
            throw new Error('Configuração de dispositivo inválida: IP ausente.');
        }

        const marca = (config.marca || config.marca_dispositivo || 'hikvision').toLowerCase();

        switch (marca) {
            case 'intelbras':
            case 'dahua': // Compartilham o mesmo chipset e API web
                return new IntelbrasAdapter(config);
            
            case 'hikvision':
            default:
                return new HikvisionAdapter(config);
        }
    }
}

module.exports = DeviceFactory;
