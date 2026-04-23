const syncService = require('../syncService');
const { getConnection } = require('../../config/database');
const { supabase } = require('../../config/supabase');

// Mock das dependências
jest.mock('../../config/database');
jest.mock('../../config/supabase');

describe('SyncService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('deve sincronizar logs pendentes', async () => {
        // Mock do SQL Server
        const mockConnection = {
            request: jest.fn().mockReturnThis(),
            input: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({
                recordsets: [[
                    { id: '1', evento_id: 'evt1', pessoa_id: 'func1' }
                ], [{ total_pendente: 1 }]]
            })
        };
        getConnection.mockResolvedValue(mockConnection);

        // Mock do Supabase
        supabase.from.mockReturnValue({
            upsert: jest.fn().mockResolvedValue({ error: null })
        });

        const result = await syncService.syncAccessLogs();

        expect(result.synced).toBe(1);
        expect(result.pending).toBe(0);
    });

    test('deve lidar com erro na sincronização', async () => {
        // Mock com erro
        const mockConnection = {
            request: jest.fn().mockReturnThis(),
            execute: jest.fn().mockRejectedValue(new Error('Erro de conexão'))
        };
        getConnection.mockResolvedValue(mockConnection);

        await expect(syncService.syncAccessLogs()).rejects.toThrow('Erro de conexão');
    });
});
