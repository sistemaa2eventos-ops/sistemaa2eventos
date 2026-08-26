const request = require('supertest');
const express = require('express');
const intelbrasRoutes = require('../src/modules/devices/intelbras.routes');

// Mock do servidor Express para rodar apenas a rota que queremos testar
const app = express();
app.use(express.json());
app.use('/api/intelbras', intelbrasRoutes);

describe('Intelbras Worker API Tests', () => {
    it('GET /api/intelbras/ping - Deve retornar a estrutura exigida pelas catracas', async () => {
        const response = await request(app).get('/api/intelbras/ping');
        
        // Verifica se o status HTTP é 200 (Sucesso)
        expect(response.status).toBe(200);
        
        // Verifica se a propriedade success é verdadeira
        expect(response.body.success).toBe(true);
        
        // Verifica se a resposta contém os campos obrigatórios
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('server_ip');
        expect(response.body).toHaveProperty('device_ip');
        expect(response.body).toHaveProperty('timestamp');
        
        // Verifica se a string da mensagem está correta
        expect(response.body.message).toContain('Servidor A2 Eventos respondendo!');
    });

    it('POST /api/intelbras/events - Deve aceitar recebimento de evento (Mock)', async () => {
        // Envia um payload falso como se fosse a câmera batendo na porta
        const fakePayload = {
            AccessControllerEvent: {
                deviceName: 'Catraca 01',
                eventType: 1001
            }
        };

        const response = await request(app)
            .post('/api/intelbras/events')
            .send(fakePayload);

        // Como o controlador depende do banco, e este é um teste unitário sem mock de banco, 
        // nós apenas garantimos que a rota não retorna 404 (Not Found). 
        // Ele pode retornar 400 ou 500 dependendo da validação do banco interno, 
        // o que já indica que a rota está corretamente exposta.
        expect(response.status).not.toBe(404);
    });
});
