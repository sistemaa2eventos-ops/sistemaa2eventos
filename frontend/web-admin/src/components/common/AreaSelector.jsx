import { Box, Typography, FormControl, Select, MenuItem, Chip } from '@mui/material';

/**
 * Seletor de área/portaria usado em check-in e checkout.
 * accentColor: cor hex usada no tema do select e do chip (ex: '#00D4FF' ou '#FF3366').
 */
const AreaSelector = ({ areas, value, onChange, accentColor = '#00D4FF' }) => {
  if (!areas?.length) return null;

  const rgb = accentColor === '#FF3366' ? '255,51,102' : '0,212,255';
  const selectedName = areas.find(a => a.id === value)?.nome_area;

  return (
    <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap' }}>
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
        Portaria / área
      </Typography>
      {/* No celular ocupa a largura disponível (antes estourava a tela) */}
      <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 250 }, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
        <Select
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          displayEmpty
          sx={{
            borderRadius: 1.5,
            bgcolor: `rgba(${rgb},0.05)`,
            border: `1px solid rgba(${rgb},0.2)`,
            '& .MuiSelect-select': { py: 1 }
          }}
        >
          <MenuItem value=""><em>Todas as áreas (global)</em></MenuItem>
          {areas.map(area => (
            <MenuItem key={area.id} value={area.id}>{area.nome_area}</MenuItem>
          ))}
        </Select>
      </FormControl>
      {value && (
        <Chip
          label={selectedName || 'Área selecionada'}
          size="small"
          onDelete={() => onChange(null)}
          sx={{ fontWeight: 700, bgcolor: `rgba(${rgb},0.15)`, color: accentColor, border: `1px solid rgba(${rgb},0.3)` }}
        />
      )}
    </Box>
  );
};

export default AreaSelector;
