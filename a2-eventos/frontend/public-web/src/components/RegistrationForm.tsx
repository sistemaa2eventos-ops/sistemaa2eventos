'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Upload, CheckCircle, AlertCircle, Calendar, ShieldCheck, ChevronRight, User, Briefcase, Users, Clock } from 'lucide-react';
import api from '@/lib/api';
import PhotoCapture from './PhotoCapture';
import PhotoEditor from './PhotoEditor';
import { useTranslation } from 'react-i18next';

interface BrandingData {
    evento_nome?: string;
    cor_primaria?: string;
    cor_secundaria?: string;
    logo_url?: string;
    banner_url?: string;
    politica_url?: string;
}

interface RequiredFieldsConfig {
    nome?: boolean;
    cpf?: boolean;
    email?: boolean;
    nome_mae?: boolean;
    data_nascimento?: boolean;
    funcao?: boolean;
    foto?: boolean;
    documentos?: boolean;
    dias_trabalho?: boolean;
}

interface RegistrationFormProps {
    token: string;
    company: {
        id: string;
        nome: string;
        vagas: number;
        datas_disponiveis: string[];
    };
    branding?: BrandingData | null;
    requiredFields?: RequiredFieldsConfig | null;
    preFilledData?: {
        nome?: string;
        cpf?: string;
        email?: string;
        funcao?: string;
    } | null;
}

interface EmployeeSummary {
    id: string;
    nome: string;
    funcao?: string;
    status_acesso?: string;
}

interface UploadedDocument {
    name: string;
    type: string;
    base64: string;
}

type ApiErrorShape = {
    response?: {
        status?: number;
        data?: {
            error?: string;
        };
    };
};

const asApiError = (error: unknown): ApiErrorShape => {
    if (typeof error === 'object' && error !== null) {
        return error as ApiErrorShape;
    }

    return {};
};

