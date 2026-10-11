import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmDialog from '../components/common/ConfirmDialog';

const ConfirmacaoContext = createContext(null);

/**
 * Confirmação no padrão visual do painel, com a mesma praticidade do window.confirm:
 *
 *   const confirmar = useConfirmacao();
 *   if (!(await confirmar({ titulo: 'Excluir área', mensagem: 'Excluir esta área?' }))) return;
 */
export const ConfirmacaoProvider = ({ children }) => {
    const [opcoes, setOpcoes] = useState(null);
    const resolverRef = useRef(null);

    const confirmar = useCallback((opts = {}) => new Promise((resolve) => {
        resolverRef.current = resolve;
        setOpcoes(typeof opts === 'string' ? { mensagem: opts } : opts);
    }), []);

    const responder = (resposta) => {
        resolverRef.current?.(resposta);
        resolverRef.current = null;
        setOpcoes(null);
    };

    return (
        <ConfirmacaoContext.Provider value={confirmar}>
            {children}
            <ConfirmDialog
                open={!!opcoes}
                title={opcoes?.titulo}
                message={opcoes?.mensagem}
                confirmText={opcoes?.textoConfirmar || 'Confirmar'}
                cancelText={opcoes?.textoCancelar || 'Cancelar'}
                perigo={opcoes?.perigo !== false}
                onConfirm={() => responder(true)}
                onCancel={() => responder(false)}
            />
        </ConfirmacaoContext.Provider>
    );
};

export const useConfirmacao = () => {
    const ctx = useContext(ConfirmacaoContext);
    if (!ctx) throw new Error('useConfirmacao precisa do ConfirmacaoProvider (App.jsx)');
    return ctx;
};
