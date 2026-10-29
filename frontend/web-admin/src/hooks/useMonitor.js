import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSnackbar } from 'notistack';
import { useSearchParams } from 'react-router-dom';
import { usarConexao } from '../services/realtime';
import api from '../services/api';
import { tocarAlerta, criarFiltroAlertas } from '../utils/alertSound';
import { useIaConfig } from './useIaConfig';

const MAX_HISTORICO_ALERTAS = 20;
const cpfLimpo = (cpf) => String(cpf || '').replace(/\D/g, '');

/**
 * useMonitor: Hook de inteligência para a tela de monitoramento em tempo real.
 * Centraliza WebSockets, polling de status e gerenciamento de watchlist.
 */
const STATS_VAZIAS = {
    presentes: 0, capacidade: 0, checkins_hoje: 0, checkouts_hoje: 0,
    negados_hoje: 0, fiscalizacoes_hoje: 0, areas: [], empresas: []
};

export const useMonitor = ({ isAdminMaster = false } = {}) => {
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
    // Conexão em tempo real: 'conectando' | 'conectado' | 'reconectando' | 'offline'
    const [conexao, setConexao] = useState('conectando');
    const conexaoRef = useRef('conectando');
    useEffect(() => { conexaoRef.current = conexao; }, [conexao]);
    const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

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
    const [contatos, setContatos] = useState([]);
    const [newCpf, setNewCpf] = useState('');
    const [isTracking, setIsTracking] = useState(false);
    const [activeAlert, setActiveAlert] = useState(null);
    const [activeAreaAlert, setActiveAreaAlert] = useState(null);
    // Últimos alertas recebidos (o alerta na tela é um só; os anteriores ficam aqui)
    const [historicoAlertas, setHistoricoAlertas] = useState([]);

    // Configuração do painel (som, intervalo de repetição): lida pelos handlers do socket via ref
    const { config: iaConfig } = useIaConfig();
    const painelRef = useRef(iaConfig.painel);
    painelRef.current = iaConfig.painel;
    const filtroAlertasRef = useRef(criarFiltroAlertas());
    const timersAlertaRef = useRef({ area: null, watchlist: null });

    // Bipe suave de mensagem/notificação discreta (sem sirene estridente); respeita "silenciar"
    const playAlarmSound = useCallback(() => {
        if (painelRef.current?.som_alerta === false) return;
        tocarAlerta('discreto');
    }, []);

    /** Some sozinho depois de `ms`, mas só se ainda for o mesmo alerta (antes um timer velho apagava o novo) */
    const agendarFimAlerta = (tipo, setter, id, ms) => {
        clearTimeout(timersAlertaRef.current[tipo]);
        timersAlertaRef.current[tipo] = setTimeout(() => setter(prev => (prev?.id === id ? null : prev)), ms);
    };

    // States - System Health
    const [sysStatus, setSysStatus] = useState(null);
    const [sysLogs, setSysLogs] = useState([]);
    const [sysPerf, setSysPerf] = useState(null);
    const [sysError, setSysError] = useState(false);
    const [areas, setAreas] = useState([]);
    const [dispositivosLista, setDispositivosLista] = useState([]);

    const fetchStats = useCallback(async () => {
        if (!eventoId) return;
        try {
            const resp = await api.get('/access/stats/realtime', { params: { evento_id: eventoId }, timeout: 8000, hideDefaultError: true });
            setStats(resp.data.data || STATS_VAZIAS);
            setUltimaAtualizacao(new Date());
        } catch {
            log('Aviso: estatísticas temporariamente indisponíveis');
        }
    }, [eventoId, log]);

    // Agrupa passagens simultâneas: um recálculo ~1,2 s após a última
    const statsTimerRef = useRef(null);
    const agendarStats = useCallback(() => {
        if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
        statsTimerRef.current = setTimeout(fetchStats, 1200);
    }, [fetchStats]);

    const fetchData = useCallback(async () => {
        if (!eventoId) return;
        try {
            const [logsResp, statsResp] = await Promise.all([
                api.get('/access/logs', { params: { limit: 100, evento_id: eventoId }, timeout: 8000, hideDefaultError: true }),
                api.get('/access/stats/realtime', { params: { evento_id: eventoId }, timeout: 8000, hideDefaultError: true })
            ]);
            setLogs(logsResp.data.data || []);
            setStats(statsResp.data.data || STATS_VAZIAS);
            setUltimaAtualizacao(new Date());
        } catch (error) {
            log('Aviso: polling do monitor temporariamente indisponível');
        } finally {
            setLoading(false);
        }
    }, [eventoId, log]);

    const fetchTerminais = useCallback(async () => {
        if (!eventoId) return;
        try {
            const response = await api.get('/monitor/terminais', { params: { evento_id: eventoId }, timeout: 8000, hideDefaultError: true });
            setTerminais(response.data.data || []);
        } catch (error) {
            log('Aviso: busca de terminais temporariamente indisponível');
        }
    }, [eventoId, log]);

    const fetchSystemHealth = useCallback(async () => {
        setSysError(false);
        const [statusR, logsR, perfR] = await Promise.allSettled([
            api.get('/monitor/system-status', { timeout: 8000, hideDefaultError: true }),
            api.get('/monitor/logs?lines=100', { timeout: 8000, hideDefaultError: true }),
            api.get('/monitor/performance', { timeout: 8000, hideDefaultError: true })
        ]);
        if (statusR.status === 'fulfilled') setSysStatus(statusR.value.data);
        if (logsR.status === 'fulfilled') setSysLogs(logsR.value.data.logs || []);
        if (perfR.status === 'fulfilled') setSysPerf(perfR.value.data);
        if ([statusR, logsR, perfR].some(r => r.status === 'rejected')) {
            // Silencioso sem spam de popups
            setSysError(true);
        }
    }, []);

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
        // Watchlist é sigilosa: somente Admin Master (o backend também bloqueia)
        if (!eventoId || !isAdminMaster) return;
        try {
            const response = await api.get('/watchlist', { params: { evento_id: eventoId } });
            setWatchlist(response.data.data || []);
        } catch (e) {
            enqueueSnackbar('Erro ao carregar watchlist', { variant: 'error' });
        }
    }, [eventoId, enqueueSnackbar, isAdminMaster]);

    const fetchContatos = useCallback(async () => {
        if (!eventoId || !isAdminMaster) return;
        try {
            const resp = await api.get('/watchlist/contatos', { params: { evento_id: eventoId } });
            setContatos(resp.data.data || []);
        } catch (e) {
            log('Erro ao carregar contatos da watchlist:', e);
        }
    }, [eventoId, log, isAdminMaster]);

    const addContato = async (novoContato) => {
        if (!eventoId) return false;
        try {
            await api.post('/watchlist/contatos', { ...novoContato, evento_id: eventoId });
            enqueueSnackbar('Contato de notificação cadastrado com sucesso!', { variant: 'success' });
            fetchContatos();
            return true;
        } catch (e) {
            enqueueSnackbar('Erro ao cadastrar contato: ' + (e.response?.data?.error || e.message), { variant: 'error' });
            return false;
        }
    };

    const removeContato = async (id) => {
        try {
            await api.delete(`/watchlist/contatos/${id}`);
            enqueueSnackbar('Contato removido da lista!', { variant: 'success' });
            fetchContatos();
            return true;
        } catch (e) {
            enqueueSnackbar('Erro ao remover contato', { variant: 'error' });
            return false;
        }
    };

    const addToWatchlist = async (payload) => {
        const cpf = typeof payload === 'string' ? payload : payload?.cpf;
        if (!cpf) return false;
        try {
            setIsTracking(true);
            const body = typeof payload === 'string' 
                ? { cpf, evento_id: eventoId } 
                : { ...payload, evento_id: eventoId };
            await api.post('/watchlist/manual', body);
            setNewCpf('');
            enqueueSnackbar('Alvo adicionado à Watchlist com sucesso!', { variant: 'success' });
            fetchWatchlist();
            return true;
        } catch (e) {
            enqueueSnackbar('Erro ao adicionar à watchlist: ' + (e.response?.data?.error || e.message), { variant: 'error' });
            return false;
        } finally {
            setIsTracking(false);
        }
    };

    const removeFromWatchlist = async (id, motivo_desbloqueio = null) => {
        return desbloquearAlvo(id, motivo_desbloqueio || 'Desbloqueio solicitado via painel da Watchlist');
    };

    /**
     * Desbloqueio oficial de alvo com justificativa e notificação ao Admin Master
     */
    const desbloquearAlvo = async (id, motivo_desbloqueio) => {
        try {
            const resp = await api.post(`/watchlist/${id}/desbloquear`, { motivo_desbloqueio });
            setWatchlist(prev => prev.filter(w => w.id !== id));
            enqueueSnackbar(resp.data.message || 'Alvo desbloqueado com sucesso! Acesso e cadastro liberados.', { variant: 'success' });
            fetchWatchlist();
            return true;
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            enqueueSnackbar('Erro ao desbloquear: ' + msg, { variant: 'error' });
            return false;
        }
    };

    /**
     * Deixar de monitorar um alvo (quando encontrado ou abordado pela equipe de segurança)
     */
    const deixarDeMonitorar = async (id, motivo = 'Alvo localizado pela equipe de segurança') => {
        try {
            const resp = await api.post(`/watchlist/${id}/deixar-de-monitorar`, {
                evento_id: eventoId,
                motivo
            });
            setWatchlist(prev => prev.filter(w => w.id !== id));
            enqueueSnackbar(resp.data.message || 'Alvo localizado! Monitoramento encerrado com sucesso.', { variant: 'success' });
            fetchWatchlist();
            return true;
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            enqueueSnackbar('Erro ao encerrar monitoramento: ' + msg, { variant: 'error' });
            return false;
        }
    };

    /**
     * Exportação autenticada de participantes para Excel
     */
    const exportarParticipantes = async () => {
        try {
            enqueueSnackbar('Gerando planilha de participantes...', { variant: 'info' });
            const resp = await api.get('/excel/export/pessoas', {
                params: { evento_id: eventoId },
                responseType: 'blob'
            });

            if (resp.data.type === 'application/json') {
                const text = await resp.data.text();
                const errJson = JSON.parse(text);
                throw new Error(errJson.error || 'Erro ao gerar planilha');
            }

            const blob = new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Participantes_Evento_${new Date().toISOString().slice(0, 10)}.xlsx`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            enqueueSnackbar('Planilha exportada com sucesso!', { variant: 'success' });
            return true;
        } catch (e) {
            console.error('Erro na exportação de participantes:', e);
            enqueueSnackbar('Falha ao exportar participantes: ' + (e.message || 'Verifique se há participantes cadastrados.'), { variant: 'error' });
            return false;
        }
    };

    /**
     * Download do modelo oficial de CSV para a Watchlist
     */
    const baixarModeloCSV = async () => {
        try {
            const resp = await api.get('/watchlist/template-csv', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([resp.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'modelo_importacao_watchlist.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            enqueueSnackbar('Modelo CSV baixado com sucesso!', { variant: 'success' });
        } catch (e) {
            enqueueSnackbar('Erro ao baixar modelo CSV', { variant: 'error' });
        }
    };

    /**
     * Finalizar rastreamento de um alvo localizado pela equipe
     */
    const concluirRastreamento = async (cpf, motivo = 'Alvo localizado / abordado pela equipe') => {
        if (!eventoId || !cpf) return false;
        try {
            await api.post('/watchlist/concluir-rastreamento', {
                evento_id: eventoId,
                cpf,
                motivo
            });
            setActiveAlert(null);
            filtroAlertasRef.current.esquecer(`wl:${cpfLimpo(cpf)}`); // se aparecer de novo, alerta na hora
            enqueueSnackbar('Rastreamento concluído! Alvo localizado pela equipe.', { variant: 'success' });
            return true;
        } catch (e) {
            console.error('Erro ao concluir rastreamento:', e);
            enqueueSnackbar('Erro ao concluir rastreamento', { variant: 'error' });
            return false;
        }
    };

    // WebSocket Management
    useEffect(() => {
        if (!eventoId) return;

        // Conexão compartilhada da aba (services/realtime.js)
        const socket = usarConexao();
        socket.entrarEvento(eventoId);
        let jaConectou = socket.conectado;
        socket.on('connect', () => {
            setConexao('conectado');
            log('Conectado ao WebSocket do Monitor');
            // Ao REconectar, sincroniza o que pode ter sido perdido (a 1ª carga já é feita ao abrir a tela)
            if (jaConectou) fetchData();
            jaConectou = true;
        });
        if (socket.conectado) setConexao('conectado'); // conexão já aberta por outra parte do painel
        socket.on('disconnect', () => setConexao('reconectando'));
        socket.on('connect_error', () => setConexao(prev => (prev === 'conectado' ? 'reconectando' : 'offline')));
        socket.onGerenciador('reconnect_attempt', () => setConexao('reconectando'));

        // No pico (várias catracas) chegam vários acessos por segundo: junta e aplica a cada 400 ms,
        // em vez de redesenhar o Monitor inteiro a cada passagem
        let pendentes = [];
        let timerLote = null;
        const aplicarLote = () => {
            timerLote = null;
            const lote = pendentes;
            pendentes = [];
            const ids = new Set(lote.map(l => l.id));
            setLogs(prev => [...lote.reverse(), ...prev.filter(l => !ids.has(l.id))].slice(0, 100));
            agendarStats();
        };
        socket.on('new_access', (newLog) => {
            // Feed na hora; contadores (presentes, áreas, negados) recalculados no servidor —
            // a soma local errava com credenciamento, troca de área e passagens repetidas.
            pendentes = [...pendentes.filter(l => l.id !== newLog.id), newLog];
            if (!timerLote) timerLote = setTimeout(aplicarLote, 400);
        });

        socket.on('area_alert', (alert) => {
            const repetirS = painelRef.current?.alerta_repetir_s || 30;
            const chave = `area:${alert.tipo}:${alert.pessoa_nome}:${alert.area_nome}`;
            if (!filtroAlertasRef.current.novo(chave, repetirS)) return;
            playAlarmSound();
            const id = Math.random().toString(36);
            setActiveAreaAlert({
                id,
                pessoa_nome: alert.pessoa_nome || 'Indivíduo Não Autorizado',
                pessoa_foto: alert.pessoa_foto,
                area_nome: alert.area_nome || 'Área Restrita',
                tipo: alert.tipo || 'tentativa_area_restrita',
                timestamp: alert.hora || new Date().toISOString()
            });
            agendarFimAlerta('area', setActiveAreaAlert, id, 12000);
        });

        socket.on('watchlist_alert', (alert) => {
            if (!isAdminMaster) return; // só chega à sala do Admin Master; proteção extra
            const pessoa = alert.pessoa || {};
            // Mesmo alvo de novo dentro do intervalo (outra câmera, outra tela): atualiza sem tocar de novo
            const repetido = !filtroAlertasRef.current.novo(`wl:${cpfLimpo(pessoa.cpf || alert.cpf) || alert.alerta_id}`, painelRef.current?.alerta_repetir_s || 30);
            if (!repetido) playAlarmSound();
            const formattedAlert = {
                id: alert.alerta_id || Math.random().toString(36),
                target_name: pessoa.nome || alert.target_name || 'Alvo em Monitoramento',
                pessoa: {
                    nome: pessoa.nome || alert.target_name || 'Alvo Detectado',
                    cpf: pessoa.cpf || '—',
                    foto_url: pessoa.foto_url,
                    funcao: pessoa.funcao,
                    numero_pulseira: pessoa.numero_pulseira
                },
                foto_capturada: alert.foto_capturada || null,
                face_crop: alert.face_crop || null,
                dispositivo: alert.dispositivo || {
                    nome: alert.camera_nome || alert.terminal || 'Câmera IP',
                    ip: alert.dispositivo_ip,
                    fabricante: alert.dispositivo_fabricante
                },
                location: alert.localizacao || alert.area || alert.terminal || alert.camera_nome || 'Câmera de Monitoramento',
                localizacao: alert.localizacao || alert.area || 'Área Principal do Evento',
                localizacao_detalhe: alert.localizacao_detalhe || alert.localizacao || alert.area,
                timestamp: alert.timestamp || alert.hora || new Date().toISOString(),
                metodo: alert.metodo || alert.tipo || 'reconhecimento_camera',
                watchlist: alert.watchlist || { motivo: 'Alvo procurado na Watchlist', nivel_alerta: 'alto' }
            };
            setActiveAlert(formattedAlert);
            if (!repetido) setHistoricoAlertas(prev => [formattedAlert, ...prev].slice(0, MAX_HISTORICO_ALERTAS));
            // Duração estendida para a equipe de segurança intervir
            agendarFimAlerta('watchlist', setActiveAlert, formattedAlert.id, 45000);
        });

        socket.on('watchlist_alert_concluido', (data) => {
            log('Rastreamento concluído recebido via socket:', data);
            setActiveAlert(prev => {
                if (prev) {
                    const alertCpf = (prev.pessoa?.cpf || '').replace(/\D/g, '');
                    const doneCpf = (data?.cpf || '').replace(/\D/g, '');
                    if (!doneCpf || alertCpf === doneCpf) {
                        return null;
                    }
                }
                return prev;
            });
        });

        const timersAlerta = timersAlertaRef.current;
        return () => {
            if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
            clearTimeout(timerLote);
            clearTimeout(timersAlerta.area);
            clearTimeout(timersAlerta.watchlist);
            setConexao('offline');
            socket.liberar();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventoId, log, playAlarmSound, isAdminMaster, agendarStats]);

    const fetchConfig = useCallback(async () => {
        if (!eventoId) return;
        try {
            const [areasResp, dispResp] = await Promise.all([
                api.get('/config/areas', { params: { evento_id: eventoId }, timeout: 8000, hideDefaultError: true }),
                api.get('/dispositivos', { params: { evento_id: eventoId }, timeout: 8000, hideDefaultError: true })
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
            log('Aviso: configs do monitor temporariamente indisponíveis');
        }
    }, [eventoId, log]);

    // Polling e Ticks
    useEffect(() => {
        fetchData();
        fetchCameras();
        fetchWatchlist();
        fetchContatos();
        fetchTerminais();
        fetchConfig();

        // Recarga completa é só rede de segurança: com o tempo real conectado, as passagens
        // chegam pelo WebSocket. Conectado → a cada 60 s; sem conexão → a cada 15 s;
        // aba escondida → nada (atualiza ao voltar).
        let ultimaCarga = Date.now();
        const recarregar = () => {
            ultimaCarga = Date.now();
            fetchData();
        };
        const interval = setInterval(() => {
            if (document.hidden) return;
            const intervalo = conexaoRef.current === 'conectado' ? 60000 : 15000;
            if (Date.now() - ultimaCarga >= intervalo) recarregar();
        }, 15000);
        const terminalInterval = setInterval(() => { if (!document.hidden) fetchTerminais(); }, 60000);
        // Status das câmeras (online/offline) muda sem ninguém recarregar a tela
        const camerasInterval = setInterval(() => { if (!document.hidden) fetchCameras(); }, 60000);
        const aoVoltar = () => {
            if (!document.hidden && Date.now() - ultimaCarga > 15000) {
                recarregar();
                fetchTerminais();
            }
        };
        document.addEventListener('visibilitychange', aoVoltar);

        return () => {
            clearInterval(interval);
            clearInterval(terminalInterval);
            clearInterval(camerasInterval);
            document.removeEventListener('visibilitychange', aoVoltar);
        };
    }, [fetchData, fetchCameras, fetchWatchlist, fetchContatos, fetchTerminais, fetchConfig]);

    const logsFiltrados = useMemo(() => {
        // Registros antigos guardam o NOME do leitor em dispositivo_id; os novos, o UUID
        const dispositivoSelecionado = filtros.dispositivo_id
            ? dispositivosLista.find(d => d.id === filtros.dispositivo_id)
            : null;
        return logs.filter(logEntry => {
            if (filtros.area_id && logEntry.area_id !== filtros.area_id) return false;
            if (filtros.dispositivo_id) {
                const mesmoLeitor = logEntry.dispositivo_id === filtros.dispositivo_id
                    || (dispositivoSelecionado && (logEntry.dispositivo_id === dispositivoSelecionado.nome
                        || logEntry.dispositivo_nome === dispositivoSelecionado.nome));
                if (!mesmoLeitor) return false;
            }
            
            const tipoEfetivo = (logEntry.tipo === 'negado' || logEntry.resultado === 'negado') ? 'negado' : logEntry.tipo;
            if (filtros.tipo && filtros.tipo !== 'todos' && tipoEfetivo !== filtros.tipo) return false;
            
            return true;
        });
    }, [logs, filtros, dispositivosLista]);

    return {
        logs: logsFiltrados,
        allLogs: logs,
        stats, loading,
        cameras, setCameras, fetchCameras, fetchWatchlist,
        historicoAlertas,
        terminais, areas, dispositivosLista,
        selectedCameras, setSelectedCameras,
        watchlist, contatos, fetchContatos, addContato, removeContato,
        desbloquearAlvo, deixarDeMonitorar, exportarParticipantes, baixarModeloCSV,
        newCpf, setNewCpf, isTracking,
        activeAlert, setActiveAlert,
        activeAreaAlert, setActiveAreaAlert,
        playAlarmSound,
        sysStatus, sysLogs, sysPerf, sysError,
        conexao, ultimaAtualizacao,
        addToWatchlist, removeFromWatchlist, fetchSystemHealth,
        concluirRastreamento,
        eventoId, filtros, setFiltros
    };
};

