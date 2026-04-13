-- ========================================================================================
-- SCRIPT DE CORREÇÕES DA AUDITORIA (CONCORRÊNCIA E PERFORMANCE)
-- ========================================================================================

-- ---------------------------------------------------------
-- 1. PREVENÇÃO DE CONDIÇÃO DE CORRIDA (RACE CONDITION) NO CHECKIN
-- ---------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-------------------------------------------------------------------------
-- ATENÇÃO: Dependendo da versão do seu Postgres (e se logs_acesso já tiver dados sujos),
-- a criação da constraint GIST pode falhar se já houver duplicidade na janela do tempo.
-- Se falhar, limpe os logs duplicados antigos ou use a solução no Node.js (SyncService).
-------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'prevent_duplication_race_condition'
    ) THEN
        ALTER TABLE logs_acesso
        ADD CONSTRAINT prevent_duplication_race_condition
        EXCLUDE USING GIST (
            funcionario_id WITH =,
            tipo WITH =,
            EXTRACT(EPOCH FROM created_at) WITH =
        ) WHERE (tipo IN ('checkin', 'checkout'));
    END IF;
END $$;

-- ---------------------------------------------------------
-- 2. INTEGRIDADE REFERENCIAL (PULSEIRAS E ÁREAS)
-- O bloco dinâmico atrela a Trava (Trigger) APENAS se a tabela já existir na nuvem
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION check_pulseira_area_evento_match()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT evento_id FROM evento_tipos_pulseira WHERE id = NEW.pulseira_id) != 
       (SELECT evento_id FROM evento_areas WHERE id = NEW.area_id) THEN
        RAISE EXCEPTION 'A Pulseira e a Área devem pertencer ao mesmo Evento.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
    -- Checa se a tabela pivô já existe antes de atrelar a trigger de bloqueio
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pulseira_areas_permitidas') THEN
        DROP TRIGGER IF EXISTS enforce_same_event_pulseiras ON pulseira_areas_permitidas;
        
        -- Gambiarra não-suportada pelo comando TRIGGER puro, então executamos como bloco dinâmico
        EXECUTE 'CREATE TRIGGER enforce_same_event_pulseiras 
                 BEFORE INSERT OR UPDATE ON pulseira_areas_permitidas 
                 FOR EACH ROW EXECUTE FUNCTION check_pulseira_area_evento_match()';
    END IF;
END $$;

-- ---------------------------------------------------------
-- 3. MELHORIA DE PERFORMANCE E BUSCA (ÍNDICES) E RECUPERAÇÃO DE COLUNA
-- ---------------------------------------------------------

-- Durante a sua migração de 'funcionarios' para 'pessoas', a coluna vital de biometria facial
-- (face_encoding) foi perdida. Vamos recriar a coluna na nova tabela e em seguida indexá-la!
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS face_encoding JSONB;

-- Índice GIN para buscar mais rápido no mapeamento biométrico facial
CREATE INDEX IF NOT EXISTS idx_pessoas_face_encoding 
    ON public.pessoas USING GIN (face_encoding jsonb_path_ops);

-- Cria a extensão para análise de texto (Buscas difusas do SearchBar Frontend)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Cria um index trigram para pesquisa fonética ultra-rápida do SearchBar na nova entidade 'pessoas'
CREATE INDEX IF NOT EXISTS idx_pessoas_nome_trgm 
    ON public.pessoas USING GIN (nome gin_trgm_ops);
