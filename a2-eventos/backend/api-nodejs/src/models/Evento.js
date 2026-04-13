/**
 * Modelo de Evento
 * Representa um evento no sistema
 */
class Evento {
    constructor(data = {}) {
        this.id = data.id || null;
        this.nome = data.nome || '';
        this.slug = data.slug || '';
        this.descricao = data.descricao || '';
        this.local = data.local || '';
        this.data_inicio = data.data_inicio || null;
        this.data_fim = data.data_fim || null;
        this.logo_url = data.logo_url || '';
        this.status = data.status || 'ativo';
        this.config = data.config || {
            checkin_mode: ['qrcode', 'face', 'manual'],
            fast_track: true,
            badge_template: 'default'
        };
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
    }

    // Validar se evento está ativo
    isAtivo() {
        return this.status === 'ativo';
    }

    // Validar se evento está dentro do período
    isInPeriod() {
        const agora = new Date();
        return agora >= this.data_inicio && agora <= this.data_fim;
    }

    // Verificar se permite um método de check-in
    permiteMetodo(metodo) {
        return this.config.checkin_mode.includes(metodo);
    }

    // Converter para JSON
    toJSON() {
        return {
            id: this.id,
            nome: this.nome,
            slug: this.slug,
            descricao: this.descricao,
            local: this.local,
            data_inicio: this.data_inicio,
            data_fim: this.data_fim,
            logo_url: this.logo_url,
            status: this.status,
            config: this.config,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    // Criar a partir do banco
    static fromDatabase(row) {
        if (!row) return null;

        let config = row.config;
        if (typeof config === 'string') {
            try {
                config = JSON.parse(config);
            } catch {
                config = { checkin_mode: ['qrcode', 'face', 'manual'] };
            }
        }

        return new Evento({
            id: row.id,
            nome: row.nome,
            slug: row.slug,
            descricao: row.descricao,
            local: row.local,
            data_inicio: row.data_inicio,
            data_fim: row.data_fim,
            logo_url: row.logo_url,
            status: row.status,
            config: config,
            created_at: row.created_at,
            updated_at: row.updated_at
        });
    }
}

module.exports = Evento;