const net = require('net');

function checkPort(ip, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
        
        socket.connect(port, ip);
    });
}

async function scan() {
    const ip = '192.168.1.17';
    const ports = [80, 8080, 37777, 8888, 5000];
    
    console.log(`Scanning IP ${ip}...`);
    for (const port of ports) {
        const open = await checkPort(ip, port);
        console.log(`Port ${port}: ${open ? 'OPEN ✅' : 'CLOSED ❌'}`);
    }
}

scan();
