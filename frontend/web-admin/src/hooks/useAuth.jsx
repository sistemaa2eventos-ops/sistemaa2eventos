import { createContext, useContext, useState } from 'react';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState({
        nome_completo: 'Administrador',
        avatar_url: '',
        nivel_acesso: 'admin'
    });

    const logout = () => {
        console.log('Logout called');
    };

    return (
        <AuthContext.Provider value={{ user, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
