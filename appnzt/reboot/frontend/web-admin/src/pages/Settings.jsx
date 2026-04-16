import React from 'react';
import { Box, Typography, Button } from '@mui/material';

export default function Settings() {
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, color: '#fff' }}>Configurações</Typography>
      <Box sx={{ p: 4, bgcolor: '#111', border: '1px solid #222', borderRadius: 1 }}>
        <Typography sx={{ color: '#666' }}>Configurações do sistema</Typography>
      </Box>
    </Box>
  );
}