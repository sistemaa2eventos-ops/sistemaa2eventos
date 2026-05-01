import { Box, Typography, Stack, Chip } from '@mui/material';

/**
 * Exibe chips das áreas autorizadas de uma pessoa.
 * Só renderiza quando a pessoa tem areas_info e não tem pulseira_info
 * (pulseira tem exibição própria que já mostra áreas).
 * accentColor: cor hex do tema (ex: '#00D4FF' ou '#FF3366').
 */
const AuthorizedAreasChips = ({ pessoa, accentColor = '#00D4FF' }) => {
  if (!pessoa?.areas_info?.length || pessoa?.pulseira_info) return null;

  const rgb = accentColor === '#FF3366' ? '255,51,102' : '0,212,255';

  return (
    <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: `rgba(${rgb},0.05)`, border: `1px solid rgba(${rgb},0.15)` }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        🔑 ÁREAS AUTORIZADAS
      </Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap">
        {pessoa.areas_info.map((area) => (
          <Chip
            key={area.area_id}
            label={area.nome_area}
            size="small"
            sx={{
              height: 22,
              fontSize: '0.7rem',
              fontWeight: 700,
              bgcolor: `rgba(${rgb},0.1)`,
              color: accentColor,
              border: `1px solid rgba(${rgb},0.3)`
            }}
          />
        ))}
      </Stack>
    </Box>
  );
};

export default AuthorizedAreasChips;
