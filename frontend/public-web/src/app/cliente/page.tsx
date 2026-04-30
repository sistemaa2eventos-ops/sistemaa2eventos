"use client";

import React, { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';

export default function ClientePortal() {
    const [ticket, setTicket] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);

    // ECM Upload Form State
    const [showEcmForm, setShowEcmForm] = useState(false);
    const [docTipo, setDocTipo] = useState('');
    const [docTitulo, setDocTitulo] = useState('');
    const [docFile, setDocFile] = useState<File | null>(null);

    // Transferência B2C State
    const [transferTokenUrl, setTransferTokenUrl] = useState('');
    const [acceptToken, setAcceptToken] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token') || '';
        if (token) {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }

        // Verifica se é um link mágico de transferência
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const t = params.get('token');
            if (t) setAcceptToken(t);
        }

        loadTicket();
    }, []);

    const loadTicket = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/portal/cliente/meu-ticket');
            if (res.data.success) {
                setTicket(res.data.ticket);
            }
        } catch (error) {
            console.error('Erro ao buscar ticket:', error);
            // Fallback object just for visual debugging if API is absent
            setTicket({
                nome_completo: "Mariana Souza Castro",
                nome_credencial: "Mariana Souza",
                qrcode: "TICKET-A2-MC9220-VALIDO",
                pagamento_validado: true,
                foto_url: null, // Null to trigger the selfie capture block
                eventos: {
                    nome: "Tech Summit 2026",
                    local: "São Paulo Expo",
                }
            });
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Utiliza FileReader para extrair o Base64 imediato da câmera nativa HTML5
     */
    const handleSelfieCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result as string;

            try {
                const res = await api.post('/portal/cliente/selfie', {
                    fotoBase64: base64String
                });
                if (res.data.success) {
                    alert('Biometria Facial enviada e processada com sucesso!');
                    loadTicket(); // Recarrega para obter a foto_url e liberar o QR Code/Pulseira
                }
            } catch (error) {
                alert('Erro ao enviar biometria. Tente novamente.');
                console.error(error);
            } finally {
                setIsUploading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleDocumentUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!docFile || !docTipo || !docTitulo) {
            alert("Preencha todos os campos do documento.");
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('arquivo', docFile);
        formData.append('tipo_doc', docTipo);
        formData.append('titulo', docTitulo);

        try {
            const res = await api.post('/portal/cliente/documento', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                alert('Documento enviado com sucesso! Aguarde a aprovação do evento.');
                setShowEcmForm(false);
                setDocFile(null);
                setDocTitulo('');
                setDocTipo('');
            }
        } catch (error) {
            alert('Erro ao enviar documento. Tente novamente.');
            console.error(error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleTransfer = async () => {
        if (!confirm("Aviso Segurança Especial: Transferir seu ingresso inativará a sua credencial atual (incluindo biometria e bloqueio de catraca). Confirma a perda da titularidade?")) return;

        setIsLoading(true);
        try {
            const res = await api.post('/portal/cliente/transferir');
            if (res.data.success) {
                // Link absoluto para compartilhamento no WhatsApp
                const fullLink = window.location.origin + "/cliente" + res.data.link;
                setTransferTokenUrl(fullLink);
                alert('Transferência gerada! Copie o link e envie ao novo titular.');
                loadTicket(); // Atualiza painel para pendente
            }
        } catch (error: any) {
            alert(error.response?.data?.error || 'Erro ao gerar transferência. Tente novamente.');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAcceptTransfer = async () => {
        setIsUploading(true);
        try {
            const res = await api.post('/portal/cliente/aceitar-transferencia', { token: acceptToken });
            if (res.data.success) {
                alert('TRANSFERÊNCIA ACEITA! O Ingresso agora é de sua titularidade.');
                window.location.href = '/cliente'; // Limpa o token da URL
            }
        } catch (error: any) {
            alert(error.response?.data?.error || 'Link inválido ou já expirado.');
        } finally {
            setIsUploading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const needsSelfie = !ticket?.foto_url;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">

                {/* Card Header Promocional */}
                <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full opacity-10">
                        <svg className="absolute w-64 h-64 -top-12 -left-12 text-white transform rotate-45" fill="currentColor" viewBox="0 0 100 100"><rect width="100" height="100" /></svg>
                    </div>

                    <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
                            <svg className="w-8 h-8 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
                        </div>
                        <h2 className="text-2xl font-black text-white tracking-widest uppercase">E-TICKET A2</h2>
                        <p className="text-blue-200 text-sm font-medium">{ticket?.eventos?.nome || 'Credencial Oficial'}</p>
                    </div>
                </div>

                {/* VISÃO DE ACEITE DE TRANSFERÊNCIA */}
                {acceptToken ? (
                    <div className="p-8 text-center bg-gray-50">
                        <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
                            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Convite de Acesso</h3>
                        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                            Você recebeu um ingresso repassado anti-fraude. Ao clicar em Aceitar, os direitos do titular antigo serão revogados (incluindo biometria) e o ticket será atrelado permanentemente a esta sua conta para o evento em questão.
                        </p>
                        <button
                            onClick={handleAcceptTransfer}
                            disabled={isUploading}
                            className={`w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 ${isUploading ? 'opacity-50' : ''}`}
                        >
                            {isUploading ? 'PROCESSANDO...' : 'ACEITAR TITULARIDADE AGORA'}
                        </button>
                    </div>
                ) : needsSelfie ? (
                    /* PASSO 1: BLOCKER - BIOMETRIA FACIAL OBRIGATÓRIA */
                    <div className="p-8 text-center bg-blue-50/50">
                        <div className="w-20 h-20 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-6">
                            <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Segurança Biométrica</h3>
                        <p className="text-sm text-gray-600 mb-8 leading-relaxed">
                            Para garantir sua segurança e evitar fraudes, o registro do controle de acesso requer uma selfie. Isso acelerará muito sua entrada no evento (Catracas c/ Edge AI).
                        </p>

                        <div className="relative">
                            <button
                                className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isUploading ? (
                                    <span className="animate-pulse">PROCESSANDO BIOMETRIA...</span>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                                        TIRAR SELFIE AGORA
                                    </>
                                )}
                            </button>
                            {/* O segredo do HTML5: Input Opaco em cima do botão */}
                            {!isUploading && (
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="user"
                                    onChange={handleSelfieCapture}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                            )}
                        </div>
                    </div>
                ) : (
                    /* PASSO 2: INGRESSO LIBERADO E ÁREA B2C ATIVA */
                    <div className="p-8">
                        <div className="text-center mb-6">
                            <img src={ticket?.foto_url} alt="Sua Biometria" className="w-20 h-20 rounded-full mx-auto object-cover border-4 border-white shadow-xl -mt-16 mb-4" />
                            <h3 className="text-xl font-bold text-gray-800">{ticket?.nome_completo}</h3>
                            <p className="text-gray-500 font-medium tracking-wide text-sm mt-1">{ticket?.nome_credencial}</p>

                            <div className={`inline-flex mt-4 items-center px-3 py-1 rounded-full text-xs font-bold border ${ticket?.pagamento_validado ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                                {ticket?.pagamento_validado ? 'ACESSO VALIDADO' : 'PAGAMENTO PENDENTE'}
                            </div>
                        </div>

                        {ticket?.pagamento_validado && (
                            <>
                                <div className="relative flex items-center mb-6">
                                    <div className="absolute -left-12 w-8 h-8 bg-gray-50 rounded-full shadow-inner"></div>
                                    <div className="w-full border-t border-dashed border-gray-300"></div>
                                    <div className="absolute -right-12 w-8 h-8 bg-gray-50 rounded-full shadow-inner"></div>
                                </div>

                                <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl border border-gray-100 mb-6">
                                    <div className="w-48 h-48 bg-white border border-gray-200 rounded-xl flex items-center justify-center p-4 shadow-sm relative overflow-hidden">
                                        {/* Mocked QR Code visualization */}
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${ticket?.qrcode || 'TICKET-INVALID'}`} alt="QR Code" className="w-full h-full object-contain" />

                                        {/* Dynamic Scan Line Simulation */}
                                        <div className="absolute top-0 left-0 w-full h-1 bg-cyan-400 shadow-[0_0_10px_#00D4FF] opacity-75 animate-[scan_2s_ease-in-out_infinite]"></div>
                                    </div>
                                    <p className="text-gray-400 mt-4 text-xs font-mono tracking-[0.2em] uppercase">{ticket?.qrcode || 'CODIGO-INDISPONIVEL'}</p>
                                </div>
                            </>
                        )}

                        {!showEcmForm ? (
                            <button
                                onClick={() => setShowEcmForm(true)}
                                className="w-full mt-2 bg-gray-50 hover:bg-gray-100 text-gray-600 font-semibold py-3 rounded-xl border border-gray-200 transition-colors text-sm flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                Enviar Comprovante Especial (Meia, PCD)
                            </button>
                        ) : (
                            <form onSubmit={handleDocumentUpload} className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                                <h4 className="font-bold text-sm text-gray-800">Anexar Documento</h4>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">Tipo de Documento</label>
                                    <select value={docTipo} onChange={e => setDocTipo(e.target.value)} required className="mt-1 w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500">
                                        <option value="">Selecione...</option>
                                        <option value="meia_entrada">Carteira de Estudante (Meia Entrada)</option>
                                        <option value="pcd">Laudo Médico / PCD</option>
                                        <option value="termo_responsabilidade">Termo de Responsabilidade</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">Descrição Breve</label>
                                    <input type="text" value={docTitulo} onChange={e => setDocTitulo(e.target.value)} required placeholder="Ex: Carteira UNE 2026" className="mt-1 w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">Arquivo (PDF, JPG, PNG)</label>
                                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setDocFile(e.target.files?.[0] || null)} required className="mt-1 w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setShowEcmForm(false)} className="flex-1 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-600">Cancelar</button>
                                    <button type="submit" disabled={isUploading} className="flex-1 py-2 bg-blue-600 rounded-lg text-sm font-semibold text-white">
                                        {isUploading ? 'Enviando...' : 'Enviar'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* BLOCO TRANSFERÊNCIA SE SEGURA */}
                        <div className="mt-8 pt-6 border-t border-gray-200">
                            {ticket?.status_ingresso === 'transferencia_pendente' ? (
                                <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                                    <h4 className="flex items-center gap-2 font-bold text-sm text-orange-800 mb-2">
                                        <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                        Ingresso Temporariamente Suspenso
                                    </h4>
                                    <p className="text-xs text-orange-700 mb-3">Você gerou um link de transferência. O ingresso voltará ao normal caso o link expire (1h) e não seja aceito.</p>

                                    {transferTokenUrl && (
                                        <div className="p-2 bg-white rounded-lg border border-orange-200 break-all text-[10px] text-gray-500 font-mono mb-2">
                                            {transferTokenUrl}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={handleTransfer}
                                    className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-3 rounded-xl border border-indigo-200 transition-colors text-sm flex justify-center items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                    Transferir Titularidade (Anti-Fraude)
                                </button>
                            )}
                        </div>

                    </div>
                )}
            </div>

            <p className="mt-8 text-xs text-gray-400 font-medium tracking-wide">Tecnologia por NZT Intelligent Systems</p>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}} />
        </div>
    );
}
