import React from 'react';
import { Backdrop, CircularProgress, Typography, Box } from '@mui/material';

const LoadingOverlay = ({ open, message = 'Carregando...' }) => {
    return (
        <Backdrop
            sx={{
                color: '#fff',
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