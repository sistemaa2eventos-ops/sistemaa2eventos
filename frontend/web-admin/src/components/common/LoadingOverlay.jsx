import React from 'react';
import { Backdrop, CircularProgress, Typography } from '@mui/material';
import { cores } from '../../styles/tokens';

const LoadingOverlay = ({ open = true, message = 'Carregando...' }) => {
    return (
        <Backdrop
            sx={{
                color: cores.textoForte,
                zIndex: (theme) => theme.zIndex.drawer + 1,
                flexDirection: 'column',
                gap: 2,
            }}
            open={open}
        >
            <CircularProgress color="inherit" />
            {message && (
                <Typography variant="body1" color="inherit">
                    {message}
                </Typography>
            )}
        </Backdrop>
    );
};

export default LoadingOverlay;