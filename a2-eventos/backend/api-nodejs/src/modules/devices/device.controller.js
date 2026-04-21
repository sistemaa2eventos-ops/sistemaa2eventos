const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const DeviceFactory = require('./adapters/DeviceFactory');

class DeviceController {

    async list(req, res) {
        try {
            const evento_id = req.event?.id;
            if (!evento_id) {
                return res.status(400).json({ error: 'Contexto de evento não identificado' });
            }

            const { data, error } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('evento_id', evento_id)
                .order('nome', { ascending: true });

            if (error) {
                logger.error(`❌ Erro Supabase [DeviceController.list]: ${error.message}`, error);
                throw error;
            }

            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro fatal ao listar dispositivos:', error);
            res.status(500).json({ 
                error: 'Erro ao buscar dispositivos', 
                message: error.message,
                details: error.details || error.hint
            });
        }
    }

    // Cadastrar dispositivo
    async create(req, res) {
        try {
            const { nome, marca, tipo, ip_address, porta, user, password, modo, area_nome, offline_mode } = req.body;
            let rtsp_url = '';

            // Lógica de Instanciação Polimórfica (Factory)
            const device = DeviceFactory.getDevice({ ip_address, porta, user, password, marca });
            if (device.getRTSPUrl) {
                rtsp_url = device.getRTSPUrl();
            }

            if (!req.event?.id) {
                logger.error(`❌ Tentativa de criar dispositivo sem evento_id: ${req.user.email}`);
                return res.status(400).json({ error: 'Contexto de evento (Nexus) não identificado. Recarregue a página.' });
            }

            const { data, error } = await supabase
                .from('dispositivos_acesso')
                .insert([{
                    evento_id: req.event.id,
                    nome,
                    marca,
                    tipo,
                    ip_address,
                    porta,
                    user_device: user,
                    password_device: password,
                    rtsp_url,
                    config: req.body.config || { fluxo: 'checkin', controla_rele: true },
                    modo: modo || 'ambos',
                    area_nome: area_nome || null,
                    offline_mode: offline_mode || 'fail_closed',
                    status_online: 'offline'
                }])
                .select()
                .single();

            if (error) {
                logger.error(`❌ Erro no Supabase ao criar dispositivo: ${error.message}`, error);
                throw error;
            }
            logger.info(`📸 Dispositivo adicionado: ${nome} (${marca})`);

            // Auto-configurar Push
            if (marca === 'intelbras') {
                try {
                    const deviceInst = DeviceFactory.getDevice({ ip_address, porta, user, password, marca, control_token: data.control_token, config: data.config });
                    const serverIp = process.env.SERVER_IP || this._getLocalIp() || req.ip;
                    const serverPort = parseInt(process.env.PORT || 3001);
                    logger.info(`⚙️ Auto-configurando Modo Online para ${serverIp}:${serverPort}...`);

                    // Modo online: dispositivo pergunta ao servidor antes de liberar
                    await deviceInst.configureOnlineMode(serverIp, serverPort);
                } catch (pushError) {
                    logger.error(`⚠️ Erro ao auto-configurar modo online para ${nome}: ${pushError.message}`);
                }
            }

            res.status(201).json({ success: true, data });

        } catch (error) {
            logger.error(`🚨 Erro Crítico [DeviceController.create]: ${error.message}`, {
                stack: error.stack,
                body: req.body,
                user: req.user?.id
            });
            res.status(500).json({ error: 'Falha interna ao criar dispositivo. Detalhes registrados no log.' });
        }
    }

    // Helper para pegar IP local
    _getLocalIp() {
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return null;
    }

