const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const axios = require('axios');
const emailService = require('../../services/emailService');
const websocketService = require('../../services/websocketService');

const CACHE_CPF_MS = 30000;

class WatchlistService {
    constructor() {
        // Map em memória para trava anti-looping: chave `${evento_id}_${cpfLimpo}`
        this.alvosEmRastreamento = new Map();
        // Consulta da watchlist por CPF: a IA reconhece a mesma pessoa várias vezes por minuto
        this.cacheCpf = new Map(); // cpfLimpo → { item, ate }
    }

    /**
     * Rastreamento esquecido (alerta dispensado sem "Concluir") expira sozinho após o prazo do painel
     * (Configurações > IA facial): antes aquela pessoa nunca mais alertava até reiniciar o servidor.
     */
    _expirado(registro) {
        const minutos = require('./iaConfig.service').atual().painel.rastreamento_expira_min;
        return Date.now() - new Date(registro.hora_inicio).getTime() > minutos * 60000;
    }

    /**
     * Verifica se o alvo já possui um alerta emitido e ativo (aguardando interceptação)
     */
    isAlertaAtivo(evento_id, cpf) {
        if (!cpf || !evento_id) return false;
        const cpfLimpo = String(cpf).replace(/\D/g, '');
        const chave = `${evento_id}_${cpfLimpo}`;
        const ativo = this.alvosEmRastreamento.get(chave);
        if (!ativo) return false;
        if (this._expirado(ativo)) {
            this.alvosEmRastreamento.delete(chave);
            return false;
        }

        if (ativo.status === 'em_rastreamento') {
            ativo.ultima_leitura = new Date();
            return true;
        }
        return false;
    }

    /**
     * Conclui o rastreamento do alvo (quando a equipe de segurança localiza/aborda a pessoa)
     */
    concluirRastreamento(evento_id, cpf, operador_nome = 'Operador de Segurança') {
        if (!cpf || !evento_id) return false;
        const cpfLimpo = String(cpf).replace(/\D/g, '');
        const chave = `${evento_id}_${cpfLimpo}`;
        const registro = this.alvosEmRastreamento.get(chave);

        if (registro) {
            registro.status = 'localizado';
            registro.concluido_em = new Date();
            registro.concluido_por = operador_nome;
            this.alvosEmRastreamento.delete(chave);
            logger.info(`✅ [Watchlist Lock] Rastreamento concluído para CPF ${cpfLimpo} por ${operador_nome}`);
        } else {
            this.alvosEmRastreamento.delete(chave);
        }
        return true;
    }

