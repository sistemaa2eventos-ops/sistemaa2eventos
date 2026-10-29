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
     * Sincroniza as pessoas do evento com um terminal específico.
     * Só envia quem pode ficar no terminal (status ativo e área compatível)
     * e remove quem não pode. Com { reset: true }, apaga tudo do terminal antes.
     */
    async syncTerminal(terminalId, { reset = false } = {}) {
        let terminal = null;
        try {
            const { data, error: tError } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('id', terminalId)
                .single();

            if (tError || !data) throw new Error('Terminal não encontrado');
            terminal = data;

            const syncService = require('./sync.service');
            const { getHwUserIdCandidates } = require('./hwUserId');

            await supabase.from('dispositivos_acesso').update({ sync_status: 'sincronizando' }).eq('id', terminalId);

            // Pessoas primeiro (todas, sem o corte de 1000; sem face_encoding) e áreas do evento
            // de uma vez. Só depois limpa o terminal: falha na busca não deixa o leitor vazio.
            const { buscarTodos } = require('../../utils/buscarTodos');
            const { COLUNAS_PESSOA_ACESSO } = require('../checkin/services/colunasPessoa');
            const { data: pessoas, error: fError } = await buscarTodos(supabase
                .from('pessoas')
                .select(COLUNAS_PESSOA_ACESSO)
                .eq('evento_id', terminal.evento_id));

            if (fError) throw fError;
            const ctxAreas = await syncService._carregarContextoSync(terminal.evento_id);
            if (!ctxAreas) throw new Error('Falha ao carregar as áreas do evento');

            // Direto ou via agente local (transporte escolhido pelo serviço do terminal)
            const directService = DeviceFactory.getDevice(terminal);
            if (reset && directService?.clearAllFaces) {
                await directService.clearAllFaces();
                logger.info(`🧹 Terminal ${terminal.nome} limpo antes da sincronização`);
            }

            const enviar = [];
            const remover = [];
            for (const pessoa of pessoas) {
                if (syncService._statusRemoveDosTerminais(pessoa)) { remover.push(pessoa); continue; }
                const areaIds = await syncService._getPessoaAreaIds(pessoa, ctxAreas);
                if (!syncService._terminalAceitaPessoa(terminal, areaIds)) { remover.push(pessoa); continue; }
                if (pessoa.foto_url) enviar.push(pessoa);
            }

            logger.info(`🔄 Sincronização do terminal ${terminal.nome}: ${enviar.length} para enviar, ${remover.length} para remover`);

            let successCount = 0;
            for (const pessoa of enviar) {
                const ok = await this.pushToTerminal(pessoa, terminal);
                if (ok) successCount++;
            }

            if (directService && !reset) {
                for (const pessoa of remover) {
                    for (const id of getHwUserIdCandidates(pessoa)) await directService.deleteUser(id);
                }
            }

            let totalNoTerminal = null;
            if (directService?.countUsers) {
                try { totalNoTerminal = await directService.countUsers(); } catch (_) { /* informativo */ }
            }

            await supabase.from('dispositivos_acesso').update({
                sync_status: successCount === enviar.length ? 'sucesso' : 'erro',
                ultima_sincronizacao: new Date().toISOString(),
                faces_cadastradas: totalNoTerminal ?? successCount
            }).eq('id', terminalId);

            return { success: true, count: successCount, total: enviar.length, removidos: remover.length, usuarios_no_terminal: totalNoTerminal };
        } catch (error) {
            logger.error(`❌ Erro na sincronização do terminal ${terminalId}: ${error.message}`);
            if (terminal) {
                await supabase.from('dispositivos_acesso').update({ sync_status: 'erro' }).eq('id', terminalId);
            }
            return { success: false, error: error.message };
        }
    }

    /**
     * Lógica de envio conforme a marca do terminal.
     * Se o terminal tiver agent_id, roteia via agente local.
     * Se não, tenta conexão direta (legado / rede local acessível).
     */
    async pushToTerminal(pessoa, terminal) {
        try {
            const fotoBase64 = await this.getFotoBase64(pessoa.foto_url);
            if (!fotoBase64) return false;

            // O serviço do terminal usa o agente local automaticamente quando terminal.agent_id existe
            const service = DeviceFactory.getDevice(terminal);
            return await service.enrollUser(pessoa, fotoBase64);
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
