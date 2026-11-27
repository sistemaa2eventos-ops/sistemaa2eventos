import React, { useRef } from 'react';
import {
    Box, Typography, Switch, TextField, Button, Slider,
    CircularProgress, Grid, Stack, Alert, Chip, CardActionArea
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    DeleteOutline as RestoreIcon,
    NotificationsActive as NotificationIcon,
    Business as BusinessIcon,
    Save as SaveIcon,
    Undo as UndoIcon,
    Translate as TranslateIcon,
    Security as SecurityIcon,
    VerifiedUser as PerfisIcon,
    Schedule as CronIcon,
    Storage as BancoIcon,
    OpenInNew as OpenIcon,
    Devices as DevicesIcon,
    VolumeUp as VolumeIcon,
    Speed as SpeedIcon,
    OfflinePin as OfflineIcon,
    Smartphone as PhoneIcon,
    InfoOutlined as InfoIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import PageHeader from '../../components/common/PageHeader';
import KpiCard from '../../components/common/KpiCard';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import { botaoSecundario, cores, fontes, tamanhos, tom, raios } from '../../styles/tokens';
import nztLogoClean from '../../assets/images/nzt-logo-clean.png';
import nztEmblem from '../../assets/images/nzt-emblem.png';

const _IDIOMAS_ROTULO = {
    'pt-BR': 'Português (BR)',
    pt: 'Português (BR)',
    en: 'English',
    es: 'Español',
    de: 'Deutsch'
};

const ATALHOS_SISTEMA = [
    {
        titulo: 'Perfis de acesso',
        descricao: 'Módulos e tela inicial padrão para novos operadores',
        rota: '/config/permissoes',
        icone: PerfisIcon
    },
    {
        titulo: 'Segurança e sessões',
        descricao: 'Duração do login, proteções e desconexão de emergência',
        rota: '/config/seguranca',
        icone: SecurityIcon
    },
    {
        titulo: 'Rotinas automáticas',
        descricao: 'Horários de fechamento de turno, relatórios e retenção de logs',
        rota: '/config/cron',
        icone: CronIcon
    },
    {
        titulo: 'Idiomas',
        descricao: 'Idioma padrão de exibição do painel',
        rota: '/config/idiomas',
        icone: TranslateIcon
    },
    {
        titulo: 'Banco de dados',
        descricao: 'Conexão e sincronização do sistema',
        rota: '/config/banco-dados',
        icone: BancoIcon
    }
];

const ConfigGeral = () => {
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const {
        settings,
        setSettings,
        loading,
        saving,
        uploadingLogo,
        hasChanges,
        discardChanges,
        handleSave,
        uploadSystemAsset,
        removeSystemAsset
    } = useSystemSettings();

    const inputLogoRef = useRef(null);
    const inputEmblemRef = useRef(null);
    const inputPwaGeneralRef = useRef(null);
    const inputPwaProducaoRef = useRef(null);
    const inputPwaMonitoramentoRef = useRef(null);

    const handleFileSelected = async (e, tipo) => {
        const file = e.target?.files?.[0];
        if (!file) return;

        if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/i)) {
            enqueueSnackbar('Selecione uma imagem PNG, JPG ou WEBP.', { variant: 'warning' });
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            enqueueSnackbar('A imagem deve ter no máximo 2 MB.', { variant: 'warning' });
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            await uploadSystemAsset(reader.result, tipo);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleSalvar = async () => {
        const nome = String(settings.system_name || '').trim();
        if (!nome) {
            enqueueSnackbar('O nome do sistema não pode ficar em branco.', { variant: 'warning' });
            return;
        }
        await handleSave();
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50dvh' }}>
                <CircularProgress color="primary" />
            </Box>
        );
    }

    const limiarLotacao = Number(settings.alert_peak_threshold) || 90;
    const alertaLotacaoAtivo = settings.alert_event_peak !== false;

    // Contadores para os KPIs
    const customAssets = [
        settings.logo_url,
        settings.emblem_url,
        settings.pwa_icon_general_url,
        settings.pwa_icon_producao_url,
        settings.pwa_icon_monitoramento_url
    ].filter(Boolean).length;

    const comportamentosAtivos = [
        settings.audio_feedback_enabled !== false,
        Boolean(settings.performance_mode_enabled),
        settings.offline_cache_enabled !== false
    ].filter(Boolean).length;

    return (
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, mx: 'auto', width: '100%' }}>
            {/* Inputs de arquivo ocultos para cada tipo de ativo */}
            <input
                ref={inputLogoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelected(e, 'logo')}
            />
            <input
                ref={inputEmblemRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelected(e, 'emblem')}
            />
            <input
                ref={inputPwaGeneralRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelected(e, 'pwa_general')}
            />
            <input
                ref={inputPwaProducaoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelected(e, 'pwa_producao')}
            />
            <input
                ref={inputPwaMonitoramentoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelected(e, 'pwa_monitoramento')}
            />

            <PageHeader
                title="Configurações gerais"
                subtitle="Identidade institucional, ícones de aplicativos PWA, comportamentos de interface e parâmetros de lotação."
                action={
                    <Stack direction="row" spacing={1.5} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                        {hasChanges && (
                            <Button
                                variant="outlined"
                                startIcon={<UndoIcon />}
                                onClick={discardChanges}
                                disabled={saving}
                                sx={botaoSecundario}
                            >
                                Descartar
                            </Button>
                        )}
                        <NeonButton
                            startIcon={<SaveIcon />}
                            loading={saving}
                            disabled={!hasChanges}
                            onClick={handleSalvar}
                        >
                            Salvar alterações
                        </NeonButton>
                    </Stack>
                }
            />

            {/* Indicadores padronizados (KPIs) */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        titulo="Identidade ativa"
                        valor={settings.system_name || 'NZT Eventos'}
                        valorCompacto
                        icone={<BusinessIcon />}
                        cor={cores.primaria}
                        rodape={settings.logo_url ? 'Logo principal personalizada' : 'Logo institucional padrão NZT'}
                    />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        titulo="Ativos visuais & PWA"
                        valor={`${customAssets}/5`}
                        icone={<DevicesIcon />}
                        cor={cores.secundariaClara}
                        progresso={Math.round((customAssets / 5) * 100)}
                        rodape={customAssets > 0 ? `${customAssets} imagens personalizadas` : 'Todos usando padrões do sistema'}
                    />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        titulo="Gatilho de lotação"
                        valor={alertaLotacaoAtivo ? `${limiarLotacao}%` : 'Desativado'}
                        valorCompacto={!alertaLotacaoAtivo}
                        progresso={alertaLotacaoAtivo ? limiarLotacao : undefined}
                        icone={<NotificationIcon />}
                        cor={alertaLotacaoAtivo ? cores.alerta : cores.textoSecundario}
                        rodape={alertaLotacaoAtivo ? 'Aviso informativo no painel e Vigia' : 'Alertas de capacidade desligados'}
                    />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        titulo="Comportamento operacional"
                        valor={`${comportamentosAtivos}/3`}
                        icone={<SpeedIcon />}
                        cor={cores.sucesso}
                        rodape="Recursos de campo ativos"
                    />
                </Grid>
            </Grid>

            {hasChanges && (
                <Alert
                    severity="info"
                    sx={{
                        mb: 3,
                        bgcolor: tom(cores.primaria, 0.08),
                        color: cores.texto,
                        border: `1px solid ${tom(cores.primaria, 0.3)}`
                    }}
                >
                    Você possui alterações pendentes nesta tela. Clique em <b>Salvar alterações</b> no cabeçalho para gravar e sincronizar com os dispositivos.
                </Alert>
            )}

            <Grid container spacing={3}>
                {/* ── CARD 1: Identidade da Marca (Painel Web) ── */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: { xs: 2.5, md: 3 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                            <BusinessIcon sx={{ color: cores.primaria }} />
                            <Typography variant="h6" sx={{ fontFamily: fontes.titulo, fontWeight: 700, color: cores.textoForte }}>
                                Identidade Visual do Painel Web
                            </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 3 }}>
                            Personalize o nome corporativo e as logos exibidas no cabeçalho, menu lateral, tela de login e aba do navegador.
                        </Typography>

                        <Grid container spacing={3}>
                            <Grid item xs={12} md={5}>
                                <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 600, display: 'block', mb: 1 }}>
                                    NOME DO SISTEMA
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={settings.system_name || ''}
                                    placeholder="Ex.: NZT Eventos"
                                    onChange={(e) => setSettings({ ...settings, system_name: e.target.value })}
                                    helperText="Aparece na barra superior, no login e nas mensagens emitidas pelo sistema."
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            bgcolor: cores.fundo,
                                            borderRadius: raios.controle,
                                            color: cores.textoForte,
                                            '& fieldset': { borderColor: cores.borda },
                                            '&:hover fieldset': { borderColor: cores.bordaDestaque },
                                            '&.Mui-focused fieldset': { borderColor: cores.primaria }
                                        },
                                        '& .MuiFormHelperText-root': { color: cores.textoFraco, fontSize: tamanhos.xs }
                                    }}
                                />
                            </Grid>

                            {/* Logo Principal (Horizontal) */}
                            <Grid item xs={12} sm={6} md={3.5}>
                                <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 600, display: 'block', mb: 1 }}>
                                    LOGO PRINCIPAL (HORIZONTAL)
                                </Typography>
                                <Box
                                    sx={{
                                        p: 2,
                                        borderRadius: raios.cartao,
                                        bgcolor: cores.fundo,
                                        border: `1px solid ${cores.borda}`,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        minHeight: 140,
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={settings.logo_url || nztLogoClean}
                                        alt="Logo principal"
                                        sx={{
                                            maxHeight: 48,
                                            maxWidth: '90%',
                                            objectFit: 'contain'
                                        }}
                                    />
                                    <Stack direction="row" spacing={1}>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<UploadIcon />}
                                            disabled={uploadingLogo}
                                            onClick={() => inputLogoRef.current?.click()}
                                            sx={{ ...botaoSecundario, fontSize: tamanhos.xs, py: 0.5, px: 1 }}
                                        >
                                            Alterar
                                        </Button>
                                        {Boolean(settings.logo_url) && (
                                            <Button
                                                size="small"
                                                variant="text"
                                                color="inherit"
                                                startIcon={<RestoreIcon />}
                                                disabled={uploadingLogo}
                                                onClick={() => removeSystemAsset('logo')}
                                                sx={{ color: cores.textoSecundario, fontSize: tamanhos.xs, py: 0.5, px: 1 }}
                                            >
                                                Padrão
                                            </Button>
                                        )}
                                    </Stack>
                                </Box>
                                <Typography variant="caption" sx={{ color: cores.textoFraco, display: 'block', mt: 0.5 }}>
                                    Recomendado: PNG transparente (~300x80px).
                                </Typography>
                            </Grid>

                            {/* Emblema / Favicon */}
                            <Grid item xs={12} sm={6} md={3.5}>
                                <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 600, display: 'block', mb: 1 }}>
                                    EMBLEMA & FAVICON (QUADRADO)
                                </Typography>
                                <Box
                                    sx={{
                                        p: 2,
                                        borderRadius: raios.cartao,
                                        bgcolor: cores.fundo,
                                        border: `1px solid ${cores.borda}`,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        minHeight: 140,
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={settings.emblem_url || nztEmblem}
                                        alt="Emblema / Favicon"
                                        sx={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: '50%',
                                            border: `1px solid ${cores.bordaDestaque}`,
                                            objectFit: 'cover'
                                        }}
                                    />
                                    <Stack direction="row" spacing={1}>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<UploadIcon />}
                                            disabled={uploadingLogo}
                                            onClick={() => inputEmblemRef.current?.click()}
                                            sx={{ ...botaoSecundario, fontSize: tamanhos.xs, py: 0.5, px: 1 }}
                                        >
                                            Alterar
                                        </Button>
                                        {Boolean(settings.emblem_url) && (
                                            <Button
                                                size="small"
                                                variant="text"
                                                color="inherit"
                                                startIcon={<RestoreIcon />}
                                                disabled={uploadingLogo}
                                                onClick={() => removeSystemAsset('emblem')}
                                                sx={{ color: cores.textoSecundario, fontSize: tamanhos.xs, py: 0.5, px: 1 }}
                                            >
                                                Padrão
                                            </Button>
                                        )}
                                    </Stack>
                                </Box>
                                <Typography variant="caption" sx={{ color: cores.textoFraco, display: 'block', mt: 0.5 }}>
                                    Usado no menu recolhido e na aba do navegador.
                                </Typography>
                            </Grid>
                        </Grid>
                    </GlassCard>
                </Grid>

                {/* ── CARD 2: Aplicativos PWA & Dispositivos Móveis (Opção B) ── */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: { xs: 2.5, md: 3 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <PhoneIcon sx={{ color: cores.secundariaClara }} />
                                <Typography variant="h6" sx={{ fontFamily: fontes.titulo, fontWeight: 700, color: cores.textoForte }}>
                                    Aplicativos PWA e Ícones de Instalação Móvel
                                </Typography>
                            </Box>
                            <Chip
                                label="Instalação em Celulares & Tablets"
                                size="small"
                                sx={{
                                    bgcolor: tom(cores.secundariaClara, 0.15),
                                    color: cores.secundariaClara,
                                    border: `1px solid ${tom(cores.secundariaClara, 0.3)}`,
                                    fontWeight: 600
                                }}
                            />
                        </Box>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 3 }}>
                            Configure os ícones que aparecem na tela inicial dos operadores ao instalar o PWA em smartphones ou tablets de campo.
                        </Typography>

                        <Grid container spacing={2.5}>
                            {/* PWA 1: Geral */}
                            <Grid item xs={12} md={4}>
                                <Box
                                    sx={{
                                        p: 2.5,
                                        borderRadius: raios.cartao,
                                        bgcolor: cores.fundo,
                                        border: `1px solid ${cores.borda}`,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        textAlign: 'center'
                                    }}
                                >
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte, mb: 0.5 }}>
                                        PWA Geral / Administrativo
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario, mb: 2 }}>
                                        Ícone da aplicação geral e visão admin
                                    </Typography>
                                    <Box
                                        component="img"
                                        src={settings.pwa_icon_general_url || nztEmblem}
                                        alt="PWA Geral"
                                        sx={{
                                            width: 64,
                                            height: 64,
                                            borderRadius: 2.5,
                                            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                                            mb: 2,
                                            objectFit: 'cover',
                                            bgcolor: cores.superficie
                                        }}
                                    />
                                    <Box sx={{ mt: 'auto', display: 'flex', gap: 1 }}>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<UploadIcon />}
                                            disabled={uploadingLogo}
                                            onClick={() => inputPwaGeneralRef.current?.click()}
                                            sx={botaoSecundario}
                                        >
                                            Alterar ícone
                                        </Button>
                                        {Boolean(settings.pwa_icon_general_url) && (
                                            <Button
                                                size="small"
                                                variant="text"
                                                color="inherit"
                                                onClick={() => removeSystemAsset('pwa_general')}
                                                sx={{ color: cores.textoSecundario, fontSize: tamanhos.xs }}
                                            >
                                                Restaurar
                                            </Button>
                                        )}
                                    </Box>
                                </Box>
                            </Grid>

                            {/* PWA 2: Produção */}
                            <Grid item xs={12} md={4}>
                                <Box
                                    sx={{
                                        p: 2.5,
                                        borderRadius: raios.cartao,
                                        bgcolor: cores.fundo,
                                        border: `1px solid ${cores.borda}`,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        textAlign: 'center'
                                    }}
                                >
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte, mb: 0.5 }}>
                                        PWA de Produção
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario, mb: 2 }}>
                                        Módulo de montagem, palcos e bastidores (/producao)
                                    </Typography>
                                    <Box
                                        component="img"
                                        src={settings.pwa_icon_producao_url || nztEmblem}
                                        alt="PWA Produção"
                                        sx={{
                                            width: 64,
                                            height: 64,
                                            borderRadius: 2.5,
                                            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                                            mb: 2,
                                            objectFit: 'cover',
                                            bgcolor: cores.superficie,
                                            border: `2px solid ${tom(cores.secundariaClara, 0.4)}`
                                        }}
                                    />
                                    <Box sx={{ mt: 'auto', display: 'flex', gap: 1 }}>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<UploadIcon />}
                                            disabled={uploadingLogo}
                                            onClick={() => inputPwaProducaoRef.current?.click()}
                                            sx={botaoSecundario}
                                        >
                                            Alterar ícone
                                        </Button>
                                        {Boolean(settings.pwa_icon_producao_url) && (
                                            <Button
                                                size="small"
                                                variant="text"
                                                color="inherit"
                                                onClick={() => removeSystemAsset('pwa_producao')}
                                                sx={{ color: cores.textoSecundario, fontSize: tamanhos.xs }}
                                            >
                                                Restaurar
                                            </Button>
                                        )}
                                    </Box>
                                </Box>
                            </Grid>

                            {/* PWA 3: Monitoramento / Portaria */}
                            <Grid item xs={12} md={4}>
                                <Box
                                    sx={{
                                        p: 2.5,
                                        borderRadius: raios.cartao,
                                        bgcolor: cores.fundo,
                                        border: `1px solid ${cores.borda}`,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        textAlign: 'center'
                                    }}
                                >
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte, mb: 0.5 }}>
                                        PWA de Monitoramento & Portaria
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario, mb: 2 }}>
                                        Fiscais de catraca, lotação e leitor facial (/monitor)
                                    </Typography>
                                    <Box
                                        component="img"
                                        src={settings.pwa_icon_monitoramento_url || nztEmblem}
                                        alt="PWA Monitoramento"
                                        sx={{
                                            width: 64,
                                            height: 64,
                                            borderRadius: 2.5,
                                            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                                            mb: 2,
                                            objectFit: 'cover',
                                            bgcolor: cores.superficie,
                                            border: `2px solid ${tom(cores.primaria, 0.4)}`
                                        }}
                                    />
                                    <Box sx={{ mt: 'auto', display: 'flex', gap: 1 }}>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<UploadIcon />}
                                            disabled={uploadingLogo}
                                            onClick={() => inputPwaMonitoramentoRef.current?.click()}
                                            sx={botaoSecundario}
                                        >
                                            Alterar ícone
                                        </Button>
                                        {Boolean(settings.pwa_icon_monitoramento_url) && (
                                            <Button
                                                size="small"
                                                variant="text"
                                                color="inherit"
                                                onClick={() => removeSystemAsset('pwa_monitoramento')}
                                                sx={{ color: cores.textoSecundario, fontSize: tamanhos.xs }}
                                            >
                                                Restaurar
                                            </Button>
                                        )}
                                    </Box>
                                </Box>
                            </Grid>
                        </Grid>
                    </GlassCard>
                </Grid>

                {/* ── CARD 3: Comportamento da Interface & Operação de Campo (3 Opções Funcionais) ── */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                            <SpeedIcon sx={{ color: cores.sucesso }} />
                            <Typography variant="h6" sx={{ fontFamily: fontes.titulo, fontWeight: 700, color: cores.textoForte }}>
                                Comportamento & Operação de Campo
                            </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 3 }}>
                            Parâmetros operacionais para tablets de portaria, economia de recursos e feedback auditivo.
                        </Typography>

                        <Stack spacing={2.5}>
                            {/* Opção 1: Som de Bip */}
                            <Box
                                sx={{
                                    p: 2,
                                    borderRadius: raios.cartao,
                                    bgcolor: cores.fundo,
                                    border: `1px solid ${cores.borda}`,
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: 2
                                }}
                            >
                                <Box sx={{ display: 'flex', gap: 1.5 }}>
                                    <VolumeIcon sx={{ color: cores.primaria, mt: 0.25 }} />
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte }}>
                                            Feedback sonoro nas leituras (Bip)
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                            Emite aviso auditivo de liberação ou recusa ao validar QR Code ou reconhecimento facial na catraca.
                                        </Typography>
                                    </Box>
                                </Box>
                                <Switch
                                    checked={settings.audio_feedback_enabled !== false}
                                    onChange={(e) => setSettings({ ...settings, audio_feedback_enabled: e.target.checked })}
                                    color="primary"
                                />
                            </Box>

                            {/* Opção 2: Modo Alto Desempenho */}
                            <Box
                                sx={{
                                    p: 2,
                                    borderRadius: raios.cartao,
                                    bgcolor: cores.fundo,
                                    border: `1px solid ${cores.borda}`,
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: 2
                                }}
                            >
                                <Box sx={{ display: 'flex', gap: 1.5 }}>
                                    <SpeedIcon sx={{ color: cores.alerta, mt: 0.25 }} />
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte }}>
                                            Modo econômico / Alta performance
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                            Desativa sombras e efeitos de iluminação neon no painel para aumentar a fluidez e economizar bateria em tablets de campo.
                                        </Typography>
                                    </Box>
                                </Box>
                                <Switch
                                    checked={Boolean(settings.performance_mode_enabled)}
                                    onChange={(e) => setSettings({ ...settings, performance_mode_enabled: e.target.checked })}
                                    color="primary"
                                />
                            </Box>

                            {/* Opção 3: Cache Prévio Offline */}
                            <Box
                                sx={{
                                    p: 2,
                                    borderRadius: raios.cartao,
                                    bgcolor: cores.fundo,
                                    border: `1px solid ${cores.borda}`,
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: 2
                                }}
                            >
                                <Box sx={{ display: 'flex', gap: 1.5 }}>
                                    <OfflineIcon sx={{ color: cores.sucesso, mt: 0.25 }} />
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte }}>
                                            Sincronização offline para contingência
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                            Pré-carrega a lista de credenciais do evento ativo no armazenamento do navegador para validação mesmo com queda de internet.
                                        </Typography>
                                    </Box>
                                </Box>
                                <Switch
                                    checked={settings.offline_cache_enabled !== false}
                                    onChange={(e) => setSettings({ ...settings, offline_cache_enabled: e.target.checked })}
                                    color="primary"
                                />
                            </Box>
                        </Stack>
                    </GlassCard>
                </Grid>

                {/* ── CARD 4: Limites de Lotação (Informativo - Opção 2) ── */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <NotificationIcon sx={{ color: cores.alerta }} />
                                <Typography variant="h6" sx={{ fontFamily: fontes.titulo, fontWeight: 700, color: cores.textoForte }}>
                                    Alerta Preventivo de Lotação
                                </Typography>
                            </Box>
                            <Switch
                                checked={alertaLotacaoAtivo}
                                onChange={(e) => setSettings({ ...settings, alert_event_peak: e.target.checked })}
                                color="primary"
                            />
                        </Box>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 3 }}>
                            Dispara alerta informativo na tela e nos canais de comunicação configurados ao atingir o percentual de ocupação.
                        </Typography>

                        <Box sx={{ p: 2.5, borderRadius: raios.cartao, bgcolor: cores.fundo, border: `1px solid ${cores.borda}` }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte }}>
                                    Gatilho de Notificação
                                </Typography>
                                <Typography
                                    sx={{
                                        fontFamily: fontes.titulo,
                                        fontWeight: 700,
                                        fontSize: tamanhos.xl,
                                        color: alertaLotacaoAtivo ? cores.alerta : cores.textoSecundario
                                    }}
                                >
                                    {alertaLotacaoAtivo ? `${limiarLotacao}%` : 'Desativado'}
                                </Typography>
                            </Box>

                            <Slider
                                value={limiarLotacao}
                                min={50}
                                max={100}
                                step={5}
                                marks={[
                                    { value: 50, label: '50%' },
                                    { value: 70, label: '70%' },
                                    { value: 85, label: '85%' },
                                    { value: 90, label: '90%' },
                                    { value: 100, label: '100%' }
                                ]}
                                disabled={!alertaLotacaoAtivo}
                                onChange={(_, val) => setSettings({ ...settings, alert_peak_threshold: val })}
                                sx={{
                                    color: cores.alerta,
                                    mb: 2,
                                    '& .MuiSlider-markLabel': { color: cores.textoFraco, fontSize: tamanhos.xs }
                                }}
                            />

                            <Box
                                sx={{
                                    p: 2,
                                    borderRadius: raios.controle,
                                    bgcolor: tom(cores.alerta, 0.08),
                                    border: `1px solid ${tom(cores.alerta, 0.25)}`,
                                    display: 'flex',
                                    gap: 1.5,
                                    alignItems: 'flex-start'
                                }}
                            >
                                <InfoIcon sx={{ color: cores.alerta, fontSize: 20, mt: 0.25, flexShrink: 0 }} />
                                <Typography variant="caption" sx={{ color: cores.textoSuave, lineHeight: 1.5 }}>
                                    <b>Comportamento Informativo:</b> Ao atingir o limite estipulado, o painel do coordenador e o Vigia acendem sinal amarelo de atenção e enviam avisos pelo Telegram/WhatsApp. <b>As catracas continuam liberadas normalmente</b>, sem bloqueio de público.
                                </Typography>
                            </Box>
                        </Box>

                        <Stack direction="row" spacing={1.5} sx={{ mt: 2.5 }} flexWrap="wrap">
                            <Button
                                size="small"
                                variant="text"
                                endIcon={<OpenIcon sx={{ fontSize: 14 }} />}
                                onClick={() => navigate('/config/checkin')}
                                sx={{ color: cores.primaria, fontSize: tamanhos.xs, textTransform: 'none' }}
                            >
                                Ver regras de acesso e capacidade por área
                            </Button>
                            <Button
                                size="small"
                                variant="text"
                                endIcon={<OpenIcon sx={{ fontSize: 14 }} />}
                                onClick={() => navigate('/config/comunicacao')}
                                sx={{ color: cores.secundariaClara, fontSize: tamanhos.xs, textTransform: 'none' }}
                            >
                                Configurar canais de aviso (Telegram / WhatsApp)
                            </Button>
                        </Stack>
                    </GlassCard>
                </Grid>

                {/* ── CARD 5: Atalhos Rápidos do Sistema ── */}
                <Grid item xs={12}>
                    <Box component="section" sx={{ mt: 1 }}>
                        <Typography
                            variant="overline"
                            sx={{ color: cores.textoSecundario, fontWeight: 700, letterSpacing: 1, display: 'block', mb: 1.5 }}
                        >
                            OUTRAS CONFIGURAÇÕES DO SISTEMA
                        </Typography>
                        <Grid container spacing={2}>
                            {ATALHOS_SISTEMA.map(({ titulo, descricao, rota, icone: Icone }) => (
                                <Grid item xs={12} sm={6} lg={2.4} key={rota}>
                                    <GlassCard sx={{ p: 0, height: '100%' }}>
                                        <CardActionArea
                                            onClick={() => navigate(rota)}
                                            sx={{
                                                p: 2,
                                                height: '100%',
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                justifyContent: 'flex-start',
                                                gap: 1.5
                                            }}
                                        >
                                            <Icone sx={{ color: cores.primaria, mt: 0.25, fontSize: 20 }} />
                                            <Box>
                                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte, fontSize: tamanhos.sm }}>
                                                    {titulo}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario, lineHeight: 1.3, display: 'block', mt: 0.5 }}>
                                                    {descricao}
                                                </Typography>
                                            </Box>
                                        </CardActionArea>
                                    </GlassCard>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigGeral;
