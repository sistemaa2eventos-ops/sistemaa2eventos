import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button, Alert, CircularProgress
} from '@mui/material';
import api from '../../services/api';

const COR = { ok: '#00FF88', alerta: '#FFB800', erro: '#FF3366', nao_testado: '#64748B' };

/**
 * "Diagnosticar" de uma câmera: cadastro, PC do evento, rede (ping/porta), imagem, miniatura, IA e
 * gravação, cada um com a correção em linguagem simples. Mesmo formato do diagnóstico dos leitores.
 *
 * @param camera câmera a diagnosticar (null fecha a janela)
 * @param onEditar abre o formulário da câmera (ação "Editar câmera")
 * @param onResultado recebe o resultado (para atualizar o status na lista)
 */
const DiagnosticoCamera = ({ camera, onClose, onEditar, onResultado }) => {
    const [estado, setEstado] = useState({ carregando: false, dados: null, erro: null });
    const onResultadoRef = useRef(onResultado);
    onResultadoRef.current = onResultado;

    const diagnosticar = useCallback(async (cam) => {
        if (!cam) return;
        setEstado({ carregando: true, dados: null, erro: null });
        try {
            const { data } = await api.post(`/cameras/${cam.id}/diagnosticar`, {}, { timeout: 70000, hideDefaultError: true });
            setEstado({ carregando: false, dados: data?.data, erro: null });
            onResultadoRef.current?.(cam, data?.data);
        } catch (err) {
            setEstado({ carregando: false, dados: null, erro: err.response?.data?.error || err.message });
        }
    }, []);

    useEffect(() => { if (camera) diagnosticar(camera); }, [camera, diagnosticar]);

    const { carregando, dados, erro } = estado;
    const gravidade = dados?.itens?.some(i => i.estado === 'erro') ? 'error' : dados?.itens?.some(i => i.estado === 'alerta') ? 'warning' : 'success';

    return (
        <Dialog open={!!camera} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Diagnóstico: {camera?.nome}</DialogTitle>
            <DialogContent dividers>
                {carregando && (
                    <Box sx={{ py: 3, textAlign: 'center' }}>
                        <CircularProgress size={28} />
                        <Typography variant="body2" sx={{ mt: 1, color: '#94A3B8' }}>Testando a câmera pela rede do evento (até 40 s)...</Typography>
                    </Box>
                )}
                {erro && <Alert severity="error">Não deu para diagnosticar: {erro}</Alert>}
                {dados && (
                    <>
                        <Alert severity={gravidade} sx={{ mb: 1.5 }}>{dados.resumo}</Alert>
                        {dados.itens.map((i) => {
                            const cor = COR[i.estado] || '#94A3B8';
                            return (
                                <Box key={i.chave} sx={{ display: 'flex', gap: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cor, mt: 0.75, flexShrink: 0 }} aria-label={i.estado} />
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{i.titulo}</Typography>
                                        <Typography variant="body2" sx={{ color: '#CBD5E1', wordBreak: 'break-word' }}>{i.detalhe}</Typography>
                                        {i.como_corrigir && <Typography variant="caption" sx={{ color: cor, display: 'block', mt: 0.25 }}>{i.como_corrigir}</Typography>}
                                    </Box>
                                    {i.acao === 'editar' && onEditar && (
                                        <Button size="small" variant="outlined" onClick={() => { onClose(); onEditar(camera); }}
                                            sx={{ alignSelf: 'center', flexShrink: 0, fontSize: '0.72rem' }}>
                                            Editar câmera
                                        </Button>
                                    )}
                                </Box>
                            );
                        })}
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={() => diagnosticar(camera)} disabled={carregando || !camera}>Testar de novo</Button>
                <Button onClick={onClose}>Fechar</Button>
            </DialogActions>
        </Dialog>
    );
};

export default DiagnosticoCamera;
