'use client';

import { useState, useEffect, Suspense } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import RegistrationForm from '@/components/RegistrationForm';
import api from '@/lib/api';

/**
 * Interceptador de Registro Público: Valida o token do convite antes de exibir o formulário.
 */
function RegisterPage({ token }: { token: string }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        if (!token) {
            setError('Identificador de convite ausente.');
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            try {
                // Correção de auditoria: usando o cliente configurado com variáveis de ambiente
                const res = await api.get(`/public/company/${token}`);
                setData(res.data);
            } catch (err: any) {
                const message = err.response?.data?.error || 'Link de cadastro inválido ou já utilizado.';
                setError(message);
            } finally {
                setLoading(false);
            }
        };
        
        fetchData();
    }, [token]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-fundo">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primaria" />
                    <p className="text-primaria/50 font-mono text-xs tracking-widest anim-pulse">SECURE_LINK_VERIFICATION</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-fundo">
                <div className="max-w-md w-full bg-superficie border border-erro/20 p-10 rounded-[2.5rem] shadow-2xl text-center backdrop-blur-xl">
                    <div className="w-20 h-20 bg-erro/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="text-red-500 w-10 h-10" />
                    </div>
                    <h1 className="text-2xl font-bold text-texto-forte mb-3 tracking-tight">Convite Expirado</h1>
                    <p className="text-texto-secundario text-sm leading-relaxed mb-8">{error}</p>
                    <div className="pt-6 border-t border-borda">
                        <p className="text-xs text-texto-fraco">Por favor, solicite um novo link ao seu gestor de equipe.</p>
                    </div>
                </div>
            </div>
        );
    }

    const company = data?.company || { nome: 'VISITANTE' };
    
    return (
        <div className="min-h-screen bg-fundo py-12 px-4 sm:px-6 lg:px-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-[#020617]">
            <RegistrationForm 
                token={token} 
                company={company} 
                branding={data?.branding} 
                requiredFields={data?.requiredFields}
            />
        </div>
    );
}

function RegisterPageFallback() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-fundo">
            <Loader2 className="w-8 h-8 animate-spin text-primaria" />
        </div>
    );
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
    return (
        <Suspense fallback={<RegisterPageFallback />}>
            <RegisterPageInner params={params} />
        </Suspense>
    );
}

async function RegisterPageInner({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    return <RegisterPage token={token} />;
}