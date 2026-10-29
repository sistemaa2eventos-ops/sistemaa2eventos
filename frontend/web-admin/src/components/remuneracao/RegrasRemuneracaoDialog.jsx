import React, { useState } from 'react';
import {
    Box, Typography, Dialog, DialogContent, DialogActions, Button, TextField, Grid,
    Switch, FormControlLabel, MenuItem, Stack, IconButton, Chip, InputAdornment, Alert
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import TituloModal from '../common/TituloModal';
import NeonButton from '../common/NeonButton';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';
import { acaoTabela, acaoTabelaPerigo, botaoSecundario, cores } from '../../styles/tokens';
import { simularDia, formatarMoeda, formatarHoras } from '../../hooks/useRemuneracao';

const REGRA_NOVA = {
    nome: '',
    jornada_horas: 8,
    valor_diaria: '',
    horas_minimas_diaria: 0,
    meia_diaria: false,
    horas_minimas_meia: 4,
    excedente_modo: 'nenhum',
    percentual_hora_extra: 50,
    valor_hora_extra: '',
    horas_para_dobra: '',
    tolerancia_minutos: 15,
    observacao: '',
    ativo: true
};

const MODOS = [
    { valor: 'nenhum', rotulo: 'Não paga (só a diária)' },
    { valor: 'horas_extras', rotulo: 'Paga horas extras' },
    { valor: 'dobra', rotulo: 'Conta dobra (2 diárias)' }
];

/** Exemplos de jornada para conferir a regra antes de salvar */
const Exemplos = ({ regra }) => {
    const jornada = Number(regra.jornada_horas) || 8;
    const amostras = [...new Set([3, Math.max(1, jornada / 2), jornada, jornada + 2, Math.max(jornada + 4, Number(regra.horas_para_dobra) + 1 || 0)])]
        .filter(h => h > 0 && h <= 24).sort((a, b) => a - b);
    return (
        <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(0,212,255,0.05)', border: `1px solid ${cores.borda}` }}>
            <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 700, display: 'block', mb: 1 }}>
                Exemplo com esta regra (horas do check-in ao check-out)
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {amostras.map(h => {
                    const r = simularDia(h * 60, regra);
                    if (!r) return null;
                    const diaria = r.diarias === 2 ? 'dobra' : r.diarias === 1 ? '1 diária' : r.diarias === 0.5 ? '½ diária' : 'sem diária';
                    return (
                        <Chip
                            key={h}
                            size="small"
                            label={`${formatarHoras(h * 60)} → ${diaria}${r.extras ? ` + ${formatarHoras(r.extras)} extra` : ''} = ${formatarMoeda(r.total)}`}
                            sx={{ bgcolor: 'rgba(255,255,255,0.04)', color: cores.textoSuave, fontWeight: 600 }}
                        />
                    );
                })}
            </Stack>
        </Box>
    );
};

const FormularioRegra = ({ regra, setRegra }) => {
    const campo = (nome) => ({
        value: regra[nome] ?? '',
        onChange: (e) => setRegra({ ...regra, [nome]: e.target.value }),
        fullWidth: true,
        size: 'small'
    });
    const sufixo = (t) => ({ endAdornment: <InputAdornment position="end">{t}</InputAdornment> });
    const prefixo = (t) => ({ startAdornment: <InputAdornment position="start">{t}</InputAdornment> });

    return (
        <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField label="Nome da regra" placeholder='Ex.: "Padrão 8h", "Segurança 12x36"' {...campo('nome')} autoFocus />

            <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                    <TextField label="Jornada" type="number" inputProps={{ min: 1, max: 24, step: 0.5 }} InputProps={sufixo('horas')} {...campo('jornada_horas')} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField label="Valor da diária" InputProps={prefixo('R$')} {...campo('valor_diaria')} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField
                        label="Diária inteira a partir de"
                        type="number"
                        inputProps={{ min: 0, max: 24, step: 0.5 }}
                        InputProps={sufixo('horas')}
                        helperText="0 = qualquer presença"
                        {...campo('horas_minimas_diaria')}
                    />
                </Grid>
            </Grid>

            <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6}>
                    <FormControlLabel
                        control={<Switch checked={!!regra.meia_diaria} onChange={(e) => setRegra({ ...regra, meia_diaria: e.target.checked })} />}
                        label="Paga meia diária"
                    />
                </Grid>
                {regra.meia_diaria && (
                    <Grid item xs={12} sm={6}>
                        <TextField label="Meia diária a partir de" type="number" inputProps={{ min: 0, max: 24, step: 0.5 }} InputProps={sufixo('horas')} {...campo('horas_minimas_meia')} />
                    </Grid>
                )}
            </Grid>

            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <TextField select label="Horas acima da jornada" {...campo('excedente_modo')}>
                        {MODOS.map(m => <MenuItem key={m.valor} value={m.valor}>{m.rotulo}</MenuItem>)}
                    </TextField>
                </Grid>
                {regra.excedente_modo !== 'nenhum' && (
                    <Grid item xs={12} sm={6}>
                        <TextField
                            label="Tolerância"
                            type="number"
                            inputProps={{ min: 0, step: 5 }}
                            InputProps={sufixo('min')}
                            helperText="Até aqui acima do limite não conta"
                            {...campo('tolerancia_minutos')}
                        />
                    </Grid>
                )}
                {regra.excedente_modo === 'horas_extras' && (
                    <>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Adicional da hora extra" type="number" inputProps={{ min: 0, step: 5 }} InputProps={sufixo('%')}
                                helperText="Sobre a hora normal (diária ÷ jornada)" {...campo('percentual_hora_extra')} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField label="Ou valor fixo da hora extra" InputProps={prefixo('R$')}
                                helperText="Preenchido, substitui o percentual" {...campo('valor_hora_extra')} />
                        </Grid>
                    </>
                )}
                {regra.excedente_modo === 'dobra' && (
                    <Grid item xs={12} sm={6}>
                        <TextField label="Dobra acima de" type="number" inputProps={{ min: 1, max: 24, step: 0.5 }} InputProps={sufixo('horas')}
                            helperText={`Vazio = jornada (${Number(regra.jornada_horas) || 8}h)`} {...campo('horas_para_dobra')} />
                    </Grid>
                )}
            </Grid>

            <TextField label="Observação (opcional)" multiline rows={2} {...campo('observacao')} />
            <Exemplos regra={regra} />
        </Stack>
    );
};

