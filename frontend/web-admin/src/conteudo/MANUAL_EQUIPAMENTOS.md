# Manual de equipamentos — configurar, testar e corrigir

**Para quem é:** a equipe técnica que monta o evento (rede, PC do evento, câmeras e leitores faciais).
Não é preciso saber programar. Tudo o que está aqui é feito pelo painel (`https://painel.nzt.app.br`), pela Central de Monitoramento do PC do evento ou no próprio equipamento.

**Onde está:** no painel, em Configurações > Equipamentos > **Manual de equipamentos** (dá para buscar e imprimir).

**Como usar:** siga as seções 1 a 5 na montagem, na ordem. A seção 6 é para quando algo dá errado. A seção 8 lista o que ainda exige um desenvolvedor.

---

## 1. Antes de sair para o evento

- [ ] Evento criado no painel, com áreas cadastradas (ex.: Portaria, Produção, Camarim).
- [ ] Lotes de pulseira com as áreas de cada um (Configurações > Pulseiras).
- [ ] PC do evento com o sistema instalado (pasta `C:\Projetos\Projeto_A2_Eventos`) e o agente vinculado ao evento.
- [ ] Usuário e senha de cada câmera e leitor anotados em local seguro (nunca no grupo de mensagens).
- [ ] Um cadastro de teste com foto (você mesmo), para testar cada leitor e câmera.
- [ ] Cabos de rede sobrando e um switch. Leitor e câmera **no cabo** sempre que possível; Wi-Fi só se não houver opção.

---

## 2. Rede e roteador

Cada evento pode ter um roteador diferente. O que importa é o mesmo em todos:

### 2.1 Tudo na mesma rede
PC do evento, câmeras e leitores precisam estar na **mesma rede** (ex.: todos com IP `192.168.1.x`). Confira o IP do PC: no Windows, `ipconfig` no Prompt de Comando.

### 2.2 IP fixo para cada equipamento (obrigatório)
Se o roteador trocar o IP de um leitor ou câmera no meio do evento, ele some do sistema (já aconteceu: o leitor .51 virou .52).

No roteador, procure **"Reserva de DHCP"**, **"Endereço IP estático"** ou **"Address Reservation"**. O nome muda conforme a marca; costuma ficar em LAN, DHCP ou Rede local. Para cada equipamento:
1. Encontre-o na lista de clientes conectados (pelo nome ou pelo endereço MAC, que vem na etiqueta do equipamento).
2. Reserve o IP atual dele.
3. Anote numa tabela: nome, IP, MAC e local.

Sem acesso ao roteador do local (ex.: roteador do centro de convenções)? Leve um roteador próprio e ligue os equipamentos nele.

> **Atenção:** leitores com cabo e Wi-Fi ao mesmo tempo (ex.: SS 5541 MF W) podem ter **dois IPs**. Use só um e reserve esse.

### 2.3 Testar a rede
Pelo painel: **Leitores e dispositivos > Testar rede do evento**. Digite o IP, escolha o atalho de portas (Leitor facial: 80; Câmera: 554 e 80; Servidor local: 3001) e clique em **Testar**. O teste sai do PC do evento, então mostra o que ele enxerga na rede local.
- **Porta aberta**: o equipamento está na rede e o serviço responde.
- **Ping responde, mas a porta não abre**: o equipamento está ligado, mas aquele serviço está desligado ou a porta é outra (ex.: RTSP desligado no menu da câmera).
- **Nada responde**: equipamento desligado, rede diferente ou IP errado.
- Alguns equipamentos não respondem ao ping mesmo ligados: vale o resultado das portas.

O agente do PC do evento precisa estar atualizado (versão 3.2, rode `ligar-ia-facial.bat`). Sem o painel, no Prompt de Comando: `ping 192.168.1.52`.

### 2.4 Internet
- Os leitores, hoje, **precisam do servidor para liberar** (modo online, seção 4.6). Sem internet, eles negam.
- O vídeo ao vivo **não** depende de internet: a Central roda no PC do evento.
- Em local com internet instável, avise a coordenação antes do evento (ver seção 8, item "modo sem internet").

---

## 3. PC do evento

### 3.1 Ligar
Dê dois cliques em `C:\Projetos\Projeto_A2_Eventos\ligar-ia-facial.bat`. Ele:
- liga o motor de IA, o agente e o retransmissor de vídeo;
- abre a **Central de Monitoramento** no navegador;
- fica vigiando e religa o que cair. **Deixe essa janela aberta** durante todo o evento.

