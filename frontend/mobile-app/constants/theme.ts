/**
 * Tokens do NZT Mobile. Fonte única de cor, raio, espaço, fonte e toque.
 * Componentes importam daqui; nunca escrever hex, raio ou espaçamento solto.
 * Tema escuro apenas (ver skill nzt-design-mobile-app).
 */

export const cores = {
  fundo: '#050B18',
  superficie: '#0A1628',
  superficieElevada: '#0F1E37',
  borda: 'rgba(148,163,184,0.16)',
  bordaDestaque: 'rgba(0,212,255,0.35)',
  primaria: '#00D4FF',
  primariaHover: '#33DDFF',
  sucesso: '#00FF88',
  alerta: '#FFB800',
  erro: '#FF3366',
  saida: '#FF8800',
  fiscalizacao: '#A855F7',
  texto: '#E8F4FD',
  textoForte: '#FFFFFF',
  textoSecundario: '#94A3B8',
  textoFraco: '#7A8BA3',
  sobrePrimaria: '#000000',
  sobreErro: '#050B18',
} as const;

export const raios = { controle: 8, cartao: 12, pilula: 999 } as const;

export const espaco = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const fonte = {
  corpo: 'Inter_400Regular',
  corpoMedio: 'Inter_500Medium',
  corpoSemi: 'Inter_600SemiBold',
  titulo: 'SpaceGrotesk_700Bold',
  tituloMedio: 'SpaceGrotesk_500Medium',
} as const;

export const texto = { xs: 12, sm: 13, md: 14, lg: 16, xl: 20, xxl: 24, display: 32 } as const;

export const toque = { minimo: 48 } as const;

export const movimento = { rapido: 150, normal: 200 } as const;

/** Compatibilidade: código legado que lê `Colors.light/dark`. O app é só escuro. */
const paletaEscura = {
  text: cores.texto,
  background: cores.fundo,
  tint: cores.primaria,
  icon: cores.textoSecundario,
  tabIconDefault: cores.textoSecundario,
  tabIconSelected: cores.primaria,
  primary: cores.primaria,
  secondary: cores.fiscalizacao,
  accent: cores.primaria,
  card: cores.superficie,
  border: cores.borda,
};

export const Colors = {
  light: paletaEscura,
  dark: paletaEscura,
};
