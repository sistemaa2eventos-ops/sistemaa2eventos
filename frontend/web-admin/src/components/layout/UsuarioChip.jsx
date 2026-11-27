import React from 'react';
import { Avatar, Box, ButtonBase, Typography } from '@mui/material';
import { ExpandMore as ExpandirIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { cores, papeis, raios, tamanhos } from '../../styles/tokens';

/**
 * Cartão pequeno do operador no canto superior direito.
 * Aparece quando o cartão grande (rodapé do menu) está recolhido. Clicar expande o cartão grande.
 */
const UsuarioChip = ({ onExpandir }) => {
    const { user } = useAuth();
    const nome = user?.nome_completo || user?.nome || user?.email?.split('@')[0] || 'Operador';
    const papel = papeis[user?.nivel_acesso] || { rotulo: 'Operador', cor: cores.textoSecundario };
    const foto = user?.avatar_url || user?.foto_url || undefined;

    return (
        <ButtonBase
            onClick={onExpandir}
            aria-label={`Mostrar cartão de ${nome}`}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minHeight: 44,
                pl: 0.5,
                pr: 1.25,
                py: 0.5,
                borderRadius: raios.pilula,
                border: `1px solid ${cores.borda}`,
                bgcolor: cores.superficie,
                color: cores.texto,
                maxWidth: 260,
                transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': { borderColor: cores.bordaDestaque, bgcolor: cores.superficieElevada },
                '&:focus-visible': { outline: `2px solid ${cores.primaria}`, outlineOffset: 2 }
            }}
        >
            <Avatar src={foto} alt="" sx={{ width: 32, height: 32, bgcolor: cores.superficieElevada, color: cores.textoForte, fontSize: tamanhos.sm, fontWeight: 700 }}>
                {nome.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0, textAlign: 'left' }}>
                <Typography noWrap sx={{ fontSize: tamanhos.sm, fontWeight: 600, color: cores.textoForte, lineHeight: 1.2 }}>{nome}</Typography>
                <Typography noWrap sx={{ fontSize: tamanhos.xs, color: papel.cor, fontWeight: 600, lineHeight: 1.2 }}>{papel.rotulo}</Typography>
            </Box>
            <ExpandirIcon sx={{ fontSize: 18, color: cores.textoSecundario, flexShrink: 0 }} />
        </ButtonBase>
    );
};

export default UsuarioChip;
