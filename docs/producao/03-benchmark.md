# Benchmark e Referências de Mercado — Módulo de Produção
**Data:** 19/11/2026 | **Versão:** 1.0 | **Documento:** 03-benchmark.md

---

## 1. Visão Geral do Mercado

A gestão de grandes eventos ao vivo (festivais de música, congressos, feiras de negócios, eventos esportivos e corporativos) sofre historicamente com a **fragmentação de ferramentas**. Produtores e arquitetos utilizam uma colcha de retalhos: WhatsApp para comunicação urgente, planilhas Excel soltas para listas de materiais e cachês, Google Drive para plantas em PDF estático, Trello ou Monday para tarefas genéricas, e relatórios manuais de fim de dia feitos no Word às 3h da manhã.

Nosso diferencial competitivo é **reunir em uma plataforma única integrada à operação de campo (PWA com modo offline, IA de visão computacional, controle biométrico de presença e editor colaborativo de plantas)** todas as necessidades da produção técnica e executiva de eventos.

---

## 2. Análise Detalhada dos Concorrentes e Referências

### 2.1 Gestão de Produção e Avanço de Artistas
| Produto | Pontos Fortes (O que copiar) | Pontos Fracos (O que evitar) | Modelo de Preço |
|---|---|---|---|
| **Propared** | Cronogramas detalhados por área técnica, gestão de conflitos de horário/palco, emissão de folhas de contato e ordens de serviço limpas. | Interface densa e desatualizada; fraco em mobilidade/celular em campo; zero suporte a plantas ou visão computacional. | Por usuário/evento (~$49 a $199/mês). |
| **Lennd** | Portal robusto de fornecedores, credenciamento avançado de artistas e parceiros (advancing), integração com controle de acesso. | Muito focado em credenciais e pouco na execução técnica de infraestrutura física; sem editor de planta; caro para o mercado brasileiro. | Enterprise sob cotação (anual). |
| **Festival Pro** | Sistema especializado em festivais médios e grandes com gestão de artistas, staff, credenciamento e catering em uma só suíte. | Curva de aprendizado íngreme; UX complexa e pouco intuitiva; sem modo offline para áreas de festival sem sinal 4G. | Por festival / volume de ingressos e equipe. |

### 2.2 Locação de Equipamentos e Inventário de Eventos
| Produto | Pontos Fortes (O que copiar) | Pontos Fracos (O que evitar) | Modelo de Preço |
|---|---|---|---|
| **Rentman** | Catálogo técnico de equipamentos impecável (dimensões, peso, potência elétrica), rastreio por código de barras/QR, kits de montagem. | Focado estritamente na locadora de equipamentos, não na produtora executiva do festival; contagem de itens 100% manual por bipador. | Por usuário e módulos (~$35 a $150/usuário/mês). |
| **Current RMS** | Gestão de inventário em nuvem, controle de disponibilidade em tempo real e relatórios de entrega/devolução. | Falta integração com cronograma da montagem; sem inteligência visual para recebimento de carretas. | Por usuário (~$55/mês). |

### 2.3 Roteiros e Run-of-Show
| Produto | Pontos Fortes (O que copiar) | Pontos Fracos (O que evitar) | Modelo de Preço |
|---|---|---|---|
| **Shoflo** | Linha do tempo em tempo real sincronizada segundo a segundo entre direção artística, iluminação, som e palco. | Não serve para montagem e infraestrutura de dias anteriores ao show (foco exclusivo no showday). | Por evento/equipe (~$50 a $200/evento). |

### 2.4 Editor de Plantas Baixas e Layout Colaborativo
| Produto | Pontos Fortes (O que copiar) | Pontos Fracos (O que evitar) | Modelo de Preço |
|---|---|---|---|
| **Cvent Event Diagramming** *(ex-Social Tables)* | Biblioteca rica de móveis, tendas, palcos e estruturas; escala real calibrável; visualização de capacidade e fluxo de pessoas. | Projetado para salões e buffets corporativos; não atende festivais a céu aberto e plantas técnicas de engenharia; fechado para intervenções operacionais de campo. | Enterprise corporativo anual. |
| **Prismm** *(ex-Allseated)* | Visualização 3D e espacial de layouts de eventos; colaboração entre fornecedores. | Exige computadores potentes com boa GPU; impraticável em celular básico na montagem sob sol forte; sem fluxo formal de aprovação técnica. | Por evento / assinatura anual elevada. |
| **Planning Pod** | Solução integrada com plantas 2D simples e gestão de eventos. | Plantas muito rudimentares (pouca precisão para engenharia e bombeiros); sem diff visual de versões. | Planos de $49 a $149/mês. |

