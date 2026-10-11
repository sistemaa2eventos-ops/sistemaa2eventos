import React, { useState } from 'react';
import {
  Box, Typography, Stack, TextField, Chip, Fade
} from '@mui/material';
import {
  Search as SearchIcon,
  Timer as TimeIcon,
  Badge as BadgeIcon,
  CorporateFare as CompanyIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import PessoaFoto from '../common/PessoaFoto';
import { formatLocalTime } from '../../utils/dateUtils';

const RecentAccessList = ({
  logs = [],
  title = 'COLABORADORES REGISTRADOS',
  subtitle = 'Monitoramento de acessos em tempo real.',
  icon: IconComponent = HistoryIcon,
  accentColor = '#00D4FF',
  badgeLabel = 'REGISTRADO',
  firstLabel = 'ÚLTIMO REGISTRO',
  emptyTitle = 'Aguardando registros...',
  emptySubtitle = 'Conectado em tempo real. Assim que um acesso for realizado, o colaborador aparecerá aqui.',
  onSelect
}) => {
  const [filterText, setFilterText] = useState('');

  const filteredLogs = logs.filter(l => {
    if (!filterText) return true;
    const term = filterText.toLowerCase();
    const p = l.pessoas || {};
    return (
      (p.nome_completo || p.nome || l.pessoa_nome || '').toLowerCase().includes(term) ||
      (p.cpf || l.cpf || '').includes(term) ||
      (p.empresas?.nome || l.empresa_nome || '').toLowerCase().includes(term) ||
      (p.numero_pulseira || l.numero_pulseira || l.extra?.numero_pulseira || '').includes(term)
    );
  });

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* CABEÇALHO DO MONITORAMENTO */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          mb: 2.5,
          pb: 2,
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography variant="h5" fontWeight={700} color="#FFFFFF" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconComponent sx={{ color: accentColor, fontSize: 32 }} /> {title}
            </Typography>
            <Chip
              label="AO VIVO"
              size="small"
              sx={{
                bgcolor: `${accentColor}25`,
                color: accentColor,
                fontWeight: 700,
                letterSpacing: 1.5,
                border: `1px solid ${accentColor}80`,
                animation: 'pulse 2s infinite'
              }}
            />
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>
            {subtitle}
          </Typography>
        </Box>

        {/* Filtro Rápido Padronizado */}
        <Box sx={{ width: { xs: '100%', sm: 280 } }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar participante..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', mr: 1, fontSize: 20 }} />,
              sx: { bgcolor: 'rgba(0,0,0,0.25)', borderRadius: 1.5, color: '#FFFFFF', fontSize: '0.875rem' }
            }}
          />
        </Box>
      </Box>

      {/* LISTA EXPANDIDA DOS ÚLTIMOS ACESSOS */}
      <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
        <Stack spacing={2}>
          {filteredLogs.map((log, index) => {
            const pessoa = log.pessoas || {};
            const nome = pessoa.nome_completo || pessoa.nome || log.pessoa_nome || 'Colaborador';
            const empresa = pessoa.empresas?.nome || log.empresa_nome || 'Empresa não informada';
            const funcao = pessoa.funcao || log.funcao || 'Operacional';
            const pulseira = pessoa.numero_pulseira || log.numero_pulseira || log.extra?.numero_pulseira;
            const hora = formatLocalTime(log.created_at);
            const fotoUrl = pessoa.foto_url || log.foto_capturada || log.foto_url;

            const isFirst = index === 0;

            return (
              <Fade in key={log.id || index} timeout={350}>
                <Box
                  onClick={() => onSelect && onSelect(log)}
                  sx={{
                    p: 2.2,
                    bgcolor: isFirst ? `${accentColor}18` : 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 1.5,
                    border: isFirst ? `2px solid ${accentColor}60` : '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    gap: 2.5,
                    alignItems: 'center',
                    cursor: onSelect ? 'pointer' : 'default',
                    transition: 'all 0.22s ease',
                    '&:hover': {
                      bgcolor: `${accentColor}14`,
                      borderColor: `${accentColor}80`,
                      transform: 'translateY(-2px)',
                      boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 16px ${accentColor}25`
                    }
                  }}
                >
                  {/* FOTO DO COLABORADOR COM MOLDURA RETANGULAR ARREDONDADA */}
                  <PessoaFoto
                    src={fotoUrl}
                    nome={nome}
                    width={64}
                    borderRadius="12px"
                    accentColor={accentColor}
                    borderWidth="2px"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelect) onSelect(log);
                    }}
                  />

                  {/* INFORMAÇÕES DO COLABORADOR */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
                      <Typography variant="h6" fontWeight={700} color="#FFFFFF" noWrap sx={{ letterSpacing: 0.5, maxWidth: '100%' }}>
                        {nome}
                      </Typography>
                      {isFirst && (
                        <Chip
                          label={firstLabel}
                          size="small"
                          sx={{
                            bgcolor: accentColor,
                            color: '#000000',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            height: 22
                          }}
                        />
                      )}
                      <Chip
                        label={badgeLabel}
                        size="small"
                        variant="outlined"
                        sx={{
                          borderColor: accentColor,
                          color: accentColor,
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          height: 22
                        }}
                      />
                    </Stack>

                    <Stack direction="row" spacing={3} mt={1} sx={{ opacity: 0.85, flexWrap: 'wrap', gap: 1 }}>
                      <Typography variant="body2" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.8, color: '#FFFFFF' }}>
                        <BadgeIcon fontSize="small" sx={{ color: accentColor }} /> {funcao}
                      </Typography>
                      <Typography variant="body2" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.8, color: '#FFFFFF' }}>
                        <CompanyIcon fontSize="small" sx={{ color: accentColor }} /> {empresa}
                      </Typography>
                    </Stack>
                  </Box>

                  {/* BLOCO DA PULSEIRA E HORÁRIO */}
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ flexShrink: 0 }}>
                    {pulseira && (
                      <Box
                        sx={{
                          textAlign: 'center',
                          px: 2,
                          py: 1,
                          bgcolor: 'rgba(0,0,0,0.35)',
                          borderRadius: 1.5,
                          border: `1px solid ${accentColor}30`
                        }}
                      >
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                          Pulseira
                        </Typography>
                        <Typography variant="subtitle1" fontWeight={700} color={accentColor}>
                          #{pulseira}
                        </Typography>
                      </Box>
                    )}

                    <Box sx={{ textAlign: 'right', minWidth: 90 }}>
                      <Typography variant="h6" fontWeight={700} color="#FFFFFF">
                        {hora}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                        <TimeIcon sx={{ fontSize: 14 }} /> Horário
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              </Fade>
            );
          })}

          {filteredLogs.length === 0 && (
            <Box sx={{ textAlign: 'center', p: 8, opacity: 0.45 }}>
              <IconComponent sx={{ fontSize: 72, mb: 2, color: accentColor }} />
              <Typography variant="h6" fontWeight={700} color="#FFFFFF">{emptyTitle}</Typography>
              <Typography variant="body2" sx={{ mt: 1, maxWidth: 450, mx: 'auto' }}>
                {emptySubtitle}
              </Typography>
            </Box>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default RecentAccessList;
