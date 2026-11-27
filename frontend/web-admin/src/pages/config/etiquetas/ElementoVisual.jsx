import React, { memo } from 'react';
import { Box, Typography } from '@mui/material';
import {
    gerarBarcodeSvg,
    gerarQrExemploSvg,
    svgForma,
    tamanhoDaFonte,
    preencher,
    rotacaoDe,
    ICONES
} from '../../../services/etiquetaRender';

const SILHUETA = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
        <rect width="24" height="24" fill="#E6EAF0" />
        <path fill="#A3ADBB" d="M12 12.6c2.35 0 4.25-1.9 4.25-4.25S14.35 4.1 12 4.1 7.75 6 7.75 8.35 9.65 12.6 12 12.6zm0 2.1c-2.84 0-8.5 1.42-8.5 4.25V24h17v-5.05c0-2.83-5.66-4.25-8.5-4.25z" />
    </svg>
);

const pesoDe = (fw) => {
    if (fw === 'bold') return 700;
    if (!fw || fw === 'normal') return 400;
    return Number(fw) || 400;
};

/**
 * Renderizador React nativo com Memoization.
 * Cada elemento tem suas props memoizadas, evitando reconciliação desnecessária
 * durante o arrasto do mouse.
 */
const ElementoVisualComponent = memo(({ el, dados }) => {
    const rot = rotacaoDe(el);
    const troca = rot === 90 || rot === 270;
    const w = troca ? el.height : el.width;
    const h = troca ? el.width : el.height;

    const renderConteudo = () => {
        switch (el.type) {
            case 'qrcode': {
                const qrVal = preencher(el.content, dados) || 'QR';
                if (dados.qr_imagem) {
                    return <img src={dados.qr_imagem} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />;
                }
                return (
                    <Box
                        sx={{ width: '100%', height: '100%' }}
                        dangerouslySetInnerHTML={{ __html: gerarQrExemploSvg(qrVal, el.color || '#000000') }}
                    />
                );
            }

            case 'barcode': {
                const cod = preencher(el.content || '{pulseira}', dados) || '123456';
                return (
                    <Box
                        sx={{ width: '100%', height: '100%' }}
                        dangerouslySetInnerHTML={{ __html: gerarBarcodeSvg(cod, el.exibirTexto !== false, el.color || '#000000') }}
                    />
                );
            }

            case 'foto': {
                const url = dados.foto_url || dados.foto || null;
                const bw = Number(el.borderWidth ?? (el.borderColor ? 1 : 0)) || 0;
                return (
                    <Box
                        sx={{
                            width: '100%',
                            height: '100%',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            borderRadius: el.circular ? '50%' : (el.borderRadius ? `${el.borderRadius}px` : 0),
                            border: bw > 0 ? `${bw}px solid ${el.borderColor || '#000000'}` : 'none'
                        }}
                    >
                        {url ? (
                            <img
                                src={url}
                                alt=""
                                draggable={false}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'block',
                                    objectFit: el.objectFit || 'cover',
                                    objectPosition: 'center 25%'
                                }}
                            />
                        ) : (
                            SILHUETA
                        )}
                    </Box>
                );
            }

            case 'image': {
                const src = el.content || el.url;
                if (!src) return null;
                return (
                    <img
                        src={src}
                        alt=""
                        draggable={false}
                        style={{
                            width: '100%',
                            height: '100%',
                            display: 'block',
                            objectFit: el.objectFit || 'contain',
                            borderRadius: el.borderRadius ? `${el.borderRadius}px` : 0
                        }}
                    />
                );
            }

            case 'icone': {
                const ic = ICONES[el.icone] || ICONES.estrela;
                return (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
                        <path fill={el.color || '#000000'} d={ic.d} />
                    </svg>
                );
            }

            case 'shape':
            case 'circle': {
                return (
                    <Box
                        sx={{ width: '100%', height: '100%' }}
                        dangerouslySetInnerHTML={{ __html: svgForma(el, w, h) }}
                    />
                );
            }

            case 'line': {
                const sw = Math.max(0.5, Number(el.borderWidth) || 2);
                const cor = el.borderColor || el.color || '#000000';
                return (
                    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ width: '100%', borderTop: `${sw}px solid ${cor}` }} />
                    </Box>
                );
            }

            default: { // Text
                const texto = preencher(el.content, dados);
                const fs = tamanhoDaFonte(el, texto, w, h);
                const pad = Number(el.padding) || 0;
                const bw = el.borderColor && Number(el.borderWidth) > 0 ? Number(el.borderWidth) : 0;
                const justificar = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.verticalAlign || 'top'] || 'flex-start';

                return (
                    <Box
                        sx={{
                            width: '100%',
                            height: '100%',
                            boxSizing: 'border-box',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            justifyContent: justificar,
                            p: `${pad}px`,
                            bgcolor: el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : 'transparent',
                            border: bw > 0 ? `${bw}px ${el.strokeStyle || 'solid'} ${el.borderColor}` : 'none',
                            borderRadius: el.borderRadius ? `${el.borderRadius}px` : 0
                        }}
                    >
                        <Typography
                            component="div"
                            sx={{
                                width: '100%',
                                fontSize: `${fs}px`,
                                fontWeight: pesoDe(el.fontWeight),
                                fontStyle: el.italic ? 'italic' : 'normal',
                                textDecoration: el.sublinhado ? 'underline' : 'none',
                                textTransform: el.textTransform || 'none',
                                letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : 'normal',
                                lineHeight: Number(el.lineHeight) || 1.15,
                                color: el.color || '#000000',
                                textAlign: el.textAlign || 'left',
                                whiteSpace: el.autoAjuste ? 'pre' : 'pre-wrap',
                                wordBreak: 'break-word',
                                fontFamily: el.fontFamily ? undefined : 'Arial, sans-serif'
                            }}
                        >
                            {texto}
                        </Typography>
                    </Box>
                );
            }
        }
    };

    if (!rot) return renderConteudo();

    return (
        <Box
            sx={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: `${w}px`,
                height: `${h}px`,
                transform: `translate(-50%, -50%) rotate(${rot}deg)`
            }}
        >
            {renderConteudo()}
        </Box>
    );
});

export default ElementoVisual;

ElementoVisualComponent.displayName = 'ElementoVisual';
export const ElementoVisual = ElementoVisualComponent;
