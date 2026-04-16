'use client';

import { useState } from 'react';
import { Shield, Mail, Trash2, ArrowLeft, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function PrivacyPage() {
    const [formData, setFormData] = useState({ cpf: '', email: '', eventoId: '' });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleSubmit = async (action: 'portability' | 'forget-me') => {
        setLoading(true);
        setMessage(null);

        try {
            const endpoint = action === 'portability' ? '/lgpd/portability' : '/lgpd/forget-me';
             const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://api.nzt.app.br'}/api${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cpf: formData.cpf.replace(/\D/g, ''),
                    email: formData.email,
                    evento_id: formData.eventoId
                })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Erro ao processar solicitação');

            setMessage({ type: 'success', text: data.message });
        } catch (error: unknown) {
            const messageText = error instanceof Error ? error.message : 'Falha ao processar solicitação';
            setMessage({ type: 'error', text: messageText });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020617] text-slate-300 py-12 px-4 selection:bg-cyan-500/30">
            <div className="max-w-2xl mx-auto">
                <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Voltar ao Início
                </Link>

                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600" />
                    
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                            <Shield className="w-8 h-8 text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Central de Privacidade</h1>
                            <p className="text-slate-400">Gerencie seus direitos conforme a LGPD (Lei 13.709/18)</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                            <h2 className="text-white font-semibold mb-3">Identificação do Titular</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-500 uppercase">CPF</label>
                                    <input 
                                        type="text" 
                                        placeholder="000.000.000-00"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder:text-slate-700"
                                        onChange={(e) => setFormData({...formData, cpf: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-500 uppercase">E-mail Cadastrado</label>
                                    <input 
                                        type="email" 
                                        placeholder="seu@e-mail.com"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder:text-slate-700"
                                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-xs font-medium text-slate-500 uppercase">ID do Evento (Opcional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="UUID do Evento"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder:text-slate-700"
                                        onChange={(e) => setFormData({...formData, eventoId: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        {message && (
                            <div className={`p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
                                message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                            }`}>
                                {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                <span className="text-sm font-medium">{message.text}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={() => handleSubmit('portability')}
                                disabled={loading || !formData.cpf || !formData.email}
                                className="group p-6 bg-slate-950 border border-slate-800 rounded-2xl text-left hover:border-cyan-500/50 hover:bg-slate-900 transition-all disabled:opacity-50"
                            >
                                <Mail className="w-6 h-6 text-cyan-400 mb-3 group-hover:scale-110 transition-transform" />
                                <h3 className="text-white font-bold mb-1">Portabilidade de Dados</h3>
                                <p className="text-xs text-slate-500 leading-relaxed">Solicite um arquivo com todos os seus dados coletados. O relatório será enviado para o e-mail cadastrado.</p>
                                {loading && <Loader2 className="w-4 h-4 animate-spin mt-4 text-cyan-400" />}
                            </button>

                            <button
                                onClick={() => handleSubmit('forget-me')}
                                disabled={loading || !formData.cpf || !formData.email}
                                className="group p-6 bg-slate-950 border border-slate-800 rounded-2xl text-left hover:border-red-500/50 hover:bg-slate-900 transition-all disabled:opacity-50"
                            >
                                <Trash2 className="w-6 h-6 text-red-400 mb-3 group-hover:scale-110 transition-transform" />
                                <h3 className="text-white font-bold mb-1">Direito ao Esquecimento</h3>
                                <p className="text-xs text-slate-500 leading-relaxed">Solicite a anonimização irreversível dos seus dados pessoais. Esta ação não pode ser desfeita.</p>
                                {loading && <Loader2 className="w-4 h-4 animate-spin mt-4 text-red-400" />}
                            </button>
                        </div>
                    </div>

                    <p className="mt-8 text-center text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                        A2 Eventos • Nexus Control • Compliance Team
                    </p>
                </div>
            </div>
        </div>
    );
}
