import Link from 'next/link';

export const metadata = {
    title: 'Política de privacidade — NZT Intelligent Control System',
    description: 'Quais dados o NZT coleta, para que usa, com quem compartilha, por quanto tempo guarda e como usa os dados do Google Drive.'
};

const ATUALIZADA_EM = '30 de outubro de 2026';
const CONTATO = 'sistemaa2eventos@gmail.com';

const Secao = ({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) => (
    <section id={id} aria-labelledby={`${id}-t`} className="space-y-3">
        <h2 id={`${id}-t`} className="text-xl font-semibold text-white">{titulo}</h2>
        {children}
    </section>
);

export default function PoliticaDePrivacidade() {
    return (
        <main className="min-h-screen bg-[#020617] text-slate-300 px-4 py-12">
            <article className="max-w-3xl mx-auto space-y-8 leading-relaxed">
                <Link href="/" className="text-sm text-slate-500 hover:text-white">← NZT Intelligent Control System</Link>
                <header className="space-y-2">
                    <h1 className="text-3xl font-bold text-white">Política de privacidade</h1>
                    <p className="text-sm text-slate-500">Atualizada em {ATUALIZADA_EM}</p>
                    <p>
                        Esta política explica como o <b className="text-white">NZT Intelligent Control System</b> (&quot;NZT&quot;), desenvolvido pela
                        A2 Eventos, trata os dados pessoais de quem é cadastrado para trabalhar em eventos e de quem usa o painel, conforme a
                        Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD). Também explica como usamos os dados recebidos do Google.
                    </p>
                </header>

                <Secao id="quem" titulo="1. Quem é responsável">
                    <p>
                        O <b className="text-white">organizador de cada evento</b> decide quais dados pede e para quê, e é o controlador desses dados.
                        A A2 Eventos opera a plataforma em nome do organizador. Dúvidas e pedidos: <a className="text-cyan-400 underline" href={`mailto:${CONTATO}`}>{CONTATO}</a>.
                    </p>
                </Secao>

                <Secao id="dados" titulo="2. Dados que coletamos">
                    <ul className="list-disc pl-6 space-y-1">
                        <li><b className="text-white">Cadastro do colaborador:</b> nome, CPF ou passaporte, e-mail, telefone, data de nascimento, nome da mãe, função, empresa e dias de trabalho.</li>
                        <li><b className="text-white">Foto do rosto (dado biométrico):</b> usada para o reconhecimento facial nos leitores de acesso, somente com o seu consentimento no cadastro.</li>
                        <li><b className="text-white">Documentos enviados:</b> RG/CNH e os exigidos para a função (por exemplo ASO, NR-10, NR-35, certificados), com a data de validade.</li>
                        <li><b className="text-white">Registros de acesso:</b> data e hora de entradas e saídas, leitor ou estação usada, área, pulseira e o resultado (liberado ou negado).</li>
                        <li><b className="text-white">Usuários do painel:</b> nome, e-mail, perfil de acesso e o registro das ações feitas no painel (auditoria).</li>
                    </ul>
                </Secao>

                <Secao id="uso" titulo="3. Para que usamos">
                    <ul className="list-disc pl-6 space-y-1">
                        <li>Credenciar quem vai trabalhar no evento e conferir se os documentos exigidos estão válidos;</li>
                        <li>Liberar ou negar o acesso às áreas do evento e manter a segurança do local;</li>
                        <li>Gerar relatórios de presença, horas trabalhadas e fechamento para o organizador e as empresas contratadas;</li>
                        <li>Avisar a organização sobre ocorrências (documento vencido, leitor sem conexão, pessoa em lista de alerta).</li>
                    </ul>
                    <p>
                        Bases legais (LGPD): execução do contrato de trabalho no evento, cumprimento de obrigação legal (segurança do trabalho),
                        legítimo interesse na segurança do evento e, para a foto do rosto, o seu consentimento (art. 11). Não vendemos dados e não os
                        usamos para publicidade.
                    </p>
                </Secao>

                <Secao id="compartilhamento" titulo="4. Com quem compartilhamos">
                    <ul className="list-disc pl-6 space-y-1">
                        <li>O <b className="text-white">organizador do evento</b> e a <b className="text-white">empresa que cadastrou você</b>, para as finalidades acima;</li>
                        <li>Fornecedores que operam a plataforma: Supabase (banco de dados e armazenamento de arquivos), Hostinger (servidor), Cloudflare (rede e segurança);</li>
                        <li>Google Drive, Telegram e e-mail, somente quando o organizador liga essas integrações (seção 6);</li>
                        <li>Autoridades, quando exigido por lei ou ordem judicial.</li>
                    </ul>
                </Secao>

                <Secao id="retencao" titulo="5. Por quanto tempo guardamos">
                    <p>
                        Os dados ficam guardados durante o evento e pelo prazo definido pelo organizador para prestação de contas e obrigações
                        legais (padrão de 12 meses). Depois disso são apagados ou anonimizados. Você pode pedir a exclusão antes, salvo quando a lei
                        exigir a guarda.
                    </p>
                </Secao>

                <Secao id="google" titulo="6. Dados do Google (integração com o Google Drive)">
                    <p>
                        O administrador de um evento pode conectar uma conta Google para guardar uma <b className="text-white">cópia dos documentos</b> enviados
                        no cadastro. Nesse caso:
                    </p>
                    <ul className="list-disc pl-6 space-y-1">
                        <li>
                            <b className="text-white">O que acessamos:</b> apenas o escopo <code className="text-cyan-300">drive.file</code>, que permite criar e
                            gerenciar somente os arquivos e pastas criados pelo próprio NZT, e o endereço de e-mail da conta, para mostrar no painel qual
                            conta está conectada. O NZT não lê, não lista e não altera nenhum outro arquivo do Drive.
                        </li>
                        <li>
                            <b className="text-white">Como usamos:</b> o NZT cria a pasta &quot;NZT - Documentos&quot; e envia para ela as cópias dos documentos do evento,
                            organizadas por evento, empresa e pessoa. Nada além disso.
                        </li>
                        <li>
                            <b className="text-white">Armazenamento e proteção:</b> a autorização do Google (token) fica guardada somente no servidor, em banco de dados
                            com acesso restrito, e nunca é enviada ao navegador. Os arquivos copiados ficam no Drive da conta conectada, sob controle do dono da conta.
                        </li>
                        <li>
                            <b className="text-white">Compartilhamento:</b> não compartilhamos, vendemos nem transferimos os dados do Google a terceiros, e não os usamos
                            para publicidade nem para treinar modelos de inteligência artificial.
                        </li>
                        <li>
                            <b className="text-white">Como revogar:</b> no painel, em Integrações → &quot;Desconectar&quot;, ou a qualquer momento em
                            <a className="text-cyan-400 underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer"> myaccount.google.com/permissions</a>.
                            Ao desconectar, o token é apagado do servidor; os arquivos já copiados continuam no Drive e podem ser apagados pelo dono da conta.
                        </li>
                    </ul>
                    <p className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5">
                        O uso e a transferência, para qualquer outro aplicativo, das informações recebidas das APIs do Google pelo NZT seguem a
                        <a className="text-cyan-400 underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer"> Política de Dados do Usuário dos Serviços de API do Google</a>,
                        incluindo os requisitos de Uso Limitado.
                    </p>
                </Secao>

                <Secao id="seguranca" titulo="7. Segurança">
                    <p>
                        Conexões criptografadas (HTTPS), acesso ao painel com login e permissões por perfil, registro de auditoria das ações,
                        armazenamento de arquivos com acesso controlado e cópias de segurança do banco de dados.
                    </p>
                </Secao>

                <Secao id="direitos" titulo="8. Seus direitos">
                    <p>
                        Você pode confirmar se tratamos seus dados, acessá-los, corrigi-los, pedir a portabilidade, a anonimização ou a exclusão, e
                        revogar o consentimento da foto do rosto. Use a <Link href="/privacy" className="text-cyan-400 underline">Central de privacidade</Link> ou
                        escreva para <a className="text-cyan-400 underline" href={`mailto:${CONTATO}`}>{CONTATO}</a>. Respondemos em até 15 dias.
                    </p>
                </Secao>

                <Secao id="mudancas" titulo="9. Mudanças nesta política">
                    <p>Quando esta política mudar, a data no topo será atualizada. Mudanças relevantes serão avisadas no próprio cadastro.</p>
                </Secao>
            </article>
        </main>
    );
}
