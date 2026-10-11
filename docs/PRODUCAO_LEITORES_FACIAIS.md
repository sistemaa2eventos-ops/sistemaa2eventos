# Leitores faciais em produção (servidor na VPS)

Este guia leva o sistema que hoje funciona em `localhost` para a VPS (`painel.nzt.app.br`), com os leitores faciais na rede do evento.

## Como funciona

```
Leitor facial ──HTTP──▶ leitores.nzt.app.br ──▶ nginx ──▶ api_intelbras (decide liberar/negar)
     ▲                                                          │ eventos em tempo real (Redis)
     │                                                          ▼
Agente local ◀──WebSocket (saída)── api.nzt.app.br ◀──── painel (navegador)
(PC na rede do evento: cadastra faces, configura leitor, snapshot)
```

- **Liberar ou negar:** o próprio leitor consulta o servidor (`/api/intelbras/online`). Precisa de internet e de um endereço **HTTP sem redirecionamento**.
- **Cadastrar faces e configurar o leitor:** o servidor na nuvem não alcança o IP local do leitor (`192.168.x.x`). Quem faz essas chamadas é o **agente local**, um programa num computador da rede do evento que abre uma conexão de saída até o servidor.

## 1. Cloudflare (DNS)

Crie o registro:

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| A | `leitores` | IP da VPS | **Desligado (nuvem cinza / somente DNS)** |

> Não tire o proxy de `api.nzt.app.br` nem de `painel.nzt.app.br`: o painel usa HTTPS do Cloudflare. Só `leitores` fica sem proxy, porque os leitores não seguem redirecionamento para HTTPS.

## 2. Variáveis da VPS (`backend/api-nodejs/.env` no servidor)

```
HARDWARE_CALLBACK_HOST=leitores.nzt.app.br
HARDWARE_CALLBACK_PORT=80
```

O `docker-compose.yml` já define `USE_REDIS=true` e `REDIS_HOST=redis` para `api` e `api_intelbras`. Isso é **obrigatório**: é pelo Redis que o evento "pessoa identificada" chega ao painel.

O banco local "Edge" (`postgres_edge`) fica **desligado** por padrão: tudo é gravado direto no Supabase. Só defina `EDGE_DB_ENABLED=true` se um dia voltar a usar o Edge; sem isso o backend não o consulta, não alerta e não sincroniza com ele.

## 3. Banco de dados

A migração `supabase/migrations/20261010_auditoria_documental.sql` **já foi aplicada**: o Supabase é o mesmo para o local e para a produção.

## 4. Deploy

```bash
git pull
docker-compose build --no-cache api api_intelbras gateway frontend
docker-compose up -d --remove-orphans          # remove o container antigo do postgres_edge
docker logs a2_eventos_api_intelbras --tail=30   # deve mostrar "Conectado ao Redis Pub/Sub"
curl -s http://leitores.nzt.app.br/api/intelbras/ping
```

Desde 2026-10-11 o `docker-compose.yml`:
- não tem mais o `postgres_edge` (estava vazio). O volume antigo pode ser apagado depois de conferir: `docker volume ls | grep pg_edge` e `docker volume rm <nome>`;
- publica Redis (6379), API (3001) e worker dos leitores (3003) só em `127.0.0.1`: o acesso externo é pelo Nginx (porta 80). O Docker ignora o UFW, então antes essas portas ficavam abertas para a internet (o Redis sem senha).

O gateway também passou a ler o IP real do Cloudflare (`real_ip_header CF-Connecting-IP`): por isso o `gateway` precisa entrar no `build` acima.

## 5. Agente local (no evento)

1. No painel: **Dispositivos → Agentes locais → Novo agente**. Copie o texto exibido; o token aparece uma única vez.
2. Num computador da rede dos leitores, com Node.js 18 ou superior:
   - copie a pasta `backend/agent-local`;
   - crie nela o arquivo `.env` com o texto copiado;
   - rode `npm install` e depois `npm start`;
   - deve aparecer `Conectado a https://api.nzt.app.br`.
3. Para não depender de uma janela aberta, instale como serviço. No Windows, por exemplo: `npm i -g pm2 pm2-windows-startup`, depois `pm2 start src/agent.js --name a2-agente`, `pm2 save` e `pm2-startup install`.
4. No painel, o agente aparece como **CONECTADO**.

## 6. Cada leitor

1. **Rede com internet:** gateway e DNS corretos no leitor (no .201 já foram corrigidos para 192.168.1.1 / 8.8.8.8).
2. No painel: **editar o leitor → Conexão com o leitor → "Via agente local: …"** e salvar.
3. Clique em **Config Online**, com os campos em branco. O leitor passa a usar `leitores.nzt.app.br:80`, com NTP e hora acertada.
4. Clique em **Sincronizar** para enviar as faces pelo agente.
5. Em até 1 minuto, o leitor aparece **online** (pelo keepalive dele).

## 7. Teste

- Rosto no leitor de credenciamento: o modal abre no painel do operador vinculado.
- Rosto no leitor de acesso: libera; uma segunda passagem registra a saída.
- No painel, Monitor: as passagens aparecem em tempo real.

## Atenção

- **Sem internet no evento, os leitores negam acesso** (modo online com `fail_closed`). Em locais com internet instável, prefira um servidor local no evento (o mesmo sistema rodando num PC da rede), que é o modo testado em `localhost`.
- Firmware novo (SS 5541 MF W 3.x): se o leitor tiver sido configurado antes por outro software e negar todo mundo com "acesso facial negado", restaure as configurações de fábrica mantendo a rede (`configManager.cgi?action=restoreExcept&names[0]=Network`) e clique em **Config Online** de novo.
