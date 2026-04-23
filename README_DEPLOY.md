# 📚 PROTOCOLO DE DEPLOY PADRONIZADO — A2 Eventos

> **Seu guia completo para deploy consistente, seguro e reproduzível**

---

## 🎯 O QUE FOI CRIADO?

Você agora tem **4 documentos** + **1 script** que garantem que TODOS os deploys sejam feitos da mesma forma:

```
📋 CLAUDE.md                 ← GUIA COMPLETO (45 páginas)
├─ Arquitetura do sistema
├─ Checklist pré-deploy
├─ Processo passo-a-passo
├─ Build & deploy Docker
├─ Verificações pós-deploy
├─ Variáveis de ambiente
├─ Serviços externos
└─ Troubleshooting

📋 DEPLOY_CHECKLIST.md       ← CHECKLIST PARA IMPRIMIR (8 páginas)
├─ Fase 1: Pré-deploy
├─ Fase 2: Parar serviços
├─ Fase 3: Limpeza
├─ Fase 4: Git update
├─ Fase 5: Build Docker
├─ Fase 6: Iniciar
├─ Fase 7: Verificações
└─ Fase 8: Testes funcionais

📋 QUICK_REFERENCE.txt       ← 1 PÁGINA para imprimir e ter na parede
├─ Deploy commands
├─ Pré-checklist rápido
├─ Arquitetura (diagrama)
├─ Variáveis críticas
├─ Atalhos Docker
├─ Testes rápidos
└─ SOS commands

📋 SYSTEM_MAP.md             ← MAPA DO SISTEMA (12 páginas)
├─ Localização de arquivos
├─ Localização na internet
├─ Senhas & credenciais
├─ Portas & firewall
├─ Containers & volumes
├─ Routes importantes
├─ Logs & monitoramento
└─ Troubleshooting por coisa

🚀 deploy.sh                 ← SCRIPT AUTOMÁTICO
├─ Validação completa
├─ Pré-deploy checks
├─ Stop containers
├─ Cleanup system
├─ Update git
├─ Build Docker
├─ Start services
├─ Post-deploy verification
└─ Colored output + detailed logs
```

---

## ⚡ MODO DE USO (3 OPÇÕES)

### **Opção 1: AUTOMÁTICO (Recomendado)**

```bash
cd c:\Projetos\Projeto_A2_Eventos

# Deploy completo (20-30 min)
./deploy.sh full

# Deploy rápido (10-15 min)  
./deploy.sh quick

# Só verificar (2 min)
./deploy.sh check
```

✅ **Vantagem:** Tudo automático, verificações embutidas, logs coloridos

---

### **Opção 2: MANUAL COM CHECKLIST**

1. Imprima: **DEPLOY_CHECKLIST.md**
2. Marque cada item conforme executa
3. Siga o arquivo **CLAUDE.md** para cada fase
4. Preencha a data/hora/resultado no checklist

✅ **Vantagem:** Controle total, rastreável, documenta tudo

---

### **Opção 3: REFERÊNCIA RÁPIDA**

Coloque **QUICK_REFERENCE.txt** na parede (ou abra em outra janela).

Quando tiver dúvida: Procure lá em 10 segundos.

✅ **Vantagem:** Ultra rápido, sempre à mão

---

## 🚀 SEU PRIMEIRO DEPLOY

### **Passo 1: Preparação (2 min)**

```bash
# 1. Entrar na pasta
cd c:\Projetos\Projeto_A2_Eventos

# 2. Ler o README_DEPLOY.md (você está aqui!)
cat README_DEPLOY.md

# 3. Ler o protocolo completo
cat CLAUDE.md  # (ou abrir em um editor)

# 4. Verificar script está executável
ls -la deploy.sh
# Deve ter: -rwxr-xr-x (ou similar)
```

### **Passo 2: Executar Deploy (20-30 min)**

```bash
# Opção A: Automático (RECOMENDADO)
./deploy.sh full

# Ou

# Opção B: Ler checklist enquanto executa manualmente
cat DEPLOY_CHECKLIST.md
# (Siga cada fase do CLAUDE.md)
```

### **Passo 3: Verificar Sucesso (2 min)**

```bash
# Ver status
docker-compose ps

# Testar endpoints
curl http://localhost:3001/health
curl http://localhost:3000
curl https://painel.nzt.app.br

# Ver logs (últimas linhas, sem erros)
docker-compose logs --tail=50
```

---

## 📋 QUANDO USAR CADA ARQUIVO

