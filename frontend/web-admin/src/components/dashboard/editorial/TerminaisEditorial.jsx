import React from 'react';
import { Box, Typography } from '@mui/material';
import {
    Devices as DevicesIcon,
    CameraAlt as CameraIcon,
    Sensors as SensorsIcon,
    Fingerprint as BiometricIcon
} from '@mui/icons-material';
import Secao, { PontoEstado } from './Secao';
import { cores, raios, tamanhos } from '../../../styles/tokens';

const iconePorTipo = (tipo) => {
    const t = String(tipo || '').toLowerCase();
    if (t.includes('facial') || t.includes('cam')) return CameraIcon;
    if (t.includes('catraca') || t.includes('leitor')) return SensorsIcon;
    return BiometricIcon;
};

const rotuloFluxo = (tipoFluxo) => {
    const f = String(tipoFluxo || '').toLowerCase();
    if (f === 'so entrada' || f === 'entrada') return 'Só entrada';
    if (f === 'so saida' || f === 'saida') return 'Só saída';
    return 'Entrada e saída';
};

const estadoTerminal = (status) => {
    if (status === 'online') return [cores.sucesso, 'Online'];
    if (status === 'sincronizando') return [cores.alerta, 'Sincronizando'];
    return [cores.erro, 'Offline'];
};

/** Terminais do evento: estado em ponto + texto, local e tipo de fluxo neutros. */
const TerminaisEditorial = ({ terminais = [] }) => {
    const total = terminais.length;
    const online = terminais.filter(t => t.status === 'online').length;
    const corResumo = total === 0 || online === 0 ? cores.erro : online < total ? cores.alerta : cores.sucesso;

    return (
        <Secao
            id="secao-terminais" cartao
            rotulo="Equipamentos"
            titulo="Terminais"
            subtitulo="Catracas, leitores faciais e postos de controle"
            acao={total > 0 && <PontoEstado cor={corResumo}>{online} de {total} online</PontoEstado>}
        >
            {total === 0 ? (
                <Box sx={{ py: 3, display: 'grid', justifyItems: 'start', gap: 0.5 }}>
                    <DevicesIcon sx={{ fontSize: 40, color: cores.textoSecundario, opacity: 0.5 }} />
                    <Typography sx={{ fontWeight: 600, color: cores.texto, fontSize: tamanhos.md }}>
                        Nenhum equipamento conectado ao evento
                    </Typography>
                    <Typography sx={{ color: cores.textoSecundario, fontSize: tamanhos.sm }}>
                        Cadastre os leitores em Configurações → Leitores e dispositivos.
                    </Typography>
                </Box>
            ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: 360, overflowY: 'auto', borderTop: `1px solid ${cores.borda}` }}>
                    {terminais.map(t => {
                        const Icone = iconePorTipo(t.tipo);
                        const [cor, rotulo] = estadoTerminal(t.status);
                        return (
                            <Box
                                component="li"
                                key={t.id}
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: '20px minmax(0, 1fr) auto',
                                    alignItems: 'center',
                                    columnGap: 1.5,
                                    rowGap: 0.75,
                                    py: 1.5,
                                    borderBottom: `1px solid ${cores.borda}`
                                }}
                            >
                                <Icone sx={{ fontSize: 20, color: cores.textoSecundario }} />
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography noWrap sx={{ fontSize: tamanhos.md, fontWeight: 600, color: cores.textoForte }}>{t.nome}</Typography>
                                    <Typography noWrap sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                        {t.local || 'Sem área definida'}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'grid', justifyItems: 'end', gap: 0.5 }}>
                                    <PontoEstado cor={cor}>{rotulo}</PontoEstado>
                                    <Box
                                        component="span"
                                        sx={{
                                            fontSize: tamanhos.xs,
                                            color: cores.textoSecundario,
                                            border: `1px solid ${cores.borda}`,
                                            borderRadius: raios.controle,
                                            px: 1,
                                            py: 0.25,
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {rotuloFluxo(t.tipo_fluxo)}
                                    </Box>
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Secao>
    );
};

export default TerminaisEditorial;
