const TurnstileHTTPAPI = require('../protocols/turnstile/http-api');

const catraca = new TurnstileHTTPAPI('192.168.1.100', 8080, 'sua-api-key');

async function testarCatraca() {
  console.log('🔄 Testando catraca...');
  
  const status = await catraca.getStatus();
  console.log('Status:', status);
  
  if (status.success && status.status === 'online') {
    console.log('🔓 Liberando catraca...');
    const result = await catraca.open();
    console.log('Resultado:', result);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('🔒 Bloqueando catraca...');
    const closeResult = await catraca.close();
    console.log('Resultado:', closeResult);
    
    const count = await catraca.getCount();
    console.log('Total de acessos:', count);
  } else {
    console.log('❌ Catraca offline');
  }
}

testarCatraca();
