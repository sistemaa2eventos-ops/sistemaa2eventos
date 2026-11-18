import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogContent, IconButton, Stack, Typography } from '@mui/material';
import { Close as CloseIcon, CheckCircle as SuccessIcon } from '@mui/icons-material';

import GlassCard from '../common/GlassCard';
import PessoaFoto from '../common/PessoaFoto';
import UniversalPulseiraInput from '../common/UniversalPulseiraInput';
import { tom } from '../../styles/tokens';

const digitos = (texto) => String(texto || '').replace(/\D/g, '');

/**
 * Diz o que foi lido e se pertence a esta pessoa: pulseira, QR do crachá ou CPF.
 * Qualquer outra coisa (outra pulseira, nome, outro CPF) devolve null: a saída não vai ao servidor.
 */
export const identificarLeitura = (pessoa, codigo) => {
    const texto = String(codigo || '').trim();
    if (!pessoa || !texto) return null;
    if (pessoa.numero_pulseira && texto === String(pessoa.numero_pulseira).trim()) return 'pulseira';
    if (pessoa.qr_code && texto === pessoa.qr_code) return 'qr';
    if (pessoa.cpf && digitos(texto).length === 11 && digitos(texto) === digitos(pessoa.cpf)) return 'cpf';
    return null;
};

/**
 * Janela de conferência da SAÍDA (Check-out). Abre com a pessoa já localizada por código ou pela lista;
 * a saída é registrada aqui, pela leitura da pulseira desta pessoa.
 * onRegistrar({ pessoa, via, codigo }) devolve { success, error?, turnoAnterior? }.
 */
export const ConferenciaSaidaDialog = ({
    open,
    pessoa,
    onClose,
    onRegistrar,
    ocupado = false,
    accentColor = '#FF3366'
}) => {
    const [valor, setValor] = useState('');
    const [pendentes, setPendentes] = useState(0);
    const [sucesso, setSucesso] = useState(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    // Só fecha com a fila vazia: uma leitura fechada no meio some junto com a janela
    const podeFechar = pendentes === 0 && !ocupado;

    // Cada abertura (ou outra pessoa) começa limpa
    useEffect(() => {
        setValor('');
        setSucesso(false);
    }, [open, pessoa?.id]);

    // Saída registrada: a janela fecha sozinha daqui a pouco, se não houver outra leitura na fila
    useEffect(() => {
        if (!open || !sucesso || !podeFechar) return undefined;
        const t = setTimeout(() => onCloseRef.current?.(), 2500);
        return () => clearTimeout(t);
    }, [open, sucesso, podeFechar]);

    const confirmarLeitura = async (codigo) => {
        setSucesso(false);
        const via = identificarLeitura(pessoa, codigo);
        if (!via) {
            const primeiro = (pessoa?.nome || pessoa?.nome_completo || '').split(' ')[0];
            return { success: false, error: `Não confere com a pulseira, o CPF ou o QR de ${primeiro || 'esta pessoa'}.` };
        }
        const resultado = await onRegistrar({ pessoa, via, codigo: String(codigo).trim() });
        if (resultado?.turnoAnterior) {
            // A janela de horário do dia anterior abre por cima; esta fica para o operador ver o motivo
            return { success: false, error: 'Entrou num dia anterior sem saída: confirme o horário na janela que abriu.' };
        }
        if (resultado?.success) setSucesso(true);
        return resultado;
    };

    const nome = pessoa?.nome || pessoa?.nome_completo || 'Participante';
    const linhaDados = [pessoa?.cpf, pessoa?.empresa_nome || pessoa?.empresas?.nome].filter(Boolean).join(' – ') || 'Sem CPF';

    return (
        <Dialog
            open={open}
            onClose={podeFechar ? () => onCloseRef.current?.() : undefined}
            maxWidth="sm"
            fullWidth
            PaperProps={{ sx: { bgcolor: 'transparent', boxShadow: 'none', backgroundImage: 'none', overflow: 'visible' } }}
        >
            <DialogContent sx={{ p: { xs: 1, sm: 2 } }}>
                <GlassCard sx={{ p: { xs: 1.75, sm: 2.5 }, borderRadius: 1.5, border: `1px solid ${tom(accentColor, 0.35)}` }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                        <Typography variant="overline" sx={{ color: accentColor, fontWeight: 700, letterSpacing: 1.5 }}>
                            Conferência de saída
                        </Typography>
                        <IconButton
                            onClick={() => onCloseRef.current?.()}
                            disabled={!podeFechar}
                            aria-label="Fechar conferência"
                            sx={{ color: 'rgba(255, 255, 255, 0.6)', '&:hover': { color: '#FF3366' } }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Stack>

                    {pessoa && (
                        <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
                            <PessoaFoto
                                src={pessoa.foto_url}
                                pessoaId={pessoa.id}
                                nome={nome}
                                width={72}
                                borderRadius="10px"
                                accentColor={accentColor}
                            />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography fontWeight={700} noWrap sx={{ fontSize: '1.1rem', lineHeight: 1.25 }}>{nome}</Typography>
                                <Typography variant="body2" noWrap sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>{linhaDados}</Typography>
                                <Typography variant="body2" sx={{ color: pessoa.numero_pulseira ? accentColor : '#FFB800', fontWeight: 700 }}>
                                    {pessoa.numero_pulseira ? `Pulseira ${pessoa.numero_pulseira}` : 'Sem pulseira cadastrada'}
                                </Typography>
                            </Box>
                        </Stack>
                    )}

                    <UniversalPulseiraInput
                        value={valor}
                        onChange={setValor}
                        onClear={() => setValor('')}
                        onConfirm={confirmarLeitura}
                        onFilaChange={setPendentes}
                        loading={ocupado}
                        autoFocus={open}
                        accentColor={accentColor}
                        label="Bipe a pulseira desta pessoa"
                        placeholder="Bipe a pulseira ou digite o número..."
                        helperText="Bipe: saída automática • Digitação: Enter ou OK • CPF ou QR desta pessoa também valem"
                    />

                    {sucesso && (
                        <Stack direction="row" alignItems="center" spacing={1} mt={2} aria-live="polite" sx={{ color: '#00FF88' }}>
                            <SuccessIcon />
                            <Typography fontWeight={700}>Saída registrada</Typography>
                        </Stack>
                    )}

                    <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => onCloseRef.current?.()}
                        disabled={!podeFechar}
                        sx={{ mt: 2.5, height: 44, textTransform: 'none', fontWeight: 700, borderColor: 'rgba(255,255,255,0.2)', color: '#FFFFFF' }}
                    >
                        Fechar
                    </Button>
                </GlassCard>
            </DialogContent>
        </Dialog>
    );
};

export default ConferenciaSaidaDialog;
