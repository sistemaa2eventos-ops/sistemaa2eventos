import React from 'react';
import { Navigate } from 'react-router-dom';

const Configuracoes = () => {
    // Redireciona o root legardo de configurações para a primeira aba standalone
    return <Navigate to="/config/geral" replace />;
};

export default Configuracoes;
