const faceEncoder = require('../utils/faceEncoder');

/**
 * Modelo de Funcionário
 * Representa um funcionário/participante do evento
 */
class Pessoa {
    constructor(data = {}) {
        this.id = data.id || null;
        this.evento_id = data.evento_id || null;
        this.empresa_id = data.empresa_id || null;
        this.nome = data.nome || '';
        this.cpf = data.cpf || '';
        this.funcao = data.funcao || '';
        this.observacao = data.observacao || '';
        this.fase_montagem = data.fase_montagem || false;
        this.fase_showday = data.fase_showday || false;
        this.fase_desmontagem = data.fase_desmontagem || false;
        this.foto_url = data.foto_url || '';
        this.face_encoding = data.face_encoding || null;
        this.status_acesso = data.status_acesso || 'pendente';
        this.nome_mae = data.nome_mae || '';
        this.data_nascimento = data.data_nascimento || null;
        this.documentos_url = data.documentos_url || null;
        this.dias_trabalho = data.dias_trabalho || [];
        this.qr_code = data.qr_code || '';
        this.numero_pulseira = data.numero_pulseira || '';
        this.credencial_impressa = data.credencial_impressa || false;
        this.ativo = data.ativo !== undefined ? data.ativo : true;
        this.created_by = data.created_by || null;
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();

        // Campos virtuais
        this.empresa_nome = data.empresa_nome || '';
        this.ultimo_acesso = data.ultimo_acesso || null;
    }

    // Validar CPF
    isValidCPF() {
        const cpf = this.cpf.replace(/[^\d]/g, '');
        if (cpf.length !== 11) return false;

        // Validar dígitos repetidos
        if (/^(\d)\1+$/.test(cpf)) return false;

        // Validar primeiro dígito
        let soma = 0;
        for (let i = 0; i < 9; i++) {
            soma += parseInt(cpf.charAt(i)) * (10 - i);
        }
        let resto = 11 - (soma % 11);
        let dv1 = resto > 9 ? 0 : resto;
        if (dv1 !== parseInt(cpf.charAt(9))) return false;

        // Validar segundo dígito
        soma = 0;
        for (let i = 0; i < 10; i++) {
            soma += parseInt(cpf.charAt(i)) * (11 - i);
        }
        resto = 11 - (soma % 11);
        let dv2 = resto > 9 ? 0 : resto;
        if (dv2 !== parseInt(cpf.charAt(10))) return false;

        return true;
    }

    // Formatar CPF
    getCPFFormatado() {
        const cpf = this.cpf.replace(/[^\d]/g, '');
        return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    }

    // Verificar se tem permissão para uma fase
    hasPermissaoFase(fase) {
        switch (fase) {
            case 'montagem': return this.fase_montagem;
            case 'showday': return this.fase_showday;
            case 'desmontagem': return this.fase_desmontagem;
            default: return false;
        }
    }

    // Verificar se já fez check-in
    isCheckin() {
        return this.status_acesso === 'checkin';
    }

    // Verificar se está pendente
    isPendente() {
        return this.status_acesso === 'pendente';
    }

    // Verificar se foi expulso
    isExpulso() {
        return this.status_acesso === 'expulso';
    }

    // Obter cor do status
    getStatusColor() {
        const colors = {
            'checkin_feito': 'success',
            'checkout_feito': 'info',
            'pendente': 'warning',
            'verificacao': 'warning',
            'autorizado': 'primary',
            'bloqueado': 'error',
            'expulso': 'error',
            'checkin': 'success', // Legado
            'checkout': 'info'    // Legado
        };
        return colors[this.status_acesso] || 'default';
    }

    // Obter label do status
    getStatusLabel() {
        const labels = {
            'checkin_feito': 'Presente',
            'checkout_feito': 'Ausente',
            'pendente': 'Pendente',
            'verificacao': 'Em Verificação',
            'autorizado': 'Autorizado',
            'bloqueado': 'Bloqueado',
            'expulso': 'Expulso',
            'checkin': 'Presença (L)',
            'checkout': 'Saída (L)'
        };
        return labels[this.status_acesso] || this.status_acesso;
    }

    // Decodificar face encoding
    getFaceEncoding() {
        return faceEncoder.decode(this.face_encoding);
    }

    // Converter para JSON
    toJSON() {
        return {
            id: this.id,
            evento_id: this.evento_id,
            empresa_id: this.empresa_id,
            empresa_nome: this.empresa_nome,
            nome: this.nome,
            cpf: this.getCPFFormatado(),
            cpf_raw: this.cpf,
            funcao: this.funcao,
            observacao: this.observacao,
            fase_montagem: this.fase_montagem,
            fase_showday: this.fase_showday,
            fase_desmontagem: this.fase_desmontagem,
            foto_url: this.foto_url,
            tem_face: !!this.face_encoding,
            status_acesso: this.status_acesso,
            status_color: this.getStatusColor(),
            status_label: this.getStatusLabel(),
            qr_code: this.qr_code,
            numero_pulseira: this.numero_pulseira,
            credencial_impressa: this.credencial_impressa,
            ativo: this.ativo,
            created_at: this.created_at,
            updated_at: this.updated_at,
            ultimo_acesso: this.ultimo_acesso
        };
    }

    // Criar a partir do banco
    static fromDatabase(row) {
        if (!row) return null;

        let faceEncoding = row.face_encoding;
        if (faceEncoding && typeof faceEncoding === 'string') {
            try {
                faceEncoding = JSON.parse(faceEncoding);
            } catch {
                // Mantém como string
            }
        }

        return new Pessoa({
            id: row.id,
            evento_id: row.evento_id,
            empresa_id: row.empresa_id,
            empresa_nome: row.empresa_nome,
            nome: row.nome,
            cpf: row.cpf,
            funcao: row.funcao,
            observacao: row.observacao,
            fase_montagem: row.fase_montagem,
            fase_showday: row.fase_showday,
            fase_desmontagem: row.fase_desmontagem,
            foto_url: row.foto_url,
            face_encoding: faceEncoding,
            status_acesso: row.status_acesso,
            qr_code: row.qr_code,
            numero_pulseira: row.numero_pulseira,
            credencial_impressa: row.credencial_impressa,
            ativo: row.ativo,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
            ultimo_acesso: row.ultimo_acesso
        });
    }
}

module.exports = Pessoa;