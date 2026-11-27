import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Cadastro da empresa · NZT',
  description: 'Link de cadastro da empresa para o evento.',
};

/**
 * Link antigo de documentos da empresa (/empresa/<token>): virou o portal da empresa, com login
 * do responsável (e-mail + chave de acesso). Quem abre um link antigo vai direto para o portal.
 */
const PORTAL_EMPRESA_URL = process.env.NEXT_PUBLIC_PORTAL_EMPRESA_URL || 'https://empresa.nzt.app.br';

export default function EmpresaLinkAntigo() {
    redirect(PORTAL_EMPRESA_URL);
}
