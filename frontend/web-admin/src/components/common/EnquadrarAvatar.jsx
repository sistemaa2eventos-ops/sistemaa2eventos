import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Slider, Stack, Typography } from '@mui/material';
import { ZoomIn as ZoomIcon } from '@mui/icons-material';
import { cores } from '../../styles/tokens';

const JANELA = 240; // diâmetro do círculo de enquadramento (px)
const SAIDA = 256;  // tamanho da imagem salva (px, quadrada)

/**
 * Enquadramento de foto para avatar: arraste a imagem e ajuste o zoom dentro do círculo.
 * A cada ajuste chama onAlterar(dataUrl) com a imagem final quadrada (JPEG 256x256),
 * que já cabe inteira no avatar redondo — sem recorte inesperado.
 */
const EnquadrarAvatar = ({ src, onAlterar }) => {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const arraste = useRef(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setPos({ x: 0, y: 0 }); };
    i.src = src;
  }, [src]);

  // Tamanho exibido: a imagem sempre cobre o círculo (lado menor = diâmetro no zoom 1)
  const base = img ? JANELA / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const largura = img ? img.naturalWidth * base * zoom : JANELA;
  const altura = img ? img.naturalHeight * base * zoom : JANELA;

  const limitar = useCallback((p, l = largura, a = altura) => ({
    x: Math.max(-(l - JANELA) / 2, Math.min((l - JANELA) / 2, p.x)),
    y: Math.max(-(a - JANELA) / 2, Math.min((a - JANELA) / 2, p.y))
  }), [largura, altura]);

  // Gera a imagem final sempre que o enquadramento muda
  useEffect(() => {
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = SAIDA; c.height = SAIDA;
    const k = SAIDA / JANELA;
    const ctx = c.getContext('2d');
    ctx.fillStyle = cores.fundo;
    ctx.fillRect(0, 0, SAIDA, SAIDA);
    ctx.drawImage(img,
      (JANELA / 2 - largura / 2 + pos.x) * k,
      (JANELA / 2 - altura / 2 + pos.y) * k,
      largura * k, altura * k);
    onAlterar?.(c.toDataURL('image/jpeg', 0.9));
  }, [img, largura, altura, pos, onAlterar]);

  const mudarZoom = (z) => {
    const novo = Math.max(1, Math.min(3, z));
    const l = img.naturalWidth * base * novo;
    const a = img.naturalHeight * base * novo;
    setZoom(novo);
    setPos((p) => limitar(p, l, a));
  };

  const aoPressionar = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    arraste.current = { x: e.clientX, y: e.clientY, inicio: pos };
  };
  const aoMover = (e) => {
    if (!arraste.current) return;
    const { x, y, inicio } = arraste.current;
    setPos(limitar({ x: inicio.x + e.clientX - x, y: inicio.y + e.clientY - y }));
  };
  const aoSoltar = () => { arraste.current = null; };

  if (!img) return null;

  return (
    <Stack alignItems="center" spacing={2}>
      <Box
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onWheel={(e) => mudarZoom(zoom - e.deltaY * 0.0015)}
        role="img"
        aria-label="Arraste para posicionar a foto"
        sx={{
          width: JANELA, height: JANELA, borderRadius: '50%', overflow: 'hidden',
          position: 'relative', cursor: 'grab', touchAction: 'none', userSelect: 'none',
          border: `2px solid ${cores.primaria}`, bgcolor: cores.fundo,
          '&:active': { cursor: 'grabbing' }
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            width: largura, height: altura, maxWidth: 'none',
            left: JANELA / 2 - largura / 2 + pos.x,
            top: JANELA / 2 - altura / 2 + pos.y,
            pointerEvents: 'none'
          }}
        />
      </Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: JANELA }}>
        <ZoomIcon sx={{ color: cores.textoSecundario }} />
        <Slider
          value={zoom} min={1} max={3} step={0.01}
          onChange={(_, v) => mudarZoom(v)}
          aria-label="Zoom da foto"
          size="small"
        />
      </Stack>
      <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
        Arraste a foto para posicionar e use o zoom para ajustar.
      </Typography>
    </Stack>
  );
};

export default EnquadrarAvatar;
