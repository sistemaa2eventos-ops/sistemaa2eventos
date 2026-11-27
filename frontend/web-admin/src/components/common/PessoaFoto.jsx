import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import useFotoPessoa from '../../hooks/useFotoPessoa';
import { cores } from '../../styles/tokens';

/**
 * PessoaFoto: Componente padrão profissional para exibição de fotos de pessoas.
 * Utiliza moldura retangular portrait (proporção 3:4) com cantos arredondados,
 * borda de destaque (neon/accent), efeito hover e fallback elegante com inicial.
 * Com `pessoaId`, a foto guardada vem por URL assinada (carregada ao aparecer na tela).
 */
const PessoaFoto = ({
  src,
  pessoaId,
  nome = '',
  width = 64,
  height,
  aspectRatio = '3 / 4',
  borderRadius = '12px',
  accentColor = cores.primaria,
  borderWidth = '2px',
  boxShadow,
  onClick,
  sx = {}
}) => {
  const { ref, url } = useFotoPessoa(pessoaId, src);
  const [hasError, setHasError] = useState(false);
  // Linha reaproveitada com outra pessoa: a foto nova não pode herdar o erro da anterior
  useEffect(() => { setHasError(false); }, [url]);
  const initial = (nome || '').trim().charAt(0).toUpperCase() || '?';

  const defaultShadow = boxShadow !== undefined 
    ? boxShadow 
    : `0 4px 14px rgba(0,0,0,0.4), 0 0 12px ${accentColor}25`;

  const calculatedHeight = height || (typeof width === 'number' ? Math.round((width * 4) / 3) : undefined);

  return (
    <Box
      ref={ref}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      sx={{
        width,
        height: calculatedHeight,
        aspectRatio: calculatedHeight ? undefined : aspectRatio,
        flexShrink: 0,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius,
        border: `${borderWidth} solid ${accentColor}60`,
        boxShadow: defaultShadow,
        bgcolor: 'rgba(15, 23, 42, 0.85)',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), color 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': onClick ? {
          transform: 'translateY(-2px) scale(1.02)',
          borderColor: accentColor,
          boxShadow: `0 6px 20px rgba(0,0,0,0.6), 0 0 18px ${accentColor}55`,
          '& img': {
            transform: 'scale(1.06)'
          }
        } : {},
        ...sx
      }}
    >
      {url && !hasError ? (
        <Box
          component="img"
          src={url}
          alt={nome || 'Foto'}
          onError={() => setHasError(true)}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            transition: 'transform 0.3s ease'
          }}
        />
      ) : (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(145deg, rgba(255,255,255,0.06) 0%, ${accentColor}18 100%)`,
            color: cores.textoForte,
            userSelect: 'none'
          }}
        >
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: typeof width === 'number' ? `${Math.max(16, Math.round(width * 0.42))}px` : '1.5rem',
              color: cores.textoForte,
              textShadow: `0 0 10px ${accentColor}80`
            }}
          >
            {initial}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default React.memo(PessoaFoto);
