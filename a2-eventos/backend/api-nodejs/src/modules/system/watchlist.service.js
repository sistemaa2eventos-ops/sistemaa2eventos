const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const axios = require('axios');

class WatchlistService {
    /**
     * Parsear CSV e Upsert de CPFs
     */
    async uploadCSV(evento_id, buffer) {
        try {
            const linhas = buffer.toString('utf-8')
                .split('\n')
                .slice(1) // pular header
                .filter(l => l.trim());

            if (linhas.length === 0) return { error: 'CSV vazio ou inválido' };

            const registros = linhas.map(linha => {
                const cols = linha.split(',');
                const cpfOriginal = (cols[0] || '').trim();
                const cpfLimpo = cpfOriginal.replace(/\D/g, '');
                
                return {
                    evento_id,
                    cpf: cpfLimpo,
                    nome: (cols[1] || 'Alvo Monitorado').trim(),
                    motivo: (cols[2] || 'Monitoramento Policial').trim(),
                    nivel_alerta: 'alto',
                    ativo: true
                };
            }).filter(r => r.cpf.length >= 11);

            if (registros.length === 0) return { error: 'Nenhum CPF válido encontrado no CSV' };

            const { data, error } = await supabase
                .from('watchlist')
                .upsert(registros, { onConflict: 'evento_id,cpf' });

            if (error) throw error;
            return { success: true, importados: registros.length };
        } catch (error) {
            logger.error('Erro no upload de CSV da watchlist:', error);
            return { error: error.message };
        }
    }

    /**
     * Verifica se um CPF está na lista ativa do evento
     */
    async verificarCPF(cpf, evento_id) {
        if (!cpf) return null;
        const cpfLimpo = String(cpf).replace(/\D/g, '');
        
        try {
            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('cpf', cpfLimpo)
                .eq('evento_id', evento_id)
                .eq('ativo', true)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 = Not Found
            return data || null;
        } catch (error) {
            logger.error(`Erro ao verificar CPF ${cpfLimpo} na watchlist:`, error);
            return null;
        }
    }

    /**
     * Registra alerta e notifica contatos
     */
    async registrarAlerta(watchlistItem, contexto) {
        try {
            // 1. Salvar histórico de alerta
            const { data: alerta, error: alertaErr } = await supabase
                .from('watchlist_alertas')
                .insert([{
                    watchlist_id: watchlistItem.id,
                    pessoa_id: contexto.pessoa_id,
                    evento_id: contexto.evento_id,
                    tipo_evento: contexto.tipo,
                    area_id: contexto.area_id || null,
                    dispositivo_id: contexto.dispositivo_id || null,
                    notificado: false
                }])
                .select()
                .single();

            if (alertaErr) throw alertaErr;

            // 2. Buscar contatos ativos
            const { data: contatos } = await supabase
                .from('watchlist_contatos')
                .select('*')
                .eq('evento_id', contexto.evento_id)
                .eq('ativo', true);

            if (!contatos || contatos.length === 0) return;

            // 3. Montar mensagem
            const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const msg = `🚨 <b>ALERTA DE MONITORAMENTO</b>\n\n` +
                        `👤 <b>Nome:</b> ${contexto.nome}\n` +
                        `🆔 <b>CPF:</b> ${watchlistItem.cpf}\n` +
                        `🔘 <b>Evento:</b> ${contexto.tipo.toUpperCase()}\n` +
                        `📍 <b>Área:</b> ${contexto.area || 'Não informada'}\n` +
                        `📟 <b>Terminal:</b> ${contexto.terminal || 'Não informado'}\n` +
                        `⏰ <b>Hora:</b> ${dataHora}\n` +
                        `📝 <b>Motivo:</b> ${watchlistItem.motivo || 'N/A'}`;

            // 4. Enviar para cada contato
            for (const contato of contatos) {
                await this.enviarNotificacao(contato, msg);
            }

            // 5. Marcar como notificado
            await supabase
                .from('watchlist_alertas')
                .update({ notificado: true, canal_notificacao: 'externo' })
                .eq('id', alerta.id);

        } catch (error) {
            logger.error('Erro ao registrar/notificar alerta de monitoramento:', error);
        }
    }

    /**
     * Envia notificação por canal externo
     */
    async enviarNotificacao(contato, mensagem) {
        try {
            if (contato.canal === 'telegram') {
                if (!contato.bot_token || !contato.telefone) {
                    logger.warn(`Contato Telegram ${contato.nome} sem token ou chat_id.`);
                    return;
                }
                const url = `https://api.telegram.org/bot${contato.bot_token}/sendMessage`;
                await axios.post(url, {
                    chat_id: contato.telefone,
                    text: mensagem,
                    parse_mode: 'HTML'
                });
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
                    message: mensagem.replace(/<[^>]*>?/gm, '') // Remove HTML para WhatsApp
                }, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
            }
        } catch (error) {
            logger.error(`Falha ao enviar notificação (${contato.canal}) para ${contato.nome}:`, error.message);
        }
    }
}

module.exports = new WatchlistService();
