const logger = require('./logger');

/**
 * Serviço de Cache em Memória
 * Reduz consultas repetidas ao banco de dados
 */
class CacheService {
    constructor() {
        this.cache = new Map();
        this.ttl = 5 * 60 * 1000; // 5 minutos padrão
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };

        // Limpar cache expirado a cada minuto
        setInterval(() => this.cleanExpired(), 60000);
    }

    /**
     * Busca item do cache
     */
    get(key) {
        const item = this.cache.get(key);

        if (!item) {
            this.stats.misses++;
            return null;
        }

        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return item.value;
    }

    /**
     * Armazena item no cache
     */
    set(key, value, ttl = this.ttl) {
        const expiresAt = Date.now() + ttl;
        this.cache.set(key, { value, expiresAt });
        this.stats.sets++;

        logger.debug(`💾 Cache SET: ${key}, TTL: ${ttl}ms`);
        return true;
    }

    /**
     * Remove item do cache
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.stats.deletes++;
            logger.debug(`🗑️ Cache DELETE: ${key}`);
        }
        return deleted;
    }

    /**
     * Limpa cache expirado
     */
    cleanExpired() {
        const now = Date.now();
        let expired = 0;

        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiresAt) {
                this.cache.delete(key);
                expired++;
            }
        }

        if (expired > 0) {
            logger.debug(`🧹 Cache: ${expired} itens expirados removidos`);
        }
    }

    /**
     * Limpa todo o cache
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        logger.info(`🧹 Cache completamente limpo (${size} itens)`);
        return size;
    }

    /**
     * Busca com função de fallback
     */
    async getOrSet(key, fn, ttl = this.ttl) {
        const cached = this.get(key);

        if (cached) {
            return cached;
        }

        try {
            const value = await fn();
            this.set(key, value, ttl);
            return value;
        } catch (error) {
            logger.error(`Erro ao buscar fallback para ${key}:`, error);
            throw error;
        }
    }

    /**
     * Cache para eventos
     */
    async getEvento(eventoId) {
        const key = `evento:${eventoId}`;
        return this.getOrSet(
            key,
            async () => {
                const { supabase } = require('../config/supabase');
                const { data, error } = await supabase
                    .from('eventos')
                    .select('*')
                    .eq('id', eventoId)
                    .single();
                if (error) throw error;
                return data;
            },
            10 * 60 * 1000 // 10 minutos
        );
    }

    /**
     * Cache para pessoa
     */
    async getPessoa(pessoaId) {
        const key = `pessoa:${pessoaId}`;
        return this.getOrSet(
            key,
            async () => {
                const { supabase } = require('../config/supabase');
                const { data, error } = await supabase
                    .from('pessoas')
                    .select('*')
                    .eq('id', pessoaId)
                    .single();
                if (error) throw error;
                return data;
            },
            2 * 60 * 1000 // 2 minutos
        );
    }

    /**
     * Invalida cache de pessoa
     */
    invalidatePessoa(pessoaId) {
        this.delete(`pessoa:${pessoaId}`);
    }

    /**
     * Invalida cache de evento
     */
    invalidateEvento(eventoId) {
        this.delete(`evento:${eventoId}`);
    }

    /**
     * Estatísticas do cache
     */
    getStats() {
        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: this.stats.hits + this.stats.misses > 0
                ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Lista todas as chaves
     */
    keys() {
        return Array.from(this.cache.keys());
    }
}

module.exports = new CacheService();