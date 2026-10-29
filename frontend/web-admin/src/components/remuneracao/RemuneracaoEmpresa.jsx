import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Stack, IconButton, Button, Autocomplete, Grid } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Tune as RegrasIcon } from '@mui/icons-material';
import { acaoTabelaPerigo, cores } from '../../styles/tokens';

// Mesma normalização do backend (documentoRequisitos.service.js → normalizarFuncao)
const normalizarFuncao = (f) => String(f || '').trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * Remuneração no cadastro da empresa: regra padrão e exceções por função
 * (ex.: na empresa X, "SEGURANÇA" usa a regra 12x36).
 */
const RemuneracaoEmpresa = ({ formData, setFormData, regras, disponivel, empresaId, carregarFuncoes, onGerenciar }) => {
    const [funcoes, setFuncoes] = useState([]);
    const [novaFuncao, setNovaFuncao] = useState('');

    useEffect(() => {
        let ativo = true;
        if (disponivel) carregarFuncoes(empresaId).then(f => { if (ativo) setFuncoes(f); });
        return () => { ativo = false; };
    }, [disponivel, empresaId, carregarFuncoes]);

    if (!disponivel) return null;

    const porFuncao = formData.regras_por_funcao || {};
    const ativas = regras.filter(r => r.ativo || r.id === formData.regra_remuneracao_id || Object.values(porFuncao).includes(r.id));
    const definir = (mudanca) => setFormData({ ...formData, ...mudanca });
    const definirFuncao = (funcao, regraId) => definir({ regras_por_funcao: { ...porFuncao, [funcao]: regraId } });
    const removerFuncao = (funcao) => {
        const resto = { ...porFuncao };
        delete resto[funcao];
        definir({ regras_por_funcao: resto });
    };
    const adicionarFuncao = () => {
        const f = normalizarFuncao(novaFuncao);
        if (!f || porFuncao[f] !== undefined) return;
        definirFuncao(f, formData.regra_remuneracao_id || regras[0]?.id || '');
        setNovaFuncao('');
    };
    const sugestoes = funcoes.filter(f => porFuncao[f] === undefined);

    const seletorRegra = (valor, onChange, rotulo, opcional) => (
        <TextField select fullWidth size="small" label={rotulo} value={valor || ''} onChange={(e) => onChange(e.target.value)}>
            {opcional && <MenuItem value=""><em>Sem regra (horas sem valor)</em></MenuItem>}
            {ativas.map(r => <MenuItem key={r.id} value={r.id}>{r.nome}{!r.ativo ? ' (inativa)' : ''}</MenuItem>)}
        </TextField>
    );

    const regraPadrao = regras.find(r => r.id === formData.regra_remuneracao_id);

    return (
        <Box sx={{ p: 2, borderRadius: 1.5, border: `1px solid ${cores.borda}`, bgcolor: 'rgba(255,255,255,0.02)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                <Box>
                    <Typography variant="subtitle2" sx={{ color: cores.primaria, fontWeight: 700 }}>Remuneração (diárias e horas extras)</Typography>
                    <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block' }}>
                        Usada no fechamento do período. Pode ser alterada depois.
                    </Typography>
                </Box>
                <Button size="small" startIcon={<RegrasIcon />} onClick={onGerenciar} sx={{ color: cores.primaria, fontWeight: 700 }}>
                    Gerenciar regras
                </Button>
            </Box>

            {regras.length === 0 ? (
                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                    Nenhuma regra cadastrada no evento. Clique em <strong>Gerenciar regras</strong> para criar.
                </Typography>
            ) : (
                <Stack spacing={2}>
                    <Box>
                        {seletorRegra(formData.regra_remuneracao_id, (v) => definir({ regra_remuneracao_id: v || null }), 'Regra padrão da empresa', true)}
                        {regraPadrao && (
                            <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block', mt: 0.5 }}>{regraPadrao.descricao}</Typography>
                        )}
                    </Box>

                    <Box>
                        <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 700, display: 'block', mb: 1 }}>
                            Regras diferentes por função (opcional)
                        </Typography>
                        <Stack spacing={1}>
                            {Object.entries(porFuncao).map(([funcao, regraId]) => (
                                <Grid container spacing={1} alignItems="center" key={funcao}>
                                    <Grid item xs={5}>
                                        <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }} noWrap title={funcao}>{funcao}</Typography>
                                    </Grid>
                                    <Grid item xs={6}>{seletorRegra(regraId, (v) => definirFuncao(funcao, v), 'Regra')}</Grid>
                                    <Grid item xs={1}>
                                        <IconButton size="small" sx={acaoTabelaPerigo} title="Remover exceção" onClick={() => removerFuncao(funcao)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Grid>
                                </Grid>
                            ))}
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                <Autocomplete
                                    freeSolo
                                    size="small"
                                    options={sugestoes}
                                    inputValue={novaFuncao}
                                    onInputChange={(_, v) => setNovaFuncao(v)}
                                    sx={{ flex: 1 }}
                                    renderInput={(params) => <TextField {...params} label="Função" placeholder="Ex.: SEGURANÇA" />}
                                />
                                <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={adicionarFuncao} disabled={!normalizarFuncao(novaFuncao)}
                                    sx={{ height: 40, fontWeight: 700 }}>
                                    Adicionar
                                </Button>
                            </Box>
                        </Stack>
                    </Box>
                </Stack>
            )}
        </Box>
    );
};

export default RemuneracaoEmpresa;
