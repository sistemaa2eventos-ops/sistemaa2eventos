"use client";

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { User, Briefcase, CreditCard, X, Loader2 } from 'lucide-react';

export default function EmpresaPortal() {
    // Formulário de novo vínculo
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [formData, setFormData] = useState({ nome: '', cpf: '', funcao: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [stats, setStats] = useState({
        cotaTotal: 0,
        totalCredenciados: 0,
        cotaUsadaPerc: 0,
        presentesAgora: 0,
        ecmPendentes: 0
    });

    // Recent logs
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [equipe, setEquipe] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Mock authorization in frontend just for the sake of the connection. 
        // In a real app, this comes from an AuthProvider context or JWT localStorage
        const token = localStorage.getItem('token') || '';
        if (token) {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }

        loadIntelligence();
    }, []);

    const loadIntelligence = async () => {
        setIsLoading(true);
        try {
            // Fetch Dashboard Metrics (Parallel)
            const [resStats, resEquipe] = await Promise.all([
                api.get('/api/portal/empresa/stats'),
                api.get('/api/portal/empresa/colaboradores')
            ]);

            if (resStats.data.success) {
                setStats(resStats.data.stats);
                setRecentActivity(resStats.data.recent_activity || []);
            }

            if (resEquipe.data.success) {
                setEquipe(resEquipe.data.data || []);
            }

        } catch (error) {
            console.error('Erro ao carregar Dashboard API:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const res = await api.post('/api/portal/empresa/colaboradores', formData);
            if (res.data.success) {
                alert('Colaborador cadastrado com sucesso!');
                setIsAddModalOpen(false);
                setFormData({ nome: '', cpf: '', funcao: '' });
                loadIntelligence(); // Recarrega os dados do dashboard
            } else {
                alert(res.data.error || 'Erro ao cadastrar.');
            }
        } catch (error: any) {
            console.error('Erro ao cadastrar colaborador:', error);
            alert(error.response?.data?.error || 'Erro interno ao cadastrar colaborador.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col font-sans">
            {/* Navbar Minimalista */}
            <header className="bg-gray-800 border-b border-blue-900 p-4 flex justify-between items-center shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center font-bold shadow-[0_0_10px_rgba(0,212,255,0.5)]">
                        NZT
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-cyan-400 tracking-wider">PORTAL CORPORATIVO</h1>
                        <p className="text-xs text-gray-400 uppercase tracking-widest">Painel de Fornecedores & Agentes</p>
                    </div>
                </div>
                <div className="text-right hidden sm:block">
                    <button className="text-xs text-red-400 hover:text-red-300 transition-colors">Sair / Encerrar Sessão</button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">

                {/* Top Cards Section */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">

                    {/* Card 1: Cota */}
                    <div className="bg-gray-800/60 border border-blue-900/50 p-6 rounded-2xl backdrop-blur-sm hover:border-cyan-400/30 transition-all duration-300 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <svg className="w-24 h-24 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                        </div>
                        <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Sua Cota Mensal</h3>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-black text-white">{stats.totalCredenciados}</span>
                            <span className="text-lg text-gray-500 pb-1">/ {stats.cotaTotal === 0 ? 'Ilimitado' : stats.cotaTotal}</span>
                        </div>
                        {stats.cotaTotal > 0 && (
                            <div className="w-full bg-gray-700 h-2 mt-4 rounded-full overflow-hidden">
                                <div className={`h-full ${stats.cotaUsadaPerc > 90 ? 'bg-red-500' : 'bg-gradient-to-r from-green-400 to-cyan-400'}`} style={{ width: `${Math.min(stats.cotaUsadaPerc, 100)}%` }}></div>
                            </div>
                        )}
                        <p className="text-xs text-gray-400 mt-2">{stats.cotaUsadaPerc}% da capacidade de credenciamentos.</p>
                    </div>

                    {/* Card 2: PRESENCIAL */}
                    <div className="bg-gray-800/60 border border-blue-900/50 p-6 rounded-2xl backdrop-blur-sm hover:border-green-400/30 transition-all duration-300 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <svg className="w-24 h-24 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </div>
                        <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Ocupação Atual</h3>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-black text-green-400">{stats.presentesAgora}</span>
                            <span className="text-lg text-gray-500 pb-1">Trabalhando</span>
                        </div>
                        <p className="text-xs text-green-400 mt-4 leading-relaxed font-semibold">Equipe com acesso logístico ATIVO no recinto principal.</p>
                    </div>

                    {/* Card 3: Auditoria */}
                    <div className="bg-gray-800/60 border border-blue-900/50 p-6 rounded-2xl backdrop-blur-sm hover:border-orange-400/30 transition-all duration-300 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <svg className="w-24 h-24 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Auditoria ECM</h3>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-black text-orange-400">{stats.ecmPendentes}</span>
                            <span className="text-lg text-gray-500 pb-1">Pendentes</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-4 leading-relaxed">Arquivos/NRs sob análise da Segurança Operacional do Evento.</p>
                    </div>

                    {/* Card 4: Acão */}
                    <div
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-gray-800/60 border border-blue-900/50 p-6 rounded-2xl backdrop-blur-sm flex flex-col justify-center items-center text-center cursor-pointer hover:bg-gray-800 hover:scale-[1.02] transition-all duration-300">
                        <div className="w-16 h-16 rounded-full bg-cyan-400/10 flex items-center justify-center mb-3">
                            <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                        </div>
                        <h3 className="text-cyan-400 font-bold uppercase tracking-widest text-sm">Novo Vínculo</h3>
                        <p className="text-xs text-gray-500 mt-2">Cadastrar Biometria</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Quadro de Funcionarios */}
                    <section className="lg:col-span-2 bg-gray-800/60 border border-blue-900/50 rounded-2xl p-6 backdrop-blur-sm">
                        <div className="flex lg:flex-row flex-col justify-between items-start lg:items-center mb-6 gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-white tracking-wide">Equipe B2B Vinculada</h2>
                                <p className="text-sm text-gray-400">Pessoas autorizadas a entrar sob a sua responsabilidade corporativa.</p>
                            </div>
                            <button className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors border border-gray-600 whitespace-nowrap">
                                Exportar Relatório
                            </button>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-gray-700/50">
                            <table className="w-full text-left text-sm text-gray-400">
                                <thead className="text-xs text-gray-400 uppercase bg-gray-900/70 border-b border-gray-700">
                                    <tr>
                                        <th scope="col" className="px-6 py-4">Status Acesso</th>
                                        <th scope="col" className="px-6 py-4">Nome Completo</th>
                                        <th scope="col" className="px-6 py-4">Função</th>
                                        <th scope="col" className="px-6 py-4 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {equipe.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-gray-500">Nenhum vínculo estabelecido nesta empresa.</td>
                                        </tr>
                                    ) : equipe.map((pessoa) => (
                                        <tr key={pessoa.id} className="bg-gray-800/30 border-b border-gray-700/50 hover:bg-gray-800/80 transition-colors">
                                            <td className="px-6 py-4">
                                                {pessoa.status_acesso === 'checkin_feito' ? (
                                                    <span className="px-2 py-1 text-xs font-bold rounded bg-green-900/40 text-green-400 border border-green-800/50 flex w-fit items-center gap-1">
                                                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                                                        TRABALHANDO
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-900/50 text-gray-400 border border-gray-700">
                                                        OFFLINE
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-white truncate max-w-[200px]">
                                                {pessoa.nome}
                                            </td>
                                            <td className="px-6 py-4 text-gray-300">{pessoa.vinculo_funcao}</td>
                                            <td className="px-6 py-4 text-right">
                                                <button className="text-cyan-400 hover:text-cyan-300 font-medium hover:underline text-sm transition-colors">Visualizar</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-6 rounded-lg bg-blue-900/20 border border-blue-900/50 p-4 flex items-start gap-4">
                            <svg className="w-6 h-6 text-cyan-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-sm text-cyan-300">
                                <strong>Painel Anti-Fraude:</strong> Seus colaboradores dependem da aprovação de documentos (NR) e Facial Edge para transitar livremente. Mantenha os ECMs em dia para evitar bloqueios nas catracas.
                            </p>
                        </div>
                    </section>

                    {/* Timeline de Catracas */}
                    <section className="bg-gray-800/60 border border-blue-900/50 rounded-2xl p-6 backdrop-blur-sm">
                        <h2 className="text-xl font-bold text-white mb-2 tracking-wide">Atividade Recente</h2>
                        <p className="text-sm text-gray-400 mb-6">Últimos disparos de Catraca / Terminal Facial de sua equipe.</p>

                        <div className="space-y-4">
                            {recentActivity.length === 0 ? (
                                <p className="text-gray-500 text-sm text-center py-4">Sem atividade registrada no momento.</p>
                            ) : recentActivity.map((log) => (
                                <div key={log.id} className="flex gap-4 p-3 rounded-xl bg-gray-900/40 border border-gray-700/30 hover:border-gray-600 transition-colors">
                                    <div className="mt-1">
                                        {log.tipo === 'CHECKIN' ? (
                                            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30">
                                                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                                            </div>
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                                                <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-gray-200">{log.pessoas?.nome}</p>
                                        <p className="text-xs text-gray-400 mt-1">{log.tipo_acesso === 'face' ? '🔓 Biometria Facial' : '📱 Código QR'} • {new Date(log.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

            </main>

            {/* Modal Novo Vínculo */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-gray-900 border border-blue-900/50 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative">
                        <div className="flex justify-between items-center p-5 border-b border-gray-800">
                            <div>
                                <h3 className="text-lg font-bold text-white">Sincronizar Novo Colaborador</h3>
                                <p className="text-xs text-gray-400">Insira os dados base para acionar o processo.</p>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleAddSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Nome Completo</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-gray-500" />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        value={formData.nome}
                                        onChange={e => setFormData({ ...formData, nome: e.target.value })}
                                        className="bg-gray-800 border fill-gray-800 border-gray-700 text-white rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full pl-10 p-2.5 transition-colors" placeholder="Nome do participante"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">CPF</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <CreditCard className="h-5 w-5 text-gray-500" />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        maxLength={14}
                                        value={formData.cpf}
                                        onChange={e => setFormData({ ...formData, cpf: e.target.value.replace(/\D/g, '') })}
                                        className="bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full pl-10 p-2.5 transition-colors" placeholder="Apenas números"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Função / Cargo</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Briefcase className="h-5 w-5 text-gray-500" />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        value={formData.funcao}
                                        onChange={e => setFormData({ ...formData, funcao: e.target.value })}
                                        className="bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full pl-10 p-2.5 transition-colors" placeholder="Ex: Montador, Gerente"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium">Cancelar</button>
                                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg transition-all text-sm font-medium flex items-center gap-2">
                                    {isSubmitting ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                                    ) : 'Registrar Vínculo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
