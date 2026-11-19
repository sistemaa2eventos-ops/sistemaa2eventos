'use strict';

/**
 * Diagnóstico de um leitor facial pelo painel (botão "Diagnosticar"): a equipe de campo vê o que está
 * errado e como corrigir sem Prompt de Comando nem código. Cada item tem estado (ok, alerta, erro,
 * nao_testado), o detalhe medido, a correção em linguagem simples e, quando dá, uma ação de um clique.
 *
 * Fala com o leitor pelo mesmo caminho do resto do sistema (direto ou pelo agente do PC do evento).
 */
const { supabase } = require('../../config/supabase');
const { getNowLocal } = require('../../utils/dateUtils');

const MARCAS_COMPLETAS = ['intelbras', 'dahua'];
const KEEPALIVE_OK_MS = 3 * 60000;

const item = (chave, titulo, estado, detalhe, como_corrigir = null, acao = null) => ({ chave, titulo, estado, detalhe, como_corrigir, acao });

/** "2026-11-19 10:33:00" ou "2026-11-19T10:33:00" → segundos desde a época (como hora local, sem fuso) */
function segundosLocais(texto) {
    const m = String(texto || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000;
}

/** Linhas "table.X.Y=valor" da resposta do configManager → { "X.Y": "valor" } */
function lerTabela(texto) {
    const mapa = {};
    for (const linha of String(texto || '').split(/\r?\n/)) {
        const m = linha.match(/^table\.([^=]+)=(.*)$/);
        if (m) mapa[m[1].trim()] = m[2].trim();
    }
    return mapa;
}

/** Quantas pessoas deveriam estar neste leitor (mesma regra da sincronização; suspensos contam) */
async function pessoasEsperadas(dispositivo, syncService) {
    const { buscarTodos } = require('../../utils/buscarTodos');
    const { COLUNAS_PESSOA_SYNC } = require('../checkin/services/colunasPessoa');
    const { data: pessoas, error } = await buscarTodos(supabase.from('pessoas').select(COLUNAS_PESSOA_SYNC).eq('evento_id', dispositivo.evento_id));
    if (error) throw error;
    const ctx = await syncService._carregarContextoSync(dispositivo.evento_id);
    if (!ctx) throw new Error('falha ao carregar as áreas do evento');
    let total = 0;
    for (const p of pessoas || []) {
        if (syncService._statusSoRemoveDosTerminais(p)) continue;
        const areas = await syncService._getPessoaAreaIds(p, ctx);
        if (!syncService._terminalAceitaPessoa(dispositivo, areas)) continue;
        if (syncService._statusSuspendeNosTerminais(p) && syncService._terminalRemoveBloqueado(dispositivo)) continue;
        if (p.foto_url) total++;
    }
    return total;
}

/**
 * @param {object} dispositivo linha de dispositivos_acesso
 * @param {object} deps { service (adaptador do leitor), agentService, syncService, naNuvem }
 * @returns {Promise<{ resumo: string, itens: object[] }>}
 */
async function diagnosticarLeitor(dispositivo, deps) {
    const { service, agentService, syncService, naNuvem } = deps;
    const itens = [];
    const marca = String(dispositivo.marca || '').toLowerCase();

    // 1. Cadastro
    const faltando = [];
    if (!dispositivo.ip_address) faltando.push('IP');
    if (!dispositivo.password_device) faltando.push('senha do leitor');
    if (faltando.length) {
        itens.push(item('cadastro', 'Cadastro do leitor', 'erro', `Falta: ${faltando.join(', ')}`, 'Edite o leitor e preencha os campos que faltam.', 'editar'));
    } else if (!dispositivo.area_id && (dispositivo.modo || dispositivo.config?.modo) !== 'credenciamento') {
        itens.push(item('cadastro', 'Cadastro do leitor', 'alerta', 'Leitor de acesso sem área: todas as pessoas do evento entram nele.', 'Edite o leitor e escolha a área que ele controla.', 'editar'));
    } else {
        itens.push(item('cadastro', 'Cadastro do leitor', 'ok', `IP ${dispositivo.ip_address}:${dispositivo.porta || 80}`));
    }

    if (!MARCAS_COMPLETAS.includes(marca)) {
        itens.push(item('suporte', 'Suporte à marca', 'alerta', `${dispositivo.marca || 'Marca não informada'}: suporte limitado (a foto não é enviada ao leitor).`,
            'Use leitores Intelbras ou Dahua, ou peça ao desenvolvimento para completar esta marca.'));
    }

    // 2. Agente (na nuvem, o leitor só é alcançado pelo PC do evento)
    if (dispositivo.agent_id) {
        const conectado = !!agentService?.agents?.has(dispositivo.agent_id);
        itens.push(conectado
            ? item('agente', 'Agente do PC do evento', 'ok', 'Conectado')
            : item('agente', 'Agente do PC do evento', 'erro', 'Desconectado: a nuvem não alcança o leitor.', 'No PC do evento, rode ligar-ia-facial.bat e confira a internet do PC.'));
    } else if (naNuvem) {
        itens.push(item('agente', 'Agente do PC do evento', 'erro', 'Leitor sem agente: a nuvem não alcança a rede do evento.', 'Edite o leitor e escolha o agente em "Conexão com o leitor".', 'editar'));
    }

    // 3. Comunicação e senha (lendo a hora do leitor)
    let horaLeitor = null;
    let alcancavel = false;
    if (!faltando.length && MARCAS_COMPLETAS.includes(marca)) {
        const t0 = Date.now();
        try {
            const r = await service._request('GET', '/cgi-bin/global.cgi', { action: 'getCurrentTime' });
            const ms = Date.now() - t0;
            if (r.status === 401) {
                itens.push(item('comunicacao', 'Comunicação e senha', 'erro', 'O leitor respondeu, mas recusou usuário/senha.', 'Edite o leitor e digite o usuário e a senha de administrador do equipamento.', 'editar'));
            } else if (!r.ok) {
                itens.push(item('comunicacao', 'Comunicação e senha', 'erro', `O leitor respondeu com erro ${r.status}.`, 'Confira se o IP é mesmo deste leitor e se a marca está certa.'));
            } else {
                alcancavel = true;
                horaLeitor = (String(r.text).match(/result=(.+)/) || [])[1] || null;
                itens.push(item('comunicacao', 'Comunicação e senha', ms > 1500 ? 'alerta' : 'ok', `Respondeu em ${ms} ms`,
                    ms > 1500 ? 'Resposta lenta: prefira o leitor no cabo de rede e confira a rede do evento.' : null));
            }
        } catch (err) {
            itens.push(item('comunicacao', 'Comunicação e senha', 'erro', `Sem resposta: ${err.message}`,
                'Confira se o leitor está ligado e na mesma rede do PC do evento, e se o IP não mudou (reserve o IP no roteador).'));
        }
    }

    // 4. Relógio
    if (alcancavel) {
        const sLeitor = segundosLocais(horaLeitor);
        const sAgora = segundosLocais(getNowLocal());
        if (sLeitor === null || sAgora === null) {
            itens.push(item('relogio', 'Relógio do leitor', 'alerta', `Não deu para ler a hora (${horaLeitor || 'vazio'}).`, 'Acerte o relógio pelo botão.', 'acertar_relogio'));
        } else {
            const dif = Math.round(sLeitor - sAgora);
            const txt = `Diferença de ${Math.abs(dif)} s ${dif > 0 ? 'adiantado' : dif < 0 ? 'atrasado' : ''}`.trim();
            const estado = Math.abs(dif) > 120 ? 'erro' : Math.abs(dif) > 30 ? 'alerta' : 'ok';
            itens.push(item('relogio', 'Relógio do leitor', estado, txt,
                estado === 'ok' ? null : 'Relógio errado faz o leitor negar ou registrar horário errado. Acerte pelo botão (liga também a hora automática).',
                estado === 'ok' ? null : 'acertar_relogio'));
        }
    } else if (MARCAS_COMPLETAS.includes(marca)) {
        itens.push(item('relogio', 'Relógio do leitor', 'nao_testado', 'Sem comunicação com o leitor.'));
    }

    // 5. Modo online (para onde o leitor manda as passagens)
    if (alcancavel) {
        try {
            const modo = lerTabela(await service._get('/cgi-bin/configManager.cgi', { action: 'getConfig', name: 'Intelbras_ModeCfg' }));
            const envio = lerTabela(await service._get('/cgi-bin/configManager.cgi', { action: 'getConfig', name: 'PictureHttpUpload' }));
            const online = modo['Intelbras_ModeCfg.DeviceMode'] === '1';
            const end = envio['PictureHttpUpload.UploadServerList[0].Address'] || '';
            const porta = envio['PictureHttpUpload.UploadServerList[0].Port'] || '';
            const ligado = envio['PictureHttpUpload.Enable'] === 'true';
            if (online && ligado && end) {
                itens.push(item('modo_online', 'Modo online', 'ok', `Envia as passagens para ${end}:${porta}`));
            } else {
                itens.push(item('modo_online', 'Modo online', 'erro',
                    !online ? 'O leitor não está em modo online.' : 'O leitor não tem o endereço do servidor.',
                    'Clique em "Config Online" (deixe o endereço em branco para usar o padrão).', 'config_online'));
            }
        } catch (err) {
            itens.push(item('modo_online', 'Modo online', 'alerta', `Não deu para ler a configuração: ${err.message}`, 'Se o leitor não libera, faça "Config Online".', 'config_online'));
        }
    }

    // 6. Último sinal do leitor ao servidor
    const ultimo = dispositivo.last_push_at ? Date.parse(dispositivo.last_push_at) : null;
    if (ultimo && Date.now() - ultimo < KEEPALIVE_OK_MS) {
        itens.push(item('sinal', 'Sinal do leitor para o servidor', 'ok', `Último sinal há ${Math.round((Date.now() - ultimo) / 1000)} s`));
    } else {
        itens.push(item('sinal', 'Sinal do leitor para o servidor', 'alerta',
            ultimo ? `Último sinal há ${Math.round((Date.now() - ultimo) / 60000)} min` : 'Nunca recebeu sinal deste leitor.',
            'O leitor não está chamando o servidor: confira a internet do local e faça "Config Online".', 'config_online'));
    }

    // 7. Pessoas no leitor x esperadas
    if (dispositivo.config?.esvaziado_em && alcancavel && typeof service.countUsers === 'function') {
        // Esvaziado no fim do evento: o esperado é zero
        try {
            const noLeitor = await service.countUsers();
            const quando = new Date(dispositivo.config.esvaziado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            itens.push(item('pessoas', 'Pessoas no leitor', noLeitor ? 'erro' : 'alerta',
                `Leitor esvaziado em ${quando}${noLeitor === null ? '' : ` · no leitor: ${noLeitor}`}. Ele não recebe ninguém.`,
                noLeitor ? 'Ainda há cadastros no equipamento: use "Esvaziar leitor" de novo.' : 'Para usar de novo neste evento, clique em "Sync".',
                'sync'));
        } catch (err) {
            itens.push(item('pessoas', 'Pessoas no leitor', 'nao_testado', `Não foi possível contar: ${err.message}`));
        }
    } else if (alcancavel && typeof service.countUsers === 'function' && syncService) {
        try {
            const [noLeitor, esperadas] = await Promise.all([service.countUsers(), pessoasEsperadas(dispositivo, syncService)]);
            if (noLeitor === null) {
                itens.push(item('pessoas', 'Pessoas no leitor', 'nao_testado', `O leitor não informou quantas pessoas tem (esperado: ${esperadas}).`));
            } else {
                const dif = Math.abs(noLeitor - esperadas);
                const estado = dif === 0 ? 'ok' : dif <= Math.max(2, esperadas * 0.05) ? 'alerta' : 'erro';
                itens.push(item('pessoas', 'Pessoas no leitor', estado, `No leitor: ${noLeitor} · deveriam estar: ${esperadas}`,
                    estado === 'ok' ? null : noLeitor > esperadas
                        ? 'O leitor tem pessoas a mais (de outras áreas ou eventos). Use "Limpar e sincronizar".'
                        : 'Faltam pessoas no leitor. Use "Sync"; se continuar, "Limpar e sincronizar".',
                    estado === 'ok' ? null : (noLeitor > esperadas ? 'limpar_sincronizar' : 'sync')));
            }
        } catch (err) {
            itens.push(item('pessoas', 'Pessoas no leitor', 'nao_testado', `Não deu para contar: ${err.message}`));
        }
    }

    // 8. Comandos esperando o leitor
    try {
        const { count } = await supabase.from('terminal_sync_queue').select('id', { count: 'exact', head: true })
            .eq('dispositivo_id', dispositivo.id).in('status', ['pendente', 'erro']);
        itens.push(count
            ? item('fila', 'Comandos pendentes', 'alerta', `${count} comando(s) esperando o leitor`, 'Com o leitor online, use "Reprocessar fila".', 'fila')
            : item('fila', 'Comandos pendentes', 'ok', 'Nenhum'));
    } catch { /* sem a tabela: não é crítico */ }

    const erros = itens.filter(i => i.estado === 'erro').length;
    const alertas = itens.filter(i => i.estado === 'alerta').length;
    const resumo = erros ? `${erros} problema(s) a corrigir` : alertas ? `${alertas} ponto(s) de atenção` : 'Tudo certo';
    return { resumo, itens, em: new Date().toISOString() };
}

module.exports = { diagnosticarLeitor, segundosLocais, lerTabela };
