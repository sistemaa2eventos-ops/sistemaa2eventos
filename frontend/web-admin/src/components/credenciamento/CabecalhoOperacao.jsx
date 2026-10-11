import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import {
  Fullscreen as KioskIcon,
  FullscreenExit as ExitKioskIcon,
  OpenInNew as JanelaIcon
} from '@mui/icons-material';
import EstacaoFacialSelector from '../common/EstacaoFacialSelector';
import AreaSelector from '../common/AreaSelector';

/** Abre os registros de entrada/saída numa janela separada (pode ir para outro monitor). */
export const abrirJanelaRegistros = (tipo) => {
  window.open(
    `/janela/registros?tipo=${tipo}`,
    `nzt-registros-${tipo}`,
    'width=620,height=900,menubar=no,toolbar=no,location=no'
  );
};

/** Botão pequeno de "abrir em janela" para o cabeçalho da lista de registros. */
export const BotaoJanelaRegistros = ({ tipo, cor }) => (
  <Tooltip title="Abrir os registros numa janela separada">
    <IconButton
      size="small"
      onClick={() => abrirJanelaRegistros(tipo)}
      aria-label="Abrir os registros numa janela separada"
      sx={{ color: cor, border: `1px solid ${cor}50`, borderRadius: 1.5 }}
    >
      <JanelaIcon fontSize="small" />
    </IconButton>
  </Tooltip>
);

/**
 * Cabeçalho das telas de operação (check-in/checkout): título e hora à esquerda;
 * estação do leitor facial, área e modo quiosque (só ícone) à direita.
 */
const CabecalhoOperacao = ({
  titulo,
  icone,
  cor,
  dataHora,
  estacao,
  areas,
  areaId,
  onAreaChange,
  modoQuiosque,
  onToggleQuiosque
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mr: 'auto', minWidth: 0 }}>
      {React.cloneElement(icone, { sx: { fontSize: 30, color: cor } })}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" fontWeight={700} lineHeight={1.2} color="#FFFFFF">
          {titulo}
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>
          {dataHora}
        </Typography>
      </Box>
    </Box>

    {!modoQuiosque && <EstacaoFacialSelector compacto {...estacao} />}
    <AreaSelector compacto areas={areas} value={areaId} onChange={onAreaChange} accentColor={cor} />
    <Tooltip title={modoQuiosque ? 'Sair do modo quiosque' : 'Modo quiosque (tela cheia)'}>
      <IconButton
        size="small"
        onClick={onToggleQuiosque}
        aria-label={modoQuiosque ? 'Sair do modo quiosque' : 'Entrar no modo quiosque'}
        sx={{ color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 1.5 }}
      >
        {modoQuiosque ? <ExitKioskIcon fontSize="small" /> : <KioskIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  </Box>
);

export default CabecalhoOperacao;