### 3.2 Conferir
- Painel > Monitor > aba **Saúde**: "Saúde do vídeo (PC do evento)" deve listar as câmeras com fps.
- Central (`http://localhost:8766/central/`): selo verde "Câmeras ao vivo", "Vídeo direto (WebRTC)" e "IA na GPU".
- Para abrir a Central de novo: `abrir-central.bat`.
- **Central em outro computador**: Leitores e dispositivos > Agentes locais > botão **Central** do agente. Escolha *Só este PC* (padrão), *Rede local do evento* (outro computador da sala, com a chave de acesso) ou *Tailscale* (operador remoto). Vale na hora, fica gravado no PC e a janela mostra os endereços para abrir. Precisa do agente 3.1 ou mais novo (`ligar-ia-facial.bat`).
- **Chave de acesso** (na mesma janela, só administrador): **Mostrar chave** para copiar e enviar ao operador por canal seguro; **Gerar nova chave** quando alguém não deve mais entrar (a antiga para na hora e todos que estavam dentro saem). No outro computador, abra o endereço, cole a chave e clique em Entrar; vale 12 horas naquele navegador.

### 3.3 Energia e Windows
- No Windows, configure para **nunca suspender nem desligar a tela** quando estiver na tomada.
- Desative a atualização automática do Windows nos dias do evento.
- Ligue o PC na tomada (de preferência com nobreak).

---

## 4. Leitores faciais (catracas e portarias)

### 4.1 Marcas suportadas

| Marca | Situação |
|---|---|
| **Intelbras** (SS 5530, SS 5541 e similares) | Completa e testada |
| **Dahua** | Mesma API da Intelbras; tratar como Intelbras |
| **Hikvision** | **Limitada:** o sistema ainda não envia a foto ao leitor. Não usar para reconhecimento até ser corrigido (seção 8) |
| Outras | Não suportadas: o sistema trataria como Hikvision. Não usar |

### 4.2 Preparar o leitor (no próprio equipamento)
1. Ligue o leitor no cabo de rede e reserve o IP no roteador (2.2).
2. Acerte **data, hora e fuso** (GMT-3, Brasília). Relógio errado faz o leitor negar ou registrar horário errado.
3. Anote usuário e senha de administrador.
4. Leitor que já foi usado com outro sistema: veja 6.2 ("nega todo mundo").

### 4.3 Cadastrar no painel
Configurações > **Dispositivos** > novo dispositivo:

| Campo | O que colocar |
|---|---|
| Nome | Onde está: "Portaria Principal", "Camarim" |
| Marca | Intelbras ou Dahua |
| IP e porta | IP reservado; porta 80 |
| Usuário e senha | Os do leitor |
| Área | A área que ele controla. **Sem área = todos os cadastrados entram nele** |
| Modo | **Credenciamento** (só identifica e abre a ficha para o operador) ou acesso (libera a passagem) |
| Fluxo | Entrada, saída ou alternado (entra e sai pelo mesmo leitor) |
| Conexão com o leitor | O agente do PC do evento (quando a API está na nuvem) |
| Controla relé | Ligado se o leitor abre a catraca/porta |
| Confirmação pela IA | Deixe "o leitor decide". Use a IA só em área crítica |
| Pessoa bloqueada ou expulsa | **Manter cadastrada e suspensa** (padrão) ou Remover (ver 4.7) |
| Usar também como câmera | Opcional: o vídeo do leitor aparece nas câmeras |

**Uma vez por evento**, no cartão **Endereço do servidor para os leitores** (topo da mesma tela), informe para onde os leitores perguntam se liberam a pessoa:
- servidor no PC do evento: o IP do PC na rede local e a porta **3001** (ex.: 192.168.1.129 e 3001);
- servidor na VPS: **leitores.nzt.app.br** e porta **80**.

O endereço fica salvo para este evento. "Padrão geral" vale para eventos sem endereço próprio. Em branco, o sistema usa a configuração do servidor (`.env`). O cartão mostra qual está **em uso agora**.

Depois de salvar o leitor:
1. **Config Online**: grava no leitor o endereço do cartão acima (deixe a janela em branco). Só digite um endereço na janela para um caso isolado. Faça sempre depois de trocar IP, servidor ou firmware.
2. **Sync**: envia as pessoas das áreas deste leitor.
3. **Diagnosticar** (botão no card do leitor): confere tudo de uma vez e mostra como corrigir.

### 4.3.1 Diagnosticar
O botão **Diagnosticar** só lê o leitor (não muda nada) e mostra cada item em verde (ok), amarelo (atenção) ou vermelho (corrigir). Onde houver, um botão ao lado corrige com um clique.

