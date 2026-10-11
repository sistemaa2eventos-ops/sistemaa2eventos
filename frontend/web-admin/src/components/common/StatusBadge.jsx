import React from 'react';
import { Chip } from '@mui/material';
import {
  CheckCircle as CheckIcon,
  ExitToApp as ExitIcon,
} from '@mui/icons-material';
import { funcao, tom } from '../../styles/tokens';
import { comoRotulo } from '../../utils/formatadores';

// Cor por função (styles/tokens.js): liberado = verde, saída = laranja, alerta = amarelo, negado = vermelho
const sel = (label, cor, icon) => ({ label, color: cor, bg: tom(cor, 0.1), ...(icon ? { icon } : {}) });

const STATUS_CONFIG = {
  // Check-in / Checkout (produção)
  checkin:         sel('Check-in', funcao.liberado, <CheckIcon />),
  checkout:        sel('Check-out', funcao.saida, <ExitIcon />),

  // Check-in / Checkout
  CHECKIN_FEITO:   sel('Check-in realizado', funcao.liberado),
  CHECKOUT_FEITO:  sel('Check-out realizado', funcao.saida),

  // Status de cadastro
  PENDENTE:        sel('Pendente', funcao.alerta),
  ATIVO:           sel('Ativo', funcao.liberado),
  AUTORIZADO:      sel('Autorizado', funcao.liberado),
  BLOQUEADO:       sel('Bloqueado', funcao.negado),
  REJEITADO:       sel('Rejeitado', funcao.negado),
  AUSENTE:         sel('Ausente', funcao.neutro),
  EXPULSO:         sel('Expulso', funcao.negado),

  // Veículos
  liberado:        sel('Liberado', funcao.liberado),
  bloqueado:       sel('Bloqueado', funcao.negado),

  // Documentos
  pendente:        sel('Pendente', funcao.alerta),
  aprovado:        sel('Aprovado', funcao.liberado),
  rejeitado:       sel('Rejeitado', funcao.negado),
};

const StatusBadge = ({ status, size = 'small' }) => {
  if (!status) return null;

  const config = STATUS_CONFIG[status]
    || STATUS_CONFIG[status?.toUpperCase()]
    || sel(comoRotulo(status), funcao.neutro);

  return (
    <Chip
      label={config.label}
      icon={config.icon}
      size={size}
      sx={{
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.color}40`,
        fontWeight: 700,
        fontSize: size === 'small' ? '0.75rem' : '0.8125rem',
        ...(config.icon ? {
          '& .MuiChip-icon': { color: 'inherit' }
        } : {})
      }}
    />
  );
};

export default StatusBadge;
