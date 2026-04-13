/**
 * Modelo de Log de Acesso
 * Representa um registro de check-in/out
 */
class AccessLog {
    constructor(data = {}) {
        this.id = data.id || null;
        this.evento_id = data.evento_id || null;
        this.pessoa_id = data.pessoa_id || null;
        this.tipo = data.tipo || 'checkin';
        this.metodo = data.metodo || 'manual';
        this.dispositivo_id = data.dispositivo_id || '';
        this.localizacao = data.localizacao || '';
        this.foto_capturada = data.foto_capturada || '';
        this.confianca = data.confianca || null;
        this.created_by = data.created_by || null;
        this.created_at = data.created_at || new Date();

        // Campos virtuais
        this.pessoa_nome = data.pessoa_nome || '';
        this.pessoa_foto = data.pessoa_foto || '';
        this.empresa_nome = data.empresa_nome || '';
    }

    // Obter label do tipo
    getTipoLabel() {
        const labels = {
            'checkin': 'Entrada',
            'checkout': 'Saída',
            'expulsao': 'Expulsão',
            'negado': 'Acesso Negado'
        };
        return labels[this.tipo] || this.tipo;
    }

    // Obter cor do tipo
    getTipoColor() {
        const colors = {
            'checkin': 'success',
            'checkout': 'info',
            'expulsao': 'error',
            'negado': 'warning'
        };
        return colors[this.tipo] || 'default';
    }

    // Obter ícone do tipo
    getTipoIcon() {
        const icons = {
            'checkin': 'login',
            'checkout': 'logout',
            'expulsao': 'block',
            'negado': 'warning'
        };
        return icons[this.tipo] || 'help';
    }

    // Obter label do método
    getMetodoLabel() {
        const labels = {
            'qrcode': 'QR Code',
            'face': 'Reconhecimento Facial',
            'manual': 'Manual',
            'fast-track': 'Fast Track'
        };
        return labels[this.metodo] || this.metodo;
    }

    // Verificar se foi rápido (fast track)
    isFastTrack() {
        return this.metodo === 'fast-track' && this.confianca > 0.8;
    }

    // Formatar confiança
    getConfiancaFormatada() {
        if (this.confianca === null) return null;
        return `${Math.round(this.confianca * 100)}%`;
    }

    // Converter para JSON
    toJSON() {
        return {
            id: this.id,
            evento_id: this.evento_id,
            pessoa_id: this.pessoa_id,
            pessoa_nome: this.pessoa_nome,
            pessoa_foto: this.pessoa_foto,
            empresa_nome: this.empresa_nome,
            tipo: this.tipo,
            tipo_label: this.getTipoLabel(),
            tipo_color: this.getTipoColor(),
            tipo_icon: this.getTipoIcon(),
            metodo: this.metodo,
            metodo_label: this.getMetodoLabel(),
            dispositivo_id: this.dispositivo_id,
            localizacao: this.localizacao,
            foto_capturada: this.foto_capturada,
            confianca: this.confianca,
            confianca_formatada: this.getConfiancaFormatada(),
            is_fast_track: this.isFastTrack(),
            created_by: this.created_by,
            created_at: this.created_at
        };
    }

    // Criar a partir do banco
    static fromDatabase(row) {
        if (!row) return null;

        return new AccessLog({
            id: row.id,
            evento_id: row.evento_id,
            pessoa_id: row.pessoa_id,
            pessoa_nome: row.pessoa_nome,
            pessoa_foto: row.pessoa_foto,
            empresa_nome: row.empresa_nome,
            tipo: row.tipo,
            metodo: row.metodo,
            dispositivo_id: row.dispositivo_id,
            localizacao: row.localizacao,
            foto_capturada: row.foto_capturada,
            confianca: row.confianca,
            created_by: row.created_by,
            created_at: row.created_at
        });
    }

    // Criar para inserção no banco
    static forInsert(data) {
        return {
            id: data.id,
            evento_id: data.evento_id,
            pessoa_id: data.pessoa_id,
            tipo: data.tipo,
            metodo: data.metodo,
            dispositivo_id: data.dispositivo_id,
            localizacao: data.localizacao,
            foto_capturada: data.foto_capturada,
            confianca: data.confianca,
            created_by: data.created_by,
            created_at: data.created_at || new Date()
        };
    }
}

module.exports = AccessLog;