import React from 'react';
import ConfigComunicacao from './ConfigComunicacao';

/**
 * Central unificada de Integrações e Canais de Comunicação.
 * Redireciona para a aba 'Canais & Conexões' do módulo unificado.
 */
const ConfigIntegracoes = () => {
    return <ConfigComunicacao defaultTab={0} />;
};

export default ConfigIntegracoes;
