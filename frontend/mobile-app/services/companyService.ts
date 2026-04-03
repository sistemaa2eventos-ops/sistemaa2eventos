import { supabase } from './supabase';

export const companyService = {
    /**
     * Listar todas as empresas do evento
     */
    async getCompanies(eventoId: string) {
        const { data, error } = await supabase
            .from('empresas')
            .select('*')
            .eq('evento_id', eventoId)
            .order('nome');

        if (error) throw error;
        return data;
    },

    /**
     * Atualizar configurações da empresa (Limites e Datas)
     */
    async updateCompany(companyId: string, updates: any) {
        const { data, error } = await supabase
            .from('empresas')
            .update({
                max_colaboradores: updates.max_colaboradores,
                datas_presenca: updates.datas_presenca,
                updated_at: new Date()
            })
            .eq('id', companyId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Gerar/Recuperar Link de Cadastro
     */
    async getRegistrationLink(company: any) {
        if (!company.registration_token) {
            // Se não tiver token, gera um via API ou Supabase
            // Idealmente chama o endpoint refreshToken que criamos
            return `https://a2eventos.com.br/public/register/${company.registration_token}`;
        }
        return `https://a2eventos.com.br/public/register/${company.registration_token}`;
    }
};