| Item | O que confere | Correção pelo botão |
|---|---|---|
| Cadastro do leitor | IP, senha e área preenchidos | Editar leitor |
| Agente do PC do evento | O PC do evento está conectado (a nuvem só alcança o leitor por ele) | — (rode `ligar-ia-facial.bat`) |
| Comunicação e senha | O leitor responde e aceita usuário e senha | Editar leitor |
| Relógio do leitor | Diferença para a hora de Brasília | Acertar relógio (liga também a hora automática) |
| Modo online | O leitor está em modo online e sabe o endereço do servidor | Config Online |
| Sinal do leitor para o servidor | Quando o leitor chamou o servidor pela última vez | Config Online |
| Pessoas no leitor | Quantas há no leitor e quantas deveriam estar | Sync ou Limpar e sincronizar |
| Comandos pendentes | Cadastros/remoções esperando o leitor | Reprocessar fila |

Rode o diagnóstico na montagem, depois de qualquer troca (IP, firmware, roteador) e sempre que um leitor se comportar estranho.

### 4.4 Quem vai para cada leitor
- Leitor de **credenciamento**: todos do evento.
- Leitor **sem área**: todos do evento.
- Leitor **com área**: só quem tem aquela área (pela ficha da pessoa ou pelo lote da pulseira).

Mudou alguma coisa (expulsão, bloqueio, área, pulseira, lote, foto)? O sistema atualiza os leitores **sozinho, em segundos**. Leitor desligado recebe as mudanças quando voltar.

### 4.5 Testes obrigatórios (com o cadastro de teste)
Faça em cada leitor, antes de abrir as portas:

| Teste | Esperado |
|---|---|
| Pessoa liberada para a área passa | Libera e registra no Monitor |
| Pessoa **sem** a área | Nega |
| **Bloqueie** a pessoa no painel e tente passar | Nega em até alguns segundos |
| **Desbloqueie** (com motivo) e tente de novo | Libera |
| Dê uma área nova à pessoa e teste no leitor dessa área | Libera em até alguns segundos |
| Leitor alternado: passe duas vezes | 1ª entrada, 2ª saída |

### 4.6 Sem internet (modo online)
Hoje os leitores ficam em **modo online**: a cada passagem perguntam ao servidor, que aplica todas as regras na hora (área, horário, antirretorno, bloqueio). Se o leitor não alcança o servidor, **ele nega**.

O comportamento sem internet (o leitor decidir sozinho com a lista que já tem) **ainda vai ser testado no equipamento** e entrará aqui. Até lá, não prometa funcionamento sem internet.

### 4.7 Bloqueado ou expulso
- **Manter cadastrada e suspensa (padrão):** o rosto continua no leitor com a validade vencida, e ele nega a passagem. Ao desbloquear (com motivo), o sistema renova a validade e a pessoa volta a passar na hora.
- **Remover do leitor:** o rosto sai do leitor; ao desbloquear, é cadastrado de novo.
- Recusados e inativos sempre saem do leitor.
- Leitor que não suporta suspensão (hoje: Hikvision) remove automaticamente.
- **Empresa bloqueada:** todos os funcionários dela ficam suspensos nos leitores em poucos segundos (mesma regra acima). Ao reativar a empresa, voltam a passar — exceto quem estiver bloqueado individualmente.

**Teste a suspensão no equipamento** (bloqueie, tente passar; desbloqueie, tente passar) antes de depender dela sem internet.

---

## 5. Câmeras

### 5.1 Configurar na própria câmera (app ou página da câmera)
- Usuário e senha para RTSP (na Mercusys/Tapo: "Conta da câmera" no app).
- **Sub-stream em 720p e 8 a 10 quadros por segundo.** É o vídeo que a IA analisa; deixá-lo leve é o que mais alivia o PC do evento.
- Stream principal na resolução máxima (é o que aparece na tela grande da Central).
- Câmera apontada para onde os rostos passam de frente, na altura das pessoas, sem contraluz (porta com sol atrás é o pior caso).

### 5.2 Cadastrar no painel
Monitor > Câmeras > **Gerenciar câmeras** > nova câmera. Escolha o fabricante (modelo) e preencha IP, porta, usuário e senha: o sistema monta o endereço sozinho e mostra embaixo **"Endereço que será usado"** (com a senha escondida). Modelo com canal (gravadores com várias câmeras) mostra o campo **Canal**.

Modelos que vêm com o sistema:

