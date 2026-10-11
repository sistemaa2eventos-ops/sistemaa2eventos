const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

class VeiculoService {
    /**
     * Lista veículos de um evento cruzando com empresas
     */
    /**
     * Lista veículos de um evento com paginação e busca
     */
    async list(supabaseClient, eventoId, search, page = 1, limit = 20) {
        const from = (page - 1) * limit;

        // Passo 1: Capturar IDs de empresas do evento (Isolamento de Tenant)
        let empIds = [];
        let empMap = {};
        if (eventoId) {
            const { data: empData } = await supabaseClient
                .from('empresas')
                .select('id, nome, evento_id')
                .eq('evento_id', eventoId);
            
            empIds = (empData || []).map(e => e.id);
            empMap = (empData || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
        }

        // Passo 2: Buscar veículos com paginação
        let query = supabaseClient
            .from('veiculos')
            .select('*', { count: 'exact' });

        if (eventoId && empIds.length > 0) {
            query = query.or(`evento_id.eq.${eventoId},empresa_id.in.(${empIds.join(',')})`);
        } else if (eventoId) {
            query = query.eq('evento_id', eventoId);
        }

        if (search) {
            // Busca expandida para incluir Marca
            query = query.or(`placa.ilike.%${search}%,modelo.ilike.%${search}%,marca.ilike.%${search}%`);
        }

        const { data: veiculos, error: vError, count } = await query
            .order('created_at', { ascending: false })
            .range(from, from + limit - 1);

        if (vError) throw vError;

        // Passo 3: Popular motoristas (Pessoas) se existirem
        const motoristaIds = [...new Set(veiculos.map(v => v.motorista_id || v.pessoa_id).filter(id => id))];
        let motoristaMap = {};
        if (motoristaIds.length > 0) {
            const { data: pData } = await supabaseClient
                .from('pessoas')
                .select('id, nome_completo, cpf, foto_url, funcao')
                .in('id', motoristaIds);
            motoristaMap = (pData || []).reduce((acc, p) => { 
                acc[p.id] = {
                    ...p,
                    nome_completo: p.nome_completo || p.nome || 'Motorista'
                }; 
                return acc; 
            }, {});
        }

        // Passo 4: Unificar dados
        const formattedData = veiculos.map(v => {
            const mId = v.motorista_id || v.pessoa_id;
            return {
                ...v,
                empresas: empMap[v.empresa_id] || null,
                pessoas: mId ? (motoristaMap[mId] || null) : null
            };
        });

        return { data: formattedData, total: count || 0 };
    }

    async getById(supabaseClient, id, eventoId) {
        // Passo 1: Buscar o veículo de forma pura
        const { data: veiculo, error } = await supabaseClient
            .from('veiculos')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !veiculo) throw new Error('Veículo não encontrado.');

        // Passo 2: Buscar e validar empresa
        const { data: empresa } = await supabaseClient
            .from('empresas')
            .select('id, nome, evento_id')
            .eq('id', veiculo.empresa_id)
            .single();

        if (!empresa || empresa.evento_id !== eventoId) {
            throw new Error('Veículo não pertence a este evento.');
        }

        // Passo 3: Buscar motorista se existir
        const motoristaId = veiculo.motorista_id || veiculo.pessoa_id;
        let motorista = null;
        if (motoristaId) {
            const { data: p } = await supabaseClient
                .from('pessoas')
                .select('id, nome_completo, cpf, foto_url, funcao')
                .eq('id', motoristaId)
                .maybeSingle();
            motorista = p ? { ...p, nome_completo: p.nome_completo || p.nome || 'Motorista' } : null;
        }

        return { ...veiculo, empresas: empresa, pessoas: motorista };
    }

    async createVeiculo(supabaseClient, veiculoData, eventoId) {
        const { placa, marca, modelo, empresa_id, motorista_id } = veiculoData;

        // Validar empresa no evento
        const { data: empresa, error: empError } = await supabaseClient
            .from('empresas')
            .select('id')
            .eq('id', empresa_id)
            .eq('evento_id', eventoId)
            .single();

        if (empError || !empresa) {
            throw new Error('A empresa informada não pertence ao evento atual.');
        }

        const { data, error } = await supabaseClient
            .from('veiculos')
            .insert([{
                placa: placa.toUpperCase().trim().replace(/\s/g, ''),
                marca: marca?.toUpperCase().trim() || '',
                modelo: modelo?.toUpperCase().trim() || '',
                empresa_id,
                evento_id: eventoId,
                motorista_id: motorista_id || null,
                pessoa_id: motorista_id || null,
                status: 'liberado',
                created_at: new Date()
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') throw new Error('Já existe um veículo cadastrado com esta placa.');
            throw error;
        }

        return data;
    }

    async updateVeiculo(supabaseClient, id, veiculoData, eventoId) {
        const { placa, marca, modelo, empresa_id, motorista_id } = veiculoData;

        // Passo 1: Validar se o veículo existe e sua empresa pertence ao evento
        const { data: vInfo, error: vError } = await supabaseClient
            .from('veiculos')
            .select('id, empresa_id')
            .eq('id', id)
            .single();

        if (vError || !vInfo) throw new Error('Veículo não encontrado.');

        const { data: empOrigem } = await supabaseClient
            .from('empresas')
            .select('evento_id')
            .eq('id', vInfo.empresa_id)
            .single();

        if (!empOrigem || empOrigem.evento_id !== eventoId) {
            throw new Error('Veículo não pertence a este evento.');
        }

        if (empresa_id) {
            const { data: empCheck } = await supabaseClient
                .from('empresas')
                .select('id')
                .eq('id', empresa_id)
                .eq('evento_id', eventoId)
                .single();

            if (!empCheck) throw new Error('A nova empresa informada não pertence a este evento.');
        }

        const updates = {};
        if (placa) updates.placa = placa.toUpperCase().trim().replace(/\s/g, '');
        if (marca) updates.marca = marca.toUpperCase().trim();
        if (modelo) updates.modelo = modelo.toUpperCase().trim();
        if (empresa_id) updates.empresa_id = empresa_id;
        updates.motorista_id = motorista_id || null;
        updates.pessoa_id = motorista_id || null;
        if (eventoId) updates.evento_id = eventoId;

        const { data, error } = await supabaseClient
            .from('veiculos')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') throw new Error('A placa informada já está em uso.');
            throw error;
        }

        return data;
    }

    async deleteVeiculo(supabaseClient, id, eventoId) {
        // Passo 1: Validar propriedade
        const { data: vInfo, error: vError } = await supabaseClient
            .from('veiculos')
            .select('id, empresa_id')
            .eq('id', id)
            .single();

        if (vError || !vInfo) throw new Error('Veículo não encontrado.');

        const { data: emp } = await supabaseClient
            .from('empresas')
            .select('evento_id')
            .eq('id', vInfo.empresa_id)
            .single();

        if (!emp || emp.evento_id !== eventoId) {
            throw new Error('Veículo não pertence a este evento.');
        }

        const { error } = await supabaseClient.from('veiculos').delete().eq('id', id);
        if (error) throw error;
        return true;
    }

    async listByEvent(supabaseClient, eventoId, search) {
        const res = await this.list(supabaseClient, eventoId, search, 1, 1000);
        return res.data;
    }
}

module.exports = new VeiculoService();
