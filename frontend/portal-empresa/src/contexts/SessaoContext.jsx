import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { dadosDe, lerSessao, limparSessao, salvarSessao } from '../services/api';

const SessaoContext = createContext(null);

/** Sessão do responsável: token do portal + nome da empresa e do evento. */
export function SessaoProvider({ children }) {
    const [sessao, setSessao] = useState(() => lerSessao());
    const [avisoSaida, setAvisoSaida] = useState('');

    useEffect(() => {
        const expirou = (e) => {
            setSessao(null);
            setAvisoSaida(e.detail || 'Sua sessão terminou. Entre de novo.');
        };
        window.addEventListener('portal-sessao-expirada', expirou);
        return () => window.removeEventListener('portal-sessao-expirada', expirou);
    }, []);

    const entrar = useCallback(async (email, chave) => {
        const resp = await api.post('/login', { email, chave });
        const nova = dadosDe(resp);
        salvarSessao(nova);
        setSessao(nova);
        setAvisoSaida('');
        return nova;
    }, []);

    const sair = useCallback(() => {
        limparSessao();
        setSessao(null);
    }, []);

    return (
        <SessaoContext.Provider value={{ sessao, entrar, sair, avisoSaida }}>
            {children}
        </SessaoContext.Provider>
    );
}

export const useSessao = () => useContext(SessaoContext);
