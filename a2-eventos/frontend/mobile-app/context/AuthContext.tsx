import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';

interface MenuPermissions {
    web_admin?: string[];
    mobile_app?: string[];
    public_web?: string[];
}

interface UserProfile {
    id: string;
    nome_completo: string;
    nivel_acesso: 'master' | 'admin' | 'supervisor' | 'operador';
    evento_id: string | null;
    avatar_url?: string;
    menu_permissions?: MenuPermissions;
}

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    session: Session | null;
    loading: boolean;
    signOut: () => Promise<void>;
    hasMenuAccess: (menuKey: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    session: null,
    loading: true,
    signOut: async () => { },
    hasMenuAccess: () => true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('perfis')
                .select('*, menu_permissions')
                .eq('id', userId)
                .maybeSingle();

            if (error) throw error;
            // Se não existe perfil, não é fatal — o usuário pode operar sem ele
            setProfile(data);
        } catch (error) {
            console.error('Erro ao buscar perfil:', error);
            setProfile(null);
        }
    };

    /**
     * Verifica se o perfil atual possui acesso a um menu no Mobile-App.
     * Respeita o sistema central de permissões configurado via Web-Admin.
     * Master e Admin SEMPRE têm acesso total.
     */
    const hasMenuAccess = useCallback((menuKey: string): boolean => {
        if (!profile) return false;

        // Master e Admin = acesso total
        if (profile.nivel_acesso === 'master' || profile.nivel_acesso === 'admin') {
            return true;
        }

        // Se não há permissões granulares configuradas, libera tudo (fallback legado)
        const mobilePerms = profile.menu_permissions?.mobile_app;
        if (!mobilePerms || mobilePerms.length === 0) {
            return true;
        }

        // Verificar se o menuKey está na lista de permissões do mobile
        return mobilePerms.includes(menuKey);
    }, [profile]);

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id);
            }
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                await fetchProfile(session.user.id);
            } else {
                setProfile(null);
            }
            setLoading(false);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, profile, session, loading, signOut, hasMenuAccess }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);

