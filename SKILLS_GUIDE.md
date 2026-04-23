# 🎯 GUIA DE SKILLS DO PROJETO — A2 Eventos

**Criado:** 2026-04-23  
**Versão:** 1.0

---

## ⚡ O QUE SÃO SKILLS?

Skills são **comandos de slash** (`/comando`) que você pode usar no Claude para trazer informações padrão do seu projeto.

Sempre que trabalhar com este projeto, você pode usar estes comandos para ter acesso instantâneo ao protocolo de deploy e configurações.

---

## 📋 SKILLS DISPONÍVEIS

### **1. `/deploy` — Protocolo Completo de Deploy**

**Quando usar:**
- Vai fazer um deploy
- Precisa entender o protocolo completo
- Quer o checklist passo-a-passo
- Precisa troubleshoot um problema

**O que retorna:**
- Arquitetura completa
- Todas as fases de deploy (8 fases)
- Variáveis de ambiente
- Serviços externos
- Troubleshooting completo
- ~45 páginas de informação

**Tempo:** 5 min pra ler tudo

**Exemplo:**
```
Você: Vou fazer deploy de uma mudança
Claude: /deploy
Claude: [Retorna protocolo completo com todas as fases]
```

---

### **2. `/quick-deploy` — Referência Rápida (1 Página)**

**Quando usar:**
- Precisa só dos comandos
- Já conhece o protocolo
- Quer atalhos Docker
- Precisa de SOS rápido

**O que retorna:**
- Deploy commands (3 opções)
- Pré-checklist (5 itens)
- Arquitetura (diagrama)
- Variáveis críticas
- Atalhos Docker
- Testes pós-deploy
- SOS commands

**Tempo:** 1 minuto pra escanear

**Exemplo:**
```
Você: Qual é o comando de deploy mesmo?
Claude: /quick-deploy
Claude: [Retorna 1 página com os comandos]
```

---

### **3. `/system-map` — Mapa do Sistema**

**Quando usar:**
- Precisa localizar um arquivo
- Quer saber onde está uma coisa
- Precisa entender a arquitetura
- Quer ver fluxo de dados

**O que retorna:**
- Localização de arquivos críticos
- Localização na internet (hosts/IPs)
- Senhas e credenciais (referência)
- Portas e firewall
- Containers e volumes
- Routes importantes
- Fluxos de dados

**Tempo:** 3-5 min pra encontrar algo

**Exemplo:**
```
Você: Onde está o arquivo de configuração do Nginx?
Claude: /system-map
Claude: [Mostra mapa completo, encontra nginx.conf na seção de arquivos]
```

---

### **4. `/checklist` — Deploy Checklist**

**Quando usar:**
- Vai fazer deploy manualmente
- Quer marcar cada fase
- Vai documentar o processo
- Quer ter controle total

**O que retorna:**
- 9 fases com checkboxes
- Sub-itens para cada fase
- Tempo estimado
- Testes específicos
- Seção para anotar erros
- Rollback instructions

**Tempo:** Depende do deploy (20-30 min)

**Exemplo:**
```
Você: Vou fazer um deploy manual hoje
Claude: /checklist
Claude: [Retorna checklist completo para imprimir ou usar]
Você: [Marca cada item conforme executa]
```

---

### **5. `/troubleshoot` — Guia de Troubleshooting**

**Quando usar:**
- Algo deu errado
- Vê um erro desconhecido
- Deploy falhou
- Container não inicia

**O que retorna:**
- 7 erros comuns com soluções
- Comandos de diagnóstico
- Causas raiz prováveis
- Passos de resolução

**Tempo:** 2-10 min (depende do erro)

**Exemplo:**
```
Você: Estou vendo "502 Bad Gateway"
Claude: /troubleshoot
Claude: [Mostra Erro 4 com solução: verificar logs, testar backend, etc]
```

---

## 🔄 FLUXO DE USO TÍPICO

```
┌─────────────────────────────┐
│  Vou fazer uma mudança      │
└──────────────┬──────────────┘
               ↓
    Dúvida? → /quick-deploy (1 min)
               ↓
    Vou fazer deploy
               ↓
    ┌─────────────────────────────┐
    │ Usar /deploy ou /quick-deploy?
    └─────────────┬───────────────┘
                  ↓
    ┌────────────────────────────────┐
    │ ☐ Automático: ./deploy.sh full
    │ ☐ Manual: /checklist + /deploy
    └─────────────┬──────────────────┘
                  ↓
    Erro? → /troubleshoot (diagnóstico)
               ↓
    Sucesso! ✨
```

