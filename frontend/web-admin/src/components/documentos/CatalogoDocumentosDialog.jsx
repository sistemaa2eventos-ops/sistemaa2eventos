import React, { useMemo, useState } from 'react';
import { Box, Checkbox, Dialog, DialogActions, DialogContent, FormControlLabel, Stack, Typography } from '@mui/material';
import TituloModal from '../common/TituloModal';
import NeonButton from '../common/NeonButton';
import { CATALOGO_DOCUMENTOS } from './catalogoDocumentos';
import { botaoSecundario, cores } from '../../styles/tokens';

const normalizar = (s) => String(s || '').trim().toLowerCase();

/**
 * Adiciona documentos do catálogo (NRs e certificados comuns) aos tipos do evento.
 * Quem já existe no evento não é duplicado. Só entra na tela; o botão Salvar grava.
 */
const CatalogoDocumentosDialog = ({ open, onClose, nomesExistentes = [], onAdicionar }) => {
    const [selecionados, setSelecionados] = useState([]);
    const existentes = useMemo(() => new Set(nomesExistentes.map(normalizar)), [nomesExistentes]);

    const alternar = (nome) => setSelecionados(prev => (prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome]));

    const confirmar = () => {
        const escolhidos = CATALOGO_DOCUMENTOS.filter(d => selecionados.includes(d.nome) && !existentes.has(normalizar(d.nome)));
        onAdicionar(escolhidos.map(({ nome, exige_validade }) => ({ nome, exige_validade })));
        setSelecionados([]);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth disableRestoreFocus
            PaperProps={{ sx: { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, backgroundImage: 'none' } }}>
            <TituloModal titulo="Catálogo de documentos" subtitulo="NRs e certificados comuns em eventos. A validade sugerida pode ser ajustada depois." onFechar={onClose} />
            <DialogContent sx={{ p: 3 }}>
                <Stack spacing={0.5}>
                    {CATALOGO_DOCUMENTOS.map(d => {
                        const jaExiste = existentes.has(normalizar(d.nome));
                        return (
                            <Box key={d.nome} sx={{ py: 0.5 }}>
                                <FormControlLabel
                                    disabled={jaExiste}
                                    control={<Checkbox size="small" checked={jaExiste || selecionados.includes(d.nome)} onChange={() => alternar(d.nome)} />}
                                    label={
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }}>
                                                {d.nome} {d.exige_validade && <span style={{ color: cores.alerta, fontWeight: 600 }}>· com validade</span>}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                                {jaExiste ? 'Já existe neste evento' : d.descricao}
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </Box>
                        );
                    })}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5, borderTop: `1px solid ${cores.borda}` }}>
                <NeonButton variant="outlined" onClick={onClose} sx={botaoSecundario}>Cancelar</NeonButton>
                <NeonButton disabled={selecionados.length === 0} onClick={confirmar}>
                    Adicionar {selecionados.length > 0 ? `(${selecionados.length})` : ''}
                </NeonButton>
            </DialogActions>
        </Dialog>
    );
};

export default CatalogoDocumentosDialog;
