import RegistrationForm from '@/components/RegistrationForm';
import { AlertCircle } from 'lucide-react';
import api from '@/lib/api';

// Props type for Next.js App Router Page
interface PageProps {
    params: Promise<{ token: string }>;
}

export default async function RegisterPage({ params }: PageProps) {
    const { token } = await params;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.nzt.app.br';

    try {
        // 1. Tentar primeiro como Convite de Pessoa (Individual)
        let res = await fetch(`${apiUrl}/api/public/person/${token}`, { cache: 'no-store' });
        let isPerson = res.ok;
        let data;

        if (isPerson) {
            data = await res.json();
        } else {
            // 2. Tentar como Convite de Empresa (Geral)
            res = await fetch(`${apiUrl}/api/public/company/${token}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('Link inválido ou expirado');
            data = await res.json();
        }

        const company = data.company || { nome: data.pessoa?.empresa_nome || 'N/D' };
        const branding = data.branding || null;
        const requiredFields = data.requiredFields || null;
        const preFilledData = isPerson ? data.pessoa : null;

        return (
            <div
                className="min-h-screen bg-[#020617] py-12 px-4 sm:px-6 lg:px-8 selection:bg-cyan-500/30"
                style={{
                    '--brand-primary': branding?.cor_primaria || '#06B6D4',
                    '--brand-secondary': branding?.cor_secundaria || '#7B2FBE',
                } as React.CSSProperties}
            >
                <RegistrationForm 
                    token={token} 
                    company={company} 
                    branding={branding} 
                    requiredFields={requiredFields}
                    preFilledData={preFilledData}
                />
            </div>
        );


    } catch (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#020617]">
                <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="text-red-500 w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Vínculo Inválido</h1>
                    <p className="text-slate-400">Este link de acesso não existe ou já foi revogado pela administração.</p>
                    <p className="text-xs text-slate-500 mt-6 pt-4 border-t border-slate-800">Suporte: admin@a2eventos.com.br</p>
                </div>
            </div>
        );
    }
}
