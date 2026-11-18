import React from 'react';
import { Avatar } from '@mui/material';
import useFotoPessoa from '../../hooks/useFotoPessoa';

/**
 * Avatar (MUI) de uma pessoa com a foto guardada vinda por URL assinada.
 * Use dentro de listas (ex.: renderOption): a foto só é buscada quando a linha aparece.
 * Sem foto (ou se a busca falhar), mostra os children do Avatar, como antes.
 */
const AvatarPessoa = ({ src, pessoaId, children, ...props }) => {
  const { ref, url } = useFotoPessoa(pessoaId, src);
  return (
    <Avatar ref={ref} src={url || undefined} {...props}>
      {children}
    </Avatar>
  );
};

export default AvatarPessoa;
