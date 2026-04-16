# 🔧 Scripts de Deployment

## rebuild-frontend.ps1 (Windows / PowerShell)

Reconstrói o container do frontend (admin-web) sem cache para resolver problemas de bundle antigo.

### Uso Rápido
```powershell
.\scripts\rebuild-frontend.ps1
```

### Primeira Execução (Política de Execução)
Se receber erro `cannot be loaded because running scripts is disabled`:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### O que faz
1. Para o container `admin-web`
2. Reconstrói a imagem Docker (`docker-compose build --no-cache admin-web`)
3. Inicia o container novamente
4. Aguarda 10 segundos para boot
5. Valida o status do container

### Resultado Esperado
```
✅ Frontend rebuild complete!
🌐 Access at: https://painel.nzt.app.br
```

---

## rebuild-frontend.sh (Linux / macOS / WSL)

Mesma funcionalidade, escrito em bash.

### Uso
```bash
bash scripts/rebuild-frontend.sh
# ou
chmod +x scripts/rebuild-frontend.sh
./scripts/rebuild-frontend.sh
```

---

## Troubleshooting

### "Docker daemon not running"
Inicie o Docker Desktop ou Docker service antes de rodar o script.

### "Container still showing errors after rebuild"
1. Limpe o cache do browser: `Ctrl+Shift+Del`
2. Aguarde 30-60 segundos para o novo container estar pronto
3. Verifique logs: `docker-compose logs admin-web`

### Script lento
O build pode levar 2-5 minutos dependendo da internet e poder de processamento. Paciência!

---

**Data**: 16 de Abril de 2026  
**Status**: Production Ready
