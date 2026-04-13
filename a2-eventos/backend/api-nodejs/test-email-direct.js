require('dotenv').config({ path: './.env' });
const nodemailer = require('nodemailer');

console.log('--- TESTE DE EMAIL (INÍCIO) ---');
console.log('Host:', process.env.SMTP_HOST);
console.log('User:', process.env.SMTP_USER);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function run() {
    try {
        console.log('Enviando e-mail de teste para o administrador...');
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM,
            to: process.env.SMTP_USER, // Envia para si mesmo para testar
            subject: 'Teste de Conexão NZT 🚀',
            text: 'Se você recebeu isso, o SMTP do NZT está funcionando corretamente!'
        });
        console.log('✅ SUCESSO! MessageId:', info.messageId);
    } catch (error) {
        console.error('❌ FALHA NO SMTP:', error);
    }
}

run();
