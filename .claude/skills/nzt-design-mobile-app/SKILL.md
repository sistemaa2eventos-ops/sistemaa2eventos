---
name: nzt-design-mobile-app
description: Use ao criar, alterar ou revisar telas e componentes do app nativo NZT (frontend/mobile-app, Expo 54 + React Native 0.81 + expo-router + TypeScript). Garante a identidade do painel NZT em mobile: alvos de toque grandes, safe areas, estados claros, feedback imediato e leitura em 1 segundo, usado em pé e sob pressão.
---

# NZT Mobile App

## 1. Identidade
Mesma família visual do painel (`nzt-design-system`), pensada para uma mão só e uso rápido (portaria, check-in, fiscalização). O resultado de uma ação (liberado, negado, saída) precisa ser **inequívoco em 1 segundo**: cor por função + ícone + texto grande. Tema escuro apenas.

Cor por função: verde = liberado, laranja = saída, vermelho = negado, amarelo = alerta, roxo claro = fiscalização. Cor nunca é enfeite.

## 2. Stack
- Expo ~54, React Native 0.81, React 19.1, TypeScript ~5.9.
- Rotas: **expo-router 6** (arquivos em `app/`), com `@react-navigation/native` 7 por baixo. Criar tela = criar arquivo em `app/`; layouts em `_layout.tsx`.
- Ícones: **`@expo/vector-icons` (Ionicons)**, 20/24dp. Variante preenchida para status e ação, `-outline` para navegação inativa. Não misturar outras famílias.
- Fontes: `Inter` (texto) e `Space Grotesk` (títulos e números), carregadas com `expo-font` (pacotes `@expo-google-fonts/inter` e `@expo-google-fonts/space-grotesk`) e segurando a splash até carregar. **Orbitron está banida.**
- Tokens: arquivo único **`constants/theme.ts`**. Componente nunca usa hex, número de raio ou espaçamento solto: importa de lá. `constants/Colors.ts` é legado: migrar e depois remover. O conteúdo atual de `theme.ts` (template do Expo) deve ser substituído.
- Safe area: `react-native-safe-area-context` `~5.6.0` (já está no `package.json`).
- i18n: i18next + react-i18next + expo-localization, configurado em `config/i18n.ts`, traduções em `locales/{pt-BR,en,es,de}.json`.

## 3. Tokens (`constants/theme.ts`)
```ts
export const cores = {
  fundo: '#050B18', superficie: '#0A1628', superficieElevada: '#0F1E37',
  borda: 'rgba(148,163,184,0.16)', bordaDestaque: 'rgba(0,212,255,0.35)',
  primaria: '#00D4FF', primariaHover: '#33DDFF',
  sucesso: '#00FF88', alerta: '#FFB800', erro: '#FF3366',
  saida: '#FF8800', fiscalizacao: '#A855F7',
  texto: '#E8F4FD', textoForte: '#FFFFFF',
  textoSecundario: '#94A3B8', textoFraco: '#7A8BA3',
  sobrePrimaria: '#000000', sobreErro: '#050B18',
} as const;

export const raios = { controle: 8, cartao: 12, pilula: 999 } as const;
export const espaco = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const fonte = {
  corpo: 'Inter_400Regular', corpoMedio: 'Inter_500Medium', corpoSemi: 'Inter_600SemiBold',
  titulo: 'SpaceGrotesk_700Bold',
} as const;
export const texto = { xs: 12, sm: 13, md: 14, lg: 16, xl: 20, xxl: 24, display: 32 } as const;
export const toque = { minimo: 48 } as const;
export const movimento = { rapido: 150, normal: 200 } as const;
```
- Nada abaixo de 12sp. Números em `fonte.titulo` com `fontVariant: ['tabular-nums']`.
- Raios só 8, 12, 999 e 50%. Bordas 1px. Sem sombra colorida, glow, gradiente decorativo ou neon. `Colors.ts` (`#E0E0E0`, `#90A4AE`, `secondary #7B2FBE` decorativo) não deve ser usado.
- Texto sobre fundo de erro preenchido: `sobreErro` (escuro), nunca branco.
- Roxo só para fiscalização (`#A855F7`). `#7B2FBE` não é usado.
- Proibido introduzir novos hex fora de `theme.ts`.

