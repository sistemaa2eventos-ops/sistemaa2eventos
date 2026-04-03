const nodemailer = require('nodemailer');
const logger = require('./logger');

class EmailService {
    constructor() {
        // Configuração genérica de SMTP (ex: Resend, SendGrid, Amazon SES, Ethereal)
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.ethereal.email',
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER || 'demo',
                pass: process.env.SMTP_PASS || 'demo'
            }
        });
    }

    /**
     * Envia e-mail de confirmação de recebimento de cadastro.
     * @param {string} email Email do destinatário
     * @param {string} nome Nome do participante
     * @param {string} empresaNome Nome da empresa associada
     */
    async sendRegistrationConfirmation(email, nome, empresaNome) {
        if (!email) {
            logger.warn(`[EmailService] E-mail não fornecido para ${nome}, abortando envio.`);
            return;
        }

        try {
            const mailOptions = {
                from: `"Nexus Control - A2 Eventos" <${process.env.SMTP_FROM || 'no-reply@a2eventos.com.br'}>`,
                to: email,
                subject: 'Confirmação de Solicitação de Credenciamento ✔',
                html: `
                    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
                        <h2 style="color: #00D4FF; background-color: #050B18; padding: 15px; border-radius: 8px;">A2 Eventos - Nexus Control</h2>
                        <p>Olá, <strong>${nome}</strong>!</p>
                        <p>Sua solicitação de credenciamento para atuar junto à <strong>${empresaNome}</strong> foi recebida com sucesso em nossa base de dados.</p>
                        <p>Seus dados biométricos e documentais estão sendo validados por nossa inteligência artificial e em breve sua credencial estará pronta para uso nos terminais de acesso facial.</p>
                        <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;" />
                        <p style="font-size: 12px; color: #888;">Esta é uma mensagem automática gerada pelo sistema de acesso A2 Eventos. Não é necessário responder.</p>
                    </div>
                `
            };

            const info = await this.transporter.sendMail(mailOptions);
            logger.info(`📧 [EmailService] E-mail enviado para ${email} (MessageId: ${info.messageId})`);
        } catch (error) {
            logger.error(`❌ [EmailService] Falha ao enviar e-mail para ${email}:`, error);
        }
    }
}

module.exports = new EmailService();
