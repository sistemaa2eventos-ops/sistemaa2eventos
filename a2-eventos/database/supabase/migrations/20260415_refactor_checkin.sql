-- ============================================
-- MIGRATION: Refatorar Sistema de Check-in
-- Data: 2026-04-15
-- Objetivo: Novo sistema com terminal facial e pulseira
-- ============================================

-- ============================================
-- PASSO 1: Criar tabela terminais_faciais
-- ============================================
CREATE TABLE IF NOT EXISTS public.terminais_faciais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    area_id UUID,
    area_nome VARCHAR(100),
    modo VARCHAR(20) NOT NULL DEFAULT 'ambos' 
        CHECK (modo IN ('checkin', 'checkout', 'ambos')),
    ativo BOOLEAN DEFAULT true,
    biometric_confidence_min INTEGER,
    criado_por UUID REFERENCES auth.users(id),
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminais_evento ON terminais_faciais(evento_id);

-- ============================================
-- PASSO 2: Ajustar ENUM metodo em logs_acesso
-- ============================================
-- Remover constraint antiga
ALTER TABLE public.logs_acesso DROP CONSTRAINT IF EXISTS logs_acesso_metodo_check;

-- Atualizar dados existentes
UPDATE logs_acesso SET metodo = 'pulseira' WHERE metodo IN ('qrcode', 'barcode', 'rfid', 'manual', 'fast-track');
UPDATE logs_acesso SET metodo = 'facial' WHERE metodo = 'face';

-- Criar nova constraint (apenas 2 valores)
ALTER TABLE public.logs_acesso 
ADD CONSTRAINT logs_acesso_metodo_check 
CHECK (metodo IN ('facial', 'pulseira'));

-- ============================================
-- PASSO 3: Adicionar campos em logs_acesso
-- ============================================
ALTER TABLE public.logs_acesso 
ADD COLUMN IF NOT EXISTS status_log VARCHAR(30) DEFAULT 'autorizado'
CHECK (status_log IN ('autorizado', 'rejeitado', 'confianca_baixa'));

ALTER TABLE public.logs_acesso 
ADD COLUMN IF NOT EXISTS terminal_id UUID REFERENCES terminais_faciais(id);

ALTER TABLE public.logs_acesso 
ADD COLUMN IF NOT EXISTS numero_pulseira VARCHAR(50);

-- ============================================
-- PASSO 4: Criar configurações de pulseira por evento
-- ============================================
CREATE TABLE IF NOT EXISTS public.config_pulseiras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    tipo_pulseira VARCHAR(20) DEFAULT 'numerada' 
        CHECK (tipo_pulseira IN ('numerada', 'qrcode', 'barcode', 'combinada')),
    prefixo_codigo VARCHAR(20),
    sequencia_inicial INTEGER,
    sequencia_final INTEGER,
    alerta_duplicidade BOOLEAN DEFAULT true,
    tempo_confirmacao_checkout INTEGER DEFAULT 3,
    ativo BOOLEAN DEFAULT true,
    criado_por UUID REFERENCES auth.users(id),
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_config_pulseiras_evento ON config_pulseiras(evento_id);

-- ============================================
-- PASSO 5: Adicionar campos em pessoas (garantir numero_pulseira)
-- ============================================
ALTER TABLE public.pessoas 
ADD COLUMN IF NOT EXISTS numero_pulseira VARCHAR(50);

-- ============================================
-- PASSO 6: Ajustar system_settings para pulseira
-- ============================================
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS pulseira_tempo_confirmacao INTEGER DEFAULT 3;

ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS pulseira_cooldown_min INTEGER DEFAULT 0;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
SELECT 'Tabela terminais_faciais' as db, COUNT(*) as total FROM terminais_faciais
UNION ALL
SELECT 'Logs método atualizado' as db, COUNT(*) as total FROM logs_acesso WHERE metodo IN ('facial', 'pulseira')
UNION ALL
SELECT 'Config pulseiras' as db, COUNT(*) as total FROM config_pulseiras;

-- Verificar colunas de logs_acesso
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'logs_acesso' AND table_schema = 'public'
ORDER BY ordinal_position;