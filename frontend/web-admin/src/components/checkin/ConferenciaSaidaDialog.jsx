import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogContent, IconButton, Stack, Typography } from '@mui/material';
import { Close as CloseIcon, CheckCircle as SuccessIcon } from '@mui/icons-material';

import GlassCard from '../common/GlassCard';
import PessoaFoto from '../common/PessoaFoto';
import UniversalPulseiraInput from '../common/UniversalPulseiraInput';
import { tom, cores } from '../../styles/tokens';

/**
 * Diz se a leitura é a pulseira desta pessoa. Só ela registra a saída (CPF, QR do crachá ou nome não valem).
 * Qualquer outra coisa (outra pulseira, outra pessoa, texto) devolve null: a saída não vai ao servidor.
 */
export const identificarLeitura = (pessoa, codigo) => {
    const texto = String(codigo || '').trim();
    if (!pessoa || !texto) return null;
    if (pessoa.numero_pulseira && texto === String(pessoa.numero_pulseira).trim()) return 'pulseira';
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
    // Número já digitado na tela de check-out: a janela abre com ele e um Enter registra a saída
    codigoInicial = '',
    ocupado = false,
    accentColor = cores.erro
}) => {
    const [valor, setValor] = useState('');
    const [pendentes, setPendentes] = useState(0);
    const [sucesso, setSucesso] = useState(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    // Só fecha com a fila vazia: uma leitura fechada no meio some junto com a janela
    const podeFechar = pendentes === 0 && !ocupado;

    // Cada abertura (ou outra pessoa) começa limpa, ou com o número já digitado
    useEffect(() => {
        setValor(open ? String(codigoInicial || '') : '');
        setSucesso(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const dono = primeiro ? `de ${primeiro}` : 'desta pessoa';
            // Sem pulseira cadastrada não há outra pessoa a apontar. Nos dois casos nada vai ao servidor.
            const motivo = pessoa?.numero_pulseira
                ? `Esta pulseira é de outra pessoa, não ${dono}. Nada foi registrado.`
                : `${primeiro || 'Esta pessoa'} não tem pulseira cadastrada. Nada foi registrado.`;
            return { success: false, error: motivo };
        }
        const resultado = await onRegistrar({ pessoa, via, codigo: String(codigo).trim() });
        if (resultado?.turnoAnterior) {
            // A janela de horário do dia anterior abre por cima; esta fica para o operador ver o motivo
            return { success: false, error: 'Entrou num dia anterior sem saída: confirme o horário na janela que abriu.' };
        }
        if (resultado?.motivoPulseira) {
            // O campo de motivo abre por cima; a conferência só mostra que a saída depende dele
            return { success: false, error: 'Pulseira fora do horário: informe o motivo na janela que abriu.' };
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
                            sx={{ color: 'rgba(255, 255, 255, 0.6)', '&:hover': { color: cores.erro } }}
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
                                <Typography variant="body2" sx={{ color: pessoa.numero_pulseira ? accentColor : cores.alerta, fontWeight: 700 }}>
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
                        helperText={valor ? 'Confira e aperte Enter para registrar a saída' : 'Bipe a pulseira: saída automática • Número digitado: Enter ou OK'}
                    />

                    {sucesso && (
                        <Stack direction="row" alignItems="center" spacing={1} mt={2} aria-live="polite" sx={{ color: cores.sucesso }}>
                            <SuccessIcon />
                            <Typography fontWeight={700}>Saída registrada</Typography>
                        </Stack>
                    )}

                    <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => onCloseRef.current?.()}
                        disabled={!podeFechar}
                        sx={{ mt: 2.5, height: 44, textTransform: 'none', fontWeight: 700, borderColor: 'rgba(255,255,255,0.2)', color: cores.textoForte }}
                    >
                        Fechar
                    </Button>
                </GlassCard>
            </DialogContent>
        </Dialog>
    );
};

export default ConferenciaSaidaDialog;