| Modelo | Endereço principal | Sub-stream |
|---|---|---|
| Mercusys / Tapo | `rtsp://IP:554/stream1` | `stream2` |
| Intelbras / Dahua | `rtsp://IP:554/cam/realmonitor?channel=1&subtype=0` | `subtype=1` |
| Hikvision | `rtsp://IP:554/Streaming/Channels/101` | `102` |
| Genérica | Informe o endereço RTSP completo no campo "Endereço RTSP" | Nas opções avançadas |
| RTSP / OBS / Webcam | Webcam do PC: escreva `webcam` (ou `webcam:1` para a segunda) no endereço | — |

### 5.2.1 Câmera de uma marca que não está na lista
Cadastre o modelo **uma vez** em Configurações > Equipamentos > **Modelos de câmera** > Novo modelo. Ele passa a aparecer no cadastro de câmeras de todos os eventos.

1. Descubra o endereço RTSP no manual do fabricante, no site do fabricante ou com o programa gratuito *ONVIF Device Manager* (mostra os endereços de câmeras ONVIF da rede).
2. Troque as partes variáveis pelos marcadores: **`{auth}`** (usuário e senha, vêm de cada câmera), **`{ip}`**, **`{porta}`** e **`{canal}`**.
   Ex.: o manual diz `rtsp://admin:12345@192.168.1.64:554/h264/ch1/sub` → modelo `rtsp://{auth}{ip}:{porta}/h264/ch{canal}/sub`.
3. Preencha também o endereço do **sub-stream** (o vídeo leve). Sem ele, a IA analisa o vídeo principal, mais pesado.
4. Em **Observações**, deixe a dica para a próxima equipe (onde fica a senha, configuração especial).
5. Confira o **Exemplo** que aparece embaixo de cada campo antes de salvar.

Nunca coloque usuário e senha no modelo: o sistema recusa. Modelos de fábrica podem ser editados e desativados, mas não apagados.

Depois de salvar: **Diagnosticar** (5.3). Escolha o modo:
- **Só monitorar:** vídeo, sem IA.
- **IA ao assistir:** reconhece só com alguém olhando.
- **IA 24 h:** reconhece e alerta o tempo todo.

Escolha também a gravação: desligada, contínua ou só em alertas.

### 5.3 Testar
- **Diagnosticar** (Configurações > Câmeras, ou o ícone verde em Monitor > Gerenciar câmeras): testa, pela rede do evento, o cadastro, o PC do evento, o retransmissor de vídeo, a rede (ping e porta do vídeo), a imagem, o vídeo leve (miniatura), a IA e a gravação. Cada problema vem com a correção e, quando é cadastro, o botão **Editar câmera**. Leitura rápida:
  - Rede com erro: câmera desligada, fora do switch do evento ou com IP trocado.
  - Rede ok, imagem com erro: usuário, senha ou caminho do vídeo errado (confira o modelo em Configurações > Modelos de câmera).
  - Miniatura com alerta: a câmera não tem sub-stream; preencha o endereço dele na câmera.
- Central: a câmera aparece ao vivo, com fps e resolução no canto.
- Fique na frente da câmera com o cadastro de teste: a caixa deve mostrar o nome (verde).
- Alvo de watchlist aparece em vermelho, com alarme. Em **amarelo, "possível alvo"**, é rosto pequeno ou semelhança baixa: aproxime a câmera ou melhore a luz.

### 5.4 Câmera com giro (Mercusys MC210, Tapo e similares)
Câmeras que giram (Mercusys MC210, por exemplo) ganham controles na tela grande do Monitor.

**Ligar:** Monitor > Gerenciar câmeras > editar a câmera > marque **Câmera com giro**. A porta ONVIF é **2020** nas Mercusys e Tapo. Usa a mesma **conta da câmera** (usuário e senha que você criou no aplicativo).

**Usar:** abra a câmera em tela grande e toque no vídeo para mostrar os controles:
- **Setas:** mantenha apertado para girar; solte para parar. A câmera também para sozinha em 1 segundo se a conexão cair.
- **Zoom + e zoom -:** mesma regra das setas.
- **Velocidade:** deslize para girar mais devagar (ex.: para acompanhar uma pessoa).
- **Posições:** gire até o ponto desejado, escreva um nome e clique em **Gravar aqui**. Depois, toque no nome para a câmera ir até lá.
- **Parar:** o botão amarelo interrompe qualquer movimento.

**Antes do evento, teste** (o Diagnosticar da câmera mostra o item "Giro da câmera (ONVIF)"):
- Gire para cima, baixo, esquerda e direita. Se uma direção não responde, atualize o firmware da câmera e confira se **"Inverter imagem" está desligado** no aplicativo.
- Grave uma posição e volte a ela.
- Se o giro não responde, a causa mais comum é a porta ONVIF ou a conta da câmera. O diagnóstico aponta a correção.

