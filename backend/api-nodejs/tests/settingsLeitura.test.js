/**
 * Configurações: valor salvo em config (JSONB) não pode ser coberto pela coluna homônima vazia
 * (o Chat ID do Telegram sumia da tela e o "Salvar" seguinte o apagava).
 */
jest.mock('../src/services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/config/supabase', () => {
    const linha = { id: 1, telegram_chat_id: null, email_from: null, smtp_host: 'smtp.gmail.com', config: { telegram_chat_id: '1758444960', email_from: 'a@b.com', smtp_host: 'antigo' } };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: linha, error: null }) };
    return { supabase: { from: () => q } };
});

const controller = require('../src/modules/system/settings.controller');

it('coluna vazia não cobre o valor salvo em config; coluna preenchida prevalece', async () => {
    const res = { json(d) { this.d = d; }, status() { return this; } };
    await controller.getSettings({}, res);
    expect(res.d.data.telegram_chat_id).toBe('1758444960');
    expect(res.d.data.email_from).toBe('a@b.com');
    expect(res.d.data.smtp_host).toBe('smtp.gmail.com');
});
