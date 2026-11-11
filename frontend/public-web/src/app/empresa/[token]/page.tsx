'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    AlertCircle,
    CheckCircle,
    Clock,
    FileText,
    Loader2,
    Upload,
    Camera,
    Building2,
    Users,
    RefreshCw,
    XCircle,
    SwitchCamera,
    Trash2
} from 'lucide-react';
import api from '@/lib/api';

interface CompanyDoc {
    id: string;
    titulo: string;
    tipo_doc: string;
    status: string;
    data_inclusao: string;
    data_validade?: string | null;
    notas_auditoria?: string | null;
}

interface CompanyData {
    id: string;
    nome: string;
    cnpj?: string;
    servico?: string;
    responsavel?: string;
}

interface BrandingData {
    evento_nome?: string;
    logo_url?: string | null;
    banner_url?: string | null;
}

const TIPOS_DOCUMENTO_EMPRESA = [
    { label: 'Cartão CNPJ', tipo: 'CNPJ' },
    { label: 'Contrato Social / Ato Constitutivo', tipo: 'CONTRATO_SOCIAL' },
    { label: 'Alvará de Funcionamento', tipo: 'ALVARA' },
    { label: 'PGR / PPRA', tipo: 'PGR' },
    { label: 'PCMSO', tipo: 'PCMSO' },
    { label: 'ART / RRT / Laudo Técnico', tipo: 'ART_RRT' },
    { label: 'Apólice de Seguro', tipo: 'SEGURO' },
    { label: 'GFIP / FGTS / Relação de Funcionários', tipo: 'GFIP_FGTS' },
    { label: 'Outro documento', tipo: 'CORPORATIVO' }
];

const LIMITE_BYTES = 7 * 1024 * 1024; // 7MB (em Base64 ~9.4MB, dentro do limite de 10MB do gateway)

const lerArquivoBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

function StatusBadge({ status }: { status: string }) {
    const norm = status === 'rejeitado' ? 'reprovado' : status;
    if (norm === 'aprovado') {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <CheckCircle className="w-3.5 h-3.5" /> Aprovado
            </span>
        );
    }
    if (norm === 'reenvio_solicitado') {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                <RefreshCw className="w-3.5 h-3.5" /> Reenvio solicitado
            </span>
        );
    }
    if (norm === 'reprovado') {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                <XCircle className="w-3.5 h-3.5" /> Reprovado
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5" /> Em análise
        </span>
    );
}