**Visão noturna:** quando a câmera troca para o infravermelho (imagem em preto e branco), aparece o aviso **Visão noturna** no topo da tela. A IA reconhece menos sem luz: deixe luz na portaria sempre que possível.

**Atenção:** a câmera Wi-Fi tem cerca de 1 segundo de atraso entre a imagem e o giro. Movimento contínuo gasta o motor: use posições salvas para rondas.

---

## 6. Problemas comuns

### 6.1 Câmeras

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Senha incorreta" / sem imagem | Usuário/senha RTSP errados | Edite a câmera e digite a senha de novo (o painel não mostra a senha salva) |
| Imagem travada ou "foto parada" no painel | Painel aberto fora do PC do evento: lá é 1 imagem/s de propósito | Use a **Central** no PC do evento para tempo real |
| Imagem travando na Central | Wi-Fi fraco na câmera ou PC sem folga | Câmera no cabo; confira a aba Saúde (fps baixo); sub-stream em 720p/8-10 fps |
| Sempre "Desconhecido" | Pessoa sem foto/biometria, de outro evento, ou rosto pequeno | Confira o cadastro; aproxime a câmera; veja o motivo no diagnóstico da IA (Configurações > IA facial) |
| Câmera sumiu depois de um tempo | IP mudou | Reserve o IP no roteador (2.2) e corrija na câmera |

### 6.2 Leitores

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Leitor **offline** no painel | Desligado, IP mudou, rede diferente | `ping` no IP (2.3); reserve o IP; edite o IP no painel |
| Nega todo mundo, mesmo cadastrado | Relógio errado ou configuração antiga de outro sistema | Acerte data/hora/fuso; firmware novo (SS 5541 MF W 3.x) com config antiga: restaurar padrão mantendo a rede e fazer **Config Online** de novo |
| Não reconhece uma pessoa | Sem foto, sem a área do leitor, ou foto ruim | Confira a ficha (foto e áreas); **Sync** no leitor |
| Ficha não abre para o operador (credenciamento) | Leitor sem operador vinculado | Vincule o leitor à estação do operador |
| Libera quem não devia | Leitor sem área (todos entram nele) | Defina a área do leitor |
| Muitas pessoas erradas no leitor | Leitor dessincronizado | **Limpar e sincronizar** no card do leitor (apaga os rostos e manda a lista certa) |

### 6.3 PC do evento

| Sintoma | O que fazer |
|---|---|
| Central não abre | Rode `ligar-ia-facial.bat` e depois `abrir-central.bat` |
| "Motor de IA desligado" | Painel > IA: ligue o motor; ou rode `ligar-ia-facial.bat` |
| Lento | Gerenciador de Tarefas: veja CPU de python, ffmpeg e go2rtc; reduza câmeras em "IA 24 h" e confira o sub-stream das câmeras |

---

## 7. Atualizar equipamentos e encerrar o evento

### Atualizar firmware de leitor ou câmera
- Só fora do horário de operação.
- Depois: acerte o relógio, faça **Config Online** e **Sync** (leitor) ou **Diagnosticar** (câmera).
- Firmware novo pode apagar a configuração: refaça os testes da seção 4.5.

### Fim do evento
- **Esvaziar os leitores:** no card do leitor, abra os controles (seta) e clique em **Esvaziar leitor** (só administrador; digite o nome do leitor para confirmar). Apaga todas as pessoas e rostos do equipamento e cancela os cadastros pendentes. Depois disso o leitor **não recebe mais ninguém** — nem pela varredura da madrugada — até alguém clicar em **Sync** ou **Limpar e sincronizar**. Se a mensagem disser que ainda restam cadastros, repita ou restaure o padrão de fábrica no próprio leitor.
- "Limpar e sincronizar" **não** esvazia: apaga e reenvia as pessoas do evento.
- Biometria é dado sensível (LGPD): não deixe rostos em equipamento alugado ou que vai para outro lugar.
- As gravações ficam no PC do evento (`NZT-Gravacoes`) e são apagadas pelo prazo configurado.

---

## 8. O que ainda não dá para fazer pela interface

O objetivo é que tudo seja configurado pelo painel. Hoje, estes pontos ainda dependem de um desenvolvedor:

| O quê | Hoje | Plano |
|---|---|---|
| Leitores Hikvision | Não enviam a foto | Completar o adaptador e testar com um equipamento |
| Outras marcas de leitor | Não suportadas | Cadastro de modelos + adaptador por marca |
| Modo sem internet do leitor | A definir no teste com o equipamento | Opção por leitor no painel |
