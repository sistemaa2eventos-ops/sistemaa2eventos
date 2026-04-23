import { supabase } from './supabase';
import { BACKEND_URL } from '@/config/api';

export interface FaceAuthResult {
    success: boolean;
    pessoa_id?: string;
    nome?: string;
    confianca?: number;
    error?: string;
    action: 'allow' | 'deny';
}

/**
 * FaceApiService: Comunicação direta com o backend A2 Node.js 
 * para verificação biométrica em tempo real.
 */
export const faceApiService = {
    /**
     * Enviar imagem capturada para o motor de reconhecimento facial.
     * @param base64 Imagem em formato base64
     * @param eventoId ID do evento atual
     * @param dispositivoId ID do dispositivo (para log e controle)
     */
    async verifyFace(base64: string, eventoId: string, dispositivoId?: string): Promise<FaceAuthResult> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Não autenticado');

            // Limpa o prefixo do base64 se houver
            const base64Clean = base64.replace(/^data:image\/\w+;base64,/, '');

            const response = await fetch(`${BACKEND_URL}/access/verify/face`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'x-evento-id': eventoId
                },
                body: JSON.stringify({
                    face_image: base64Clean,
                    dispositivo_id: dispositivoId
                })
            });

            const result = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: result.error || 'Reconhecimento falhou',
                    action: 'deny'
                };
            }

            return {
                success: true,
                pessoa_id: result.data?.pessoa_id,
                nome: result.data?.nome,
                confianca: result.data?.confianca,
                action: result.data?.action || 'allow'
            };

        } catch (error: any) {
            console.error('❌ [FaceApiService] Error:', error.message);
            return {
                success: false,
                error: 'Falha na conexão com o servidor biométrico.',
                action: 'deny'
            };
        }
    }
};