    // Configurar Push Manualmente
    async configurePush(req, res) {
        try {
            const { id } = req.params;
            const { server_ip, server_port } = req.body; // Opcional, se não vier usa auto-detect

            const { data: deviceData, error } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !deviceData) throw new Error('Dispositivo não encontrado');

            if (deviceData.marca !== 'intelbras' && deviceData.marca !== 'hikvision') {
                return res.status(400).json({ error: 'Marca de dispositivo não suporta configuração automática de push.' });
            }

            const device = DeviceFactory.getDevice(deviceData);
            const targetIp = server_ip || process.env.SERVER_IP || this._getLocalIp() || req.ip;

            const targetPort = server_port || parseInt(process.env.PORT || 3001);
            const success = await device.configureOnlineMode(targetIp, targetPort);

            if (success) {
                res.json({ success: true, message: `Modo Online configurado → ${targetIp}:${targetPort}` });
            } else {
                res.status(500).json({ error: 'Falha ao configurar modo online no dispositivo' });
            }

        } catch (error) {
            logger.error('Erro ao configurar push:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Sincronizar dispositivo (Forçar envio de todos os rostos)
    async sync(req, res) {
        try {
            const { id } = req.params;
            const terminalSyncService = require('./terminalSync.service');

            const result = await terminalSyncService.syncTerminal(id);
            res.json(result);
        } catch (error) {
            logger.error('Erro ao sincronizar dispositivo:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Testar Conexão (Real TCP Check)
    async testConnection(req, res) {
        const { ip_address, porta } = req.body;
        const net = require('net');

        const client = new net.Socket();
        let finished = false;

        const timeout = setTimeout(() => {
            if (!finished) {
                finished = true;
                client.destroy();
                res.status(408).json({ success: false, error: 'Timeout: Terminal não respondeu no tempo limite.' });
            }
        }, 5000);

        client.connect(porta || 80, ip_address, () => {
            finished = true;
            clearTimeout(timeout);
            client.destroy();
            res.json({ success: true, message: `Conexão estabelecida com sucesso em ${ip_address}:${porta || 80}` });
        });

        client.on('error', (err) => {
            if (!finished) {
                finished = true;
                clearTimeout(timeout);
                client.destroy();
                res.status(503).json({ success: false, error: `Falha na conexão: ${err.message}` });
            }
        });
    }

    // Abrir porta remotamente (Pulso)
    async remoteOpen(req, res) {
        try {
            const { id } = req.params;
            const { data: deviceData, error } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !deviceData) throw new Error('Dispositivo não encontrado');

            const deviceService = DeviceFactory.getDevice(deviceData);
            const success = await deviceService.openDoor();

            if (success) {
                logger.info(`⚡ Comando OPEN enviado para ${deviceData.nome} (${deviceData.ip_address})`);
                res.json({ success: true, message: 'Comando enviado com sucesso.' });
            } else {
                res.status(500).json({ error: 'Falha ao executar comando no hardware.' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Liberar porta (Manter aberta)
    async remoteUnlock(req, res) {
        try {
            const { id } = req.params;
            const { data: deviceData, error } = await supabase.from('dispositivos_acesso').select('*').eq('id', id).single();
            if (error || !deviceData) throw new Error('Dispositivo não encontrado');

            const deviceService = DeviceFactory.getDevice(deviceData);
            const success = await deviceService.unlockDoor();

            if (success) {
                res.json({ success: true, message: 'Acesso LIBERADO permanentemente.' });
            } else {
                res.status(500).json({ error: 'Falha ao executar comando.' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Travar porta (Bloqueio total)
    async remoteLock(req, res) {
        try {
            const { id } = req.params;
            const { data: deviceData, error } = await supabase.from('dispositivos_acesso').select('*').eq('id', id).single();
            if (error || !deviceData) throw new Error('Dispositivo não encontrado');

            const deviceService = DeviceFactory.getDevice(deviceData);
            const success = await deviceService.lockDoor();

            if (success) {
                res.json({ success: true, message: 'Acesso TRAVADO (Bloqueio Total).' });
            } else {
                res.status(500).json({ error: 'Falha ao executar comando.' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Voltar porta ao estado normal
    async remoteClose(req, res) {
        try {
            const { id } = req.params;
            const { data: deviceData, error } = await supabase.from('dispositivos_acesso').select('*').eq('id', id).single();
            if (error || !deviceData) throw new Error('Dispositivo não encontrado');

            const deviceService = DeviceFactory.getDevice(deviceData);
            const success = await deviceService.closeDoor();

            if (success) {
                res.json({ success: true, message: 'Estado NORMAL restaurado.' });
            } else {
                res.status(500).json({ error: 'Falha ao executar comando.' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Deletar dispositivo
    async delete(req, res) {
        try {
            const { id } = req.params;
            const { data, error } = await supabase
                .from('dispositivos_acesso')
                .delete()
                .eq('id', id)
                .eq('evento_id', req.event.id)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) {
                return res.status(404).json({ error: 'Dispositivo não encontrado neste evento.' });
            }
            res.json({ success: true, message: 'Dispositivo removido.' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Obter Snapshot (JPEG) da câmera proxy
    async getSnapshot(req, res) {
        try {
            const { id } = req.params;
            const { data: deviceData, error } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !deviceData) throw new Error('Dispositivo não encontrado');

            const deviceService = DeviceFactory.getDevice(deviceData);

            const snapshotBuffer = await deviceService.getSnapshot();

            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(snapshotBuffer);

        } catch (error) {
            logger.error('Erro ao buscar snapshot:', error);
            res.status(500).json({ error: 'Falha ao obter imagem da câmera' });
        }
    }

    // Atualizar configuração de dispositivo
    async update(req, res) {
        try {
            const { id } = req.params;
            const { nome, marca, tipo, ip_address, porta, user, password, user_device, password_device, config, modo, area_nome, offline_mode } = req.body;

            const updates = {};
            if (nome !== undefined) updates.nome = nome;
            if (marca !== undefined) updates.marca = marca;
            if (tipo !== undefined) updates.tipo = tipo;
            if (ip_address !== undefined) updates.ip_address = ip_address;
            if (porta !== undefined) updates.porta = parseInt(porta, 10);
            if (config !== undefined) updates.config = config;
            if (modo !== undefined) updates.modo = modo;
            if (area_nome !== undefined) updates.area_nome = area_nome;
            if (offline_mode !== undefined) updates.offline_mode = offline_mode;

            if (user_device !== undefined) updates.user_device = user_device;
            else if (user !== undefined) updates.user_device = user;

            if (password_device !== undefined) updates.password_device = password_device;
            else if (password !== undefined) updates.password_device = password;

            const { data, error } = await supabase
                .from('dispositivos_acesso')
                .update(updates)
                .eq('id', id)
                .eq('evento_id', req.event.id)
                .select()
                .single();

            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            logger.error('Erro ao atualizar dispositivo:', error);
            res.status(500).json({ error: 'Erro ao atualizar dispositivo' });
        }
    }

    // Imprimir etiqueta/credencial via impressora térmica
    async printLabel(req, res) {
        try {
            const { pessoa_id, evento_id } = req.body;
            if (!pessoa_id) return res.status(400).json({ error: 'pessoa_id é obrigatório' });

            // Buscar dados da pessoa e empresa
            const { data: pessoa, error } = await supabase
                .from('pessoas')
                .select('*, empresas(nome)')
                .eq('id', pessoa_id)
                .single();

            if (error || !pessoa) {
                return res.status(404).json({ error: 'Pessoa não encontrada' });
            }

            // Buscar impressora configurada para o evento
            const { data: printer } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('evento_id', evento_id || req.event?.id)
                .eq('tipo', 'impressora')
                .limit(1);

            const printerService = require('../../services/printerService');
            const buffer = await printerService.generateBadgeBuffer(pessoa, pessoa.empresas?.nome, evento_id || req.event?.id);

            if (printer && printer.length > 0) {
                const p = printer[0];
                printerService.printViaNetwork(p.ip_address, p.porta || 9100, buffer);
                logger.info(`🖨️ Etiqueta enviada para impressora ${p.nome} (${p.ip_address})`);
            } else {
                logger.warn('⚠️ Nenhuma impressora configurada para este evento. Etiqueta gerada mas não enviada.');
            }

            res.json({
                success: true,
                message: 'Etiqueta gerada com sucesso',
                data: {
                    nome: pessoa.nome,
                    empresa: pessoa.empresas?.nome,
                    has_printer: !!(printer && printer.length > 0)
                }
            });
        } catch (error) {
            logger.error('Erro ao imprimir etiqueta:', error);
            res.status(500).json({ error: 'Erro ao gerar etiqueta' });
        }
    }

    // Listar fila de sincronização do evento
    async getQueue(req, res) {
        try {
            const evento_id = req.event?.id;
            if (!evento_id) return res.status(400).json({ error: 'Contexto de evento não identificado' });

            const { data, error } = await supabase
                .from('terminal_sync_queue')
                .select(`
                    *,
                    dispositivos_acesso (
                        nome
                    )
                `)
                .eq('evento_id', evento_id)
                .in('status', ['pendente', 'erro', 'processando'])
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
                logger.error('Erro Supabase ao buscar fila de dispositivos:', error);
                
                // Fallback se a junção falhar (ex: tabela dispositivos_acesso com nome diferente ou sem relação formal)
                if (error.message.includes('relation') || error.message.includes('join')) {
                    const { data: simpleData, error: simpleError } = await supabase
                        .from('terminal_sync_queue')
                        .select('*')
                        .eq('evento_id', evento_id)
                        .limit(100);
                    
                    if (simpleError) throw simpleError;
                    return res.json({ success: true, data: simpleData });
                }
                
                throw error;
            }

            // Flatten device_name para o frontend
            const items = (data || []).map(item => ({
                ...item,
                device_name: item.dispositivos_acesso?.nome ?? (item.dispositivos_acesso?.[0]?.nome) ?? item.dispositivo_id
            }));

            res.json({ success: true, data: items });
        } catch (error) {
            logger.error('Erro fatal ao buscar fila:', error);
            res.status(500).json({ 
                error: 'Erro ao buscar fila de sincronização',
                message: error.message,
                details: error.details
            });
        }
    }

    // Forçar reprocessamento da fila de um dispositivo
    async forceQueue(req, res) {
        try {
            const { id } = req.params;
            const syncScheduler = require('./syncScheduler.service');
            await syncScheduler.runManualSync();
            res.json({ success: true, message: 'Fila reprocessada com sucesso.' });
        } catch (error) {
            logger.error('Erro ao forçar fila:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Health check detalhado do dispositivo
    async getHealth(req, res) {
        try {
            const { id } = req.params;
            const net = require('net');

            const { data: deviceData, error } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !deviceData) throw new Error('Dispositivo não encontrado');

            // Teste de conectividade TCP
            const tcpResult = await new Promise((resolve) => {
                const client = new net.Socket();
                const start  = Date.now();
                let done     = false;

                const timeout = setTimeout(() => {
                    if (!done) { done = true; client.destroy(); resolve({ online: false, latency: null }); }
                }, 4000);

                client.connect(deviceData.porta || 80, deviceData.ip_address, () => {
                    done = true;
                    clearTimeout(timeout);
                    const latency = Date.now() - start;
                    client.destroy();
                    resolve({ online: true, latency });
                });

                client.on('error', () => {
                    if (!done) { done = true; clearTimeout(timeout); client.destroy(); resolve({ online: false, latency: null }); }
                });
            });

            // Atualiza status_online no banco
            const newStatus = tcpResult.online ? 'online' : 'offline';
            await supabase
                .from('dispositivos_acesso')
                .update({ status_online: newStatus, ultimo_ping: new Date().toISOString() })
                .eq('id', id);

            res.json({
                success: true,
                data: {
                    id: deviceData.id,
                    nome: deviceData.nome,
                    ip_address: deviceData.ip_address,
                    porta: deviceData.porta,
                    online: tcpResult.online,
                    latency_ms: tcpResult.latency,
                    status_online: newStatus,
                    ultimo_ping: new Date().toISOString(),
                    marca: deviceData.marca,
                    tipo: deviceData.tipo
                }
            });
        } catch (error) {
            logger.error('Erro no health check:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new DeviceController();
