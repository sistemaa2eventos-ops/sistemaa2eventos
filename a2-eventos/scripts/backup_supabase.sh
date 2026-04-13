#!/bin/bash
# ============================================
# Script de Backup - Supabase A2 Eventos
# Execute: chmod +x backup_supabase.sh && ./backup_supabase.sh
# ============================================

# Configurações
SUPABASE_PROJECT_REF="zznrgwytywgjsjqdjfxn"
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="a2eventos_backup_$DATE"

echo "🔄 Iniciando backup do Supabase..."

# Criar diretório de backup se não existir
mkdir -p $BACKUP_DIR

# O Supabase fornece backups automáticos via dashboard
# Este script documenta o processo manual via pg_dump

# Para backups manuais via CLI, use:
# 1. Instale o Supabase CLI: npm install -g supabase
# 2. Faça login: supabase login
# 3. Execute: supabase db dump --project-ref $SUPABASE_PROJECT_REF

# Backup via Supabase CLI (se disponível)
if command -v supabase &> /dev/null; then
    echo "📦 Criando backup via Supabase CLI..."
    supabase db dump --project-ref $SUPABASE_PROJECT_REF --db-url postgresql://postgres:password@db.$SUPABASE_PROJECT_REF.supabase.co:5432/postgres > "$BACKUP_DIR/$BACKUP_NAME.sql"
    echo "✅ Backup salvo em: $BACKUP_DIR/$BACKUP_NAME.sql"
else
    echo "⚠️ Supabase CLI não encontrado. Configure backup automático no dashboard do Supabase."
    echo "   Acesse: https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/settings/backups"
fi

# Backup do PostgreSQL Edge (Docker local)
if command -v pg_dump &> /dev/null; then
    echo "📦 Criando backup do PostgreSQL Edge local..."
    pg_dump -h localhost -p 5433 -U a2_edge_user -d a2_edge_db -F c -b -v -f "$BACKUP_DIR/postgres_edge_$BACKUP_NAME.dump"
    echo "✅ Backup do PostgreSQL Edge salvo em: $BACKUP_DIR/postgres_edge_$BACKUP_NAME.dump"
fi

# Limpar backups antigos (manter últimos 7 dias)
echo "🧹 Limpando backups antigos..."
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.dump" -mtime +7 -delete

echo "✅ Backup concluído!"
echo "📁 Arquivos em: $BACKUP_DIR"