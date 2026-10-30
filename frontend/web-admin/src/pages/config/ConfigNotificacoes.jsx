import React from 'react';
import ConfigComunicacao from './ConfigComunicacao';

/**
 * Central unificada de Alertas e Notificações do Sistema.
 * Redireciona para a aba 'Alertas & Automações' do módulo unificado.
 */
const ConfigNotificacoes = () => {
    return <ConfigComunicacao defaultTab={1} />;
};

export default ConfigNotificacoes;
