import React, { useMemo, useState } from 'react';
import {
    Box, Typography, TextField, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, InputAdornment
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import Secao from './Secao';
import { formatarCnpj } from '../../../utils/formatadores';
import { cores, funcao, tamanhos } from '../../../styles/tokens';

const numero = { fontVariantNumeric: 'tabular-nums', fontWeight: 600 };

/**
 * Empresas do evento: cadastros, entradas, saídas e quem está dentro.
 * Tabela neutra; a cor só nos números que têm função (entrada verde, saída laranja).
 */
const EmpresasEditorial = ({ empresas = [] }) => {
    const [busca, setBusca] = useState('');

    const filtradas = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        if (!termo) return empresas;
        return empresas.filter(e =>
            (e.nome || '').toLowerCase().includes(termo) ||
            (e.cnpj || '').toLowerCase().includes(termo) ||
            (e.categoria || '').toLowerCase().includes(termo)
        );
    }, [empresas, busca]);

    const totais = useMemo(() => filtradas.reduce((acc, e) => ({
        cadastros: acc.cadastros + (e.cadastros || 0),
        checkins: acc.checkins + (e.checkins || 0),
        checkouts: acc.checkouts + (e.checkouts || 0),
        presentes: acc.presentes + (e.presentes || 0)
    }), { cadastros: 0, checkins: 0, checkouts: 0, presentes: 0 }), [filtradas]);

    return (
        <Secao
            id="secao-empresas" cartao
            rotulo="Equipes"
            titulo="Empresas no evento"
            subtitulo={`${filtradas.length} de ${empresas.length} empresas credenciadas`}
            acao={
                <TextField
                    size="small"
                    placeholder="Buscar empresa, CNPJ ou categoria"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    inputProps={{ 'aria-label': 'Buscar empresa' }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: cores.textoSecundario, fontSize: 18 }} />
                            </InputAdornment>
                        )
                    }}
                    sx={{ width: { xs: '100%', sm: 280 }, '& .MuiOutlinedInput-root': { minHeight: 44 } }}
                />
            }
        >
            <TableContainer sx={{ maxHeight: 360, overflow: 'auto', borderTop: `1px solid ${cores.borda}` }}>
                <Table stickyHeader size="small" sx={{ minWidth: 520 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell>Empresa</TableCell>
                            <TableCell align="right">Cadastros</TableCell>
                            <TableCell align="right">Entradas</TableCell>
                            <TableCell align="right">Saídas</TableCell>
                            <TableCell align="right">Dentro agora</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filtradas.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} sx={{ py: 4, color: cores.textoSecundario }}>
                                    {busca ? 'Nenhuma empresa encontrada com este filtro.' : 'Nenhuma empresa cadastrada no evento.'}
                                </TableCell>
                            </TableRow>
                        ) : filtradas.map(e => (
                            <TableRow key={e.id} hover>
                                <TableCell sx={{ py: 1.25 }}>
                                    <Typography sx={{ fontSize: tamanhos.md, fontWeight: 600, color: cores.textoForte }}>{e.nome}</Typography>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                        {e.cnpj ? formatarCnpj(e.cnpj) : e.categoria || 'Geral'}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ ...numero, color: cores.textoForte }}>{e.cadastros || 0}</TableCell>
                                <TableCell align="right" sx={{ ...numero, color: funcao.liberado }}>{e.checkins || 0}</TableCell>
                                <TableCell align="right" sx={{ ...numero, color: funcao.saida }}>{e.checkouts || 0}</TableCell>
                                <TableCell align="right" sx={{ ...numero, color: (e.presentes || 0) > 0 ? cores.textoForte : cores.textoSecundario }}>
                                    {e.presentes || 0}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Totais das empresas listadas */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
                gap: 2,
                pt: 1.5,
                borderTop: `1px solid ${cores.borda}`
            }}>
                {[
                    ['Cadastros', totais.cadastros, cores.textoForte],
                    ['Entradas', totais.checkins, funcao.liberado],
                    ['Saídas', totais.checkouts, funcao.saida],
                    ['Dentro agora', totais.presentes, cores.textoForte]
                ].map(([rotulo, valor, cor]) => (
                    <Box key={rotulo} sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>{rotulo}</Typography>
                        <Typography sx={{ ...numero, fontSize: tamanhos.lg, color: cor }}>{valor.toLocaleString('pt-BR')}</Typography>
                    </Box>
                ))}
            </Box>
        </Secao>
    );
};

export default EmpresasEditorial;
