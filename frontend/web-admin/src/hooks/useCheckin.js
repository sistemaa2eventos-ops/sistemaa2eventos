import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usarConexao } from '../services/realtime';
import api from '../services/api';
import localCheckinService from '../services/LocalCheckinService';
import { entrarTelaCheia, sairTelaCheia, ouvirTelaCheia } from '../utils/telaCheia';
import { obterAudioContext } from '../utils/alertSound';
import { imprimirSeAtivo } from '../services/etiquetaService';

// Aviso de entrada bloqueada pelo rosto (sem ficha): tempo na tela
const BLOQUEIO_VISIVEL_MS = 30000;
// Mesma pessoa reconhecida de novo dentro deste tempo não registra outra entrada pelo rosto
const ROSTO_REPETIDO_MS = 20000;
// Pulseira lida na ficha que não é desta pessoa: o servidor recusa (409) e nada é registrado
const CODIGO_PULSEIRA_OUTRA = 'PULSEIRA_DE_OUTRA_PESSOA';
const MSG_PULSEIRA_OUTRA = 'Esta pulseira é de outra pessoa, não desta. Nada foi registrado.';
const ehPulseiraDeOutra = (error) => {
    const dados = error?.response?.data;
    return error?.response?.status === 409
        && (dados?.codigo === CODIGO_PULSEIRA_OUTRA || dados?.details?.codigo === CODIGO_PULSEIRA_OUTRA);
};

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
    // Saída de quem entrou num dia anterior: o servidor pede confirmação e o horário real
    const [turnoAnterior, setTurnoAnterior] = useState(null);
    // Entrada bloqueada (409 ENTRADA_BLOQUEADA): { pessoaId, nome, mensagem, liberavel, etapa, repetir, erroLiberacao, token }
    const [bloqueioEntrada, setBloqueioEntrada] = useState(null);
    const [liberandoReentrada, setLiberandoReentrada] = useState(false);
    // Aviso de entrada pelo rosto (sem ficha) some sozinho depois de um tempo; o da ficha fica
    const bloqueioTimerRef = useRef(null);
    // Último registro de entrada pelo rosto por pessoa: a câmera/leitor repete o reconhecimento
    const rostoEntradaRef = useRef(new Map());
    const inicioAtendimentoRef = useRef(null);
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
    // Câmeras com IA que podem identificar a pessoa nesta estação (além do leitor facial)
    const [camerasDisponiveis, setCamerasDisponiveis] = useState([]);
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
                setCamerasDisponiveis(res.data.cameras || []);
            }
        } catch (err) {
            console.warn('Erro ao carregar dispositivos para vínculo:', err.message);
        }
    }, [eventoId]);

    /** Estação: leitor facial e/ou câmeras com IA (pelo menos um) */
    const vincularLeitor = async (dispositivoId, estacaoNome, cameraIds = []) => {
        try {
            setLoadingSessao(true);
            const res = await api.post('/devices/sessao/vincular', {
                dispositivo_id: dispositivoId || null,
                camera_ids: cameraIds,
                estacao_nome: estacaoNome,
                evento_id: eventoId
            }, { hideDefaultError: true });
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

    const pedeTurnoAnterior = (error) => {
        const det = error?.response?.status === 409 ? error.response.data?.details : null;
        if (det?.codigo !== 'TURNO_ANTERIOR') return false;
        setTurnoAnterior(det);
        return true;
    };

    // 409 ENTRADA_BLOQUEADA: guarda o aviso (e a tentativa a repetir depois da liberação).
    // temporario: aviso de entrada pelo rosto, sem ficha aberta; some sozinho depois de BLOQUEIO_VISIVEL_MS
    const pedeEntradaBloqueada = (error, { pessoaId, nome = null, repetir, temporario = false }) => {
        const dados = error?.response?.status === 409 ? error.response.data : null;
        if (dados?.codigo !== 'ENTRADA_BLOQUEADA') return false;
        clearTimeout(bloqueioTimerRef.current);
        const token = {};
        setBloqueioEntrada({
            pessoaId,
            nome,
            mensagem: dados.error || '',
            liberavel: dados.liberavel === true,
            etapa: dados.etapa ?? null,
            repetir,
            erroLiberacao: null,
            token
        });
        if (temporario) {
            bloqueioTimerRef.current = setTimeout(() => {
                setBloqueioEntrada(atual => (atual?.token === token ? null : atual));
            }, BLOQUEIO_VISIVEL_MS);
        }
        return true;
    };

    const cancelarBloqueioEntrada = () => {
        clearTimeout(bloqueioTimerRef.current);
        setBloqueioEntrada(null);
    };

    // Controlador libera a reentrada e a entrada é tentada de novo uma vez (sem loop)
    const liberarReentrada = async () => {
        const bloqueio = bloqueioEntrada;
        if (!bloqueio?.liberavel || liberandoReentrada) return;
        try {
            setLiberandoReentrada(true);
            const corpo = { pessoa_id: bloqueio.pessoaId, area_id: areaId || null };
            if (bloqueio.etapa) corpo.etapa = bloqueio.etapa;
            await api.post('/checkin/liberar-reentrada', corpo);
        } catch (error) {
            const erro = error.response?.data?.error || 'Não foi possível liberar a reentrada.';
            setBloqueioEntrada(atual => (atual ? { ...atual, erroLiberacao: erro } : atual));
            return;
        } finally {
            setLiberandoReentrada(false);
        }
        setBloqueioEntrada(null);
        // Se o servidor bloquear de novo, o aviso volta e exige novo clique (não repete em loop)
        await bloqueio.repetir();
    };

    const confirmarTurnoAnterior = async (saidaEm) => {
        const t = turnoAnterior;
        if (!t) return;
        try {
            await api.post('/access/checkout/corrigir-turno', { pessoa_id: t.pessoa?.id, saida_em: saidaEm });
            setTurnoAnterior(null);
            tocarBipeNotificacao();
            setCheckinResult('sucesso');
            const diaEntrada = new Date(t.entrada_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            setResultMessage(`SAÍDA CORRIGIDA: ${t.pessoa?.nome || 'COLABORADOR'} — turno de ${diaEntrada}`);
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(() => { setCheckinResult(null); setResultMessage(''); }, 3500);
            atualizarAposAcesso();
        } catch (error) {
            throw new Error(error.response?.data?.error || 'Falha ao corrigir a saída.');
        }
    };

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
            const { operationMode: modoAtual, sessaoAtiva: sessao, executarLeituraRapida: leituraRapida, handleSelectPessoa: abrirFicha } = latestRef.current;
            // Só a estação vinculada a este leitor reage
            if (sessao?.dispositivo_id && data?.dispositivo_id && sessao.dispositivo_id !== data.dispositivo_id) return;
            // Ficha já aberta: a leitura automática para. Senão a janela reabre a cada leitura e apaga a pulseira
            // que o operador estava digitando.
            if (latestRef.current.fichaAberta) return;
            console.log('📡 [WS] Leitor facial reconheceu:', data);
            if (data?.pessoa) {
                tocarBipeNotificacao();
                if (defaultMode === 'checkout' || modoAtual === 'checkout') {
                    // Saída pelo rosto: registrada na hora, sem abrir a ficha (mesmo caminho da leitura rápida)
                    leituraRapida?.(data.pessoa.id, 'checkout', 'facial');
                } else {
                    // Entrada pelo rosto (câmera ou leitor facial vinculado à estação): abre a ficha da pessoa
                    // para o operador adicionar/conferir a pulseira e confirmar a entrada. Não registra sozinho.
                    const agora = Date.now();
                    const registros = rostoEntradaRef.current;
                    const ultimo = registros.get(data.pessoa.id);
                    if (ultimo && agora - ultimo < ROSTO_REPETIDO_MS) return;
                    if (registros.size > 200) registros.clear();
                    registros.set(data.pessoa.id, agora);
                    abrirFicha?.(data.pessoa);
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
        // Quiosque bloqueado (configurado em Usuários): só o desbloqueio com senha tira o modo
        if (document.body.classList.contains('quiosque-bloqueado')) return;
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
        const termo = String(val || '').trim();
        if (termo.length < 2) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }
        setSearchLoading(true);
        searchTimerRef.current = setTimeout(async () => {
            const controller = new AbortController();
            searchAbortRef.current = controller;
            try {
                const res = await api.get('/pessoas/search', { params: { q: termo, evento_id: eventoId }, signal: controller.signal });
                if (res.data.success) setSearchResults(res.data.data);
            } catch (error) {
                if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') console.error('Erro na busca:', error);
            } finally {
                if (searchAbortRef.current === controller) setSearchLoading(false);
            }
        }, 280);
    };

    useEffect(() => () => {
        clearTimeout(searchTimerRef.current);
        searchAbortRef.current?.abort();
    }, []);

    const handleSelectPessoa = (pessoa) => {
        // Início do atendimento (credenciamento): métrica de tempo por operador
        inicioAtendimentoRef.current = new Date().toISOString();
        clearTimeout(bloqueioTimerRef.current);
        setBloqueioEntrada(null); // aviso de bloqueio é de outra pessoa/atendimento
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

    /**
     * Consulta participante por QR Code / CPF / Código e abre o modal de credenciamento
     * para conferência visual de dados e atribuição de pulseira antes de liberar o acesso.
     */
    // abrir=false só localiza a pessoa (a tela decide se abre a ficha ou registra direto)
    const abrirConferenciaPorCodigo = async (codigo, { abrir = true } = {}) => {
        if (!codigo || !eventoId) return { success: false, error: 'Código ou evento ausente' };
        try {
            setLoading(true);
            const res = await api.get(`/access/consultar-pulseira/${encodeURIComponent(String(codigo).trim())}`, {
                params: { evento_id: eventoId }
            });
            if (res.data?.success && res.data?.data) {
                const pessoa = res.data.data;
                tocarBipeNotificacao();
                if (abrir) handleSelectPessoa(pessoa);
                return { success: true, data: pessoa };
            }
            throw new Error(res.data?.error || 'Participante não localizado');
        } catch (error) {
            setCheckinResult('negado');
            setResultMessage(error.response?.data?.error || 'Participante não localizado pelo código/QR Code.');
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

    // Leitura rápida direta (sem ficha): saída pelo rosto e entrada pelo rosto. Só o rosto passa pessoa.id.
    const executarLeituraRapida = async (codigo, tipoForcado = null, metodoForcado = 'barcode', nomePessoa = null) => {
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

            // Texto que não é código no aparelho sem servidor: nem entra na fila
            if (res.status === 'invalido') {
                setCheckinResult('negado');
                setResultMessage(res.message);
                clearTimeout(resetTimerRef.current);
                resetTimerRef.current = setTimeout(() => {
                    setCheckinResult(null);
                    setResultMessage('');
                }, 3500);
                return { success: false, error: res.message };
            }

            if (res.data?.success) {
                const data = res.data.data;
                tocarBipeNotificacao();
                setBloqueioEntrada(null); // aviso de outra leitura não fica na tela
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
            if (pedeTurnoAnterior(error)) return { success: false, turnoAnterior: true };
            // Entrada pelo rosto em área que controla entrada: aviso na tela (sem ficha), com liberação se couber
            if (tipoFinal === 'checkin' && pedeEntradaBloqueada(error, {
                pessoaId: codigo,
                nome: nomePessoa,
                temporario: true,
                repetir: () => executarLeituraRapida(codigo, tipoForcado, metodoForcado, nomePessoa)
            })) {
                return { success: false, bloqueada: true };
            }
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

        // Bipe sem pessoa selecionada: só localiza e abre a ficha. Entrada e saída nunca saem daqui direto.
        if (!targetPessoa && (metodo === 'pulseira' || metodo === 'barcode') && extraValue) {
            return await abrirConferenciaPorCodigo(extraValue);
        }

        if (!targetPessoa && metodo !== 'qrcode') return { success: false, error: 'Pessoa não informada' };

        // Saída só pela leitura da pulseira dentro da ficha (CPF, QR ou nome não registram saída)
        if (isCheckout && metodo !== 'pulseira' && metodo !== 'barcode') {
            return { success: false, error: 'A saída é registrada pela leitura da pulseira da pessoa.' };
        }

        try {
            setManualSaving(true);
            let res;

            if (isCheckout) {
                // BAIXA / CHECKOUT: a pulseira lida na ficha desta pessoa (validada acima)
                // A saída vai sempre com a pessoa da ficha: o servidor recusa pulseira que não é dela
                res = await localCheckinService.enviar('/access/pulseira/checkout', {
                    pessoa_id: targetPessoa.id,
                    numero_pulseira: extraValue,
                    area_id: areaId
                }, 'pulseira-checkout');
            } else if (metodo === 'pulseira') {
                // CREDENCIAMENTO via BARCODE/PULSEIRA: endpoint que vincula áreas + auto check-in
                res = await localCheckinService.enviar('/access/credenciar-pulseira', {
                    pessoa_id: targetPessoa.id,
                    numero_pulseira: extraValue,
                    area_id: areaId,
                    atendimento_inicio: inicioAtendimentoRef.current,
                    estacao: sessaoAtiva?.estacao_nome || null
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
                return { success: true, offline: true };
            }

            if (res.status === 'invalido') {
                setCheckinResult('negado');
                setResultMessage(res.message);
                clearTimeout(resetTimerRef.current);
                resetTimerRef.current = setTimeout(() => {
                    setCheckinResult(null);
                    setResultMessage('');
                }, 3000);
                return { success: false, error: res.message };
            }

            let resultadoAcao = { success: true };
            if (res.status === 'erro_negocio' || (finalData && finalData.tipo === 'negado')) {
                const motivo = finalData.erro || finalData.observacao || 'Acesso não autorizado.';
                resultadoAcao = { success: false, error: motivo };
                setCheckinResult('negado');
                setResultMessage(motivo);
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
            return resultadoAcao;
        } catch (error) {
            if (pedeTurnoAnterior(error)) return { success: false, turnoAnterior: true };
            if (pedeEntradaBloqueada(error, { pessoaId: targetPessoa?.id, repetir: () => performCheckin(metodo, extraValue, forcedPessoaId) })) {
                return { success: false, bloqueada: true };
            }
            const motivo = ehPulseiraDeOutra(error) ? MSG_PULSEIRA_OUTRA : (error.response?.data?.error || 'Falha na comunicação com o servidor.');
            setCheckinResult('negado');
            setResultMessage(motivo);
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(() => {
                setCheckinResult(null);
                setResultMessage('');
            }, 3000);
            return { success: false, error: motivo };
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
                dispositivoId: 'web-dashboard',
                atendimento_inicio: inicioAtendimentoRef.current,
                estacao: sessaoAtiva?.estacao_nome || null
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
            if (pedeEntradaBloqueada(error, { pessoaId, repetir: () => handleLinkPulseiraAndCheckin(pessoaId, tipoPulseiraId, numeroPulseira) })) {
                return false;
            }
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

    // Saída de quem está dentro (ficha, depois de ENTRADA_BLOQUEADA sem liberação). Usa a mesma chamada de
    // saída pela pulseira do Check-out, mas não fecha a ficha: o operador vê a confirmação e pode tentar a entrada de novo.
    const registrarSaidaFicha = async (pessoaId, numeroPulseira) => {
        if (!pessoaId || !numeroPulseira) return { success: false, error: 'Pessoa sem pulseira em uso' };
        try {
            setManualSaving(true);
            const res = await localCheckinService.enviar('/access/pulseira/checkout', {
                pessoa_id: pessoaId,
                numero_pulseira: numeroPulseira,
                area_id: areaId
            }, 'pulseira-checkout');

            if (res.status === 'invalido') return { success: false, error: res.message };

            // Saída registrada (ou guardada no aparelho): a entrada deixa de estar bloqueada por este aviso
            setBloqueioEntrada(null);
            if (res.status === 'local') {
                updateOfflineCount();
                return { success: true, offline: true };
            }
            tocarBipeNotificacao();
            atualizarAposAcesso();
            return { success: true, data: res.data?.data || res.data || null };
        } catch (error) {
            if (pedeTurnoAnterior(error)) return { success: false, turnoAnterior: true };
            return { success: false, error: ehPulseiraDeOutra(error) ? MSG_PULSEIRA_OUTRA : (error.response?.data?.error || 'Não foi possível registrar a saída.') };
        } finally {
            setManualSaving(false);
        }
    };

    // No iPhone não há tela cheia do navegador: o quiosque só esconde menu e barra
    const toggleQuiosque = async () => {
        if (modoQuiosque && document.body.classList.contains('quiosque-bloqueado')) return; // bloqueado: não sai
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

    latestRef.current = {
        operationMode, sessaoAtiva, handleSelectPessoa, executarLeituraRapida, eventAreas,
        fichaAberta: Boolean(selectedPessoa)
    };

    return {
        selectedPessoa, setSelectedPessoa: handleSelectPessoa,
        // Saída de um dia anterior (CorrigirTurnoDialog): as telas já esperam estes campos
        turnoAnterior, confirmarTurnoAnterior, cancelarTurnoAnterior: () => setTurnoAnterior(null),
        checkinResult, setCheckinResult,
        // Entrada bloqueada (409): aviso na ficha e liberação da reentrada pelo controlador
        bloqueioEntrada, liberarReentrada, liberandoReentrada, cancelarBloqueioEntrada,
        registrarSaidaFicha,
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
        abrirConferenciaPorCodigo,
        performCheckin,
        handleLinkPulseiraAndCheckin,
        eventoId,
        // Sessão do Leitor Facial (Fase 1)
        sessaoAtiva,
        dispositivosDisponiveis,
        camerasDisponiveis,
        loadingSessao,
        carregarSessaoAtiva,
        carregarDispositivosDisponiveis,
        vincularLeitor,
        desvincularLeitor
    };
};
