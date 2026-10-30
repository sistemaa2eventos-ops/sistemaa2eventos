# Robôs de teste

Testes de ponta a ponta que falam só HTTP com a API. Rodam contra a cópia local ou contra a produção.

**Na produção, use sempre um evento de teste separado, nunca o evento real.**

| Robô | O que faz |
|---|---|
| `operador.js` | Repete o trabalho do operador no painel, apaga o que criou e confere cada passo. |
| `leitor.js` | Imita um leitor Intelbras em modo online e confere se ele libera ou nega cada caso. Também mede o tempo de decisão. |

O `operador.js` faz, em ordem:
1. cadastra e aprova as pessoas;
2. faz check-in por pulseira;
3. tenta uma passagem dupla;
4. faz check-out por pulseira e por CPF;
5. faz check-in por QR;
6. confere o relatório diário.

## Configuração

Crie `scripts/robos/.env.robos`. O arquivo é ignorado pelo git e nunca deve ser commitado:

```
ROBO_API_URL=http://localhost:3001
ROBO_EMAIL=robo@teste.local
ROBO_SENHA=...
ROBO_EVENTO_ID=<uuid do evento de teste>
ROBO_EMPRESA_ID=<uuid de uma empresa desse evento>
ROBO_TOKEN_ACESSO=<control_token de um leitor de acesso do evento de teste>
ROBO_TOKEN_CREDENCIAMENTO=<opcional: control_token de um leitor de credenciamento>
```

Os leitores de teste podem ser cadastros fictícios, com qualquer IP. O robô usa só o `control_token` deles.

## Uso

```
node scripts/robos/operador.js            # 3 pessoas
node scripts/robos/operador.js 10 --manter   # 10 pessoas, sem apagar no fim
node scripts/robos/leitor.js
```

Cada verificação imprime ✓ ou ✗, com o status HTTP e o tempo de resposta. O código de saída é 0 quando tudo passa, para usar em CI.

As pessoas criadas pelos robôs têm nome `ROBO TESTE ...` / `ROBO LEITOR ...` e CPF começando com `999`.
