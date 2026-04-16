const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const DeviceFactory = require('./adapters/DeviceFactory');

class DeviceController {

    // Listar todos os dispositivos
    async list(req, res) {
        try {
            let query = supabase.from('dispositivos_acesso').select('*');
            const evento_id = req.event.id;
            query = query.eq('evento_id', evento_id);
            const { data, error } = await query;
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Cadastrar dispositivo
    async create(req, res) {
        try {
            const { nome, marca, tipo, ip_address, porta, user, password } = req.body;
            let rtsp_url = '';

            // Lógica de Instanciação Polimórfica (Factory)
            const device = DeviceFactory.getDevice({ ip_address, porta, user, password, marca });
            if (device.getRTSPUrl) {
                rtsp_url = device.getRTSPUrl();
            }

            const { data, error } = await supabase
                .from('dispositivos_acesso')
                .insert([{
                    evento_id: req.event.id,
                    nome,
                    marca, // Novo campo
                    tipo,
                    ip_address,
                    porta,
                    user_device: user, // Evitar conflito com keywords SQL
                    password_device: password, // Armazenar de forma segura em prod
                    rtsp_url,
                    config: req.body.config || { modo_identificacao: false },
                    status: 'online' // Simulado
                }])
                .select()
                .single();

            if (error) throw error;
            logger.info(`📸 Dispositivo adicionado: ${nome} (${marca})`);

            // Auto-configurar Push
            if (marca === 'intelbras') {
                try {
                    const device = DeviceFactory.getDevice({ ip_address, porta, user, password, marca });

                    // Tentar determinar IP do servidor
                    const serverIp = process.env.SERVER_IP || this._getLocalIp() || req.ip;
                    logger.info(`⚙️ Auto-configurando Push para ${serverIp}...`);

                    await device.configureEventPush(serverIp);
                } catch (pushError) {
                    logger.error('Erro ao auto-configurar push:', pushError);
                    // Não falhar a criação se o push falhar
                }
            }

            res.status(201).json({ success: true, data });

        } catch (error) {
            logger.error('Erro ao criar dispositivo:', error);
            res.status(500).json({ error: error.message });
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

            const success = await device.configureEventPush(targetIp, server_port || 3001);

            if (success) {
                res.json({ success: true, message: `Push configurado para ${targetIp}` });
            } else {
                res.status(500).json({ error: 'Falha ao configurar push no dispositivo' });
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
            const { error } = await supabase
                .from('dispositivos_acesso')
                .delete()
                .eq('id', id);

            if (error) throw error;
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
            const { nome, marca, tipo, ip_address, porta, user, password, user_device, password_device, config } = req.body;

            const updates = {};
            if (nome !== undefined) updates.nome = nome;
            if (marca !== undefined) updates.marca = marca;
            if (tipo !== undefined) updates.tipo = tipo;
            if (ip_address !== undefined) updates.ip_address = ip_address;
            if (porta !== undefined) updates.porta = parseInt(porta, 10);
            if (config !== undefined) updates.config = config;

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
}

module.exports = new DeviceController();
