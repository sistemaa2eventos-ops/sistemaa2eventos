const net = require('net');

/**
 * Testa a conexão TCP em um endereço IP e porta específicos com um timeout limite.
 * @param {string} ipAddress - Endereço IP do dispositivo
 * @param {number} port - Porta TCP
 * @param {number} timeoutMs - Tempo limite em milissegundos
 * @returns {Promise<boolean>} Retorna true se a conexão for bem sucedida
 */
const testTcpConnection = (ipAddress, port = 80, timeoutMs = 5000) => {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let finished = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                client.destroy();
                reject(new Error('Timeout: O dispositivo não respondeu no tempo limite.'));
            }
        }, timeoutMs);

        client.connect(port, ipAddress, () => {
            finished = true;
            clearTimeout(timer);
            client.destroy();
            resolve(true);
        });

        client.on('error', (err) => {
            if (!finished) {
                finished = true;
                clearTimeout(timer);
                client.destroy();
                reject(new Error(`Falha na conexão: ${err.message}`));
            }
        });
    });
};

module.exports = {
    testTcpConnection
};
