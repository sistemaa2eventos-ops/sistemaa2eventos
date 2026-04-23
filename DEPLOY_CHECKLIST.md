# 📋 CHECKLIST DE DEPLOY — A2 Eventos

**Data do Deploy:** _______________  
**Responsável:** _______________  
**Versão:** _______________

---

## ⏱️ TEMPO ESTIMADO

| Tipo | Tempo |
|------|-------|
| Deploy Completo (full) | 20-30 min |
| Deploy Rápido (quick) | 10-15 min |
| Apenas Verificações (check) | 2 min |

---

## 🔍 FASE 1: PRÉ-DEPLOY (5 min)

### A. Ambiente Local
- [ ] `docker --version` (20.10+)
- [ ] `docker-compose --version` (1.29+)
- [ ] `git --version`
- [ ] Git status limpo: `git status`
- [ ] Arquivo `.env` existe

### B. Variáveis de Ambiente
- [ ] `SUPABASE_URL` configurado
- [ ] `SUPABASE_ANON_KEY` configurado
- [ ] `API_URL` com domínio correto
- [ ] `NODE_ENV=production`

### C. Espaço em Disco
- [ ] Espaço livre: `df -h` (mínimo 5GB)
- [ ] Docker images: `docker images` (verificar versão)

### D. Serviços Externos
- [ ] **Supabase:** Pode acessar https://[projeto].supabase.co
- [ ] **Cloudflare:** DNS resolvendo `painel.nzt.app.br`
- [ ] **Hostinger:** Acesso via SSH funcionando

---

## ⏹️ FASE 2: PARAR SERVIÇOS (2 min)

```bash
docker-compose down
sleep 5
docker ps  # Verificar se todos pararam
```

- [ ] Todos containers parados: `docker ps`
- [ ] Nenhum process rodando em 80/443/3000/3001

---

## 🧹 FASE 3: LIMPEZA (3 min)

```bash
docker image prune -af
docker network prune -f
docker volume prune -f
docker system df
```

- [ ] Imagens órfãs removidas
- [ ] Networks órfãs removidas
- [ ] Volumes órfãs removidos
- [ ] Espaço liberado: ________ MB

---

## 📦 FASE 4: ATUALIZAR GIT (2 min)

```bash
git fetch origin
git pull origin master
git log --oneline -1
```

- [ ] Código atualizado: `git pull origin master`
- [ ] Commit atual anotado:
  ```
  Commit: ___________________
  ```

---

## 🏗️ FASE 5: BUILD DOCKER (10-15 min)

```bash
docker-compose build --no-cache
```

- [ ] Build iniciado sem cache
- [ ] Build do Backend concluído: ✅ ou ❌
  - Se erro, anotar:
    ```
    ___________________________________
    ```
- [ ] Build do Frontend concluído: ✅ ou ❌
  - Se erro, anotar:
    ```
    ___________________________________
    ```
- [ ] Build do Nginx concluído: ✅ ou ❌
  - Se erro, anotar:
    ```
    ___________________________________
    ```
- [ ] Imagens listadas: `docker images | grep a2-eventos`
  ```
  a2-eventos-api     _______
  a2-eventos-web     _______
  nginx              _______
  ```

---

## 🚀 FASE 6: INICIAR SERVIÇOS (5 min)

```bash
docker-compose up -d
sleep 15
docker-compose ps
```

- [ ] Containers iniciando: `docker-compose up -d`
- [ ] Aguardou 15 segundos
- [ ] Status dos containers:
  ```
  a2-eventos-api    ☐ Up  ☐ Exit
  a2-eventos-web    ☐ Up  ☐ Exit
  nginx              ☐ Up  ☐ Exit
  ```

---

## ✅ FASE 7: VERIFICAÇÕES PÓS-DEPLOY (5 min)

### Nível 1: Containers

```bash
docker-compose ps
```

- [ ] Todos containers em status "Up"
- [ ] Nenhum com "Exit Code"

### Nível 2: Health Checks

```bash
curl -s http://localhost:3001/health | jq .
curl -s http://localhost:3000 | head -20
curl -s http://localhost:80 | head -20
```

- [ ] Backend health: `http://localhost:3001/health`
  - Resposta: ___________________
  - Status: ☐ 200 ☐ 500 ☐ Timeout

