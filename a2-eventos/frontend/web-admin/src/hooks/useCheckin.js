import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import io from 'socket.io-client';
import api from '../services/api';
import localCheckinService from '../services/LocalCheckinService';

/**
 * useCheckin: Hook de controle para a operação de recepção (NZT).
 * Modificado para focar em Checkout Manual, QR Code e Pulseiras (Barcode).
 */
export const useCheckin = (defaultMode) => {
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    // States - Fluxo de Atendimento
    const [selectedPessoa, setSelectedPessoa] = useState(null);
    const [activeScanner, setActiveScanner] = useState(false);
    const [checkinResult, setCheckinResult] = useState(null); // 'sucesso' | 'negado' | null
    const [resultMessage, setResultMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [manualSaving, setManualSaving] = useState(false);

    // States - Modo Quiosque
    const [modoQuiosque, setModoQuiosque] = useState(false);

    // States - Configurações e Logs
    const [operationMode, setOperationMode] = useState(defaultMode || localStorage.getItem('nzt_op_mode') || 'auto');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [eventModules, setEventModules] = useState([]);
    const [recentLogs, setRecentLogs] = useState([]);
    const [offlineCount, setOfflineCount] = useState(0);
    const [realtimeStats, setRealtimeStats] = useState(null);
    const [areaId, setAreaId] = useState(localStorage.getItem('nzt_area_id') || null);

    const rfidInputRef = useRef(null);
    const resetTimerRef = useRef(null);

    const updateOfflineCount = useCallback(async () => {
        const count = await localCheckinService.getPendenteCount();
        setOfflineCount(count);
    }, []);

    const loadInitialData = useCallback(async () => {
        if (!eventoId) return;
        try {
            const [logRes, eventRes, statsRes] = await Promise.all([
                api.get(`/access/logs`, { params: { limit: 10, evento_id: eventoId } }),
                api.get(`/eventos/${eventoId}`),
                api.get('/access/stats/realtime', { params: { evento_id: eventoId } })
            ]);
            setRecentLogs(logRes.data.data || []);
            setEventModules(eventRes.data.data?.event_modules || []);
            setRealtimeStats(statsRes.data.data || null);
        } catch (error) {
            console.error('Erro ao carregar dados de check-in:', error);
        }
    }, [eventoId]);

    // WebSocket Listeners
    useEffect(() => {
        if (!eventoId) return;

        const socketUrl = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '') || window.location.origin;
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const socket = io(socketUrl, {
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 5,
            auth: { token }
        });

        socket.on('connect', () => {
            socket.emit('join_event', eventoId);
        });

        socket.on('new_access', (newLog) => {
            if (newLog.evento_id && newLog.evento_id !== eventoId) return;
            setRecentLogs(prev => {
                const updated = [newLog, ...prev.filter(l => l.id !== newLog.id)];
                return updated.slice(0, 10);
            });
        });

        return () => socket.disconnect();
    }, [eventoId]);

    // Fullscreen Listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setModoQuiosque(false);
                document.body.classList.remove('modo-quiosque');
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Lifecycle
    useEffect(() => {
        loadInitialData();
        updateOfflineCount();
    }, [loadInitialData, updateOfflineCount]);

    // Actions
    const handleSearch = async (val) => {
        setSearchQuery(val);
        if (val.length < 3) {
            setSearchResults([]);
            return;
        }
        try {
            setLoading(true);
            const res = await api.get('/pessoas/search', { params: { q: val, evento_id: eventoId } });
            if (res.data.success) {
                setSearchResults(res.data.data);
            }
        } catch (error) {
            console.error('Erro na busca:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectPessoa = (pessoa) => {
        setSelectedPessoa(pessoa);
        setSearchResults([]);
        setSearchQuery('');
    };

    const consultarPulseiraAPI = async (codigo) => {
        if (!codigo || !eventoId) return;
        try {
            setLoading(true);
            const res = await api.get(`/access/consultar-pulseira/${codigo}`, { params: { evento_id: eventoId } });
            if (res.data.success) {
                const pessoa = res.data.data;
                handleSelectPessoa(pessoa);
                // Auto-confirmar check-in se encontrar pulseira (Ref correção flow)
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

    const performCheckin = async (metodo, extraValue = null, forcedPessoaId = null) => {
        let targetPessoa = forcedPessoaId ? { id: forcedPessoaId } : selectedPessoa;

        // Se é pulseira/barcode e não tem pessoa selecionada, buscar pela pulseira primeiro
        if (!targetPessoa && metodo === 'pulseira' && extraValue) {
            await consultarPulseiraAPI(extraValue);
            return; // consultarPulseiraAPI já seleciona a pessoa e mostra resultado
        }

        if (!targetPessoa && metodo !== 'qrcode') return;

        try {
            setManualSaving(true);
            let res;

            // CREDENCIAMENTO via BARCODE/PULSEIRA: endpoint novo que vincula áreas + auto check-in
            if (metodo === 'pulseira') {
                res = await api.post(`/access/credenciar-pulseira`, {
                    pessoa_id: targetPessoa.id,
                    numero_pulseira: extraValue,
                    area_id: areaId
                });
            } else {
                // CHECK-IN MANUAL ou QRCODE: Usar fluxo existente
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

            if (res.status === 'erro_negocio' || (finalData && finalData.tipo === 'negado')) {
                setCheckinResult('negado');
                setResultMessage(finalData.erro || finalData.observacao || 'Acesso não autorizado.');
            } else {
                setCheckinResult('sucesso');
                setResultMessage('CHECK-IN REALIZADO');
            }

            // Reset automático após 3s (cleanup evita setState após unmount)
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(() => {
                setSelectedPessoa(null);
                setCheckinResult(null);
                setResultMessage('');
                setSearchResults([]);
                setSearchQuery('');
            }, 3000);

            loadInitialData();
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

    const toggleQuiosque = () => {
        if (!modoQuiosque) {
            document.documentElement.requestFullscreen().then(() => {
                setModoQuiosque(true);
                document.body.classList.add('modo-quiosque');
            }).catch(err => console.error('Erro Fullscreen:', err));
        } else {
            document.exitFullscreen().then(() => {
                setModoQuiosque(false);
                document.body.classList.remove('modo-quiosque');
            }).catch(err => console.error('Erro Exit Fullscreen:', err));
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

    return {
        selectedPessoa, setSelectedPessoa: handleSelectPessoa,
        activeScanner, setActiveScanner,
        checkinResult, setCheckinResult,
        resultMessage, setResultMessage,
        loading, manualSaving,
        operationMode, changeOperationMode,
        modoQuiosque, toggleQuiosque,
        searchQuery, setSearchQuery, handleSearch,
        searchResults, setSearchResults,
        eventModules, rfidInputRef,
        recentLogs, offlineCount, realtimeStats,
        areaId, changeAreaId,
        consultarPulseiraAPI,
        performCheckin,
        eventoId
    };
};
