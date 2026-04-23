const axios = require('axios');
require('dotenv').config({ path: 'c:/Projetos/Projeto_A2_Eventos/a2-eventos/backend/api-nodejs/.env' });

async function checkOpenAPI() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
  const res = await axios.get(url);
  const defs = res.data.definitions;
  if(defs && defs.pulseira_areas_permitidas) {
     console.log('Columns:', Object.keys(defs.pulseira_areas_permitidas.properties));
  } else {
     console.log('Table not found in OpenAPI spec.');
  }
}
checkOpenAPI();
