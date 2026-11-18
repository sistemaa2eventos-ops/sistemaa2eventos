'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Shield, Trash2, ArrowLeft, CheckCircle, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import Link from 'next/link';

const ERRO_LINK = 'Link inválido, expirado ou já usado. Peça um novo na Central de Privacidade.';

/**
 * Confirmação do direito ao esquecimento (link enviado por e-mail, vale 30 min).
 * Nunca confirma ao abrir: pré-visualizações de e-mail abrem links sozinhas.
 * A exclusão só acontece no clique em "Confirmar exclusão".
 */
function ConfirmarExclusao() {
    const token = useSearchParams().get('token')?.trim() || '';
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(
        token ? null : { type: 'error', text: ERRO_LINK }
    );
    const concluido = message?.type === 'success';

    const handleConfirmar = async () => {
        if (!token || loading || concluido) return;
        setLoading(true);
        setMessage(null);

        try {
            const res = await fetch('/api/lgpd/forget-me/confirmar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) throw new Error(data.error || ERRO_LINK);

            setMessage({ type: 'success', text: data.message || 'Pronto. Seus dados, sua foto e sua biometria foram apagados.' });
        } catch (error: unknown) {
            const messageText = error instanceof Error && error.message ? error.message : ERRO_LINK;
            setMessage({ type: 'error', text: messageText });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {!concluido && (
                <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                        <div className="space-y-2">
                            <h2 className="text-white font-semibold">Esta ação é irreversível</h2>
                            <p className="text-sm text-slate-300 leading-relaxed">
                                Ao confirmar, seus dados pessoais, sua foto e sua biometria facial serão apagados,
                                e seu acesso ao evento será bloqueado. Não será possível desfazer.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {message && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
                    message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                    {message.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                    <span className="text-sm font-medium">{message.text}</span>
                </div>
            )}

            {!concluido && (
                <button
                    onClick={handleConfirmar}
                    disabled={loading || !token}
                    className="w-full min-h-[48px] p-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                    Confirmar exclusão
                </button>
            )}
        </div>
    );
}

export default function ConfirmarEsquecimentoPage() {
    return (
        <div className="min-h-screen bg-[#020617] text-slate-300 py-12 px-4 selection:bg-cyan-500/30">
            <div className="max-w-2xl mx-auto">
                <Link href="/privacy" className="inline-flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Voltar à Central de Privacidade
                </Link>

                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600" />

                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                            <Shield className="w-8 h-8 text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Confirmar exclusão</h1>
                            <p className="text-slate-400">Direito ao esquecimento (LGPD, Lei 13.709/18)</p>
                        </div>
                    </div>

                    <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin text-cyan-400 mx-auto" />}>
                        <ConfirmarExclusao />
                    </Suspense>

                    <p className="mt-8 text-center text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                        A2 Eventos • Nexus Control • Compliance Team
                    </p>
                </div>
            </div>
        </div>
    );
}
