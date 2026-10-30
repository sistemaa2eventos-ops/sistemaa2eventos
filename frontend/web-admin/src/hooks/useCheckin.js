import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usarConexao } from '../services/realtime';
import api from '../services/api';
import localCheckinService from '../services/LocalCheckinService';
import { entrarTelaCheia, sairTelaCheia, ouvirTelaCheia } from '../utils/telaCheia';
import { obterAudioContext } from '../utils/alertSound';
import { imprimirSeAtivo } from '../services/etiquetaService';

/**
 * useCheckin: Hook de controle para a operação de recepção (NZT).
 * Modificado para focar em Checkout Manual, QR Code e Pulseiras (Barcode).
 */
export const useCheckin = (defaultMode, options = {}) => {
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
    const logsTipo = options.logsTipo || (defaultMode === 'checkout' ? 'checkout' : null);

    // States - Fluxo de Atendimento
    const [selectedPessoa, setSelectedPessoa] = useState(null);
    const [checkinResult, setCheckinResult] = useState(null); // 'sucesso' | 'negado' | null
    const [resultMessage, setResultMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [manualSaving, setManualSaving] = useState(false);

    // States - Modo Quiosque
    const [modoQuiosque, setModoQuiosque] = useState(false);
    const telaCheiaDoQuiosqueRef = useRef(false);

    // States - Configurações e Logs
    const [operationMode, setOperationMode] = useState(defaultMode || localStorage.getItem('nzt_op_mode') || 'auto');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const searchTimerRef = useRef(null);
    const searchAbortRef = useRef(null);
    const [eventModules, setEventModules] = useState([]);
    const [recentLogs, setRecentLogs] = useState([]);
    const [offlineCount, setOfflineCount] = useState(0);
    const [realtimeStats, setRealtimeStats] = useState(null);
    const [areaId, setAreaId] = useState(localStorage.getItem('nzt_area_id') || null);
    const [eventAreas, setEventAreas] = useState([]);
    const [pulseiraTypes, setPulseiraTypes] = useState([]);

    // Estados de Vínculo com Leitor Facial (Fase 1)
    const [sessaoAtiva, setSessaoAtiva] = useState(null);
    const [dispositivosDisponiveis, setDispositivosDisponiveis] = useState([]);
    const [loadingSessao, setLoadingSessao] = useState(false);

    const rfidInputRef = useRef(null);
    const resetTimerRef = useRef(null);
    const refreshTimerRef = useRef(null);
    const socketRef = useRef(null);
    // Valores atuais para os listeners do socket (registrados uma vez por evento)
    const latestRef = useRef({});

    const tocarBipeNotificacao = useCallback(() => {
        try {
            const audioCtx = obterAudioContext();
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.22);
        } catch (_) {}
    }, []);

    const updateOfflineCount = useCallback(async () => {
        const count = await localCheckinService.getPendenteCount();
        setOfflineCount(count);
    }, []);

    // Contador de pendências acompanha a fila (inclusive quando ela sobe sozinha)
    useEffect(() => {
        const aoMudar = (e) => setOfflineCount(e.detail?.count ?? 0);
        window.addEventListener('sync-status-changed', aoMudar);
        return () => window.removeEventListener('sync-status-changed', aoMudar);
    }, []);

    const carregarSessaoAtiva = useCallback(async () => {
        if (!eventoId) return;
        try {
            setLoadingSessao(true);
            const res = await api.get('/devices/sessao/ativa');
            if (res.data?.success) {
                setSessaoAtiva(res.data.data);
            }
        } catch (err) {
            console.warn('Erro ao carregar sessão de operador:', err.message);
        } finally {
            setLoadingSessao(false);
        }
    }, [eventoId]);

    const carregarDispositivosDisponiveis = useCallback(async () => {
        if (!eventoId) return;
        try {
            const res = await api.get('/devices/sessao/disponiveis', { params: { evento_id: eventoId } });
            if (res.data?.success) {
                setDispositivosDisponiveis(res.data.data || []);
            }
        } catch (err) {
            console.warn('Erro ao carregar dispositivos para vínculo:', err.message);
        }
    }, [eventoId]);

    const vincularLeitor = async (dispositivoId, estacaoNome) => {
        try {
            setLoadingSessao(true);
            const res = await api.post('/devices/sessao/vincular', {
                dispositivo_id: dispositivoId,
                estacao_nome: estacaoNome,
                evento_id: eventoId
            });
            if (res.data?.success) {
                setSessaoAtiva(res.data.data);
                await carregarDispositivosDisponiveis();
                return { success: true, data: res.data.data };
            }
            return { success: false, error: res.data?.error || 'Erro ao vincular leitor' };
        } catch (err) {
            return { success: false, error: err.response?.data?.error || err.message };
        } finally {
            setLoadingSessao(false);
        }
    };

    const desvincularLeitor = async () => {
        try {
            setLoadingSessao(true);
            const res = await api.post('/devices/sessao/desvincular');
            if (res.data?.success) {
                setSessaoAtiva(null);
                await carregarDispositivosDisponiveis();
                return { success: true };
            }
            return { success: false, error: res.data?.error || 'Erro ao desvincular leitor' };
        } catch (err) {
            return { success: false, error: err.response?.data?.error || err.message };
        } finally {
            setLoadingSessao(false);
        }
    };

    const refreshLogs = useCallback(async () => {
        if (!eventoId) return;
        try {
            const logParams = { limit: 50, evento_id: eventoId };
            if (logsTipo) {
                logParams.tipo = logsTipo;
            } else if (defaultMode === 'checkout') {
                logParams.tipo = 'checkout';
            }
            const res = await api.get('/access/logs', { params: logParams });
            if (res.data?.data) {
                setRecentLogs(res.data.data);
            }
        } catch (err) {
            console.error('Erro ao atualizar logs recentes:', err);
        }
    }, [eventoId, logsTipo, defaultMode]);

    const loadInitialData = useCallback(async () => {
        if (!eventoId) return;
        try {
            const logParams = { limit: 50, evento_id: eventoId };
            if (logsTipo) {
                logParams.tipo = logsTipo;
            } else if (defaultMode === 'checkout') {
                logParams.tipo = 'checkout';
            }
            const [logRes, eventRes, statsRes, areasRes, pulseiraRes] = await Promise.all([
                api.get(`/access/logs`, { params: logParams }),
                api.get(`/eventos/${eventoId}`),
                api.get('/access/stats/realtime', { params: { evento_id: eventoId } }),
                api.get('/config/areas', { params: { evento_id: eventoId } }).catch(() => ({ data: { data: [] } })),
                api.get('/config/pulseiras', { params: { evento_id: eventoId } }).catch(() => ({ data: { data: [] } }))
            ]);
            setRecentLogs(logRes.data.data || []);
            setEventModules(eventRes.data.data?.event_modules || []);
            setRealtimeStats(statsRes.data.data || null);
            setEventAreas(areasRes.data.data || []);
            setPulseiraTypes(pulseiraRes.data.data || []);

            // Carregar sessão de leitor do operador
            carregarSessaoAtiva();
            carregarDispositivosDisponiveis();
        } catch (error) {
            console.error('Erro ao carregar dados de check-in:', error);
        }
    }, [eventoId, defaultMode, logsTipo, carregarSessaoAtiva, carregarDispositivosDisponiveis]);

    // Etiqueta só na entrada nova (saída e reenvio repetido não imprimem); a opção é do evento
    const imprimirSeEntrada = useCallback((acesso, pessoaId) => {
        if (acesso?.tipo === 'checkin' && !acesso?.already_done) imprimirSeAtivo(eventoId, pessoaId);
    }, [eventoId]);

    // Depois de cada acesso só mudam os registros e as estatísticas: não recarrega evento,
    // áreas, tipos de pulseira nem sessão (eram 7 requisições por pessoa credenciada).
    const atualizarAposAcesso = useCallback(async () => {
        if (!eventoId) return;
        try {
            // A linha do acesso chega pelo socket; sem conexão, busca a lista também
            const [, statsRes] = await Promise.all([
                socketRef.current?.conectado ? null : refreshLogs(),
                api.get('/access/stats/realtime', { params: { evento_id: eventoId } })
            ]);
            setRealtimeStats(statsRes.data.data || null);
        } catch (error) {
            console.error('Erro ao atualizar após acesso:', error);
        }
    }, [eventoId, refreshLogs]);

    // WebSocket Listeners
    useEffect(() => {
        if (!eventoId) return;

        // Conexão compartilhada da aba (services/realtime.js)
        const socket = usarConexao();
        socketRef.current = socket;
        socket.entrarEvento(eventoId);

        socket.on('new_access', (newLog) => {
            if (newLog.evento_id && newLog.evento_id !== eventoId) return;
            const targetTipo = logsTipo || (defaultMode === 'checkout' ? 'checkout' : null);
            if (targetTipo && newLog.tipo && newLog.tipo !== targetTipo) return;
            const area = newLog.area_id && !newLog.area_nome
                ? latestRef.current.eventAreas?.find(a => a.id === newLog.area_id)
                : null;
            const linha = area ? { ...newLog, area_nome: area.nome_area } : newLog;
            setRecentLogs(prev => {
                const updated = [linha, ...prev.filter(l => l.id !== linha.id)];
                return updated.slice(0, 50);
            });

            // O servidor já manda a linha completa (foto, empresa, terminal): só os avisos
            // antigos/incompletos (ex.: negado) ainda pedem a lista à API
            if (newLog.completo) return;
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(() => {
                refreshLogs();
            }, 600);
        });

        // Voltou a conexão: acessos feitos enquanto ela estava caída não chegaram pelo socket
        socket.onGerenciador('reconnect', () => refreshLogs());

        // 🎯 ABERTURA / IDENTIFICAÇÃO AUTOMÁTICA VIA LEITOR FACIAL (Fase 1)
        socket.on('credenciamento_abrir', (data) => {
            const { operationMode: modoAtual, sessaoAtiva: sessao, handleSelectPessoa: selecionar, executarLeituraRapida: leituraRapida } = latestRef.current;
            // Só a estação vinculada a este leitor reage
            if (sessao?.dispositivo_id && data?.dispositivo_id && sessao.dispositivo_id !== data.dispositivo_id) return;
            console.log('📡 [WS] Leitor facial reconheceu:', data);
            if (data?.pessoa) {
                tocarBipeNotificacao();
                if (defaultMode === 'checkout' || modoAtual === 'checkout') {
                    // Modo Checkout: baixa automática e imediata pelo leitor facial
                    leituraRapida?.(data.pessoa.id, 'checkout', 'facial');
                } else {
                    selecionar?.(data.pessoa);
                }
            }
        });

        // Atualização de status da sessão do operador
        socket.on('sessao_operador_atualizada', (novaSessao) => {
            setSessaoAtiva(novaSessao);
        });

        return () => {
            socketRef.current = null;
            socket.liberar();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventoId, defaultMode, tocarBipeNotificacao]);

    // Quiosque: se o navegador sair da tela cheia (Esc, gesto de voltar), sai do quiosque junto
    useEffect(() => ouvirTelaCheia((cheia) => {
        if (!cheia && telaCheiaDoQuiosqueRef.current) {
            telaCheiaDoQuiosqueRef.current = false;
            setModoQuiosque(false);
            document.body.classList.remove('modo-quiosque');
        }
    }), []);

    // Sair da página com o quiosque ligado não pode deixar o menu escondido
    useEffect(() => () => document.body.classList.remove('modo-quiosque'), []);

    // Lifecycle
    useEffect(() => {
        loadInitialData();
        updateOfflineCount();
    }, [loadInitialData, updateOfflineCount]);

    // Actions
    // Busca com carregamento próprio (não trava o campo do leitor), espera 300 ms entre teclas
    // e cancela a anterior: uma resposta lenta não sobrescreve um resultado mais novo.
    const handleSearch = (val) => {
        setSearchQuery(val);
        clearTimeout(searchTimerRef.current);
        searchAbortRef.current?.abort();
        if (val.length < 3) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }
        setSearchLoading(true);
        searchTimerRef.current = setTimeout(async () => {
            const controller = new AbortController();
            searchAbortRef.current = controller;
            try {
                const res = await api.get('/pessoas/search', { params: { q: val, evento_id: eventoId }, signal: controller.signal });
                if (res.data.success) setSearchResults(res.data.data);
            } catch (error) {
                if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') console.error('Erro na busca:', error);
            } finally {
                if (searchAbortRef.current === controller) setSearchLoading(false);
            }
        }, 300);
    };

    useEffect(() => () => {
        clearTimeout(searchTimerRef.current);
        searchAbortRef.current?.abort();
    }, []);

    const handleSelectPessoa = (pessoa) => {
        setSelectedPessoa(pessoa);
        setSearchResults([]);
        setSearchQuery('');

        if (pessoa?.areas_autorizadas?.length > 0 && eventAreas.length > 0) {
            const areaNames = eventAreas.filter(a => pessoa.areas_autorizadas.includes(a.id));
            if (areaNames.length > 0) {
                setSelectedPessoa(prev => ({
                    ...prev,
                    areas_info: areaNames.map(a => ({ area_id: a.id, nome_area: a.nome_area }))
                }));
            }
        }
    };

    const consultarPulseiraAPI = async (codigo) => {
        if (!codigo || !eventoId) return;
        try {
            setLoading(true);
            const res = await api.get(`/access/consultar-pulseira/${codigo}`, { params: { evento_id: eventoId } });
            if (res.data.success) {
                const pessoa = res.data.data;
                handleSelectPessoa(pessoa);
                performCheckin('pulseira', codigo, pessoa.id);
            }
        } catch (error) {
            console.warn('Pulseira não encontrada:', codigo);
            setResultMessage('Pulseira não cadastrada.');
            setCheckinResult('negado');
            setTimeout(() => {
                setCheckinResult(null);
                setResultMessage('');
            }, 3000);
        } finally {
            setLoading(false);
        }
    };

    // Acesso guardado no aparelho (servidor fora): libera a fila da recepção e avisa o operador
    const mostrarSalvoOffline = (mensagem) => {
        tocarBipeNotificacao();
        setCheckinResult('sucesso');
        setResultMessage(mensagem || 'Sem conexão: acesso salvo neste aparelho.');
        updateOfflineCount();
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
            setSelectedPessoa(null);
            setCheckinResult(null);
            setResultMessage('');
            setSearchResults([]);
            setSearchQuery('');
        }, 3000);
    };

    const executarLeituraRapida = async (codigo, tipoForcado = null, metodoForcado = 'barcode') => {
        if (!codigo || !eventoId) return { success: false, error: 'Código ou evento ausente' };
        const tipoFinal = tipoForcado || (defaultMode === 'checkout' ? 'checkout' : 'checkin');
        try {
            setLoading(true);
            // Pela fila offline: sem servidor, o acesso fica no aparelho e sobe sozinho depois
            const res = await localCheckinService.enviar('/access/leitor-rapido', {
                codigo,
                tipo: tipoFinal,
                area_id: areaId,
                metodo: metodoForcado
            }, 'leitor-rapido');

            if (res.status === 'local') {
                mostrarSalvoOffline(res.message);
                return { success: true, offline: true };
            }

            if (res.data?.success) {
                const data = res.data.data;
                tocarBipeNotificacao();
                setCheckinResult('sucesso');
                setResultMessage(tipoFinal === 'checkout'
                    ? `SAÍDA LIBERADA: ${data.pessoa?.nome || 'COLABORADOR'}`
                    : `ENTRADA LIBERADA: ${data.pessoa?.nome || 'COLABORADOR'}`);

                imprimirSeEntrada(data, data.pessoa?.id || data.pessoa_id);
                atualizarAposAcesso();

                clearTimeout(resetTimerRef.current);
                resetTimerRef.current = setTimeout(() => {
                    setCheckinResult(null);
                    setResultMessage('');
                    setSelectedPessoa(null);
                }, 3000);
                return { success: true, data };
            } else {
                setCheckinResult('negado');
                setResultMessage(res.data?.error || 'Acesso não autorizado.');
                clearTimeout(resetTimerRef.current);
                resetTimerRef.current = setTimeout(() => {
                    setCheckinResult(null);
                    setResultMessage('');
                }, 3500);
                return { success: false, error: res.data?.error };
            }
        } catch (error) {
            setCheckinResult('negado');
            setResultMessage(error.response?.data?.error || 'Participante não localizado ou sem autorização.');
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(() => {
                setCheckinResult(null);
                setResultMessage('');
            }, 3500);
            return { success: false, error: error.response?.data?.error || error.message };
        } finally {
            setLoading(false);
        }
    };

    const performCheckin = async (metodo, extraValue = null, forcedPessoaId = null) => {
        let targetPessoa = forcedPessoaId ? { id: forcedPessoaId } : selectedPessoa;
        const isCheckout = defaultMode === 'checkout' || operationMode === 'checkout';

        // Se é pulseira/barcode e não tem pessoa selecionada:
        if (!targetPessoa && (metodo === 'pulseira' || metodo === 'barcode') && extraValue) {
            if (isCheckout) {
                // No checkout direto por bipe, executar baixa rápida
                return await executarLeituraRapida(extraValue, 'checkout', metodo);
            } else {
                await consultarPulseiraAPI(extraValue);
                return;
            }
        }

        if (!targetPessoa && metodo !== 'qrcode') return;

        try {
            setManualSaving(true);
            let res;

            if (isCheckout) {
                // OPERAÇÃO DE BAIXA / CHECKOUT
                if (metodo === 'pulseira' || metodo === 'barcode') {
                    res = await localCheckinService.enviar('/access/pulseira/checkout', {
                        numero_pulseira: extraValue || targetPessoa?.numero_pulseira || targetPessoa?.cpf || targetPessoa?.id,
                        area_id: areaId
                    }, 'pulseira-checkout');
                } else {
                    const payload = {
                        pessoa_id: targetPessoa.id,
                        dispositivoId: 'web-dashboard',
                        evento_id: eventoId,
                        tipo: 'checkout',
                        metodo: metodo || 'manual',
                        area_id: areaId
                    };
                    res = await localCheckinService.realizarCheckin(payload, 'manual');
                }
            } else if (metodo === 'pulseira') {
                // CREDENCIAMENTO via BARCODE/PULSEIRA: endpoint que vincula áreas + auto check-in
                res = await localCheckinService.enviar('/access/credenciar-pulseira', {
                    pessoa_id: targetPessoa.id,
                    numero_pulseira: extraValue,
                    area_id: areaId
                }, 'credenciar-pulseira');
            } else {
                // CHECK-IN MANUAL ou QRCODE
                const payload = {
                    dispositivoId: 'web-dashboard',
                    evento_id: eventoId,
                    tipo: operationMode === 'auto' ? null : operationMode,
                    area_id: areaId
                };

                if (metodo === 'qrcode') {
                    payload.qrCode = extraValue;
                } else {
                    payload.busca = targetPessoa.id;
                }

                res = await localCheckinService.realizarCheckin(payload, metodo === 'qrcode' ? 'qrcode' : 'manual');
            }

            const finalData = res.data?.data || res.data || res;

            if (res.status === 'local') {
                mostrarSalvoOffline(res.message);
                return;
            }

            if (res.status === 'erro_negocio' || (finalData && finalData.tipo === 'negado')) {
                setCheckinResult('negado');
                setResultMessage(finalData.erro || finalData.observacao || 'Acesso não autorizado.');
            } else {
                setCheckinResult('sucesso');
                setResultMessage(isCheckout ? 'SAÍDA LIBERADA' : 'CHECK-IN REALIZADO');
                imprimirSeEntrada(finalData, finalData?.pessoa_id || targetPessoa?.id);
            }

            // Reset automático após 3s
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(() => {
                setSelectedPessoa(null);
                setCheckinResult(null);
                setResultMessage('');
                setSearchResults([]);
                setSearchQuery('');
            }, 3000);

            atualizarAposAcesso();
        } catch (error) {
            setCheckinResult('negado');
            setResultMessage(error.response?.data?.error || 'Falha na comunicação com o servidor.');
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(() => {
                setCheckinResult(null);
                setResultMessage('');
            }, 3000);
        } finally {
            setManualSaving(false);
        }
    };

    const handleLinkPulseiraAndCheckin = async (pessoaId, tipoPulseiraId, numeroPulseira) => {
        try {
            setManualSaving(true);
            const res = await localCheckinService.enviar('/access/credenciar-pulseira', {
                pessoa_id: pessoaId,
                tipo_pulseira_id: tipoPulseiraId,
                numero_pulseira: numeroPulseira,
                area_id: areaId,
                dispositivoId: 'web-dashboard'
            }, 'credenciar-pulseira');

            if (res.status === 'local') {
                mostrarSalvoOffline(res.message);
                return true;
            }

            if (res.data?.success) {
                setCheckinResult('sucesso');
                setResultMessage('Pulseira vinculada e Entrada autorizada!');
                imprimirSeEntrada(res.data.data, pessoaId);
            }

            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(() => {
                setSelectedPessoa(null);
                setCheckinResult(null);
                setResultMessage('');
                setSearchResults([]);
                setSearchQuery('');
            }, 3000);

            atualizarAposAcesso();
            return true;
        } catch (error) {
            setCheckinResult('negado');
            setResultMessage(error.response?.data?.error || 'Erro ao vincular pulseira');
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(() => {
                setCheckinResult(null);
                setResultMessage('');
            }, 3000);
            return false;
        } finally {
            setManualSaving(false);
        }
    };

    // No iPhone não há tela cheia do navegador: o quiosque só esconde menu e barra
    const toggleQuiosque = async () => {
        if (!modoQuiosque) {
            telaCheiaDoQuiosqueRef.current = await entrarTelaCheia();
            setModoQuiosque(true);
            document.body.classList.add('modo-quiosque');
        } else {
            telaCheiaDoQuiosqueRef.current = false;
            setModoQuiosque(false);
            document.body.classList.remove('modo-quiosque');
            await sairTelaCheia();
        }
    };

    const changeOperationMode = (mode) => {
        setOperationMode(mode);
        // Só persiste se não há modo forçado pela página (ex: 'checkout')
        if (!defaultMode) localStorage.setItem('nzt_op_mode', mode);
    };

    const changeAreaId = (id) => {
        setAreaId(id);
        if (id) localStorage.setItem('nzt_area_id', id);
        else localStorage.removeItem('nzt_area_id');
    };

    latestRef.current = { operationMode, sessaoAtiva, handleSelectPessoa, executarLeituraRapida, eventAreas };

    return {
        selectedPessoa, setSelectedPessoa: handleSelectPessoa,
        checkinResult, setCheckinResult,
        resultMessage, setResultMessage,
        loading, manualSaving,
        operationMode, changeOperationMode,
        modoQuiosque, toggleQuiosque,
        searchQuery, setSearchQuery, handleSearch,
        searchResults, setSearchResults, searchLoading,
        eventModules, rfidInputRef,
        recentLogs, offlineCount, realtimeStats,
        refreshLogs,
        areaId, changeAreaId, eventAreas, pulseiraTypes,
        consultarPulseiraAPI,
        performCheckin,
        executarLeituraRapida,
        handleLinkPulseiraAndCheckin,
        eventoId,
        // Sessão do Leitor Facial (Fase 1)
        sessaoAtiva,
        dispositivosDisponiveis,
        loadingSessao,
        carregarSessaoAtiva,
        carregarDispositivosDisponiveis,
        vincularLeitor,
        desvincularLeitor
    };
};
