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
    /**
     * Envia e-mail com os dados para portabilidade (JSON anexado e resumo inline)
     */
    async sendDataPortability(email, nome, data) {
        try {
            const mailOptions = {
                from: `"Nexus Control - LGPD" <${process.env.SMTP_FROM || 'no-reply@a2eventos.com.br'}>`,
                to: email,
                subject: 'Relatório de Portabilidade de Dados (Art. 18 LGPD) 📑',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2 style="color: #00D4FF;">Relatório de Dados Pessoais</h2>
                        <p>Olá, <strong>${nome}</strong>.</p>
                        <p>Em conformidade com o seu direito de portabilidade (Art. 18, V da LGPD), anexamos a este e-mail todos os seus dados pessoais e de tratamento vinculados ao sistema A2 Eventos.</p>
                        <p>O arquivo está em formato JSON para garantir a interoperabilidade entre sistemas.</p>
                        <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;" />
                        <p style="font-size: 11px; color: #888;">Controlador: A2 Eventos | Operador: Nexus Control System</p>
                    </div>
                `,
                attachments: [
                    {
                        filename: `dados_pessoais_${nome.replace(/\s+/g, '_').toLowerCase()}.json`,
                        content: JSON.stringify(data, null, 2)
                    }
                ]
            };

            await this.transporter.sendMail(mailOptions);
            logger.info(`📧 [LGPD] E-mail de portabilidade enviado para ${email}`);
        } catch (error) {
            logger.error(`❌ [LGPD] Falha ao enviar e-mail de portabilidade:`, error);
        }
    }

    /**
     * Confirmação de pedido de exclusão/anonimização
     */
    async sendForgetMeConfirmation(email, nome) {
        try {
            const mailOptions = {
                from: `"Nexus Control - LGPD" <${process.env.SMTP_FROM || 'no-reply@a2eventos.com.br'}>`,
                to: email,
                subject: 'Confirmação de Direito ao Esquecimento 🔒',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2 style="color: #FF1744;">Dados Anonimizados com Sucesso</h2>
                        <p>Olá, <strong>${nome}</strong>.</p>
                        <p>Confirmamos que o seu pedido de exclusão de dados foi processado. Seus dados pessoais foram anonimizados irreversivelmente ou excluídos de nossa base de produção.</p>
                        <p>Mantemos apenas os logs técnicos de auditoria exigidos por lei para comprovação da operação, sem possibilidade de re-identificação.</p>
                    </div>
                `
            };
            await this.transporter.sendMail(mailOptions);
        } catch (error) {
        }
    }

    /**
     * Envia o Relatório Diário Operacional para os administradores
     */
    async sendDailyReport(email, eventoNome, data, workbookBuffer) {
        try {
            const mailOptions = {
                from: `"Nexus Analytics" <${process.env.SMTP_FROM || 'no-reply@a2eventos.com.br'}>`,
                to: email,
                subject: `Relatório Diário - ${eventoNome} - ${data} 📊`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2 style="color: #1A237E;">Nexus Control - Relatório Diário Operacional</h2>
                        <p>Olá,</p>
                        <p>Segue em anexo o relatório operacional consolidado do evento <strong>${eventoNome}</strong> referente ao dia <strong>${data}</strong>.</p>
                        <p>Este relatório contém o detalhamento de horas trabalhadas agrupado por empresa.</p>
                        <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;" />
                        <p style="font-size: 11px; color: #888;">Gerado automaticamente pelo Sistema Nexus Analytics - A2 Eventos.</p>
                    </div>
                `,
                attachments: [
                    {
                        filename: `Relatorio_Diario_${eventoNome.replace(/\s+/g, '_')}_${data}.xlsx`,
                        content: workbookBuffer
                    }
                ]
            };
            await this.transporter.sendMail(mailOptions);
            logger.info(`📧 [Cron] Relatório diário enviado para ${email}`);
        } catch (error) {
            logger.error(`❌ [Cron] Falha ao enviar relatório diário para ${email}:`, error);
        }
    }

    /**
     * Envia convite corporativo unificado para Empresa (B2B)
     */
    async sendCompanyInvite(email, nomeEmpresa, link) {
        try {
            const mailOptions = {
                from: `"Nexus Control - Cadastro B2B" <${process.env.SMTP_FROM || 'no-reply@a2eventos.com.br'}>`,
                to: email,
                subject: `Portal de Credenciamento - ${nomeEmpresa} 🏢`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <div style="background: #050B18; padding: 30px; text-align: center;">
                            <h1 style="color: #00D4FF; margin: 0; font-size: 24px; letter-spacing: 2px;">NEXUS CONTROL</h1>
                        </div>
                        <div style="padding: 40px; color: #333; line-height: 1.6;">
                            <h2 style="color: #050B18;">Olá, ${nomeEmpresa}!</h2>
                            <p>Sua empresa foi cadastrada com sucesso para atuar no evento.</p>
                            <p>Para iniciar o credenciamento de acesso da sua equipe, você deve utilizar o link exclusivo abaixo. <strong>Atenção:</strong> Você pode preencher o cadastro pela sua equipe ou compartilhar este link diretamente com eles para que preencham seus próprios dados.</p>
                            
                            <div style="text-align: center; margin: 35px 0;">
                                <a href="${link}" style="background: linear-gradient(135deg, #00D4FF 0%, #094798 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">ACESSAR PORTAL DE INSCRIÇÕES</a>
                            </div>

                            <p style="font-size: 14px; color: #666;"><strong>Dica:</strong> Através do mesmo link fornecido acima, você poderá acompanhar o status de aprovação de todos os colaboradores já cadastrados pela sua empresa.</p>
                            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                            <p style="font-size: 12px; color: #999; text-align: center;">Suporte Técnico: suporte@nzt.app.br<br>© 2026 A2 Eventos - Sistema Soberano de Acesso</p>
                        </div>
                    </div>
                `
            };
            await this.transporter.sendMail(mailOptions);
            logger.info(`📧 [Invite] Convite de empresa enviado para ${email}`);
        } catch (error) {
            logger.error(`❌ [Invite] Erro ao enviar convite de empresa para ${email}:`, error);
        }
    }

    /**
     * Envia convite de pré-cadastro para o Colaborador
     */
    async sendEmployeeInvite(email, nomePessoa, nomeEmpresa, link) {
        try {
            const mailOptions = {
                from: `"Nexus Control - ${nomeEmpresa}" <${process.env.SMTP_FROM || 'no-reply@a2eventos.com.br'}>`,
                to: email,
                subject: `Convite de Credenciamento - ${nomeEmpresa} 🪪`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
                        <div style="background: #050B18; padding: 30px; text-align: center;">
                            <h1 style="color: #00D4FF; margin: 0; font-size: 20px;">CREDENCIAMENTO BIOMÉTRICO</h1>
                        </div>
                        <div style="padding: 40px; color: #333; line-height: 1.6;">
                            <p>Olá, <strong>${nomePessoa}</strong>.</p>
                            <p>A empresa <strong>${nomeEmpresa}</strong> solicitou o seu credenciamento para trabalhar no evento.</p>
                            <p>Para concluir o seu registro e liberar seu acesso facial nos terminais, clique no botão abaixo para preencher os dados restantes e anexar sua foto e documentos:</p>
                            
                            <div style="text-align: center; margin: 35px 0;">
                                <a href="${link}" style="background: #00D4FF; color: #050B18; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">COMPLETAR MEU CADASTRO</a>
                            </div>

                            <p style="font-size: 13px; color: #777;"><em>Importante: Sem a conclusão deste cadastro e o upload da foto, seu acesso aos recintos do evento será bloqueado.</em></p>
                        </div>
                        <div style="background: #f9f9f9; padding: 20px; text-align: center; font-size: 11px; color: #999;">
                            Plataforma Operada por A2 Eventos | Nexus Control
                        </div>
                    </div>
                `
            };
            await this.transporter.sendMail(mailOptions);
            logger.info(`📧 [Invite] Convite de colaborador enviado para ${email}`);
        } catch (error) {
            logger.error(`❌ [Invite] Erro ao enviar convite de colaborador para ${email}:`, error);
        }
    }

    /**
     * Notificação de Aprovação de Cadastro (Enviado para a Empresa)
     */
    async sendApprovalNotification(email, nomePessoa, nomeEmpresa, qrCode = null) {
        try {
            // Gerar QR code inline se não fornecido
            let qrImageHtml = '';
            if (qrCode) {
                qrImageHtml = `
                    <div style="text-align: center; margin: 30px 0;">
                        <p style="font-size: 14px; margin-bottom: 10px;"><strong>QR Code de Acesso:</strong></p>
                        <div style="display: inline-block; padding: 15px; background: white; border-radius: 8px;">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}" alt="QR Code" style="width: 200px; height: 200px;"/>
                        </div>
                        <p style="font-size: 12px; margin-top: 10px; color: #666;">Código: ${qrCode}</p>
                    </div>
                `;
            }

            const mailOptions = {
                from: `"A2 Eventos - Credenciamento" <${process.env.SMTP_FROM || 'no-reply@a2eventos.com.br'}>`,
                to: email,
                subject: `Credenciamento Aprovado: ${nomePessoa}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #eee; border-radius: 12px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <div style="font-size: 60px; margin-bottom: 20px;">✅</div>
                            <h2 style="color: #2E7D32; margin: 0;">Credenciamento Aprovado!</h2>
                        </div>
                        <p>Olá, <strong>${nomeEmpresa}</strong>.</p>
                        <p>O credenciamento de <strong>${nomePessoa}</strong> foi <strong>APROVADO</strong> e já está liberado para acesso.</p>
                        
                        ${qrImageHtml}

                        <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin: 30px 0; border: 1px solid #dcfce7; color: #166534; font-size: 14px;">
                            <strong>Instruções:</strong><br>
                            • Apresente o QR Code na entrada ou use biometria facial<br>
                            • O acesso está liberado para as datas definidas no cadastro
                        </div>

                        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                        <p style="font-size: 11px; color: #999; text-align: center;">A2 Eventos - Sistema de Credenciamento<br>© 2026</p>
                    </div>
                `
            };
            await this.transporter.sendMail(mailOptions);
            logger.info(`📧 [Approval] Notificação enviada para a empresa ${nomeEmpresa} (${email})`);
        } catch (error) {
             logger.error(`❌ [Approval] Erro ao enviar notificação de aprovação para ${email}:`, error);
        }
    }

    /**
     * Envia convite de acesso ao painel administrativo para novo operador
     * @param {string} email Email do operador
     * @param {string} nomeOperador Nome completo do operador
     * @param {string} link Link de ativação/reset-password
     */
    async sendOperatorInvite(email, nomeOperador, link) {
        try {
            const mailOptions = {
                from: `"A2 Eventos - Painel Admin" <${process.env.SMTP_USER || 'no-reply@a2eventos.com.br'}>`,
                to: email,
                subject: `Você foi convidado para acessar o Painel A2 Eventos`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
                        <div style="background: #050B18; padding: 30px; text-align: center;">
                            <h1 style="color: #00D4FF; margin: 0; font-size: 22px; letter-spacing: 2px;">A2 EVENTOS</h1>
                            <p style="color: #8899BB; margin: 8px 0 0;">Painel Administrativo</p>
                        </div>
                        <div style="padding: 40px; color: #333; line-height: 1.6;">
                            <p>Olá, <strong>${nomeOperador}</strong>.</p>
                            <p>Você foi cadastrado como operador no sistema A2 Eventos. Para ativar seu acesso e definir sua senha, clique no botão abaixo:</p>
                            <div style="text-align: center; margin: 35px 0;">
                                <a href="${link}" style="background: linear-gradient(135deg, #00D4FF 0%, #094798 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">ATIVAR MINHA CONTA</a>
                            </div>
                            <p style="font-size: 13px; color: #777;"><em>Este link expira em 24 horas. Caso não reconheça este convite, ignore este e-mail.</em></p>
                        </div>
                        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 11px; color: #999;">
                            © 2026 A2 Eventos | suporte@nzt.app.br
                        </div>
                    </div>
                `
            };
            await this.transporter.sendMail(mailOptions);
            logger.info(`📧 [Operator Invite] Convite enviado para: ${email}`);
        } catch (error) {
            logger.error(`❌ [Operator Invite] Erro ao enviar convite de operador para ${email}:`, error.message);
            throw error;
        }
    }

}

module.exports = new EmailService();
