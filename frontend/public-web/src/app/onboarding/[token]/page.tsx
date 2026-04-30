import OnboardingForm from '@/components/OnboardingForm';
import { ShieldAlert, Info } from 'lucide-react';

interface PageProps {
    params: Promise<{ token: string }>;
}

export default async function OnboardingPage({ params }: PageProps) {
    const { token } = await params;

    try {
        // Validação inicial do token (Server Component)
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/onboarding/${token}`, {
            cache: 'no-store'
        });

        if (!res.ok) {
            throw new Error('Link inválido ou expirado');
        }

        const responseData = await res.json();
        const initialData = responseData.data;

        return (
            <div className="min-h-screen bg-[#050B18] py-12 px-4 sm:px-6 lg:px-8 selection:bg-cyan-500/30">
                <div className="max-w-xl mx-auto mb-8 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] text-cyan-400 font-bold tracking-widest uppercase mb-4">
                        <ShieldAlert className="w-3 h-3" /> Acesso Seguro LGPD
                    </div>
                </div>
                <OnboardingForm token={token} initialData={initialData} />
                
                <div className="max-w-xl mx-auto mt-8 flex items-start gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 text-xs">
                    <Info className="w-5 h-5 text-slate-700 flex-shrink-0" />
                    <p>Ao realizar o cadastro, você declara estar ciente de que a A2 Eventos utiliza reconhecimento facial para controle de acesso físico nos recintos. Sua foto será armazenada de forma criptografada.</p>
                </div>
            </div>
        );

    } catch (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#050B18] p-4">
                <div className="max-w-md w-full bg-slate-950 border border-slate-900 p-10 rounded-3xl shadow-2xl text-center border-red-500/20 ring-1 ring-red-500/10">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShieldAlert className="text-red-500 w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Convite Expirado</h1>
                    <p className="text-slate-500 leading-relaxed">Este link de acesso não é mais válido ou o cadastro já foi completado.</p>
                    <div className="mt-8 pt-8 border-t border-slate-900">
                        <p className="text-[10px] text-slate-700 uppercase tracking-widest">Suporte: suporte@nzt.app.br</p>
                    </div>
                </div>
            </div>
        );
    }
}
