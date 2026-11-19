/**
 * Utilitário para padronizar as respostas da API Node.js
 */
class ApiResponse {
    /**
     * Resposta de sucesso
     * @param {Object} res - Objeto de resposta Express
     * @param {any} data - Dados a serem retornados
     * @param {number} statusCode - HTTP Status Code (default 200)
     */
    static success(res, data = null, statusCode = 200) {
        return res.status(statusCode).json({
            success: true,
            data
        });
    }

    /**
     * Resposta de erro
     * @param {Object} res - Objeto de resposta Express
     * @param {string} message - Mensagem de erro amigável
     * @param {number} statusCode - HTTP Status Code (default 500)
     * @param {any} details - Detalhes adicionais do erro (opcional)
     */
    static error(res, message = 'Internal Server Error', statusCode = 500, details = null) {
        const corpo = { success: false, error: message, details: details };
        // Bloqueio de entrada (409 ENTRADA_BLOQUEADA): codigo, liberavel e etapa também no topo do corpo, para o painel
        if (details && typeof details === 'object' && details.codigo) {
            corpo.codigo = details.codigo;
            if (typeof details.liberavel === 'boolean') corpo.liberavel = details.liberavel;
            if (details.etapa !== undefined) corpo.etapa = details.etapa;
        }
        return res.status(statusCode).json(corpo);
    }
}

module.exports = ApiResponse;
