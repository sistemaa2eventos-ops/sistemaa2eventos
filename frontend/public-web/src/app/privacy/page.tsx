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
             const res = await fetch(`/api${endpoint}`, {
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

            // Esquecimento: o servidor só envia o e-mail de confirmação; nada é apagado neste passo
            setMessage({
                type: 'success',
                text: action === 'forget-me'
                    ? 'Se os dados conferirem, enviamos um e-mail com o link de confirmação. O link vale por 30 minutos.'
                    : data.message
            });
        } catch (error: unknown) {
            const messageText = error instanceof Error ? error.message : 'Falha ao processar solicitação';
            setMessage({ type: 'error', text: messageText });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-fundo text-texto-secundario py-12 px-4 selection:bg-primaria/30">
            <div className="max-w-2xl mx-auto">
                <Link href="/" className="inline-flex items-center gap-2 text-texto-fraco hover:text-texto-forte mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Voltar ao Início
                </Link>

                <div className="bg-superficie/80 backdrop-blur-xl border border-borda rounded-3xl p-8 shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primaria via-blue-500 to-purple-600" />
                    
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-primaria/10 rounded-2xl border border-primaria/20">
                            <Shield className="w-8 h-8 text-primaria" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-texto-forte tracking-tight">Central de Privacidade</h1>
                            <p className="text-texto-secundario">Gerencie seus direitos conforme a LGPD (Lei 13.709/18)</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="p-4 bg-superficie-elevada/50 rounded-2xl border border-borda/50">
                            <h2 className="text-texto-forte font-semibold mb-3">Identificação do Titular</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-texto-fraco uppercase">CPF</label>
                                    <input 
                                        type="text" 
                                        placeholder="000.000.000-00"
                                        className="w-full bg-fundo border border-borda rounded-xl p-3 focus:ring-2 focus:ring-primaria outline-none transition-all placeholder:text-texto-fraco"
                                        onChange={(e) => setFormData({...formData, cpf: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-texto-fraco uppercase">E-mail Cadastrado</label>
                                    <input 
                                        type="email" 
                                        placeholder="seu@e-mail.com"
                                        className="w-full bg-fundo border border-borda rounded-xl p-3 focus:ring-2 focus:ring-primaria outline-none transition-all placeholder:text-texto-fraco"
                                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-xs font-medium text-texto-fraco uppercase">ID do Evento (Opcional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="UUID do Evento"
                                        className="w-full bg-fundo border border-borda rounded-xl p-3 focus:ring-2 focus:ring-primaria outline-none transition-all placeholder:text-texto-fraco"
                                        onChange={(e) => setFormData({...formData, eventoId: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        {message && (
                            <div className={`p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
                                message.type === 'success' ? 'bg-sucesso/10 border border-sucesso/20 text-sucesso' : 'bg-erro/10 border border-erro/20 text-erro'
                            }`}>
                                {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                <span className="text-sm font-medium">{message.text}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={() => handleSubmit('portability')}
                                disabled={loading || !formData.cpf || !formData.email}
                                className="group p-6 bg-fundo border border-borda rounded-2xl text-left hover:border-primaria/50 hover:bg-superficie transition-all disabled:opacity-50"
                            >
                                <Mail className="w-6 h-6 text-primaria mb-3 group-hover:scale-110 transition-transform" />
                                <h3 className="text-texto-forte font-bold mb-1">Portabilidade de Dados</h3>
                                <p className="text-xs text-texto-fraco leading-relaxed">Solicite um arquivo com todos os seus dados coletados. O relatório será enviado para o e-mail cadastrado.</p>
                                {loading && <Loader2 className="w-4 h-4 animate-spin mt-4 text-primaria" />}
                            </button>

                            <button
                                onClick={() => handleSubmit('forget-me')}
                                disabled={loading || !formData.cpf || !formData.email}
                                className="group p-6 bg-fundo border border-borda rounded-2xl text-left hover:border-erro/50 hover:bg-superficie transition-all disabled:opacity-50"
                            >
                                <Trash2 className="w-6 h-6 text-erro mb-3 group-hover:scale-110 transition-transform" />
                                <h3 className="text-texto-forte font-bold mb-1">Direito ao Esquecimento</h3>
                                <p className="text-xs text-texto-fraco leading-relaxed">Solicite a anonimização irreversível dos seus dados pessoais. Esta ação não pode ser desfeita.</p>
                                {loading && <Loader2 className="w-4 h-4 animate-spin mt-4 text-erro" />}
                            </button>
                        </div>
                    </div>

                    <p className="mt-8 text-center text-[10px] text-texto-fraco uppercase tracking-widest font-bold">
                        A2 Eventos • Nexus Control • Compliance Team
                    </p>
                </div>
            </div>
        </div>
    );
}
