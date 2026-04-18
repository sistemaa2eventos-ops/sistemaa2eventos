# 🔐 Instruções: Limpeza de Secrets do Git History

**CRÍTICO:** .env files com credenciais foram commitadas. Precisam ser removidas do histórico Git.

---

## ⚠️ Antes de Começar

- ⚠️ **Faça backup do repositório** em outro local
- ⚠️ **Avise toda a equipe** - isto reescreve o histórico
- ⚠️ **Force push** será necessário
- ⚠️ Todo desenvolvedor precisará fazer `git pull --rebase` depois

---

## 🔧 Opção A: Usando BFG (RECOMENDADO - Mais rápido e seguro)

### Instalação

**Windows (Chocolatey):**
```powershell
choco install bfg
```

**macOS (Homebrew):**
```bash
brew install bfg
```

**Linux:**
```bash
apt-get install bfg  # Debian/Ubuntu
yum install bfg      # CentOS/RHEL
```

### Execução

```bash
cd c:\Projetos\Projeto_A2_Eventos

# Criar mirror (backup seguro)
git clone --mirror https://github.com/seu-usuario/repo.git repo.git

# Executar BFG
cd repo.git
bfg --delete-files '.env' --force
bfg --delete-files '.env.*.local' --force  
bfg --delete-files '*.pem' --force
bfg --delete-files '*.key' --force
bfg --delete-files 'credentials.json' --force
bfg --delete-files 'secrets/' --force

# Limpar e compactar
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Voltar ao repo principal
cd ..

# Clonar limpo
git clone repo.git repo-clean
cd repo-clean

# Fazer force push (⚠️ isto sobrescreve!)
git push --force --all
git push --force --tags
```

---

## 🔧 Opção B: Usando git filter-branch (Se BFG não disponível)

```bash
cd c:\Projetos\Projeto_A2_Eventos

# Execute o script que foi criado
bash clean-git-history.sh

# Ou manualmente:
git filter-branch --tree-filter 'rm -f .env .env.*.local *.pem *.key' -- --all

git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push --force --all
git push --force --tags
```

---

## ✅ Depois de Limpar

### 1. Avisar Equipe

Envie mensagem:
```
⚠️ Git history foi reescrito para remover secrets.
   Todos precisam fazer:
   
   git pull --rebase
   # ou
   git fetch origin
   git reset --hard origin/main
```

### 2. Cada Desenvolvedor Fazer

```bash
# Opção A: Reset completo (mais seguro)
git fetch origin
git reset --hard origin/main
git checkout seu-branch-aqui

# Opção B: Rebase
git pull --rebase origin main
```

### 3. Deletar Clones Antigos (Locais)

Se tiver repos clonados em outro lugar, delete:
```bash
rm -rf ~/outro-clone-do-repo
```

---

## 🔐 Validar que Secrets Foram Removidos

```bash
# Procurar por ANON_KEY no histórico
git log -p | grep -i "ANON_KEY"

# Procurar por .env em arquivos rastreados
git log --all --full-history -- ".env*"

# Se retornar vazio, sucesso! ✅
```

---

## 🚨 Se Algo Der Errado

```bash
# Recuperar de backup (se criou mirror)
rm -rf repo.git repo-clean

# Recomitar do zero
git clone https://github.com/seu-usuario/repo.git
```

---

## ⏱️ Tempo Estimado

- **BFG:** 5-10 minutos
- **git filter-branch:** 10-20 minutos (mais lento com histórico grande)
- **Avisar equipe + fazer pull:** 30 minutos

**Total:** ~45 minutos

---

## 📋 Checklist Final

- [ ] Backup do repo feito
- [ ] Executou BFG ou filter-branch
- [ ] Git history limpo (git log não mostra .env)
- [ ] Force push executado
- [ ] Equipe avisada
- [ ] Todos fazem git pull --rebase
- [ ] Novos secrets configurados em .env.production
- [ ] Verificar: git log não tem credenciais
