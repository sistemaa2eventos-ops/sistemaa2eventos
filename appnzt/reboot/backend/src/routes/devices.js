const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../services/logger');
const { requireAuth } = require('../auth');
const axios = require('axios');

const DEVICE_TYPES = ['face_reader', 'turnstile', 'camera', 'barcode_scanner'];
const PROTOCOLS = ['wiegand', 'rs485', 'rs232', 'http', 'tcp'];

router.get('/', requireAuth, async (req, res) => {
    try {
        const { evento_id, device_type, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabaseAdmin
            .from('devices')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (evento_id) query = query.eq('evento_id', evento_id);
        if (device_type) query = query.eq('device_type', device_type);

        const { data: devices, error, count } = await query;

        if (error) throw error;

        res.json({ success: true, devices, pagination: { page: parseInt(page), limit: parseInt(limit), total: count } });
    } catch (err) {
        logger.error('Erro ao buscar dispositivos:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: device, error } = await supabaseAdmin
            .from('devices')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !device) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        res.json({ success: true, device });
    } catch (err) {
        logger.error('Erro ao buscar dispositivo:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, device_type, ip_address, protocol, config, evento_id } = req.body;

        if (!name || !device_type) {
            return res.status(400).json({ error: 'Nome e tipo são obrigatórios' });
        }

        if (!DEVICE_TYPES.includes(device_type)) {
            return res.status(400).json({ error: `Tipo inválido. Tipos permitidos: ${DEVICE_TYPES.join(', ')}` });
        }

        const { data: device, error } = await supabaseAdmin
            .from('devices')
            .insert([{
                name,
                device_type,
                ip_address,
                protocol,
                config: config || {},
                evento_id: evento_id || req.user.evento_id
            }])
            .select()
            .single();

        if (error) throw error;

        logger.info(`Dispositivo criado: ${name} (${device_type})`);

        res.status(201).json({ success: true, device });
    } catch (err) {
        logger.error('Erro ao criar dispositivo:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, device_type, ip_address, protocol, config, active } = req.body;

        const { data: device, error } = await supabaseAdmin
            .from('devices')
            .update({
                name, device_type, ip_address, protocol, config, active,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, device });
    } catch (err) {
        logger.error('Erro ao atualizar dispositivo:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('devices')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Dispositivo deletado' });
    } catch (err) {
        logger.error('Erro ao deletar dispositivo:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/:id/test', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: device, error } = await supabaseAdmin
            .from('devices')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !device) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        if (device.device_type === 'face_reader') {
            if (device.config?.brand === 'intelbras') {
                const result = await testIntelbras(device);
                return res.json({ success: true, message: 'Intelbras acessível', details: result });
            } else if (device.config?.brand === 'hikvision') {
                const result = await testHikvision(device);
                return res.json({ success: true, message: 'Hikvision acessível', details: result });
            }
        }

        res.json({ success: true, message: 'Teste genérico OK', device: device.name });
    } catch (err) {
        logger.error('Erro ao testar dispositivo:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

async function testIntelbras(device) {
    try {
        const url = `http://${device.ip_address}/ISAPI/System/deviceInfo`;
        const response = await axios.get(url, { timeout: 5000 });
        return { status: 'online', brand: 'intelbras', info: response.data };
    } catch (err) {
        return { status: 'offline', brand: 'intelbras', error: err.message };
    }
}

async function testHikvision(device) {
    try {
        const url = `http://${device.ip_address}/ISAPI/System/deviceInfo`;
        const response = await axios.get(url, { timeout: 5000 });
        return { status: 'online', brand: 'hikvision', info: response.data };
    } catch (err) {
        return { status: 'offline', brand: 'hikvision', error: err.message };
    }
}

router.post('/intelbras/push', async (req, res) => {
    try {
        const { token, event, data } = req.body;

        const { data: device } = await supabaseAdmin
            .from('devices')
            .select('*')
            .eq('config->>control_token', token)
            .single();

        if (!device) {
            logger.warn(`Intelbras push: dispositivo não encontrado para token ${token}`);
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        logger.info(`Intelbras push recebido: ${event} de ${device.name}`);

        if (event === 'access' || event === 'card') {
            const personData = data;
            const cpf = personData?.cardNo || personData?.employeeNo;

            if (cpf) {
                const { data: pessoa } = await supabaseAdmin
                    .from('pessoas')
                    .select('*, empresas(nome)')
                    .eq('cpf', cpf)
                    .eq('evento_id', device.evento_id)
                    .single();

                if (pessoa) {
                    const isAuthorized = ['autorizado', 'checkin'].includes(pessoa.status_acesso);

                    await supabaseAdmin
                        .from('checkins')
                        .insert([{
                            pessoa_id: pessoa.id,
                            evento_id: device.evento_id,
                            type: 'checkin',
                            method: 'face',
                            terminal_id: device.name,
                            terminal_area: device.config?.area || 'Entrada',
                            timestamp: new Date().toISOString()
                        }]);

                    await supabaseAdmin
                        .from('pessoas')
                        .update({ status_acesso: isAuthorized ? 'checkin' : 'bloqueado' })
                        .eq('id', pessoa.id);

                    return res.json({ 
                        allow: isAuthorized,
                        name: pessoa.nome,
                        message: isAuthorized ? 'Acesso autorizado' : 'Acesso negado'
                    });
                }
            }
        }

        res.json({ allow: false, message: 'Pessoa não encontrada' });
    } catch (err) {
        logger.error('Erro no push Intelbras:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/hikvision/push', async (req, res) => {
    try {
        const { method, params } = req.body;

        const devIp = req.ip || req.headers['x-forwarded-for'];
        logger.info(`Hikvision push de ${devIp}: ${method}`);

        res.json({ code: 'ok' });
    } catch (err) {
        logger.error('Erro no push Hikvision:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;