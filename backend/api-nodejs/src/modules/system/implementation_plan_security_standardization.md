# Plano de Correção e Blindagem RBAC (A2 Eventos)

> [!NOTE]
> **STATUS: 🟢 100% CONCLUÍDO (v18.0)**
> Todas as etapas deste plano e da Auditoria de Segurança Crítica foram executadas com sucesso no ambiente de banco de dados (Hostinger/Supabase) e nos códigos da API e do Container.

Este plano materializou o diagnóstico sistêmico gerado nas Partes 1 a 3 da Auditoria de Permissões. Ele padronizou as RLS do Supabase e refatorou os componentes defeituosos da API eliminando os bloqueios residuais.

## Resumo de Impacto Executado
- **Fluxos Resolvidos:** Vulnerabilidade de Falso Liveness (I10), Bypass Legado (I11), Vazamento Lateral de Menu (I12), Paradoxo Admin (I13) e Papel Fantasma (I05).
- **Segurança DB:** RLS migrado 100% para o Padrão A Rigoroso (Identificação via metadados JWT).

---

## ✅ ETAPA 1: O Fechamento dos Portões (Database RLS & Constraints)
- **Status:** **CONCLUÍDO**
- Eliminação da vulnerabilidade crítica (`ALL = true`) nas tabelas `sys_permissions`, `sys_roles` e `sys_role_permissions`.
- Tabela `sys_event_role_permissions` restrita para uso do Padrão A (`auth.jwt()`).

## ✅ ETAPA 2: A Cura dos Controllers (Node.js API)
- **Status:** **CONCLUÍDO**
- **`auth.controller.js`**: `roleWeights` reescrito para abranger todos os 15 papéis. Validação de cargo blindada contra by-pass `master`.
- **`policy.service.js`**: `getUserMenu` refatorado para filtrar por `role` e não vazar menus; Paradoxo Admin anulado; Log de Bypass implementado.
- **`models/User.js`**: Mini Polícia estática legada deprecada e neutralizada.

## ✅ ETAPA 3: A Retomada das Operações (Seed Data)
- **Status:** **CONCLUÍDO**
- Seed Base Executado: Acesso devolvido a 14 roles operacionais (Supervisor, Operador, Portaria, Op_atendimento, etc.).
- Zerou o retorno de Array Vazio `[]` e resolveu o Status 403 contínuo (F1).

## ✅ ETAPA 4: Acabamento Front-End e Infraestrutura
- **Status:** **CONCLUÍDO**
- Tabelas corrigidas com "Nome Humanizado", reparando as telas da Web Admin (17 permissões corrigidas).
- Remoção do "staff" fantasma das tabelas núcleo (`empresas`, `pessoas`, `evento_etiqueta_layouts`).
- Diagnóstico em produção resolvendo as quedas do healthcheck IPv6 Nginx no Alpine Linux.

---

> [!IMPORTANT]
> **Próximo Passo Arquitetural (Single Source of Truth):**
> O código contendo a cura dos containers está atualmente salvo na máquina local de desenvolvimento. Para finalizar de vez, realize a integração do código modificado via GitHub (CI/CD) para espelhar a estabilidade na nuvem da Hostinger.
