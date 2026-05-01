import React from 'react';
import { Box, Typography, Stack, IconButton, Tooltip, CircularProgress, Chip } from '@mui/material';
import {
    FaceRetouchingNatural as FaceIcon,
    Add as AddIcon,
    Sync as SyncIcon,
    Delete as DeleteIcon,
    Settings as SettingsIcon,
    Refresh as RefreshIcon,
    Wifi as WifiIcon,
    WifiOff as WifiOffIcon,
    PowerSettingsNew as PowerIcon,
    VpnKey as VpnKeyIcon,
    ContentCopy as CopyIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import DataTable from '../common/DataTable';

const DeviceListPanel = ({
    readers,
    loading,
    fetchReaders,
    handleOpenDialog,
    handleRemoteAction = () => {},
    handleTestDevice,
    testingId,
    handleSync,
    syncingId,
    setDeviceToDelete,
    setOpenDeleteConfirm,
    hideHeader = false
}) => {
    const { enqueueSnackbar } = useSnackbar();
    const columns = [
        {
            id: 'nome',
            label: 'DISPOSITIVO',
            minWidth: 150,
            format: (val, row) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <FaceIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                    <Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
                            {row.config?.modo_identificacao && (
                                <Tooltip title="Modo Identificação (Não libera catraca, apenas identifica)">
                                    <VpnKeyIcon sx={{ fontSize: 14, color: '#FFC107' }} />
                                </Tooltip>
                            )}
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase' }}>
                            {row.marca}
                        </Typography>
                    </Box>
                </Box>
            )
        },
        { id: 'ip_address', label: 'ENDEREÇO IP', minWidth: 120 },
        {
            id: 'control_token',
            label: 'TOKEN DE SEGURANÇA',
            minWidth: 160,
            format: (val) => (
                <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Tooltip title={val || 'Sem token'}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#00D4FF', background: 'rgba(0,212,255,0.05)', p: 0.5, borderRadius: 1 }}>
                            {val ? val.slice(0, 8) + '...' : 'N/A'}
                        </Typography>
                    </Tooltip>
                    {val && (
                        <Tooltip title="Copiar token">
                            <IconButton size="small" onClick={() => { navigator.clipboard.writeText(val); enqueueSnackbar('Token copiado!', { variant: 'info' }); }}>
                                <CopyIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                            </IconButton>
                        </Tooltip>
                    )}
                </Stack>
            )
        },
        {
            id: 'status',
            label: 'STATUS / ÚLTIMO SINAL',
            minWidth: 160,
            format: (val, row) => (
                <Box>
                    <Chip
                        icon={val === 'online' ? <WifiIcon /> : <WifiOffIcon />}
                        label={val === 'online' ? 'ONLINE' : 'OFFLINE'}
                        color={val === 'online' ? 'success' : 'error'}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 700, mb: 0.5 }}
                    />
                    {row.last_push_at && (
                        <Typography variant="caption" display="block" sx={{ color: 'text.secondary', fontSize: '10px' }}>
                            PUSH: {new Date(row.last_push_at).toLocaleTimeString()} ({row.last_push_ip})
                        </Typography>
                    )}
                </Box>
            )
        },
        {
            id: 'controle',
            label: 'CONTROLE FÍSICO',
            minWidth: 160,
            align: 'center',
            format: (_, row) => (
                <Stack direction="row" spacing={0.5} justifyContent="center">
                    <Tooltip title="Abrir (Pulso)">
                        <IconButton
                            size="small"
                            onClick={() => handleRemoteAction(row.id, 'open')}
                            sx={{ color: '#00FF88', border: '1px solid rgba(0,255,136,0.2)' }}
                        >
                            <PowerIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Acesso Livre (Manter Aberto)">
                        <IconButton
                            size="small"
                            onClick={() => handleRemoteAction(row.id, 'unlock')}
                            sx={{ color: '#00D4FF', border: '1px solid rgba(0,212,255,0.2)' }}
                        >
                            <VpnKeyIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Bloqueio Total (Travar)">
                        <IconButton
                            size="small"
                            onClick={() => handleRemoteAction(row.id, 'lock')}
                            sx={{ color: '#FF3366', border: '1px solid rgba(255,51,102,0.2)' }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Restaurar Estado Normal">
                        <IconButton
                            size="small"
                            onClick={() => handleRemoteAction(row.id, 'close')}
                            sx={{ color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                        >
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )
        },
        {
            id: 'acoes',
            label: 'SISTEMA',
            minWidth: 120,
            align: 'center',
            format: (_, row) => (
                <Stack direction="row" spacing={1} justifyContent="center">
                    <Tooltip title="Sincronizar Faces">
                        <IconButton
                            size="small"
                            onClick={() => handleSync(row.id)}
                            disabled={syncingId === row.id}
                            sx={{ color: '#00D4FF', background: 'rgba(0,212,255,0.05)' }}
                        >
                            {syncingId === row.id ? <CircularProgress size={20} color="inherit" /> : <SyncIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar Config">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenDialog(row)}
                            sx={{ color: '#fff', background: 'rgba(255,255,255,0.05)' }}
                        >
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Remover">
                        <IconButton
                            size="small"
                            onClick={() => { setDeviceToDelete(row); setOpenDeleteConfirm(true); }}
                            sx={{ color: '#FF3366', background: 'rgba(255,51,102,0.05)' }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )
        },
    ];

    return (
        <GlassCard sx={{ p: 3, mb: 4 }}>
            {!hideHeader && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <RefreshIcon
                            sx={{ color: '#00D4FF', cursor: 'pointer' }}
                            onClick={fetchReaders}
                            className={loading ? 'ani-spin' : ''}
                        />
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                            TERMINAIS FACIAIS
                        </Typography>
                    </Box>
                    <NeonButton startIcon={<AddIcon />} size="small" onClick={() => handleOpenDialog()}>
                        NOVO TERMINAL
                    </NeonButton>
                </Box>
            )}
            <DataTable
                columns={columns}
                data={readers}
                loading={loading}
            />
        </GlassCard>
    );
};

export default DeviceListPanel;
