const logger = require('./logger');

/**
 * CacheService Simples (In-Memory)
 * Proporciona ganhos massivos em rotas públicas de alto tráfego
 */
class CacheService {
    constructor() {
        this.cache = new Map();
        this.ttl = 5 * 60 * 1000; // 5 minutos por padrão
    }

    set(key, value, customTTL = null) {
        const expires = Date.now() + (customTTL || this.ttl);
        this.cache.set(key, { value, expires });
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return null;
        }

        return entry.value;
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        logger.info('🧹 Cache limpo manualmente.');
        this.cache.clear();
    }
}

module.exports = new CacheService();