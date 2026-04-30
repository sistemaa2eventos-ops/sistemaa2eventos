const axios = require('axios');
const { supabase } = require('../../config/supabase');
const DeviceFactory = require('./adapters/DeviceFactory');
const logger = require('../../services/logger');

class TerminalSyncService {
    /**
     * Sincroniza uma pessoa específica em todos os terminais do evento
     */
    async syncPessoa(pessoaId) {
        try {
            // 1. Buscar dados da pessoa
            const { data: pessoa, error: fError } = await supabase
                .from('pessoas')
                .select('*, empresas(nome)')
                .eq('id', pessoaId)
                .single();

            if (fError || !pessoa) throw new Error('Pessoa não encontrada');
            if (!pessoa.foto_url) return { success: false, message: 'Pessoa sem foto' };

            // 2. Buscar terminais do evento
            const { data: terminais, error: tError } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('evento_id', pessoa.evento_id)
                .eq('tipo', 'terminal_facial');

            if (tError) throw tError;

            // 3. Sincronizar em cada terminal
            const results = [];
            for (const terminal of terminais) {
                const res = await this.pushToTerminal(pessoa, terminal);
                results.push({ terminal: terminal.nome, success: res });
            }

            return { success: true, results };
        } catch (error) {
            logger.error(`❌ Erro na sincronização do funcionário ${pessoaId}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Sincroniza todos os funcionários de um evento para um terminal específico
     */
    async syncTerminal(terminalId) {
        try {
            const { data: terminal, error: tError } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('id', terminalId)
                .single();

            if (tError || !terminal) throw new Error('Terminal não encontrado');

            // Buscar pessoas ativas do evento com foto
            const { data: pessoas, error: fError } = await supabase
                .from('pessoas')
                .select('*')
                .eq('evento_id', terminal.evento_id)
                .eq('ativo', true)
                .not('foto_url', 'is', null);

            if (fError) throw fError;

            logger.info(`🔄 Iniciando sincronização em massa para terminal ${terminal.nome} (${pessoas.length} pessoas)`);

            let successCount = 0;
            for (const pessoa of pessoas) {
                const ok = await this.pushToTerminal(pessoa, terminal);
                if (ok) successCount++;
            }

            return { success: true, count: successCount, total: pessoas.length };
        } catch (error) {
            logger.error(`❌ Erro na sincronização do terminal ${terminalId}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Lógica de envio conforme a marca do terminal
     */
    async pushToTerminal(pessoa, terminal) {
        try {
            // Se a foto_url for apenas o caminho relativo no Supabase, precisamos da base64
            const fotoBase64 = await this.getFotoBase64(pessoa.foto_url);
            if (!fotoBase64) return false;

            const service = DeviceFactory.getDevice(terminal);
            return await service.enrollUser(pessoa, fotoBase64);

            return false;
        } catch (error) {
            logger.error(`Erro push terminal ${terminal.nome}:`, error.message);
            return false;
        }
    }

    /**
     * Helper para obter base64 da foto do Supabase Storage ou URL externa
     */
    async getFotoBase64(fotoUrl) {
        try {
            if (!fotoUrl) return null;

            // 1. Se já for Base64 (Data URL), retornar
            if (fotoUrl.startsWith('data:image')) {
                return fotoUrl;
            }

            // 2. Se for URL completa (http/https), baixar usando fetch (mais robusto que axios para arrays de imagens)
            if (fotoUrl.startsWith('http')) {
                logger.info(`📥 Baixando foto externa: ${fotoUrl}`);
                const response = await fetch(fotoUrl);
                if (!response.ok) throw new Error(`Falha download: ${response.statusText}`);

                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                return `data:image/jpeg;base64,${buffer.toString('base64')}`;
            }

            // 3. Se for apenas um path/filename, baixar do bucket 'avatars' (Padrão Supabase)
            logger.info(`📥 Baixando do Storage Supabase: ${fotoUrl}`);
            const { data, error } = await supabase.storage
                .from('avatars')
                .download(fotoUrl);

            if (error) {
                logger.error(`❌ Erro Storage (${fotoUrl}):`, error.message);
                return null;
            }

            const arrayBuffer = await data.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return `data:image/jpeg;base64,${buffer.toString('base64')}`;

        } catch (error) {
            logger.error(`❌ Erro ao obter Base64 da foto: ${error.message}`);
            return null;
        }
    }
}

module.exports = new TerminalSyncService();
