import React, { useState } from 'react';
import {
  Box, Typography, Stack, TextField, Chip
} from '@mui/material';
import {
  Search as SearchIcon,
  CorporateFare as CompanyIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import PessoaFoto from '../common/PessoaFoto';
import { formatLocalTime } from '../../utils/dateUtils';

/**
 * Lista dos últimos acessos (check-in/checkout) em tempo real.
 * Ocupa a altura do contêiner e rola por dentro; `acoes` entra no cabeçalho (ex.: abrir em janela).
 */
const RecentAccessList = ({
  logs = [],
  title = 'Registros recentes',
  icon: IconComponent = HistoryIcon,
  accentColor = '#00D4FF',
  badgeLabel = 'Registrado',
  firstLabel = 'Último registro',
  emptyTitle = 'Nenhum registro ainda',
  emptySubtitle = 'Os acessos aparecem aqui assim que forem registrados.',
  acoes = null,
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
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Cabeçalho */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1.25,
          mb: 1.5,
          pb: 1.25,
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, minWidth: 160 }}>
          <IconComponent sx={{ color: accentColor, fontSize: 22 }} />
          <Typography variant="h6" fontWeight={700} color="#FFFFFF" sx={{ fontSize: { xs: '1rem', sm: '1.0625rem' } }}>
            {title}
          </Typography>
          <Chip
            label={`${logs.length} ${logs.length === 1 ? 'registro' : 'registros'}`}
            size="small"
            sx={{
              bgcolor: `${accentColor}20`,
              color: accentColor,
              fontWeight: 700,
              border: `1px solid ${accentColor}60`
            }}
          />
        </Stack>

        <TextField
          size="small"
          placeholder="Filtrar nome, CPF, pulseira"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          sx={{ width: { xs: '100%', sm: 240 } }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', mr: 1, fontSize: 18 }} />,
            sx: { bgcolor: 'rgba(0,0,0,0.25)', borderRadius: 1.5, color: '#FFFFFF', fontSize: '0.8125rem', height: 36 }
          }}
        />
        {acoes}
      </Box>

      {/* Lista (rola por dentro) */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
        <Stack spacing={1}>
          {filteredLogs.map((log, index) => {
            const pessoa = log.pessoas || {};
            const nome = pessoa.nome_completo || pessoa.nome || log.pessoa_nome || 'Colaborador';
            const empresa = pessoa.empresas?.nome || log.empresa_nome || 'Empresa não informada';
            const funcao = pessoa.funcao || log.funcao;
            const pulseira = pessoa.numero_pulseira || log.numero_pulseira || log.extra?.numero_pulseira;
            const hora = formatLocalTime(log.created_at);
            const fotoUrl = pessoa.foto_url || log.foto_capturada || log.foto_url;
            const isFirst = index === 0 && !filterText;

            return (
              <Box
                key={log.id || index}
                onClick={() => onSelect && onSelect(log)}
                sx={{
                  px: { xs: 1.25, sm: 1.5 },
                  py: 1,
                  bgcolor: isFirst ? `${accentColor}14` : 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 1.5,
                  border: isFirst ? `1px solid ${accentColor}80` : '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  gap: { xs: 1.15, sm: 1.5 },
                  alignItems: 'center',
                  cursor: onSelect ? 'pointer' : 'default',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease',
                  '&:hover': { bgcolor: `${accentColor}10`, borderColor: `${accentColor}60` }
                }}
              >
                <PessoaFoto
                  src={fotoUrl}
                  nome={nome}
                  width={42}
                  borderRadius="10px"
                  accentColor={accentColor}
                  borderWidth="1px"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelect) onSelect(log);
                  }}
                />

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={700} color="#FFFFFF" noWrap sx={{ fontSize: { xs: '0.875rem', sm: '0.9375rem' } }}>
                      {nome}
                    </Typography>
                    {isFirst && (
                      <Chip
                        label={firstLabel}
                        size="small"
                        sx={{ bgcolor: accentColor, color: '#000000', fontWeight: 700, height: 18, fontSize: '0.6875rem', flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                      />
                    )}
                  </Stack>
                  <Typography variant="caption" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>
                    <CompanyIcon sx={{ fontSize: 14, color: accentColor, flexShrink: 0 }} />
                    {empresa}{funcao ? ` · ${funcao}` : ''}
                  </Typography>
                  {pulseira && (
                    <Typography variant="caption" sx={{ display: { xs: 'inline-block', sm: 'none' }, color: accentColor, fontWeight: 700, fontSize: '0.7rem', mt: 0.25 }}>
                      Pulseira #{pulseira}
                    </Typography>
                  )}
                </Box>

                {pulseira && (
                  <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'center', px: 1.25, py: 0.5, bgcolor: 'rgba(0,0,0,0.35)', borderRadius: 1, border: `1px solid ${accentColor}30`, flexShrink: 0 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', lineHeight: 1.2 }}>
                      Pulseira
                    </Typography>
                    <Typography variant="body2" fontWeight={700} color={accentColor}>
                      #{pulseira}
                    </Typography>
                  </Box>
                )}

                <Box sx={{ textAlign: 'right', minWidth: { xs: 52, sm: 72 }, flexShrink: 0 }}>
                  <Typography variant="body2" fontWeight={700} color="#FFFFFF" sx={{ fontVariantNumeric: 'tabular-nums', fontSize: { xs: '0.8125rem', sm: '0.9375rem' } }}>
                    {hora}
                  </Typography>
                  <Typography variant="caption" sx={{ color: accentColor, fontWeight: 600, fontSize: '0.7rem' }}>
                    {badgeLabel}
                  </Typography>
                </Box>
              </Box>
            );
          })}

          {filteredLogs.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 5, px: 2, opacity: 0.6 }}>
              <IconComponent sx={{ fontSize: 44, mb: 1, color: accentColor }} />
              <Typography variant="subtitle1" fontWeight={700} color="#FFFFFF">
                {filterText ? `Nada encontrado para "${filterText}"` : emptyTitle}
              </Typography>
              {!filterText && (
                <Typography variant="body2" sx={{ mt: 0.5, maxWidth: 420, mx: 'auto' }}>
                  {emptySubtitle}
                </Typography>
              )}
            </Box>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default RecentAccessList;
