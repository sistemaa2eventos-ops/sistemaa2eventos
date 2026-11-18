const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const DeviceFactory = require('./adapters/DeviceFactory');
const deviceHealthCheck = require('./deviceHealthCheck.service');

// Métricas por leitor/câmera/catraca do evento.
// Não grava nada: só lê o banco, consulta a contagem real do leitor (com cache) e mede o alcance pelo caminho do status (keepalive, agente ou TCP).
const JANELA_ERROS_MS = 24 * 60 * 60 * 1000;
const CACHE_FACES_HW_MS = 60 * 1000;
const CACHE_METRICAS_EVENTO_MS = 12 * 1000;
const CONCORRENCIA_MAX = 6;

const cacheFacesHw = new Map(); // devId -> { valor, expiraEm }
const cacheEvento = new Map(); // eventoId -> { data, expiraEm }


/**
 * Alcance do leitor pelo mesmo caminho do status do sistema: keepalive do próprio leitor, agente local
 * ou teste direto. Na nuvem (VPS) o teste direto não alcança a rede do evento, então o agente é o que vale.
 */
async function alcanceDoDispositivo(dev) {
    try {
        const r = await deviceHealthCheck.avaliarDispositivo(dev);
        const online = !!r.online;
        return { online, latencia_ms: online && typeof r.latency === 'number' ? r.latency : null, via: r.via || null };
    } catch (err) {
        logger.warn(`[Métricas] alcance do dispositivo ${dev.id} falhou: ${err.message}`);
        return { online: false, latencia_ms: null, via: null };
    }
}

/** Contagem exata com filtro; devolve null se a consulta falhar (sem derrubar a resposta toda). */
async function contar(tabela, filtros) {
    let q = supabase.from(tabela).select('id', { count: 'exact', head: true });
    for (const [campo, valor] of Object.entries(filtros)) {
        if (valor && typeof valor === 'object' && 'gte' in valor) q = q.gte(campo, valor.gte);
        else q = q.eq(campo, valor);
    }
    const { count, error } = await q;
    if (error) {
        logger.warn(`[Métricas] contagem em ${tabela} falhou: ${error.message}`);
        return null;
    }
    return count ?? 0;
}

async function ultimoRegistro(tabela, colunas, filtros, ordenarPor) {
    let q = supabase.from(tabela).select(colunas).order(ordenarPor, { ascending: false }).limit(1);
    for (const [campo, valor] of Object.entries(filtros)) q = q.eq(campo, valor);
    const { data, error } = await q.maybeSingle();
    if (error) {
        logger.warn(`[Métricas] leitura de ${tabela} falhou: ${error.message}`);
        return null;
    }
    return data || null;
}

/**
 * Consulta a quantidade real de faces/usuários direto no hardware (inclui cadastros feitos antes do log).
 * Mantém cache de 60 s por leitor para não sobrecarregar o CGI do equipamento.
 */
async function contarFacesNoHardware(dev, online) {
    const cacheado = cacheFacesHw.get(dev.id);
    if (cacheado && cacheado.expiraEm > Date.now()) return cacheado.valor;
    if (!online) return cacheado ? cacheado.valor : null;
    if (!['terminal_facial', 'catraca'].includes(dev.tipo)) return null;
    if (!dev.password_device && !process.env.INTELBRAS_DEFAULT_PASS) return null;

    try {
        const inst = DeviceFactory.getDevice(dev);
        if (typeof inst.countUsers !== 'function') return null;
        const total = await Promise.race([
            inst.countUsers(),
            new Promise((resolve) => setTimeout(() => resolve(null), 2500))
        ]);
        if (typeof total === 'number' && !Number.isNaN(total)) {
            cacheFacesHw.set(dev.id, { valor: total, expiraEm: Date.now() + CACHE_FACES_HW_MS });
            return total;
        }
    } catch {
        // Silencioso: usa fallback do banco se o leitor não responder ao CGI
    }
    return null;
}

/**
 * Monta as métricas de um dispositivo.
 * - online / latencia_ms: teste TCP agora (porta cadastrada)
 * - ultimo_evento_at: último acesso registrado no leitor (logs_acesso)
 * - faces_sincronizadas: contagem direta no hardware (quando online) ou saldo líquido do banco (sync_log / fila)
 * - erros_24h: falhas de sincronização nas últimas 24 h + itens da fila em erro
 * - fila_pendente: comandos ainda aguardando envio ao equipamento
 */