function EmpresaDocumentosView({ token }: { token: string }) {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const [company, setCompany] = useState<CompanyData | null>(null);
    const [branding, setBranding] = useState<BrandingData | null>(null);
    const [documentos, setDocumentos] = useState<CompanyDoc[]>([]);

    // Campos de envio de novo documento
    const [tipoSelecionado, setTipoSelecionado] = useState(TIPOS_DOCUMENTO_EMPRESA[0].label);
    const [tituloCustom, setTituloCustom] = useState('');
    const [dataValidade, setDataValidade] = useState('');
    const [arquivoSelecionado, setArquivoSelecionado] = useState<{
        name: string;
        type: string;
        base64: string;
    } | null>(null);

    // Captura de câmera de documento
    const [cameraAberta, setCameraAberta] = useState(false);
    const [cameraPronta, setCameraPronta] = useState(false);
    const [cameraErro, setCameraErro] = useState<string | null>(null);
    const [camerasDisponiveis, setCamerasDisponiveis] = useState<MediaDeviceInfo[]>([]);
    const [cameraDeviceId, setCameraDeviceId] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const carregarDados = useCallback(async () => {
        if (!token) {
            setError('Identificador de convite ausente.');
            setLoading(false);
            return;
        }
        try {
            const cleanToken = token.trim();
            const res = await api.get(`/public/company/${cleanToken}/documentos`);
            setCompany(res.data.company);
            setBranding(res.data.branding || null);
            setDocumentos(res.data.documentos || []);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Link inválido ou expirado. Solicite um novo link ao administrador.');
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        carregarDados();
    }, [carregarDados]);

    const pararCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setCameraAberta(false);
        setCameraPronta(false);
    }, []);

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    const iniciarCamera = async (deviceIdEspecifico?: string) => {
        setCameraErro(null);
        setCameraPronta(false);
        setCameraAberta(true);

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        try {
            let stream: MediaStream;
            const idAlvo = deviceIdEspecifico !== undefined ? deviceIdEspecifico : cameraDeviceId;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: idAlvo
                        ? { deviceId: { exact: idAlvo }, width: { ideal: 1280 }, height: { ideal: 720 } }
                        : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false
                });
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }

            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => {});
            }

            if (navigator.mediaDevices.enumerateDevices) {
                const all = await navigator.mediaDevices.enumerateDevices();
                const vids = all.filter(d => d.kind === 'videoinput');
                setCamerasDisponiveis(vids);
                const activeTrack = stream.getVideoTracks()[0];
                const currentId = activeTrack?.getSettings?.()?.deviceId;
                if (currentId) setCameraDeviceId(currentId);
            }
        } catch (err: any) {
            setCameraErro('Não foi possível acessar a câmera. Verifique a permissão do navegador ou envie o arquivo em PDF/JPG.');
        }
    };

    const capturarFotoDocumento = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.92);
        setArquivoSelecionado({
            name: `foto_documento_${Date.now()}.jpg`,
            type: 'image/jpeg',
            base64
        });
        pararCamera();
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormError(null);
        setSuccessMsg(null);
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > LIMITE_BYTES) {
            setFormError(`O arquivo ${file.name} excede o limite de 7MB.`);
            return;
        }
        try {
            const base64 = await lerArquivoBase64(file);
            setArquivoSelecionado({
                name: file.name,
                type: file.type || 'application/octet-stream',
                base64
            });
        } catch {
            setFormError('Erro ao ler o arquivo selecionado.');
        }
    };

    const handleSubmitDocumento = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        setSuccessMsg(null);

        if (!arquivoSelecionado) {
            setFormError('Selecione um arquivo (PDF, JPG ou PNG) ou tire uma foto do documento antes de enviar.');
            return;
        }

        const itemTipo = TIPOS_DOCUMENTO_EMPRESA.find(t => t.label === tipoSelecionado) || TIPOS_DOCUMENTO_EMPRESA[0];
        const tituloFinal = tipoSelecionado === 'Outro documento'
            ? (tituloCustom.trim() || 'Documento da Empresa')
            : itemTipo.label;

        try {
            setSubmitting(true);
            const cleanToken = token.trim();
            const res = await api.post(`/public/company/${cleanToken}/documentos`, {
                documentos: [
                    {
                        titulo: tituloFinal,
                        tipo_doc: itemTipo.tipo,
                        data_validade: dataValidade || null,
                        name: arquivoSelecionado.name,
                        type: arquivoSelecionado.type,
                        base64: arquivoSelecionado.base64
                    }
                ]
            });

            setSuccessMsg(res.data?.message || 'Documento enviado com sucesso para análise!');
            setArquivoSelecionado(null);
            setTituloCustom('');
            setDataValidade('');
            await carregarDados();
        } catch (err: any) {
            setFormError(err.response?.data?.error || 'Falha ao enviar o documento. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#020617]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-cyan-500" />
                    <p className="text-cyan-500/60 font-mono text-xs tracking-widest">CARREGANDO PORTAL DA EMPRESA...</p>
                </div>
            </div>
        );
    }

    if (error || !company) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4">
                <div className="max-w-md w-full bg-slate-900 border border-red-500/20 p-10 rounded-[2.5rem] shadow-2xl text-center">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="text-red-500 w-10 h-10" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">Link Indisponível</h1>
                    <p className="text-slate-400 text-sm leading-relaxed mb-6">{error}</p>
                    <p className="text-xs text-slate-500">Solicite um novo link à organização do evento.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#020617] py-10 px-4 sm:px-6 lg:px-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-[#020617]">
            <div className="max-w-3xl mx-auto bg-slate-900/80 backdrop-blur-2xl rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-slate-700/50 overflow-hidden relative">
                {branding?.banner_url && (
                    <div className="w-full h-36 overflow-hidden relative">
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

                {/* Cabeçalho */}
                <div className="p-6 sm:p-8 pb-6 border-b border-slate-800">
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
                                <Image src="/logo.jpg" alt="NZT Logo" width={44} height={44} className="w-full h-full object-contain p-1" unoptimized />
                            </div>
                            <div>
                                <h1 className="text-xl sm:text-2xl font-extrabold text-cyan-400 truncate">
                                    {branding?.evento_nome || 'Portal de Documentação da Empresa'}
                                </h1>
                                <p className="text-slate-400 text-sm flex items-center gap-1.5 mt-0.5">
                                    <Building2 className="w-4 h-4 text-purple-400" />
                                    <span className="text-white font-semibold">{company.nome}</span>
                                    {company.cnpj ? <span className="text-slate-500">• CNPJ: {company.cnpj}</span> : null}
                                </p>
                            </div>
                        </div>

                        <Link
                            href={`/register/${token}`}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 transition-all"
                        >
                            <Users className="w-4 h-4" />
                            Cadastrar Colaboradores
                        </Link>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                        Envie abaixo os documentos corporativos da empresa para validação da auditoria documental do evento.
                    </p>
                </div>

                {/* Corpo */}
                <div className="p-6 sm:p-8 space-y-8">
                    {formError && (
                        <div role="alert" className="p-4 bg-red-900/30 border border-red-500/50 text-red-300 rounded-xl flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
                            <span className="text-sm">{formError}</span>
                        </div>
                    )}

                    {successMsg && (
                        <div role="status" className="p-4 bg-emerald-900/30 border border-emerald-500/40 text-emerald-300 rounded-xl flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
                            <span className="text-sm font-medium">{successMsg}</span>
                        </div>
                    )}

                    {/* Formulário de envio */}
                    <form onSubmit={handleSubmitDocumento} className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/70 space-y-5">
                        <div className="flex items-center gap-2.5 border-b border-slate-700/60 pb-3">
                            <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400">
                                <Upload className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white">Anexar Documento da Empresa</h2>
                                <p className="text-xs text-slate-400">Formatos aceitos: PDF, JPG ou PNG (até 10MB)</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tipo de documento</label>
                                <select
                                    value={tipoSelecionado}
                                    onChange={(e) => setTipoSelecionado(e.target.value)}
                                    className="w-full p-3 bg-slate-900/70 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                                >
                                    {TIPOS_DOCUMENTO_EMPRESA.map((item) => (
                                        <option key={item.label} value={item.label}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Data de validade (se houver)</label>
                                <input
                                    type="date"
                                    value={dataValidade}
                                    onChange={(e) => setDataValidade(e.target.value)}
                                    className="w-full p-3 bg-slate-900/70 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 [color-scheme:dark]"
                                />
                            </div>

                            {tipoSelecionado === 'Outro documento' && (
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nome / Descrição do documento</label>
                                    <input
                                        type="text"
                                        required
                                        value={tituloCustom}
                                        onChange={(e) => setTituloCustom(e.target.value)}
                                        placeholder="Ex: Certidão Negativa de Débitos, Procuração..."
                                        className="w-full p-3 bg-slate-900/70 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Opções: Upload de arquivo ou Câmera */}
                        {!cameraAberta ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <label className="cursor-pointer flex items-center justify-center gap-2.5 p-4 rounded-xl border-2 border-dashed border-cyan-500/40 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-300 font-semibold text-sm transition-all">
                                    <Upload className="w-5 h-5" />
                                    <span>Escolher arquivo (PDF / Foto)</span>
                                    <input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                </label>

                                <button
                                    type="button"
                                    onClick={() => iniciarCamera()}
                                    className="flex items-center justify-center gap-2.5 p-4 rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-semibold text-sm transition-all"
                                >
                                    <Camera className="w-5 h-5" />
                                    <span>Tirar foto do documento</span>
                                </button>
                            </div>
                        ) : (
                            <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-700 space-y-3">
                                <div className="relative w-full max-w-lg mx-auto aspect-[4/3] bg-black rounded-xl overflow-hidden border border-cyan-500/30">
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        onLoadedMetadata={() => setCameraPronta(true)}
                                        onPlaying={() => setCameraPronta(true)}
                                        className="w-full h-full object-cover"
                                    />
                                    {!cameraPronta && !cameraErro && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 gap-2">
                                            <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
                                            <span className="text-xs text-slate-300">Iniciando câmera...</span>
                                        </div>
                                    )}
                                    {cameraErro && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center gap-2">
                                            <AlertCircle className="w-7 h-7 text-red-400" />
                                            <span className="text-xs text-red-300">{cameraErro}</span>
                                        </div>
                                    )}
                                </div>

                                {camerasDisponiveis.length > 1 && (
                                    <div className="max-w-lg mx-auto">
                                        <select
                                            value={cameraDeviceId}
                                            onChange={(e) => {
                                                setCameraDeviceId(e.target.value);
                                                iniciarCamera(e.target.value);
                                            }}
                                            className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                                        >
                                            {camerasDisponiveis.map((cam, idx) => (
                                                <option key={cam.deviceId || idx} value={cam.deviceId}>
                                                    {cam.label || `Câmera ${idx + 1}`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    <button
                                        type="button"
                                        disabled={!cameraPronta}
                                        onClick={capturarFotoDocumento}
                                        className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-sm flex items-center gap-2"
                                    >
                                        <Camera className="w-4 h-4" /> Capturar foto
                                    </button>
                                    {camerasDisponiveis.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const idx = camerasDisponiveis.findIndex(c => c.deviceId === cameraDeviceId);
                                                const next = camerasDisponiveis[(idx + 1) % camerasDisponiveis.length];
                                                if (next) {
                                                    setCameraDeviceId(next.deviceId);
                                                    iniciarCamera(next.deviceId);
                                                }
                                            }}
                                            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold flex items-center gap-1.5"
                                        >
                                            <SwitchCamera className="w-4 h-4" /> Trocar câmera
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={pararCamera}
                                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}

                        {arquivoSelecionado && (
                            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-white truncate">{arquivoSelecionado.name}</p>
                                        <p className="text-xs text-emerald-300">Pronto para envio</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setArquivoSelecionado(null)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                                    title="Remover arquivo"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={submitting || !arquivoSelecionado}
                            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Enviando documento...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Enviar documento para auditoria
                                </>
                            )}
                        </button>
                    </form>

                    {/* Lista de documentos enviados */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-cyan-400" />
                                Documentos enviados pela empresa ({documentos.length})
                            </h3>
                        </div>

                        {documentos.length === 0 ? (
                            <div className="p-8 rounded-2xl bg-slate-800/30 border border-slate-800 text-center">
                                <p className="text-sm text-slate-400">Nenhum documento corporativo enviado até o momento.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {documentos.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                    >
                                        <div className="space-y-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate">{doc.titulo}</p>
                                            <p className="text-xs text-slate-400">
                                                Enviado em {doc.data_inclusao ? new Date(doc.data_inclusao).toLocaleDateString('pt-BR') : '—'}
                                                {doc.data_validade ? ` • Validade: ${doc.data_validade.slice(0, 10).split('-').reverse().join('/')}` : ''}
                                            </p>
                                            {doc.notas_auditoria && (
                                                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 mt-1.5">
                                                    <strong>Observação da auditoria:</strong> {doc.notas_auditoria}
                                                </p>
                                            )}
                                        </div>
                                        <div className="shrink-0">
                                            <StatusBadge status={doc.status} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Fallback() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#020617]">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        </div>
    );
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
    return (
        <Suspense fallback={<Fallback />}>
            <PageInner params={params} />
        </Suspense>
    );
}

async function PageInner({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    return <EmpresaDocumentosView token={token} />;
}

