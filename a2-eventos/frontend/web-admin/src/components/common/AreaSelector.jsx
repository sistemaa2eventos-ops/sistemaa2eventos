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
    <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
        📍 PORTARIA / ÁREA:
      </Typography>
      <FormControl size="small" sx={{ minWidth: 250 }}>
        <Select
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          displayEmpty
          sx={{
            borderRadius: 3,
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
