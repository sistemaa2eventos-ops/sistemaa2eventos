import React from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import { History as AcoesIcon, Terminal as TecnicosIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import AuditLogs from './AuditLogs';
import ConfigLogs from './config/ConfigLogs';

/**
 * Auditoria e logs numa entrada só: ações dos usuários (/audit-logs) e registros técnicos do
 * servidor (/config/logs). Cada aba mantém o próprio endereço.
 */
const AuditoriaELogs = ({ aba = 'acoes' }) => {
    const navigate = useNavigate();
    return (
        <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 } }}>
            <PageHeader title="Auditoria e logs" subtitle="Quem fez o quê no painel e os registros técnicos do servidor." />
            <Tabs
                value={aba}
                onChange={(_, v) => navigate(v === 'acoes' ? '/audit-logs' : '/config/logs')}
                variant="scrollable"
                sx={{ mb: 2.5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}
            >
                <Tab value="acoes" icon={<AcoesIcon />} iconPosition="start" label="Ações dos usuários" />
                <Tab value="tecnicos" icon={<TecnicosIcon />} iconPosition="start" label="Logs técnicos" />
            </Tabs>
            {aba === 'acoes' ? <AuditLogs embutido /> : <ConfigLogs embutido />}
        </Box>
    );
};

export default AuditoriaELogs;
