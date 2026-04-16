import axios from 'axios';
import * as SQLite from 'expo-sqlite';
import NetInfo from '@react-native-community/netinfo';
import { v4 as uuidv4 } from 'uuid';
import { BACKEND_URL } from '@/config/api';

let dbPromise;

const getDb = async () => {
    if (!dbPromise) {
        dbPromise = SQLite.openDatabaseAsync('a2eventos_offline.db');
        const db = await dbPromise;
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS offline_logs (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }

    return dbPromise;
};

export const initOfflineDB = async () => {
    await getDb();
    console.log('✅ SQLite Offline DB Iniciado');
};

const api = axios.create({
    baseURL: BACKEND_URL,
});

// ============================================
//   INTERCEPTADOR OFFLINE-FIRST (FASE 5)
// ============================================
api.interceptors.response.use(
    (response) => response, // Se der certo, segue o baile
    async (error) => {    // Se der erro (ex: Rede caiu).
        const netInfo = await NetInfo.fetch();
        const config = error.config;

        // Se a requisição era salvar um Check-in e não tem internet (ou Timeout do Edge Router)
        if ((!netInfo.isConnected || error.code === 'ECONNABORTED') && config?.method === 'post' && config?.url?.includes('/access/')) {
            console.warn(`[Offline] 📶 Rede offline. Salvando no SQLite Local para Sync posterior...`);

            const payload = JSON.parse(config.data);
            const syncId = uuidv4();
            payload.sync_id = syncId;
            payload.offline_timestamp = new Date().toISOString(); 
            // Injeção vital para prevenir Duplicidade/Corrida ao sincronizar 

            const db = await getDb();
            await db.runAsync(
                `INSERT INTO offline_logs (id, payload, endpoint) VALUES (?, ?, ?)`,
                [syncId, JSON.stringify(payload), config.url]
            );

            return {
                data: { success: true, message: 'Check-in (Modo Offline) Salvo Localmente', offline: true }
            };
        }

        // Se for outro erro, propaga normalmente
        return Promise.reject(error);
    }
);

// Worker (Background Fetch da Expo) chamará esse método
export const syncOfflineLogs = async () => {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return; // Só tenta se voltou a luz

    const db = await getDb();
    const offlineLogs = await db.getAllAsync(`SELECT * FROM offline_logs`);

    if (!offlineLogs || offlineLogs.length === 0) return;

    console.log(`[Sync Worker] 🔄 Encontrados ${offlineLogs.length} logs acumulados durante pane de rede. Descarregando pro Core...`);

    for (const log of offlineLogs) {
        try {
            const payload = JSON.parse(log.payload);

            // Faz o envio Real pro Node Edge
            await axios.post(`${BACKEND_URL}${log.endpoint}`, payload);

            // Envio efetuado com sucesso > Deleta da fila do celular
            await db.runAsync('DELETE FROM offline_logs WHERE id = ?', [log.id]);
            console.log(`✅ [Sync Worker] Subiu Checkin ID ${log.id}`);
        } catch (syncErr) {
            console.error(`❌ [Sync Worker] Falha ao despachar pacote offline ${log.id}:`, syncErr.message);
        }
    }
};

export default api;
