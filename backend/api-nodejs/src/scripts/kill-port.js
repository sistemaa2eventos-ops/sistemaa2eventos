/**
 * kill-port.js
 * Libera a porta especificada antes de iniciar o servidor.
 * Executado automaticamente pelo script "predev" no package.json.
 */

const { execSync } = require('child_process');

const PORT = process.env.PORT || 3001;

try {
    // Encontra o PID do processo usando a porta
    const result = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
    const lines = result.trim().split('\n');

    const pids = new Set();
    for (const line of lines) {
        // Pega apenas linhas LISTENING
        if (line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0') {
                pids.add(pid);
            }
        }
    }

    if (pids.size === 0) {
        console.log(`✅ Porta ${PORT} está livre.`);
        process.exit(0);
    }

    for (const pid of pids) {
        console.log(`⚠️  Porta ${PORT} em uso pelo PID ${pid}. Encerrando...`);
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'inherit' });
    }

    console.log(`✅ Porta ${PORT} liberada com sucesso.`);
} catch (err) {
    // Se o findstr não encontrar nada, retorna exit code 1 — porta está livre
    if (err.status === 1) {
        console.log(`✅ Porta ${PORT} está livre.`);
    } else {
        console.error(`❌ Erro ao verificar porta ${PORT}:`, err.message);
    }
}
