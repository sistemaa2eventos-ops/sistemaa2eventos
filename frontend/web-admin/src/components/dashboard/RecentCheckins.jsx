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
import StatusBadge from '../common/StatusBadge';

const RecentCheckins = ({ logs }) => {
  return (
    <List>
      {logs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography color="text.secondary">Nenhum acesso recente</Typography>
        </Box>
      ) : (
        logs.map((log, index) => (
          <React.Fragment key={log.id}>
            <ListItem alignItems="flex-start">
              <ListItemAvatar>
                <Avatar src={log.pessoas?.foto_url}>
                  {log.pessoas?.nome?.charAt(0)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle2">
                      {log.pessoas?.nome}
                    </Typography>
                    <StatusBadge status={log.tipo} />
                  </Box>
                }
                secondary={
                  <>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {log.metodo === 'qrcode' ? '📱 QR Code' :
                        log.metodo === 'face' ? '👤 Facial' :
                          log.metodo === 'fast-track' ? '⚡ Fast Track' : '📝 Manual'}
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                        locale: ptBR
                      })}
                    </Typography>
                  </>
                }
              />
            </ListItem>
            {index < logs.length - 1 && <Divider variant="inset" component="li" />}
          </React.Fragment>
        ))
      )}
    </List>
  );
};

export default RecentCheckins;
