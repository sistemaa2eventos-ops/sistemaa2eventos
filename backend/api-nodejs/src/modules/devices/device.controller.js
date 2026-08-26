const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const DeviceFactory = require('./adapters/DeviceFactory');
const { testTcpConnection } = require('../../utils/network');
const AppError = require('../../shared/errors/AppError');

class DeviceController {

    // Listar todos os dispositivos
    async list(req, res, next) {
        try {
            let query = supabase.from('dispositivos_acesso').select('*');
            const evento_id = req.event.id;
            query = query.eq('evento_id', evento_id);
            const { data, error } = await query;
            if (error) throw error;
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    }

    // Cadastrar dispositivo
    async create(req, res, next) {
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
                    marca, 
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
                    const deviceInstance = DeviceFactory.getDevice({ ip_address, porta, user, password, marca });

                    // Tentar determinar IP do servidor
                    const serverIp = process.env.SERVER_IP || this._getLocalIp() || req.ip;
                    logger.info(`⚙️ Auto-configurando Push para ${serverIp}...`);

                    await deviceInstance.configureEventPush(serverIp);
                } catch (pushError) {
                    logger.error('Erro ao auto-configurar push:', pushError);
                    // Não falhar a criação se o push falhar
                }
            }

            res.status(201).json({ success: true, data });

        } catch (error) {
            next(error);
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
    async configurePush(req, res, next) {
        try {
            const { id } = req.params;
            const { server_ip, server_port } = req.body; // Opcional, se não vier usa auto-detect

            const { data: deviceData, error } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !deviceData) {
                throw new AppError('Dispositivo não encontrado', 404, 'DEVICE_NOT_FOUND');
            }

            if (deviceData.marca !== 'intelbras') {
                throw new AppError('Apenas dispositivos Intelbras suportam config de push via API', 400, 'BAD_REQUEST');
            }

            const device = DeviceFactory.getDevice(deviceData);
            const targetIp = server_ip || process.env.SERVER_IP || this._getLocalIp() || req.ip;

            const success = await device.configureEventPush(targetIp, server_port || 3001);

            if (success) {
                res.json({ success: true, message: `Push configurado para ${targetIp}` });
            } else {
                throw new AppError('Falha ao configurar push no dispositivo', 500, 'PUSH_CONFIG_FAILED');
            }

        } catch (error) {
            next(error);
        }
    }

    // Sincronizar dispositivo (Forçar envio de todos os rostos)
    async sync(req, res, next) {
        try {
            const { id } = req.params;
            const terminalSyncService = require('./terminalSync.service');

            const result = await terminalSyncService.syncTerminal(id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    // Testar Conexão (Real TCP Check via network helper)
    async testConnection(req, res, next) {
        try {
            const { ip_address, porta } = req.body;
            if (!ip_address) {
                throw new AppError('IP é obrigatório', 400, 'MISSING_PARAMS');
            }

            await testTcpConnection(ip_address, porta || 80, 5000);
            res.json({ success: true, message: `Conexão estabelecida com sucesso em ${ip_address}:${porta || 80}` });
        } catch (error) {
            // Em caso de timeout ou erro de conexão, enviamos resposta com status correto
            const isTimeout = error.message.includes('Timeout');
            const statusCode = isTimeout ? 408 : 503;
            res.status(statusCode).json({ success: false, error: error.message });
        }
    }

    // Deletar dispositivo
    async delete(req, res, next) {
        try {
            const { id } = req.params;
            const { error } = await supabase
                .from('dispositivos_acesso')
                .delete()
                .eq('id', id);

            if (error) throw error;
            res.json({ success: true, message: 'Dispositivo removido.' });
        } catch (error) {
            next(error);
        }
    }

    // Obter Snapshot (JPEG) da câmera proxy
    async getSnapshot(req, res, next) {
        try {
            const { id } = req.params;
            const { data: deviceData, error } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !deviceData) {
                throw new AppError('Dispositivo não encontrado', 404, 'DEVICE_NOT_FOUND');
            }

            const deviceService = DeviceFactory.getDevice(deviceData);
            const snapshotBuffer = await deviceService.getSnapshot();

            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(snapshotBuffer);

        } catch (error) {
            next(new AppError('Falha ao obter imagem da câmera', 500, 'SNAPSHOT_FAILED'));
        }
    }

    // Atualizar configuração de dispositivo
    async update(req, res, next) {
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
            next(error);
        }
    }

    // Imprimir etiqueta/credencial via impressora térmica
    async printLabel(req, res, next) {
        try {
            const { pessoa_id, evento_id } = req.body;
            if (!pessoa_id) {
                throw new AppError('pessoa_id é obrigatório', 400, 'MISSING_PARAMS');
            }

            // Buscar dados da pessoa e empresa
            const { data: pessoa, error } = await supabase
                .from('pessoas')
                .select('*, empresas(nome)')
                .eq('id', pessoa_id)
                .single();

            if (error || !pessoa) {
                throw new AppError('Pessoa não encontrada', 404, 'PERSON_NOT_FOUND');
            }

            // Buscar impressora configurada para o evento
            const { data: printer } = await supabase
                .from('dispositivos_acesso')
                .select('*')
                .eq('evento_id', evento_id || req.event?.id)
                .eq('tipo', 'impressora')
                .limit(1);

            const printerService = require('../../services/printerService');
            const buffer = printerService.generateBadgeBuffer(pessoa, pessoa.empresas?.nome);

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
            next(error);
        }
    }
}

module.exports = new DeviceController();
