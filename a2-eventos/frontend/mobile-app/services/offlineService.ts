import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export const offlineService = {
    async initDB() {
        if (!db) {
            db = await SQLite.openDatabaseAsync('a2eventos_offline.db');
            await db.execAsync(`
                PRAGMA journal_mode = WAL;
                
                CREATE TABLE IF NOT EXISTS pessoas (
                    id TEXT PRIMARY KEY,
                    nome TEXT NOT NULL,
                    cpf TEXT,
                    qr_code TEXT,
                    barcode TEXT,
                    rfid_tag TEXT,
                    status_acesso TEXT DEFAULT 'checkout',
                    evento_id TEXT NOT NULL,
                    aceite_lgpd INTEGER DEFAULT 0,
                    updated_at TEXT
                );
                
                CREATE TABLE IF NOT EXISTS sync_queue (
                    sync_id TEXT PRIMARY KEY,
                    pessoa_id TEXT NOT NULL,
                    evento_id TEXT NOT NULL,
                    tipo TEXT NOT NULL, -- 'checkin' ou 'checkout'
                    metodo TEXT NOT NULL, -- 'qrcode', 'barcode', 'manual', 'rfid'
                    dispositivo_id TEXT,
                    offline_timestamp TEXT NOT NULL,
                    status TEXT DEFAULT 'pending' -- 'pending', 'syncing', 'failed'
                );
                
                CREATE TABLE IF NOT EXISTS sync_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('✅ Banco local offline inicializado com sucesso.');
        }
        return db;
    },

    async getDB() {
        if (!db) {
            return await this.initDB();
        }
        return db;
    },

    // Cache de pessoas para modo offline
    async savePessoas(pessoas: any[], isDelta: boolean = false) {
        const database = await this.getDB();

        await database.withTransactionAsync(async () => {
            // Se não for delta, limpa o cache antigo (Full Sync)
            if (!isDelta) {
                await database.runAsync(`DELETE FROM pessoas;`);
            }

            for (const p of pessoas) {
                // Usamos INSERT OR REPLACE para garantir que updates substituam registros antigos
                await database.runAsync(
                    `INSERT OR REPLACE INTO pessoas (id, nome, cpf, qr_code, barcode, rfid_tag, status_acesso, evento_id, aceite_lgpd, updated_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [p.id, p.nome, p.cpf, p.qr_code, p.barcode, p.rfid_tag, p.status_acesso, p.evento_id, p.aceite_lgpd ? 1 : 0, p.updated_at || p.pivot_updated_at]
                );
            }
        });
        console.log(`✅ ${pessoas.length} pessoas ${isDelta ? 'atualizadas/incluídas' : 'armazenadas'} no cache offline.`);
    },

    async getLastSyncTime(eventoId: string) {
        const database = await this.getDB();
        const res: any = await database.getFirstAsync(`SELECT value FROM sync_metadata WHERE key = ?`, [`last_sync_${eventoId}`]);
        return res?.value || null;
    },

    async setLastSyncTime(eventoId: string, timestamp: string) {
        const database = await this.getDB();
        await database.runAsync(
            `INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [`last_sync_${eventoId}`, timestamp]
        );
    },

    async findPessoaByQRCode(qrCode: string, eventoId: string) {
        const database = await this.getDB();
        return await database.getFirstAsync(
            `SELECT * FROM pessoas WHERE qr_code = ? AND evento_id = ?`,
            [qrCode, eventoId]
        );
    },

    async getPessoaById(id: string) {
        const database = await this.getDB();
        return await database.getFirstAsync(`SELECT * FROM pessoas WHERE id = ?`, [id]);
    },

    async updatePessoaStatus(id: string, novoStatus: string) {
        const database = await this.getDB();
        await database.runAsync(`UPDATE pessoas SET status_acesso = ? WHERE id = ?`, [novoStatus, id]);
    },

    // Fila de Sincronização
    async enqueueAction(action: {
        sync_id: string;
        pessoa_id: string;
        evento_id: string;
        tipo: string;
        metodo: string;
        dispositivo_id?: string;
        offline_timestamp: string;
    }) {
        const database = await this.getDB();
        await database.runAsync(
            `INSERT INTO sync_queue (sync_id, pessoa_id, evento_id, tipo, metodo, dispositivo_id, offline_timestamp, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [action.sync_id, action.pessoa_id, action.evento_id, action.tipo, action.metodo, action.dispositivo_id || null, action.offline_timestamp]
        );

        // Atualiza status local para refletir imediatamente na UI
        const novoStatus = action.tipo === 'checkin' ? 'checkin' : 'checkout';
        await this.updatePessoaStatus(action.pessoa_id, novoStatus);

        console.log(`✅ Ação ${action.tipo} enfileirada no modo offline.`);
    },

    async getPendingActions() {
        const database = await this.getDB();
        return await database.getAllAsync(`SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY offline_timestamp ASC`);
    },

    async markActionAsSyncing(syncId: string) {
        const database = await this.getDB();
        await database.runAsync(`UPDATE sync_queue SET status = 'syncing' WHERE sync_id = ?`, [syncId]);
    },

    async removeActionFromQueue(syncId: string) {
        const database = await this.getDB();
        await database.runAsync(`DELETE FROM sync_queue WHERE sync_id = ?`, [syncId]);
    },

    async resetSyncingActions() {
        const database = await this.getDB();
        await database.runAsync(`UPDATE sync_queue SET status = 'pending' WHERE status = 'syncing'`);
    }
};
