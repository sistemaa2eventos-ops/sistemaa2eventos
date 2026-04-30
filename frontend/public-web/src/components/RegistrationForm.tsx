'use client';

import { useState } from 'react';
import { Camera, Upload, CheckCircle, AlertCircle, Calendar, ShieldCheck, ChevronRight, User, Briefcase } from 'lucide-react';
import api from '@/lib/api';
import PhotoCapture from './PhotoCapture';
import PhotoEditor from './PhotoEditor';
import { useTranslation } from 'react-i18next';

interface RegistrationFormProps {
    token: string;
    company: {
        id: string;
        nome: string;
        vagas: number;
        datas_disponiveis: string[];
    };
}

export default function RegistrationForm({ token, company }: RegistrationFormProps) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [rawPhoto, setRawPhoto] = useState<string | null>(null);
    const { t } = useTranslation('common');

    const [formData, setFormData] = useState({
        nome: '',
        cpf: '',
        email: '',
        nome_mae: '',
        data_nascimento: '',
        funcao: '',
        dias_trabalho: [] as string[],
        foto_base64: null as string | null,
        documentos: [] as any[]
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const toggleDate = (date: string) => {
        const current = formData.dias_trabalho;
        if (current.includes(date)) {
            setFormData({ ...formData, dias_trabalho: current.filter(d => d !== date) });
        } else {
            setFormData({ ...formData, dias_trabalho: [...current, date] });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const cleanCpf = formData.cpf.replace(/\D/g, '');
            let photoUrl = '';

            // 1. Obter URL pré-assinada se houver foto
            if (formData.foto_base64) {
                try {
                    const { data: urlData } = await api.post(`/public/generate-upload-url/${token}`, {
                        cpf: cleanCpf
                    });

                    if (urlData.success && urlData.uploadUrl) {
                        // 2. Converter base64 para Blob para upload binário
                        const base64Data = formData.foto_base64.split(',')[1];
                        const byteCharacters = atob(base64Data);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], { type: 'image/jpeg' });

                        // 3. Fazer upload direto para o Supabase Storage via PUT
                        const uploadRes = await fetch(urlData.uploadUrl, {
                            method: 'PUT',
                            body: blob,
                            headers: {
                                'Content-Type': 'image/jpeg',
                            }
                        });

                        if (!uploadRes.ok) {
                            throw new Error('Falha ao enviar foto para o servidor.');
                        }

                        photoUrl = urlData.publicUrl || urlData.path; // usar path se publicUrl falhar
                    }
                } catch (uploadErr) {
                    console.error('Erro de upload direto:', uploadErr);
                    // Pode falhar silently e o backend usará foto_base64 fallback
                }
            }

            const payloadData = {
                ...formData,
                cpf: cleanCpf,
            };

            // Se obteve photoUrl via direct upload, remove o base64 gigante do payload
            if (photoUrl) {
                (payloadData as any).foto_url = photoUrl;
                payloadData.foto_base64 = null;
            }

            // 4. Cadastrar
            await api.post(`/public/register/${token}`, payloadData);

            setSuccess(true);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Erro ao realizar cadastro.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="text-center p-10 bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-green-500/30 shadow-2xl">
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-green-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">{t('registration.success_message', { defaultValue: 'Cadastro Realizado!' })}</h2>
                <p className="text-slate-300 text-lg">Seus dados e documentos foram enviados de forma segura e estão sob análise da <span className="text-cyan-400 font-semibold">{company.nome}</span>.</p>
                <div className="mt-8 pt-6 border-t border-slate-700/50 flex items-center justify-center gap-2 text-slate-400 text-sm">
                    <ShieldCheck className="w-4 h-4 text-green-400" /> Seus dados estão protegidos pela LGPD.
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto bg-slate-900/80 backdrop-blur-2xl rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-slate-700/50 overflow-hidden relative">

            {/* Ambient Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-40 bg-gradient-to-b from-cyan-500/10 to-transparent pointer-events-none"></div>

            <div className="p-8 pb-6 border-b border-slate-800 relative z-10">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-tight">
                        {t('registration.title', { defaultValue: 'Credenciamento' })}
                    </h1>
                    <span className="px-4 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 text-sm font-semibold border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                        Vagas: {company.vagas === Infinity ? 'Ilimitado' : company.vagas}
                    </span>
                </div>
                <p className="text-slate-400 text-lg">Área exclusiva para cadastro institucional: <span className="text-white font-medium">{company.nome}</span></p>

                {/* Stepper Progress */}
                <div className="flex items-center mt-8 gap-4">
                    <div className={`flex items-center gap-2 ${step >= 1 ? 'text-cyan-400' : 'text-slate-500'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 1 ? 'bg-cyan-500/20 border border-cyan-500/50' : 'bg-slate-800 border border-slate-700'}`}>1</div>
                        <span className="font-medium text-sm hidden sm:block">Identificação</span>
                    </div>
                    <div className={`flex-1 h-px ${step >= 2 ? 'bg-cyan-500/50' : 'bg-slate-800'}`}></div>
                    <div className={`flex items-center gap-2 ${step >= 2 ? 'text-cyan-400' : 'text-slate-500'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 2 ? 'bg-cyan-500/20 border border-cyan-500/50' : 'bg-slate-800 border border-slate-700'}`}>2</div>
                        <span className="font-medium text-sm hidden sm:block">Profissional & LGPD</span>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-8 relative z-10">
                {error && (
                    <div className="p-4 bg-red-900/30 border border-red-500/50 text-red-400 rounded-xl flex items-center gap-3 backdrop-blur-sm">
                        <AlertCircle className="w-6 h-6 shrink-0" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {/* Passo 1: Dados Pessoais */}
                {step === 1 && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                            <div className="p-2 bg-slate-800 rounded-lg"><User className="w-5 h-5 text-cyan-400" /></div>
                            <h3 className="text-xl font-semibold text-white tracking-tight">Perfil e Biometria</h3>
                        </div>

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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-300">{t('registration.full_name', { defaultValue: 'Nome Completo' })}</label>
                                <input
                                    required
                                    name="nome"
                                    value={formData.nome}
                                    onChange={handleInputChange}
                                    className="w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner"
                                    placeholder="Digite seu nome legal"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-300">{t('registration.document', { defaultValue: 'CPF' })}</label>
                                <input
                                    required
                                    name="cpf"
                                    value={formData.cpf}
                                    onChange={handleInputChange}
                                    className="w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner"
                                    placeholder="000.000.000-00"
                                />
                            </div>

                            <div className="md:col-span-2 space-y-1.5">
                                <label className="block text-sm font-medium text-slate-300">E-mail para Confirmação</label>
                                <input
                                    required
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    className="w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner"
                                    placeholder="seu.email@exemplo.com"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-300">Data de Nascimento</label>
                                <input
                                    required
                                    type="date"
                                    name="data_nascimento"
                                    value={formData.data_nascimento}
                                    onChange={handleInputChange}
                                    className="w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner [color-scheme:dark]"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-300">Nome da Mãe</label>
                                <input
                                    required
                                    name="nome_mae"
                                    value={formData.nome_mae}
                                    onChange={handleInputChange}
                                    className="w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner"
                                    placeholder="Nome completo da mãe para validação"
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                disabled={!formData.foto_base64}
                                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold py-4 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                            >
                                {formData.foto_base64 ? <><Briefcase className="w-5 h-5" /> Continuar para Etapa 2</> : 'A biometria facial é obrigatória para prosseguir'}
                                {formData.foto_base64 && <ChevronRight className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                )}

                {/* Passo 2: Dados Profissionais */}
                {step === 2 && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                            <div className="p-2 bg-slate-800 rounded-lg"><Briefcase className="w-5 h-5 text-cyan-400" /></div>
                            <h3 className="text-xl font-semibold text-white tracking-tight">Atuação e Conformidade</h3>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-300">{t('registration.role', { defaultValue: 'Função/Cargo' })}</label>
                            <input
                                required
                                name="funcao"
                                value={formData.funcao}
                                onChange={handleInputChange}
                                className="w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner"
                                placeholder="Descreva sua atribuição técnica"
                            />
                        </div>

                        <div className="p-5 bg-slate-800/40 border border-slate-700 rounded-2xl">
                            <label className="block text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-cyan-400" /> Período de Acesso Solicitado
                            </label>
                            <div className="flex flex-wrap gap-3">
                                {company.datas_disponiveis.map(date => (
                                    <button
                                        key={date}
                                        type="button"
                                        onClick={() => toggleDate(date)}
                                        className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${formData.dias_trabalho.includes(date)
                                            ? 'bg-cyan-500 text-white border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                                            : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:bg-slate-800'
                                            }`}
                                    >
                                        {new Date(date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                                    </button>
                                ))}
                            </div>
                            {formData.dias_trabalho.length === 0 && (
                                <p className="text-sm text-amber-500 mt-3 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> A seleção de ao menos uma data é obrigatória.</p>
                            )}
                        </div>

                        <div className="p-5 border border-slate-700 rounded-2xl bg-slate-900/60 shadow-inner">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1">
                                <Upload className="w-4 h-4 text-cyan-400" /> Central de Documentos Empresariais (ECM)
                            </label>
                            <p className="text-xs text-slate-500 mb-4">
                                Envio seguro e criptografado de NRs, ASOs e certificações (PDF, JPG, PNG - máx 3MB).
                            </p>

                            <div className="relative border-2 border-dashed border-slate-700 rounded-xl p-6 text-center hover:bg-slate-800/50 transition-colors group">
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => {
                                        const files = Array.from(e.target.files || []);
                                        files.forEach(file => {
                                            if (file.size > 3 * 1024 * 1024) {
                                                alert(`O arquivo ${file.name} ultrapassa o limite de 3MB.`);
                                                return;
                                            }
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    documentos: [...prev.documentos, {
                                                        name: file.name,
                                                        type: file.type,
                                                        base64: reader.result as string
                                                    }]
                                                }));
                                            };
                                            reader.readAsDataURL(file);
                                        });
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <Upload className="w-8 h-8 text-slate-600 group-hover:text-cyan-400 mx-auto mb-2 transition-colors" />
                                <span className="text-sm text-slate-400 font-medium">Toque ou arraste os arquivos aqui</span>
                            </div>

                            {formData.documentos.length > 0 && (
                                <ul className="mt-4 space-y-2">
                                    {formData.documentos.map((doc, idx) => (
                                        <li key={idx} className="text-sm flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700 shadow-sm text-slate-300">
                                            <span className="truncate flex-1 max-w-[200px] sm:max-w-xs">{doc.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        documentos: prev.documentos.filter((_, i) => i !== idx)
                                                    }));
                                                }}
                                                className="text-red-400 hover:text-red-300 text-xs font-semibold px-3 py-1 bg-red-400/10 rounded border border-red-500/20 transition-colors"
                                            >
                                                Excluir
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Strict LGPD Block */}
                        <div className="p-5 border border-cyan-500/30 bg-cyan-900/10 rounded-2xl flex items-start gap-4">
                            <div className="pt-1">
                                <div className="relative flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        required
                                        id="lgpd-consent"
                                        className="peer sr-only"
                                    />
                                    <div className="w-6 h-6 border-2 border-slate-500 rounded bg-slate-900 peer-checked:bg-cyan-500 peer-checked:border-cyan-500 transition-colors flex items-center justify-center">
                                        <CheckCircle className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100" />
                                    </div>
                                </div>
                            </div>
                            <label htmlFor="lgpd-consent" className="text-sm text-slate-300 leading-relaxed cursor-pointer">
                                <strong className="text-white block mb-1">Termo de Consentimento - Tratamento de Dados Pessoais Sensíveis</strong>
                                Declaro de forma livre, inequívoca e informada que li e aceito as <a href="#" className="text-cyan-400 hover:underline">Políticas de Privacidade Governamentais</a>. Autorizo expressamente o tratamento da minha biometria facial e documentos anexados única e exclusivamente para fins de credenciamento, auditoria e controle de acesso rigoroso nas dependências do Evento, em plena conformidade com a da <strong>Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018)</strong>.
                            </label>
                        </div>

                        <div className="flex gap-4 pt-6">
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="w-1/3 bg-slate-800 text-slate-300 font-semibold py-4 rounded-xl hover:bg-slate-700 border border-slate-700 transition-colors"
                            >
                                Voltar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || formData.dias_trabalho.length === 0}
                                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:from-green-400 hover:to-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-3 text-lg tracking-wide"
                            >
                                {loading && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                {loading ? 'Criptografando Dados...' : 'AUTORIZAR INSCRIÇÃO'}
                            </button>
                        </div>
                    </div>
                )}
            </form>
        </div>
    );
}
