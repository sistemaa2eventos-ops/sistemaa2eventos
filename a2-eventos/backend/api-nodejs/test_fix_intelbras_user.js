const { supabase } = require('./src/config/supabase');
const IntelbrasService = require('./src/modules/devices/intelbras.service');

async function testFix() {
  const { data: device } = await supabase.from('dispositivos_acesso').select('*').eq('ip_address', '192.168.1.51').single();
  const service = new IntelbrasService(device);

  console.log('--- TESTANDO ATUALIZAÇÃO DO USUÁRIO COM PERMISSÃO DE PORTA ---');

  // Testando formato nativo Dahua/Intelbras
  const payload = {
    UserList: [{
      UserID: '01059674165',
      UserName: 'WANDERLEY FERREIRA ADORNO FILHO',
      UserType: 0,
      Authority: 1, // 1 = Normal/Authorized user
      Doors: [0],   // Porta 1
      TimeSections: [0], // Período 24h
      ValidFrom: '2020-01-01 00:00:00',
      ValidTo: '2037-12-31 23:59:59'
    }]
  };

  try {
    const res = await service._postJson('/cgi-bin/AccessUser.cgi', { action: 'modifyMulti' }, payload);
    console.log('Resposta modifyMulti:\n', res);
  } catch (e) {
    console.log('modifyMulti falhou, tentando insertMulti...', e.message);
    try {
      const res2 = await service._postJson('/cgi-bin/AccessUser.cgi', { action: 'insertMulti' }, payload);
      console.log('Resposta insertMulti:\n', res2);
    } catch (e2) {
      console.error('Erro insertMulti:', e2.message);
    }
  }

  console.log('\n--- VERIFICANDO DADOS DO USUÁRIO NO LEITOR ---');
  const userList = await service.listUsers(['01059674165']);
  console.log('Dados atuais do usuário:\n', userList);
}

testFix().catch(console.error);
