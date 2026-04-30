# 🔐 Guia de Correção - Auditoria Supabase A2 Eventos

## 📋 Resumo
Este guide contém 3 scripts SQL para corrigir os erros identificados na auditoria do Supabase Database Linter.

| Fase | Arquivo | Tempo | Risco | Status |
|------|---------|-------|-------|--------|
| 1️⃣ CRÍTICA | `SUPABASE_FIX_FASE1_CRITICO.sql` | 15 min | Baixo | ⏳ Esta semana |
| 2️⃣ IMPORTANTE | `SUPABASE_FIX_FASE2_IMPORTANTE.sql` | 30 min | Médio | ⏳ Próxima semana |
| 3️⃣ LIMPEZA | `SUPABASE_FIX_FASE3_LIMPEZA.sql` | 45 min | Médio-Alto | ⏳ Quando tiver downtime |

---

## 🚀 Como Usar

### Pré-requisitos
- ✅ Acesso ao Supabase Dashboard
- ✅ Permissão de SUPERUSER no banco de dados
- ✅ Ter feito backup recente
- ✅ Conhecimento básico de SQL

### Passo 1: Acessar SQL Editor
1. Vá para **Supabase Dashboard**
2. Selecione seu projeto
3. Clique em **SQL Editor** (menu esquerdo)
4. Clique em **New Query**

### Passo 2: Executar FASE 1 (CRÍTICA)

**⚠️ IMPORTANTE:**
- Leia cada comentário antes de executar
- Ajuste a definição da view `view_documentos_pendentes` conforme necessário
- Teste em staging primeiro

1. Abra arquivo: `SUPABASE_FIX_FASE1_CRITICO.sql`
2. Copie o conteúdo
3. Cole no SQL Editor do Supabase
4. Execute cada seção separadamente (não tudo de uma vez)

**Ordem de execução:**
```
1. Verificar a view atual (SELECT definition...)
2. Recriar a view com SECURITY INVOKER
3. Corrigir update_pessoa_evento_empresa_timestamp
4. Corrigir camera_update_updated_at
5. Executar verificação final
```

### Passo 3: Testar Mudanças
Após executar FASE 1, teste:
```sql
-- Testar a view
SELECT * FROM public.view_documentos_pendentes LIMIT 5;

-- Testar que as funções triggers ainda funcionam
-- (Execute um UPDATE em tabelas que usam essas funções)
```

### Passo 4: Executar FASE 2 (Na Próxima Semana)

Depois de confirmar que FASE 1 funcionou:
1. Abra `SUPABASE_FIX_FASE2_IMPORTANTE.sql`
2. Execute as consultas de verificação primeiro
3. Revise manualmente cada função SECURITY DEFINER
4. Adicione `SET search_path = public` em cada uma

### Passo 5: Executar FASE 3 (Quando Tiver Downtime)

⚠️ **CRÍTICO:** Agende uma janela de manutenção para isso!

1. Fazer BACKUP completo do banco
2. Abra `SUPABASE_FIX_FASE3_LIMPEZA.sql`
3. Execute em ordem:
   - Deletar tabelas deprecated
   - Desabilitar RLS em tabelas internas
   - Adicionar RLS policies em tabelas ativas
4. Testar acesso a dados

---

## 🔍 O Que Cada Fase Corrige

### FASE 1: CRÍTICA
```
❌ view_documentos_pendentes com SECURITY DEFINER
   ✅ Mudar para SECURITY INVOKER (menos risco)

❌ Funções trigger sem search_path
   ✅ Adicionar SET search_path = public
```

### FASE 2: IMPORTANTE
```
❌ Múltiplas funções SECURITY DEFINER públicas
   ✅ Adicionar search_path em todas

❌ Funções sensíveis sem validação
   ✅ Adicionar validações de auth/role

❌ Extensão vector em schema public
   ✅ Preparar para mover para schema separado

❌ Leaked Password Protection desabilitada
   ✅ Habilitar no Dashboard
```

### FASE 3: LIMPEZA
```
❌ Tabelas deprecated com RLS
   ✅ Deletar

❌ Tabelas internas com RLS mas sem políticas
   ✅ Desabilitar RLS

❌ Tabelas ativas sem RLS policies
   ✅ Criar políticas apropriadas
```

