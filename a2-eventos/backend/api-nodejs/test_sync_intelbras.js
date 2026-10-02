const { supabase } = require('./src/config/supabase');
const IntelbrasService = require('./src/modules/devices/intelbras.service');
const imageProcessor = require('./src/utils/imageProcessor');
const axios = require('axios');

async function main() {
  console.log('1. Buscando pessoa Wanderley...');
  const { data: pessoa, error: pErr } = await supabase
    .from('pessoas')
    .select('*')
    .eq('id', '2b6d8295-44bd-4f8b-8173-7acd29d97849')
    .single();

  if (pErr || !pessoa) {
    console.error('Erro ao buscar pessoa:', pErr);
    return;
  }
  console.log(`Pessoa: ${pessoa.nome_completo}, CPF: ${pessoa.cpf}, Status: ${pessoa.status_acesso}`);

  if (!pessoa.foto_url) {
    console.error('Pessoa sem foto_url cadastrada!');
    return;
  }
  console.log('Foto URL:', pessoa.foto_url);

  console.log('\n2. Baixando imagem da foto...');
  let photoBuffer;
  if (pessoa.foto_url.startsWith('data:image')) {
    const base64Clean = pessoa.foto_url.replace(/^data:image\/\w+;base64,/, '');
    photoBuffer = Buffer.from(base64Clean, 'base64');
  } else {
    const resp = await axios.get(pessoa.foto_url, { responseType: 'arraybuffer' });
    photoBuffer = Buffer.from(resp.data);
  }
  console.log(`Foto baixada com sucesso! Tamanho original: ${Math.round(photoBuffer.length / 1024)} KB`);

  console.log('\n3. Otimizando imagem para hardware facial...');
  const optimizedBuffer = await imageProcessor.optimizeForHardware(photoBuffer);
  const base64Optimized = optimizedBuffer.toString('base64');
  console.log(`Foto otimizada! Tamanho final: ${Math.round(optimizedBuffer.length / 1024)} KB`);

  console.log('\n4. Buscando dispositivo 192.168.1.51...');
  const { data: device, error: dErr } = await supabase
    .from('dispositivos_acesso')
    .select('*')
    .eq('ip_address', '192.168.1.51')
    .single();

  if (dErr || !device) {
    console.error('Erro ao buscar dispositivo:', dErr);
    return;
  }
  console.log('Dispositivo:', device.nome, device.ip_address, 'user:', device.user_device);

  console.log('\n5. Conectando e enviando usuário + face para o leitor Intelbras...');
  const service = new IntelbrasService(device);
  
  try {
    const res = await service.enrollUser(pessoa, base64Optimized);
    console.log('>>> SUCESSO AO CADASTRAR NO TERMINAL! <<< Result:', res);
  } catch (err) {
    console.error('>>> ERRO AO CADASTRAR NO TERMINAL! <<<', err.message);
  }
}

main().catch(console.error);