- [ ] Frontend: `http://localhost:3000`
  - Status: ☐ 200 ☐ 500 ☐ Timeout

- [ ] Nginx proxy: `http://localhost:80`
  - Status: ☐ 200 ☐ 301 ☐ 500 ☐ Timeout

### Nível 3: Conexões Externas

```bash
# Supabase
curl -s https://[projeto].supabase.co/rest/v1/ping | jq .

# Cloudflare DNS
nslookup painel.nzt.app.br

# HTTPS
curl -s -I https://painel.nzt.app.br
```

- [ ] Supabase API acessível
  - Status: ☐ 200 ☐ 503 ☐ Timeout

- [ ] DNS resolvendo corretamente
  - IP: ___________________

- [ ] HTTPS via Cloudflare
  - Status: ☐ 200 ☐ 301 ☐ 502 ☐ Timeout

### Nível 4: Logs

```bash
docker-compose logs --tail=50
```

- [ ] Logs do Backend:
  ```
  ☐ Sem erros críticos
  ☐ Conectado ao Supabase
  ☐ Porta 3001 aberta
  ```

- [ ] Logs do Frontend:
  ```
  ☐ Sem erros críticos
  ☐ Build concluído
  ☐ Porta 3000 aberta
  ```

- [ ] Logs do Nginx:
  ```
  ☐ Sem erros críticos
  ☐ Proxy funcionando
  ☐ Porta 80/443 aberta
  ```

---

## 🎯 FASE 8: TESTES FUNCIONAIS

### Teste 1: Login (Web Admin)

- [ ] Acessar: https://painel.nzt.app.br
- [ ] Página carrega: ☐ Sim ☐ Não
- [ ] Formulário de login visível: ☐ Sim ☐ Não
- [ ] Email/senha preenchíveis: ☐ Sim ☐ Não

### Teste 2: Conexão ao Banco

```bash
curl -s http://localhost:3001/api/eventos \
  -H "Authorization: Bearer TOKEN" | jq .
```

- [ ] Supabase query respondendo
  - Status: ☐ 200 ☐ 401 ☐ 500

### Teste 3: Intelbras (se aplicável)

- [ ] Acessar: http://192.168.1.17
- [ ] Interface web carregando: ☐ Sim ☐ Não
- [ ] Conecta ao servidor: ☐ Sim ☐ Não
- [ ] Envia detecções de face: ☐ Sim ☐ Não

---

## 📊 FASE 9: MONITORAMENTO (Após deploy)

Monitor os logs pelos próximos 5 minutos:

```bash
docker-compose logs -f --tail=100
```

- [ ] **Minuto 0-1:** Inicialização normal
- [ ] **Minuto 1-3:** Sem erros de conexão
- [ ] **Minuto 3-5:** Sem timeouts ou crashes

Erros observados:
```
________________________________
________________________________
________________________________
```

---

## 🚨 SE HOUVER PROBLEMA

### Opção 1: Quick Rollback

```bash
git revert HEAD
git push origin master
./deploy.sh quick
```

- [ ] Revert executado
- [ ] Push para origin
- [ ] Deploy refeito

### Opção 2: Diagnóstico

Ver seção "TROUBLESHOOTING" no arquivo `CLAUDE.md`

---

## ✨ SUCESSO!

- [ ] Todos testes passaram
- [ ] Sistema rodando em produção
- [ ] Logs monitorados (sem erros)
- [ ] Backup anterior anotado

**Hora de conclusão:** _______________  
**Status Final:** ☐ ✅ SUCESSO ☐ ⚠️ COM AVISOS ☐ ❌ FALHA

**Notas adicionais:**
```
________________________________
________________________________
________________________________
```

---

## 📞 PRÓXIMAS ETAPAS

- [ ] Notificar time de QA
- [ ] Monitorar métricas (1h depois)
- [ ] Verificar relatórios de erro (24h depois)
- [ ] Documentar mudanças no changelog

---

## 🔄 PRÓXIMO DEPLOY

**Data estimada:** _______________  
**Tipo:** ☐ Full ☐ Quick ☐ Hotfix  
**Mudanças previstas:**
```
________________________________
________________________________
```

---

**Checklist Versão 2.0**  
**Última atualização:** 2026-04-23  
**Próxima revisão:** Quando adicionar novos serviços
