import { cores } from '../../../styles/tokens';
/**
 * Modelos profissionais pré-prontos de crachás, credenciais e etiquetas.
 * Cada modelo define papel_config e uma lista balanceada de elementos.
 */

export const MODELOS_SISTEMA = [
    {
        id: 'cr80_corporativo_escuro',
        nome: 'Crachá Corporativo VIP',
        categoria: 'cracha',
        descricao: 'Design escuro elegante, tarja neon, foto circular, QR code e dados hierárquicos.',
        papel_config: {
            layout: 'cr80_vertical',
            width: 54,
            height: 86,
            corFundo: '#0B1120'
        },
        elementos: [
            { id: 'm1_tarja_sup', type: 'shape', forma: 'retangulo', x: 0, y: 0, width: 162, height: 18, backgroundColor: cores.primaria, semPreenchimento: false, zIndex: 10, locked: true },
            { id: 'm1_evento', type: 'text', content: '{evento}', x: 9, y: 24, width: 144, height: 22, fontSize: 10, fontWeight: 'bold', color: cores.primaria, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.5, zIndex: 11 },
            { id: 'm1_foto', type: 'foto', content: '{foto_url}', circular: true, x: 45, y: 52, width: 72, height: 72, borderColor: cores.primaria, borderWidth: 2, zIndex: 12 },
            { id: 'm1_nome', type: 'text', content: '{nome_pessoa}', x: 6, y: 132, width: 150, height: 28, fontSize: 15, fontWeight: 'bold', color: cores.textoForte, textAlign: 'center', autoAjuste: true, zIndex: 13 },
            { id: 'm1_funcao_bg', type: 'shape', forma: 'pilula', x: 27, y: 164, width: 108, height: 22, backgroundColor: cores.primaria, semPreenchimento: false, zIndex: 14 },
            { id: 'm1_funcao', type: 'text', content: '{funcao}', x: 27, y: 167, width: 108, height: 18, fontSize: 10, fontWeight: 'bold', color: '#0B1120', textAlign: 'center', textTransform: 'uppercase', zIndex: 15 },
            { id: 'm1_empresa', type: 'text', content: '{empresa}', x: 9, y: 192, width: 144, height: 18, fontSize: 9, fontWeight: 'normal', color: cores.textoSecundario, textAlign: 'center', zIndex: 16 },
            { id: 'm1_divisoria', type: 'line', x: 18, y: 214, width: 126, height: 3, color: cores.superficieElevada, borderColor: cores.superficieElevada, borderWidth: 1, zIndex: 17 },
            { id: 'm1_qr', type: 'qrcode', content: '{qr_code}', x: 53, y: 220, width: 56, height: 56, lockAspectRatio: true, color: '#000000', zIndex: 18 }
        ]
    },
    {
        id: 'cr80_clean_minimalista',
        nome: 'Crachá Clean Branco',
        categoria: 'cracha',
        descricao: 'Visual profissional clean para feiras e congressos. Alto contraste e legibilidade.',
        papel_config: {
            layout: 'cr80_vertical',
            width: 54,
            height: 86,
            corFundo: cores.textoForte
        },
        elementos: [
            { id: 'm2_tarja', type: 'shape', forma: 'retangulo', x: 0, y: 0, width: 162, height: 8, backgroundColor: '#2563EB', semPreenchimento: false, zIndex: 10, locked: true },
            { id: 'm2_evento', type: 'text', content: '{evento}', x: 9, y: 15, width: 144, height: 20, fontSize: 11, fontWeight: 'bold', color: cores.superficieElevada, textAlign: 'center', zIndex: 11 },
            { id: 'm2_foto', type: 'foto', content: '{foto_url}', x: 43, y: 40, width: 76, height: 88, borderRadius: 6, borderColor: cores.textoSuave, borderWidth: 1, zIndex: 12 },
            { id: 'm2_nome', type: 'text', content: '{nome_pessoa}', x: 6, y: 134, width: 150, height: 30, fontSize: 15, fontWeight: 'bold', color: cores.superficie, textAlign: 'center', autoAjuste: true, zIndex: 13 },
            { id: 'm2_funcao', type: 'text', content: '{funcao}', x: 9, y: 164, width: 144, height: 18, fontSize: 11, fontWeight: 'bold', color: '#2563EB', textAlign: 'center', textTransform: 'uppercase', zIndex: 14 },
            { id: 'm2_empresa', type: 'text', content: '{empresa}', x: 9, y: 184, width: 144, height: 18, fontSize: 10, fontWeight: 'normal', color: cores.textoFraco, textAlign: 'center', zIndex: 15 },
            { id: 'm2_qr', type: 'qrcode', content: '{qr_code}', x: 53, y: 206, width: 56, height: 56, lockAspectRatio: true, color: '#000000', zIndex: 16 }
        ]
    },
    {
        id: 'festival_grande_acesso',
        nome: 'Credencial Festival / Evento Grande',
        categoria: 'festival',
        descricao: 'Formato 100 × 140 mm com áreas de destaque para setor, foto, QR code e barras.',
        papel_config: {
            layout: 'festival_100x140',
            width: 100,
            height: 140,
            corFundo: '#050B14'
        },
        elementos: [
            { id: 'm3_topo_bg', type: 'shape', forma: 'retangulo', x: 0, y: 0, width: 300, height: 60, backgroundColor: '#1E1B4B', semPreenchimento: false, zIndex: 10, locked: true },
            { id: 'm3_evento', type: 'text', content: '{evento}', x: 15, y: 15, width: 270, height: 32, fontSize: 18, fontWeight: 'bold', color: cores.primaria, textAlign: 'center', letterSpacing: 2, zIndex: 11 },
            { id: 'm3_setor_bg', type: 'shape', forma: 'pilula', x: 60, y: 72, width: 180, height: 38, backgroundColor: '#F43F5E', semPreenchimento: false, zIndex: 12 },
            { id: 'm3_funcao', type: 'text', content: '{funcao}', x: 60, y: 78, width: 180, height: 26, fontSize: 15, fontWeight: 'bold', color: cores.textoForte, textAlign: 'center', textTransform: 'uppercase', zIndex: 13 },
            { id: 'm3_foto', type: 'foto', content: '{foto_url}', x: 95, y: 125, width: 110, height: 125, borderRadius: 8, borderColor: cores.primaria, borderWidth: 2, zIndex: 14 },
            { id: 'm3_nome', type: 'text', content: '{nome_pessoa}', x: 15, y: 262, width: 270, height: 38, fontSize: 20, fontWeight: 'bold', color: cores.textoForte, textAlign: 'center', autoAjuste: true, zIndex: 15 },
            { id: 'm3_empresa', type: 'text', content: '{empresa}', x: 15, y: 302, width: 270, height: 24, fontSize: 13, fontWeight: 'normal', color: cores.textoSecundario, textAlign: 'center', zIndex: 16 },
            { id: 'm3_qr', type: 'qrcode', content: '{qr_code}', x: 30, y: 334, width: 72, height: 72, lockAspectRatio: true, color: '#000000', zIndex: 17 },
            { id: 'm3_bar', type: 'barcode', content: '{pulseira}', x: 115, y: 342, width: 155, height: 55, exibirTexto: true, zIndex: 18 }
        ]
    },
    {
        id: 'etiqueta_adesiva_termica',
        nome: 'Etiqueta Térmica Zebra (100 × 50 mm)',
        categoria: 'adesiva',
        descricao: 'Formato clássico para etiquetadoras térmicas. Alto contraste P&B, QR e código de barras.',
        papel_config: {
            layout: 'adesiva_100x50',
            width: 100,
            height: 50,
            corFundo: cores.textoForte
        },
        elementos: [
            { id: 'm4_borda', type: 'shape', forma: 'retangulo', semPreenchimento: true, x: 6, y: 6, width: 288, height: 138, borderColor: '#000000', borderWidth: 2, borderRadius: 1.5, zIndex: 10, locked: true },
            { id: 'm4_nome', type: 'text', content: '{nome_pessoa}', x: 16, y: 16, width: 185, height: 36, fontSize: 18, fontWeight: 'bold', color: '#000000', textAlign: 'left', autoAjuste: true, zIndex: 11 },
            { id: 'm4_empresa', type: 'text', content: '{empresa}', x: 16, y: 54, width: 185, height: 22, fontSize: 12, fontWeight: 'normal', color: '#333333', textAlign: 'left', zIndex: 12 },
            { id: 'm4_funcao', type: 'text', content: '{funcao}', x: 16, y: 78, width: 185, height: 22, fontSize: 13, fontWeight: 'bold', color: '#000000', textAlign: 'left', zIndex: 13 },
            { id: 'm4_qr', type: 'qrcode', content: '{qr_code}', x: 208, y: 20, width: 76, height: 76, lockAspectRatio: true, color: '#000000', zIndex: 14 },
            { id: 'm4_linha', type: 'line', x: 16, y: 105, width: 268, height: 2, color: '#000000', borderWidth: 1, zIndex: 15 },
            { id: 'm4_cod', type: 'text', content: 'COD: {pulseira} | CPF: {cpf}', x: 16, y: 112, width: 268, height: 22, fontSize: 10, fontWeight: 'bold', color: '#000000', textAlign: 'center', zIndex: 16 }
        ]
    },
    {
        id: 'cr80_horizontal_cracha',
        nome: 'Crachá PVC Horizontal (86 × 54 mm)',
        categoria: 'cracha',
        descricao: 'Crachá deitado com foto à esquerda, dados centrais e QR code à direita.',
        papel_config: {
            layout: 'cr80_horizontal',
            width: 86,
            height: 54,
            corFundo: cores.textoForte
        },
        elementos: [
            { id: 'm5_topo', type: 'shape', forma: 'retangulo', x: 0, y: 0, width: 258, height: 16, backgroundColor: cores.primaria, semPreenchimento: false, zIndex: 10, locked: true },
            { id: 'm5_evento', type: 'text', content: '{evento}', x: 12, y: 2, width: 234, height: 14, fontSize: 8, fontWeight: 'bold', color: cores.textoForte, textAlign: 'left', textTransform: 'uppercase', zIndex: 11 },
            { id: 'm5_foto', type: 'foto', content: '{foto_url}', x: 14, y: 28, width: 62, height: 76, borderRadius: 6, borderColor: cores.primaria, borderWidth: 1.5, zIndex: 12 },
            { id: 'm5_nome', type: 'text', content: '{nome_pessoa}', x: 84, y: 28, width: 110, height: 30, fontSize: 13, fontWeight: 'bold', color: cores.superficie, textAlign: 'left', autoAjuste: true, zIndex: 13 },
            { id: 'm5_funcao', type: 'text', content: '{funcao}', x: 84, y: 60, width: 110, height: 18, fontSize: 10, fontWeight: 'bold', color: cores.primaria, textAlign: 'left', textTransform: 'uppercase', zIndex: 14 },
            { id: 'm5_empresa', type: 'text', content: '{empresa}', x: 84, y: 80, width: 110, height: 18, fontSize: 9, fontWeight: 'normal', color: cores.textoFraco, textAlign: 'left', zIndex: 15 },
            { id: 'm5_qr', type: 'qrcode', content: '{qr_code}', x: 198, y: 32, width: 48, height: 48, lockAspectRatio: true, color: '#000000', zIndex: 16 }
        ]
    }
];

const LOCAL_STORAGE_KEY = 'nzt_modelos_etiquetas_personalizados';

export const lerModelosSalvos = () => {
    try {
        const salvos = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
        return Array.isArray(salvos) ? salvos : [];
    } catch {
        return [];
    }
};

export const salvarModeloPersonalizado = (nome, descricao, papel_config, elementos) => {
    const novos = lerModelosSalvos();
    const novoModelo = {
        id: `custom_${Date.now()}`,
        nome: nome || 'Meu Modelo Personalizado',
        categoria: 'personalizado',
        descricao: descricao || 'Modelo criado e salvo pelo usuário.',
        dataCriacao: new Date().toLocaleDateString('pt-BR'),
        papel_config: { ...papel_config },
        elementos: [...elementos]
    };
    novos.unshift(novoModelo);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(novos));
    return novoModelo;
};

export const excluirModeloPersonalizado = (id) => {
    const atuais = lerModelosSalvos().filter(m => m.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(atuais));
    return atuais;
};
