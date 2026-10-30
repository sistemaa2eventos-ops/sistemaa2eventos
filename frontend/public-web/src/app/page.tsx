import Link from 'next/link';
import { ShieldCheck, ScanFace, ClipboardCheck, FolderSync, BarChart3, Mail } from 'lucide-react';

export const metadata = {
    title: 'NZT Intelligent Control System — credenciamento e controle de acesso para eventos',
    description: 'Plataforma de credenciamento, controle de acesso por reconhecimento facial e gestão de documentos das equipes que trabalham em eventos.'
};

const RECURSOS = [
    { icone: ClipboardCheck, titulo: 'Pré-cadastro das equipes', texto: 'Cada empresa contratada recebe um link para cadastrar seus colaboradores, com foto e documentos exigidos para a função (RG/CNH, ASO, NRs).' },
    { icone: ScanFace, titulo: 'Acesso por reconhecimento facial', texto: 'Leitores faciais na entrada liberam apenas quem está aprovado para aquela área e registram entradas e saídas.' },
    { icone: ShieldCheck, titulo: 'Auditoria de documentos', texto: 'A organização confere os documentos, acompanha vencimentos e só libera quem está regular.' },
    { icone: BarChart3, titulo: 'Relatórios de presença', texto: 'Horas trabalhadas, diárias e fechamento por empresa e por função, exportáveis em Excel e PDF.' },
    { icone: FolderSync, titulo: 'Cópia dos documentos no Google Drive', texto: 'Opcional: a organização pode conectar uma conta Google para guardar uma cópia dos documentos enviados numa pasta criada pelo sistema.' }
];

/**
 * Página pública (sem login) que explica o sistema: exigida pelo Google para publicar a
 * integração com o Drive e útil para quem recebe o link de cadastro.
 */
export default function Home() {
    return (
        <main className="min-h-screen bg-[#020617] text-slate-300 px-4 py-12">
            <div className="max-w-3xl mx-auto space-y-10">
                <header className="space-y-4">
                    <p className="text-cyan-400 text-sm font-semibold tracking-wide uppercase">NZT Intelligent Control System</p>
                    <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
                        Credenciamento e controle de acesso para as equipes que trabalham em eventos
                    </h1>
                    <p className="text-lg text-slate-400">
                        O NZT é usado por organizadores de eventos para cadastrar os colaboradores das empresas contratadas
                        (montagem, segurança, limpeza, produção), conferir seus documentos, liberar o acesso por reconhecimento
                        facial ou pulseira e gerar os relatórios de presença do evento.
                    </p>
                </header>

                <section aria-labelledby="recursos" className="space-y-4">
                    <h2 id="recursos" className="text-xl font-semibold text-white">O que o sistema faz</h2>
                    <ul className="grid gap-4 sm:grid-cols-2">
                        {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
                            <li key={titulo} className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60">
                                <Icone className="w-6 h-6 text-cyan-400 mb-3" aria-hidden="true" />
                                <h3 className="text-white font-semibold mb-1">{titulo}</h3>
                                <p className="text-sm text-slate-400">{texto}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                <section aria-labelledby="quem" className="space-y-3">
                    <h2 id="quem" className="text-xl font-semibold text-white">Quem usa</h2>
                    <p>
                        <b className="text-white">Organizadores do evento</b> administram o painel. <b className="text-white">Empresas contratadas</b> cadastram
                        suas equipes pelo link que recebem da organização. <b className="text-white">Colaboradores</b> preenchem o próprio cadastro por esse
                        link — não é preciso criar conta. Se você recebeu um link de cadastro, abra-o diretamente; esta página é apenas informativa.
                    </p>
                </section>

                <section aria-labelledby="google" className="space-y-3">
                    <h2 id="google" className="text-xl font-semibold text-white">Como usamos o Google Drive</h2>
                    <p>
                        A integração é opcional e é ligada pelo administrador do evento. O sistema pede apenas a permissão para
                        <b className="text-white"> criar e gerenciar os arquivos que ele mesmo cria</b> (escopo <code className="text-cyan-300">drive.file</code>):
                        cria a pasta &quot;NZT - Documentos&quot; e guarda nela uma cópia dos documentos enviados no cadastro, organizada por evento,
                        empresa e pessoa. O sistema não lê, não lista e não altera nenhum outro arquivo do Drive da conta, não usa os dados para
                        publicidade e não os compartilha. Detalhes na <Link href="/politica-de-privacidade" className="text-cyan-400 underline">política de privacidade</Link>.
                    </p>
                </section>

                <footer className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm">
                    <nav className="flex flex-wrap gap-x-5 gap-y-2">
                        <Link href="/politica-de-privacidade" className="text-cyan-400 hover:underline">Política de privacidade</Link>
                        <Link href="/privacy" className="text-cyan-400 hover:underline">Central de privacidade (seus direitos)</Link>
                    </nav>
                    <a href="mailto:sistemaa2eventos@gmail.com" className="inline-flex items-center gap-2 text-slate-400 hover:text-white">
                        <Mail className="w-4 h-4" aria-hidden="true" /> sistemaa2eventos@gmail.com
                    </a>
                </footer>
                <p className="text-xs text-slate-600">Desenvolvido por A2 Eventos.</p>
            </div>
        </main>
    );
}
