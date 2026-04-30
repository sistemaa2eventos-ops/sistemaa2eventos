import RegistrationForm from '@/components/RegistrationForm';
import { AlertCircle } from 'lucide-react';
import api from '@/lib/api';

// Props type for Next.js App Router Page
interface PageProps {
    params: Promise<{ token: string }>;
}

export default async function RegisterPage({ params }: PageProps) {
    const { token } = await params;

    try {
        // Validar token no servidor (Server Component)
        // Nota: Em Next.js App Router, chamadas fetch são cacheadas por padrão.
        // Usamos 'axios' aqui ou fetch nativo. Se usar axios cliente, cuidado com SSR.
        // Para simplificar, faremos o fetch no cliente ou aqui mesmo.
        // Vamos fazer um fetch simples para validar.

        // Melhor abordagem: Passar o token para o Client Component e ele faz o fetch inicial,
        // ou fazer o fetch aqui se a API for interna. Como a API é externa (localhost:3001),
        // podemos fazer aqui.

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/public/company/${token}`, {
            cache: 'no-store'
        });

        if (!res.ok) {
            throw new Error('Link inválido ou expirado');
        }

        const data = await res.json();
        const company = data.company;

        return (
            <div className="min-h-screen bg-[#020617] py-12 px-4 sm:px-6 lg:px-8 selection:bg-cyan-500/30">
                <RegistrationForm token={token} company={company} />
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
