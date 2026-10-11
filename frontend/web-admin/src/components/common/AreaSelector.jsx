import { Box, Typography, FormControl, Select, MenuItem, Chip } from '@mui/material';
import { tom } from '../../styles/tokens';

/**
 * Seletor de área/portaria usado em check-in e checkout.
 * accentColor: cor hex usada no tema do select e do chip (ex: '#00D4FF' ou '#FF3366').
 * compacto: versão de cabeçalho (sem rótulo à parte e sem margem).
 */
const AreaSelector = ({ areas, value, onChange, accentColor = '#00D4FF', compacto = false }) => {
  if (!areas?.length) return null;

  const selectedName = areas.find(a => a.id === value)?.nome_area;

  const select = (
    <FormControl size="small" sx={compacto
      ? { minWidth: 170 }
      : { minWidth: { xs: 0, sm: 250 }, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
      <Select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        displayEmpty
        renderValue={compacto
          ? (v) => (v ? `Área: ${selectedName || 'selecionada'}` : 'Todas as áreas')
          : undefined}
        sx={{
          borderRadius: 1.5,
          bgcolor: tom(accentColor, 0.05),
          border: `1px solid ${tom(accentColor, 0.2)}`,
          fontSize: compacto ? '0.875rem' : undefined,
          '& .MuiSelect-select': { py: compacto ? 0.75 : 1 }
        }}
      >
        <MenuItem value=""><em>Todas as áreas (global)</em></MenuItem>
        {areas.map(area => (
          <MenuItem key={area.id} value={area.id}>{area.nome_area}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  if (compacto) return select;

  return (
    <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap' }}>
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
        Portaria / área
      </Typography>
      {/* No celular ocupa a largura disponível (antes estourava a tela) */}
      {select}
      {value && (
        <Chip
          label={selectedName || 'Área selecionada'}
          size="small"
          onDelete={() => onChange(null)}
          sx={{ fontWeight: 700, bgcolor: tom(accentColor, 0.15), color: accentColor, border: `1px solid ${tom(accentColor, 0.3)}` }}
        />
      )}
    </Box>
  );
};

export default AreaSelector;
