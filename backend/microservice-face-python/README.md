# A2 Eventos - Microsserviço de Reconhecimento Facial

## Descrição
Microsserviço responsável pelo reconhecimento facial em tempo real para controle de acesso.

## Tecnologias
- Python 3.9
- FastAPI
- OpenCV
- Supabase

## Instalação

1. Criar ambiente virtual:
```bash
python -m venv venv

2. Ativar ambiente virtual:
```bash
venv\Scripts\activate

3. Instalar dependências:
```bash
pip install -r requirements.txt

4. Configurar variáveis de ambiente:
```bash
cp .env.example .env
# Editar .env com suas credenciais
```

5. Executar o serviço:
```bash
uvicorn src.main:app --reload --host [IP_ADDRESS] --port 8000
```

## Docker

1. Construir a imagem:
```bash
docker build -t a2-face-service .
```

2. Executar com Docker Compose:
```bash
docker-compose up -d
```

## Estrutura do Projeto

```
src/
├── main.py             # Ponto de entrada da API
├── camera_manager.py   # Gerenciamento de câmeras
├── face_recognition.py # Lógica de reconhecimento facial
├── supabase.py         # Cliente Supabase
├── utils.py            # Utilitários
└── config.py           # Configurações
```

## Endpoints

- `GET /health`: Verificar status do serviço
- `GET /status`: Status do reconhecimento facial
- `GET /faces`: Listar faces cadastradas
- `POST /faces`: Cadastrar nova face
- `DELETE /faces/{id}`: Remover face
- `GET /eventos/ativo`: Buscar evento ativo
- `POST /eventos/{id}/checkin`: Registrar check-in
- `POST /eventos/{id}/checkout`: Registrar checkout
- `GET /eventos/{id}/participantes`: Listar participantes
- `GET /eventos/{id}/presenca`: Relatório de presença

## Logs

Os logs são salvos em `logs/face_recognition.log`

## Contribuição

1. Crie uma branch para sua feature (`git checkout -b feature/NovaFuncionalidade`)
2. Commite suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
3. Push para a branch (`git push origin feature/NovaFuncionalidade`)
4. Abra um Pull Request

## Licença

Este projeto está sob a licença MIT.

## Contato

[A2 Eventos] - [EMAIL_ADDRESS]  
[https://github.com/A2-Eventos] 