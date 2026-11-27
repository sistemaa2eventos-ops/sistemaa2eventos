import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Dialog, DialogContent, Grid, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { Edit as EditIcon, Close as CloseIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import TituloModal from '../common/TituloModal';
import DataTable from '../common/DataTable';
import ChecklistObrigatorios from '../documentos/ChecklistObrigatorios';
import { acaoTabela, cores, tom } from '../../styles/tokens';

const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');

/** Situação do participante no evento agora (dentro, saiu, expulso, ainda não entrou). */
const situacaoMovimento = (l) => {
  if (l.expulso) return { rotulo: 'Expulso', cor: cores.erro };
  if (l.dentro) return { rotulo: 'Dentro', cor: cores.sucesso };
  if (l.checkouts_hoje > 0) return { rotulo: 'Saiu', cor: cores.saida };
  return { rotulo: 'Não entrou', cor: cores.textoSecundario };
};

/**
 * Cada métrica é um filtro sobre a lista de participantes: clicar no cartão mostra só quem está nele.
 */
const METRICAS = [
  { key: 'cadastrados', rotulo: 'Cadastrados', cor: cores.textoForte, filtro: () => true },
  { key: 'pulseira', rotulo: 'Com pulseira', cor: cores.textoForte, filtro: (p) => !!p.numero_pulseira },
  { key: 'checkin', rotulo: 'Check-in hoje', cor: cores.primaria, filtro: (p) => p.checkins_hoje > 0 },
  { key: 'dentro', rotulo: 'Dentro agora', cor: cores.sucesso, filtro: (p) => p.dentro },
  { key: 'checkout', rotulo: 'Check-out hoje', cor: cores.saida, filtro: (p) => p.checkouts_hoje > 0 },
  { key: 'expulsos', rotulo: 'Expulsos', cor: cores.erro, filtro: (p) => p.expulso },
  { key: 'expulsoes', rotulo: 'Expulsões hoje', cor: cores.erro, filtro: (p) => p.expulsoes_hoje > 0 },
  { key: 'pendentes', rotulo: 'Com documento pendente', cor: cores.alerta, filtro: (p) => p.pendente },
  { key: 'bloqueados', rotulo: 'Bloqueados', cor: cores.textoSecundario, filtro: (p) => p.bloqueado }
];

const CartaoMetrica = ({ valor, rotulo, cor, ativo, onClick }) => (
  <Box
    component="button"
    type="button"
    aria-pressed={ativo}
    onClick={onClick}
    sx={{
      width: '100%', textAlign: 'left', cursor: 'pointer', p: 1.5, borderRadius: 1.5, minWidth: 0,
      border: `1px solid ${ativo ? cores.primaria : cores.borda}`,
      bgcolor: ativo ? tom(cores.primaria, 0.08) : cores.superficieElevada,
      color: 'inherit', font: 'inherit',
      '&:hover': { borderColor: cores.primaria },
      '&:focus-visible': { outline: `2px solid ${cores.primaria}`, outlineOffset: 2 }
    }}
  >
    <Typography variant="h6" sx={{ color: cor, fontWeight: 700, lineHeight: 1.2 }}>{valor}</Typography>
    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{rotulo}</Typography>
  </Box>
);

/**
 * Participantes de uma empresa no evento. Os cartões de cima filtram a lista; duplo clique ou
 * o botão de editar abre o cadastro do participante.
 */
const EmpresaParticipantesDialog = ({ open, onClose, empresa }) => {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState(null);
  const [filtroAtivo, setFiltroAtivo] = useState('cadastrados');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    if (!open || !empresa?.id) return;
    setCarregando(true);
    setDados(null);
    setPage(0);
    setFiltroAtivo('cadastrados');
    api.get(`/empresas/${empresa.id}/participantes-resumo`)
      .then(resp => setDados(resp.data?.data || null))
      .catch(() => enqueueSnackbar('Erro ao carregar os participantes da empresa.', { variant: 'error' }))
      .finally(() => setCarregando(false));
  }, [open, empresa?.id, enqueueSnackbar]);

  const participantes = useMemo(() => dados?.participantes || [], [dados]);
  const contagens = useMemo(
    () => Object.fromEntries(METRICAS.map(m => [m.key, participantes.filter(m.filtro).length])),
    [participantes]
  );
  const metricaAtiva = METRICAS.find(m => m.key === filtroAtivo) || METRICAS[0];
  const linhas = useMemo(() => participantes.filter(metricaAtiva.filtro), [participantes, metricaAtiva]);
  const paginadas = linhas.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const escolherFiltro = (key) => {
    setFiltroAtivo(prev => (prev === key ? 'cadastrados' : key));
    setPage(0);
  };

  const editar = (row) => {
    onClose();
    navigate(`/pessoas?editar=${encodeURIComponent(row.id)}`);
  };

  const columns = [
    {
      id: 'nome_completo', label: 'Participante', minWidth: 220,
      format: (val, row) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }}>{val}</Typography>
          <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{row.funcao || 'Sem função'}</Typography>
        </Box>
      )
    },
    {
      id: 'numero_pulseira', label: 'Pulseira', minWidth: 90,
      format: (val) => <Typography variant="body2">{val || '—'}</Typography>
    },
    {
      id: 'checkin_em', label: 'Check-in', minWidth: 80,
      format: (val) => <Typography variant="body2">{hora(val)}</Typography>
    },
    {
      id: 'checkout_em', label: 'Check-out', minWidth: 90,
      format: (val, row) => (
        <Typography variant="body2">{hora(val)}{row.checkouts_hoje > 1 ? ` (${row.checkouts_hoje}x)` : ''}</Typography>
      )
    },
    {
      id: 'dentro', label: 'Situação', minWidth: 120,
      format: (val, row) => {
        const s = situacaoMovimento(row);
        return <Chip size="small" label={s.rotulo} sx={{ fontWeight: 700, color: s.cor, bgcolor: `${s.cor}1F`, border: `1px solid ${s.cor}66` }} />;
      }
    },
    {
      id: 'situacao_documental', label: 'Documentos', minWidth: 280,
      format: (val, row) => (
        row.pendente
          ? <ChecklistObrigatorios obrigatorios={row.obrigatorios} titulo="Pendente" compacto />
          : <Chip size="small" label="Em dia" sx={{ fontWeight: 700, color: cores.sucesso, bgcolor: `${cores.sucesso}1F`, border: `1px solid ${cores.sucesso}66` }} />
      )
    },
    {
      id: 'acoes', label: 'Ações', minWidth: 70, align: 'center',
      format: (val, row) => (
        <Tooltip title="Editar participante">
          <IconButton size="small" onClick={() => editar(row)} sx={acaoTabela} aria-label={`Editar ${row.nome_completo}`}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )
    }
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth disableRestoreFocus
      PaperProps={{ sx: { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, backgroundImage: 'none' } }}>
      <TituloModal
        titulo={`Participantes · ${empresa?.nome || ''}`}
        subtitulo="Clique em um indicador para filtrar a lista. Duplo clique em um participante abre o cadastro."
        onFechar={onClose}
      />
      <DialogContent sx={{ p: { xs: 2, md: 3 } }}>
        {carregando && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}
        {!carregando && dados && (
          <Stack spacing={2.5}>
            <Grid container spacing={1.5}>
              {METRICAS.map(m => (
                <Grid item xs={6} sm={4} md={2} key={m.key}>
                  <CartaoMetrica
                    valor={contagens[m.key] ?? 0}
                    rotulo={m.rotulo}
                    cor={m.cor}
                    ativo={filtroAtivo === m.key}
                    onClick={() => escolherFiltro(m.key)}
                  />
                </Grid>
              ))}
            </Grid>

            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                Mostrando: <b style={{ color: cores.textoForte }}>{metricaAtiva.rotulo}</b> ({linhas.length})
              </Typography>
              {filtroAtivo !== 'cadastrados' && (
                <Button size="small" startIcon={<CloseIcon />} onClick={() => escolherFiltro(filtroAtivo)} sx={{ textTransform: 'none' }}>
                  Limpar filtro
                </Button>
              )}
            </Stack>

            <DataTable
              columns={columns}
              data={paginadas}
              page={page}
              rowsPerPage={rowsPerPage}
              totalCount={linhas.length}
              onPageChange={(e, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              onRowDoubleClick={editar}
            />
            {linhas.length === 0 && (
              <Typography variant="body2" sx={{ color: cores.textoSecundario, textAlign: 'center' }}>
                Nenhum participante nesta situação.
              </Typography>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EmpresaParticipantesDialog;