export default function RegistrationForm({ token, company, branding, requiredFields, preFilledData }: RegistrationFormProps) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [rawPhoto, setRawPhoto] = useState<string | null>(null);
    const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
    const [loadingEmployees, setLoadingEmployees] = useState(true);
    const [showLGPDModal, setShowLGPDModal] = useState(false);
    const { t } = useTranslation('common');

    const LGPD_TEXT = `O Tratamento de Dados Pessoais Sensíveis (Biometria Facial) é realizado com a finalidade exclusiva de segurança, prevenção à fraude e controle de acesso em tempo real. Os dados são armazenados em ambiente criptografado e não são compartilhados com terceiros para fins comerciais. Ao prosseguir, você autoriza o processamento desses dados conforme a Lei 13.709/2018.`;

    // Fetch existing employees
    useEffect(() => {
        if (!preFilledData) { // Apenas se for link de empresa (link global), ignora se for link nominal de pessoa
            const fetchEmployees = async () => {
                try {
                    const cleanToken = token?.trim();
                    const res = await api.get(`/public/company/${cleanToken}/employees`);
                    setEmployees(res.data.employees || []);
                } catch (err: unknown) {
                    if (asApiError(err).response?.status !== 404) {
                        console.error('Failed to load employees', err);
                    }
                } finally {
                    setLoadingEmployees(false);
                }
            };
            fetchEmployees();
        } else {
            setLoadingEmployees(false);
        }
    }, [token, preFilledData]);

    // Helper: campo é obrigatório? nome e cpf = SEMPRE obrigatórios
    const isRequired = (field: keyof RequiredFieldsConfig): boolean => {
        if (field === 'nome' || field === 'cpf') return true; // Travados
        if (!requiredFields) return true; // Sem config = tudo obrigatório (legado)
        return requiredFields[field] !== false;
    };

    // Helper: campo deve ser exibido?
    const isVisible = (field: keyof RequiredFieldsConfig): boolean => {
        if (field === 'nome' || field === 'cpf' || field === 'email') return true; // Sempre visíveis
        return isRequired(field);
    };

    const [formData, setFormData] = useState({
        nome: preFilledData?.nome || '',
        cpf: preFilledData?.cpf || '',
        email: preFilledData?.email || '',
        nome_mae: '',
        data_nascimento: '',
        funcao: preFilledData?.funcao || '',
        dias_trabalho: [] as string[],
        foto_base64: null as string | null,
        documentos: [] as UploadedDocument[],
        aceite_lgpd: false
    });


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const toggleDate = (date: string) => {
        setFormData(prev => {
            const current = prev.dias_trabalho;
            const updated = current.includes(date)
                ? current.filter(d => d !== date)
                : [...current, date];
            return { ...prev, dias_trabalho: updated };
        });
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
                    const cleanToken = token?.trim();
                    const { data: urlData } = await api.post(`/public/generate-upload-url/${cleanToken}`, {
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
                        throw new Error('Falha ao enviar foto para o servidor corporativo.');
                    }

                    photoUrl = urlData.publicUrl || urlData.uploadUrl.split('?')[0];
                    }
                } catch (err) {
                    console.error('Falha no fluxo de upload:', err);
                    // Não travamos o processo total por erro na foto, 
                    // mas podemos logar ou setar um erro se for mandatório.
                }
            }

            const payloadData: {
                nome: string;
                cpf: string;
                email: string;
                nome_mae: string;
                data_nascimento: string;
                funcao: string;
                dias_trabalho: string[];
                foto_base64: string | null;
                documentos: UploadedDocument[];
                aceite_lgpd: boolean;
                foto_url?: string;
            } = {
                ...formData,
                cpf: cleanCpf,
                aceite_lgpd: true  // Always send as boolean
            };

            // Se obteve photoUrl via direct upload, remove o base64 gigante do payload
            if (photoUrl) {
                payloadData.foto_url = photoUrl;
                payloadData.foto_base64 = null;
            }

            // 4. Cadastrar
            const cleanToken = token?.trim();
            await api.post(`/public/register/${cleanToken}`, payloadData);

            setSuccess(true);
        } catch (err: unknown) {
            console.error('Registration error:', err);
            const apiError = asApiError(err);
            
            if (apiError.response?.status === 404) {
                setError('Este link de cadastro expirou ou foi revogado. Por favor, solicite um novo convite ao administrador.');
            } else if (apiError.response?.status === 403) {
                setError('Acesso negado. Sua conta pode ter sido bloqueada ou o limite de vagas foi atingido.');
            } else {
                setError(apiError.response?.data?.error || 'Erro ao realizar cadastro. Verifique os campos e tente novamente.');
            }
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

            {/* Banner do Evento */}
            {branding?.banner_url && (
                <div className="w-full h-40 overflow-hidden relative">
                    <Image
                        src={branding.banner_url}
                        alt="Banner"
                        fill
                        sizes="(max-width: 768px) 100vw, 768px"
                        className="w-full h-full object-cover"
                        unoptimized
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-900/90" />
                </div>
            )}

            <div className="p-8 pb-6 border-b border-slate-800 relative z-10">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <Image
                            src="/logo.jpg"
                            alt="NZT Logo"
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-lg object-contain bg-white/10 p-1 mr-2"
                            unoptimized
                        />
                        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r tracking-tight" style={{ backgroundImage: `linear-gradient(to right, var(--brand-primary), var(--brand-secondary))` }}>
                            {branding?.evento_nome || "NZT - Intelligent Control System"}
                        </h1>
                    </div>
                    <span className="px-4 py-1.5 rounded-full text-sm font-semibold border flex items-center gap-2" style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', color: 'var(--brand-primary)', borderColor: 'color-mix(in srgb, var(--brand-primary) 20%, transparent)' }}>
                        <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--brand-primary)' }}></span>
                        Vagas: {company.vagas === Infinity ? 'Ilimitado' : company.vagas}
                    </span>
                </div>
                <p className="text-slate-400 text-lg">Área exclusiva para cadastro institucional: <span className="text-white font-medium">{company.nome}</span></p>

                {/* Stepper Progress */}
                <div className="flex items-center mt-8 gap-4">
                    <div className={`flex items-center gap-2 ${step >= 1 ? '' : 'text-slate-500'}`} style={step >= 1 ? { color: 'var(--brand-primary)' } : {}}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border`} style={step >= 1 ? { backgroundColor: 'color-mix(in srgb, var(--brand-primary) 20%, transparent)', borderColor: 'color-mix(in srgb, var(--brand-primary) 50%, transparent)' } : { backgroundColor: '#1e293b', borderColor: '#334155' }}>1</div>
                        <span className="font-medium text-sm hidden sm:block">Identificação</span>
                    </div>
                    <div className={`flex-1 h-px`} style={{ backgroundColor: step >= 2 ? 'color-mix(in srgb, var(--brand-primary) 50%, transparent)' : '#1e293b' }}></div>
                    <div className={`flex items-center gap-2 ${step >= 2 ? '' : 'text-slate-500'}`} style={step >= 2 ? { color: 'var(--brand-primary)' } : {}}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border`} style={step >= 2 ? { backgroundColor: 'color-mix(in srgb, var(--brand-primary) 20%, transparent)', borderColor: 'color-mix(in srgb, var(--brand-primary) 50%, transparent)' } : { backgroundColor: '#1e293b', borderColor: '#334155' }}>2</div>
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
                            onPhotoCaptured={(base64, source) => {
                                if (base64 === null) {
                                    setFormData(prev => ({ ...prev, foto_base64: null }));
                                    setRawPhoto(null);
                                    return;
                                }

                                // Se for selfie (camera), pula o editor e salva direto
                                if (source === 'camera') {
                                    setFormData(prev => ({ ...prev, foto_base64: base64 }));
                                    setRawPhoto(null);
                                } else {
                                    // Upload exige refinamento manual no editor
                                    setRawPhoto(base64);
                                }
                            }}
                            initialPhoto={formData.foto_base64}
                        />

                        {rawPhoto && (
                            <PhotoEditor
                                image={rawPhoto}
                                onSave={(cropped) => {
                                    setFormData(prev => ({ ...prev, foto_base64: cropped }));
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
                                    readOnly={!!preFilledData?.nome}
                                    className={`w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner ${preFilledData?.nome ? 'opacity-70 cursor-not-allowed grayscale' : ''}`}
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
                                    readOnly={!!preFilledData?.cpf}
                                    className={`w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner ${preFilledData?.cpf ? 'opacity-70 cursor-not-allowed grayscale' : ''}`}
                                    placeholder="000.000.000-00"
                                />
                            </div>

                            <div className="md:col-span-2 space-y-1.5">
                                <label className="block text-sm font-medium text-slate-300">E-mail (Opcional)</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    readOnly={!!preFilledData?.email}
                                    className={`w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner ${preFilledData?.email ? 'opacity-70 cursor-not-allowed grayscale' : ''}`}
                                    placeholder="seu.email@exemplo.com"
                                />
                            </div>

                            {isVisible('data_nascimento') && (
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-300">Data de Nascimento</label>
                                <input
                                    required={isRequired('data_nascimento')}
                                    type="date"
                                    name="data_nascimento"
                                    value={formData.data_nascimento}
                                    onChange={handleInputChange}
                                    className="w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner [color-scheme:dark]"
                                />
                            </div>
                            )}

                            {isVisible('nome_mae') && (
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-300">Nome da Mãe</label>
                                <input
                                    required={isRequired('nome_mae')}
                                    name="nome_mae"
                                    value={formData.nome_mae}
                                    onChange={handleInputChange}
                                    className="w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner"
                                    placeholder="Nome completo da mãe para validação"
                                />
                            </div>
                            )}
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

                        {isVisible('funcao') && (
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-300">{t('registration.role', { defaultValue: 'Função/Cargo' })}</label>
                            <input
                                required={isRequired('funcao')}
                                name="funcao"
                                value={formData.funcao}
                                onChange={handleInputChange}
                                readOnly={!!preFilledData?.funcao}
                                className={`w-full p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all shadow-inner ${preFilledData?.funcao ? 'opacity-70 cursor-not-allowed grayscale' : ''}`}
                                placeholder="Descreva sua atribuição técnica"
                            />
                        </div>
                        )}

                        <div className="p-6 bg-slate-800/40 border border-slate-700/60 rounded-3xl shadow-xl backdrop-blur-sm group transition-all hover:bg-slate-800/60">
                            <label className="block text-sm font-semibold text-slate-300 mb-5 flex items-center gap-2">
                                <div className="p-1.5 bg-cyan-500/10 rounded-lg"><Calendar className="w-4 h-4 text-cyan-400" /></div>
                                Período de Acesso Solicitado
                            </label>
                            <div className="flex flex-wrap gap-2.5">
                                {company.datas_disponiveis.map(date => {
                                    const isSelected = formData.dias_trabalho.includes(date);
                                    return (
                                        <button
                                            key={date}
                                            type="button"
                                            onClick={() => toggleDate(date)}
                                            className={`px-5 py-3 rounded-2xl text-sm font-bold border transition-all duration-300 transform active:scale-95 ${isSelected
                                                ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                                                : 'bg-slate-900/60 text-slate-400 border-slate-700/50 hover:border-slate-500 hover:text-white'
                                                }`}
                                        >
                                            {new Date(date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                                        </button>
                                    );
                                })}
                            </div>
                            {formData.dias_trabalho.length === 0 && (
                                <p className="text-sm text-amber-400 mt-4 flex items-center gap-1.5 animate-pulse"><AlertCircle className="w-4 h-4" /> A seleção de ao menos uma data é obrigatória.</p>
                            )}
                        </div>

                        <div className="p-6 border border-slate-700/80 rounded-3xl bg-slate-900/40 shadow-inner group transition-all hover:border-slate-600">
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-1">
                                <div className="p-1.5 bg-cyan-500/10 rounded-lg"><Upload className="w-4 h-4 text-cyan-400" /></div>
                                Central de Documentos Empresariais (ECM)
                            </label>
                            <p className="text-xs text-slate-500 mb-5 ml-8">
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
                        <div className="p-6 border border-cyan-500/20 bg-cyan-950/20 rounded-3xl flex items-start gap-4 transition-all hover:bg-cyan-950/30">
                            <div className="pt-1.5">
                                <div className="relative flex items-center">
                                    <input
                                        required
                                        type="checkbox"
                                        id="lgpd-consent"
                                        checked={formData.aceite_lgpd}
                                        onChange={(e) => setFormData({ ...formData, aceite_lgpd: e.target.checked })}
                                        className="peer sr-only"
                                    />
                                    <div className="w-7 h-7 border-2 border-slate-600 rounded-lg bg-slate-900 peer-checked:bg-cyan-500 peer-checked:border-cyan-500 transition-all duration-300 flex items-center justify-center shadow-lg peer-checked:shadow-cyan-500/30">
                                        <CheckCircle className="w-5 h-5 text-white opacity-0 peer-checked:opacity-100 scale-50 peer-checked:scale-100 transition-all duration-300" />
                                    </div>
                                </div>
                            </div>
                            <label htmlFor="lgpd-consent" className="text-sm text-slate-300 leading-relaxed cursor-pointer select-none">
                                <strong className="text-white block mb-1 text-base tracking-tight">Termo de Consentimento - LGPD</strong>
                                Declaro de forma livre, inequívoca e informada que li e aceito as <button type="button" onClick={(e) => { e.preventDefault(); setShowLGPDModal(true); }} className="text-cyan-400 hover:text-cyan-300 font-bold underline decoration-cyan-400/30 underline-offset-4">Políticas de Privacidade</button>. Autorizo expressamente o tratamento da minha biometria facial e documentos anexados única e exclusivamente para fins de credenciamento, auditoria e controle de acesso rigoroso, em conformidade com a <strong>Lei 13.709/2018</strong>.
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
                                disabled={loading || formData.dias_trabalho.length === 0 || !formData.aceite_lgpd}
                                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:from-green-400 hover:to-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-3 text-lg tracking-wide"
                            >
                                {loading && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                                {loading ? 'Criptografando Dados...' : 'AUTORIZAR INSCRIÇÃO'}
                            </button>
                        </div>
                    </div>
                )}
            </form>

            {/* LGPD Modal */}
            {showLGPDModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <ShieldCheck className="w-6 h-6 text-cyan-400" />
                                Políticas de Privacidade
                            </h3>
                            <button onClick={() => setShowLGPDModal(false)} className="text-slate-400 hover:text-white p-2">&times;</button>
                        </div>
                        <div className="p-8 max-h-[60vh] overflow-y-auto text-slate-300 space-y-4 text-justify leading-relaxed">
                            <p>{LGPD_TEXT}</p>
                            <p>Ao realizar o credenciamento, você concorda que sua imagem será coletada para fins de identificação segura em nossos pontos de acesso.</p>
                            {branding?.politica_url && (
                                <div className="pt-4 mt-4 border-t border-slate-800">
                                    <p className="text-sm mb-2">Para termos específicos do evento, consulte o canal oficial:</p>
                                    <a href={branding.politica_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 font-bold hover:underline">Ver documento completo &rarr;</a>
                                </div>
                            )}
                        </div>
                        <div className="p-6 bg-slate-900/50 border-t border-slate-800 text-center">
                            <button
                                onClick={() => {
                                    setFormData({ ...formData, aceite_lgpd: true });
                                    setShowLGPDModal(false);
                                }}
                                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-cyan-600/20"
                            >
                                COMPREENDI E ACEITO
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Listagem de Colaboradores Existentes (Aprovados/Pendentes) */}
            {!preFilledData && (
                <div className="border-t border-slate-800 bg-slate-900/40 p-8 rounded-b-3xl">
                    <div className="flex items-center gap-3 mb-6">
                        <Users className="w-5 h-5 text-slate-400" />
                        <h3 className="text-lg font-semibold text-slate-300">Equipe Pré-Cadastrada</h3>
                    </div>

                    {loadingEmployees ? (
                        <div className="flex justify-center p-4">
                            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : employees.length === 0 ? (
                        <div className="text-center p-6 bg-slate-800/20 rounded-2xl border border-slate-800">
                            <p className="text-slate-500 text-sm">Nenhum funcionário cadastrado ainda.</p>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {employees.map(emp => (
                                <div key={emp.id} className="flex items-center justify-between p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl hover:bg-slate-800/60 transition-colors">
                                    <div>
                                        <p className="font-medium text-white">{emp.nome}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{emp.funcao || 'N/D'}</p>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5
                                        ${emp.status_acesso === 'aprovado' || emp.status_acesso === 'liberado'
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : emp.status_acesso === 'bloqueado' || emp.status_acesso === 'rejeitado'
                                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}
                                    >
                                        {(emp.status_acesso === 'aprovado' || emp.status_acesso === 'liberado') && <CheckCircle className="w-3 h-3" />}
                                        {(emp.status_acesso === 'bloqueado' || emp.status_acesso === 'rejeitado') && <AlertCircle className="w-3 h-3" />}
                                        {(emp.status_acesso === 'pendente') && <Clock className="w-3 h-3" />}
                                        
                                        {(emp.status_acesso || 'pendente').toUpperCase()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
