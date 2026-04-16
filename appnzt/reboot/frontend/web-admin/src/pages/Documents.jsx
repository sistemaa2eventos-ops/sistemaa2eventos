import React from 'react';
import { Box, Typography, Button } from '@mui/material';

export default function Documents() {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#fff' }}>Auditoria de Documentos</Typography>
      </Box>
      <Box sx={{ p: 4, bgcolor: '#111', border: '1px solid #222', borderRadius: 1, textAlign: 'center' }}>
        <Typography sx={{ color: '#666' }}>Nenhum documento pendente</Typography>
      </Box>
    </Box>
  );
}