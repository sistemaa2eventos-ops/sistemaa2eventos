# 🎥 Setup do Módulo Câmeras no Supabase

## ⚠️ ANTES DE COMEÇAR

Você precisa executar as migrations SQL no Supabase **ANTES** de iniciar o container do camera-service.

---

## 📋 Passo 1: Acessar o Supabase

1. Abra https://supabase.io/dashboard
2. Selecione o projeto: **A2 Eventos**
3. Na barra lateral, clique em **SQL Editor**

---

## 📝 Passo 2: Executar as Migrations

### Opção A: Copiar & Colar (Recomendado)

1. Abra o arquivo [migrations.sql](./src/db/migrations.sql)
2. Copie **TODO** o conteúdo
3. Volte ao Supabase SQL Editor
4. Cole o código inteiro
5. Clique no botão **▶ RUN** (canto superior direito)

### Opção B: Executar com psql (via CLI)

```bash
# Substitua as variáveis com suas credenciais
psql -h db.zznrgwytywgjsjqdjfxn.supabase.co \
     -U postgres \
     -d postgres \
     -f ./src/db/migrations.sql
```

---

## ✅ O que será criado

Após executar as migrations, você terá 7 novas tabelas:

| Tabela | Descrição | Registros Iniciais |
|:--|:--|:--|
| `camera_face_embeddings` | Embeddings faciais (512D) | 0 |
| `camera_watchlist_cpf` | CPFs em vigilância | 0 |
| `camera_watchlist_placa` | Placas em vigilância | 0 |
| `camera_devices` | Cadastro de câmeras | 0 |
| `camera_detections` | Log de detecções | 0 |
| `camera_known_plates` | Placas autorizadas | 0 |
| `camera_settings` | Configurações do módulo | 1 |

---

## 🔍 Como Verificar

### No Supabase Dashboard:
1. Vá para **Table Editor**
2. Você deve ver **7 novas tabelas** listadas com prefixo `camera_`

### Via SQL (no SQL Editor):
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'camera_%'
ORDER BY table_name;
```

Deve retornar 7 linhas ✓

---

## ⚡ Índices Criados (para Performance)

Os índices abaixo foram criados automaticamente:

```
- idx_face_embedding_hnsw       (HNSW para busca por similaridade)
- idx_face_cpf                  (busca rápida por CPF)
- idx_detections_data           (log ordenado por data)
- idx_detections_watchlist      (apenas watchlist = true)
- idx_known_plates_autorizado   (busca rápidas placas)
- Índices em event_id (suporte multi-tenant)
```

---

## 🚨 Se Algo Deu Errado

### Erro: "relation does not exist"

A migração não rodou completamente. Execute de novo:

```sql
-- Verificar o que falta
SELECT * FROM information_schema.tables 
WHERE table_name LIKE 'camera_%';
```

Se estiver vazio, execute [migrations.sql](./src/db/migrations.sql) novamente.

### Erro: "duplicate key value violates unique constraint"

A tabela já existe. Você pode:
- **Opção 1:** Deletar as tabelas antigas e rodar a migração de novo
- **Opção 2:** Continuar (as tabelas já estão OK)

```sql
-- Para deletar tudo (CUIDADO - destrói dados):
DROP TABLE IF EXISTS camera_settings CASCADE;
DROP TABLE IF EXISTS camera_detections CASCADE;
DROP TABLE IF EXISTS camera_face_embeddings CASCADE;
DROP TABLE IF EXISTS camera_watchlist_cpf CASCADE;
DROP TABLE IF EXISTS camera_watchlist_placa CASCADE;
DROP TABLE IF EXISTS camera_devices CASCADE;
DROP TABLE IF EXISTS camera_known_plates CASCADE;
```

---

## 🔐 Segurança (RLS - Row Level Security)

As políticas RLS foram criadas automaticamente:

```
- Master: acesso total
- Staff/Admin/Supervisor: acesso ao próprio evento
- Service role (camera-service): acesso total
```

O camera-service usa `SUPABASE_SERVICE_ROLE_KEY`, portanto tem acesso irrestrito.

---

## 📱 Próximos Passos

Depois de executar as migrations:

1. ✅ Migrations rodadas
2. ⏭️ Inicie o container do camera-service: `docker compose up camera-service`
3. ⏭️ Verifique a saúde: `curl http://localhost:8000/health`
4. ⏭️ Cadastre suas câmeras no `.env` ou via endpoint `/cameras/register`

---

**Última atualização:** 2026-04-27
