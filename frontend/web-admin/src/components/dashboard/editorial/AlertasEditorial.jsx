import React, { useState } from 'react';
import { Box, Typography, Button, Collapse } from '@mui/material';
import {
    ErrorOutline as ErroIcon, WarningAmber as AtencaoIcon, InfoOutlined as InfoIcon,
    CheckCircleOutline as OkIcon, ChevronRight as AbrirIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import Secao from './Secao';
import { cores, tamanhos } from '../../../styles/tokens';

// Nível → [cor, ícone, rótulo]. Aviso sem gravidade fica neutro: o ciano é só seleção e foco.
const NIVEIS = {
    error: [cores.erro, ErroIcon, 'Crítico'],
    warning: [cores.alerta, AtencaoIcon, 'Atenção'],
    info: [cores.textoSecundario, InfoIcon, 'Aviso']
};

const Alerta = ({ a }) => {
    const navigate = useNavigate();
    // críticos e listas curtas já abertos: o detalhe é o que diz o que fazer
    const [aberto, setAberto] = useState(a.nivel === 'error' || (a.itens?.length || 0) <= 3);
    const [cor, Icone, rotulo] = NIVEIS[a.nivel] || NIVEIS.info;
    const temDetalhe = (a.itens?.length || 0) > 0;

    return (
        <Box
            component="li"
            sx={{
                display: 'grid',
                gridTemplateColumns: '4px minmax(0, 1fr)',
                columnGap: 2,
                py: 1.5,
                borderBottom: `1px solid ${cores.borda}`,
                '&:last-of-type': { borderBottom: 'none' }
            }}
        >
            {/* Faixa de gravidade */}
            <Box aria-hidden sx={{ bgcolor: cor, borderRadius: '999px', minHeight: 36 }} />

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' }, minWidth: 0 }}>
                <Icone sx={{ color: cor, fontSize: 20, mt: '2px', flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: { xs: 'calc(100% - 36px)', sm: 0 } }}>
                    <Typography sx={{ fontSize: tamanhos.md, fontWeight: 600, color: cores.textoForte }}>
                        <Box component="span" sx={{ color: cor, mr: 1, fontSize: tamanhos.xs, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {rotulo}
                        </Box>
                        {a.titulo}
                    </Typography>
                    {a.texto && (
                        <Typography sx={{ color: cores.textoSecundario, fontSize: tamanhos.sm, mt: 0.25 }}>{a.texto}</Typography>
                    )}
                    {temDetalhe && (
                        <Collapse in={aberto}>
                            <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.5, color: cores.textoSuave }}>
                                {a.itens.map(i => (
                                    <Typography component="li" key={i} sx={{ fontSize: tamanhos.sm, display: 'list-item' }}>{i}</Typography>
                                ))}
                            </Box>
                        </Collapse>
                    )}
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, ml: { xs: 'auto', sm: 0 } }}>
                    {temDetalhe && (
                        <Button
                            size="small"
                            onClick={() => setAberto(v => !v)}
                            aria-expanded={aberto}
                            sx={{ minHeight: 44, color: cores.textoSecundario, fontWeight: 600 }}
                        >
                            {aberto ? 'Ocultar' : `Ver ${a.itens.length}`}
                        </Button>
                    )}
                    {a.link && (
                        <Button
                            size="small"
                            endIcon={<AbrirIcon />}
                            onClick={() => navigate(a.link)}
                            sx={{ minHeight: 44, color: cores.textoForte, fontWeight: 600 }}
                        >
                            Abrir
                        </Button>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

/** O que pede ação agora: críticos primeiro. Sem alertas, uma linha confirma que está tudo em ordem. */
const AlertasEditorial = ({ operacao }) => {
    const alertas = operacao?.alertas || [];
    return (
        <Secao
            id="secao-atencao" cartao
            rotulo="Agora"
            titulo="O que precisa de atenção"
            acao={operacao?.atualizado_em && (
                <Typography sx={{ color: cores.textoFraco, fontSize: tamanhos.xs }}>
                    Atualizado às {new Date(operacao.atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Typography>
            )}
        >
            {alertas.length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <OkIcon sx={{ color: cores.sucesso, fontSize: 20 }} />
                    <Typography sx={{ color: cores.textoSecundario, fontSize: tamanhos.md }}>
                        Nenhum alerta agora: leitores online, cotas e lotação dentro do limite.
                    </Typography>
                </Box>
            ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {alertas.map(a => <Alerta key={a.id} a={a} />)}
                </Box>
            )}
        </Secao>
    );
};

export default AlertasEditorial;
