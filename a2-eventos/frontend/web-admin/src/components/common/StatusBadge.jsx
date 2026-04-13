import React from 'react';
import { Chip } from '@mui/material';

const STATUS_CONFIG = {
  // Check-in / Checkout
  CHECKIN_FEITO:   { label: 'Check-in Realizado',  color: '#00FF88', bg: 'rgba(0,255,136,0.1)' },
  CHECKOUT_FEITO:  { label: 'Check-out Realizado', color: '#00D4FF', bg: 'rgba(0,212,255,0.1)' },

  // Status de cadastro
  PENDENTE:        { label: 'Pendente',             color: '#FFB800', bg: 'rgba(255,184,0,0.1)' },
  ATIVO:           { label: 'Ativo',                color: '#00FF88', bg: 'rgba(0,255,136,0.1)' },
  AUTORIZADO:      { label: 'Autorizado',           color: '#00FF88', bg: 'rgba(0,255,136,0.1)' },
  BLOQUEADO:       { label: 'Bloqueado',            color: '#FF3366', bg: 'rgba(255,51,102,0.1)' },
  REJEITADO:       { label: 'Rejeitado',            color: '#FF3366', bg: 'rgba(255,51,102,0.1)' },
  AUSENTE:         { label: 'Ausente',              color: '#888',    bg: 'rgba(136,136,136,0.1)' },
  EXPULSO:         { label: 'Expulso',              color: '#FF3366', bg: 'rgba(255,51,102,0.1)' },

  // Veículos
  liberado:        { label: 'Liberado',             color: '#00FF88', bg: 'rgba(0,255,136,0.1)' },
  bloqueado:       { label: 'Bloqueado',            color: '#FF3366', bg: 'rgba(255,51,102,0.1)' },

  // Documentos
  pendente:        { label: 'Pendente',             color: '#FFB800', bg: 'rgba(255,184,0,0.1)' },
  aprovado:        { label: 'Aprovado',             color: '#00FF88', bg: 'rgba(0,255,136,0.1)' },
  rejeitado:       { label: 'Rejeitado',            color: '#FF3366', bg: 'rgba(255,51,102,0.1)' },
};

const StatusBadge = ({ status, size = 'small' }) => {
  if (!status) return null;

  const config = STATUS_CONFIG[status]
    || STATUS_CONFIG[status?.toUpperCase()]
    || { label: status, color: '#888', bg: 'rgba(136,136,136,0.1)' };

  return (
    <Chip
      label={config.label}
      size={size}
      sx={{
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.color}40`,
        fontWeight: 700,
        fontSize: size === 'small' ? '0.7rem' : '0.8rem',
        letterSpacing: '0.05em'
      }}
    />
  );
};

export default StatusBadge;
