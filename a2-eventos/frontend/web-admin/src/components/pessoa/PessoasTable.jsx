import React from 'react';
import { Box, Typography, Stack, IconButton, Avatar, Chip, Tooltip } from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  QrCode as QrCodeIcon,
  InsertDriveFile as FileIcon,
  Block as BlockIcon,
  LockOpen as LockOpenIcon,
  ExitToApp as ExpulsarIcon,
} from '@mui/icons-material';
import DataTable from '../common/DataTable';

const StatusChip = styled(Chip)(({ theme, status }) => {
  const colors = {
    'ativo': { bg: 'rgba(0, 255, 136, 0.1)', text: '#00FF88', border: 'rgba(0, 255, 136, 0.2)' },
    'autorizado': { bg: 'rgba(0, 255, 136, 0.1)', text: '#00FF88', border: 'rgba(0, 255, 136, 0.2)' },
    'pendente': { bg: 'rgba(255, 170, 0, 0.1)', text: '#FFAA00', border: 'rgba(255, 170, 0, 0.2)' },
    'verificacao': { bg: 'rgba(0, 212, 255, 0.1)', text: '#00D4FF', border: 'rgba(0, 212, 255, 0.2)' },
    'bloqueado': { bg: 'rgba(255, 51, 102, 0.1)', text: '#FF3366', border: 'rgba(255, 51, 102, 0.2)' }
  };

  const current = colors[status] || colors['ativo'];

  return {
    fontWeight: 700,
    fontSize: '0.65rem',
    height: 24,
    background: current.bg,
    color: current.text,
    border: `1px solid ${current.border}`,
    textTransform: 'uppercase',
    letterSpacing: '1px'
  }
});

const PessoasTable = ({
  pessoas,
  loading,
  onEdit,
  onDelete,
  onBlock,
  onExpulsar,
  onOpenDocs,
  onViewQR,
  isAdmin,
  expulsionLoading,
  totalCount,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange
}) => {

  const columns = [
    {
      id: 'foto_url',
      label: 'FOTO',
      minWidth: 80,
      format: (val) => (
        <Avatar
          src={val}
          variant="rounded"
          sx={{
            width: 40,
            height: 53,
            borderRadius: '6px',
            border: '1px solid rgba(0,212,255,0.5)',
            boxShadow: '0 0 8px rgba(0,212,255,0.3)'
          }}
        />
      )
    },
    {
      id: 'nome',
      label: 'NOME/PARTICIPANTE',
      minWidth: 250,
      format: (val, row) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff' }}>{val}</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.funcao || 'Participante'}</Typography>
              <Chip
                label={row.tipo_pessoa || 'colaborador'}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.6rem',
                  bgcolor: row.tipo_pessoa === 'visitante' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(123, 47, 190, 0.1)',
                  color: row.tipo_pessoa === 'visitante' ? '#00D4FF' : '#7B2FBE',
                  border: 'none'
                }}
              />
            </Box>
          </Box>
        </Box>
      )
    },
    { id: 'cpf', label: 'ID/CPF', minWidth: 150 },
    {
      id: 'empresas',
      label: 'EMPRESA',
      minWidth: 150,
      format: (val, row) => row.empresa_nome || row.empresas?.nome || '—'
    },
    {
      id: 'status_acesso',
      label: 'ESTADO',
      minWidth: 150,
      format: (val) => {
        const STATUS_LABELS = {
          checkin_feito:   'Check-in Realizado',
          checkout_feito:  'Check-out Realizado',
          pendente:        'Pendente',
          ativo:           'Ativo',
          bloqueado:       'Bloqueado',
          rejeitado:       'Rejeitado',
          autorizado:      'Autorizado',
          ausente:         'Ausente'
        };
        const statusVal = val || 'autorizado';
        const labelText = STATUS_LABELS[statusVal.toLowerCase()] || statusVal;
        return <StatusChip status={statusVal} label={labelText} />;
      }
    },
    {
      id: 'acoes',
      label: 'AÇÕES',
      minWidth: 180,
      align: 'center',
      format: (value, row) => (
        <Stack direction="row" spacing={1} justifyContent="center">
          <Tooltip title="Documentos ECM">
            <IconButton size="small" onClick={() => onOpenDocs(row)} sx={{ color: '#00D4FF', background: 'rgba(0,212,255,0.05)' }}>
              <FileIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={row.qr_code ? "QR Code" : "Gerar QR Code"}>
            <IconButton size="small" onClick={() => onViewQR(row)} sx={{ color: row.qr_code ? '#00FF88' : '#00D4FF', background: row.qr_code ? 'rgba(0,255,136,0.05)' : 'rgba(0,212,255,0.1)' }}>
              <QrCodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={row.bloqueado ? "Desbloquear" : "Bloquear"}>
            <IconButton size="small" onClick={() => onBlock(row)} sx={{ color: row.bloqueado ? '#00FF88' : '#FF3366', background: row.bloqueado ? 'rgba(0,255,136,0.05)' : 'rgba(255,51,102,0.05)' }}>
              {row.bloqueado ? <LockOpenIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={() => onEdit(row)} sx={{ color: '#e0e0e0', background: 'rgba(255,255,255,0.05)' }}>
            <EditIcon fontSize="small" />
          </IconButton>
          {isAdmin && (
            <IconButton size="small" onClick={() => onDelete(row.id)} sx={{ color: '#FF3366', background: 'rgba(255,51,102,0.05)' }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
          {row.status_acesso === 'checkin_feito' && isAdmin && (
            <Tooltip title="Expulsar do Evento">
              <IconButton size="small" onClick={() => onExpulsar(row)} disabled={expulsionLoading} sx={{ color: '#FF6600', background: 'rgba(255,102,0,0.05)' }}>
                <ExpulsarIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={pessoas}
      loading={loading}
      onRowDoubleClick={onEdit}
      sx={{ '& .MuiTableHead-root': { background: 'rgba(0,136,255,0.05)' } }}
      totalCount={totalCount}
      page={page}
      rowsPerPage={rowsPerPage}
      onPageChange={onPageChange}
      onRowsPerPageChange={onRowsPerPageChange}
    />
  );
};

export default PessoasTable;