---

## ⚠️ Avisos e Cuidados

### ❌ NÃO Faça Isso
- ❌ Executar tudo de uma vez (execute por seção)
- ❌ Deletar tabelas sem backup
- ❌ Mudar SECURITY DEFINER para INVOKER sem revisar a função
- ❌ Desabilitar RLS sem entender as implicações
- ❌ Executar FASE 3 durante horário de pico

### ✅ Sempre Faça Isso
- ✅ Ler os comentários de cada seção
- ✅ Testar em staging antes de produção
- ✅ Fazer backup antes de deletar dados
- ✅ Verificar logs após cada execução
- ✅ Comunicar ao time antes de fazer mudanças

---

## 🧪 Testando as Mudanças

### Após FASE 1
```sql
-- Testar view
SELECT * FROM public.view_documentos_pendentes LIMIT 1;

-- Testar função trigger (insira um registro na tabela que usa o trigger)
INSERT INTO public.pessoa_evento_empresa (...)
VALUES (...);

-- Verificar que updated_at foi preenchido automaticamente
SELECT updated_at FROM public.pessoa_evento_empresa
ORDER BY created_at DESC LIMIT 1;
```

### Após FASE 2
```sql
-- Testar função com validação
SELECT public.registrar_acesso_atomico(...);

-- Verificar logs de erro se houver
-- No Dashboard: Observability → Logs
```

### Após FASE 3
```sql
-- Testar RLS (deve retornar vazio para outro usuário)
SELECT * FROM public.backups_acesso_diario
WHERE user_id != auth.uid();

-- Testar que o owner consegue ver seus dados
SELECT * FROM public.watchlist
WHERE owner_id = auth.uid();
```

---

## 📞 Se Algo Der Errado

### Erro: "Could not find a relationship..."
**Causa:** FK entre tabelas não existe  
**Solução:** Use queries separadas (já foi corrigido no código do backend)

### Erro: "Permission denied for schema..."
**Causa:** User sem permissão suficiente  
**Solução:** Use superuser ou role com permissão

### Erro: "Cannot delete, referenced by..."
**Causa:** Há foreign keys apontando para a tabela  
**Solução:** Deletar referências primeiro ou usar CASCADE

### RLS Bloqueando Acesso
**Causa:** Policy muito restritiva  
**Solução:** Verificar a policy e ajustar a condição

---

## 📊 Checklist de Implementação

### Pré-Implementação
- [ ] Backup do banco de dados feito
- [ ] Todos entenderam as mudanças
- [ ] Staging environment disponível
- [ ] Horário agendado para execução
- [ ] Plano de rollback pronto

### FASE 1
- [ ] Verificar definição atual da view
- [ ] Recriar view com SECURITY INVOKER
- [ ] Adicionar search_path nas funções triggers
- [ ] Testar em staging
- [ ] Testar em produção
- [ ] Monitorar logs por 24h

### FASE 2
- [ ] Revisar todas as funções SECURITY DEFINER
- [ ] Adicionar search_path em cada uma
- [ ] Adicionar validações em funções sensíveis
- [ ] Habilitar Leaked Password Protection
- [ ] Testar em staging
- [ ] Comunicar mudanças ao time

### FASE 3
- [ ] Backup completo feito
- [ ] Downtime agendado e comunicado
- [ ] Deletar tabelas deprecated
- [ ] Desabilitar RLS em tabelas internas
- [ ] Criar RLS policies em tabelas ativas
- [ ] Testar acesso a dados
- [ ] Monitorar por 48h

---

## 📚 Referências

- [Supabase Database Linter Docs](https://supabase.com/docs/guides/database/database-linter)
- [Row Level Security Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [SECURITY DEFINER vs INVOKER](https://supabase.com/docs/guides/database/postgres/function-security)
- [Managing Extensions](https://supabase.com/docs/guides/database/extensions)

---

## 📞 Suporte

Se tiver dúvidas:
1. Revisar os comentários no script SQL
2. Consultar a documentação Supabase
3. Testar em staging primeiro
4. Contactar Supabase support se necessário

---

**Status:** ⏳ Pronto para ser executado  
**Última atualização:** 2026-04-28  
**Autor:** Claude Code
