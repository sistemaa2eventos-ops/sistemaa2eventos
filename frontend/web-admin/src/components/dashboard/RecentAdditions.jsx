import React from 'react';
import {
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Divider,
  Typography,
  Box,
} from '@mui/material';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const RecentAdditions = ({ pessoas }) => {
  return (
    <List>
      {pessoas.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography color="text.secondary">Nenhuma pessoa adicionada</Typography>
        </Box>
      ) : (
        pessoas.map((func, index) => (
          <React.Fragment key={func.id}>
            <ListItem alignItems="flex-start">
              <ListItemAvatar>
                <Avatar src={func.foto_url}>
                  {func.nome?.charAt(0)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Typography variant="subtitle2">
                    {func.nome}
                  </Typography>
                }
                secondary={
                  <>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {func.funcao} • {func.empresas?.nome}
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {formatDistanceToNow(new Date(func.created_at), {
                        addSuffix: true,
                        locale: ptBR
                      })}
                    </Typography>
                  </>
                }
              />
            </ListItem>
            {index < pessoas.length - 1 && <Divider variant="inset" component="li" />}
          </React.Fragment>
        ))
      )}
    </List>
  );
};

export default RecentAdditions;
