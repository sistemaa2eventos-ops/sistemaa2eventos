import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ErrorOutline as RecusaIcon } from '@mui/icons-material';

import api from '../../services/api';
import { parseLocalDate } from '../../utils/dateUtils';
import { cores } from '../../styles/tokens';

const INTERVALO_ATUALIZACAO_MS = 30000;
// Códigos de recusa que o backend já usa; o resto aparece legível (ou como veio)
const MOTIVOS = {
    ENTRADA_BLOQUEADA: 'Pessoa já estava dentro (entrada bloqueada)',
    TURNO_ANTERIOR: 'Saída de um turno anterior não confirmada'
};
const ROTULO_TIPO = { checkout: 'Saída', checkin: 'Entrada' };

export const descreverMotivo = (motivo) => {
    if (!motivo) return 'Recusada pelo servidor';
    if (MOTIVOS[motivo]) return MOTIVOS[motivo];
    if (/^[A-Z0-9_]+$/.test(motivo)) {
        const frase = motivo.toLowerCase().replace(/_/g, ' ');
        return frase.charAt(0).toUpperCase() + frase.slice(1);
    }
    return motivo;
};

const horaDe = (valor) => {
    const data = valor ? parseLocalDate(valor) : null;
    if (!(data instanceof Date) || Number.isNaN(data.getTime())) return '--:--';
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Passagens que o servidor recusou e que ainda estão pendentes neste evento (GET /checkin/recusados).
 * É outra fonte que RecusadosSincronizacao (fila do aparelho): não misture as duas.
 * Sem a rota (404/503) ou sem conexão, o bloco fica escondido e a tela segue normal.
 */
const PassagensRecusadas = ({ eventoId, cor = cores.erro }) => {
    const [itens, setItens] = useState([]);
    const [resolvendoId, setResolvendoId] = useState(null);
    const [erro, setErro] = useState('');

    const carregar = useCallback(async () => {
        if (!eventoId) {
            setItens([]);
            return;
        }
        try {
            const res = await api.get('/checkin/recusados', {
                params: { evento_id: eventoId },
                hideDefaultError: true
            });
            setItens(Array.isArray(res.data?.data) ? res.data.data : []);
        } catch (err) {
            const status = err.response?.status;
            if (status !== 404 && status !== 503) console.warn('Erro ao ler passagens recusadas:', err.message);
            setItens([]);
        }
    }, [eventoId]);

    useEffect(() => {
        carregar();
        const timer = setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
        window.addEventListener('sync-status-changed', carregar);
        window.addEventListener('offline-sync-completed', carregar);
        return () => {
            clearInterval(timer);
            window.removeEventListener('sync-status-changed', carregar);
            window.removeEventListener('offline-sync-completed', carregar);
        };
    }, [carregar]);

    const resolver = async (id) => {
        setResolvendoId(id);
        setErro('');
        try {
            await api.post(`/checkin/recusados/${id}/resolver`, {}, { hideDefaultError: true });
            setItens((atual) => atual.filter((item) => item.id !== id));
            carregar();
        } catch (err) {
            setErro(err.response?.data?.error || 'Não foi possível resolver. Tente de novo.');
        } finally {
            setResolvendoId(null);
        }
    };

    if (itens.length === 0) return null;

    return (
        <Box
            role="region"
            aria-label="Passagens recusadas"
            sx={{ mt: 1.5, p: 1.25, borderRadius: 1.5, border: `1px solid ${cor}66`, bgcolor: `${cor}14`, maxHeight: 220, overflowY: 'auto' }}
        >
            <Typography variant="body2" fontWeight={700} sx={{ color: '#FFB3C6', display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                <RecusaIcon sx={{ fontSize: 18 }} /> Passagens recusadas ({itens.length})
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.6)', mb: 0.75 }}>
                O servidor não aceitou estas passagens. Confira com a pessoa e resolva.
            </Typography>
            {erro && (
                <Typography variant="caption" sx={{ display: 'block', color: cores.erro, fontWeight: 700, mb: 0.5 }}>
                    {erro}
                </Typography>
            )}
            <Stack spacing={0.6}>
                {itens.map((item) => (
                    <Stack
                        key={item.id}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        spacing={1}
                        sx={{ py: 0.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}
                    >
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={700} noWrap>
                                {ROTULO_TIPO[item.tipo] || 'Acesso'}: {item.pessoa_nome || `Pessoa ${String(item.pessoa_id || '').slice(0, 8)}`}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#FFB3C6', display: 'block' }} noWrap>
                                {horaDe(item.criado_em)} · {descreverMotivo(item.motivo)}
                            </Typography>
                        </Box>
                        <Button
                            size="small"
                            onClick={() => resolver(item.id)}
                            disabled={resolvendoId === item.id}
                            sx={{ color: cores.textoForte, textTransform: 'none', flexShrink: 0 }}
                        >
                            Resolver
                        </Button>
                    </Stack>
                ))}
            </Stack>
        </Box>
    );
};

export default PassagensRecusadas;
