/**
 * ZIP mínimo (método deflate, nomes UTF-8) sem dependências.
 * Usado no registro de encerramento do evento: uma "pasta" com CSVs e um LEIA-ME para baixar de uma vez.
 */
const zlib = require('zlib');

const TABELA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function horaDos(data) {
    const hora = (data.getHours() << 11) | (data.getMinutes() << 5) | Math.floor(data.getSeconds() / 2);
    const dia = ((data.getFullYear() - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate();
    return { hora, dia };
}

/**
 * @param arquivos [{ nome: 'pasta/arquivo.csv', conteudo: string | Buffer }]
 * @returns Buffer com o .zip
 */
function criarZip(arquivos) {
    const partes = [];
    const centrais = [];
    let deslocamento = 0;
    const { hora, dia } = horaDos(new Date());

    for (const arq of arquivos) {
        const nome = Buffer.from(arq.nome, 'utf8');
        const bruto = Buffer.isBuffer(arq.conteudo) ? arq.conteudo : Buffer.from(String(arq.conteudo), 'utf8');
        const comprimido = zlib.deflateRawSync(bruto);
        const crc = crc32(bruto);
        const FLAG_UTF8 = 0x0800;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);          // versão necessária
        local.writeUInt16LE(FLAG_UTF8, 6);
        local.writeUInt16LE(8, 8);           // deflate
        local.writeUInt16LE(hora, 10);
        local.writeUInt16LE(dia, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(comprimido.length, 18);
        local.writeUInt32LE(bruto.length, 22);
        local.writeUInt16LE(nome.length, 26);
        local.writeUInt16LE(0, 28);

        partes.push(local, nome, comprimido);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);        // versão que gerou
        central.writeUInt16LE(20, 6);        // versão necessária
        central.writeUInt16LE(FLAG_UTF8, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(hora, 12);
        central.writeUInt16LE(dia, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(comprimido.length, 20);
        central.writeUInt32LE(bruto.length, 24);
        central.writeUInt16LE(nome.length, 28);
        central.writeUInt32LE(deslocamento, 42);
        centrais.push(central, nome);

        deslocamento += local.length + nome.length + comprimido.length;
    }

    const tamanhoCentral = centrais.reduce((soma, b) => soma + b.length, 0);
    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0);
    fim.writeUInt16LE(arquivos.length, 8);
    fim.writeUInt16LE(arquivos.length, 10);
    fim.writeUInt32LE(tamanhoCentral, 12);
    fim.writeUInt32LE(deslocamento, 16);

    return Buffer.concat([...partes, ...centrais, fim]);
}

module.exports = { criarZip, crc32 };
