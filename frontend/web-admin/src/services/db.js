import Dexie from 'dexie';

export const db = new Dexie('A2EventosDB');

// Define the database schema
db.version(1).stores({
    filaSincronizacao: '++id, payload, tipo_operacao, data_criacao, status'
});

db.version(2).stores({
    filaSincronizacao: '++id, payload, tipo_operacao, data_criacao, status',
    producaoCache: 'evento_id, atualizado_em',
    producaoFilaOffline: '++id, sync_id, evento_id, acao, payload, criado_em, status'
});
