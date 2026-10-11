import React, { useState, useMemo } from 'react';
import {
    Box, Typography, TextField, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, InputAdornment,
    Stack, Paper
} from '@mui/material';
import {
    Business as BusinessIcon,
    Search as SearchIcon,
    Login as LoginIcon,
    Logout as LogoutIcon,
    CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import GlassCard from '../common/GlassCard';
import { formatarCnpj } from '../../utils/formatadores';

/**
 * EmpresasMetricasCard
 * Quadro do Dashboard exibindo a lista de todas as empresas do evento
 * com cadastros, check-ins, checkouts, pessoas presentes e busca rápida.
 */
const EmpresasMetricasCard = ({ empresas = [] }) => {
    const [busca, setBusca] = useState('');

    const empresasFiltradas = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        if (!termo) return empresas;
        return empresas.filter(e =>
            (e.nome || '').toLowerCase().includes(termo) ||
            (e.cnpj || '').toLowerCase().includes(termo) ||
            (e.categoria || '').toLowerCase().includes(termo)
        );
    }, [empresas, busca]);

    // Totais calculados das empresas filtradas
    const totais = useMemo(() => {
        return empresasFiltradas.reduce((acc, curr) => ({
            cadastros: acc.cadastros + (curr.cadastros || 0),
            checkins: acc.checkins + (curr.checkins || 0),
            checkouts: acc.checkouts + (curr.checkouts || 0),
            presentes: acc.presentes + (curr.presentes || 0)
        }), { cadastros: 0, checkins: 0, checkouts: 0, presentes: 0 });
    }, [empresasFiltradas]);

    return (
        <GlassCard sx={{ 
            p: { xs: 1.8, sm: 2.5 }, 
            minHeight: { xs: 380, sm: 420 }, 
            maxHeight: { xs: 520, md: 470 },
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column' 
        }}>
            {/* Cabeçalho do Quadro com Busca Integrada */}
            <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1.5,
                mb: 2
            }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: 'rgba(0, 212, 255, 0.12)',
                        color: '#00D4FF',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <BusinessIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{
                            fontWeight: 700,
                            color: '#FFFFFF',
                            fontSize: '1rem',
                            fontFamily: '"Space Grotesk", sans-serif',
                            lineHeight: 1.2
                        }}>
                            Empresas e fluxo do evento
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                            {empresasFiltradas.length} de {empresas.length} empresas credenciadas
                        </Typography>
                    </Box>
                </Stack>

                {/* Campo de Busca Rápida */}
                <TextField
                    size="small"
                    placeholder="Buscar empresa"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: '#00D4FF', fontSize: 18 }} />
                            </InputAdornment>
                        )
                    }}
                    sx={{
                        width: { xs: '100%', sm: 260 },
                        bgcolor: 'rgba(0,0,0,0.3)',
                        borderRadius: 1.5,
                        '& .MuiOutlinedInput-root': {
                            height: 38,
                            fontSize: '0.8125rem',
                            color: '#FFFFFF',
                            '& fieldset': { borderColor: 'rgba(0, 212, 255, 0.25)' },
                            '&:hover fieldset': { borderColor: '#00D4FF' }
                        }
                    }}
                />
            </Box>

            {/* Tabela com Scroll Suave */}
            <TableContainer component={Paper} sx={{
                flexGrow: 1,
                bgcolor: 'transparent',
                boxShadow: 'none',
                maxHeight: { xs: 300, sm: 340 },
                overflowY: 'auto',
                overflowX: 'auto',
                '&::-webkit-scrollbar': { width: 6, height: 6 },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0, 212, 255, 0.2)', borderRadius: 1.5 }
            }}>
                <Table stickyHeader size="small" sx={{ minWidth: { xs: 460, sm: '100%' } }}>
                    <TableHead>
                        {/* Cabeçalho no padrão do tema (neutro); a cor fica nos valores */}
                        <TableRow>
                            <TableCell>Empresa</TableCell>
                            <TableCell align="center">Cadastros</TableCell>
                            <TableCell align="center">Entradas</TableCell>
                            <TableCell align="center">Saídas</TableCell>
                            <TableCell align="center">Presentes</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {empresasFiltradas.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'rgba(255,255,255,0.4)', border: 'none' }}>
                                    {busca ? 'Nenhuma empresa encontrada com este filtro.' : 'Nenhuma empresa cadastrada no evento.'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            empresasFiltradas.map((emp) => (
                                <TableRow
                                    key={emp.id}
                                    sx={{
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        transition: 'background 0.2s',
                                        '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' }
                                    }}
                                >
                                    {/* Nome da Empresa */}
                                    <TableCell sx={{ py: 1.2 }}>
                                        <Typography variant="body2" sx={{
                                            fontWeight: 700,
                                            color: '#FFFFFF',
                                            fontSize: '0.875rem',
                                            fontFamily: '"Space Grotesk", sans-serif'
                                        }}>
                                            {emp.nome}
                                        </Typography>
                                        <Typography variant="caption" sx={{
                                            color: 'rgba(255,255,255,0.45)',
                                            fontFamily: '"Inter", sans-serif',
                                            fontSize: '0.75rem'
                                        }}>
                                            {emp.cnpj ? formatarCnpj(emp.cnpj) : emp.categoria || 'Geral'}
                                        </Typography>
                                    </TableCell>

                                    {/* Quantidade de Cadastros */}
                                    <TableCell align="center" sx={{ py: 1.2 }}>
                                        <Chip
                                            label={emp.cadastros || 0}
                                            size="small"
                                            sx={{
                                                fontFamily: '"Inter", sans-serif',
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                height: 22,
                                                bgcolor: 'rgba(255,255,255,0.06)',
                                                color: '#FFFFFF'
                                            }}
                                        />
                                    </TableCell>

                                    {/* Quantidade de Check-ins */}
                                    <TableCell align="center" sx={{ py: 1.2 }}>
                                        <Typography variant="body2" sx={{
                                            fontWeight: 700,
                                            color: '#00FF88',
                                            fontFamily: '"Inter", sans-serif',
                                            fontSize: '0.8125rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 0.5
                                        }}>
                                            <LoginIcon sx={{ fontSize: 14, opacity: 0.8 }} />
                                            {emp.checkins || 0}
                                        </Typography>
                                    </TableCell>

                                    {/* Quantidade de Checkouts */}
                                    <TableCell align="center" sx={{ py: 1.2 }}>
                                        <Typography variant="body2" sx={{
                                            fontWeight: 700,
                                            color: '#FFB800',
                                            fontFamily: '"Inter", sans-serif',
                                            fontSize: '0.8125rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 0.5
                                        }}>
                                            <LogoutIcon sx={{ fontSize: 14, opacity: 0.8 }} />
                                            {emp.checkouts || 0}
                                        </Typography>
                                    </TableCell>

                                    {/* Permanecem dentro do Evento (Presentes) */}
                                    <TableCell align="center" sx={{ py: 1.2 }}>
                                        <Chip
                                            icon={<CheckCircleIcon sx={{ fontSize: 14, color: (emp.presentes > 0 ? '#00FF88 !important' : 'rgba(255,255,255,0.3) !important') }} />}
                                            label={`${emp.presentes || 0} presentes`}
                                            size="small"
                                            sx={{
                                                fontFamily: '"Inter", sans-serif',
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                height: 22,
                                                bgcolor: emp.presentes > 0 ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255,255,255,0.04)',
                                                color: emp.presentes > 0 ? '#00FF88' : 'rgba(255,255,255,0.5)',
                                                border: '1px solid',
                                                borderColor: emp.presentes > 0 ? 'rgba(0, 255, 136, 0.35)' : 'transparent'
                                            }}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Barra Inferior com Totais Consolidados */}
            <Box sx={{
                mt: 1.5,
                pt: 1.5,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1
            }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                    Total consolidado:
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                    <Typography variant="caption" sx={{ color: '#FFFFFF', fontFamily: '"Inter", sans-serif' }}>
                        Cadastros: <strong style={{ color: '#00D4FF' }}>{totais.cadastros}</strong>
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#FFFFFF', fontFamily: '"Inter", sans-serif' }}>
                        Check-ins: <strong style={{ color: '#00FF88' }}>{totais.checkins}</strong>
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#FFFFFF', fontFamily: '"Inter", sans-serif' }}>
                        Checkouts: <strong style={{ color: '#FFB800' }}>{totais.checkouts}</strong>
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#FFFFFF', fontFamily: '"Inter", sans-serif' }}>
                        No Evento: <strong style={{ color: '#00FF88' }}>{totais.presentes}</strong>
                    </Typography>
                </Stack>
            </Box>
        </GlassCard>
    );
};

export default EmpresasMetricasCard;
