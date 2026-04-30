const axios = require('axios');
const jwt = require('jsonwebtoken');

// Criar o token primeiro para não ter erro 401
const token = jwt.sign({ id: '00000000-0000-0000-0000-000000000000', role: 'admin' }, process.env.JWT_SECRET || 'test_secret', { expiresIn: '1h' });

setTimeout(async () => {
    try {
        const payload = {
            Events: [
                {
                    Action: "Pulse",
                    Code: "AccessControl",
                    Data: {
                        UserID: "12349133748",
                        Event: "Pass",
                        Method: "Face",
                        ReaderID: "1",
                        Similarity: 99.9,
                        Time: new Date().toISOString()
                    }
                }
            ]
        };

        const response = await axios.post('http://127.0.0.1:3001/api/dispositivos/webhook/intelbras', payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-evento-id': '23ab71b5-d2a5-4c91-a507-2c0a9c82f44e',
                'x-forwarded-for': '127.0.0.1' // Para bater com o terminal que vamos cadastrar
            }
        });
        console.log('Intelbras Mock Triggered:', response.data);
    } catch (error) {
        console.error('Error triggering Intelbras Mock:', error.response ? error.response.data : error.message);
    }
}, 30000); // 30 seconds delay

console.log("Waiting 30 seconds before triggering the facial read...");
