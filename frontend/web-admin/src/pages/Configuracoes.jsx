import React, { useEffect } from 'react';
import { Box, Grid, Typography, CardActionArea } from '@mui/material';
import {
    Event as EventIcon, Place as AreaIcon, FactCheck as RegrasIcon, ViewModule as CredIcon, Article as DocsIcon,
    Watch as PulseiraIcon, Label as EtiquetaIcon, Face as LeitorIcon, Videocam as CameraIcon, DirectionsCar as CarIcon,
    Extension as ComunicacaoIcon, Webhook as WebhookIcon, Tune as GeralIcon, VerifiedUser as PerfisIcon,
    Security as SegurancaIcon, Schedule as CronIcon, Translate as IdiomaIcon, Storage as BancoIcon,
    EmojiEvents as GamifIcon, Description as LogsIcon
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import { cores } from '../styles/tokens';

// Mesma organização do menu lateral: um caminho só para cada tela
const GRUPOS = [
    {
        titulo: 'Evento', itens: [
            { nome: 'Eventos', texto: 'Criar, ativar e escolher o evento ativo', rota: '/eventos', icone: EventIcon },
            { nome: 'Áreas', texto: 'Áreas de acesso e capacidade', rota: '/config/areas', icone: AreaIcon },
            { nome: 'Regras de acesso', texto: 'Anti-passback, saída automática e lotação', rota: '/config/checkin', icone: RegrasIcon },
            { nome: 'Credenciamento', texto: 'Campos do formulário de pré-cadastro', rota: '/config/credenciamento', icone: CredIcon },
            { nome: 'Documentos', texto: 'Documentos obrigatórios por função', rota: '/config/documentos', icone: DocsIcon }
        ]
    },
    {
        titulo: 'Credenciais físicas', itens: [
            { nome: 'Pulseiras', texto: 'Lotes, cores e áreas liberadas', rota: '/config/pulseiras', icone: PulseiraIcon },
            { nome: 'Etiquetas e crachás', texto: 'Layout e impressão no check-in', rota: '/config/etiquetas', icone: EtiquetaIcon }
        ]
    },
    {
        titulo: 'Equipamentos', itens: [
            { nome: 'Leitores e dispositivos', texto: 'Leitores faciais, agente local e confiança do rosto', rota: '/config/dispositivos', icone: LeitorIcon },
            { nome: 'Câmeras e IA facial', texto: 'Câmeras IP e motor de reconhecimento', rota: '/config/cameras', icone: CameraIcon },
            { nome: 'Veículos', texto: 'Leitura de placas', rota: '/config/veiculos', icone: CarIcon }
        ]
    },
    {
        titulo: 'Comunicação', itens: [
            { nome: 'Comunicação & Integrações', texto: 'E-mail, Telegram, WhatsApp, alertas e Google Drive', rota: '/config/comunicacao', icone: ComunicacaoIcon },
            { nome: 'Webhooks e chaves de API', texto: 'Integração com outros sistemas', rota: '/config/webhooks', icone: WebhookIcon }
        ]
    },
    {
        titulo: 'Sistema', itens: [
            { nome: 'Geral', texto: 'Nome, logo e alerta de lotação', rota: '/config/geral', icone: GeralIcon },
            { nome: 'Perfis de acesso', texto: 'Módulos padrão dos operadores', rota: '/config/permissoes', icone: PerfisIcon },
            { nome: 'Segurança', texto: 'Duração do login e proteções', rota: '/config/seguranca', icone: SegurancaIcon },
            { nome: 'Rotinas automáticas', texto: 'Fechamento do dia e relatório diário', rota: '/config/cron', icone: CronIcon },
            { nome: 'Idiomas', texto: 'Idioma padrão', rota: '/config/idiomas', icone: IdiomaIcon },
            { nome: 'Banco de dados', texto: 'Conexão e sincronização', rota: '/config/banco-dados', icone: BancoIcon },
            { nome: 'Gamificação', texto: 'Pontos por ação', rota: '/config/gamificacao', icone: GamifIcon },
            { nome: 'Logs do sistema', texto: 'Registros técnicos do servidor', rota: '/config/logs', icone: LogsIcon }
        ]
    }
];

// Links antigos da central com abas (?aba=...) levam à tela equivalente
const ABA_ANTIGA = {
    geral: '/config/geral', evento: '/eventos', checkin: '/config/checkin', credenciamento: '/config/credenciamento',
    areas: '/config/areas', terminais: '/config/dispositivos', alertas: '/config/notificacoes', webhooks: '/config/webhooks',
    seguranca: '/config/seguranca', automacao: '/config/cron', integracoes: '/config/integracoes',
    documentos: '/config/documentos', 'ia-facial': '/config/ia-facial'
};

const Configuracoes = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();

    useEffect(() => {
        const destino = ABA_ANTIGA[params.get('aba')];
        if (destino) navigate(destino, { replace: true });
    }, [params, navigate]);

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader title="Configurações" subtitle="Tudo o que se configura no sistema, nos mesmos grupos do menu lateral." />
            {GRUPOS.map(g => (
                <Box key={g.titulo} component="section" aria-labelledby={`grupo-${g.titulo}`} sx={{ mt: 3 }}>
                    <Typography id={`grupo-${g.titulo}`} variant="overline" sx={{ color: cores.textoSecundario, fontWeight: 700, letterSpacing: 1 }}>{g.titulo}</Typography>
                    <Grid container spacing={2} sx={{ mt: 0 }}>
                        {g.itens.map(({ nome, texto, rota, icone: Icone }) => (
                            <Grid item xs={12} sm={6} lg={4} key={rota}>
                                <GlassCard sx={{ p: 0, height: '100%' }}>
                                    <CardActionArea onClick={() => navigate(rota)} sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 1.5 }}>
                                        <Icone sx={{ color: cores.primaria, mt: 0.25 }} aria-hidden="true" />
                                        <Box>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte }}>{nome}</Typography>
                                            <Typography variant="body2" sx={{ color: cores.textoSecundario }}>{texto}</Typography>
                                        </Box>
                                    </CardActionArea>
                                </GlassCard>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            ))}
        </Box>
    );
};

export default Configuracoes;
