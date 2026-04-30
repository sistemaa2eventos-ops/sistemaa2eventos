const { supabase } = require('../../../config/supabase');
const logger = require('../../../services/logger');
const websocketService = require('../../../services/websocketService');

class WatchlistService {
    async checkWatchlist(evento_id, pessoa_id, pessoa, tipo, metodo, dispositivo_id) {
        try {
            const { data: watchlistMatch } = await supabase
                .from('monitor_watchlist')
                .select('id, nome, cpf')
                .eq('evento_id', evento_id)
                .eq('is_active', true)
                .or(`pessoa_id.eq.${pessoa_id},cpf.eq.${pessoa.cpf || 'no-cpf'}`)
                .maybeSingle();

            if (watchlistMatch) {
                const alertPayload = {
                    type: 'watchlist_hit',
                    watchlist_id: watchlistMatch.id,
                    target_name: watchlistMatch.nome || pessoa.nome,
                    pessoa: {
                        id: pessoa.id,
                        nome: pessoa.nome,
                        foto_url: pessoa.foto_url,
                        cpf: pessoa.cpf,
                        empresas: pessoa.empresas
                    },
                    location: dispositivo_id, 
                    tipo_acesso: tipo,
                    metodo,
                    timestamp: new Date()
                };
                websocketService.emit('new_alert', alertPayload, evento_id);
                logger.info(`🚨 WATCHLIST HIT: ${pessoa.nome} detectado em ${dispositivo_id}`);
                return true;
            }
            return false;
        } catch (err) {
            logger.error('Erro ao verificar watchlist:', err);
            return false;
        }
    }
}

module.exports = new WatchlistService();
