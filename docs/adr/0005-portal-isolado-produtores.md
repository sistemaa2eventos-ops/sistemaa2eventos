# ADR 0005: Arquitetura de Interface — Área Exclusiva da Produção (`/producao`) e Separação de Módulos
**Status:** Proposto  
**Data:** 19/11/2026  
**Decisores:** Arquiteto de Software / Tech Lead, Solicitante do Sistema  

---

## Contexto
O usuário solicitou expressamente:
> *"analise como está o sistema. siga os parametros de interface, modal, textos etc. vamos manter o padrão do nosso sittema, a gnte cria uma nova pagina e faz tudo separado. area só para os produtores."*

Atualmente, o `web-admin` concentra os módulos de operação de portaria, CFTV, monitoramento, credenciamento de pulseiras e fiscalização de catracas em rotas como `/checkin`, `/checkout`, `/cftv`, `/fiscalizacao`, `/pessoas`.
A rotina dos produtores de evento (Produtor Geral, Arquiteto, Produtores de Área como som, luz, infra, A&B) possui um fluxo de trabalho distinto: é focada em cronograma, plantas baixas, tarefas com checklist e fotos de evidência, conferência de romaneios de materiais e relatórios de montagem/desmontagem.

Misturar as telas da produção dentro dos menus densos da portaria poluiria a interface tanto para os operadores de catraca quanto para a equipe de campo.

## Decisão
1. **Nova Página e Rota Raiz Dedicada (`/producao/*`)**:
   - Criamos uma rota raiz dedicada `/producao` com sub-rotas especializadas:
     - `/producao`: Painel / Dashboard Executivo da Produção (resumo de áreas, prazos, alertas e marcos).
     - `/producao/tarefas`: Quadro de Tarefas e Checklists com filtros por área e setor da planta.
     - `/producao/plantas`: Visualizador e Editor de Planta Baixa Colaborativo (versões e propostas).
     - `/producao/cronograma`: Visão Gantt, calendário e análise de caminho crítico.
     - `/producao/materiais`: Catálogo, romaneios e conferência assistida por IA.
     - `/producao/equipe`: Escalas, check-in de campo, dobras e produtividade.
     - `/producao/orcamentos`: Gestão financeira e custos (visível apenas a perfis autorizados).
     - `/producao/relatorios`: Central de relatórios em PDF personalizados e diário automático.
2. **Fidelidade Estrita ao Design System do Sistema NZT**:
   - Respeito integral aos tokens de cor (`funcao.acao`, `funcao.entrada`, `funcao.liberado`, `funcao.negado`, `funcao.alerta`, etc.), superfícies (`#050B18`, `#0A1628`, `#0F1E37`), raios e tipografia (`fontes.titulo` = Space Grotesk, `fontes.texto` = Inter).
   - Adoção das diretrizes de `docs/PADRAO_INTERFACE.md`:
     - Textos em frase (apenas primeira letra maiúscula, sem `.toUpperCase()` em rótulos, sem "&" substituído por "e").
     - Título da página alinhado ao menu; subtítulo com frase descritiva em português claro.
     - Botões no padrão: `<NeonButton>` para ação principal; `<Button variant="outlined" sx={botaoSecundario}>` para ações secundárias; `<NeonButton neonColor={funcao.negado}>` para destrutivas.
     - Modais padronizados com `<TituloModal titulo="..." subtitulo="..." onFechar={...} />`.
3. **Menu Lateral Contextual / Switcher**:
   - No menu lateral (`Sidebar.jsx`), adicionamos a seção "Produção" com destaque visual e controle de acesso por permissão (`modulo="producao"`).
   - Para usuários que possuem exclusivamente o perfil de `produtor_area` ou `produtor_geral`, a aplicação redireciona automaticamente para a experiência focada da Produção.

## Consequências
- A área dos produtores torna-se um ambiente limpo, focado e altamente produtivo.
- Nenhuma funcionalidade ou tela existente do sistema atual (portaria, catracas, CFTV) sofre impacto ou regressão.
- Facilidade para empacotar ou isolar no futuro essa interface em um PWA independente para celular via Capacitor.
