import { createClient } from '@supabase/supabase-js';

// Usando as credenciais do backend já configuradas para o projeto A2 Eventos
const supabaseUrl = 'https://zznrgwytywgjsjqdjfxn.supabase.co';
const supabaseAnonKey = 'sb_publishable_ED0e1NZZMVETJUx86Kw1Ow_bNmCcEGl';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
