'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Upload, CheckCircle, AlertCircle, Calendar, ShieldCheck, ChevronRight, User, Briefcase } from 'lucide-react';
import api from '@/lib/api';
import PhotoCapture from './PhotoCapture';
import PhotoEditor from './PhotoEditor';
import { useTranslation } from 'react-i18next';
import { isValidCPF, maskCPF } from '@/utils/validators';

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

interface TipoDocumento {
    id: string;
    nome: string;
    exige_validade: boolean;
}

/** Regras do evento: o mínimo barra o envio; os da função são pedidos e podem vir depois. */
interface DocumentosEvento {
    minimo: TipoDocumento[];
    por_funcao: Record<string, TipoDocumento[]>;
    funcoes: string[];
}

interface RegistrationFormProps {
    token: string;
    company: {
        id: string;
        nome: string;
        vagas: number;
        datas_disponiveis: string[];
        documentos?: DocumentosEvento;
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


interface UploadedDocument {
    name: string;
    type: string;
    base64: string;
    tipo_documento_id?: string;
    label?: string;
    data_validade?: string;
}

const LIMITE_ARQUIVO = 3 * 1024 * 1024;
// Portal da empresa (login do responsável): documentos da empresa e acompanhamento da equipe
const PORTAL_EMPRESA_URL = process.env.NEXT_PUBLIC_PORTAL_EMPRESA_URL || 'https://empresa.nzt.app.br';
// Mesma normalização do servidor ("  limpeza " → "LIMPEZA")
const normalizarFuncao = (f: string) => f.trim().replace(/\s+/g, ' ').toUpperCase();

const lerArquivo = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

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
    const erroRef = useRef<HTMLDivElement>(null);
    const [success, setSuccess] = useState(false);

    // O aviso fica no topo do formulário: no celular, quem clicou em Enviar lá embaixo não o veria
    useEffect(() => {
        if (error) erroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [error]);
    const [rawPhoto, setRawPhoto] = useState<string | null>(null);
    const [showLGPDModal, setShowLGPDModal] = useState(false);
    const { t } = useTranslation('common');

    const LGPD_TEXT = `O tratamento de dados pessoais e biometria facial é realizado com a finalidade exclusiva de segurança, identificação em pontos de acesso, prevenção a fraudes e gestão da equipe no evento. Os dados cadastrais e a foto poderão ser visualizados pela empresa contratante responsável pelo seu credenciamento e pela organização do evento, sendo armazenados em ambiente seguro e sem compartilhamento com terceiros para fins comerciais, nos termos da Lei 13.709/2018 (LGPD).`;

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

    // Um anexo por tipo de documento pedido (id do tipo → arquivo)
    const [docsPorTipo, setDocsPorTipo] = useState<Record<string, UploadedDocument>>({});
    const [funcaoOutra, setFuncaoOutra] = useState(false);

    // Pré-cadastro da planilha da empresa: com o CPF, os dados enviados pela empresa aparecem para conferir.
    // Achado o pré-cadastro, o CPF fica travado; o resto pode ser corrigido antes de enviar.
    const [preCadastro, setPreCadastro] = useState<'nenhum' | 'buscando' | 'encontrado'>('nenhum');
    const cpfConsultadoRef = useRef('');

    // Entrada pelo link da empresa: instruções → janela do CPF (consulta) → formulário
    const [etapaInicio, setEtapaInicio] = useState<'instrucoes' | 'formulario'>(preFilledData ? 'formulario' : 'instrucoes');
    const [cpfJanelaAberta, setCpfJanelaAberta] = useState(false);
    const [cpfJanela, setCpfJanela] = useState('');
    const [cpfJanelaErro, setCpfJanelaErro] = useState('');
    const [cpfJanelaBuscando, setCpfJanelaBuscando] = useState(false);
    const regrasDocs = company.documentos;
    const funcoesDoEvento = regrasDocs?.funcoes || [];
    const docsMinimos = regrasDocs?.minimo || [];
    const docsDaFuncao = regrasDocs?.por_funcao?.[normalizarFuncao(formData.funcao || '')] || [];

    const anexarPorTipo = async (tipo: TipoDocumento, file: File | undefined) => {
        if (!file) return;
        if (file.size > LIMITE_ARQUIVO) {
            setError(`O arquivo ${file.name} ultrapassa o limite de 3MB.`);
            return;
        }
        const base64 = await lerArquivo(file);
        setDocsPorTipo(prev => ({
            ...prev,
            [tipo.id]: { name: file.name, type: file.type, base64, tipo_documento_id: tipo.id, label: tipo.nome, data_validade: prev[tipo.id]?.data_validade }
        }));
    };


    // Janela do CPF: consulta a planilha uma vez. Achou → preenche nome e função; não achou → formulário do zero;
    // já cadastrado pela empresa → avisa e não abre o formulário.
    const consultarCpfNaJanela = async () => {
        const digitos = cpfJanela.replace(/\D/g, '');
        if (!isValidCPF(digitos)) { setCpfJanelaErro('Digite um CPF válido.'); return; }
        setCpfJanelaBuscando(true);
        setCpfJanelaErro('');
        try {
            const { data } = await api.post(`/public/company/${token.trim()}/pre-cadastro`, { cpf: digitos });
            if (data?.status === 'ja_cadastrado') {
                setCpfJanelaErro(`Este CPF já tem cadastro neste evento. Fale com a ${company.nome}.`);
                return;
            }
            cpfConsultadoRef.current = digitos;
            const dados = data?.encontrado ? data.dados || {} : null;
            if (dados) {
                // Só nome e função (o que a planilha traz); o restante a pessoa preenche
                setFormData(prev => ({
                    ...prev,
                    cpf: maskCPF(digitos),
                    nome: dados.nome_completo || prev.nome,
                    funcao: dados.funcao || prev.funcao
                }));
                if (dados.funcao && funcoesDoEvento.length > 0 && !funcoesDoEvento.includes(dados.funcao)) setFuncaoOutra(true);
                setPreCadastro('encontrado');
            } else {
                setFormData(prev => ({ ...prev, cpf: maskCPF(digitos) }));
                setPreCadastro('nenhum');
            }
            setCpfJanelaAberta(false);
            setEtapaInicio('formulario');
        } catch (err) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setCpfJanelaErro(msg || 'Não foi possível consultar agora. Tente de novo.');
        } finally {
            setCpfJanelaBuscando(false);
        }
    };

    // Limpa o que veio da planilha e volta para a janela do CPF
    const descartarPreCadastro = () => {
        cpfConsultadoRef.current = '';
        setPreCadastro('nenhum');
        setFuncaoOutra(false);
        setFormData(prev => ({ ...prev, cpf: '', nome: '', email: '', nome_mae: '', data_nascimento: '', funcao: '' }));
    };

    const corrigirCpf = () => {
        descartarPreCadastro();
        setCpfJanela('');
        setCpfJanelaErro('');
        setEtapaInicio('instrucoes');
        setCpfJanelaAberta(true);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value: rawValue } = e.target;
        if (name === 'cpf') return; // CPF é informado na janela inicial e não muda aqui

        setFormData(prev => ({ ...prev, [name]: rawValue }));
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

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');

        // Documento mínimo do evento (ex.: RG/CNH): sem ele o cadastro não é enviado
        const faltando = docsMinimos.filter(t => !docsPorTipo[t.id]).map(t => t.nome);
        if (faltando.length) {
            setError(`Anexe ${faltando.length === 1 ? 'o documento' : 'os documentos'} ${faltando.join(' e ')} para enviar o cadastro.`);
            return;
        }
        // Sem o aceite LGPD o cadastro não é enviado (o botão já fica desabilitado; esta é a segunda barreira)
        if (!formData.aceite_lgpd) {
            setError('Aceite os termos LGPD para enviar o cadastro.');
            return;
        }
        setLoading(true);

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
                        const base64Data = formData.foto_base64.split(',')[1];
                        const byteCharacters = atob(base64Data);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], { type: 'image/jpeg' });

                        const uploadRes = await fetch(urlData.uploadUrl, {
                            method: 'PUT',
                            body: blob,
                            headers: { 'Content-Type': 'image/jpeg' }
                        });

                        if (!uploadRes.ok) {
                            throw new Error('Falha crítica na transmissão da biometria facial.');
                        }

                        photoUrl = urlData.publicUrl || urlData.uploadUrl.split('?')[0];
                    }
                } catch (err: unknown) {
                    // Auditoria: Erro na foto agora é fatal para evitar cadastros sem biometria
                    const msg = err instanceof Error ? err.message : 'Erro ao processar sua foto facial. Tente novamente.';
                    setError(msg);
                    setLoading(false);
                    return;
                }
            } else if (isRequired('foto')) {
                setError('A foto biometria é obrigatória.');
                setLoading(false);
                return;
            }

            // Validação de CPF Real
            if (!isValidCPF(cleanCpf)) {
                setError('O CPF informado é inválido.');
                setLoading(false);
                return;
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
                // Documentos pedidos (com o tipo) + outros anexos livres; só os da função atual
                documentos: [
                    ...[...docsMinimos, ...docsDaFuncao].map(t => docsPorTipo[t.id]).filter(Boolean),
                    ...formData.documentos
                ],
                aceite_lgpd: formData.aceite_lgpd === true  // Só vai true se o aceite foi marcado
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
            <div className="text-center p-10 bg-superficie-elevada/50 backdrop-blur-xl rounded-3xl border border-sucesso/30 shadow-2xl">
                <div className="w-20 h-20 bg-sucesso/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-sucesso" />
                </div>
                <h2 className="text-3xl font-bold text-texto-forte mb-3 tracking-tight">{t('registration.success_message', { defaultValue: 'Cadastro Realizado!' })}</h2>
                <p className="text-texto-secundario text-lg">Seus dados e documentos foram enviados de forma segura e estão sob análise da <span className="text-primaria font-semibold">{company.nome}</span>.</p>
                <div className="mt-8 pt-6 border-t border-borda/50 flex items-center justify-center gap-2 text-texto-secundario text-sm">
                    <ShieldCheck className="w-4 h-4 text-sucesso" /> Seus dados estão protegidos pela LGPD.
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto bg-superficie/80 backdrop-blur-2xl rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-borda/50 overflow-hidden relative">

            {/* Ambient Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-40 bg-gradient-to-b from-primaria/10 to-transparent pointer-events-none"></div>

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

            <div className="p-6 sm:p-8 pb-6 border-b border-borda relative z-10">
                {/* Header: Logo + Evento + Badge Vagas */}
                <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
                            <Image src="/logo.jpg" alt="NZT Logo" width={44} height={44} className="w-full h-full object-contain p-1" unoptimized />
                        </div>
                        <h1 className="text-xl sm:text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r truncate leading-tight" style={{ backgroundImage: `linear-gradient(to right, var(--brand-primary, #06b6d4), var(--brand-secondary, #3b82f6))` }}>
                            {branding?.evento_nome || "NZT — Intelligent Control"}
                        </h1>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap" style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary, #06b6d4) 10%, transparent)', color: 'var(--brand-primary, #06b6d4)', borderColor: 'color-mix(in srgb, var(--brand-primary, #06b6d4) 25%, transparent)' }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--brand-primary, #06b6d4)' }}></span>
                        {company.vagas === Infinity ? '∞ vagas' : `${company.vagas} vaga${company.vagas !== 1 ? 's' : ''}`}
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-texto-fraco text-sm">Cadastro institucional — <span className="text-texto-secundario font-medium">{company.nome}</span></p>
                    {!preFilledData && (
                        <a
                            href={PORTAL_EMPRESA_URL}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 transition-all"
                        >
                            <Briefcase className="w-3.5 h-3.5" />
                            Responsável: portal da empresa
                        </a>
                    )}
                </div>

                {/* Stepper Progress */}
                <div className="flex items-center mt-7 gap-3">
                    {/* Step 1 */}
                    <div className="flex items-center gap-2.5">
                        <div
                            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all duration-300"
                            style={step > 1
                                ? { backgroundColor: '#10b981', borderColor: '#10b981', color: '#fff' }
                                : step === 1
                                    ? { backgroundColor: 'color-mix(in srgb, var(--brand-primary, #06b6d4) 20%, transparent)', borderColor: 'var(--brand-primary, #06b6d4)', color: 'var(--brand-primary, #06b6d4)' }
                                    : { backgroundColor: '#1e293b', borderColor: '#334155', color: '#64748b' }
                            }
                        >
                            {step > 1 ? <CheckCircle className="w-4 h-4" /> : '1'}
                        </div>
                        <div className="hidden sm:block">
                            <p className="text-xs font-bold leading-none" style={step >= 1 ? { color: step > 1 ? '#10b981' : 'var(--brand-primary, #06b6d4)' } : { color: '#64748b' }}>Etapa 1</p>
                            <p className="text-[11px] text-texto-fraco leading-none mt-0.5">Identificação</p>
                        </div>
                    </div>

                    {/* Connector */}
                    <div className="flex-1 h-0.5 rounded-full transition-all duration-500" style={{ backgroundColor: step >= 2 ? 'color-mix(in srgb, var(--brand-primary, #06b6d4) 40%, transparent)' : '#1e293b' }}></div>

                    {/* Step 2 */}
                    <div className="flex items-center gap-2.5">
                        <div
                            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all duration-300"
                            style={step === 2
                                ? { backgroundColor: 'color-mix(in srgb, var(--brand-primary, #06b6d4) 20%, transparent)', borderColor: 'var(--brand-primary, #06b6d4)', color: 'var(--brand-primary, #06b6d4)' }
                                : { backgroundColor: '#1e293b', borderColor: '#334155', color: '#64748b' }
                            }
                        >2</div>
                        <div className="hidden sm:block">
                            <p className="text-xs font-bold leading-none" style={step >= 2 ? { color: 'var(--brand-primary, #06b6d4)' } : { color: '#64748b' }}>Etapa 2</p>
                            <p className="text-[11px] text-texto-fraco leading-none mt-0.5">Profissional & LGPD</p>
                        </div>
                    </div>
                </div>
            </div>

            {etapaInicio === 'instrucoes' && (
                <div className="p-8 space-y-6 relative z-10">
                    <div className="space-y-3">
                        <h2 className="text-lg font-bold text-texto-forte">Antes de começar</h2>
                        <ol className="list-decimal pl-5 space-y-2 text-sm text-texto-secundario">
                            <li>Clique em <strong className="text-texto-forte">Iniciar pré-cadastro</strong> e digite o seu CPF.</li>
                            <li>Se a {company.nome} já enviou os seus dados, o seu nome e a sua função aparecem preenchidos.</li>
                            <li>Preencha o restante das informações e anexe os documentos pedidos.</li>
                            <li>Confirme a inscrição. Ela fica aguardando a validação da organização do evento.</li>
                        </ol>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCpfJanelaAberta(true)}
                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-texto-forte font-bold py-4 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all text-base tracking-wide"
                    >
                        INICIAR PRÉ-CADASTRO
                    </button>
                </div>
            )}

            {cpfJanelaAberta && (
                <div role="dialog" aria-modal="true" aria-labelledby="cpf-janela-titulo" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-md bg-superficie border border-borda rounded-2xl p-6 space-y-4 shadow-2xl">
                        <h2 id="cpf-janela-titulo" className="text-lg font-bold text-texto-forte">Digite o seu CPF</h2>
                        <input
                            autoFocus
                            inputMode="numeric"
                            value={cpfJanela}
                            onChange={(e) => { setCpfJanela(maskCPF(e.target.value)); setCpfJanelaErro(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' && cpfJanela.replace(/\D/g, '').length === 11 && !cpfJanelaBuscando) consultarCpfNaJanela(); }}
                            placeholder="000.000.000-00"
                            aria-describedby="cpf-janela-ajuda"
                            className="w-full p-3.5 bg-superficie/50 border border-borda rounded-xl text-texto-forte placeholder-texto-fraco focus:ring-2 focus:ring-primaria focus:border-primaria"
                        />
                        <p id="cpf-janela-ajuda" className="text-xs text-texto-fraco">Use o CPF do seu documento. Não precisa de pontos nem traço.</p>
                        {cpfJanelaErro && <p role="alert" className="text-sm text-red-300">{cpfJanelaErro}</p>}
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setCpfJanelaAberta(false)}
                                disabled={cpfJanelaBuscando}
                                className="flex-shrink-0 px-5 py-3 bg-superficie-elevada/80 text-texto-secundario font-semibold rounded-xl border border-borda text-sm disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={consultarCpfNaJanela}
                                disabled={cpfJanelaBuscando || cpfJanela.replace(/\D/g, '').length !== 11}
                                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-texto-forte font-bold py-3 rounded-xl disabled:opacity-40 text-sm"
                            >
                                {cpfJanelaBuscando ? 'Procurando...' : 'Continuar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {etapaInicio === 'formulario' && (
            <form onSubmit={handleSubmit} className="p-8 space-y-8 relative z-10">
                {error && (
                    <div ref={erroRef} role="alert" className="p-4 bg-red-900/30 border border-erro/50 text-erro rounded-xl flex items-center gap-3 backdrop-blur-sm">
                        <AlertCircle className="w-6 h-6 shrink-0" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {/* Passo 1: Dados Pessoais */}
                {step === 1 && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="flex items-center gap-3 border-b border-borda pb-4">
                            <div className="p-2 bg-superficie-elevada rounded-lg"><User className="w-5 h-5 text-primaria" /></div>
                            <h3 className="text-xl font-semibold text-texto-forte tracking-tight">Perfil e Biometria</h3>
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
                            <div className="md:col-span-2 space-y-1.5">
                                <label className="block text-sm font-medium text-texto-secundario">{t('registration.document', { defaultValue: 'CPF' })}</label>
                                <input
                                    required
                                    name="cpf"
                                    inputMode="numeric"
                                    value={formData.cpf}
                                    onChange={handleInputChange}
                                    readOnly
                                    aria-describedby="cpf-ajuda"
                                    className="w-full p-3.5 bg-superficie/50 border border-borda rounded-xl text-texto-forte placeholder-texto-fraco transition-all shadow-inner opacity-70 cursor-not-allowed"
                                    placeholder="000.000.000-00"
                                />
                                <p id="cpf-ajuda" className="text-xs text-texto-fraco">
                                    CPF informado na etapa inicial.
                                </p>
                                {preCadastro === 'encontrado' && (
                                    <div role="status" className="mt-2 p-3 rounded-xl border border-sucesso/40 bg-sucesso/10 text-sm text-green-300 flex flex-wrap items-center justify-between gap-2">
                                        <span className="flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                            Encontramos o seu nome e a sua função enviados pela {company.nome}. Preencha o restante.
                                        </span>
                                        <button type="button" onClick={corrigirCpf} className="text-xs font-semibold underline underline-offset-4 text-green-200 hover:text-texto-forte">
                                            Não é o meu CPF
                                        </button>
                                    </div>
                                )}
                                {preCadastro === 'nenhum' && !preFilledData && (
                                    <div className="mt-2 text-xs text-texto-fraco">
                                        <button type="button" onClick={corrigirCpf} className="underline underline-offset-4 hover:text-texto-forte">
                                            Errei o CPF
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="md:col-span-2 space-y-1.5">
                                <label className="block text-sm font-medium text-texto-secundario">{t('registration.full_name', { defaultValue: 'Nome Completo' })}</label>
                                <input
                                    required
                                    name="nome"
                                    value={formData.nome}
                                    onChange={handleInputChange}
                                    readOnly={!!preFilledData?.nome}
                                    className={`w-full p-3.5 bg-superficie/50 border border-borda rounded-xl text-texto-forte placeholder-texto-fraco focus:ring-2 focus:ring-primaria focus:border-primaria transition-all shadow-inner ${preFilledData?.nome ? 'opacity-70 cursor-not-allowed grayscale' : ''}`}
                                    placeholder="Digite seu nome legal"
                                />
                            </div>

                            <div className="md:col-span-2 space-y-1.5">
                                <label className="block text-sm font-medium text-texto-secundario">E-mail (Opcional)</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    readOnly={!!preFilledData?.email}
                                    className={`w-full p-3.5 bg-superficie/50 border border-borda rounded-xl text-texto-forte placeholder-texto-fraco focus:ring-2 focus:ring-primaria focus:border-primaria transition-all shadow-inner ${preFilledData?.email ? 'opacity-70 cursor-not-allowed grayscale' : ''}`}
                                    placeholder="seu.email@exemplo.com"
                                />
                            </div>

                            {isVisible('data_nascimento') && (
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-texto-secundario">Data de Nascimento</label>
                                <input
                                    required={isRequired('data_nascimento')}
                                    type="date"
                                    name="data_nascimento"
                                    value={formData.data_nascimento}
                                    onChange={handleInputChange}
                                    className="w-full p-3.5 bg-superficie/50 border border-borda rounded-xl text-texto-forte placeholder-texto-fraco focus:ring-2 focus:ring-primaria focus:border-primaria transition-all shadow-inner [color-scheme:dark]"
                                />
                            </div>
                            )}

                            {isVisible('nome_mae') && (
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-texto-secundario">Nome da Mãe</label>
                                <input
                                    required={isRequired('nome_mae')}
                                    name="nome_mae"
                                    value={formData.nome_mae}
                                    onChange={handleInputChange}
                                    className="w-full p-3.5 bg-superficie/50 border border-borda rounded-xl text-texto-forte placeholder-texto-fraco focus:ring-2 focus:ring-primaria focus:border-primaria transition-all shadow-inner"
                                    placeholder="Nome completo da mãe para validação"
                                />
                            </div>
                            )}
                        </div>

                        <div className="pt-4 space-y-3">
                            {!formData.foto_base64 && (
                                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-alerta text-sm">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>Tire ou envie uma foto biométrica para continuar.</span>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                disabled={!formData.foto_base64}
                                className="w-full bg-gradient-to-r from-primaria to-blue-600 text-texto-forte font-bold py-4 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all shadow-[0_0_20px_rgba(6,182,212,0.25)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
                            >
                                <Briefcase className="w-5 h-5" />
                                Continuar para Etapa 2
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Passo 2: Dados Profissionais */}
                {step === 2 && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="flex items-center gap-3 border-b border-borda pb-4">
                            <div className="p-2 bg-superficie-elevada rounded-lg"><Briefcase className="w-5 h-5 text-primaria" /></div>
                            <h3 className="text-xl font-semibold text-texto-forte tracking-tight">Atuação e Conformidade</h3>
                        </div>

                        {isVisible('funcao') && (
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-texto-secundario">{t('registration.role', { defaultValue: 'Função/Cargo' })}</label>
                            {/* Funções configuradas no evento: escolher na lista garante que a regra de documentos da função se aplique */}
                            {funcoesDoEvento.length > 0 && !preFilledData?.funcao && (
                                <select
                                    required={isRequired('funcao') && !funcaoOutra}
                                    value={funcaoOutra ? '__outra__' : formData.funcao}
                                    onChange={(e) => {
                                        const outra = e.target.value === '__outra__';
                                        setFuncaoOutra(outra);
                                        setFormData(prev => ({ ...prev, funcao: outra ? '' : e.target.value }));
                                    }}
                                    className="w-full p-3.5 bg-superficie/50 border border-borda rounded-xl text-texto-forte focus:ring-2 focus:ring-primaria focus:border-primaria transition-all shadow-inner"
                                >
                                    <option value="" disabled>Selecione sua função</option>
                                    {funcoesDoEvento.map(f => <option key={f} value={f}>{f}</option>)}
                                    <option value="__outra__">Outra (digitar)</option>
                                </select>
                            )}
                            {(funcoesDoEvento.length === 0 || funcaoOutra || preFilledData?.funcao) && (
                            <input
                                required={isRequired('funcao')}
                                name="funcao"
                                value={formData.funcao}
                                onChange={handleInputChange}
                                readOnly={!!preFilledData?.funcao}
                                className={`w-full p-3.5 bg-superficie/50 border border-borda rounded-xl text-texto-forte placeholder-texto-fraco focus:ring-2 focus:ring-primaria focus:border-primaria transition-all shadow-inner ${preFilledData?.funcao ? 'opacity-70 cursor-not-allowed grayscale' : ''}`}
                                placeholder="Descreva sua atribuição técnica"
                            />
                            )}
                        </div>
                        )}

                        {(docsMinimos.length > 0 || docsDaFuncao.length > 0) && (
                        <div className="p-6 border border-borda/80 rounded-3xl bg-superficie/40 shadow-inner space-y-4">
                            <div>
                                <p className="flex items-center gap-2 text-sm font-semibold text-texto-secundario">
                                    <span className="p-1.5 bg-primaria/10 rounded-lg"><ShieldCheck className="w-4 h-4 text-primaria" /></span>
                                    Documentos do cadastro
                                </p>
                                <p className="text-xs text-texto-fraco mt-1 ml-8">
                                    Os marcados com * são obrigatórios para enviar. Os demais são pedidos para a sua função e podem ser enviados agora ou depois (PDF, JPG ou PNG, até 3MB).
                                </p>
                            </div>
                            {[...docsMinimos.map(t => ({ t, obrigatorio: true })), ...docsDaFuncao.map(t => ({ t, obrigatorio: false }))].map(({ t, obrigatorio }) => {
                                const anexo = docsPorTipo[t.id];
                                return (
                                    <div key={t.id} className={`p-4 rounded-xl border ${anexo ? 'border-sucesso/40 bg-sucesso/5' : 'border-borda bg-superficie-elevada/40'}`}>
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <span className="text-sm font-medium text-texto">
                                                {t.nome}{obrigatorio && <span className="text-erro" aria-label="obrigatório"> *</span>}
                                            </span>
                                            <label className="relative cursor-pointer text-xs font-semibold px-3 py-2 rounded-lg border border-primaria/40 text-primaria hover:bg-primaria/10">
                                                {anexo ? 'Trocar arquivo' : 'Anexar'}
                                                <input
                                                    type="file"
                                                    accept=".pdf,.jpg,.jpeg,.png"
                                                    aria-label={`Anexar ${t.nome}`}
                                                    onChange={(e) => anexarPorTipo(t, e.target.files?.[0])}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                />
                                            </label>
                                        </div>
                                        {anexo && (
                                            <p className="mt-2 text-xs text-sucesso flex items-center gap-1.5">
                                                <CheckCircle className="w-3.5 h-3.5" /> <span className="truncate">{anexo.name}</span>
                                            </p>
                                        )}
                                        {anexo && t.exige_validade && (
                                            <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
                                                Válido até
                                                <input
                                                    type="date"
                                                    value={anexo.data_validade || ''}
                                                    onChange={(e) => setDocsPorTipo(prev => ({ ...prev, [t.id]: { ...prev[t.id], data_validade: e.target.value } }))}
                                                    className="p-2 bg-superficie/50 border border-borda rounded-lg text-texto-forte"
                                                />
                                            </label>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        )}

                        <div className="bg-superficie-elevada/40 border border-borda/60 rounded-3xl shadow-xl backdrop-blur-sm overflow-hidden">
                            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-borda/40">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-primaria/10 rounded-lg"><Calendar className="w-4 h-4 text-primaria" /></div>
                                    <span className="text-sm font-semibold text-texto">Período de Acesso</span>
                                    {formData.dias_trabalho.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primaria/20 text-primaria border border-primaria/30">
                                            {formData.dias_trabalho.length} selecionada{formData.dias_trabalho.length > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                {company.datas_disponiveis.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const allSelected = company.datas_disponiveis.every(d => formData.dias_trabalho.includes(d));
                                            setFormData(prev => ({
                                                ...prev,
                                                dias_trabalho: allSelected ? [] : [...company.datas_disponiveis]
                                            }));
                                        }}
                                        className="text-xs font-semibold text-primaria hover:text-primaria transition-colors"
                                    >
                                        {company.datas_disponiveis.every(d => formData.dias_trabalho.includes(d)) ? 'Limpar' : 'Selecionar todas'}
                                    </button>
                                )}
                            </div>
                            <div className="p-5 flex flex-wrap gap-2.5">
                                {company.datas_disponiveis.map(date => {
                                    const isSelected = formData.dias_trabalho.includes(date);
                                    const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
                                    return (
                                        <button
                                            key={date}
                                            type="button"
                                            onClick={() => toggleDate(date)}
                                            className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200 transform active:scale-95 ${isSelected
                                                ? 'bg-gradient-to-br from-primaria to-blue-600 text-texto-forte border-primaria/50 shadow-[0_0_16px_rgba(6,182,212,0.35)]'
                                                : 'bg-superficie/60 text-texto-secundario border-borda/50 hover:border-slate-500/80 hover:text-texto hover:bg-superficie-elevada/60'
                                            }`}
                                        >
                                            {displayDate}
                                        </button>
                                    );
                                })}
                            </div>
                            {formData.dias_trabalho.length === 0 && (
                                <div className="px-5 pb-4 flex items-center gap-1.5 text-xs text-alerta">
                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                    Selecione ao menos uma data para prosseguir.
                                </div>
                            )}
                        </div>

                        <div className="p-6 border border-borda/80 rounded-3xl bg-superficie/40 shadow-inner group transition-all hover:border-borda">
                            <label className="flex items-center gap-2 text-sm font-semibold text-texto-secundario mb-1">
                                <div className="p-1.5 bg-primaria/10 rounded-lg"><Upload className="w-4 h-4 text-primaria" /></div>
                                Outros documentos (opcional)
                            </label>
                            <p className="text-xs text-texto-fraco mb-5 ml-8">
                                Envio seguro e criptografado de NRs, ASOs e certificações (PDF, JPG, PNG - máx 3MB).
                            </p>

                            <div className="relative border-2 border-dashed border-borda rounded-xl p-6 text-center hover:bg-superficie-elevada/50 transition-colors group">
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
                                <Upload className="w-8 h-8 text-texto-fraco group-hover:text-primaria mx-auto mb-2 transition-colors" />
                                <span className="text-sm text-texto-secundario font-medium">Toque ou arraste os arquivos aqui</span>
                            </div>

                            {formData.documentos.length > 0 && (
                                <ul className="mt-4 space-y-2">
                                    {formData.documentos.map((doc, idx) => (
                                        <li key={idx} className="text-sm flex justify-between items-center bg-superficie-elevada p-3 rounded-lg border border-borda shadow-sm text-texto-secundario">
                                            <span className="truncate flex-1 max-w-[200px] sm:max-w-xs">{doc.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        documentos: prev.documentos.filter((_, i) => i !== idx)
                                                    }));
                                                }}
                                                className="text-erro hover:text-red-300 text-xs font-semibold px-3 py-1 bg-red-400/10 rounded border border-erro/20 transition-colors"
                                            >
                                                Excluir
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Strict LGPD Block */}
                        <div
                            className={`p-6 border rounded-3xl flex items-start gap-4 transition-all duration-300 cursor-pointer ${
                                formData.aceite_lgpd
                                    ? 'border-primaria/50 bg-cyan-950/30 shadow-[0_0_20px_rgba(6,182,212,0.08)]'
                                    : 'border-borda/80 bg-superficie/40 hover:border-primaria/30 hover:bg-cyan-950/10'
                            }`}
                            onClick={() => setFormData(prev => ({ ...prev, aceite_lgpd: !prev.aceite_lgpd }))}
                        >
                            {/* Checkbox visual — input transparente sobreposto para capturar clique */}
                            <div className="relative flex-shrink-0 mt-0.5">
                                <div className={`w-7 h-7 border-2 rounded-lg flex items-center justify-center transition-all duration-300 ${
                                    formData.aceite_lgpd
                                        ? 'bg-primaria border-primaria shadow-lg shadow-cyan-500/30'
                                        : 'bg-superficie border-borda'
                                }`}>
                                    {formData.aceite_lgpd && (
                                        <CheckCircle className="w-5 h-5 text-texto-forte" />
                                    )}
                                </div>
                                <input
                                    required
                                    type="checkbox"
                                    id="lgpd-consent"
                                    checked={formData.aceite_lgpd}
                                    onChange={(e) => setFormData(prev => ({ ...prev, aceite_lgpd: e.target.checked }))}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                            <div className="text-sm text-texto-secundario leading-relaxed select-none">
                                <strong className="text-texto-forte block mb-1 text-base tracking-tight">Termo de Consentimento - LGPD</strong>
                                Declaro de forma livre, inequívoca e informada que li e aceito as{' '}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setShowLGPDModal(true); }}
                                    className="text-primaria hover:text-primaria font-bold underline decoration-cyan-400/30 underline-offset-4"
                                >
                                    Políticas de Privacidade
                                </button>. Autorizo expressamente o tratamento da minha biometria facial e documentos anexados única e exclusivamente para fins de credenciamento, auditoria e controle de acesso rigoroso, em conformidade com a <strong>Lei 13.709/2018</strong>.
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="flex-shrink-0 px-5 py-4 bg-superficie-elevada/80 text-texto-secundario font-semibold rounded-xl hover:bg-superficie-elevada border border-borda transition-all flex items-center gap-2 text-sm"
                            >
                                <ChevronRight className="w-4 h-4 rotate-180" /> Voltar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || formData.dias_trabalho.length === 0 || !formData.aceite_lgpd}
                                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-texto-forte font-bold py-4 rounded-xl hover:from-green-400 hover:to-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.25)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2.5 text-base tracking-wide"
                            >
                                {loading
                                    ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Enviando...</>
                                    : <><ShieldCheck className="w-5 h-5" /> CONFIRMAR INSCRIÇÃO</>
                                }
                            </button>
                        </div>
                        {(!formData.aceite_lgpd || formData.dias_trabalho.length === 0) && (
                            <p className="text-center text-xs text-texto-fraco pt-1">
                                {!formData.aceite_lgpd && 'Aceite os termos LGPD'}
                                {!formData.aceite_lgpd && formData.dias_trabalho.length === 0 && ' e '}
                                {formData.dias_trabalho.length === 0 && 'selecione ao menos uma data'}
                                {' '}para habilitar o envio.
                            </p>
                        )}
                    </div>
                )}
            </form>
            )}

            {/* LGPD Modal */}
            {showLGPDModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-fundo/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-superficie border border-borda w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-6 border-b border-borda flex items-center justify-between">
                            <h3 className="text-xl font-bold text-texto-forte flex items-center gap-2">
                                <ShieldCheck className="w-6 h-6 text-primaria" />
                                Políticas de Privacidade
                            </h3>
                            <button onClick={() => setShowLGPDModal(false)} className="text-texto-secundario hover:text-texto-forte p-2">&times;</button>
                        </div>
                        <div className="p-8 max-h-[60vh] overflow-y-auto text-texto-secundario space-y-4 text-justify leading-relaxed">
                            <p>{LGPD_TEXT}</p>
                            <p>Ao realizar o credenciamento, você concorda que sua imagem será coletada para fins de identificação segura em nossos pontos de acesso e acompanhamento da sua empresa no evento.</p>
                            {branding?.politica_url && (
                                <div className="pt-4 mt-4 border-t border-borda">
                                    <p className="text-sm mb-2">Para termos específicos do evento, consulte o canal oficial:</p>
                                    <a href={branding.politica_url} target="_blank" rel="noopener noreferrer" className="text-primaria font-bold hover:underline">Ver documento completo &rarr;</a>
                                </div>
                            )}
                        </div>
                        <div className="p-6 bg-superficie/50 border-t border-borda text-center">
                            <button
                                onClick={() => {
                                    setFormData({ ...formData, aceite_lgpd: true });
                                    setShowLGPDModal(false);
                                }}
                                className="w-full bg-primaria hover:bg-primaria text-texto-forte font-bold py-4 rounded-xl transition-all shadow-lg shadow-cyan-600/20"
                            >
                                COMPREENDI E ACEITO
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