---

## 💡 DICAS DE USO

### **Tip 1: Combinar Skills**

```
Você: Preciso fazer deploy
Claude (automático): Recomendo /deploy + ./deploy.sh full
Claude: Aqui está o protocolo (/deploy)
Claude: Aqui está como executar (mostra scripts)
```

### **Tip 2: Durante Problemas**

```
Erro 503 no backend
└─→ /quick-deploy (ver atalhos)
    └─→ curl http://localhost:3001/health
    └─→ docker logs a2-eventos-api
    └─→ /troubleshoot (se persistir)
```

### **Tip 3: Primeira Vez**

```
Se novo no projeto:
1. Leia README_DEPLOY.md
2. Use /deploy para entender tudo
3. Use /quick-deploy para memorizar
4. Depois use /checklist ou ./deploy.sh
```

### **Tip 4: Referência Rápida**

```
Sempre abra QUICK_REFERENCE.txt quando:
- Quer um comando Docker
- Quer testar algo rápido
- Quer diagnóstico em <1 min
```

---

## 🎯 MATRIZ DE DECISÃO

| Situação | Skill |
|----------|-------|
| Primeira vez usando sistema | `/deploy` |
| Já conhece, quer rápido | `/quick-deploy` |
| Precisa localizar coisa | `/system-map` |
| Vai fazer deploy manual | `/checklist` |
| Algo deu erro | `/troubleshoot` |
| Quer atalhos Docker | `/quick-deploy` |
| Quer entender fluxo | `/system-map` |
| Quer checklist pra imprimir | `/checklist` |

---

## 📱 COMO ATIVAR AS SKILLS

### **Em Claude Code (Recomendado)**

1. Abra o projeto em Claude Code
2. Na conversa, digite: `/deploy` ou outro comando
3. Claude reconhecerá e retornará informações

### **No Claude Web**

1. Abra https://claude.ai/code
2. Digite na conversa: `/deploy`
3. Claude retornará o protocolo

### **Primeira Ativação**

Se as skills não funcionarem:
1. Verifique que arquivo `.claude-skills.json` existe
2. Verifique que `.claude-project-instructions.md` existe
3. Reinicie Claude Code
4. Tente novamente

---

## 🔐 O QUE AS SKILLS CONTÊM

**Seguro para compartilhar:**
- ✅ Protocolos de deploy
- ✅ Arquitetura do sistema
- ✅ Localização de arquivos
- ✅ Comandos Docker
- ✅ Troubleshooting

**NÃO deve estar nos logs:**
- ❌ Senhas (em `.env`)
- ❌ API keys (em `.env`)
- ❌ SSH credentials (em `.env`)
- ❌ Tokens privados (em `.env`)

As skills NÃO retornam conteúdo de `.env` — apenas referências.

---

## 📊 EFICIÊNCIA GANHA

| Tarefa | Sem Skill | Com Skill |
|--------|-----------|-----------|
| Lembrar comando deploy | 5 min | 10 seg |
| Encontrar arquivo | 10 min | 1 min |
| Fazer deploy | 30+ min | 20-30 min |
| Troubleshoot | 20 min | 2-10 min |
| Entender sistema | 60+ min | 5-20 min |

---

## 🚀 PRÓXIMOS PASSOS

1. **Agora:** Leia este arquivo (SKILLS_GUIDE.md)
2. **Depois:** Tente usar `/deploy` em uma conversa
3. **Teste:** Use `/quick-deploy` e `/system-map`
4. **Pratique:** Faça um deploy com `/checklist`

---

## ❓ DÚVIDAS FREQUENTES

**P: Qual skill usar primeiro?**  
R: Se novo: `/deploy`. Se com pressa: `/quick-deploy`. Se tem erro: `/troubleshoot`.

**P: As skills se atualizam?**  
R: Sim! Se arquivo em `CLAUDE.md` mudar, skills refletem automaticamente.

**P: Posso criar mais skills?**  
R: Sim! Edite `.claude-skills.json` e adicione novo comando.

**P: Skills funcionam offline?**  
R: Não. Claude Code precisa estar conectado. Mas arquivos `.md` podem ser lidos offline.

**P: Como desativar uma skill?**  
R: Edite `.claude-skills.json` e mude `"enabled": true` para `false`.

---

**Comece a usar agora: `/deploy`**

Essa é a forma padrão de trabalhar com este projeto! 🚀