async function metricasDoDispositivo(dev) {
    const desde = new Date(Date.now() - JANELA_ERROS_MS).toISOString();

    const [alcance, cadastros, remocoes, filaSucesso, falhas24h, ultimoErro, ultimoAcesso, filaErro, filaPendente] = await Promise.all([
        alcanceDoDispositivo(dev),
        contar('dispositivo_sync_log', { dispositivo_id: dev.id, operacao: 'enroll', status: 'sucesso' }),
        contar('dispositivo_sync_log', { dispositivo_id: dev.id, operacao: 'delete', status: 'sucesso' }),
        contar('terminal_sync_queue', { dispositivo_id: dev.id, tipo_comando: 'enroll_face', status: 'sucesso' }),
        contar('dispositivo_sync_log', { dispositivo_id: dev.id, status: 'falha', criado_em: { gte: desde } }),
        ultimoRegistro('dispositivo_sync_log', 'operacao, mensagem_erro, criado_em', { dispositivo_id: dev.id, status: 'falha' }, 'criado_em'),
        ultimoRegistro('logs_acesso', 'created_at', { dispositivo_id: dev.id }, 'created_at'),
        contar('terminal_sync_queue', { dispositivo_id: dev.id, status: 'erro' }),
        contar('terminal_sync_queue', { dispositivo_id: dev.id, status: 'pendente' })
    ]);

    const facesHw = await contarFacesNoHardware(dev, alcance.online);
    const facesLog = cadastros === null || remocoes === null ? null : Math.max(0, cadastros - remocoes);
    const facesBanco = facesLog === null && filaSucesso === null ? null : Math.max(facesLog || 0, filaSucesso || 0);
    const faces = facesHw !== null ? facesHw : facesBanco;
    const erros = falhas24h === null && filaErro === null ? null : (falhas24h || 0) + (filaErro || 0);

    return {
        dispositivo_id: dev.id,
        nome: dev.nome,
        marca: dev.marca,
        tipo: dev.tipo,
        ip_address: dev.ip_address,
        porta: dev.porta,
        online: alcance.online,
        latencia_ms: alcance.latencia_ms,
        alcance_via: alcance.via,
        ultimo_ping_banco: dev.ultimo_ping || null,
        ultimo_evento_at: ultimoAcesso?.created_at || null,
        faces_sincronizadas: faces,
        erros_24h: erros,
        ultimo_erro: ultimoErro
            ? { operacao: ultimoErro.operacao, mensagem: ultimoErro.mensagem_erro || null, at: ultimoErro.criado_em }
            : null,
        fila_pendente: filaPendente,
        medido_em: new Date().toISOString()
    };
}

/** Executa tarefas assíncronas com limite de concorrência para eventos com muitos leitores. */
async function mapComLimite(itens, limite, fn) {
    const resultados = new Array(itens.length);
    let idx = 0;
    const workers = Array.from({ length: Math.min(limite, itens.length) }, async () => {
        while (idx < itens.length) {
            const atual = idx++;
            resultados[atual] = await fn(itens[atual]);
        }
    });
    await Promise.all(workers);
    return resultados;
}

/**
 * GET /dispositivos/metricas
 * Admin/supervisor. Lista as métricas de todos os equipamentos do evento com limite de concorrência e cache curto.
 */
async function listarMetricas(req, res) {
    try {
        const eventoId = req.event?.id || req.query?.evento_id || req.headers?.['x-evento-id'];
        if (!eventoId) return res.status(400).json({ error: 'Contexto de evento não identificado' });

        const emCache = cacheEvento.get(eventoId);
        if (emCache && emCache.expiraEm > Date.now() && req.query?.force !== 'true') {
            return res.json({ success: true, data: emCache.data });
        }

        // password_device é lida apenas no servidor para consultar countUsers() no leitor; nunca sai na resposta JSON
        const { data, error } = await supabase
            .from('dispositivos_acesso')
            .select('id, nome, marca, tipo, ip_address, porta, user_device, password_device, agent_id, ultimo_ping')
            .eq('evento_id', eventoId)
            .order('nome', { ascending: true });
        if (error) throw error;

        const metricas = await mapComLimite(data || [], CONCORRENCIA_MAX, metricasDoDispositivo);
        cacheEvento.set(eventoId, { data: metricas, expiraEm: Date.now() + CACHE_METRICAS_EVENTO_MS });
        res.json({ success: true, data: metricas });
    } catch (error) {
        logger.error({ err: error, event_id: req.event?.id }, 'Erro ao montar métricas de dispositivos');
        res.status(500).json({ error: 'Erro ao buscar métricas dos dispositivos' });
    }
}

module.exports = { listarMetricas };
