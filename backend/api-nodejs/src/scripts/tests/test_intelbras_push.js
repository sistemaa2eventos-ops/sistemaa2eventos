const axios = require('axios');

async function testPush() {
    try {
        const payload = {
            Events: [
                {
                    Action: "Pulse",
                    Code: "AccessControl",
                    Data: {
                        UserID: "00000000570", // A known CPF or ID from the DB
                        Event: "Pass",
                        Method: "Face",
                        ReaderID: "1",
                        Similarity: 98.5,
                        Time: new Date().toISOString()
                    }
                }
            ]
        };

        const response = await axios.post('http://127.0.0.1:3001/api/dispositivos/webhook/intelbras', payload, {
            headers: {
                'Authorization': `Bearer NEXUS_V1_SECRET_7A9B3C`,
                'x-evento-id': 'b96792ed-077a-4ec6-8b9a-76d70fb56254' // ID de evento teste 
            }
        });
        console.log('Response:', response.data);
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

testPush();
