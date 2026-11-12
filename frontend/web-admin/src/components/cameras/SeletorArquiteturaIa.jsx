import React, { useState } from 'react';
import {
    Box, Stack, Typography, Grid, Button, Chip, Dialog,
    DialogTitle, DialogContent, DialogActions, Divider
} from '@mui/material';
import {
    Computer as PcIcon,
    FlashOn as HybridIcon,
    CloudDone as CloudIcon,
    CheckCircle as CheckIcon,
    InfoOutlined as InfoIcon
} from '@mui/icons-material';
import GlassCard from '../common/GlassCard';

export const MODOS_ARQUITETURA = [
    {
        id: 'local',
        titulo: 'Servidor no Evento',
        subtitulo: 'Super Operação Local',
        cor: '#00FF88',
        icone: PcIcon,
        badges: ['30-60 FPS Real', '1080p Full HD', '100% Offline'],
        resumo: 'O computador com a placa de vídeo potente vai para o evento. Reconhece instantâneo com latência zero e total independência de internet.',
        cenario: 'Grandes eventos, festivais, convenções e locais com rede local estruturada.',
        vantagens: [
            '30 a 60 FPS cravados por câmera em Full HD',
            'Latência zero (< 5 ms): a pessoa passa e o nome aparece na mesma fração de segundo',
            'Zero dependência de internet: se a internet do local cair, nada é interrompido'
        ],
        requisitos: [
            'PC potente com placa de vídeo dedicada (NVIDIA GTX/RTX)',
            'Switch de rede gigabit + cabos de rede ligando as câmeras e o PC',
            'Script ligar-ia-facial.bat'
        ],
        passos: [
            'Leve o computador do servidor com a placa de vídeo forte até o evento.',
            'Conecte o computador e as câmeras IP no mesmo switch da rede local.',
            'No computador, execute o script ligar-ia-facial.bat e mantenha a janela aberta.',
            'No painel, as câmeras começam a analisar com máxima qualidade e fluidos 30 FPS.'
        ]
    },
    {
        id: 'auto',
        titulo: 'Híbrido Inteligente',
        subtitulo: 'Notebook no Evento + Servidor Central',
        cor: '#00D4FF',
        icone: HybridIcon,
        badges: ['4 KB por Rosto', 'Tolerância a Falhas', 'GPU Central'],
        resumo: 'O notebook no evento acha os rostos e o Servidor de IA Central diz quem é. Se a internet oscilar mais que 2,5 s, o notebook assume sozinho por reserva.',
        cenario: 'Eventos sociais, casamentos, formaturas ou locais com internet móvel (4G/5G/Wi-Fi).',
        vantagens: [
            'Economia extrema de internet: trafega apenas recortes de 4 KB quando passa alguém',
            'Qualidade de IA de ponta: reconhecimento pesado no modelo de 512 dimensões na sua central',
            'Segurança total: se a internet cair, o notebook continua reconhecendo sozinho automaticamente'
        ],
        requisitos: [
            'Notebook no evento (com ligar-ia-facial.bat)',
            'Servidor Central com GPU na central ou casa (com ligar-servidor-ia.bat)',
            'Internet comum no evento (Wi-Fi ou 4G/5G)'
        ],
        passos: [
            'No Servidor Central (na sua central ou casa), execute ligar-servidor-ia.bat.',
            'No Notebook do evento, execute ligar-ia-facial.bat para conectar as câmeras e o motor local.',
            'O notebook detecta as faces e o servidor central identifica quem é em tempo real.',
            'Se a internet do local faltar, o notebook assume o reconhecimento na hora de forma transparente.'
        ]
    },
    {
        id: 'direto_servidor',
        titulo: 'Central Remota / Fibra',
        subtitulo: 'Câmeras Direto para o Servidor',
        cor: '#A855F7',
        icone: CloudIcon,
        badges: ['RTSP ➔ Servidor', 'Notebook Leve', 'Processamento na Central'],
        resumo: 'As câmeras IP transmitem os vídeos diretamente pela internet fibra até o Servidor Central de IA, que processa tudo. No evento você só precisa abrir o navegador.',
        cenario: 'Eventos com link de internet fibra de alta velocidade onde você prefere deixar o servidor seguro na sede.',
        vantagens: [
            'Notebook do evento 100% frio, com bateria prolongada e interface rápida',
            'O servidor potente fica seguro na sua sede sem risco de quedas ou transportes',
            'Todas as gravações e processamento de IA são centralizados na sua central'
        ],
        requisitos: [
            'Câmeras IP com conexão de rede estável e upload de 4-6 Mbps por câmera',
            'Servidor de IA Central ativo na sede com conexão com o gateway/nuvem',
            'Notebook leve, tablet ou celular para visualização das presenças'
        ],
        passos: [
            'Garanta que a internet do evento possui conexão estável de fibra com upload suficiente.',
            'Aponte o stream RTSP das câmeras para a sua central (via VPN, túnel ou IP fixo).',
            'O Servidor Central na sede processa os fluxos de vídeo e registra os acessos.',
            'No evento, a equipe só precisa abrir o navegador em painel.nzt.app.br para acompanhar.'
        ]
    }
];

