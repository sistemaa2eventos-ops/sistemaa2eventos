const { supabase } = require('./src/config/supabase');
const { getHojeLocal } = require('./src/utils/dateUtils');
const validation = require('./src/modules/checkin/services/validation.service');

async function checkFases() {
  const { data: evento } = await supabase.from('eventos').select('*').eq('id', '4e1b5934-034d-4e61-a3da-533b7da4f3a8').single();
  const { data: pessoa } = await supabase.from('pessoas').select('*').eq('id', '2b6d8295-44bd-4f8b-8173-7acd29d97849').single();

  try {
    const res = await validation.validateAccessRules(
      evento.id,
      pessoa,
      'checkin',
      'facial',
      new Date(),
      100,
      null
    );
    console.log('VALIDATION RESULT: SUCESSO!', res);
  } catch (err) {
    console.error('VALIDATION RESULT: FALHOU!', err.message);
  }
}

checkFases().catch(console.error);
