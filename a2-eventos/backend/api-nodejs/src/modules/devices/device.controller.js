const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const DeviceFactory = require('./adapters/DeviceFactory');
const { TIMEOUT_CONFIG } = require('../../config/timeouts');

class DeviceController {

    constructor() {
        this.create = this.create.bind(this);
        this.configurePush = this.configurePush.bind(this);
    }

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
                logger.error(
                    { err: error, event_id: evento_id },
                    'Failed to fetch devices from database'
                );
                throw error;
            }

            logger.info('Devices listed', {
                device_count: data?.length || 0,
                event_id: evento_id,
                user_id: req.user?.id,
                user_role: req.user?.role
            });

            res.json({ success: true, data });
        } catch (error) {
            logger.error(
                { err: error, event_id: evento_id, user_id: req.user?.id },
                'Error listing devices'
            );
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
            const {
                nome,
                marca,
                tipo,
                ip_address,
                porta,
                user,
                password,
                user_device,
                password_device,
                modo,
                area_nome,
                area_id,
                offline_mode,
                config
            } = req.body;

            const normalizedUserInput = typeof user_device === 'string' ? user_device.trim() : user_device;
            const normalizedPasswordInput = typeof password_device === 'string' ? password_device.trim() : password_device;
            const fallbackUserInput = typeof user === 'string' ? user.trim() : user;
            const fallbackPasswordInput = typeof password === 'string' ? password.trim() : password;

            const normalizedUser = normalizedUserInput || fallbackUserInput || process.env.INTELBRAS_DEFAULT_USER || 'admin';
            const normalizedPassword = normalizedPasswordInput || fallbackPasswordInput || process.env.INTELBRAS_DEFAULT_PASS || 'admin123';
            const normalizedAreaId = area_id ?? config?.area_id ?? null;
            const normalizedPort = Number.isInteger(porta) ? porta : (parseInt(porta, 10) || 80);
            let rtsp_url = '';

            // Lógica de Instanciação Polimórfica (Factory)
            const device = DeviceFactory.getDevice({
                ip_address,
                porta: normalizedPort,
                marca,
                user_device: normalizedUser,
                password_device: normalizedPassword,
                user: normalizedUser,
                password: normalizedPassword
            });
            if (device.getRTSPUrl) {
                rtsp_url = device.getRTSPUrl();
            }

            if (!req.event?.id) {
                logger.error(
                    { user_email: req.user?.email, user_id: req.user?.id },
                    'Attempt to create device without event context'
                );
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
                    porta: normalizedPort,
                    user_device: normalizedUser,
                    password_device: normalizedPassword,
                    rtsp_url,
                    config: config || { fluxo: 'checkin', controla_rele: true },
                    modo: modo || 'ambos',
                    area_id: normalizedAreaId,
                    area_nome: area_nome || null,
                    offline_mode: offline_mode || 'fail_closed',
                    status_online: 'offline'
                }])
                .select()
                .single();

            if (error) {
                logger.error(
                    { err: error, event_id: req.event.id, device_name: nome },
                    'Failed to create device in database'
                );
                throw error;
            }

            logger.info('Device created', {
                device_id: data.id,
                device_name: nome,
                device_brand: marca,
                device_type: tipo,
                device_ip: ip_address,
                device_port: normalizedPort,
                event_id: req.event.id,
                user_id: req.user?.id
            });

            // Auto-configurar Push
            if (marca === 'intelbras') {
                try {
                    const deviceInst = DeviceFactory.getDevice({
                        ip_address,
                        porta: normalizedPort,
                        marca,
                        user_device: normalizedUser,
                        password_device: normalizedPassword,
                        user: normalizedUser,
                        password: normalizedPassword,
                        control_token: data.control_token,
                        config: data.config
                    });
                    const callbackPort = process.env.HARDWARE_CALLBACK_PORT || process.env.SERVER_PORT || 80;
                    const target = this._resolvePushTarget(req, process.env.SERVER_IP, callbackPort);

                    logger.info('Configuring device online mode', {
                        device_id: data.id,
                        device_name: nome,
                        callback_host: target.host,
                        callback_port: target.port,
                        use_https: Number(target.port) === 443
                    });

                    // Modo online: dispositivo pergunta ao servidor antes de liberar
                    await deviceInst.configureOnlineMode(target.host, target.port, {
                        useHttps: Number(target.port) === 443
                    });
                } catch (pushError) {
                    logger.error(
                        { err: pushError, device_id: data.id, device_name: nome },
                        'Failed to configure device online mode'
                    );
                }
            }

            res.status(201).json({ success: true, data });

        } catch (error) {
            logger.error(
                { err: error, user_id: req.user?.id, device_name: req.body?.nome },
                'Unexpected error creating device'
            );
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

    _normalizeRequestIp(ip) {
        if (!ip) return null;
        return String(ip).replace('::ffff:', '');
    }

    _resolvePushTarget(req, explicitHost, explicitPort) {
        const forwardedProto = req.get('x-forwarded-proto');
        const reqProto = forwardedProto ? forwardedProto.split(',')[0].trim() : (req.secure ? 'https' : 'http');

        let host = explicitHost || null;
        let port = explicitPort !== undefined && explicitPort !== null ? parseInt(explicitPort, 10) : null;

        if (host && /^https?:\/\//i.test(host)) {
            try {
                const parsed = new URL(host);
                host = parsed.hostname;
                if (!port) {
                    port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
                }
            } catch {
                // ignora URL inválida e mantém o valor bruto
            }
        }

        if (host && host.includes(':') && !host.includes(']')) {
            const [h, p] = host.split(':');
            host = h;
            if (!port && p) {
                const parsed = parseInt(p, 10);
                if (!Number.isNaN(parsed)) port = parsed;
            }
        }

        if (!host) {
            host = process.env.SERVER_IP || process.env.PUBLIC_API_HOST || process.env.API_PUBLIC_HOST || null;
        }

        if (!port) {
            const envPort = process.env.SERVER_PORT || process.env.PUBLIC_API_PORT;
            if (envPort) {
                const parsed = parseInt(envPort, 10);
                if (!Number.isNaN(parsed)) port = parsed;
            }
        }

        if (!host) {
            const forwardedHost = req.get('x-forwarded-host') || req.get('host');
            if (forwardedHost) {
                host = forwardedHost;
                if (host.includes(':') && !host.includes(']')) {
                    const [h, p] = host.split(':');
                    host = h;
                    if (!port && p) {
                        const parsed = parseInt(p, 10);
                        if (!Number.isNaN(parsed)) port = parsed;
                    }
                }
            }
        }

        if (!host) {
            host = this._getLocalIp() || this._normalizeRequestIp(req.ip);
        }

        if (!port) {
            port = reqProto === 'https' ? 443 : (parseInt(process.env.PORT || 3001, 10) || 3001);
        }

        return { host, port, proto: reqProto };
    }

    // Configurar Push Manualmente
    async configurePush(req, res) {
        try {
            const { id } = req.params;
            const { server_ip, server_port } = req.body; // Opcional, se não vier usa host público
            const callbackPort = server_port || process.env.HARDWARE_CALLBACK_PORT || process.env.SERVER_PORT || 80;

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
            const target = this._resolvePushTarget(req, server_ip, callbackPort);
            let success = false;
            let modeLabel = 'Push de Eventos';

            if (typeof device.configureOnlineMode === 'function') {
                success = await device.configureOnlineMode(target.host, target.port, {
                    useHttps: Number(target.port) === 443
                });
                modeLabel = 'Modo Online';
            } else if (typeof device.configureEventPush === 'function') {
                success = await device.configureEventPush(target.host, target.port);
                modeLabel = 'Push de Eventos';
            } else {
                return res.status(400).json({ error: 'Este dispositivo não suporta configuração remota de push.' });
            }

            if (success) {
                res.json({ success: true, message: `${modeLabel} configurado → ${target.host}:${target.port}` });
            } else {
                res.status(500).json({ error: `Falha ao configurar ${modeLabel.toLowerCase()} no dispositivo` });
            }

        } catch (error) {
            logger.error(
                { err: error, device_id: req.params.id },
                'Error configuring device push'
            );
            res.status(500).json({ error: error.message });
        }
    }

    // Sincronizar dispositivo (Forçar envio de todos os rostos)
    async sync(req, res) {
        try {
            const { id } = req.params;
            const terminalSyncService = require('./terminalSync.service');

            logger.info('Syncing device faces', {
                device_id: id,
                event_id: req.event?.id,
                user_id: req.user?.id
            });

            const result = await terminalSyncService.syncTerminal(id);
            res.json(result);
        } catch (error) {
            logger.error(
                { err: error, device_id: req.params.id, event_id: req.event?.id },
                'Error syncing device'
            );
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
        }, TIMEOUT_CONFIG.DEVICE_CONNECTION); // Timeout padronizado em config/timeouts.js

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
                let userMessage = `Falha na conexão: ${err.message}`;
                if (err.code === 'ECONNREFUSED') {
                    userMessage = `Conexão recusada (${ip_address}:${porta} não está aceitando conexões)`;
                } else if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') {
                    userMessage = `Host/rede inacessível (verifique o IP e conectividade)`;
                } else if (err.code === 'ENOTFOUND') {
                    userMessage = `Host não encontrado (verifique se o IP é válido)`;
                }
                res.status(503).json({ success: false, error: userMessage });
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
                logger.info('Door open command sent', {
                    device_id: id,
                    device_name: deviceData.nome,
                    device_ip: deviceData.ip_address,
                    command_type: 'REMOTE_OPEN',
                    event_id: req.event?.id,
                    user_id: req.user?.id
                });
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
                .maybeSingle();

            if (error) throw error;
            if (!deviceData) return res.status(404).json({ error: 'Dispositivo não encontrado' });

            const deviceService = DeviceFactory.getDevice(deviceData);

            const SNAPSHOT_TIMEOUT = 20000;
            const snapshotBuffer = await Promise.race([
                deviceService.getSnapshot(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout ao capturar imagem do dispositivo')), SNAPSHOT_TIMEOUT)
                )
            ]);

            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(snapshotBuffer);

        } catch (error) {
            logger.error(
                { err: error, device_id: req.params.id },
                'Error capturing device snapshot'
            );
            res.status(500).json({ error: 'Falha ao obter imagem da câmera' });
        }
    }

    // Atualizar configuração de dispositivo
    async update(req, res) {
        try {
            const { id } = req.params;
            const { nome, marca, tipo, ip_address, porta, user, password, user_device, password_device, config, modo, area_nome, area_id, offline_mode } = req.body;

            const updates = {};
            if (nome !== undefined) updates.nome = nome;
            if (marca !== undefined) updates.marca = marca;
            if (tipo !== undefined) updates.tipo = tipo;
            if (ip_address !== undefined) updates.ip_address = ip_address;
            if (porta !== undefined) updates.porta = parseInt(porta, 10);
            if (config !== undefined) updates.config = config;
            if (modo !== undefined) updates.modo = modo;
            if (area_id !== undefined) updates.area_id = area_id;
            else if (config?.area_id !== undefined) updates.area_id = config.area_id;
            if (area_nome !== undefined) updates.area_nome = area_nome;
            if (offline_mode !== undefined) updates.offline_mode = offline_mode;

            const normalizedUserInput = typeof user_device === 'string' ? user_device.trim() : user_device;
            const fallbackUserInput = typeof user === 'string' ? user.trim() : user;
            if (normalizedUserInput) updates.user_device = normalizedUserInput;
            else if (fallbackUserInput) updates.user_device = fallbackUserInput;

            const normalizedPasswordInput = typeof password_device === 'string' ? password_device.trim() : password_device;
            const fallbackPasswordInput = typeof password === 'string' ? password.trim() : password;
            if (normalizedPasswordInput) updates.password_device = normalizedPasswordInput;
            else if (fallbackPasswordInput) updates.password_device = fallbackPasswordInput;

            const { data, error } = await supabase
                .from('dispositivos_acesso')
                .update(updates)
                .eq('id', id)
                .eq('evento_id', req.event.id)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) return res.status(404).json({ error: 'Dispositivo não encontrado ou sem permissão' });

            logger.info('Device updated', {
                device_id: req.params.id,
                event_id: req.event?.id,
                user_id: req.user?.id,
                updated_fields: Object.keys(req.body)
            });

            res.json({ success: true, data });
        } catch (error) {
            logger.error(
                { err: error, device_id: req.params.id },
                'Error updating device'
            );
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
                logger.info('Badge printed', {
                    printer_id: p.id,
                    printer_name: p.nome,
                    printer_ip: p.ip_address,
                    person_id: pessoa.id,
                    event_id: evento_id || req.event?.id,
                    user_id: req.user?.id
                });
            } else {
                logger.warn('No printer configured for badge printing', {
                    event_id: evento_id || req.event?.id,
                    person_id: pessoa.id
                });
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
            logger.error(
                { err: error, event_id: req.event?.id, user_id: req.user?.id },
                'Error printing badge'
            );
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
                logger.error(
                    { err: error, event_id: evento_id },
                    'Failed to fetch sync queue from database'
                );

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

            logger.info('Sync queue listed', {
                queue_count: items.length,
                event_id: evento_id,
                user_id: req.user?.id
            });

            res.json({ success: true, data: items });
        } catch (error) {
            logger.error(
                { err: error, event_id: req.event?.id, user_id: req.user?.id },
                'Error fetching sync queue'
            );
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
            const syncScheduler = require('./syncScheduler.service');

            logger.info('Forcing queue reprocessing', {
                event_id: req.event?.id,
                user_id: req.user?.id
            });

            await syncScheduler.runManualSync();
            res.json({ success: true, message: 'Fila reprocessada com sucesso.' });
        } catch (error) {
            logger.error(
                { err: error, event_id: req.event?.id, user_id: req.user?.id },
                'Error forcing queue reprocessing'
            );
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
                }, TIMEOUT_CONFIG.DEVICE_HEALTH_CHECK); // Timeout padronizado

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

            logger.info('Device health checked', {
                device_id: deviceData.id,
                device_name: deviceData.nome,
                device_ip: deviceData.ip_address,
                online: tcpResult.online,
                latency_ms: tcpResult.latency,
                event_id: req.event?.id
            });

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
            logger.error(
                { err: error, device_id: req.params.id, event_id: req.event?.id },
                'Error checking device health'
            );
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new DeviceController();