/**
 * Seletor Visual de Arquitetura de IA para o Evento.
 * Permite selecionar entre os 3 modos de forma visual com orientações completas.
 */
const SeletorArquiteturaIa = ({
    valor = 'local',
    onChange,
    disabled = false
}) => {
    const [dialogo, setDialogo] = useState(null);

    return (
        <Box sx={{ mb: 2.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Box>
                    <Typography variant="caption" sx={{ textTransform: 'uppercase', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', color: 'text.secondary' }}>
                        Arquitetura de Operação de IA
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        Como este evento operará o reconhecimento facial?
                    </Typography>
                </Box>
            </Stack>

            <Grid container spacing={1.5}>
                {MODOS_ARQUITETURA.map((modo) => {
                    const ativo = valor === modo.id;
                    const Icone = modo.icone;

                    return (
                        <Grid item xs={12} md={4} key={modo.id}>
                            <GlassCard
                                sx={{
                                    p: 2,
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    transition: 'all 0.25s ease-in-out',
                                    border: ativo ? `1px solid ${modo.cor}` : '1px solid rgba(255,255,255,0.08)',
                                    boxShadow: ativo ? `0 0 16px ${modo.cor}25` : 'none',
                                    background: ativo ? `linear-gradient(180deg, ${modo.cor}0c 0%, rgba(5,11,24,0.6) 100%)` : undefined,
                                    cursor: disabled ? 'default' : 'pointer'
                                }}
                                onClick={() => {
                                    if (!disabled && onChange && modo.id !== valor) {
                                        onChange(modo.id);
                                    }
                                }}
                            >
                                <Box>
                                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.2 }}>
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <Box sx={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: 1.5,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: `${modo.cor}18`,
                                                color: modo.cor
                                            }}>
                                                <Icone sx={{ fontSize: 22 }} />
                                            </Box>
                                            <Box>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                                                    {modo.titulo}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                                                    {modo.subtitulo}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                        {ativo && (
                                            <Chip
                                                size="small"
                                                icon={<CheckIcon sx={{ fontSize: '13px !important' }} />}
                                                label="Ativo"
                                                sx={{
                                                    height: 22,
                                                    fontSize: '0.68rem',
                                                    fontWeight: 700,
                                                    bgcolor: `${modo.cor}22`,
                                                    color: modo.cor,
                                                    border: `1px solid ${modo.cor}55`
                                                }}
                                            />
                                        )}
                                    </Stack>

                                    <Typography variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary', mb: 1.5, minHeight: 38, lineHeight: 1.35 }}>
                                        {modo.resumo}
                                    </Typography>

                                    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.6} sx={{ mb: 1.5 }}>
                                        {modo.badges.map((badge, bidx) => (
                                            <Chip
                                                key={bidx}
                                                size="small"
                                                label={badge}
                                                sx={{
                                                    fontSize: '0.64rem',
                                                    height: 20,
                                                    bgcolor: 'rgba(255,255,255,0.04)',
                                                    border: '1px solid rgba(255,255,255,0.06)',
                                                    color: 'rgba(255,255,255,0.85)',
                                                    fontWeight: 500
                                                }}
                                            />
                                        ))}
                                    </Stack>
                                </Box>

                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mt: 1, pt: 1, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Button
                                        size="small"
                                        variant={ativo ? 'contained' : 'outlined'}
                                        disabled={disabled}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onChange && modo.id !== valor) onChange(modo.id);
                                        }}
                                        sx={{
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            py: 0.35,
                                            px: 1.5,
                                            minWidth: 100,
                                            bgcolor: ativo ? modo.cor : 'transparent',
                                            color: ativo ? '#000' : 'text.primary',
                                            borderColor: ativo ? modo.cor : 'rgba(255,255,255,0.15)',
                                            '&:hover': {
                                                bgcolor: ativo ? modo.cor : 'rgba(255,255,255,0.08)',
                                                borderColor: modo.cor
                                            }
                                        }}
                                    >
                                        {ativo ? 'Ativo' : 'Selecionar'}
                                    </Button>

                                    <Button
                                        size="small"
                                        variant="text"
                                        startIcon={<InfoIcon sx={{ fontSize: 14 }} />}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDialogo(modo);
                                        }}
                                        sx={{
                                            fontSize: '0.72rem',
                                            textTransform: 'none',
                                            color: 'text.secondary',
                                            '&:hover': { color: modo.cor }
                                        }}
                                    >
                                        Como operar
                                    </Button>
                                </Stack>
                            </GlassCard>
                        </Grid>
                    );
                })}
            </Grid>

            {/* Modal de Orientação Operacional "Como Fazer Neste Evento" */}
            <Dialog
                open={Boolean(dialogo)}
                onClose={() => setDialogo(null)}
                maxWidth="sm"
                fullWidth
            >
                {dialogo && (
                    <>
                        <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>
                            <Stack direction="row" alignItems="center" spacing={1.5}>
                                <Box sx={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: `${dialogo.cor}18`,
                                    color: dialogo.cor
                                }}>
                                    <dialogo.icone />
                                </Box>
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                                        {dialogo.titulo}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        {dialogo.subtitulo}
                                    </Typography>
                                </Box>
                            </Stack>
                        </DialogTitle>

                        <DialogContent dividers sx={{ pt: 2, pb: 2.5 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                                📌 Quando usar este modo:
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                                {dialogo.cenario}
                            </Typography>

                            <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.08)' }} />

                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: dialogo.cor }}>
                                ⭐ Vantagens para o seu evento:
                            </Typography>
                            <Box component="ul" sx={{ pl: 2, mt: 0, mb: 2, color: 'text.secondary', fontSize: '0.85rem' }}>
                                {dialogo.vantagens.map((v, i) => (
                                    <Typography component="li" variant="body2" key={i} sx={{ mb: 0.5, color: 'text.secondary' }}>
                                        {v}
                                    </Typography>
                                ))}
                            </Box>

                            <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.08)' }} />

                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                                🛠️ Equipamentos no local:
                            </Typography>
                            <Box component="ul" sx={{ pl: 2, mt: 0, mb: 2, color: 'text.secondary', fontSize: '0.85rem' }}>
                                {dialogo.requisitos.map((r, i) => (
                                    <Typography component="li" variant="body2" key={i} sx={{ mb: 0.5, color: 'text.secondary' }}>
                                        {r}
                                    </Typography>
                                ))}
                            </Box>

                            <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.08)' }} />

                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#00D4FF' }}>
                                🚀 Passo a passo para operar no evento:
                            </Typography>
                            <Box component="ol" sx={{ pl: 2.5, mt: 0, mb: 1, color: 'text.secondary', fontSize: '0.85rem' }}>
                                {dialogo.passos.map((p, i) => (
                                    <Typography component="li" variant="body2" key={i} sx={{ mb: 0.75, color: 'text.secondary', fontWeight: 500 }}>
                                        {p}
                                    </Typography>
                                ))}
                            </Box>
                        </DialogContent>

                        <DialogActions sx={{ px: 3, py: 1.5 }}>
                            {valor !== dialogo.id && (
                                <Button
                                    variant="contained"
                                    onClick={() => {
                                        if (onChange) onChange(dialogo.id);
                                        setDialogo(null);
                                    }}
                                    sx={{
                                        bgcolor: dialogo.cor,
                                        color: '#000',
                                        fontWeight: 700,
                                        '&:hover': { bgcolor: dialogo.cor }
                                    }}
                                >
                                    Ativar este modo para o evento
                                </Button>
                            )}
                            <Button onClick={() => setDialogo(null)} sx={{ color: 'text.secondary' }}>
                                Fechar
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </Box>
    );
};

export default SeletorArquiteturaIa;
