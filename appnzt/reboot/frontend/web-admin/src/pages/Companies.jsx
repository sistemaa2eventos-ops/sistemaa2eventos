import React from 'react';
import { Box, Typography, Button } from '@mui/material';

export default function Companies() {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#fff' }}>Empresas</Typography>
        <Button variant="contained" sx={{ bgcolor: '#00d4ff', color: '#000' }}>Nova Empresa</Button>
      </Box>
      <Box sx={{ p: 4, bgcolor: '#111', border: '1px solid #222', borderRadius: 1, textAlign: 'center' }}>
        <Typography sx={{ color: '#666' }}>Nenhuma empresa cadastrada</Typography>
      </Box>
    </Box>
  );
}