# Cópia dos documentos no Google Drive

O sistema copia cada documento enviado (link de pré-cadastro, portal da empresa e painel) para a pasta **NZT - Documentos** de uma conta Google. A pasta é organizada em **Evento / Empresa / Pessoa**.

O acesso usa a permissão `drive.file`: o sistema só enxerga a pasta que ele mesmo criou. Nada mais do Drive da conta fica visível para ele.

Leva cerca de 10 minutos, uma vez só.

## 1. Criar o projeto no Google Cloud (gratuito)

1. Acesse <https://console.cloud.google.com/> com a conta que vai guardar os documentos (por exemplo, `sistemaa2eventos@gmail.com`).
2. No topo, clique em **Selecionar projeto → Novo projeto**, dê o nome `NZT Documentos` e clique em **Criar**.
3. Com o projeto selecionado, abra **APIs e serviços → Biblioteca**, procure **Google Drive API** e clique em **Ativar**.

## 2. Tela de consentimento

1. Abra **APIs e serviços → Tela de permissão OAuth** (em algumas contas aparece como "Google Auth Platform → Branding").
2. Preencha:
   - **Tipo de usuário:** Externo.
   - **Nome do app:** `NZT Intelligent Control System`.
   - **E-mail de suporte** e **contato do desenvolvedor:** o seu e-mail.
3. Em **Branding**, preencha:

   | Campo | Valor |
   |---|---|
   | Logotipo | **deixe em branco**: com logotipo, o Google exige verificação de marca, que leva dias |
   | Página inicial do app | `https://cadastro.nzt.app.br` |
   | Política de privacidade | `https://cadastro.nzt.app.br/politica-de-privacidade` |
   | Domínios autorizados | `nzt.app.br` |

   Se o Google pedir a comprovação do domínio:
   1. Abra o **Search Console** e escolha **Domínio**: `nzt.app.br`.
   2. Copie o registro **TXT** que ele mostrar.
   3. No Cloudflare, em `nzt.app.br` → **DNS → Adicionar registro**, crie: tipo TXT, nome `@`, conteúdo = o texto do Google.
   4. Volte ao Search Console e clique em **Verificar**.

   O registro TXT não afeta o site, o painel nem os leitores.
4. Em **Escopos** (ou **Acesso a dados**), adicione `.../auth/drive.file`, que aparece como "Ver, editar, criar e excluir apenas os arquivos específicos do Google Drive que você usa com este app".
5. Em **Público-alvo**, clique em **Publicar app** para colocá-lo **Em produção**.
   - Se ficar em "Teste", o Google desconecta o sistema a cada 7 dias.
   - Com o escopo `drive.file`, não é preciso pedir verificação ao Google.

## 3. Credencial do sistema

1. Abra **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Escolha **Tipo de aplicativo: Aplicativo da Web** e o nome `Servidor NZT`.
3. Em **URIs de redirecionamento autorizados**, adicione exatamente:
   ```
   https://api.nzt.app.br/api/drive/callback
   ```
4. Clique em **Criar** e copie o **ID do cliente** e a **Chave secreta do cliente**.

## 4. Colocar no servidor

Coloque as duas chaves no arquivo `backend/api-nodejs/.env` da VPS. Nunca as coloque no git nem no chat:

```
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=....
```

Depois reinicie a API:

```
cd /root/Projeto_A2_Eventos && docker-compose up -d api
```

## 5. Conectar

1. No painel, abra **Configurações → Comunicação & Integrações → Canais & Conexões** e vá até o cartão **Cópia dos documentos no Google Drive**.
2. Clique em **Conectar Google Drive** e entre com a conta. O Google avisa que o app "quer acessar os arquivos que ele criou"; clique em **Continuar**.
3. De volta ao painel, clique em **Copiar tudo deste evento** para levar os documentos que já existem.

A partir daí, todo documento novo é copiado sozinho em segundos.

## Como fica no Drive

```
NZT - Documentos/
  Show X/
    DAK/
      ANDRÉ LOPES DE LIMA NETO - 123.456.789-00/
        RG-CNH - FRENTE.pdf
        ASO (válido até 30-06-2027).pdf
      Documentos da empresa/
        CONTRATO SOCIAL.pdf
```

## Problemas comuns

- **"A autorização do Google expirou ou foi revogada"**: o app ficou em modo Teste, ou alguém removeu o acesso em <https://myaccount.google.com/permissions>. Publique o app (passo 2.5) e clique em **Conectar** de novo.
- **"redirect_uri_mismatch"**: o endereço do passo 3.3 não está exatamente igual, com `https`, sem barra no final.
- **Documentos com erro**: o cartão mostra o motivo. O botão **Copiar tudo deste evento** tenta de novo só os que faltam, sem duplicar.
