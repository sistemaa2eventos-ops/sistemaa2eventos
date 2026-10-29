import React, { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { OpenInNew as AbrirIcon } from '@mui/icons-material';
import { ehPdf, obterUrlDocumento } from './documentosUtils';

/**
 * Exibe o arquivo do documento (PDF ou imagem) usando URL assinada.
 * @param {{ doc: object, height?: string|number, onUrl?: (url: string) => void }} props
 */
const VisualizadorDocumento = ({ doc, height = '65dvh', onUrl }) => {
    const [url, setUrl] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const theme = useTheme();
    // Navegador de celular não mostra PDF dentro da página: abre no leitor do aparelho
    const celular = useMediaQuery(theme.breakpoints.down('md'));

    useEffect(() => {
        let ativo = true;
        setCarregando(true);
        obterUrlDocumento(doc).then((u) => {
            if (!ativo) return;
            setUrl(u);
            onUrl?.(u);
            setCarregando(false);
        });
        return () => { ativo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc?.id]);

    return (
        <Box sx={{
            width: '100%', height, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 1.5,
            border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden'
        }}>
            {carregando && <CircularProgress sx={{ color: '#00D4FF' }} />}
            {!carregando && !url && (
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>Arquivo indisponível</Typography>
            )}
            {!carregando && url && (ehPdf(doc.url_arquivo) || ehPdf(url) ? (
                celular ? (
                    <Box sx={{ textAlign: 'center', p: 2 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 2 }}>
                            {doc.titulo || 'Documento em PDF'}
                        </Typography>
                        <Button variant="outlined" startIcon={<AbrirIcon />} href={url} target="_blank" rel="noopener noreferrer" sx={{ minHeight: 44, textTransform: 'none' }}>
                            Abrir PDF
                        </Button>
                    </Box>
                ) : (
                    <iframe src={`${url}#toolbar=0`} title="Visualizador PDF" style={{ width: '100%', height: '100%', border: 'none' }} />
                )
            ) : (
                <img src={url} alt={doc.titulo || 'Documento'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ))}
        </Box>
    );
};

export default VisualizadorDocumento;
