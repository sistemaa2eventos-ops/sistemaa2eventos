import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ErrorOutline as RecusaIcon } from '@mui/icons-material';

import localCheckinService from '../../services/LocalCheckinService';

const ROTULO_TIPO = { checkout: 'Saída', checkin: 'Entrada' };

const descreverCodigo = (payload = {}) => (
    payload.codigo || payload.numero_pulseira || (payload.pessoa_id ? `Pessoa ${String(payload.pessoa_id).slice(0, 8)}` : '—')
);

/**
 * Acessos feitos sem internet que o servidor recusou ao sincronizar (status erro_negocio).
 * Ficam aqui até o operador dispensar: antes, nenhuma tela mostrava essa recusa.
 */
const RecusadosSincronizacao = ({ cor = '#FF3366' }) => {
    const [itens, setItens] = useState([]);
    const [dispensando, setDispensando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            setItens(await localCheckinService.listarRecusados());
        } catch (err) {
            console.warn('Erro ao ler recusados da fila:', err.message);
            setItens([]);
        }
    }, []);

    useEffect(() => {
        carregar();
        window.addEventListener('sync-status-changed', carregar);
        window.addEventListener('offline-sync-completed', carregar);
        return () => {
            window.removeEventListener('sync-status-changed', carregar);
            window.removeEventListener('offline-sync-completed', carregar);
        };
    }, [carregar]);

    const dispensar = async (id) => {
        await localCheckinService.dispensarRecusado(id);
        carregar();
    };

    const dispensarTodos = async () => {
        setDispensando(true);
        try {
            for (const item of itens) await localCheckinService.dispensarRecusado(item.id);
        } finally {
            setDispensando(false);
            carregar();
        }
    };

    if (itens.length === 0) return null;

    return (
        <Box
            role="region"
            aria-label="Acessos recusados pelo servidor"
            sx={{ mt: 1.5, p: 1.25, borderRadius: 1.5, border: `1px solid ${cor}66`, bgcolor: `${cor}14`, maxHeight: 220, overflowY: 'auto' }}
        >
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} mb={0.75}>
                <Typography variant="body2" fontWeight={700} sx={{ color: '#FFB3C6', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <RecusaIcon sx={{ fontSize: 18 }} /> Recusados pelo servidor ({itens.length})
                </Typography>
                <Button size="small" onClick={dispensarTodos} disabled={dispensando} sx={{ color: '#FFFFFF', textTransform: 'none', fontWeight: 700 }}>
                    Dispensar todos
                </Button>
            </Stack>
            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.6)', mb: 0.75 }}>
                Feitos sem internet e não aceitos pelo servidor (ou sem resposta em 3 tentativas). Confira na pessoa e dispense.
            </Typography>
            <Stack spacing={0.6}>
                {itens.map((item) => (
                    <Stack key={item.id} direction="row" alignItems="center" justifyContent="space-between" spacing={1}
                        sx={{ py: 0.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={700} noWrap>
                                {ROTULO_TIPO[item.payload?.tipo] || 'Acesso'}: {descreverCodigo(item.payload)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#FFB3C6', display: 'block' }} noWrap>
                                {item.observacao || 'Recusado pelo servidor'}
                            </Typography>
                        </Box>
                        <Button size="small" onClick={() => dispensar(item.id)} sx={{ color: '#FFFFFF', textTransform: 'none', flexShrink: 0 }}>
                            Dispensar
                        </Button>
                    </Stack>
                ))}
            </Stack>
        </Box>
    );
};

export default RecusadosSincronizacao;