/**
 * Cadastro das regras de remuneração do evento. As empresas escolhem uma regra no cadastro
 * delas (e, se precisar, uma regra por função).
 */
const RegrasRemuneracaoDialog = ({ open, onClose, regras, disponivel, salvarRegra, excluirRegra }) => {
    const confirmar = useConfirmacao();
    const [editando, setEditando] = useState(null);
    const [salvando, setSalvando] = useState(false);

    const fechar = () => { setEditando(null); onClose(); };

    const salvar = async () => {
        setSalvando(true);
        const payload = {
            ...editando,
            valor_hora_extra: editando.valor_hora_extra === '' ? null : editando.valor_hora_extra,
            horas_para_dobra: editando.horas_para_dobra === '' ? null : editando.horas_para_dobra
        };
        delete payload.descricao;
        const ok = await salvarRegra(payload);
        setSalvando(false);
        if (ok) setEditando(null);
    };

    const excluir = async (r) => {
        const ok = await confirmar({
            titulo: 'Excluir regra',
            mensagem: `Excluir a regra "${r.nome}"? Só é possível se nenhuma empresa estiver usando.`,
            textoConfirmar: 'Excluir'
        });
        if (ok) excluirRegra(r.id);
    };

    return (
        <Dialog open={open} onClose={fechar} maxWidth="md" fullWidth disableRestoreFocus>
            <TituloModal
                titulo={editando ? (editando.id ? 'Editar regra de remuneração' : 'Nova regra de remuneração') : 'Regras de remuneração'}
                subtitulo={editando ? null : 'Diária, meia diária, horas extras e dobra. Cada empresa escolhe a sua no cadastro.'}
                onFechar={fechar}
                desabilitarFechar={salvando}
            />
            <DialogContent sx={{ p: { xs: 2, md: 3 } }}>
                {!disponivel && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        As regras ainda não estão disponíveis no banco. Rode a migration <strong>20261029_regras_remuneracao.sql</strong> no Supabase.
                    </Alert>
                )}

                {editando ? (
                    <FormularioRegra regra={editando} setRegra={setEditando} />
                ) : (
                    <Stack spacing={1.5}>
                        {regras.length === 0 && disponivel && (
                            <Typography variant="body2" sx={{ color: cores.textoSecundario, py: 3, textAlign: 'center' }}>
                                Nenhuma regra cadastrada. Crie a primeira e depois escolha-a no cadastro das empresas.
                            </Typography>
                        )}
                        {regras.map(r => (
                            <Box key={r.id} sx={{
                                display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: 1.5,
                                border: `1px solid ${cores.borda}`, bgcolor: 'rgba(255,255,255,0.02)', opacity: r.ativo ? 1 : 0.55
                            }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }}>
                                        {r.nome}{!r.ativo && ' (inativa)'}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{r.descricao}</Typography>
                                </Box>
                                <IconButton size="small" sx={acaoTabela} title="Editar" onClick={() => setEditando({ ...REGRA_NOVA, ...r, valor_hora_extra: r.valor_hora_extra ?? '', horas_para_dobra: r.horas_para_dobra ?? '' })}>
                                    <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={acaoTabelaPerigo} title="Excluir" onClick={() => excluir(r)}>
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        ))}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                {editando ? (
                    <>
                        {editando.id && (
                            <FormControlLabel
                                sx={{ mr: 'auto', ml: 1 }}
                                control={<Switch checked={editando.ativo !== false} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} />}
                                label="Ativa"
                            />
                        )}
                        <Button variant="outlined" sx={botaoSecundario} onClick={() => setEditando(null)} disabled={salvando}>Voltar</Button>
                        <NeonButton onClick={salvar} disabled={salvando || !String(editando.nome || '').trim()}>
                            {salvando ? 'Salvando...' : 'Salvar regra'}
                        </NeonButton>
                    </>
                ) : (
                    <>
                        <Button variant="outlined" sx={botaoSecundario} onClick={fechar}>Fechar</Button>
                        <NeonButton startIcon={<AddIcon />} onClick={() => setEditando({ ...REGRA_NOVA })} disabled={!disponivel}>
                            Nova regra
                        </NeonButton>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default RegrasRemuneracaoDialog;
