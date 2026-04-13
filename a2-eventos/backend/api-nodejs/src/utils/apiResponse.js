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
        return res.status(statusCode).json({
            success: false,
            error: message,
            details: details
        });
    }
}

module.exports = ApiResponse;
