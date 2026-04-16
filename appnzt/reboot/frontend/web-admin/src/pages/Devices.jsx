import React, { useState } from 'react';
import { Box, Typography, Button, Card, CardContent, Grid, Chip, IconButton } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DevicesIcon from '@mui/icons-material/Devices';

const mockDevices = [
  { id: 1, name: 'Catraca Principal', type: 'turnstile', ip: '192.168.1.100', protocol: 'wiegand', status: 'online' },
  { id: 2, name: 'Face Reader 01', type: 'face_reader', ip: '192.168.1.101', protocol: 'http', status: 'online' },
  { id: 3, name: 'Face Reader 02', type: 'face_reader', ip: '192.168.1.102', protocol: 'http', status: 'offline' },
];

export default function Devices() {
  const [devices] = useState(mockDevices);

  const getTypeLabel = (type) => {
    const labels = { face_reader: 'Leitor Facial', turnstile: 'Catraca', camera: 'Camera', barcode_scanner: 'Leitor Código' };
    return labels[type] || type;
  };

  const getStatusColor = (status) => status === 'online' ? 'success' : 'error';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#fff' }}>Dispositivos</Typography>
        <Button variant="contained" sx={{ bgcolor: '#00d4ff', color: '#000' }} startIcon={<AddIcon />}>
          Novo Dispositivo
        </Button>
      </Box>

      <Grid container spacing={3}>
        {devices.map((device) => (
          <Grid item xs={12} md={4} key={device.id}>
            <Card sx={{ bgcolor: '#111', border: '1px solid #222' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DevicesIcon sx={{ color: '#00d4ff' }} />
                    <Typography variant="h6" sx={{ color: '#fff' }}>{device.name}</Typography>
                  </Box>
                  <Chip label={device.status} color={getStatusColor(device.status)} size="small" />
                </Box>
                <Typography variant="body2" sx={{ color: '#888', mb: 1 }}>Tipo: {getTypeLabel(device.type)}</Typography>
                <Typography variant="body2" sx={{ color: '#888', mb: 1 }}>IP: {device.ip}</Typography>
                <Typography variant="body2" sx={{ color: '#888', mb: 2 }}>Protocolo: {device.protocol}</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <IconButton size="small" sx={{ color: '#00d4ff' }}><EditIcon /></IconButton>
                  <IconButton size="small" sx={{ color: '#ff4444' }}><DeleteIcon /></IconButton>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}