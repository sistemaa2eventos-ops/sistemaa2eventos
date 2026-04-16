# 🔧 FIX: ReferenceError PermissoesAcesso

## Problema
```
ReferenceError: PermissoesAcesso is not defined
```

Ocorre em produção porque o bundle antigo do frontend está cacheado no container Docker.

## Solução: Rebuild Frontend Container

### Opção 1: Script Automático (Recomendado)
```bash
cd a2-eventos
bash scripts/rebuild-frontend.sh
```

### Opção 2: Manual
```bash
# No servidor com Docker
cd a2-eventos

# Parar o container
docker-compose stop admin-web

# Reconstruir sem cache (força novo build)
docker-compose build --no-cache admin-web

# Iniciar
docker-compose up -d admin-web

# Aguardar 10s
sleep 10

# Verificar status
docker-compose ps admin-web
```

### Opção 3: Rebuild Completo (Se Não Funcionar)
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
docker-compose logs -f
```

## O Que Foi Feito

1. **Arquivo Renomeado**: `PermissoesAcesso.jsx` → `ConfigPermissoes.jsx`
2. **Import Atualizado**: Em `src/App.jsx` linha 57
3. **Build Limpado**: Frontend `npm run build` reconstrói sem cache

O erro desaparece após o rebuild porque:
- O `npm run build` vai rodar com o código-fonte correto
- O novo bundle terá referências corretas
- O browser recebe o novo JavaScript sem a referência fantasma ao nome antigo

## Verificação Pós-Fix

```bash
# 1. Verificar container está saudável
docker-compose ps | grep admin-web
# Deve mostrar "Up (healthy)"

# 2. Acessar painel
curl https://painel.nzt.app.br/
# Deve retornar HTML, sem erros 500

# 3. Limpar cache do browser
# Chrome/Edge: Ctrl+Shift+Del → Apagar tudo → Visitar site novamente
# Firefox: Ctrl+Shift+Del → Limpar agora

# 4. Acessar https://painel.nzt.app.br e fazer login
```

---

**Status**: ✅ Código-fonte corrigido  
**Próximo passo**: Fazer rebuild do Docker em produção  
**Tempo estimado**: 5-10 minutos
