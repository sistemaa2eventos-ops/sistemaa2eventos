const policyEngine = require('../backend/api-nodejs/src/modules/checkin/policy.service');

async function test() {
    console.log("Testing PolicyEngine roles...");
    
    // Mocking logger and cache to avoid errors in scratch test
    // Actually, PolicyEngine already requires them.
    
    const rolesToTest = ['master', 'admin_master', 'admin', 'operador'];
    
    for (const role of rolesToTest) {
        // hasPermission should return true for master, admin_master, and admin (due to bypass)
        const hasPerm = await policyEngine.hasPermission(role, 'empresas', 'leitura');
        console.log(`Role [${role}] -> permission 'empresas:leitura': ${hasPerm}`);
    }
}

test();
