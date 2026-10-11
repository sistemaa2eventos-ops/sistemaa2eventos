import React, { useState } from 'react';
import {
  List,
  ListItem,
  ListItemText,
  Divider,
  Typography,
  Box,
  ButtonBase,
} from '@mui/material';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PessoaFoto from '../common/PessoaFoto';
import PessoaCardDialog from '../credenciamento/PessoaCardDialog';

const RecentAdditions = ({ pessoas = [] }) => {
  const [selectedPessoa, setSelectedPessoa] = useState(null);

  const listaPessoas = Array.isArray(pessoas) ? pessoas : [];

  return (
    <>
      <List disablePadding>
        {listaPessoas.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">Nenhuma pessoa recente cadastrada</Typography>
          </Box>
        ) : (
          (pessoas || []).slice(0, 6).map((func, index) => (
            <React.Fragment key={func.id}>
              <ListItem
                component={ButtonBase}
                onClick={() => setSelectedPessoa(func)}
                sx={{
                  py: 1.5,
                  px: 1.5,
                  borderRadius: 1.5,
                  textAlign: 'left',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background 0.2s ease',
                  '&:hover': {
                    background: 'rgba(0, 212, 255, 0.05)',
                  }
                }}
              >
                <Box sx={{ mr: 2, flexShrink: 0 }}>
                  <PessoaFoto
                    src={func.foto_url}
                    nome={func.nome}
                    width={48}
                    borderRadius="10px"
                    accentColor="#00D4FF"
                  />
                </Box>
                <ListItemText
                  primary={
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#FFFFFF' }}>
                      {func.nome}
                    </Typography>
                  }
                  secondary={
                    <>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {func.funcao || 'Função não inf.'} • {func.empresas?.nome || func.empresa_nome || 'Empresa não informada'}
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ opacity: 0.7, fontFamily: '"Inter", sans-serif', fontSize: '0.75rem' }}>
                        {func.created_at ? formatDistanceToNow(new Date(func.created_at), {
                          addSuffix: true,
                          locale: ptBR
                        }) : ''}
                      </Typography>
                    </>
                  }
                />
              </ListItem>
              {index < Math.min(pessoas.length, 6) - 1 && <Divider component="li" sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />}
            </React.Fragment>
          ))
        )}
      </List>

      {/* Modal detalhado do participante com foto e dados */}
      <PessoaCardDialog
        open={Boolean(selectedPessoa)}
        onClose={() => setSelectedPessoa(null)}
        pessoa={selectedPessoa}
      />
    </>
  );
};

export default RecentAdditions;
