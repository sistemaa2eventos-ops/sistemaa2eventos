require('dotenv').config();
const emailService = require('./src/services/emailService');

console.log('Iniciando teste de envio de e-mail (Nodemailer)...');
console.log('Host:', process.env.SMTP_HOST);
console.log('User:', process.env.SMTP_USER);

async function run() {
    try {
        await emailService.sendRegistrationConfirmation(
            process.env.SMTP_USER, // mandando para o próprio email como teste
            'Teste Administrador',
            'A2 Eventos Homologação'
        );
        console.log('Teste concluído.');
    } catch (e) {
        console.error('Erro no teste:', e);
    }
}

run();
