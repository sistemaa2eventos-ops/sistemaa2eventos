# Padrão de interface — painel NZT

Regras para manter as telas consistentes. Os valores ficam em `frontend/web-admin/src/styles/tokens.js` e o tema
(`styles/theme.js`) já aplica a maior parte sozinho — **não escreva cores, fontes ou bordas à mão**.

## Cores por função

A cor diz o que a coisa é ou faz, igual em todas as telas (`funcao` em `tokens.js`).

| Função | Token | Uso |
|---|---|---|
| Ação / entrada | `funcao.acao`, `funcao.entrada` (ciano) | botão principal, links, foco, check-in |
| Saída | `funcao.saida` (laranja) | check-out, baixa, "saída registrada" |
| Liberado | `funcao.liberado` (verde) | acesso liberado, aprovado, online, salvo |
| Negado | `funcao.negado` (vermelho) | negado, erro, excluir, emergência, offline |
| Alerta | `funcao.alerta` (amarelo) | pendente, atenção, vencendo, ações que mexem nos dados do dia |
| Fiscalização | `funcao.fiscalizacao` (roxo) | fiscalização / auditoria |
| Neutro | `funcao.neutro` | informação sem estado |

Perfis de acesso têm cor própria em `papeis` (admin master = amarelo, operador = verde).
Fundos translúcidos: `tom(cor, 0.12)`.

## Textos

- **Frase, não título**: só a primeira letra maiúscula ("Nova área de acesso", não "Nova Área de Acesso").
- **Sem caixa alta** em rótulos, abas, selos e títulos — inclusive nada de `.toUpperCase()`; use `comoRotulo()`
  (`utils/formatadores.js`) para mostrar valores como `checkin_feito` → "Checkin feito". Siglas continuam em maiúsculas (CPF, QR, API).
- **Sem "&"** em textos de tela: use "e".
- **Título da página = nome no menu lateral**; o subtítulo diz para que a tela serve, em português simples.
- Botão diz o que acontece: "Salvar foto", "Registrar saída" — e a mensagem de retorno usa o mesmo verbo.

## Botões

| Papel | Como |
|---|---|
| Ação principal (1 por área) | `<NeonButton>` (ciano preenchido) |
| Secundária / Cancelar / Fechar / Voltar / Testar | `<Button variant="outlined" sx={botaoSecundario}>` |
| Destrutiva (excluir, desconectar) | `<NeonButton neonColor={funcao.negado}>` (contorno vermelho) |
| Ação que altera dados do dia (reset) | `<NeonButton neonColor={funcao.alerta}>` |
| Ícone em linha de tabela | `sx={acaoTabela}` (neutro); excluir: `sx={acaoTabelaPerigo}` |
| Só ícone (ex.: modo quiosque) | `<IconButton size="small">` com `<Tooltip>` e `aria-label` |

Em modais: Cancelar à esquerda da ação principal (o `DialogActions` do tema já alinha).

## Modais

- Use `<Dialog>` **sem** `PaperProps` de fundo/borda/sombra — o tema define a moldura.
  Exceção: alerta de emergência/segurança pode ter borda vermelha.
- Cabeçalho: `<TituloModal titulo="..." subtitulo="..." onFechar={...} />` (título branco, em frase, com "X").

## Telas de operação (check-in, checkout)

- A tela cabe na janela (`height: { lg: '100vh' }`); só as listas rolam.
- Cabeçalho único (`CabecalhoOperacao`): título, data e hora (o relógio aparece **só aqui**), estação, área e quiosque.
- A lista de registros pode ser aberta em janela separada (`/janela/registros?tipo=checkin|checkout`).

## Antes de publicar

Abrir as telas alteradas no navegador e conferir: sem erro no console, sem bloqueio de CSP, textos sem caixa alta,
botões no papel certo.
