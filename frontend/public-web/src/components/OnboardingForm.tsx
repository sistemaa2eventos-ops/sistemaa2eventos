'use client';

import { useState, useEffect } from 'react';
import { Camera, CheckCircle, AlertCircle, ShieldCheck, User, Key, Calendar } from 'lucide-react';
import api from '@/lib/api';
import PhotoCapture from './PhotoCapture';
import PhotoEditor from './PhotoEditor';
import { useTranslation } from 'react-i18next';

interface OnboardingFormProps {
    token: string;
    initialData: {
        nome_completo: string;
        email: string;
        nivel_acesso: string;
    };
}

export default function OnboardingForm({ token, initialData }: OnboardingFormProps) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [rawPhoto, setRawPhoto] = useState<string | null>(null);
    const { t } = useTranslation('common');

    const [formData, setFormData] = useState({
        cpf: '',
        nome_mae: '',
        data_nascimento: '',
        senha: '',
        confirmar_senha: '',
        foto_base64: null as string | null
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.senha !== formData.confirmar_senha) {
            setError('As senhas não coincidem');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await api.post(`/auth/onboarding/${token}`, {
                ...formData,
                cpf: formData.cpf.replace(/\D/g, '')
            });
            setSuccess(true);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Erro ao realizar cadastro.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="text-center p-10 bg-slate-900/50 backdrop-blur-2xl rounded-3xl border border-green-500/30 shadow-2xl">
                <div className="w-20 h-20 bg-green-400/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-green-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Cadastro Recebido!</h2>
                <p className="text-slate-400 text-lg">
                    Obrigado, <span className="text-white font-semibold">{initialData.nome_completo}</span>. 
                    Seus dados foram enviados para análise. Assim que o administrador aprovar seu acesso, você receberá uma confirmação por e-mail.
                </p>
                <div className="mt-8 pt-6 border-t border-slate-800 text-slate-500 text-sm flex items-center justify-center gap-2">
                   <ShieldCheck className="w-4 h-4" /> Seus dados estão processados de acordo com a LGPD.
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto bg-slate-950/80 backdrop-blur-3xl rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-slate-800">
                <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Finalizar seu Cadastro</h1>
                <p className="text-slate-500 text-sm">Olá {initialData.nome_completo}, complete os dados abaixo para ativar seu acesso no Painel NZT Control.</p>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                <div className="space-y-4">
                    <div className="flex flex-col items-center justify-center mb-8">
                         <PhotoCapture
                            onPhotoCaptured={(base64) => setRawPhoto(base64)}
                            initialPhoto={formData.foto_base64}
                        />
                         {rawPhoto && (
                            <PhotoEditor
                                image={rawPhoto}
                                onSave={(cropped) => {
                                    setFormData({ ...formData, foto_base64: cropped });
                                    setRawPhoto(null);
                                }}
                                onCancel={() => setRawPhoto(null)}
                            />
                        )}
                        <p className="text-xs text-slate-500 mt-2">Clique na câmera para capturar sua selfie de identificação</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">CPF</label>
                            <input
                                required
                                name="cpf"
                                placeholder="000.000.000-00"
                                value={formData.cpf}
                                onChange={handleInputChange}
                                className="w-full bg-slate-900 border border-slate-800 p-3 rounded-xl text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Data de Nascimento</label>
                            <input
                                required
                                type="date"
                                name="data_nascimento"
                                value={formData.data_nascimento}
                                onChange={handleInputChange}
                                className="w-full bg-slate-900 border border-slate-800 p-3 rounded-xl text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all [color-scheme:dark]"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Nome da Mãe</label>
                            <input
                                required
                                name="nome_mae"
                                placeholder="Nome completo"
                                value={formData.nome_mae}
                                onChange={handleInputChange}
                                className="w-full bg-slate-900 border border-slate-800 p-3 rounded-xl text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Criar Senha</label>
                                <input
                                    required
                                    type="password"
                                    name="senha"
                                    value={formData.senha}
                                    onChange={handleInputChange}
                                    className="w-full bg-slate-900 border border-slate-800 p-3 rounded-xl text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Confirmar</label>
                                <input
                                    required
                                    type="password"
                                    name="confirmar_senha"
                                    value={formData.confirmar_senha}
                                    onChange={handleInputChange}
                                    className="w-full bg-slate-900 border border-slate-800 p-3 rounded-xl text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading || !formData.foto_base64}
                    className="w-full bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {loading ? 'Processando...' : 'FINALIZAR CADASTRO'}
                    {!loading && <CheckCircle className="w-5 h-5" />}
                </button>

                <p className="text-[10px] text-slate-600 text-center uppercase tracking-widest">
                    A2 Eventos & Security Technology - LGPD Compliance
                </p>
            </form>
        </div>
    );
}
