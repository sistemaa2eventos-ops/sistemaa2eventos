class FaceEncoder {
    /**
     * Converte encoding facial para formato de armazenamento
     */
    encode(faceData) {
        if (!faceData) return null;

        // Se já é string, retorna
        if (typeof faceData === 'string') {
            return faceData;
        }

        // Se é array/objeto, converte para JSON string
        try {
            return JSON.stringify(faceData);
        } catch {
            return null;
        }
    }

    /**
     * Decodifica encoding facial do banco
     */
    decode(encodedData) {
        if (!encodedData) return null;

        // Se já é objeto, retorna
        if (typeof encodedData === 'object') {
            return encodedData;
        }

        // Tenta parsear JSON
        try {
            return JSON.parse(encodedData);
        } catch {
            // Se não for JSON válido, assume que é o encoding puro
            return encodedData;
        }
    }

    /**
     * Valida se o encoding tem formato esperado
     */
    validate(encoding) {
        if (!encoding) return false;

        const decoded = this.decode(encoding);

        // Verificar se é um array (formato comum do face_recognition)
        if (Array.isArray(decoded)) {
            // Comprimento típico: 128 para dlib/face_recognition
            return decoded.length === 128;
        }

        // Verificar se é um objeto com propriedades esperadas
        if (typeof decoded === 'object') {
            return decoded.hasOwnProperty('encoding') ||
                decoded.hasOwnProperty('descriptor');
        }

        return false;
    }

    /**
     * Calcula similaridade entre dois encodings
     */
    calculateSimilarity(encoding1, encoding2) {
        const e1 = this.decode(encoding1);
        const e2 = this.decode(encoding2);

        if (!e1 || !e2) return 0;

        // Se são arrays, calcula distância euclidiana
        if (Array.isArray(e1) && Array.isArray(e2)) {
            if (e1.length !== e2.length) return 0;

            let sum = 0;
            for (let i = 0; i < e1.length; i++) {
                sum += Math.pow(e1[i] - e2[i], 2);
            }

            const distance = Math.sqrt(sum);
            // Converte distância para similaridade (0-1)
            return Math.max(0, 1 - distance / 2);
        }

        return 0;
    }

    /**
     * Formata encoding para exibição/log
     */
    formatForLog(encoding) {
        if (!encoding) return 'null';

        const decoded = this.decode(encoding);

        if (Array.isArray(decoded)) {
            return `[Array:${decoded.length} items]`;
        }

        if (typeof decoded === 'object') {
            return `[Object:${Object.keys(decoded).join(',')}]`;
        }

        return `[${typeof decoded}]`;
    }
}

module.exports = new FaceEncoder();