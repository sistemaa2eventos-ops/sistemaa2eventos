import Dexie from 'dexie';

export const db = new Dexie('NZTProducaoAppDB');

db.version(1).stores({
    producaoCache: 'evento_id, atualizado_em',
    producaoFilaOffline: '++id, sync_id, evento_id, acao, payload, criado_em, status'
});