### 2.5 Gestão de Obra e Campo com Marcação sobre Plantas *(Forte Referência de UX)*
| Produto | Pontos Fortes (O que copiar) | Pontos Fracos (O que evitar) | Modelo de Preço |
|---|---|---|---|
| **Fieldwire** | **Referência direta de UX**: tarefas marcadas como pinos ("pins") ou polígonos diretamente sobre a planta; diário de campo com fotos antes/depois; offline impecável. | Linguagem e fluxos estritamente voltados à construção civil civil tradicional (RFI, submittals); sem conceito de evento/show/cachê. | Freemium até $54/usuário/mês. |
| **Procore / PlanGrid** | Versionamento de plantas com comparação ("diff") em cores (vermelho = removido, verde = adicionado); fluxo rigoroso de aprovação técnica. | Sistema corporativo pesado, caríssimo e inflexível; exige equipe de TI dedicada para implantação. | Enterprise (percentual sobre o valor da obra). |

### 2.6 Ponto, Presença e Escalas de Equipe em Campo
| Produto | Pontos Fortes (O que copiar) | Pontos Fracos (O que evitar) | Modelo de Preço |
|---|---|---|---|
| **Connecteam** | Check-in via QR Code/Geolocalização no celular do staff; gestão de turnos; interface muito amigável para trabalhadores de campo. | Desconectado do credenciamento e da operação de catracas do evento; custos crescentes por colaborador. | Por usuário ativo (~$29 base + $3 a $6/usuário). |
| **Deputy** | Detecção inteligente de dobras de turno, horas extras e controle de fadiga/legislação trabalhista. | Sem controle físico de acesso (catracas/portarias com biometria facial). | Por usuário (~$4 a $8/usuário/mês). |

### 2.7 Visão Computacional e Contagem Automática
| Ferramenta / Plataforma | Pontos Fortes (O que copiar) | Pontos Fracos (O que evitar) | Licenciamento & Custo |
|---|---|---|---|
| **Ultralytics YOLO (Solutions)** | Algoritmos de ponta de detecção e contagem de objetos cruzando linhas (`LineZone`) e dentro de polígonos; suporte a rastreadores (ByteTrack / BoT-SORT). | **Licença AGPL-3.0**: obriga código aberto ou pagamento de licença Enterprise cara ($$$) para produtos comerciais de código fechado. | AGPL-3.0 (Gratuito se aberto) ou Enterprise (fechado). |
| **Roboflow Supervision** | Biblioteca utilitária MIT excelente para desenho de anotações, zonas de contagem, suavização de traços e integração com qualquer modelo. | Requer um motor de inferência por trás (não é o modelo detector em si). | Open Source (MIT) / Gratuita. |

---

## 3. O Que Vamos Copiar, O Que Vamos Evitar e Nosso Diferencial

### O Que Vamos Copiar:
1. **O Modelo de Plantas do Fieldwire/PlanGrid**: Planta baixa carregada com escala calibrada, permitindo que cada produtor coloque tarefas/intervenções georreferenciadas na área exata do evento.
2. **O Fluxo de Aprovação de Versões (Diff)**: O Arquiteto publica a versão N oficial; intervenções de produtores de área entram como "propostas" não aplicadas; a aprovação gera a versão N+1 com histórico auditável.
3. **Detecção de Dobras e Fadiga do Deputy**: Alerta automático em tempo real para o Produtor Geral quando um montador ou técnico estiver emendando dois turnos consecutivos.
4. **Resiliência Offline do Fieldwire**: O produtor em campo cria tarefas, preenche checklists, tira fotos e grava áudios sem travar a interface se o 4G oscilar.

### O Que Vamos Evitar:
1. **Interfaces pesadas e cheias de elementos técnicos de engenharia civil** (Procore): nossa interface deve ser rápida, com contrastes altos, botões grandes e leitura clara no sol.
2. **Dependência de conexão contínua**: nada de carregamento infinito ou telas travadas quando a rede cair.
3. **Tabelas de contagem manual** (Rentman): eliminar conferência cega em papel através da IA de vídeo.
4. **Vazamento de dados financeiros**: garantir que cachês de outros produtores sejam absolutamente inacessíveis para quem não for do financeiro/diretoria.

### Nosso Diferencial Competitivo Único:
> 🚀 **A primeira plataforma "All-in-One" do Brasil que une a produção de campo à portaria/credenciamento e à visão computacional**:
> - O mesmo cadastro de pessoa que tem biometria facial e QR Code de catraca na portaria é o técnico da produção com tarefa, área e cachê atribuídos.
> - Descarga de caminhões conferida por inteligência artificial através de vídeo gravado ou câmera IP do evento.
> - Editor de planta com fluxo formal de propostas e aprovação de arquiteto.
> - Relatórios diários automáticos com evidências fotográficas prontos em PDF no final do expediente.
> - Totalmente adaptado ao mercado nacional: PIX, WhatsApp, LGPD e resiliência à internet instável brasileira.
