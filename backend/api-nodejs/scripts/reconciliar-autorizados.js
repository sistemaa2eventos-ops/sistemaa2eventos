/**
 * Reconcilia "autorizado" com a documentação validada.
 * Regra: autorizado só com documentação aprovada pela auditoria. Quem tem documento exigido
 * pendente volta para "pendente" (liberação do operador no turno não muda o estado).
 *
 * Uso (na pasta backend/api-nodejs):
 *   node scripts/reconciliar-autorizados.js                 → só lista (dry-run) em todos os eventos
 *   node scripts/reconciliar-autorizados.js --evento=<uuid> → só lista um evento
 *   node scripts/reconciliar-autorizados.js --aplicar       → grava a correção
 */
const { supabase } = require('../src/config/supabase');
const documentoService = require('../src/modules/entities/documento.service');
const { buscarTodos } = require('../src/utils/buscarTodos');
const { emParalelo } = require('../src/utils/lotes');

async function main() {
    const args = process.argv.slice(2);
    const aplicar = args.includes('--aplicar');
    const eventoArg = args.find(a => a.startsWith('--evento='))?.split('=')[1];

    let consulta = supabase.from('pessoas')
        .select('id, nome_completo, evento_id, status_acesso')
        .eq('status_acesso', 'autorizado');
    if (eventoArg) consulta = consulta.eq('evento_id', eventoArg);

    const { data: autorizados, error } = await buscarTodos(consulta);
    if (error) throw error;

    const afetados = [];
    await emParalelo(autorizados || [], 5, async (p) => {
        const motivo = await documentoService.motivoSemAutorizacao(p.id);
        if (motivo) afetados.push({ ...p, motivo });
    });

    console.log(`Autorizados analisados: ${autorizados?.length || 0}`);
    console.log(`Autorizados com documentação pendente: ${afetados.length}`);
    for (const p of afetados) console.log(`  - ${p.nome_completo} (evento ${p.evento_id}, pessoa ${p.id})`);

    if (!aplicar) {
        console.log('\nDry-run: nada foi gravado. Rode com --aplicar para corrigir.');
        return;
    }

    await emParalelo(afetados, 5, (p) => documentoService.sincronizarStatusPessoa(null, p.id));
    console.log(`\nCorrigidos: ${afetados.length} pessoa(s) voltaram para pendente.`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Falha na reconciliação:', err.message || err);
        process.exit(1);
    });