## 4. Layout e toque
- Flexbox (padrão do RN). `position: 'absolute'` só para badge, overlay e botão flutuante.
- **Alvo de toque mínimo 48dp** (nunca menos de 44). Ícone menor usa `hitSlop`.
- **Safe areas** em todas as telas, incluindo as com barra fixa: topo e rodapé respeitam notch e barra de gestos.
- Ação principal na zona do polegar (rodapé), acima da barra de gestos.
- Listas longas com `FlatList`, nunca `ScrollView` com `.map`. O teclado não pode cobrir o campo ativo.
- Padding lateral único: `espaco.lg` (16dp). Alinhamento à esquerda; centralizado só em feedback e estado vazio.
- Altura: nunca fixa em contêiner de texto (fonte do sistema ampliada não pode cortar).
- Testar em ~360dp de largura.

## 5. Componentes e estados
Reutilizar os existentes antes de criar. Todo componente tocável usa `Pressable` e tem:
- **pressed**: feedback imediato (fundo +8% ou opacidade 0,85),
- **disabled**: opacidade 0,45,
- **loading**: spinner, largura preservada,
- **erro**: borda `erro` + mensagem de texto,
- **vazio**: ícone, título curto, subtítulo com a ação, botão,
- **carregando de tela**: skeleton no formato do conteúdo.

Botão primário: fundo `primaria`, texto `sobrePrimaria`, `minHeight` 48, raio 8. Secundário: contorno `borda`.

**Feedback de resultado** (check-in, check-out, validação): tela cheia verde (liberado), laranja (saída) ou vermelho (negado), com ícone grande e texto de 24–32sp, equivalente ao `FeedbackOverlay` do painel. Status nunca só por cor.

Ação destrutiva: confirmação com a consequência escrita. Cancelar à esquerda, ação à direita.

**Háptico e offline (estado atual):**
- Háptico: `expo-haptics` existe, mas hoje só é usado na barra de abas (`components/haptic-tab.tsx`). Ao adicionar em ações: háptico curto no sucesso e longo no erro.
- Offline: existe. Banco local `expo-sqlite` (`services/offlineService.ts`), sincronização em `services/SyncManager.ts` e estado de rede via `NetInfo` em `app/_layout.tsx`, que mostra a faixa "MODO OFFLINE ATIVO". Manter o estado de conexão discreto e permanente.

## 6. Movimento
150ms (cor, pressed) e 200ms (entrada). Só opacidade e transform. Sem animação infinita decorativa (só indicador ao vivo e loading). Respeitar `AccessibilityInfo.isReduceMotionEnabled`.

## 7. Conteúdo
Português do Brasil, sentence case, frases curtas, verbo + objeto. Sem dados inventados: placeholder `[Nome do participante]`; mock só se pedido e marcado com `// MOCK`. Data `dd/MM/yyyy`, hora `HH:mm`, sempre com locale `pt-BR`.

## 8. Acessibilidade
`accessibilityLabel` em todo botão só com ícone, `accessibilityRole` correto, `accessibilityState` para disabled/selected, contraste ≥ 4,5:1, status nunca só por cor.

## 9. Protocolo
- Alteração: respeitar a estrutura, mexer só no pedido, entregar o arquivo completo sem `// ...resto igual`.
- Checklist: só `theme.ts` · toque ≥ 48dp · safe areas · estados completos · resultado legível em 1 s · `FlatList` · pt-BR · sem dado inventado · parece do mesmo sistema do painel.

## 10. Dívida conhecida
- `constants/Colors.ts` (neon, `#E0E0E0`, `#90A4AE`) e `constants/theme.ts` (template do Expo): consolidar em um único `theme.ts` com os tokens acima.
- Orbitron é citada e não carregada: remover referências.
- Raio e espaçamento não existem hoje: usar `raios` e `espaco`.
- Faixa "MODO OFFLINE ATIVO" em `app/_layout.tsx` usa `#ff4444` e `paddingTop: 40` fixos: trocar por `cores.erro`/`sobreErro` e safe area.
- Alvos de toque abaixo de 44dp: `scanner.tsx` (30×30) e `devices.tsx` (30 e 40).
- Sobras do template Expo: `modal.tsx` ("This is a modal"), `hello-wave` usado em `(tabs)/index.tsx`.
