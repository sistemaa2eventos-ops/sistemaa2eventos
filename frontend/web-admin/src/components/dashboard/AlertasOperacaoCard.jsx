import React, { useState } from 'react';
import { Box, Typography, Stack, Button, Collapse } from '@mui/material';
import {
    ErrorOutline as ErroIcon, WarningAmber as AtencaoIcon, InfoOutlined as InfoIcon,
    CheckCircleOutline as OkIcon, ChevronRight as AbrirIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../common/GlassCard';
import { cores } from '../../styles/tokens';

// Nível → [cor, ícone, rótulo]: cor nunca sozinha, sempre com ícone e texto
const NIVEIS = {
    error: [cores.erro, ErroIcon, 'Crítico'],
    warning: [cores.alerta, AtencaoIcon, 'Atenção'],
    info: [cores.primaria, InfoIcon, 'Aviso']
};

const Alerta = ({ a }) => {
    const navigate = useNavigate();
    // críticos e listas curtas já abertos: o detalhe é o que diz o que fazer
    const [aberto, setAberto] = useState(a.nivel === 'error' || (a.itens?.length || 0) <= 3);
    const [cor, Icone, rotulo] = NIVEIS[a.nivel] || NIVEIS.info;
    const temDetalhe = (a.itens?.length || 0) > 0;
    return (
        <Box sx={{ borderRadius: 1.5, border: `1px solid ${cor}40`, bgcolor: `${cor}0D`, p: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <Icone sx={{ color: cor, fontSize: 20, mt: '2px' }} />
                <Box sx={{ flex: 1, minWidth: { xs: 'calc(100% - 32px)', sm: 0 } }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }}>
                        <Box component="span" sx={{ color: cor, mr: 0.75, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>{rotulo}</Box>
                        {a.titulo}
                    </Typography>
                    {a.texto && <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block' }}>{a.texto}</Typography>}
                    {temDetalhe && (
                        <Collapse in={aberto}>
                            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.25, color: cores.textoSuave }}>
                                {a.itens.map(i => <Typography component="li" variant="caption" key={i} sx={{ display: 'list-item' }}>{i}</Typography>)}
                            </Box>
                        </Collapse>
                    )}
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, ml: { xs: 'auto', sm: 0 } }}>
                    {temDetalhe && (
                        <Button size="small" onClick={() => setAberto(v => !v)} sx={{ color: cores.textoSecundario, minWidth: 0, fontWeight: 700 }}>
                            {aberto ? 'Ocultar' : `Ver ${a.itens.length}`}
                        </Button>
                    )}
                    {a.link && (
                        <Button size="small" endIcon={<AbrirIcon />} onClick={() => navigate(a.link)} sx={{ color: cor, minWidth: 0, fontWeight: 700 }}>
                            Abrir
                        </Button>
                    )}
                </Stack>
            </Box>
        </Box>
    );
};

/**
 * O que pede ação agora: críticos primeiro. Sem alertas, uma linha confirma que está tudo em ordem.
 */
const AlertasOperacaoCard = ({ operacao }) => {
    const alertas = operacao?.alertas || [];
    return (
        <GlassCard sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte, fontFamily: '"Space Grotesk", sans-serif' }}>
                    O que precisa de atenção
                </Typography>
                {operacao?.atualizado_em && (
                    <Typography variant="caption" sx={{ color: cores.textoFraco }}>
                        Atualizado às {new Date(operacao.atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                )}
            </Box>
            {alertas.length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: cores.sucesso }}>
                    <OkIcon fontSize="small" />
                    <Typography variant="body2" sx={{ color: cores.textoSecundario }}>Nenhum alerta agora: leitores online, cotas e lotação dentro do limite.</Typography>
                </Box>
            ) : (
                <Stack spacing={1}>
                    {alertas.map(a => <Alerta key={a.id} a={a} />)}
                </Stack>
            )}
        </GlassCard>
    );
};

export default AlertasOperacaoCard;
