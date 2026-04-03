import React from 'react';
import { Chip } from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Block as BlockIcon,
  ExitToApp as ExitIcon,
} from '@mui/icons-material';

const StatusBadge = ({ status }) => {
  const config = {
    checkin: {
      label: 'Check-in',
      color: 'success',
      icon: <CheckIcon />,
    },
    checkout: {
      label: 'Check-out',
      color: 'info',
      icon: <ExitIcon />,
    },
    pendente: {
      label: 'Pendente',
      color: 'warning',
      icon: <WarningIcon />,
    },
    expulso: {
      label: 'Expulso',
      color: 'error',
      icon: <BlockIcon />,
    },
  };

  const { label, color, icon } = config[status] || config.pendente;

  return (
    <Chip
      icon={icon}
      label={label}
      color={color}
      size="small"
      variant="filled"
      sx={{
        fontWeight: 'bold',
        '& .MuiChip-icon': {
          color: 'inherit',
        },
      }}
    />
  );
};

export default StatusBadge;
