import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from "html5-qrcode";
import {
    Box,
    Grid,
    Typography,
    Autocomplete,
    TextField
} from '@mui/material';
import io from 'socket.io-client';
import api from '../services/api';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import CheckoutStatsMonitor from '../components/checkout/CheckoutStatsMonitor';
import CheckoutLiveFeed from '../components/checkout/CheckoutLiveFeed';

const Checkout = () => {
    const [active, setActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [recentLogs, setRecentLogs] = useState([]);
    const [realtimeStats, setRealtimeStats] = useState(null);
    const [eventModules, setEventModules] = useState([]);

    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    useEffect(() => {
        loadInitialData();

        const socket = io((import.meta.env.VITE_API_URL || '').replace(/\/api$/, '') || window.location.origin, {
            transports: ['polling', 'websocket'],
            reconnectionAttempts: 5
        });
        
        socket.on('connect', () => {
            if (eventoId) socket.emit('join_event', eventoId);
        });

        socket.on('new_access', (newLog) => {
            if (eventoId && newLog.evento_id && newLog.evento_id !== eventoId) return;
            setRecentLogs(prev => {
                const updated = [newLog, ...prev];
                return updated.slice(0, 5);
            });
            if (newLog.tipo === 'checkout' || newLog.tipo === 'negado') {
                if (newLog.tipo === 'checkout') setResult({ ...newLog, type: 'success' });
                setTimeout(() => setResult(null), 7000);
            }
        });

        return () => socket.disconnect();
    }, [eventoId]);

    const loadInitialData = async () => {
        try {
            const [devRes, logRes, eventRes, statsRes] = await Promise.all([
                api.get('/devices', { params: { evento_id: eventoId } }),
                api.get(`/access/logs?limit=5&evento_id=${eventoId}`),
                api.get(`/eventos/${eventoId}`),
                api.get('/access/stats/realtime', { params: { evento_id: eventoId } })
            ]);
            setDevices(devRes.data.data || []);
            setRecentLogs(logRes.data.data || []);
            setEventModules(eventRes.data.data?.event_modules || []);
            setRealtimeStats(statsRes.data.data || null);

            if (devRes.data.data?.length > 0) setSelectedDevice(devRes.data.data[0]);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        }
    };

    useEffect(() => {
        let html5QrCode;
        if (active) {
            const startScanner = async () => {
                try {
                    html5QrCode = new Html5Qrcode("reader-checkout");
                    await html5QrCode.start(
                        { facingMode: "user" },
                        {
                            fps: 10,
                            qrbox: { width: 250, height: 250 }
                        },
                        async (decodedText) => {
                            console.log("QR Code detected:", decodedText);
                            await html5QrCode.stop();
                            setActive(false);
                            await handleQRCodeCheckout(decodedText);
                        },
                        (errorMessage) => { }
                    );
                } catch (err) {
                    console.error("Error starting scanner:", err);
                    setActive(false);
                }
            };
            setTimeout(startScanner, 100);
        }
        return () => {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().catch(err => console.error("Error stopping scanner", err));
            }
        };
    }, [active]);

    const handleSearch = async (val) => {
        setSearchQuery(val);
        if (val.length < 3) {
            setSearchResults([]);
            return;
        }
        try {
            const res = await api.get('/pessoas/search', { params: { q: val } });
            if (res.data.success) setSearchResults(res.data.data || []);
        } catch (error) {
            console.error('Erro na busca:', error);
        }
    };

    const handleQRCodeCheckout = async (qrCode) => {
        try {
            setLoading(true);
            const res = await api.post('/access/checkout/qrcode', {
                qrCode,
                dispositivoId: selectedDevice?.id,
                evento_id: eventoId
            });
            setResult({ ...res.data, type: 'success' });
        } catch (error) {
            console.error('Erro no checkout QR:', error);
            setResult({
                error: error.response?.data?.error || 'Falha ao registrar saída',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleManualCheckout = async (pessoaId) => {
        try {
            setLoading(true);
            const res = await api.post('/access/checkout', {
                pessoa_id: pessoaId,
                dispositivoId: selectedDevice?.id,
                evento_id: eventoId
            });
            setResult({ ...res.data, type: 'success' });
            setSearchResults([]);
            setSearchQuery('');
        } catch (error) {
            console.error('Erro no checkout manual:', error);
            setResult({
                error: error.response?.data?.error || 'Falha ao registrar saída',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ p: 4 }}>
            <PageHeader
                title="TERMINAL DE SAÍDA"
                subtitle="Registro manual e biométrico de encerramento de jornada (CHECK-OUT)."
                breadcrumbs={[{ text: 'Operacional' }, { text: 'Checkout' }]}
            />

            <Grid container spacing={4}>
                <Grid item xs={12} md={7}>
                    <GlassCard sx={{ p: 0, overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6" sx={{ color: '#FF3366', fontWeight: 800 }}>LIVE FEED / MANUAL</Typography>
                            <Autocomplete
                                size="small"
                                options={devices}
                                getOptionLabel={(option) => option.nome}
                                value={selectedDevice}
                                onChange={(_, newValue) => setSelectedDevice(newValue)}
                                renderInput={(params) => <TextField {...params} label="Dispositivo" sx={{ width: 200 }} />}
                                sx={{ ml: 2 }}
                            />
                        </Box>

                        <Box sx={{ p: 3 }}>
                            <CheckoutLiveFeed
                                active={active}
                                setActive={setActive}
                                result={result}
                                setResult={setResult}
                                loading={loading}
                                searchQuery={searchQuery}
                                handleSearch={handleSearch}
                                searchResults={searchResults}
                                handleManualCheckout={handleManualCheckout}
                            />
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <CheckoutStatsMonitor
                        realtimeStats={realtimeStats}
                        recentLogs={recentLogs}
                    />
                </Grid>
            </Grid>
        </Box>
    );
};

export default Checkout;
