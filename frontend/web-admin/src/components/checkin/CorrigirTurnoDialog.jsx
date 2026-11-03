import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, Alert, Box } from '@mui/material';
import { History as TurnoIcon } from '@mui/icons-material';
import { cores } from '../../styles/tokens';

// ISO → valor do <input type="datetime-local"> no horário de Brasília
const paraCampo = (iso) => {
    if (!iso) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
};
// valor do campo (horário de Brasília, UTC-3) → ISO
const doCampo = (v) => (v ? new Date(`${v}:00-03:00`).toISOString() : null);
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Check-out de quem entrou num dia anterior e não registrou a saída: o operador confirma e
 * informa o horário real (sugerido pelo horário em que a pessoa saiu no dia anterior).
 */
const CorrigirTurnoDialog = ({ turno, onConfirmar, onCancelar }) => {
    const [saida, setSaida] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        setSaida(paraCampo(turno?.saida_sugerida));
        setErro('');
    }, [turno]);

    if (!turno) return null;

    const confirmar = async () => {
        setSalvando(true);
        setErro('');
        try {
            await onConfirmar(doCampo(saida));
        } catch (e) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Dialog open onClose={salvando ? undefined : onCancelar} maxWidth="xs" fullWidth aria-labelledby="turno-titulo">
            <DialogTitle id="turno-titulo" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TurnoIcon sx={{ color: cores.alerta }} /> Saída de um dia anterior
            </DialogTitle>
            <DialogContent>
                <Typography variant="body1" sx={{ fontWeight: 700, color: cores.textoForte }}>{turno.pessoa?.nome || 'Colaborador'}</Typography>
                <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                    Entrou em <b>{dataHora(turno.entrada_em)}</b> e não registrou a saída
                    {turno.saida_forcada_em ? <> (o sistema encerrou o turno às {dataHora(turno.saida_forcada_em)})</> : null}.
                </Typography>
                <TextField
                    label="Horário de saída daquele turno"
                    type="datetime-local"
                    fullWidth
                    value={saida}
                    onChange={(e) => setSaida(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: paraCampo(turno.entrada_em), max: paraCampo(new Date().toISOString()) }}
                    helperText="Sugerido pelo horário em que a pessoa saiu no dia anterior. Ajuste se souber o horário real."
                    autoFocus
                />
                <Box sx={{ mt: 2 }}>
                    <Alert severity="info" variant="outlined">
                        A saída fica registrada no turno do dia {new Date(turno.entrada_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}; nada é lançado para hoje.
                    </Alert>
                </Box>
                {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onCancelar} disabled={salvando} color="inherit">Cancelar</Button>
                <Button variant="contained" onClick={confirmar} disabled={salvando || !saida}>
                    {salvando ? 'Salvando…' : 'Corrigir saída'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default CorrigirTurnoDialog;