| Situação | Arquivo | Ação |
|----------|---------|------|
| **Primeira vez** | CLAUDE.md | Ler capítulos 1-5 |
| **Fazendo deploy** | deploy.sh ou DEPLOY_CHECKLIST.md | Executar |
| **Algo deu errado** | QUICK_REFERENCE.txt + CLAUDE.md seção Troubleshooting | Diagnosticar |
| **Precisa de um comando** | QUICK_REFERENCE.txt | 30 segundos |
| **Não lembra onde está algo** | SYSTEM_MAP.md | Encontra em 1 min |
| **Precisa do contexto todo** | CLAUDE.md | Lê seção específica |
| **Quer checklist no papel** | DEPLOY_CHECKLIST.md | Imprimir |

---

## ✅ GARANTIAS DO SISTEMA

Com estes documentos + script, você garante:

✅ **Consistência:** Cada deploy segue os mesmos passos  
✅ **Segurança:** Backup pré-deploy automático  
✅ **Rastreabilidade:** Cada fase é documentada  
✅ **Recuperabilidade:** Se quebrar, sabe exatamente o que aconteceu  
✅ **Rapidez:** Scripts automáticos economizam tempo  
✅ **Confiabilidade:** Verificações embutidas evitam erros  

---

## 🔄 FLUXO PADRÃO

```
┌─────────────────────────────────────────────────────────┐
│  QUALQUER MUDANÇA NO CÓDIGO                             │
└──────────────────┬──────────────────────────────────────┘
                   ↓
        ┌──────────────────────┐
        │  $ git commit -m "Msg│
        │  $ git push origin   │
        └──────────────┬───────┘
                       ↓
        ┌──────────────────────────────────────┐
        │  $ ./deploy.sh full                  │
        │  OU                                  │
        │  Seguir DEPLOY_CHECKLIST.md          │
        └──────────────┬───────────────────────┘
                       ↓
    ┌──────────────────────────────────────────────┐
    │  Verificações automáticas:                   │
    │  ✓ Docker rodando                            │
    │  ✓ .env correto                              │
    │  ✓ Espaço em disco                           │
    │  ✓ Git status                                │
    │  ✓ Supabase acessível                        │
    │  ✓ Cloudflare DNS                            │
    └──────────────┬───────────────────────────────┘
                   ↓
    ┌──────────────────────────────────────────────┐
    │  Build & Deploy:                             │
    │  ✓ Stop containers                           │
    │  ✓ Cleanup system                            │
    │  ✓ Update git                                │
    │  ✓ Build Docker (no cache)                   │
    │  ✓ Start containers                          │
    └──────────────┬───────────────────────────────┘
                   ↓
    ┌──────────────────────────────────────────────┐
    │  Verificações Pós-Deploy:                    │
    │  ✓ Containers em "Up" status                 │
    │  ✓ Health checks passando                    │
    │  ✓ Conexões externas OK                      │
    │  ✓ Logs sem erros críticos                   │
    └──────────────┬───────────────────────────────┘
                   ↓
              ✨ SUCESSO! ✨
           Sistema rodando em produção
           com Supabase + Cloudflare + Hostinger
```

---

## 📊 ESTRUTURA DE DECISÃO

```
Preciso fazer uma mudança?
│
├─→ Mudança pequena (1-2 linhas)
│   └─→ ./deploy.sh quick
│
├─→ Mudança média (módulo inteiro)
│   └─→ ./deploy.sh full
│
├─→ Algo quebrou em produção
│   └─→ git revert HEAD && git push && ./deploy.sh quick
│
├─→ Preciso debugar
│   └─→ ./deploy.sh check (verifica sem mudar nada)
│
└─→ Preciso entender o que aconteceu
    └─→ cat QUICK_REFERENCE.txt (10 sec)
        ou cat CLAUDE.md (5 min)
        ou cat SYSTEM_MAP.md (3 min)
```

---

## 🎓 ROTEIRO DE APRENDIZADO

**Semana 1: Entender**
1. Leia: CLAUDE.md capítulos 1-3 (Arquitetura)
2. Leia: SYSTEM_MAP.md (saber onde está cada coisa)
3. Imprima: QUICK_REFERENCE.txt

**Semana 2: Praticar**
1. Faça um deploy teste: `./deploy.sh check`
2. Faça um deploy rápido: `./deploy.sh quick`
3. Pratique manualmente com DEPLOY_CHECKLIST.md

**Semana 3+: Rotina**
1. Sempre usar: `./deploy.sh full` para mudanças grandes
2. Usar: `./deploy.sh quick` para mudanças pequenas
3. Consultar: QUICK_REFERENCE.txt conforme necessário

---

## 🚨 CASOS DE USO REAIS

### **Cenário 1: Bug em Produção**

