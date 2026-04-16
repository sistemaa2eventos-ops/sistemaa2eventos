import React from 'react';
import { Box, Typography, Grid, Card, CardContent } from '@mui/material';

export default function Dashboard() {
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, color: '#fff' }}>Dashboard</Typography>
      
      <Grid container spacing={3}>
        {[
          { title: 'Total de Pessoas', value: '0', color: '#00d4ff' },
          { title: 'Check-ins Hoje', value: '0', color: '#00ff88' },
          { title: 'Empresas', value: '0', color: '#ffaa00' },
          { title: 'Veículos', value: '0', color: '#ff00aa' },
        ].map((stat, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Card sx={{ bgcolor: '#111', border: '1px solid #222' }}>
              <CardContent>
                <Typography variant="body2" sx={{ color: '#888' }}>{stat.title}</Typography>
                <Typography variant="h3" sx={{ color: stat.color, fontWeight: 700 }}>{stat.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h6" sx={{ mt: 4, color: '#fff' }}>Acesso Recente</Typography>
      <Box sx={{ mt: 2, p: 2, bgcolor: '#111', border: '1px solid #222', borderRadius: 1 }}>
        <Typography sx={{ color: '#666' }}>Nenhum registro recente</Typography>
      </Box>
    </Box>
  );
}