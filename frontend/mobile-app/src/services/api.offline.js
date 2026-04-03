import axios from 'axios';
import * as SQLite from 'expo-sqlite';
import NetInfo from '@react-native-community/netinfo';
import { v4 as uuidv4 } from 'uuid';

// Instância base do banco local do Android/iOS
const db = SQLite.openDatabase('a2eventos_offline.db');

export const initOfflineDB = () => {
    return new Promise((resolve, reject) => {
        db.transaction(tx => {
            tx.executeSql(
                `CREATE TABLE IF NOT EXISTS offline_logs (
                    id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    endpoint TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );`,
                [],
                // Callback sucesso
                () => { resolve(); console.log('✅ SQLite Offline DB Iniciado') }, 
                // Callback erro
                (_, error) => { reject(error); console.error('Erro no SQLite', error) }
            );
        });
    });
};

const api = axios.create({
    baseURL: 'http://SEU_IP_NA_BORDA/api',
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
        if ((!netInfo.isConnected || error.code === 'ECONNABORTED') && config.method === 'post' && config.url.includes('/access/')) {
            console.warn(`[Offline] 📶 Rede offline. Salvando no SQLite Local para Sync posterior...`);
            
            const payload = JSON.parse(config.data);
            const syncId = uuidv4();
            payload.sync_id = syncId;
            payload.offline_timestamp = new Date().toISOString(); 
            // Injeção vital para prevenir Duplicidade/Corrida ao sincronizar 

            return new Promise((resolve, reject) => {
                db.transaction(tx => {
                    tx.executeSql(
                        `INSERT INTO offline_logs (id, payload, endpoint) VALUES (?, ?, ?)`,
                        [syncId, JSON.stringify(payload), config.url],
                        () => {
                            // Resolvemos a PROMISE para o UI do App acreditar que DEU CERTO (Experiência Fluída)
                            resolve({
                                data: { success: true, message: 'Check-in (Modo Offline) Salvo Localmente', offline: true }
                            });
                        },
                        (_, txError) => { reject(txError); }
                    );
                });
            });
        }
        
        // Se for outro erro, propaga normalmente
        return Promise.reject(error);
    }
);

// Worker (Background Fetch da Expo) chamará esse método
export const syncOfflineLogs = async () => {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return; // Só tenta se voltou a luz

    db.transaction(tx => {
        tx.executeSql(
            `SELECT * FROM offline_logs`, 
            [], 
            async (_, { rows: { _array } }) => {
                if (_array.length === 0) return;
                
                console.log(`[Sync Worker] 🔄 Encontrados ${_array.length} logs acumulados durante pane de rede. Descarregando pro Core...`);
                
                for (const log of _array) {
                    try {
                        const payload = JSON.parse(log.payload);
                        
                        // Faz o envio Real pro Node Edge
                        await axios.post(`http://SEU_IP_NA_BORDA${log.endpoint}`, payload);
                        
                        // Envio efetuado com sucesso > Deleta da fila do celular
                        db.transaction(deleteTx => {
                            deleteTx.executeSql('DELETE FROM offline_logs WHERE id = ?', [log.id]);
                        });
                        console.log(`✅ [Sync Worker] Subiu Checkin ID ${log.id}`);
                        
                    } catch (syncErr) {
                        console.error(`❌ [Sync Worker] Falha ao despachar pacote offline ${log.id}:`, syncErr.message);
                    }
                }
            }
        );
    });
};

export default api;