```
Usuário reporta erro no login

1. git log --oneline -1                  # Ver última mudança
2. Verificar no QUICK_REFERENCE.txt      # Seu SOS
3. Se erro óbvio:
   - Corrigir código
   - git commit -m "fix: login"
   - ./deploy.sh quick                   # 10-15 min
4. Se erro complexo:
   - git revert HEAD                     # Volta anterior
   - git push origin master
   - ./deploy.sh quick                   # 10-15 min
   - Investigar depois
```

### **Cenário 2: Nova Feature**

```
Quer adicionar função X

1. Editar código (backend/frontend)
2. git add . && git commit -m "feat: X"
3. git push origin master
4. ./deploy.sh full                      # 20-30 min, verifica tudo
5. Testar em produção
```

### **Cenário 3: Update de Dependência**

```
npm package desatualizado

1. npm update (localmente)
2. Testar localmente
3. git commit -m "chore: update deps"
4. git push origin master
5. ./deploy.sh full --no-cache           # Força rebuild completo
```

---

## 💡 DICAS PROFISSIONAIS

1. **Sempre fazer backup antes:**
   ```bash
   git tag pre-deploy-$(date +%Y%m%d_%H%M%S)
   git push origin --tags
   ```

2. **Monitorar depois do deploy:**
   ```bash
   docker-compose logs -f --tail=100
   # Deixar rodando por 5 minutos após deploy
   ```

3. **Testar em staging primeiro:**
   ```bash
   # Se tiver servidor staging:
   ssh staging.nzt.app.br
   ./deploy.sh quick
   # Testar
   # Depois fazer em produção
   ```

4. **Documentar anomalias:**
   ```bash
   # No arquivo DEPLOY_CHECKLIST.md:
   # "Nesta data, houve erro X, solução foi Y"
   ```

---

## 📞 REFERÊNCIA RÁPIDA DE ARQUIVOS

```
Arquivo                    Tamanho    Tempo Leitura    Quando Usar
─────────────────────────────────────────────────────────────────
README_DEPLOY.md          5 KB       5 min             LEIA PRIMEIRO
CLAUDE.md                 45 KB      20 min            Protocolo completo
DEPLOY_CHECKLIST.md       15 KB      Impressão         Durante deploy manual
QUICK_REFERENCE.txt       4 KB       1 min             Dúvida rápida
SYSTEM_MAP.md             20 KB      10 min            Localizar coisa
deploy.sh                 8 KB       Executar          Deploy automático
```

---

## ✨ PRÓXIMOS PASSOS

1. **Agora:** Leia este arquivo (README_DEPLOY.md) ← Você está aqui
2. **Depois:** Leia CLAUDE.md seção 1-3 (Arquitetura + Preparação)
3. **Teste:** Execute `./deploy.sh check` (sem fazer mudanças)
4. **Deploy Real:** Use `./deploy.sh full` na próxima mudança

---

## 📊 HISTÓRICO

```
2026-04-23 - Versão 1.0
└─ Criado protocolo padrão de deploy
   ├─ CLAUDE.md (guia completo)
   ├─ DEPLOY_CHECKLIST.md (checklist detalhado)
   ├─ QUICK_REFERENCE.txt (1 página rápida)
   ├─ SYSTEM_MAP.md (mapa do sistema)
   ├─ deploy.sh (script automático)
   └─ README_DEPLOY.md (este arquivo)

Motivação: Garantir consistência em todos os deploys
Suporte: Todos os 4 arquivos + script funcionam juntos
```

---

## ❓ DÚVIDAS FREQUENTES

**P: Por onde começo?**  
R: Leia README_DEPLOY.md (você está aqui) → depois CLAUDE.md

**P: Posso pular etapas?**  
R: Não. Cada fase tem seu propósito. Use `./deploy.sh quick` se quiser pular limpeza.

**P: Quanto tempo leva?**  
R: Deploy completo: 20-30 min. Deploy rápido: 10-15 min. Só verificação: 2 min.

**P: E se der erro?**  
R: Veja QUICK_REFERENCE.txt seção "SOS" ou CLAUDE.md seção "Troubleshooting"

**P: Preciso memorizar tudo?**  
R: Não! Sempre consulte os documentos. É para isso que existem.

**P: Posso modificar o protocolo?**  
R: Sim, mas documenta a mudança em CLAUDE.md seção "Histórico"

---

**Bem-vindo ao protocolo padrão! 🚀**

Agora todos os seus deploys serão:
- ✅ Consistentes
- ✅ Seguros
- ✅ Rastreáveis
- ✅ Rápidos
- ✅ Reproduzíveis

**Leia CLAUDE.md a seguir para o protocolo completo.**
