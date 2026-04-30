const axios = require('axios');

async function simulatePush() {
    const url = 'http://localhost:3001/api/intelbras/events';

    // Simular evento de face reconhecida
    // UserID deve existir no banco de dados (usando um ID comum ou CPF de teste se houver)
    const event = {
        "Events": [
            {
                "Action": "Pulse",
                "Code": "AccessControl",
                "Data": {
                    "UserID": "01059674165",
                    "UserName": "Teste Simulado",
                    "Event": "Entry",
                    "Method": "Face",
                    "Time": new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''),
                    "ReaderID": "1"
                },
                "Index": 0
            }
        ]
    };

    console.log('Sending simulated event to:', url);
    try {
        const response = await axios.post(url, event);
        console.log('Response:', response.status, response.data);
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

simulatePush();
