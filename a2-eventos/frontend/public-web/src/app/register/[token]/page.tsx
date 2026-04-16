'use client';

import { useState, useEffect, Suspense } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import RegistrationForm from '@/components/RegistrationForm';

function RegisterPage({ token }: { token: string }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        if (!token) {
            setError('Token inválido');
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            try {
                const res = await fetch(`https://api.nzt.app.br/api/public/company/${token}`, {
                    signal: controller.signal,
                    mode: 'cors',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    }
                });
                clearTimeout(timeoutId);
                
                if (!res.ok) {
                    const json = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
                    throw new Error(json.error || 'Link inválido ou expirado');
                }
                
                const json = await res.json();
                setData(json);
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    setError('Tempo limite excedido. Tente novamente.');
                } else {
                    setError(err.message || 'Erro ao carregar dados');
                }
            } finally {
                setLoading(false);
            }
        };
        
        fetchData();
    }, [token]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#020617]">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#020617]">
                <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="text-red-500 w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Vínculo Inválido</h1>
                    <p className="text-slate-400">{error}</p>
                </div>
            </div>
        );
    }

    const company = data?.company || { nome: 'N/D' };
    
    return (
        <div className="min-h-screen bg-[#020617] py-12 px-4 sm:px-6 lg:px-8">
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
        <div className="min-h-screen flex items-center justify-center bg-[#020617]">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
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