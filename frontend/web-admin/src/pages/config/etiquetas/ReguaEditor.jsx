import React, { useMemo } from 'react';
import { Box } from '@mui/material';

/**
 * Réguas profissional de prancheta gráfica (superior e lateral).
 * Medição em milímetros reais da prancheta baseada no ESCALA (3 px = 1 mm) e no zoom atual.
 * Inclui marcadores interativos de posição do cursor do mouse ou elemento selecionado.
 */
export const ReguaEditor = ({
    larguraMm,
    alturaMm,
    escala = 3,
    zoom = 1,
    cursorX = null, // em px da prancheta
    cursorY = null, // em px da prancheta
    tamanhoRegua = 22,
    guiaSegurancaMm = 3 // Linha tracejada de sangria/margem de corte recomendada
}) => {
    const larguraPx = larguraMm * escala;
    const alturaPx = alturaMm * escala;

    // Graduações em mm (a cada 1mm pequeno, 5mm médio, 10mm grande com número)
    const marcasX = useMemo(() => {
        const marcas = [];
        for (let mm = 0; mm <= larguraMm; mm++) {
            marcas.push({
                mm,
                pos: mm * escala * zoom,
                tipo: mm % 10 === 0 ? 'grande' : (mm % 5 === 0 ? 'medio' : 'pequeno')
            });
        }
        return marcas;
    }, [larguraMm, escala, zoom]);

    const marcasY = useMemo(() => {
        const marcas = [];
        for (let mm = 0; mm <= alturaMm; mm++) {
            marcas.push({
                mm,
                pos: mm * escala * zoom,
                tipo: mm % 10 === 0 ? 'grande' : (mm % 5 === 0 ? 'medio' : 'pequeno')
            });
        }
        return marcas;
    }, [alturaMm, escala, zoom]);

    const corTexto = 'rgba(148, 163, 184, 0.7)';
    const corTraco = 'rgba(148, 163, 184, 0.25)';
    const bgRegua = '#070E1B';

    return (
        <>
            {/* Canto superior esquerdo de junção */}
            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: tamanhoRegua,
                    height: tamanhoRegua,
                    bgcolor: '#040812',
                    borderRight: '1px solid rgba(148, 163, 184, 0.2)',
                    borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 20,
                    fontSize: '9px',
                    fontFamily: 'monospace',
                    color: '#00D4FF',
                    fontWeight: 'bold',
                    userSelect: 'none'
                }}
            >
                mm
            </Box>

            {/* Régua Horizontal (Superior) */}
            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: tamanhoRegua,
                    width: larguraPx * zoom,
                    height: tamanhoRegua,
                    bgcolor: bgRegua,
                    borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
                    overflow: 'hidden',
                    zIndex: 19,
                    userSelect: 'none'
                }}
            >
                {marcasX.map(({ mm, pos, tipo }) => {
                    const h = tipo === 'grande' ? 12 : (tipo === 'medio' ? 7 : 4);
                    return (
                        <React.Fragment key={`rx_${mm}`}>
                            <Box
                                sx={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: pos,
                                    width: '1px',
                                    height: `${h}px`,
                                    bgcolor: corTraco
                                }}
                            />
                            {tipo === 'grande' && (
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        top: 1,
                                        left: pos + 2,
                                        fontSize: '8px',
                                        fontFamily: 'monospace',
                                        color: corTexto,
                                        lineHeight: 1
                                    }}
                                >
                                    {mm}
                                </Box>
                            )}
                        </React.Fragment>
                    );
                })}

                {/* Marcador de posição da régua superior */}
                {cursorX !== null && (
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: cursorX * zoom,
                            width: '2px',
                            bgcolor: '#00D4FF',
                            boxShadow: '0 0 4px #00D4FF',
                            zIndex: 2
                        }}
                    />
                )}
            </Box>

            {/* Régua Vertical (Lateral Esquerda) */}
            <Box
                sx={{
                    position: 'absolute',
                    top: tamanhoRegua,
                    left: 0,
                    width: tamanhoRegua,
                    height: alturaPx * zoom,
                    bgcolor: bgRegua,
                    borderRight: '1px solid rgba(148, 163, 184, 0.2)',
                    overflow: 'hidden',
                    zIndex: 19,
                    userSelect: 'none'
                }}
            >
                {marcasY.map(({ mm, pos, tipo }) => {
                    const w = tipo === 'grande' ? 12 : (tipo === 'medio' ? 7 : 4);
                    return (
                        <React.Fragment key={`ry_${mm}`}>
                            <Box
                                sx={{
                                    position: 'absolute',
                                    right: 0,
                                    top: pos,
                                    height: '1px',
                                    width: `${w}px`,
                                    bgcolor: corTraco
                                }}
                            />
                            {tipo === 'grande' && (
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        left: 2,
                                        top: pos + 2,
                                        fontSize: '8px',
                                        fontFamily: 'monospace',
                                        color: corTexto,
                                        lineHeight: 1
                                    }}
                                >
                                    {mm}
                                </Box>
                            )}
                        </React.Fragment>
                    );
                })}

                {/* Marcador de posição da régua lateral */}
                {cursorY !== null && (
                    <Box
                        sx={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: cursorY * zoom,
                            height: '2px',
                            bgcolor: '#00D4FF',
                            boxShadow: '0 0 4px #00D4FF',
                            zIndex: 2
                        }}
                    />
                )}
            </Box>
        </>
    );
};

export default ReguaEditor;
