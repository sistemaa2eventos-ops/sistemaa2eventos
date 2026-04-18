#!/bin/bash
# ============================================
# Script para limpar .env do Git history
# ============================================
# AVISO: Isto reescreve TODO o histórico Git!
# Faça backup antes de rodar.
# ============================================

set -e

echo "⚠️  Este script reescreverá TODO o histórico Git!"
echo "   Arquivos .env, .env.*, *.pem, *.key serão removidos"
echo ""
read -p "Digite 'SIM' para continuar: " confirm

if [ "$confirm" != "SIM" ]; then
    echo "Cancelado."
    exit 1
fi

echo "🔄 Iniciando limpeza do histórico..."

# Remover arquivos sensíveis do histórico
git filter-branch --tree-filter '
    rm -f .env
    rm -f .env.local
    rm -f .env.*.local
    rm -f .env.production
    rm -f .env.staging
    rm -f *.pem
    rm -f *.key
    rm -f *.p8
    rm -f *.p12
    rm -f *.pfx
    rm -rf secrets/
    rm -rf private/
    rm -f credentials.json
' -- --all

echo "🗑️  Limpando referências antigas..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo ""
echo "✅ Limpeza concluída!"
echo ""
echo "⚠️  IMPORTANTE: Agora você PRECISA fazer force push:"
echo ""
echo "    git push --force --all"
echo "    git push --force --tags"
echo ""
echo "Isto sobrescreverá o repositório remoto. Avise sua equipe!"
