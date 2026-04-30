import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Avatar,
  Divider,
  Paper,
} from '@mui/material';

const BadgePrint = ({ open, onClose, pessoa, qrCode }) => {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Crachá - ${pessoa?.nome}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background-color: #f0f0f0;
            }
            .badge {
              width: 300px;
              background: white;
              border: 2px solid #0A1929;
              border-radius: 16px;
              padding: 20px;
              box-shadow: 0 8px 16px rgba(0,0,0,0.1);
            }
            .header {
              background: #0A1929;
              color: white;
              padding: 10px;
              text-align: center;
              border-radius: 8px;
              margin-bottom: 20px;
            }
            .photo {
              width: 120px;
              height: 120px;
              border-radius: 50%;
              margin: 0 auto 15px;
              overflow: hidden;
              border: 3px solid #4FC3F7;
            }
            .photo img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }
            .info {
              margin-bottom: 15px;
            }
            .info p {
              margin: 5px 0;
              color: #333;
            }
            .qr-code {
              text-align: center;
              margin-top: 15px;
              padding-top: 15px;
              border-top: 1px solid #ddd;
            }
            .qr-code img {
              width: 150px;
              height: 150px;
            }
          </style>
        </head>
        <body>
          <div class="badge">
            <div class="header">
              <h2>NZT</h2>
            </div>
            <div class="photo">
              <img src="${pessoa?.foto_url || 'https://via.placeholder.com/120'}" />
            </div>
            <div class="info">
              <p><strong>Nome:</strong> ${pessoa?.nome}</p>
              <p><strong>CPF:</strong> ${pessoa?.cpf}</p>
              <p><strong>Função:</strong> ${pessoa?.funcao || '-'}</p>
              <p><strong>Empresa:</strong> ${pessoa?.empresa_nome || '-'}</p>
            </div>
            <div class="qr-code">
              <img src="${qrCode}" />
              <p>Aproxime para acesso</p>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Pré-visualização do Crachá
      </DialogTitle>
      <DialogContent>
        <Paper sx={{ p: 3, bgcolor: '#f5f5f5' }}>
          <Box sx={{ bgcolor: 'white', borderRadius: 2, p: 2, border: '2px solid #0A1929' }}>
            {/* Header */}
            <Box sx={{ bgcolor: '#0A1929', color: 'white', p: 1, borderRadius: 1, textAlign: 'center', mb: 2 }}>
              <Typography variant="h6">NZT</Typography>
            </Box>

            {/* Foto */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Avatar
                src={pessoa?.foto_url}
                sx={{ width: 100, height: 100, border: '3px solid #4FC3F7' }}
              />
            </Box>

            {/* Informações */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2"><strong>Nome:</strong> {pessoa?.nome}</Typography>
              <Typography variant="body2"><strong>CPF:</strong> {pessoa?.cpf}</Typography>
              <Typography variant="body2"><strong>Função:</strong> {pessoa?.funcao || '-'}</Typography>
              <Typography variant="body2"><strong>Empresa:</strong> {pessoa?.empresa_nome || '-'}</Typography>
            </Box>

            {/* QR Code */}
            <Divider sx={{ my: 2 }} />
            <Box sx={{ textAlign: 'center' }}>
              <img src={qrCode} alt="QR Code" style={{ width: 150, height: 150 }} />
              <Typography variant="caption" display="block">
                Aproxime para acesso
              </Typography>
            </Box>
          </Box>
        </Paper>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          onClick={handlePrint}
          variant="contained"
          sx={{
            backgroundColor: 'secondary.main',
            color: '#000',
            '&:hover': { backgroundColor: 'secondary.dark' },
          }}
        >
          Imprimir
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BadgePrint;