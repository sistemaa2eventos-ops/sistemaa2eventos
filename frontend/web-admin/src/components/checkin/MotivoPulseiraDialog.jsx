import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, Alert } from '@mui/material';
import { Warning as AvisoIcon } from '@mui/icons-material';
import { cores } from '../../styles/tokens';

const dataHora = (iso) => (iso
    ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '');

/**
 * Saída de quem recebeu pulseira num dia de operação anterior e não a devolveu. O servidor só registra a
 * saída com o motivo (400 MOTIVO_PULSEIRA_FORA_HORARIO). Aqui o operador informa o motivo e a mesma saída é reenviada.
 * motivo: { pendencia: { numero, dataCheckin } | null, repetir(texto) } ou null (fechado).
 */
const MotivoPulseiraDialog = ({ motivo, onConfirmar, onCancelar }) => {
    const [texto, setTexto] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        setTexto('');
        setErro('');
    }, [motivo]);

    if (!motivo) return null;

    const confirmar = async () => {
        const limpo = texto.trim();
        if (!limpo) {
            setErro('Informe o motivo para registrar a saída.');
            return;
        }
        setSalvando(true);
        setErro('');
        try {
            await onConfirmar(limpo);
        } catch (e) {
            setErro(e.message || 'Não foi possível registrar a saída.');
        } finally {
            setSalvando(false);
        }
    };

    const pendencia = motivo.pendencia;

    return (
        <Dialog open onClose={salvando ? undefined : onCancelar} maxWidth="xs" fullWidth aria-labelledby="motivo-pulseira-titulo">
            <DialogTitle id="motivo-pulseira-titulo" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AvisoIcon sx={{ color: cores.alerta }} /> Pulseira fora do horário
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                    {pendencia?.numero ? (
                        <>A pulseira <b>{pendencia.numero}</b> foi entregue em <b>{dataHora(pendencia.dataCheckin)}</b>, num dia de operação anterior, e não foi devolvida. </>
                    ) : null}
                    Informe o motivo para registrar a saída. Ao registrar, a pulseira é liberada.
                </Typography>
                <TextField
                    label="Motivo da pulseira entregue fora do horário"
                    fullWidth
                    multiline
                    minRows={2}
                    required
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    autoFocus
                    disabled={salvando}
                    helperText="Obrigatório. Ex.: devolvida à portaria no dia seguinte, perdida, esquecida no local."
                />
                {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onCancelar} disabled={salvando} color="inherit">Cancelar</Button>
                <Button variant="contained" onClick={confirmar} disabled={salvando || !texto.trim()}>
                    {salvando ? 'Registrando…' : 'Registrar saída'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default MotivoPulseiraDialog;
