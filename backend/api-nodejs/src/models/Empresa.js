/**
 * Modelo de Empresa
 * Representa uma empresa parceira no evento
 */
class Empresa {
    constructor(data = {}) {
        this.id = data.id || null;
        this.evento_id = data.evento_id || null;
        this.nome = data.nome || '';
        this.servico = data.servico || '';
        this.cnpj = data.cnpj || '';
        this.email = data.email || '';
        this.responsavel = data.responsavel || '';
        this.observacao = data.observacao || '';
        this.ativo = data.ativo !== undefined ? data.ativo : true;
        this.created_by = data.created_by || null;
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();

        // Campos virtuais (populados em consultas)
        this.total_pessoas = data.total_pessoas || 0;
        this.max_colaboradores = data.max_colaboradores || 0;
        this.datas_presenca = data.datas_presenca || [];
        this.registration_token = data.registration_token || null;
    }

    // Validar CNPJ
    isValidCNPJ() {
        if (!this.cnpj) return true; // CNPJ opcional

        const cnpj = this.cnpj.replace(/[^\d]/g, '');
        if (cnpj.length !== 14) return false;

        // Validação básica (pode implementar validação completa)
        if (/^(\d)\1+$/.test(cnpj)) return false;

        return true;
    }

    // Formatar CNPJ para exibição
    getCNPJFormatado() {
        if (!this.cnpj) return '';
        const cnpj = this.cnpj.replace(/[^\d]/g, '');
        return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }

    // Converter para JSON
    toJSON() {
        return {
            id: this.id,
            evento_id: this.evento_id,
            nome: this.nome,
            servico: this.servico,
            cnpj: this.getCNPJFormatado(),
            cnpj_raw: this.cnpj,
            email: this.email,
            responsavel: this.responsavel,
            observacao: this.observacao,
            ativo: this.ativo,
            created_by: this.created_by,
            created_at: this.created_at,
            updated_at: this.updated_at,
            total_pessoas: this.total_pessoas
        };
    }

    // Criar a partir do banco
    static fromDatabase(row) {
        if (!row) return null;

        return new Empresa({
            id: row.id,
            evento_id: row.evento_id,
            nome: row.nome,
            servico: row.servico,
            cnpj: row.cnpj,
            email: row.email,
            responsavel: row.responsavel,
            observacao: row.observacao,
            ativo: row.ativo,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
            total_pessoas: row.total_pessoas
        });
    }
}

module.exports = Empresa;