    /**
     * Parsear CSV e Upsert de CPFs na Watchlist (com bloqueio global)
     */
    async uploadCSV(evento_id, buffer) {
        try {
            // Remove BOM UTF-8 se presente
            let texto = buffer.toString('utf-8');
            if (texto.charCodeAt(0) === 0xFEFF) {
                texto = texto.slice(1);
            }

            const linhas = texto
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => l.length > 0);

            if (linhas.length <= 1) return { error: 'Arquivo CSV vazio ou contendo apenas cabeçalho' };

            // Detectar delimitador (vírgula ou ponto-e-vírgula padrão Excel BR)
            const primeiraLinha = linhas[0];
            const separador = (primeiraLinha.match(/;/g) || []).length > (primeiraLinha.match(/,/g) || []).length ? ';' : ',';

            // Pular linha 0 se for cabeçalho
            const linhasDados = linhas.slice(1);

            const registros = [];
            const cpfsParaBloquear = [];

            for (const linha of linhasDados) {
                // Dividir colunas respeitando delimitador e limpando aspas
                const cols = linha.split(separador).map(c => c.replace(/^["']|["']$/g, '').trim());
                const cpfOriginal = cols[0] || '';
                const cpfLimpo = cpfOriginal.replace(/\D/g, '');

                if (cpfLimpo.length >= 11) {
                    const nome = cols[1] || 'Alvo Monitorado / Bloqueado';
                    const motivo = cols[2] || 'Bloqueio de Segurança / Watchlist';
                    const nivel = (cols[3] || 'alto').toLowerCase();

                    registros.push({
                        evento_id,
                        cpf: cpfLimpo,
                        nome,
                        motivo,
                        nivel_alerta: ['critico', 'alto', 'medio', 'baixo'].includes(nivel) ? nivel : 'alto',
                        ativo: true
                    });
                    cpfsParaBloquear.push({ cpf: cpfLimpo, motivo });
                }
            }

            if (registros.length === 0) return { error: 'Nenhum CPF válido (11 dígitos) encontrado no CSV' };

            // 1. Upsert na tabela watchlist
            const { data, error } = await supabase
                .from('watchlist')
                .upsert(registros, { onConflict: 'evento_id,cpf' });

            if (error) throw error;
            this.cacheCpf.clear();

            // 2. SIGILO OPERACIONAL: Alvos monitorados na Watchlist NÃO são bloqueados na tabela pessoas
            // para permitir rastreamento sigiloso sem alertar o indivíduo nos leitores/catracas.
            logger.info(`🔍 [Watchlist Upload] ${registros.length} alvos cadastrados para monitoramento sigiloso.`);

            return { success: true, importados: registros.length };
        } catch (error) {
            logger.error('Erro no upload de CSV da watchlist:', error);
            return { error: error.message };
        }
    }

    /**
     * Verifica se um CPF está bloqueado na Watchlist (BLOQUEIO GLOBAL EM TODOS OS EVENTOS)
     */
    async verificarCPF(cpf, evento_id) {
        if (!cpf) return null;
        const cpfLimpo = String(cpf).replace(/\D/g, '');
        const emCache = this.cacheCpf.get(cpfLimpo);
        if (emCache && Date.now() < emCache.ate) return emCache.item;

        try {
            // Regra Global: Procura por qualquer CPF ativo na Watchlist em qualquer evento
            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('cpf', cpfLimpo)
                .eq('ativo', true)
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;
            const item = (data && data.length > 0) ? data[0] : null;
            if (this.cacheCpf.size > 5000) this.cacheCpf.clear();
            this.cacheCpf.set(cpfLimpo, { item, ate: Date.now() + CACHE_CPF_MS });
            return item;
        } catch (error) {
            logger.error(`Erro ao verificar CPF ${cpfLimpo} na watchlist:`, error);
            return null;
        }
    }

    /**
     * Registra alerta e notifica contatos (Telegram, WhatsApp, E-mail e Administradores Master)
     * DISPARA APENAS UMA VEZ POR ALVO PARA EVITAR LOOPING INFINITO
     */
    async registrarAlerta(watchlistItem, contexto) {
        try {
            const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const cpfLimpo = String(watchlistItem.cpf || contexto.cpf || '').replace(/\D/g, '');
            const chave = `${contexto.evento_id}_${cpfLimpo}`;

            // ── TRAVA ANTI-LOOPING ────────────────────────────────────────────────────────
            // Se este alvo já foi identificado e está em rastreamento ativo, NÃO reemitir!
            if (this.alvosEmRastreamento.has(chave)) {
                const existente = this.alvosEmRastreamento.get(chave);
                if (existente && this._expirado(existente)) this.alvosEmRastreamento.delete(chave);
                else if (existente && existente.status === 'em_rastreamento') {
                    existente.ultima_leitura = new Date();
                    return { success: true, duplicado: true, status: 'em_rastreamento', alerta_id: existente.alertaId };
                }
            }

            // Registrar imediatamente no Map como ativo para travar requisições concorrentes
            const itemRastreamento = {
                alertaId: null,
                evento_id: contexto.evento_id,
                cpf: cpfLimpo,
                nome: contexto.nome || watchlistItem.nome,
                status: 'em_rastreamento',
                camera_nome: contexto.area || 'Câmera IP',
                hora_inicio: new Date(),
                ultima_leitura: new Date()
            };
            this.alvosEmRastreamento.set(chave, itemRastreamento);

            // 1. Salvar histórico de alerta no banco
            let alertaId = null;
            try {
                const { data: alerta, error: alertaErr } = await supabase
                    .from('watchlist_alertas')
                    .insert([{
                        watchlist_id: watchlistItem.id,
                        pessoa_id: contexto.pessoa_id,
                        evento_id: contexto.evento_id,
                        tipo_evento: contexto.tipo || 'fiscalizacao',
                        area_id: contexto.area_id || null,
                        dispositivo_id: contexto.dispositivo_id || null,
                        notificado: true,
                        canal_notificacao: 'multicanal'
                    }])
                    .select()
                    .single();

                if (!alertaErr && alerta) {
                    alertaId = alerta.id;
                    itemRastreamento.alertaId = alerta.id;
                }
            } catch (err) {
                logger.warn('Aviso: Falha ao persistir em watchlist_alertas:', err.message);
            }

            // 2. Fazer upload do snapshot para Supabase Storage se houver imagem capturada
            let snapshotUrl = null;
            if (contexto.foto_capturada || contexto.face_crop) {
                snapshotUrl = await this.salvarSnapshotStorage(alertaId || `${contexto.evento_id}_${cpfLimpo}`, contexto.foto_capturada || contexto.face_crop);
            }

            // 3. Montar objeto enriquecido de alerta
            const alertaData = {
                alerta_id: alertaId,
                nome: contexto.nome || watchlistItem.nome || 'Alvo Monitorado',
                cpf: watchlistItem.cpf || contexto.cpf || 'Não informado',
                numero_pulseira: contexto.numero_pulseira || 'Sem pulseira vinculada',
                funcao: contexto.funcao || 'Não informada',
                empresa_nome: contexto.empresa_nome || 'Não informada',
                area: contexto.area || 'Fiscalização Geral',
                localizacao: contexto.localizacao || contexto.area || 'Área do Evento',
                dispositivo: contexto.dispositivo || {
                    id: contexto.dispositivo_id,
                    nome: contexto.area || 'Câmera / Terminal',
                    tipo: contexto.tipo || 'camera_vigilancia'
                },
                operador_nome: contexto.operador_nome || 'Operador de Campo',
                motivo: watchlistItem.motivo || 'Alvo em monitoramento ativo',
                nivel_alerta: watchlistItem.nivel_alerta || 'alto',
                horario: dataHora,
                foto_url: contexto.foto_url,
                foto_capturada: contexto.foto_capturada || snapshotUrl || null,
                snapshot_url: snapshotUrl,
                face_crop: contexto.face_crop || null
            };

            // 4. Montar mensagem de texto formatada
            const msgTexto = `🚨 <b>ALERTA DE SEGURANÇA: ALVO IDENTIFICADO</b>\n\n` +
                        `👤 <b>Nome:</b> ${alertaData.nome}\n` +
                        `🆔 <b>CPF:</b> ${alertaData.cpf}\n` +
                        `🏷️ <b>Pulseira:</b> ${alertaData.numero_pulseira}\n` +
                        `💼 <b>Função:</b> ${alertaData.funcao}\n` +
                        `📹 <b>Dispositivo:</b> ${alertaData.dispositivo?.nome || 'Câmera IP'} (${alertaData.dispositivo?.ip || 'IP'}) [${alertaData.dispositivo?.fabricante || 'CFTV'}]\n` +
                        `📍 <b>Local no Evento:</b> ${alertaData.localizacao}\n` +
                        `👮 <b>Responsável / Sensor:</b> ${alertaData.operador_nome}\n` +
                        `⏰ <b>Horário:</b> ${dataHora}\n` +
                        `⚠️ <b>Motivo:</b> ${alertaData.motivo}\n` +
                        `🚨 <b>Nível de Risco:</b> ${(alertaData.nivel_alerta).toUpperCase()}`;

            // 5. Notificação em tempo real via WebSocket EXCLUSIVAMENTE para ADMIN MASTER (sala 'system_admin')
            // Operadores comuns do evento NUNCA recebem este alerta, preservando o sigilo total
            try {
                const wsPayload = {
                    alerta_id: alertaId,
                    target_name: alertaData.nome,
                    pessoa: {
                        nome: alertaData.nome,
                        cpf: alertaData.cpf,
                        foto_url: alertaData.foto_url,
                        funcao: alertaData.funcao,
                        numero_pulseira: alertaData.numero_pulseira
                    },
                    foto_capturada: alertaData.foto_capturada,
                    snapshot_url: alertaData.snapshot_url,
                    face_crop: alertaData.face_crop,
                    dispositivo: alertaData.dispositivo,
                    location: alertaData.area,
                    localizacao: alertaData.localizacao,
                    localizacao_detalhe: alertaData.localizacao,
                    metodo: contexto.tipo || 'camera_vigilancia',
                    timestamp: new Date().toISOString(),
                    status: 'em_rastreamento',
                    watchlist: {
                        motivo: alertaData.motivo,
                        nivel_alerta: alertaData.nivel_alerta
                    }
                };
                websocketService.emit('watchlist_alert', wsPayload, 'system_watchlist');
            } catch (wsErr) {
                logger.warn('Aviso: Falha ao emitir websocket de segurança:', wsErr.message);
            }

            // 6. Despacho das Notificações Externas em SEGUNDO PLANO (ASSÍNCRONO - NÃO TRAVA O SERVIDOR)
            setImmediate(async () => {
                try {
                    // Contatos ativos do evento (Telegram / WhatsApp)
                    const { data: contatos } = await supabase
                        .from('watchlist_contatos')
                        .select('*')
                        .eq('evento_id', contexto.evento_id)
                        .eq('ativo', true);

                    if (contatos && contatos.length > 0) {
                        for (const contato of contatos) {
                            await this.enviarNotificacao(contato, msgTexto, alertaData).catch(e => logger.warn(`Falha contato: ${e.message}`));
                        }
                    }

                    // Notificar Administradores Master via E-mail
                    const { data: masters } = await supabase
                        .from('perfis')
                        .select('id, nome_completo, email, nivel_acesso')
                        .eq('nivel_acesso', 'admin_master');

                    const emailDestinos = new Set();
                    emailDestinos.add('sistemaa2eventos@gmail.com');
                    if (process.env.ADMIN_ALERT_EMAIL) {
                        emailDestinos.add(process.env.ADMIN_ALERT_EMAIL);
                    }
                    (masters || []).forEach(m => {
                        if (m.email && m.email.includes('@')) emailDestinos.add(m.email);
                    });

                    for (const email of emailDestinos) {
                        await emailService.sendSecurityAlert(email, alertaData).catch(e => logger.warn(`Falha email admin: ${e.message}`));
                    }

                    // Telegram Global se configurado (com envio de foto se disponível)
                    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
                        if (alertaData.snapshot_url) {
                            try {
                                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                                    chat_id: process.env.TELEGRAM_CHAT_ID,
                                    photo: alertaData.snapshot_url,
                                    caption: msgTexto.length > 1024 ? msgTexto.substring(0, 1020) + '...' : msgTexto,
                                    parse_mode: 'HTML'
                                }, { timeout: 6000 });
                            } catch (tErr) {
                                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                                    chat_id: process.env.TELEGRAM_CHAT_ID,
                                    text: msgTexto,
                                    parse_mode: 'HTML'
                                }, { timeout: 4000 });
                            }
                        } else {
                            await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                                chat_id: process.env.TELEGRAM_CHAT_ID,
                                text: msgTexto,
                                parse_mode: 'HTML'
                            }, { timeout: 4000 });
                        }
                    }
                } catch (bgErr) {
                    logger.error('Erro no processamento em segundo plano de notificações:', bgErr);
                }
            });

            return { success: true, alerta_id: alertaId, status: 'em_rastreamento' };
        } catch (error) {
            logger.error('Erro ao registrar alerta da watchlist:', error);
            return { error: error.message };
        }
    }

    /**
     * Salva o frame do snapshot no Supabase Storage (Bucket 'snapshots')
     */
    async salvarSnapshotStorage(identificador, fotoData) {
        if (!fotoData) return null;
        try {
            let buffer;
            if (typeof fotoData === 'string' && fotoData.startsWith('data:image')) {
                const base64Data = fotoData.replace(/^data:image\/\w+;base64,/, '');
                buffer = Buffer.from(base64Data, 'base64');
            } else if (Buffer.isBuffer(fotoData)) {
                buffer = fotoData;
            } else if (typeof fotoData === 'string' && fotoData.startsWith('http')) {
                return fotoData;
            } else {
                return null;
            }

            const fileName = `alertas/alerta_${identificador}_${Date.now()}.jpg`;
            const { error } = await supabase.storage
                .from('snapshots')
                .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

            if (error) {
                logger.warn('Falha no upload do snapshot para Supabase Storage:', error.message);
                return null;
            }

            const { data: pubData } = supabase.storage.from('snapshots').getPublicUrl(fileName);
            logger.info(`📸 [Storage] Snapshot salvo com sucesso: ${pubData?.publicUrl}`);
            return pubData?.publicUrl || null;
        } catch (err) {
            logger.error('Erro ao salvar snapshot no storage:', err);
            return null;
        }
    }

    /**
     * Envia notificação por canal externo (Telegram, WhatsApp ou E-mail)
     */
    async enviarNotificacao(contato, mensagemTexto, alertaData = {}) {
        try {
            if (contato.canal === 'telegram') {
                const token = contato.bot_token || process.env.TELEGRAM_BOT_TOKEN;
                const chatId = contato.telefone || process.env.TELEGRAM_CHAT_ID;
                if (!token || !chatId) {
                    logger.warn(`Contato Telegram ${contato.nome} sem token ou chat_id.`);
                    return;
                }

                // Se houver snapshot gravado, enviar foto com legenda
                if (alertaData.snapshot_url) {
                    try {
                        const urlPhoto = `https://api.telegram.org/bot${token}/sendPhoto`;
                        await axios.post(urlPhoto, {
                            chat_id: chatId,
                            photo: alertaData.snapshot_url,
                            caption: mensagemTexto.length > 1024 ? mensagemTexto.substring(0, 1020) + '...' : mensagemTexto,
                            parse_mode: 'HTML'
                        }, { timeout: 6000 });
                        logger.info(`📱📸 [Telegram] Alerta com SNAPSHOT enviado para ${contato.nome}`);
                        return;
                    } catch (photoErr) {
                        logger.warn(`Falha envio foto Telegram, usando texto: ${photoErr.message}`);
                    }
                }

                const url = `https://api.telegram.org/bot${token}/sendMessage`;
                await axios.post(url, {
                    chat_id: chatId,
                    text: mensagemTexto,
                    parse_mode: 'HTML'
                }, { timeout: 4000 });
                logger.info(`📱 [Telegram] Notificação de segurança enviada para ${contato.nome}`);
            } 
            else if (contato.canal === 'whatsapp') {
                const apiUrl = process.env.WHATSAPP_API_URL;
                const apiKey = process.env.WHATSAPP_API_KEY;

                if (!apiUrl || !apiKey) {
                    logger.warn('API de WhatsApp não configurada no .env');
                    return;
                }

                await axios.post(apiUrl, {
                    phone: contato.telefone,
                    message: mensagemTexto.replace(/<[^>]*>?/gm, '') // Remove HTML para WhatsApp
                }, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                logger.info(`💬 [WhatsApp] Notificação de segurança enviada para ${contato.nome}`);
            }
            else if (contato.canal === 'email') {
                const emailDestino = contato.telefone || contato.email;
                if (emailDestino && emailDestino.includes('@')) {
                    await emailService.sendSecurityAlert(emailDestino, alertaData);
                    logger.info(`📧 [Email] Notificação de segurança enviada para ${contato.nome} (${emailDestino})`);
                }
            }
        } catch (error) {
            logger.error(`Falha ao enviar notificação (${contato.canal}) para ${contato.nome}:`, error.message);
        }
    }
}

module.exports = new WatchlistService();
