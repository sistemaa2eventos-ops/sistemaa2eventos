import Dexie from 'dexie';

export const db = new Dexie('A2EventosDB');

// Define the database schema
db.version(1).stores({
    filaSincronizacao: '++id, payload, tipo_operacao, data_criacao, status'
});
