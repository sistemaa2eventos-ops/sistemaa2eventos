#!/usr/bin/env bash
# Backup diário do banco (Supabase/Postgres) na VPS.
#
# Instalação (uma vez, na VPS):
#   1. Criar /root/.backup-banco.env (chmod 600) com:
#        SUPABASE_DB_URL=postgresql://postgres.<ref>:<senha>@<host>:5432/postgres
#      (Supabase → botão Connect → Connection String → "Session pooler"; caracteres especiais
#       da senha em formato de URL: # → %23, ! → %21, @ → %40, / → %2F)
#      Opcional, cópia fora da VPS: RCLONE_DESTINO=r2:nzt-backups
#   2. crontab -e →  30 6 * * * /root/Projeto_A2_Eventos/scripts/backup-banco.sh >> /var/log/backup-banco.log 2>&1
#      (a VPS está em UTC: 06:30 UTC = 03:30 em Brasília)
#
# O que entra: tabelas, dados, índices, funções e regras de acesso (RLS) do schema public.
# O que NÃO entra: logins (auth.users, ficam com o Supabase) e arquivos do Storage (fotos/documentos).
#
# Restaurar (sempre num banco vazio primeiro, nunca direto por cima da produção):
#   docker run --rm -v /root/backups/banco:/b postgres:17-alpine \
#     pg_restore --no-owner --no-privileges -d "$DESTINO_DB_URL" /b/<arquivo>.dump
# Testado em 29/10/2026: as 61 tabelas e as contagens de dados batem com a produção.

set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/root/.backup-banco.env}"
PASTA="${BACKUP_PASTA:-/root/backups/banco}"
DIAS="${BACKUP_DIAS:-14}"

# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && source "$ENV_FILE"
: "${SUPABASE_DB_URL:?Defina SUPABASE_DB_URL em $ENV_FILE}"

# O backup tem todos os dados (CPFs, fotos, rostos): só o root lê a pasta e os arquivos
umask 077
mkdir -p "$PASTA"
chmod 700 "$PASTA"
ARQUIVO="nzt_$(date +%Y%m%d_%H%M).dump"

echo "[$(date '+%F %T')] Iniciando backup → $PASTA/$ARQUIVO"

# Só o schema public (dados do sistema); auth/storage ficam com o próprio Supabase.
# pg_dump do Postgres 17 lê bancos 15 e 17.
docker run --rm -v "$PASTA":/b postgres:17-alpine \
  pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --file="/b/$ARQUIVO"

# Arquivo vazio/truncado é falha, não backup
TAMANHO=$(stat -c %s "$PASTA/$ARQUIVO")
if [ "$TAMANHO" -lt 10240 ]; then
  echo "[$(date '+%F %T')] ERRO: backup com apenas $TAMANHO bytes" >&2
  exit 1
fi

# Confere se o arquivo é legível pelo pg_restore
docker run --rm -v "$PASTA":/b postgres:17-alpine pg_restore --list "/b/$ARQUIVO" > /dev/null

if [ -n "${RCLONE_DESTINO:-}" ] && command -v rclone > /dev/null; then
  rclone copy "$PASTA/$ARQUIVO" "$RCLONE_DESTINO"
fi

find "$PASTA" -name 'nzt_*.dump' -mtime +"$DIAS" -delete
echo "[$(date '+%F %T')] Backup ok ($((TAMANHO / 1024)) KB). Mantidos os últimos $DIAS dias."
