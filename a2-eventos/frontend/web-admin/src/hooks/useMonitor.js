import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSnackbar } from 'notistack';
import { useSearchParams } from 'react-router-dom';
import io from 'socket.io-client';
import api from '../services/api';

/**
 * useMonitor: Hook de inteligência para a tela de monitoramento em tempo real.
 * Centraliza WebSockets, polling de status e gerenciamento de watchlist.
 */
export const useMonitor = () => {
    const { enqueueSnackbar: _enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    // Ref estável para enqueueSnackbar — notistack pode retornar nova referência a cada render,
    // o que invalidaria fetchWatchlist e fetchSystemHealth (que estão nos deps do useEffect),
    // disparando o loop infinito de polling.
    const snackRef = useRef(_enqueueSnackbar);
    snackRef.current = _enqueueSnackbar;
    const enqueueSnackbar = useCallback((...args) => snackRef.current(...args), []);

    // Referência estável para log — evitar new () => {} a cada render quequebraria
    // as dependências dos useCallback e dispararia o useEffect de polling infinitamente.
    const log = useCallback((...args) => {
        if (import.meta.env.DEV) console.log(...args);
    }, []);

    // States - Feed & Stats
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState({
        presentes: 0,
        capacidade: 0,
        checkins_hoje: 0,
        checkouts_hoje: 0,
        negados_hoje: 0,
        fiscalizacoes_hoje: 0,
        areas: [],
        empresas: []
    });
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);

    // Filtros Locais
    const [filtros, setFiltros] = useState({
        area_id: '',
        dispositivo_id: '',
        tipo: ''
    });

    // States - Cameras & Watchlist
    const [cameras, setCameras] = useState([]);
    const [selectedCameras, setSelectedCameras] = useState([]);
    const [terminais, setTerminais] = useState([]);
    const [watchlist, setWatchlist] = useState([]);
    const [newCpf, setNewCpf] = useState('');
    const [isTracking, setIsTracking] = useState(false);
    const [activeAlert, setActiveAlert] = useState(null);
    const [activeAreaAlert, setActiveAreaAlert] = useState(null);

    // Audio de Alerta Sintetizado
    const playAlarmSound = useCallback(() => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(850, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.35);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } catch (e) {
            // áudio desabilitado no navegador
        }
    }, []);

    // States - System Health
    const [sysStatus, setSysStatus] = useState(null);
    const [sysLogs, setSysLogs] = useState([]);
    const [sysPerf, setSysPerf] = useState(null);
    const [sysError, setSysError] = useState(false);
    const [areas, setAreas] = useState([]);
    const [dispositivosLista, setDispositivosLista] = useState([]);

    const fetchData = useCallback(async () => {
        if (!eventoId) return;
        try {
            const [logsResp, statsResp] = await Promise.all([
                api.get('/access/logs', { params: { limit: 100, evento_id: eventoId } }),
                api.get('/access/stats/realtime', { params: { evento_id: eventoId } })
            ]);
            setLogs(logsResp.data.data || []);
            setStats(statsResp.data.data || {
                presentes: 0,
                capacidade: 0,
                checkins_hoje: 0,
                checkouts_hoje: 0,
                negados_hoje: 0,
                fiscalizacoes_hoje: 0,
                areas: [],
                empresas: []
            });
        } catch (error) {
            log('Erro no polling do monitor:', error);
        } finally {
            setLoading(false);
        }
    }, [eventoId, log]);

    const fetchTerminais = useCallback(async () => {
        if (!eventoId) return;
        try {
            const response = await api.get('/monitor/terminais', { params: { evento_id: eventoId } });
            setTerminais(response.data.data || []);
        } catch (error) {
            log('Erro ao buscar terminais:', error);
        }
    }, [eventoId, log]);

    const fetchSystemHealth = useCallback(async () => {
        setSysError(false);
        const [statusR, logsR, perfR] = await Promise.allSettled([
            api.get('/monitor/system-status'),
            api.get('/monitor/logs?lines=30'),
            api.get('/monitor/performance')
        ]);
        if (statusR.status === 'fulfilled') setSysStatus(statusR.value.data);
        if (logsR.status === 'fulfilled') setSysLogs(logsR.value.data.logs || []);
        if (perfR.status === 'fulfilled') setSysPerf(perfR.value.data);
        if ([statusR, logsR, perfR].some(r => r.status === 'rejected')) {
            enqueueSnackbar('Falha parcial ao obter saúde do sistema', { variant: 'warning' });
            setSysError(true);
        }
    }, [enqueueSnackbar]);

    const fetchCameras = useCallback(async () => {
        if (!eventoId) return;
        try {
            const response = await api.get('/cameras', { params: { evento_id: eventoId } });
            setCameras(response.data.data || []);
        } catch (e) {
            log('Erro ao buscar câmeras do monitor:', e);
        }
    }, [eventoId, log]);

    const fetchWatchlist = useCallback(async () => {
        if (!eventoId) return;
        try {
            const response = await api.get('/watchlist', { params: { evento_id: eventoId } });
            setWatchlist(response.data.data || []);
        } catch (e) {
            enqueueSnackbar('Erro ao carregar watchlist', { variant: 'error' });
        }
    }, [eventoId, enqueueSnackbar]);

    const addToWatchlist = async (cpf) => {
        if (!cpf) return;
        try {
            setIsTracking(true);
            await api.post('/watchlist/manual', { cpf, evento_id: eventoId });
            setNewCpf('');
            enqueueSnackbar('Adicionado a watchlist', { variant: 'success' });
            fetchWatchlist();
        } catch (e) {
            enqueueSnackbar('Erro ao adicionar tracking', { variant: 'error' });
        } finally {
            setIsTracking(false);
        }
    };

    const removeFromWatchlist = async (id) => {
        try {
            await api.delete(`/watchlist/${id}`);
            enqueueSnackbar('Removido da watchlist', { variant: 'success' });
            fetchWatchlist();
        } catch (e) {
            enqueueSnackbar('Erro ao remover tracking', { variant: 'error' });
        }
    };

    // WebSocket Management
    useEffect(() => {
        if (!eventoId) return;

        const socketUrl = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '') || window.location.origin;
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const socket = io(socketUrl, {
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 10,
            auth: { token }
        });

        socket.on('connect', () => {
            socket.emit('join_event', eventoId);
            log('Conectado ao WebSocket do Monitor');
        });

        socket.on('new_access', (newLog) => {
            setLogs(prev => [newLog, ...prev.slice(0, 99)]);
            
            // Atualizar contadores
            setStats(prev => {
                const updated = { ...prev };
                if (newLog.tipo === 'checkin') {
                    updated.presentes = (prev.presentes || 0) + 1;
                    updated.checkins_hoje = (prev.checkins_hoje || 0) + 1;
                } else if (newLog.tipo === 'checkout') {
                    updated.presentes = Math.max(0, (prev.presentes || 0) - 1);
                    updated.checkouts_hoje = (prev.checkouts_hoje || 0) + 1;
                } else if (newLog.tipo === 'negado' || newLog.resultado === 'negado') {
                    updated.negados_hoje = (prev.negados_hoje || 0) + 1;
                } else if (newLog.tipo === 'fiscalizacao') {
                    updated.fiscalizacoes_hoje = (prev.fiscalizacoes_hoje || 0) + 1;
                }

                // Se houver área vinculada, atualizar contagem da área
                if (newLog.area_id && Array.isArray(updated.areas)) {
                    updated.areas = updated.areas.map(a => {
                        if (a.id === newLog.area_id) {
                            return {
                                ...a,
                                total_acessos_hoje: (a.total_acessos_hoje || 0) + 1,
                                total_negados_hoje: (newLog.tipo === 'negado' || newLog.resultado === 'negado')
                                    ? (a.total_negados_hoje || 0) + 1
                                    : (a.total_negados_hoje || 0)
                            };
                        }
                        return a;
                    });
                }

                return updated;
            });
        });

        socket.on('area_alert', (alert) => {
            playAlarmSound();
            setActiveAreaAlert({
                id: Math.random().toString(36),
                pessoa_nome: alert.pessoa_nome || 'Indivíduo Não Autorizado',
                pessoa_foto: alert.pessoa_foto,
                area_nome: alert.area_nome || 'Área Restrita',
                tipo: alert.tipo || 'tentativa_area_restrita',
                timestamp: alert.hora || new Date().toISOString()
            });
            setTimeout(() => setActiveAreaAlert(null), 12000);
        });

        socket.on('watchlist_alert', (alert) => {
            playAlarmSound();
            const formattedAlert = {
                id: Math.random().toString(36),
                target_name: alert.pessoa.nome,
                pessoa: alert.pessoa,
                location: alert.area || alert.terminal,
                timestamp: alert.hora,
                metodo: alert.tipo,
                watchlist: alert.watchlist
            };
            setActiveAlert(formattedAlert);
            setTimeout(() => setActiveAlert(null), 12000);
        });

        return () => socket.disconnect();
    }, [eventoId, log, playAlarmSound]);

    const fetchConfig = useCallback(async () => {
        if (!eventoId) return;
        try {
            const [areasResp, dispResp] = await Promise.all([
                api.get('/config/areas', { params: { evento_id: eventoId } }),
                api.get('/dispositivos', { params: { evento_id: eventoId } })
            ]);
            const rawAreas = areasResp.data.data || [];
            // Normalizar nome da área
            const normalizedAreas = rawAreas.map(a => ({
                ...a,
                nome: a.nome_area || a.nome || 'Sem Nome'
            }));
            setAreas(normalizedAreas);
            setDispositivosLista(dispResp.data.data || []);
        } catch (error) {
            log('Erro ao carregar configs do monitor:', error);
        }
    }, [eventoId, log]);

    // Polling e Ticks
    useEffect(() => {
        fetchData();
        fetchCameras();
        fetchWatchlist();
        fetchTerminais();
        fetchConfig();

        const interval = setInterval(fetchData, 20000);
        const terminalInterval = setInterval(fetchTerminais, 30000);
        const tickTimer = setInterval(() => setTick(t => t + 1), 5000);

        return () => {
            clearInterval(interval);
            clearInterval(terminalInterval);
            clearInterval(tickTimer);
        };
    }, [fetchData, fetchCameras, fetchWatchlist, fetchTerminais, fetchConfig]);

    const logsFiltrados = useMemo(() => {
        return logs.filter(logEntry => {
            if (filtros.area_id && logEntry.area_id !== filtros.area_id) return false;
            if (filtros.dispositivo_id && logEntry.dispositivo_id !== filtros.dispositivo_id) return false;
            
            const tipoEfetivo = (logEntry.tipo === 'negado' || logEntry.resultado === 'negado') ? 'negado' : logEntry.tipo;
            if (filtros.tipo && filtros.tipo !== 'todos' && tipoEfetivo !== filtros.tipo) return false;
            
            return true;
        });
    }, [logs, filtros]);

    return {
        logs: logsFiltrados,
        allLogs: logs,
        stats, loading, tick,
        cameras, setCameras, fetchCameras, fetchWatchlist,
        terminais, areas, dispositivosLista,
        selectedCameras, setSelectedCameras,
        watchlist, newCpf, setNewCpf, isTracking,
        activeAlert, setActiveAlert,
        activeAreaAlert, setActiveAreaAlert,
        sysStatus, sysLogs, sysPerf, sysError,
        addToWatchlist, removeFromWatchlist, fetchSystemHealth,
        eventoId, filtros, setFiltros
    };
};
